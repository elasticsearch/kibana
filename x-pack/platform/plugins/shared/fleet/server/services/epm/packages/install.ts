/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import apm from 'elastic-apm-node';
import { i18n } from '@kbn/i18n';
import semverLt from 'semver/functions/lt';
import type Boom from '@hapi/boom';
import moment from 'moment';
import { omit, uniqBy } from 'lodash';
import type {
  ElasticsearchClient,
  SavedObject,
  SavedObjectsClientContract,
  Logger,
  KibanaRequest,
} from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import pRetry from 'p-retry';
import type { LicenseType } from '@kbn/licensing-types';
import { addSpanLabels } from '@kbn/apm-utils';

import type {
  KibanaAssetReference,
  PackageDataStreamTypes,
  PackageDependencies,
  PackageInstallContext,
  RegistryDataStream,
} from '../../../../common/types';
import { isPackagePrerelease, getNormalizedDataStreams } from '../../../../common/services';
import { FLEET_INSTALL_FORMAT_VERSION } from '../../../constants/fleet_es_assets';
import { generateESIndexPatterns } from '../elasticsearch/template/template';
import type {
  ArchivePackage,
  BulkInstallPackageInfo,
  EpmPackageInstallStatus,
  InstallablePackage,
  Installation,
  InstallResult,
  InstallSource,
  InstallType,
  KibanaAssetType,
  PackageVerificationResult,
  InstallResultStatus,
  InstallLatestExecutedState,
} from '../../../types';
import {
  AUTO_UPGRADE_POLICIES_PACKAGES,
  CUSTOM_INTEGRATION_PACKAGE_SPEC_VERSION,
  GENERIC_DATASET_NAME,
} from '../../../../common/constants';
import {
  FleetError,
  PackageOutdatedError,
  ConcurrentInstallOperationError,
  FleetUnauthorizedError,
  FleetTooManyRequestsError,
  PackageInvalidDeploymentMode,
  PackageAssetsVerificationError,
} from '../../../errors';
import {
  PACKAGES_SAVED_OBJECT_TYPE,
  MAX_TIME_COMPLETE_INSTALL,
  MAX_REINSTALL_RETRIES,
} from '../../../constants';
import { licenseService } from '../..';
import { appContextService } from '../../app_context';
import { AUTO_INSTALL_CONTENT_PACKAGES_TASK_ID } from '../../../tasks/auto_install_content_packages_task';
import * as Registry from '../registry';
import {
  setPackageInfo,
  generatePackageInfoFromArchiveBuffer,
  deleteVerificationResult,
  unpackBufferToAssetsMap,
} from '../archive';
import { createArchiveIteratorFromMap } from '../archive/archive_iterator';
import { toAssetReference } from '../kibana/assets/install';
import type { ArchiveAsset } from '../kibana/assets/install';
import type { PackageUpdateEvent } from '../../upgrade_sender';
import { sendTelemetryEvents, UpdateEventType } from '../../upgrade_sender';
import { auditLoggingService } from '../../audit_logging';
import {
  getAllowedSearchAiLakeInstallPackagesIfEnabled,
  getFilteredInstallPackages,
} from '../filtered_packages';
import { isAgentlessEnabled, isOnlyAgentlessIntegration } from '../../utils/agentless';

import { _stateMachineInstallPackage } from './install_state_machine/_state_machine_package_install';

import { formatVerificationResultForSO } from './package_verification';
import { getInstallation, getInstallationObject } from './get';
import { getPackageSavedObjects } from './get';
import { removeOldAssets } from './cleanup';
import { getBundledPackageByPkgKey } from './bundled_packages';
import { convertStringToTitle, generateDescription } from './custom_integrations/utils';
import { INITIAL_VERSION } from './custom_integrations/constants';
import { createAssets } from './custom_integrations';
import { generateDatastreamEntries } from './custom_integrations/assets/dataset/utils';
import { checkForNamingCollision } from './custom_integrations/validation/check_naming_collision';
import { checkDatasetsNameFormat } from './custom_integrations/validation/check_dataset_name_format';
import { addErrorToLatestFailedAttempts } from './install_errors_helpers';
import { setLastUploadInstallCache, getLastUploadInstallCache } from './utils';
import { removeInstallation } from './remove';
import { shouldIncludePackageWithDatastreamTypes } from './exclude_datastreams_helper';
import { mergeIsDependencyOf } from './dependencies';

export const UPLOAD_RETRY_AFTER_MS = 10000; // 10s
const MAX_ENSURE_INSTALL_TIME = 60 * 1000;
const MAX_INSTALL_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000; // 1s

export const PACKAGES_TO_INSTALL_WITH_STREAMING = [
  // The security_detection_engine package contains a large number of assets and
  // is not suitable for regular installation as it might cause OOM errors.
  'security_detection_engine',
];

export async function isPackageInstalled(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
}): Promise<boolean> {
  const installedPackage = await getInstallation(options);
  return installedPackage !== undefined;
}

// Error used to retry in isPackageVersionOrLaterInstalled
class CurrentlyInstallingError extends Error {}

/**
 * Check if a package is currently installed,
 * if the package is currently installing it will retry until MAX_ENSURE_INSTALL_TIME is reached
 */
export async function isPackageVersionOrLaterInstalled(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  pkgVersion: string;
}): Promise<{ package: Installation } | false> {
  return pRetry(
    async () => {
      const { savedObjectsClient, pkgName, pkgVersion } = options;
      const installedPackageObject = await getInstallationObject({ savedObjectsClient, pkgName });
      const installedPackage = installedPackageObject?.attributes;
      if (
        installedPackage &&
        (installedPackage.version === pkgVersion || semverLt(pkgVersion, installedPackage.version))
      ) {
        if (installedPackage.install_status === 'installing') {
          throw new CurrentlyInstallingError(
            `Package ${pkgName}-${pkgVersion} is currently installing`
          );
        } else if (installedPackage.install_status === 'install_failed') {
          return false;
        }

        return { package: installedPackage };
      }
      return false;
    },
    {
      maxRetryTime: MAX_ENSURE_INSTALL_TIME,
      onFailedAttempt: (error) => {
        if (!(error instanceof CurrentlyInstallingError)) {
          throw error;
        }
      },
    }
  ).catch((err): false => {
    if (err instanceof CurrentlyInstallingError) {
      return false;
    }
    throw err;
  });
}

