/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fs from 'fs/promises';

import apm from 'elastic-apm-node';
import { withActiveSpan } from '@kbn/tracing-utils';

import { compact } from 'lodash';

import pRetry from 'p-retry';

import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { LockAcquisitionError } from '@kbn/lock-manager';

import { MessageSigningError } from '../../common/errors';

import { AUTO_UPDATE_PACKAGES } from '../../common/constants';
import type { PreconfigurationError } from '../../common/constants';
import type { DefaultPackagesInstallationError } from '../../common/types';
import { scheduleSetupTask } from '../tasks/setup/schedule';

import { appContextService } from './app_context';
import { ensurePreconfiguredPackagesAndPolicies } from './preconfiguration';
import {
  ensurePreconfiguredOutputs,
  getPreconfiguredOutputFromConfig,
} from './preconfiguration/outputs';
import {
  ensurePreconfiguredFleetProxies,
  getPreconfiguredFleetProxiesFromConfig,
} from './preconfiguration/fleet_proxies';
import { outputService } from './output';
import { downloadSourceService } from './download_source';

import { getRegistryUrl, settingsService } from '.';
import { awaitIfPending } from './setup_utils';

import { isPackageInstalled } from './epm/packages/install';
import type { UpgradeManagedPackagePoliciesResult } from './setup/managed_package_policies';
import { setupUpgradeManagedPackagePolicies } from './setup/managed_package_policies';
import { upgradePackageInstallVersion } from './setup/upgrade_package_install_version';
import { upgradeAgentPolicySchemaVersion } from './setup/upgrade_agent_policy_schema_version';
import { migrateSettingsToFleetServerHost } from './fleet_server_host';
import {
  ensurePreconfiguredFleetServerHosts,
  getPreconfiguredFleetServerHostFromConfig,
} from './preconfiguration/fleet_server_host';
import { cleanUpOldFileIndices } from './setup/clean_old_fleet_indices';
import type { UninstallTokenInvalidError } from './security/uninstall_token_service';
import { ensureAgentPoliciesFleetServerKeysAndPolicies } from './setup/fleet_server_policies_enrollment_keys';
import { scheduleBumpMigratedAgentPoliciesTask } from './agent_policies/bump_migrated_agent_policies_task';
import { ensureSpaceSettings } from './preconfiguration/space_settings';
import {
  ensureDeleteUnenrolledAgentsSetting,
  getPreconfiguredDeleteUnenrolledAgentsSettingFromConfig,
} from './preconfiguration/delete_unenrolled_agent_setting';
import { backfillPackagePolicySupportsAgentless } from './backfill_agentless';
import { updateDeprecatedComponentTemplates } from './setup/update_deprecated_component_templates';
import { createCCSIndexPatterns } from './setup/fleet_synced_integrations';
import { ensureCorrectAgentlessSettingsIds } from './agentless_settings_ids';
import { getSpaceAwareSaveobjectsClients } from './epm/kibana/assets/saved_objects';
import { ensureFleetGlobalEsAssets } from './setup/ensure_fleet_global_es_assets';

/** Maximum number of non-fatal errors retained in memory after setup. */
const MAX_NON_FATAL_ERRORS = 100;

export interface SetupStatus {
  isInitialized: boolean;
  nonFatalErrors: Array<
    | PreconfigurationError
    | DefaultPackagesInstallationError
    | UpgradeManagedPackagePoliciesResult
    | UninstallTokenInvalidError
    | { error: MessageSigningError }
  >;
}

export async function _runSetupWithLock(setupFn: () => Promise<SetupStatus>) {
  return await pRetry(
    () => appContextService.getLockManagerService()!.withLock('fleet-setup', () => setupFn()),
    {
      onFailedAttempt: async (error) => {
        if (!(error instanceof LockAcquisitionError)) {
          throw error;
        }
      },
      maxRetryTime: 5 * 60 * 1000, // Retry for 5 minute to get the lock
    }
  );
}