export interface EnsurePackageResult {
  status: InstallResultStatus;
  package: Installation;
}

export async function ensureInstalledPackage(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  esClient: ElasticsearchClient;
  pkgVersion?: string;
  spaceId?: string;
  force?: boolean;
  request?: KibanaRequest;
}): Promise<EnsurePackageResult> {
  const {
    savedObjectsClient,
    pkgName,
    esClient,
    pkgVersion,
    force = false,
    spaceId = DEFAULT_SPACE_ID,
    request,
  } = options;

  // If pkgVersion isn't specified, find the latest package version
  const pkgKeyProps = pkgVersion
    ? { name: pkgName, version: pkgVersion }
    : await Registry.fetchFindLatestPackageOrThrow(pkgName, { prerelease: true });

  const installedPackageResult = await isPackageVersionOrLaterInstalled({
    savedObjectsClient,
    pkgName: pkgKeyProps.name,
    pkgVersion: pkgKeyProps.version,
  });

  if (installedPackageResult) {
    return {
      status: 'already_installed',
      package: installedPackageResult.package,
    };
  }
  const pkgkey = Registry.pkgToPkgKey(pkgKeyProps);

  const installPackageWithRetries = async (attempt: number): Promise<InstallResult> => {
    const installResult = await installPackage({
      installSource: 'registry',
      savedObjectsClient,
      pkgkey,
      spaceId,
      esClient,
      neverIgnoreVerificationError: !force,
      force: true, // Always force outdated packages to be installed if a later version isn't installed
      request,
    });

    if (
      attempt < MAX_INSTALL_RETRIES &&
      installResult.error?.message.includes('version_conflict_engine_exception')
    ) {
      const delayMs = BASE_RETRY_DELAY_MS * 2 ** attempt; // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return await installPackageWithRetries(++attempt);
    } else {
      return installResult;
    }
  };

  const installResult = await installPackageWithRetries(0);

  if (installResult.error) {
    const errorPrefix =
      installResult.installType === 'update' || installResult.installType === 'reupdate'
        ? i18n.translate('xpack.fleet.epm.install.packageUpdateError', {
            defaultMessage: 'Error updating {pkgName} to {pkgVersion}',
            values: {
              pkgName: pkgKeyProps.name,
              pkgVersion: pkgKeyProps.version,
            },
          })
        : i18n.translate('xpack.fleet.epm.install.packageInstallError', {
            defaultMessage: 'Error installing {pkgName} {pkgVersion}',
            values: {
              pkgName: pkgKeyProps.name,
              pkgVersion: pkgKeyProps.version,
            },
          });
    installResult.error.message = `${errorPrefix}: ${installResult.error.message}`;
    throw installResult.error;
  }

  const installation = await getInstallation({ savedObjectsClient, pkgName });
  if (!installation) throw new FleetError(`Could not get installation for ${pkgName}`);
  return {
    status: 'installed',
    package: installation,
  };
}

export async function handleInstallPackageFailure({
  savedObjectsClient,
  error,
  pkgName,
  pkgVersion,
  installedPkg,
  esClient,
  spaceId,
  request,
  keepFailedInstallation,
}: {
  savedObjectsClient: SavedObjectsClientContract;
  error: FleetError | Boom.Boom | Error;
  pkgName: string;
  pkgVersion: string;
  installedPkg: SavedObject<Installation> | undefined;
  esClient: ElasticsearchClient;
  spaceId: string;
  request?: KibanaRequest;
  keepFailedInstallation?: boolean;
}) {
  if (error instanceof ConcurrentInstallOperationError) {
    return;
  }
  const logger = appContextService.getLogger();
  const pkgkey = Registry.pkgToPkgKey({
    name: pkgName,
    version: pkgVersion,
  });

  const latestInstallFailedAttempts = addErrorToLatestFailedAttempts({
    error,
    targetVersion: pkgVersion,
    createdAt: new Date().toISOString(),
    latestAttempts: installedPkg?.attributes.latest_install_failed_attempts,
    missingAssets: error instanceof PackageAssetsVerificationError ? error.meta : undefined,
  });
  // if there is an unknown server error, check the installType and do the following actions
  try {
    const installType = getInstallType({ pkgVersion, installedPkg });
    const attemptNumber = installedPkg?.attributes?.latest_install_failed_attempts?.length
      ? installedPkg.attributes.latest_install_failed_attempts.length + 1
      : 1;

    await updateInstallStatusToFailed({
      logger,
      savedObjectsClient,
      pkgName,
      status: 'install_failed',
      latestInstallFailedAttempts,
    });
    // in case of install, uninstall any package assets
    if (installType === 'install') {
      logger.error(
        `Uninstalling ${pkgkey} after error installing: [${error.toString()}] with install type: ${installType}`
      );
      if (keepFailedInstallation) {
        return;
      }
      await removeInstallation({ savedObjectsClient, pkgName, pkgVersion, esClient });
      return;
    }

    // in case of reinstall, restart install where it left off
    // retry MAX_REINSTALL_RETRIES times before exiting, in case the error persists
    if (installType === 'reinstall' && attemptNumber <= MAX_REINSTALL_RETRIES) {
      logger.error(`Error installing ${pkgkey}: [${error.toString()}]`);
      logger.debug(
        `Retrying install of ${pkgkey} with install type: ${installType} - Attempt ${attemptNumber} `
      );
      await installPackage({
        installSource: 'registry',
        savedObjectsClient,
        pkgkey,
        esClient,
        spaceId,
        request,
        retryFromLastState: true,
      });
      return;
    }
    // In case of update, reinstall the previous version
    if (installType === 'update') {
      if (!installedPkg) {
        logger.error(
          `Failed to rollback package with install type: ${installType} after installation error ${error} because saved object was undefined`
        );
        return;
      }
      const prevVersion = `${pkgName}-${installedPkg.attributes.version}`;
      logger.error(`Rolling back to ${prevVersion} after error installing ${pkgkey}`);
      await installPackage({
        installSource: 'registry',
        savedObjectsClient,
        pkgkey: prevVersion,
        esClient,
        spaceId,
        force: true,
        request,
      });
    }
  } catch (e) {
    // If an error happens while removing the integration or while doing a rollback update the status to failed
    await updateInstallStatusToFailed({
      logger,
      savedObjectsClient,
      pkgName,
      status: 'install_failed',
      latestInstallFailedAttempts: installedPkg
        ? addErrorToLatestFailedAttempts({
            error: e,
            targetVersion: installedPkg.attributes.version,
            createdAt: installedPkg.attributes.install_started_at,
            latestAttempts: latestInstallFailedAttempts,
          })
        : [],
    });
    logger.error(`Failed to uninstall or rollback package after installation error ${e}`);
  }
}

export interface IBulkInstallPackageError {
  name: string;
  error: Error;
  installType?: InstallType;
}
export type BulkInstallResponse = BulkInstallPackageInfo | IBulkInstallPackageError;

interface InstallRegistryPackageParams {
  savedObjectsClient: SavedObjectsClientContract;
  pkgkey: string;
  esClient: ElasticsearchClient;
  spaceId: string;
  force?: boolean;
  neverIgnoreVerificationError?: boolean;
  ignoreConstraints?: boolean;
  prerelease?: boolean;
  request?: KibanaRequest;
  ignoreMappingUpdateErrors?: boolean;
  skipDataStreamRollover?: boolean;
  retryFromLastState?: boolean;
  keepFailedInstallation?: boolean;
  useStreaming?: boolean;
  automaticInstall?: boolean;
  installedAsDependencyOf?: { name: string; version: string };
  skipDependencyCheck?: boolean;
}

export interface CustomPackageDatasetConfiguration {
  name: string;
  type: PackageDataStreamTypes;
}
interface InstallCustomPackageParams {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  datasets: CustomPackageDatasetConfiguration[];
  esClient: ElasticsearchClient;
  spaceId: string;
  force?: boolean;
  request?: KibanaRequest;
  kibanaVersion: string;
}
interface InstallUploadedArchiveParams {
  savedObjectsClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  archiveBuffer: Buffer;
  contentType: string;
  spaceId: string;
  version?: string;
  request?: KibanaRequest;
  ignoreMappingUpdateErrors?: boolean;
  skipDataStreamRollover?: boolean;
  isBundledPackage?: boolean;
  skipRateLimitCheck?: boolean;
}

function getTelemetryEvent(pkgName: string, pkgVersion: string): PackageUpdateEvent {
  return {
    packageName: pkgName,
    currentVersion: 'unknown',
    newVersion: pkgVersion,
    status: 'failure',
    dryRun: false,
    eventType: UpdateEventType.PACKAGE_INSTALL,
    installType: 'unknown',
  };
}

function sendEvent(telemetryEvent: PackageUpdateEvent) {
  sendTelemetryEvents(
    appContextService.getLogger(),
    appContextService.getTelemetryEventsSender(),
    telemetryEvent
  );
}

function sendEventWithLatestState(
  telemetryEvent: PackageUpdateEvent,
  errorMessage: string,
  latestExecutedState?: InstallLatestExecutedState
) {
  sendEvent({
    ...telemetryEvent,
    errorMessage,
    ...(latestExecutedState
      ? {
          latestExecutedState: {
            name: latestExecutedState.name,
            error: latestExecutedState.error,
          },
        }
      : {}),
  });
}