export async function setupFleet(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  options: {
    useLock: boolean;
  } = { useLock: false }
): Promise<SetupStatus> {
  return withActiveSpan(
    'fleet-setup',
    {
      attributes: { 'transaction.type': 'fleet' },
      // Make sure that this is a parent transaction (not a child of any other ongoing transaction)
      root: true,
    },
    async () => {
      const t = apm.startTransaction('fleet-setup', 'fleet');
      try {
        if (options.useLock) {
          return _runSetupWithLock(() =>
            awaitIfPending(async () => createSetupSideEffects(soClient, esClient))
          );
        } else {
          return await awaitIfPending(async () => createSetupSideEffects(soClient, esClient));
        }
      } catch (error) {
        apm.captureError(error);
        t.setOutcome('failure');
        throw error;
      } finally {
        t.end();
      }
    }
  );
}

async function createSetupSideEffects(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient
): Promise<SetupStatus> {
  const logger = appContextService.getLogger();
  logger.info('Beginning fleet setup');

  await cleanUpOldFileIndices(esClient, logger);

  await ensureFleetDirectories();

  const { agentPolicies: policiesOrUndefined, packages: packagesOrUndefined } =
    appContextService.getConfig() ?? {};
  const policies = policiesOrUndefined ?? [];
  let packages = packagesOrUndefined ?? [];

  logger.debug('Setting Fleet server config');
  await migrateSettingsToFleetServerHost(soClient, esClient);
  logger.debug('Setting up Fleet download source');
  const defaultDownloadSource = await downloadSourceService.ensureDefault(soClient, esClient);
  // Need to be done before outputs and fleet server hosts as these object can reference a proxy
  logger.debug('Setting up Proxy');
  await ensurePreconfiguredFleetProxies(
    soClient,
    esClient,
    getPreconfiguredFleetProxiesFromConfig(appContextService.getConfig())
  );

  logger.debug('Setting up Fleet Sever Hosts');
  await ensurePreconfiguredFleetServerHosts(
    soClient,
    esClient,
    getPreconfiguredFleetServerHostFromConfig(appContextService.getConfig())
  );

  logger.debug('Setting up Space settings');
  await ensureSpaceSettings(appContextService.getConfig()?.spaceSettings ?? []);

  logger.debug('Setting up delete unenrolled agents setting');
  await ensureDeleteUnenrolledAgentsSetting(
    soClient,
    getPreconfiguredDeleteUnenrolledAgentsSettingFromConfig(appContextService.getConfig())
  );

  logger.debug('Setting up Fleet outputs');
  await settingsService.settingsSetup(soClient);
  await ensurePreconfiguredOutputs(
    soClient,
    esClient,
    getPreconfiguredOutputFromConfig(appContextService.getConfig())
  );

  const defaultOutput = await outputService.ensureDefaultOutput(soClient, esClient);

  logger.debug('Backfilling output performance presets');
  await outputService.backfillAllOutputPresets(soClient, esClient);

  logger.debug('Setting up Fleet Elasticsearch assets');
  let stepSpan = apm.startSpan('Install Fleet global assets', 'preconfiguration');
  await ensureFleetGlobalEsAssets(
    { soClient, esClient, logger },
    {
      reinstallPackages: true,
    }
  );
  stepSpan?.end();

  // Ensure that required packages are always installed even if they're left out of the config
  const preconfiguredPackageNames = new Set(packages.map((pkg) => pkg.name));

  const autoUpdateablePackages = compact(
    await Promise.all(
      AUTO_UPDATE_PACKAGES.map((pkg) =>
        isPackageInstalled({
          savedObjectsClient: soClient,
          pkgName: pkg.name,
        }).then((installed) => (installed ? pkg : undefined))
      )
    )
  );

  packages = [
    ...packages,
    ...autoUpdateablePackages.filter((pkg) => !preconfiguredPackageNames.has(pkg.name)),
  ];

  logger.debug('Setting up initial Fleet packages');

  stepSpan = apm.startSpan('Install preconfigured packages and policies', 'preconfiguration');
  const { nonFatalErrors: preconfiguredPackagesNonFatalErrors } =
    await ensurePreconfiguredPackagesAndPolicies(
      soClient,
      esClient,
      policies,
      packages,
      defaultOutput,
      defaultDownloadSource,
      DEFAULT_SPACE_ID
    );
  stepSpan?.end();

  stepSpan = apm.startSpan('Upgrade managed package policies', 'preconfiguration');
  await setupUpgradeManagedPackagePolicies(soClient);
  stepSpan?.end();

  logger.debug('Upgrade Fleet package install versions');
  stepSpan = apm.startSpan('Upgrade package install format version', 'preconfiguration');

  const config = appContextService.getConfig();
  const shouldDeferPackageBumpInstallVersion =
    config?.startupOptimization?.deferPackageBumpInstallVersion ?? false;

  if (shouldDeferPackageBumpInstallVersion) {
    logger.info('Deferring package install version upgrade to background task');
    await scheduleSetupTask(appContextService.getTaskManagerStart()!, {
      type: 'upgradePackageInstallVersion',
    });
  } else {
    await upgradePackageInstallVersion({ soClient, esClient, logger });
  }
  stepSpan?.end();

  logger.debug('Generating key pair for message signing');
  stepSpan = apm.startSpan('Configure message signing', 'preconfiguration');
  if (!appContextService.getMessageSigningService()?.isEncryptionAvailable) {
    logger.warn(
      'xpack.encryptedSavedObjects.encryptionKey is not configured, private key passphrase is being stored in plain text'
    );
  }
  let messageSigningServiceNonFatalError: { error: MessageSigningError } | undefined;
  try {
    await appContextService.getMessageSigningService()?.generateKeyPair();
  } catch (error) {
    if (error instanceof MessageSigningError) {
      messageSigningServiceNonFatalError = { error };
    } else {
      throw error;
    }
  }
  stepSpan?.end();

  stepSpan = apm.startSpan('Upgrade agent policy schema', 'preconfiguration');

  logger.debug('Upgrade Agent policy schema version');
  await upgradeAgentPolicySchemaVersion(soClient);
  stepSpan?.end();

  // Bump the revision of agent policies whose package policies were flagged for a bump by a
  // saved object migration (no span: this only schedules a background task).
  logger.debug('Scheduling agent policy revision bump for migrated package policies');
  await scheduleBumpMigratedAgentPoliciesTask(appContextService.getTaskManagerStart()!);

  stepSpan = apm.startSpan('Set up enrollment keys for preconfigured policies', 'preconfiguration');
  logger.debug(
    'Setting up Fleet enrollment keys and verifying fleet server policies are not out-of-sync'
  );
  await ensureAgentPoliciesFleetServerKeysAndPolicies({ soClient, esClient, logger });
  stepSpan?.end();

  let backfillPackagePolicySupportsAgentlessError;
  try {
    logger.debug('Backfilling package policy supports_agentless field');
    await backfillPackagePolicySupportsAgentless(esClient);
  } catch (error) {
    backfillPackagePolicySupportsAgentlessError = { error };
  }

  let ensureCorrectAgentlessSettingsIdsError;
  try {
    logger.debug('Fix agentless policy settings');
    await ensureCorrectAgentlessSettingsIds(esClient);
  } catch (error) {
    ensureCorrectAgentlessSettingsIdsError = { error };
  }

  logger.debug('Update deprecated _source.mode in component templates');
  await updateDeprecatedComponentTemplates(esClient);

  logger.debug('Create CCS index patterns for remote clusters');
  const { savedObjectsImporter } = getSpaceAwareSaveobjectsClients();
  await createCCSIndexPatterns(esClient, soClient, savedObjectsImporter);

  const rawNonFatalErrors = [
    ...preconfiguredPackagesNonFatalErrors,
    ...(messageSigningServiceNonFatalError ? [messageSigningServiceNonFatalError] : []),
    ...(backfillPackagePolicySupportsAgentlessError
      ? [backfillPackagePolicySupportsAgentlessError]
      : []),
    ...(ensureCorrectAgentlessSettingsIdsError ? [ensureCorrectAgentlessSettingsIdsError] : []),
  ];

  logger.info('Scheduling async setup tasks');
  await scheduleSetupTask(appContextService.getTaskManagerStart()!);

  if (rawNonFatalErrors.length > 0) {
    logger.info('Encountered non fatal errors during Fleet setup');
    formatNonFatalErrors(rawNonFatalErrors)
      .map((e) => JSON.stringify(e))
      .forEach((error) => {
        logger.info(error);
        apm.captureError(error);
      });
  }

  // Strip heavy ES connection metadata and cap stored errors to prevent large ResponseError
  // objects from being retained in the module-level promise.
  // See https://github.com/elastic/kibana/issues/273921
  if (rawNonFatalErrors.length > MAX_NON_FATAL_ERRORS) {
    logger.warn(
      `Fleet setup encountered ${rawNonFatalErrors.length} non-fatal errors; storing only the first ${MAX_NON_FATAL_ERRORS}`
    );
  }
  const nonFatalErrors = rawNonFatalErrors
    .slice(0, MAX_NON_FATAL_ERRORS)
    .map(sanitizeNonFatalError);

  logger.info('Fleet setup completed');

  return {
    isInitialized: true,
    nonFatalErrors,
  };
}