async function installPackageFromRegistry({
  savedObjectsClient,
  pkgkey,
  esClient,
  spaceId,
  request,
  force = false,
  ignoreConstraints = false,
  neverIgnoreVerificationError = false,
  prerelease = false,
  ignoreMappingUpdateErrors = false,
  skipDataStreamRollover = false,
  retryFromLastState = false,
  keepFailedInstallation = false,
  useStreaming = false,
  automaticInstall = false,
  installedAsDependencyOf,
  skipDependencyCheck = false,
}: InstallRegistryPackageParams): Promise<InstallResult> {
  const logger = appContextService.getLogger();
  // TODO: change epm API to /packageName/version so we don't need to do this
  const { pkgName, pkgVersion: version } = Registry.splitPkgKey(pkgkey);
  let pkgVersion = version ?? '';
  useStreaming = PACKAGES_TO_INSTALL_WITH_STREAMING.includes(pkgName) || useStreaming;

  // if an error happens during getInstallType, report that we don't know
  let installType: InstallType = 'unknown';
  const installSource = 'registry';
  const telemetryEvent: PackageUpdateEvent = getTelemetryEvent(pkgName, pkgVersion);
  let installedPkg: SavedObject<Installation> | undefined;

  try {
    // get the currently installed package

    const queryLatest = () =>
      Registry.fetchFindLatestPackageOrThrow(pkgName, {
        ignoreConstraints,
        prerelease: prerelease === true || isPackagePrerelease(pkgVersion), // fetching latest GA version if the package to install is GA, so that it is allowed to install
      });

    let latestPkg;
    // fetching latest package first to set the version
    if (!pkgVersion) {
      latestPkg = await queryLatest();
      pkgVersion = latestPkg.version;
    }

    installedPkg = await getInstallationObject({ savedObjectsClient, pkgName });
    installType = getInstallType({ pkgVersion, installedPkg });

    telemetryEvent.installType = installType;
    telemetryEvent.currentVersion = installedPkg?.attributes.version || 'not_installed';

    // get latest package version and requested version in parallel for performance
    const [latestPackage, { paths, packageInfo, archiveIterator, verificationResult }] =
      await Promise.all([
        latestPkg ? Promise.resolve(latestPkg) : queryLatest(),
        Registry.getPackage(pkgName, pkgVersion, {
          ignoreUnverified: force && !neverIgnoreVerificationError,
          useStreaming: true,
        }),
      ]);
    const packageInstallContext: PackageInstallContext = {
      packageInfo,
      paths,
      archiveIterator,
    };
    telemetryEvent.packageType = packageInfo.type;
    telemetryEvent.discoveryDatasets = packageInfo.discovery?.datasets;
    telemetryEvent.automaticInstall = automaticInstall;

    // let the user install if using the force flag or needing to reinstall or install a previous version due to failed update
    const installOutOfDateVersionOk =
      force || ['reinstall', 'reupdate', 'rollback'].includes(installType);

    // if the requested version is out-of-date of the latest package version, check if we allow it
    // if we don't allow it, return an error
    if (semverLt(pkgVersion, latestPackage.version)) {
      if (!installOutOfDateVersionOk) {
        throw new PackageOutdatedError(
          `${pkgkey} is out-of-date and cannot be installed or updated`
        );
      }
      logger.debug(
        `${pkgkey} is out-of-date, installing anyway due to ${
          force ? 'force flag' : `install type ${installType}`
        }`
      );
    }

    // only allow install of agentless packages if agentless is enabled, or if using force flag
    const agentlessEnabled = isAgentlessEnabled();
    const agentlessOnlyIntegration = isOnlyAgentlessIntegration(packageInfo);
    if (!agentlessEnabled && agentlessOnlyIntegration) {
      if (!force) {
        throw new PackageInvalidDeploymentMode(
          `${pkgkey} contains agentless policy templates, agentless is not available on this deployment`
        );
      }
      logger.debug(
        `${pkgkey} contains agentless policy templates, agentless is not available on this deployment but installing anyway due to force flag`
      );
    }

    const result = await installPackageWithStateMachine({
      pkgName,
      pkgVersion,
      installSource,
      installedPkg,
      installType,
      savedObjectsClient,
      esClient,
      spaceId,
      force,
      packageInstallContext,
      paths,
      verificationResult,
      request,
      ignoreMappingUpdateErrors,
      skipDataStreamRollover,
      retryFromLastState,
      useStreaming,
      keepFailedInstallation,
      automaticInstall,
      installedAsDependencyOf,
      skipDependencyCheck,
    });

    // After a successful, user-initiated (non-automatic) non-content-package install, trigger an
    // immediate content pack autodiscovery run so users see content packs appear quickly rather
    // than waiting for the next scheduled interval. Guard against re-triggering from the task's
    // own content-pack installs (automaticInstall=true, type='content').
    if (!result.error && !automaticInstall && packageInfo.type !== 'content') {
      appContextService
        .getTaskManagerStart()
        ?.runSoon(AUTO_INSTALL_CONTENT_PACKAGES_TASK_ID)
        .catch((e) =>
          logger.debug(
            `[AutoInstallContentPackagesTask] runSoon trigger after install failed (non-critical): ${e.message}`
          )
        );
    }

    return result;
  } catch (e) {
    sendEventWithLatestState(
      telemetryEvent,
      e.message,
      installedPkg?.attributes.latest_executed_state
    );
    return {
      error: e,
      installType,
      installSource,
      pkgName,
    };
  }
}

function getElasticSubscription(packageInfo: ArchivePackage) {
  const subscription = packageInfo.conditions?.elastic?.subscription as LicenseType | undefined;
  // Keep packageInfo.license for backward compatibility
  return subscription || packageInfo.license || 'basic';
}

export async function installPackageWithStateMachine(options: {
  pkgName: string;
  pkgVersion: string;
  installSource: InstallSource;
  installedPkg?: SavedObject<Installation>;
  installType: InstallType;
  savedObjectsClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  spaceId: string;
  force?: boolean;
  packageInstallContext: PackageInstallContext;
  paths: string[];
  verificationResult?: PackageVerificationResult;
  telemetryEvent?: PackageUpdateEvent;
  request?: KibanaRequest;
  ignoreMappingUpdateErrors?: boolean;
  skipDataStreamRollover?: boolean;
  retryFromLastState?: boolean;
  useStreaming?: boolean;
  keepFailedInstallation?: boolean;
  automaticInstall?: boolean;
  installedAsDependencyOf?: { name: string; version: string };
  skipDependencyCheck?: boolean;
}): Promise<InstallResult> {
  const packageInfo = options.packageInstallContext.packageInfo;

  const {
    pkgName,
    pkgVersion,
    installSource,
    installedPkg,
    installType,
    savedObjectsClient,
    force,
    esClient,
    spaceId,
    verificationResult,
    request,
    ignoreMappingUpdateErrors,
    skipDataStreamRollover,
    packageInstallContext,
    retryFromLastState,
    useStreaming,
    keepFailedInstallation,
    automaticInstall,
    installedAsDependencyOf,
    skipDependencyCheck,
  } = options;
  let { telemetryEvent } = options;
  const logger = appContextService.getLogger();
  logger.info(
    `Install with state machine - Starting installation of ${pkgName}@${pkgVersion} from ${installSource} `
  );

  // Workaround apm issue with async spans: https://github.com/elastic/apm-agent-nodejs/issues/2611
  await Promise.resolve();
  const span = apm.startSpan(
    `Install package from ${installSource} ${pkgName}@${pkgVersion}`,
    'package'
  );

  if (!telemetryEvent) {
    telemetryEvent = getTelemetryEvent(pkgName, pkgVersion);
    telemetryEvent.installType = installType;
    telemetryEvent.currentVersion = installedPkg?.attributes.version || 'not_installed';
    telemetryEvent.packageType = packageInfo.type;
    telemetryEvent.discoveryDatasets = packageInfo.discovery?.datasets;
    telemetryEvent.automaticInstall = automaticInstall;
  }

  try {
    addSpanLabels({
      packageName: pkgName,
      packageVersion: pkgVersion,
      installType,
    });

    const filteredPackages = getFilteredInstallPackages();
    if (filteredPackages.includes(pkgName)) {
      throw new FleetUnauthorizedError(`${pkgName} installation is not authorized`);
    }

    const allowlistPackages = getAllowedSearchAiLakeInstallPackagesIfEnabled();
    // This will only trigger if xpack.fleet.internal.registry.searchAiLakePackageAllowlistEnabled: true
    if (allowlistPackages && !allowlistPackages.includes(pkgName)) {
      throw new FleetUnauthorizedError(`${pkgName} installation is not authorized`);
    }

    // if the requested version is the same as installed version, check if we allow it based on
    // current installed package status and force flag, if we don't allow it,
    // just return the asset references from the existing installation
    if (
      installedPkg?.attributes.version === pkgVersion &&
      installedPkg?.attributes.install_status === 'installed'
    ) {
      if (!force) {
        logger.debug(`${pkgName}-${pkgVersion} is already installed, skipping installation`);
        return {
          assets: [
            ...installedPkg.attributes.installed_es,
            ...installedPkg.attributes.installed_kibana,
          ],
          status: 'already_installed',
          installType,
          installSource,
          pkgName,
        };
      }
    }
    const elasticSubscription = getElasticSubscription(packageInfo);
    if (!licenseService.hasAtLeast(elasticSubscription)) {
      logger.error(`Installation requires ${elasticSubscription} license`);
      const err = new FleetError(`Installation requires ${elasticSubscription} license`);
      sendEvent({
        ...telemetryEvent,
        errorMessage: err.message,
      });
      return { error: err, installType, installSource, pkgName };
    }

    const excludeDataStreamTypes =
      appContextService.getConfig()?.internal?.excludeDataStreamTypes ?? [];
    if (!shouldIncludePackageWithDatastreamTypes(packageInfo, excludeDataStreamTypes)) {
      logger.error(
        `Installation package: ${pkgName} is not allowed due to data stream type exclusions`
      );
      const err = new FleetError(
        `Installation package: ${pkgName} is not allowed due to data stream type exclusions`
      );
      sendEvent({
        ...telemetryEvent,
        errorMessage: err.message,
      });
      return { error: err, installType, installSource, pkgName };
    }

    // Saved object client need to be scopped with the package space for saved object tagging
    const savedObjectClientWithSpace = appContextService.getInternalUserSOClientForSpaceId(spaceId);

    const savedObjectsImporter = appContextService
      .getSavedObjects()
      .createImporter(savedObjectClientWithSpace, { importSizeLimit: 15_000 });

    const savedObjectTagAssignmentService = appContextService
      .getSavedObjectsTagging()
      .createInternalAssignmentService({ client: savedObjectClientWithSpace });

    const savedObjectTagClient = appContextService
      .getSavedObjectsTagging()
      .createTagClient({ client: savedObjectClientWithSpace });

    // try installing the package, if there was an error, call error handler and rethrow
    return await _stateMachineInstallPackage({
      savedObjectsClient,
      savedObjectsImporter,
      savedObjectTagAssignmentService,
      savedObjectTagClient,
      esClient,
      logger,
      installedPkg,
      packageInstallContext,
      installType,
      spaceId,
      verificationResult,
      installSource,
      request,
      force,
      ignoreMappingUpdateErrors,
      skipDataStreamRollover,
      retryFromLastState,
      useStreaming,
      installedAsDependencyOf,
      skipDependencyCheck,
    })
      .then(async (assets) => {
        logger.debug(`Removing old assets from previous versions of ${pkgName}`);
        await removeOldAssets({
          soClient: savedObjectsClient,
          pkgName,
          currentVersion: packageInfo.version,
        });
        sendEvent({
          ...telemetryEvent!,
          status: 'success',
        });
        return {
          assets,
          status: 'installed' as InstallResultStatus,
          installType,
          installSource,
          pkgName,
        };
      })
      .catch(async (err: Error) => {
        logger.warn(`Failure to install package [${pkgName}]: [${err.toString()}]`, {
          error: err,
        });
        await handleInstallPackageFailure({
          savedObjectsClient,
          error: err,
          pkgName,
          pkgVersion,
          installedPkg,
          spaceId,
          esClient,
          request,
          keepFailedInstallation,
        });
        sendEventWithLatestState(
          telemetryEvent,
          err.message,
          installedPkg?.attributes.latest_executed_state
        );
        return { error: err, installType, installSource, pkgName };
      });
  } catch (e) {
    sendEventWithLatestState(
      telemetryEvent,
      e.message,
      installedPkg?.attributes.latest_executed_state
    );
    return {
      error: e,
      installType,
      installSource,
      pkgName,
    };
  } finally {
    span?.end();
  }
}

async function installPackageByUpload({
  savedObjectsClient,
  esClient,
  archiveBuffer,
  contentType,
  spaceId,
  version,
  request,
  ignoreMappingUpdateErrors,
  skipDataStreamRollover,
  isBundledPackage,
  skipRateLimitCheck,
}: InstallUploadedArchiveParams): Promise<InstallResult> {
  const logger = appContextService.getLogger();

  // if an error happens during getInstallType, report that we don't know
  let installType: InstallType = 'unknown';
  let pkgName = 'unknown';
  const installSource = isBundledPackage ? 'bundled' : 'upload';

  const timeToWaitString = moment
    .utc(moment.duration(UPLOAD_RETRY_AFTER_MS).asMilliseconds())
    .format('s[s]');

  try {
    // Check cached timestamp for rate limiting
    const lastInstalledBy = getLastUploadInstallCache();

    if (lastInstalledBy && !skipRateLimitCheck) {
      const msSinceLastFetched = Date.now() - (lastInstalledBy || 0);
      if (msSinceLastFetched < UPLOAD_RETRY_AFTER_MS) {
        logger.error(
          `Install by Upload - Too many requests. Wait ${timeToWaitString} before uploading again.`
        );
        throw new FleetTooManyRequestsError(
          `Too many requests. Please wait ${timeToWaitString} before uploading again.`
        );
      }
    }
    const { packageInfo } = await generatePackageInfoFromArchiveBuffer(archiveBuffer, contentType);
    pkgName = packageInfo.name;
    const useStreaming = PACKAGES_TO_INSTALL_WITH_STREAMING.includes(pkgName);

    // Allow for overriding the version in the manifest for cases where we install
    // stack-aligned bundled packages to support special cases around the
    // `forceAlignStackVersion` flag in `fleet_packages.json`.
    const pkgVersion = version || packageInfo.version;

    const installedPkg = await getInstallationObject({
      savedObjectsClient,
      pkgName,
    });

    installType = getInstallType({ pkgVersion, installedPkg });

    // as we do not verify uploaded packages, we must invalidate the verification cache
    deleteVerificationResult(packageInfo);

    setPackageInfo({
      name: pkgName,
      version: pkgVersion,
      packageInfo,
    });

    const { paths, archiveIterator } = await unpackBufferToAssetsMap({
      archiveBuffer,
      contentType,
      useStreaming,
    });

    const packageInstallContext: PackageInstallContext = {
      packageInfo: { ...packageInfo, version: pkgVersion },
      paths,
      archiveIterator,
    };
    // update the timestamp of latest installation
    setLastUploadInstallCache();

    return await installPackageWithStateMachine({
      packageInstallContext,
      pkgName,
      pkgVersion,
      installSource,
      installedPkg,
      installType,
      savedObjectsClient,
      esClient,
      spaceId,
      force: true, // upload has implicit force
      paths,
      request,
      ignoreMappingUpdateErrors,
      skipDataStreamRollover,
      useStreaming,
    });
  } catch (e) {
    return {
      error: e,
      installType,
      installSource,
      pkgName,
    };
  }
}