/**
 * Strips heavy ES client metadata (meta.connection, connection pool, TLS config, etc.)
 * from any `ResponseError` stored inside a non-fatal error entry.  Each such object can
 * retain ~10 MB of connection state, causing multi-GB heap growth when hundreds of errors
 * accumulate in the module-level `awaitIfPending` promise.
 *
 * The entry's structural shape (package, agentPolicy, installType, …) is preserved so
 * callers that inspect those fields continue to work.  Only the inner `.error` / `.errors`
 * values are replaced with lightweight plain-Error objects carrying just name + message.
 */
function sanitizeNonFatalError(
  e: SetupStatus['nonFatalErrors'][number]
): SetupStatus['nonFatalErrors'][number] {
  if ('error' in e) {
    const slim = new Error(e.error.message);
    slim.name = e.error.name;
    return { ...e, error: slim } as typeof e;
  }
  // UpgradeManagedPackagePoliciesResult uses `errors: any` — nothing large to strip there.
  return e;
}

/**
 * Maps the `nonFatalErrors` object returned by the setup process to a more readable
 * and predictable format suitable for logging output or UI presentation.
 */
export function formatNonFatalErrors(
  nonFatalErrors: SetupStatus['nonFatalErrors']
): Array<{ name: string; message: string }> {
  return nonFatalErrors.flatMap((e) => {
    if ('error' in e) {
      return {
        name: e.error.name,
        message: e.error.message,
      };
    } else if ('errors' in e) {
      return e.errors.map((upgradePackagePolicyError: any) => {
        if (typeof upgradePackagePolicyError === 'string') {
          return {
            name: 'SetupNonFatalError',
            message: upgradePackagePolicyError,
          };
        }

        return {
          name: upgradePackagePolicyError.key,
          message: upgradePackagePolicyError.message,
        };
      });
    }
  });
}

/**
 * Confirm existence of various directories used by Fleet and warn if they don't exist
 */
export async function ensureFleetDirectories() {
  const logger = appContextService.getLogger();
  const config = appContextService.getConfig();

  const bundledPackageLocation = config?.developer?.bundledPackageLocation;
  const registryUrl = getRegistryUrl();

  if (!bundledPackageLocation) {
    logger.warn('xpack.fleet.developer.bundledPackageLocation is not configured');
    return;
  }

  try {
    await fs.stat(bundledPackageLocation);
    logger.debug(`Bundled package directory ${bundledPackageLocation} exists`);
  } catch (error) {
    logger.warn(
      `Bundled package directory ${bundledPackageLocation} does not exist. All packages will be sourced from ${registryUrl}.`
    );
  }
}