export type InstallPackageParams = {
  spaceId: string;
  neverIgnoreVerificationError?: boolean;
  retryFromLastState?: boolean;
  skipDependencyCheck?: boolean;
} & (
  | ({ installSource: Extract<InstallSource, 'registry'> } & InstallRegistryPackageParams)
  | ({ installSource: Extract<InstallSource, 'upload'> } & InstallUploadedArchiveParams)
  | ({ installSource: Extract<InstallSource, 'bundled'> } & InstallUploadedArchiveParams)
  | ({ installSource: Extract<InstallSource, 'custom'> } & InstallCustomPackageParams)
);

/**
 * Entrypoint function for installing packages; this function gets also called by the POST epm/packages handler
 */
export async function installPackage(args: InstallPackageParams): Promise<InstallResult> {
  if (!('installSource' in args)) {
    throw new FleetError('installSource is required');
  }

  const logger = appContextService.getLogger();
  const { savedObjectsClient, esClient } = args;

  const request = args.request;

  if (args.installSource === 'registry') {
    const {
      pkgkey,
      force,
      ignoreConstraints,
      spaceId,
      neverIgnoreVerificationError,
      prerelease,
      ignoreMappingUpdateErrors,
      skipDataStreamRollover,
      retryFromLastState,
      keepFailedInstallation,
      useStreaming,
      automaticInstall,
      installedAsDependencyOf,
      skipDependencyCheck,
    } = args;

    const matchingBundledPackage = await getBundledPackageByPkgKey(pkgkey);

    if (matchingBundledPackage) {
      logger.debug(
        `Found bundled package for requested install of ${pkgkey} - installing from bundled package archive`
      );

      const archiveBuffer = await matchingBundledPackage.getBuffer();

      const response = await installPackageByUpload({
        savedObjectsClient,
        esClient,
        archiveBuffer,
        contentType: 'application/zip',
        spaceId,
        version: matchingBundledPackage.version,
        request,
        ignoreMappingUpdateErrors,
        skipDataStreamRollover,
        isBundledPackage: true,
        skipRateLimitCheck: true,
      });

      return { ...response, installSource: 'bundled' };
    }

    logger.debug(`Kicking off install of ${pkgkey} from registry`);
    const response = await installPackageFromRegistry({
      savedObjectsClient,
      pkgkey,
      esClient,
      spaceId,
      force,
      neverIgnoreVerificationError,
      ignoreConstraints,
      prerelease,
      request,
      ignoreMappingUpdateErrors,
      skipDataStreamRollover,
      retryFromLastState,
      keepFailedInstallation,
      useStreaming,
      automaticInstall,
      installedAsDependencyOf,
      skipDependencyCheck,
    });

    return response;
  } else if (args.installSource === 'upload') {
    const {
      archiveBuffer,
      contentType,
      spaceId,
      ignoreMappingUpdateErrors,
      skipDataStreamRollover,
    } = args;
    logger.debug(`Installing package by upload`);
    const response = await installPackageByUpload({
      savedObjectsClient,
      esClient,
      archiveBuffer,
      contentType,
      spaceId,
      request,
      ignoreMappingUpdateErrors,
      skipDataStreamRollover,
    });
    return response;
  } else if (args.installSource === 'custom') {
    const { pkgName, force, datasets, spaceId, kibanaVersion } = args;
    logger.debug(`Kicking off install of custom package ${pkgName}`);
    const response = await installCustomPackage({
      savedObjectsClient,
      pkgName,
      datasets,
      esClient,
      spaceId,
      force,
      request,
      kibanaVersion,
    });
    return response;
  }
  throw new FleetError(`Unknown installSource: ${args.installSource}`);
}

export async function installCustomPackage(
  args: InstallCustomPackageParams
): Promise<InstallResult> {
  const {
    savedObjectsClient,
    esClient,
    spaceId,
    pkgName,
    force,
    request,
    datasets,
    kibanaVersion,
  } = args;

  // Validate that we can create this package, validations will throw if they don't pass
  await checkForNamingCollision(savedObjectsClient, pkgName);
  checkDatasetsNameFormat(datasets, pkgName);

  // Compose a packageInfo
  const packageInfo = {
    format_version: CUSTOM_INTEGRATION_PACKAGE_SPEC_VERSION,
    name: pkgName,
    title: convertStringToTitle(pkgName),
    description: generateDescription(datasets.map((dataset) => dataset.name)),
    version: INITIAL_VERSION,
    owner: {
      github:
        (request
          ? appContextService.getSecurityCore().authc.getCurrentUser(request)?.username
          : null) ?? 'unknown',
    },
    type: 'integration' as const,
    data_streams: generateDatastreamEntries(datasets, pkgName),
  };

  const assets = createAssets({
    ...packageInfo,
    kibanaVersion,
    datasets,
  });

  const assetsMap = assets.reduce((acc, asset) => {
    acc.set(asset.path, asset.content);
    return acc;
  }, new Map<string, Buffer | undefined>());
  const paths = assets.map((asset) => asset.path);
  const archiveIterator = createArchiveIteratorFromMap(assetsMap);

  const packageInstallContext: PackageInstallContext = {
    paths,
    packageInfo,
    archiveIterator,
  };
  return await installPackageWithStateMachine({
    packageInstallContext,
    pkgName,
    pkgVersion: INITIAL_VERSION,
    installSource: 'custom',
    installType: 'install',
    savedObjectsClient,
    esClient,
    spaceId,
    force,
    paths,
    request,
  });
}

export const updateVersion = async (
  savedObjectsClient: SavedObjectsClientContract,
  pkgName: string,
  pkgVersion: string
) => {
  auditLoggingService.writeCustomSoAuditLog({
    action: 'update',
    id: pkgName,
    name: pkgName,
    savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
  });

  return savedObjectsClient.update(PACKAGES_SAVED_OBJECT_TYPE, pkgName, {
    version: pkgVersion,
  });
};

export const updateInstallStatusToFailed = async ({
  logger,
  savedObjectsClient,
  pkgName,
  status,
  latestInstallFailedAttempts,
}: {
  logger: Logger;
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  status: EpmPackageInstallStatus;
  latestInstallFailedAttempts: any;
}) => {
  auditLoggingService.writeCustomSoAuditLog({
    action: 'update',
    id: pkgName,
    name: pkgName,
    savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
  });
  try {
    return await savedObjectsClient.update(PACKAGES_SAVED_OBJECT_TYPE, pkgName, {
      install_status: status,
      latest_install_failed_attempts: latestInstallFailedAttempts,
    });
  } catch (err) {
    if (!SavedObjectsErrorHelpers.isNotFoundError(err)) {
      logger.error(`failed to update package status to: install_failed  ${err}`);
    }
  }
};

export async function restartInstallation(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  pkgVersion: string;
  installSource: InstallSource;
  verificationResult?: PackageVerificationResult;
  previousVersion?: string | null;
  installedAsDependencyOf?: { name: string; version: string };
  existingIsDependencyOf?: { name: string; version: string }[];
  dependencies?: PackageDependencies | null;
}) {
  const {
    savedObjectsClient,
    pkgVersion,
    pkgName,
    installSource,
    verificationResult,
    previousVersion,
    dependencies,
  } = options;

  let savedObjectUpdate: Partial<Installation> = {
    install_version: pkgVersion,
    install_status: 'installing',
    install_started_at: new Date().toISOString(),
    install_source: installSource,
    previous_version: previousVersion,
    ...(dependencies ? { dependencies } : {}),
  };

  if (options.installedAsDependencyOf) {
    savedObjectUpdate.is_dependency_of = mergeIsDependencyOf(
      options.installedAsDependencyOf,
      options.existingIsDependencyOf
    );
    // Do not overwrite installed_as_dependency here: if the package was manually installed
    // before becoming a dependency (e.g. it is being updated to satisfy a new constraint),
    // we want to preserve the existing false value so cleanup won't auto-remove it.
  } else {
    // Explicit user install: ensure the package is not marked as a pure dependency.
    savedObjectUpdate.installed_as_dependency = false;
  }

  if (verificationResult) {
    savedObjectUpdate = {
      ...savedObjectUpdate,
      verification_key_id: null, // unset any previous verification key id
      ...formatVerificationResultForSO(verificationResult),
    };
  }

  auditLoggingService.writeCustomSoAuditLog({
    action: 'update',
    id: pkgName,
    name: pkgName,
    savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
  });

  await savedObjectsClient.update(PACKAGES_SAVED_OBJECT_TYPE, pkgName, savedObjectUpdate);
}

export async function createInstallation(options: {
  savedObjectsClient: SavedObjectsClientContract;
  packageInfo: InstallablePackage;
  installSource: InstallSource;
  spaceId: string;
  verificationResult?: PackageVerificationResult;
  installedAsDependencyOf?: { name: string; version: string };
  dependencies?: PackageDependencies | null;
}) {
  const {
    savedObjectsClient,
    packageInfo,
    installSource,
    verificationResult,
    dependencies,
    installedAsDependencyOf,
  } = options;
  const { name: pkgName, version: pkgVersion } = packageInfo;
  const typedStreams = getNormalizedDataStreams(packageInfo, GENERIC_DATASET_NAME).filter(
    (ds): ds is RegistryDataStream => !!ds.type
  );
  const toSaveESIndexPatterns = generateESIndexPatterns(typedStreams);

  // For "stack-aligned" packages, default the `keep_policies_up_to_date` setting to true. For all other
  // packages, default it to undefined. Use undefined rather than false to allow us to differentiate
  // between "unset" and "user explicitly disabled".
  const defaultKeepPoliciesUpToDate = AUTO_UPGRADE_POLICIES_PACKAGES.some(
    ({ name }) => name === packageInfo.name
  )
    ? true
    : undefined;

  let savedObject: Installation = {
    installed_kibana: [],
    installed_kibana_space_id: options.spaceId,
    installed_es: [],
    package_assets: [],
    es_index_patterns: toSaveESIndexPatterns,
    name: pkgName,
    version: pkgVersion,
    install_version: pkgVersion,
    install_status: 'installing',
    install_started_at: new Date().toISOString(),
    install_source: installSource,
    install_format_schema_version: FLEET_INSTALL_FORMAT_VERSION,
    keep_policies_up_to_date: defaultKeepPoliciesUpToDate,
    verification_status: 'unknown',
    ...(dependencies ? { dependencies } : {}),
    ...(installedAsDependencyOf
      ? { is_dependency_of: [installedAsDependencyOf], installed_as_dependency: true }
      : {}),
  };

  if (verificationResult) {
    savedObject = { ...savedObject, ...formatVerificationResultForSO(verificationResult) };
  }

  auditLoggingService.writeCustomSoAuditLog({
    action: 'create',
    id: pkgName,
    name: pkgName,
    savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
  });

  const created = await savedObjectsClient.create<Installation>(
    PACKAGES_SAVED_OBJECT_TYPE,
    savedObject,
    { id: pkgName, overwrite: true }
  );

  return created;
}

export const kibanaAssetsToAssetsRef = (
  kibanaAssets: Record<KibanaAssetType, ArchiveAsset[]>
): KibanaAssetReference[] => {
  return Object.values(kibanaAssets).flat().map(toAssetReference);
};

export const saveKibanaAssetsRefs = async (
  savedObjectsClient: SavedObjectsClientContract,
  pkgName: string,
  assetRefs: KibanaAssetReference[] | null,
  spaceId: string,
  saveAsAdditionnalSpace = false,
  append = false,
  typesToReplace: string[] = []
) => {
  auditLoggingService.writeCustomSoAuditLog({
    action: 'update',
    id: pkgName,
    name: pkgName,
    savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
  });

  // Because Kibana assets are installed in parallel with ES assets with refresh: false, we almost always run into an
  // issue that causes a conflict error due to this issue: https://github.com/elastic/kibana/issues/126240. This is safe
  // to retry constantly until it succeeds to optimize this critical user journey path as much as possible.
  await pRetry(
    async () => {
      const installation =
        saveAsAdditionnalSpace || append
          ? await savedObjectsClient
              .get<Installation>(PACKAGES_SAVED_OBJECT_TYPE, pkgName)
              .catch((e) => {
                if (SavedObjectsErrorHelpers.isNotFoundError(e)) {
                  return undefined;
                }
                throw e;
              })
          : undefined;

      if (saveAsAdditionnalSpace) {
        const primarySpaceId = installation?.attributes?.installed_kibana_space_id;

        if (primarySpaceId && primarySpaceId === spaceId) {
          appContextService
            .getLogger()
            .error(
              `saveKibanaAssetsRefs: unexpectedly received spaceId '${spaceId}' for package '${pkgName}' for saving as additional space that matches primary installation space. Skipping.`
            );
          return; // no-op: skip SO update
        }

        // Strip the primary-space key if it was unexpectedly written there
        const keysToOmit = primarySpaceId ? [spaceId, primarySpaceId] : [spaceId];

        let spaceAssetRefs = assetRefs !== null ? assetRefs : [];
        if (append && installation) {
          const existingSpaceRefs = (
            installation.attributes?.additional_spaces_installed_kibana?.[spaceId] ?? []
          ).filter((r) => !typesToReplace.includes(r.type));
          spaceAssetRefs = uniqBy(
            [...spaceAssetRefs, ...existingSpaceRefs],
            (asset) => asset.id + asset.type
          );
        }
        return savedObjectsClient.update<Installation>(
          PACKAGES_SAVED_OBJECT_TYPE,
          pkgName,
          {
            additional_spaces_installed_kibana: {
              ...omit(
                installation?.attributes?.additional_spaces_installed_kibana ?? {},
                keysToOmit
              ),
              ...(assetRefs !== null ? { [spaceId]: spaceAssetRefs } : {}),
            },
          },
          { refresh: false }
        );
      }

      let newAssetRefs = assetRefs !== null ? assetRefs : [];
      if (append && installation) {
        const existingRefs = (installation.attributes.installed_kibana ?? []).filter(
          (r) => !typesToReplace.includes(r.type)
        );
        newAssetRefs = uniqBy([...newAssetRefs, ...existingRefs], (asset) => asset.id + asset.type);
      }

      return savedObjectsClient.update<Installation>(
        PACKAGES_SAVED_OBJECT_TYPE,
        pkgName,
        {
          installed_kibana: newAssetRefs,
        },
        { refresh: false }
      );
    },
    { retries: 20 } // Use a number of retries higher than the number of es asset update operations
  );

  return assetRefs !== null ? assetRefs : [];
};

export async function ensurePackagesCompletedInstall(
  savedObjectsClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient
) {
  const installingPackages = await getPackageSavedObjects(savedObjectsClient, {
    searchFields: ['install_status'],
    search: 'installing',
  });
  const installingPromises = installingPackages.saved_objects.reduce<Array<Promise<InstallResult>>>(
    (acc, pkg) => {
      const startDate = pkg.attributes.install_started_at;
      const nowDate = new Date().toISOString();
      const elapsedTime = Date.parse(nowDate) - Date.parse(startDate);
      const pkgkey = `${pkg.attributes.name}-${pkg.attributes.install_version}`;
      // reinstall package
      if (elapsedTime > MAX_TIME_COMPLETE_INSTALL) {
        acc.push(
          installPackage({
            installSource: 'registry',
            savedObjectsClient,
            pkgkey,
            esClient,
            spaceId: pkg.attributes.installed_kibana_space_id || DEFAULT_SPACE_ID,
          })
        );
      }
      return acc;
    },
    []
  );
  await Promise.all(installingPromises);
  return installingPackages;
}

interface NoPkgArgs {
  pkgVersion: string;
  installedPkg?: undefined;
}

interface HasPkgArgs {
  pkgVersion: string;
  installedPkg: SavedObject<Installation>;
}

type OnlyInstall = Extract<InstallType, 'install'>;
type NotInstall = Exclude<InstallType, 'install'>;

// overloads
export function getInstallType(args: NoPkgArgs): OnlyInstall;
export function getInstallType(args: HasPkgArgs): NotInstall;
export function getInstallType(args: NoPkgArgs | HasPkgArgs): OnlyInstall | NotInstall;

// implementation
export function getInstallType(args: NoPkgArgs | HasPkgArgs): OnlyInstall | NotInstall {
  const { pkgVersion, installedPkg } = args;
  if (!installedPkg) return 'install';

  const currentPkgVersion = installedPkg.attributes.version;
  const lastStartedInstallVersion = installedPkg.attributes.install_version;

  if (pkgVersion === currentPkgVersion && pkgVersion !== lastStartedInstallVersion)
    return 'rollback';
  if (pkgVersion === currentPkgVersion) return 'reinstall';
  if (pkgVersion === lastStartedInstallVersion && pkgVersion !== currentPkgVersion)
    return 'reupdate';
  if (pkgVersion !== lastStartedInstallVersion && pkgVersion !== currentPkgVersion) return 'update';
  throw new FleetError('Unknown install type');
}
