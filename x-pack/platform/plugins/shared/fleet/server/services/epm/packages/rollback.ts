/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { uniq } from 'lodash';
import type { unitOfTime } from 'moment';
import moment from 'moment';
import pMap from 'p-map';
import type {
  ElasticsearchClient,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import semverGt from 'semver/functions/gt';
import semverSatisfies from 'semver/functions/satisfies';

import { escapeKuery } from '@kbn/es-query';

import {
  PACKAGES_SAVED_OBJECT_TYPE,
  SO_SEARCH_LIMIT,
  AGENT_POLICY_INDEX,
} from '../../../../common';
import { AGENT_POLICY_VERSION_SEPARATOR } from '../../../../common/constants/agent_policy';
import type { RollbackResult } from '../../package_policy_service';
import { getAgentsByKuery, reassignAgents } from '../../agents';

import type {
  BulkRollbackAvailableCheckResponse,
  Installation,
  RollbackAvailableCheckResponse,
} from '../../../../common/types';

import { PackageRollbackError } from '../../../errors';
import { getPackagePolicyIdsForCurrentUser } from '../../../routes/epm/bulk_handler';
import { agentPolicyService, appContextService, packagePolicyService } from '../..';

import type { PackageUpdateEvent } from '../../upgrade_sender';
import { UpdateEventType, sendTelemetryEvents } from '../../upgrade_sender';

import { MAX_CONCURRENT_EPM_PACKAGES_INSTALLATIONS } from '../../../constants/max_concurrency_constants';

import { fetchInfo } from '../registry';

import { getPackageSavedObjects } from './get';
import { installPackage } from './install';
import { removeInstallation } from './remove';

const DEFAULT_INTEGRATION_ROLLBACK_TTL = '7d';

export const isIntegrationRollbackTTLExpired = (installStartedAt: string): boolean => {
  let { integrationRollbackTTL } = appContextService.getConfig() ?? {};
  if (!integrationRollbackTTL) {
    integrationRollbackTTL = DEFAULT_INTEGRATION_ROLLBACK_TTL;
  }
  const numberPart = integrationRollbackTTL.slice(0, -1);
  const unitPart = integrationRollbackTTL.slice(-1) as unitOfTime.DurationConstructor;
  const ttlDuration = moment.duration(Number(numberPart), unitPart).asMilliseconds();
  return Date.parse(installStartedAt) < Date.now() - ttlDuration;
};

export async function rollbackAvailableCheck(
  pkgName: string,
  currentUserPolicyIds: string[]
): Promise<RollbackAvailableCheckResponse> {
  // Need a less restrictive client than fleetContext.internalSoClient for SO operations in multiple spaces.
  const savedObjectsClient = appContextService.getInternalUserSOClientWithoutSpaceExtension();

  const packageSORes = await getPackageSavedObjects(savedObjectsClient, {
    searchFields: ['name'],
    search: pkgName,
    fields: [
      'version',
      'previous_version',
      'install_started_at',
      'install_source',
      'previous_dependency_versions',
    ],
  });
  if (packageSORes.saved_objects.length === 0) {
    return {
      isAvailable: false,
      reason: `Package ${pkgName} not found`,
    };
  } else if (packageSORes.saved_objects.length > 1) {
    // This should not happen.
    return {
      isAvailable: false,
      reason: `Expected exactly one package saved object`,
    };
  }
  const packageSO = packageSORes.saved_objects[0];
  const previousVersion = packageSO.attributes.previous_version;

  if (!previousVersion) {
    return {
      isAvailable: false,
      reason: `No previous version found for package ${pkgName}`,
    };
  }
  if (isIntegrationRollbackTTLExpired(packageSO.attributes.install_started_at)) {
    return {
      isAvailable: false,
      reason: `Rollback not allowed as TTL expired`,
    };
  }

  if (packageSO.attributes.install_source !== 'registry') {
    return {
      isAvailable: false,
      reason: `${pkgName} was not installed from the registry (install source: ${packageSO.attributes.install_source})`,
    };
  }

  const packagePolicySORes = await packagePolicyService.getPackagePolicySavedObjects(
    savedObjectsClient,
    {
      searchFields: ['package.name'],
      search: pkgName,
      spaceIds: ['*'],
      fields: ['package.version', 'is_managed', 'policy_ids'],
    }
  );
  const packagePolicySOs = packagePolicySORes.saved_objects;
  const policyIds = packagePolicySOs.map((so) => so.id);

  const managedRollbackReason = `Cannot rollback integration with managed package policies`;
  if (packagePolicySOs.some((so) => so.attributes.is_managed)) {
    return {
      isAvailable: false,
      reason: managedRollbackReason,
    };
  }
  // checking is_managed flag on agent policy, it is not always set on package policy
  const agentPolicyIds = uniq(
    packagePolicySOs
      .filter((so) => !so.id.endsWith(':prev'))
      .flatMap((so) => so.attributes.policy_ids ?? [])
  );
  const agentPolicies = await agentPolicyService.getByIds(
    savedObjectsClient,
    agentPolicyIds.map((id) => ({ id, spaceId: '*' }))
  );
  if (agentPolicies.some((agentPolicy) => agentPolicy.is_managed)) {
    return {
      isAvailable: false,
      reason: managedRollbackReason,
    };
  }

  if (packagePolicySOs.length > 0) {
    const policyIdsWithNoPreviousVersion = packagePolicySOs
      .filter((so) => {
        if (!so.id.endsWith(':prev')) {
          return (
            so.attributes.package?.version &&
            semverGt(so.attributes.package.version, previousVersion) &&
            !policyIds.includes(`${so.id}:prev`)
          );
        }
        return false;
      })
      .map((so) => so.id);
    if (policyIdsWithNoPreviousVersion.length > 0) {
      return {
        isAvailable: false,
        reason: `No previous version found for package policies: ${policyIdsWithNoPreviousVersion.join(
          ', '
        )}`,
      };
    }

    const policiesOnWrongPreviousVersion = packagePolicySOs.filter((so) => {
      if (so.id.endsWith(':prev')) {
        return so.attributes.package?.version !== previousVersion;
      }
      return false;
    });
    if (policiesOnWrongPreviousVersion.length > 0) {
      return {
        isAvailable: false,
        reason: `Rollback not available because not all integration policies were upgraded from the same previous version ${previousVersion}`,
      };
    }
  }

  if (currentUserPolicyIds.length < policyIds.length) {
    return {
      isAvailable: false,
      reason: `Not authorized to rollback integration policies in all spaces`,
    };
  }

  if (appContextService.getExperimentalFeatures().enableResolveDependencies) {
    const previousDependencyVersions = packageSO.attributes.previous_dependency_versions;
    if (previousDependencyVersions?.length) {
      for (const {
        name: depName,
        previous_version: depPreviousVersion,
      } of previousDependencyVersions) {
        const depSORes = await getPackageSavedObjects(savedObjectsClient, {
          searchFields: ['name'],
          search: depName,
          fields: ['is_dependency_of', 'install_started_at'],
        });
        if (depSORes.saved_objects.length === 0) {
          continue;
        } else if (depSORes.saved_objects.length > 1) {
          return {
            isAvailable: false,
            reason: `Expected exactly one saved object for dependency ${depName}`,
          };
        }
        const depSO = depSORes.saved_objects[0];
        const otherDependants = (depSO.attributes.is_dependency_of ?? []).filter(
          (d) => d.name !== pkgName
        );

        if (depPreviousVersion === null) {
          if (otherDependants.length > 0) {
            return {
              isAvailable: false,
              reason: `Cannot rollback: dependency ${depName} is still required by ${otherDependants
                .map((d) => d.name)
                .join(', ')}`,
            };
          }
        } else {
          if (isIntegrationRollbackTTLExpired(depSO.attributes.install_started_at)) {
            return {
              isAvailable: false,
              reason: `Rollback not available: TTL expired for dependency ${depName}`,
            };
          }
          try {
            await fetchInfo(depName, depPreviousVersion);
          } catch {
            return {
              isAvailable: false,
              reason: `Rollback not available: dependency ${depName}@${depPreviousVersion} is no longer available in the registry`,
            };
          }
          // verifyPackageDependencies in step_resolve_dependencies is skipped when force=true,
          // so semver constraints must be checked here before any rollback state changes begin.
          for (const { name: dependantName } of otherDependants) {
            const dependantSORes = await getPackageSavedObjects(savedObjectsClient, {
              searchFields: ['name'],
              search: dependantName,
              fields: ['dependencies'],
            });
            if (dependantSORes.saved_objects.length === 0) continue;
            if (dependantSORes.saved_objects.length > 1) {
              return {
                isAvailable: false,
                reason: `Expected exactly one saved object for dependant ${dependantName}`,
              };
            }
            const dependantConstraint =
              dependantSORes.saved_objects[0].attributes.dependencies?.find(
                (d) => d.name === depName
              )?.version;
            if (dependantConstraint && !semverSatisfies(depPreviousVersion, dependantConstraint)) {
              return {
                isAvailable: false,
                reason: `Rollback not available: rolling back dependency ${depName} to ${depPreviousVersion} would violate ${dependantName}'s constraint ${dependantConstraint}`,
              };
            }
          }
        }
      }
    }
  }

  return {
    isAvailable: true,
  };
}

export async function bulkRollbackAvailableCheck(
  request: KibanaRequest
): Promise<BulkRollbackAvailableCheckResponse> {
  const savedObjectsClient = appContextService.getInternalUserSOClientWithoutSpaceExtension();

  const result = await savedObjectsClient.find<Installation>({
    type: PACKAGES_SAVED_OBJECT_TYPE,
    fields: ['name'],
    filter: `${PACKAGES_SAVED_OBJECT_TYPE}.attributes.install_status:installed`,
    perPage: SO_SEARCH_LIMIT,
  });
  const installedPackageNames = result.saved_objects.map((so) => so.attributes.name);
  const items: Record<string, RollbackAvailableCheckResponse> = {};

  const packagePolicyIdsForCurrentUser = await getPackagePolicyIdsForCurrentUser(
    request,
    installedPackageNames.map((name) => ({ name }))
  );

  await pMap(
    installedPackageNames,
    async (pkgName) => {
      const { isAvailable, reason } = await rollbackAvailableCheck(
        pkgName,
        packagePolicyIdsForCurrentUser[pkgName]
      );
      items[pkgName] = { isAvailable, reason };
    },
    {
      concurrency: MAX_CONCURRENT_EPM_PACKAGES_INSTALLATIONS,
    }
  );
  return items;
}

export async function rollbackInstallation(options: {
  esClient: ElasticsearchClient;
  currentUserPolicyIds: string[];
  pkgName: string;
  spaceId: string;
}): Promise<{
  version: string;
  success: boolean;
}> {
  const { esClient, currentUserPolicyIds, pkgName, spaceId } = options;
  const logger = appContextService.getLogger();
  logger.info(`Starting installation rollback for package: ${pkgName}`);

  // Need a less restrictive client than fleetContext.internalSoClient for SO operations in multiple spaces.
  const savedObjectsClient = appContextService.getInternalUserSOClientWithoutSpaceExtension();

  const { isAvailable, reason } = await rollbackAvailableCheck(pkgName, currentUserPolicyIds);
  if (!isAvailable) {
    throw new PackageRollbackError(
      reason ? reason : `Rollback not available for package ${pkgName}`
    );
  }

  // Retrieve the package saved object, throw if it doesn't exist or doesn't have a previous version.
  const packageSORes = await getPackageSavedObjects(savedObjectsClient, {
    searchFields: ['name'],
    search: pkgName,
  });

  const packageSO = packageSORes.saved_objects[0];
  const previousVersion = packageSO.attributes.previous_version!;

  logger.info(`Rolling back ${pkgName} from ${packageSO.attributes.version} to ${previousVersion}`);

  // Retrieve package policy saved objects, throw if any of them doesn't have a previous version or has a different one.
  const packagePolicySORes = await packagePolicyService.getPackagePolicySavedObjects(
    savedObjectsClient,
    {
      searchFields: ['package.name'],
      search: pkgName,
      spaceIds: ['*'],
    }
  );
  const packagePolicySOs = packagePolicySORes.saved_objects;

  try {
    // Roll back package policies.
    const rollbackResult = await packagePolicyService.rollback(
      savedObjectsClient,
      packagePolicySOs,
      previousVersion
    );

    // Roll back dependencies BEFORE reinstalling the composable package. If deps are rolled
    // back after, stepResolveDependencies inside installPackage would see the deps at the
    // wrong (new) version and throw a downgrade error for the composable package's constraint.
    const previousDependencyVersions = packageSO.attributes.previous_dependency_versions;
    if (
      appContextService.getExperimentalFeatures().enableResolveDependencies &&
      previousDependencyVersions?.length
    ) {
      const failedDeps = await _rollbackDependencies({
        esClient,
        savedObjectsClient,
        pkgName,
        spaceId,
        previousDependencyVersions,
        logger,
      });
      if (failedDeps.length > 0) {
        await packagePolicyService.restoreRollback(savedObjectsClient, rollbackResult);
        throw new PackageRollbackError(
          `Failed to roll back dependenc${failedDeps.length === 1 ? 'y' : 'ies'}: ${failedDeps.join(
            ', '
          )}. The previous_dependency_versions snapshot has been preserved for retry.`
        );
      }
    }

    // Roll back package.
    const res = await installPackage({
      esClient,
      savedObjectsClient,
      installSource: 'registry', // Can only rollback from the registry.
      pkgkey: `${pkgName}-${previousVersion}`,
      spaceId,
      force: true,
    });
    if (res.error) {
      await packagePolicyService.restoreRollback(savedObjectsClient, rollbackResult);
      throw new PackageRollbackError(
        `Failed to rollback package ${pkgName} to version ${previousVersion}: ${res.error.message}`
      );
    }

    // Clean up package policies previous revisions and package policies that were copied during rollback.
    await packagePolicyService.cleanupRollbackSavedObjects(savedObjectsClient, rollbackResult);
    // Bump agent policy revision for all package policies that were rolled back.
    await packagePolicyService.bumpAgentPolicyRevisionAfterRollback(
      savedObjectsClient,
      rollbackResult
    );
    if (appContextService.getExperimentalFeatures().enableVersionSpecificPolicies) {
      await cleanupVersionSpecificPoliciesAfterRollback(
        savedObjectsClient,
        esClient,
        rollbackResult
      );
    }

    // Clear the snapshot so a subsequent rollback attempt does not act on stale data.
    if (
      appContextService.getExperimentalFeatures().enableResolveDependencies &&
      previousDependencyVersions?.length
    ) {
      await savedObjectsClient.update(PACKAGES_SAVED_OBJECT_TYPE, pkgName, {
        previous_dependency_versions: null,
      });
    }
  } catch (error) {
    sendRollbackTelemetry({
      packageName: pkgName,
      currentVersion: packageSO.attributes.version,
      previousVersion,
      success: false,
      errorMessage: error.message,
    });
    throw error;
  }

  sendRollbackTelemetry({
    packageName: pkgName,
    currentVersion: packageSO.attributes.version,
    previousVersion,
    success: true,
  });

  logger.info(`Package: ${pkgName} successfully rolled back to version: ${previousVersion}`);
  return { version: previousVersion, success: true };
}

async function _rollbackDependencies({
  esClient,
  savedObjectsClient,
  pkgName,
  spaceId,
  previousDependencyVersions,
  logger,
}: {
  esClient: ElasticsearchClient;
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  spaceId: string;
  previousDependencyVersions: Array<{ name: string; previous_version: string | null }>;
  logger: Logger;
}): Promise<string[]> {
  const failedDeps: string[] = [];

  await pMap(
    previousDependencyVersions,
    async ({ name: depName, previous_version: previousVersion }) => {
      try {
        if (previousVersion === null) {
          const depSORes = await getPackageSavedObjects(savedObjectsClient, {
            searchFields: ['name'],
            search: depName,
            fields: ['is_dependency_of'],
          });
          if (depSORes.saved_objects.length === 0) {
            logger.info(`_rollbackDependencies: ${depName} is already removed, skipping`);
            return;
          }
          const remainingDependants = (
            depSORes.saved_objects[0].attributes.is_dependency_of ?? []
          ).filter((d) => d.name !== pkgName);
          if (remainingDependants.length > 0) {
            logger.info(
              `_rollbackDependencies: keeping ${depName} — still required by ${remainingDependants
                .map((d) => d.name)
                .join(', ')}`
            );
            return;
          }
          await removeInstallation({
            savedObjectsClient,
            pkgName: depName,
            esClient,
            force: true,
            installSource: 'registry',
          });
          logger.info(`_rollbackDependencies: removed freshly-installed dependency ${depName}`);
        } else {
          await installPackage({
            installSource: 'registry',
            savedObjectsClient,
            esClient,
            pkgkey: `${depName}-${previousVersion}`,
            spaceId,
            force: true,
          });
          logger.info(
            `_rollbackDependencies: rolled back dependency ${depName} to ${previousVersion}`
          );
        }
      } catch (err) {
        logger.warn(
          `_rollbackDependencies: failed to roll back dependency ${depName}: ${err.message}`
        );
        failedDeps.push(depName);
      }
    },
    { concurrency: MAX_CONCURRENT_EPM_PACKAGES_INSTALLATIONS }
  );

  return failedDeps;
}

// After rollback, agent policies that no longer have any package with agent version conditions
// may still have stale variant policies (e.g. policy-id#9.2) and agents assigned to them.
// This function tears down those variants for each affected parent policy: agents are
// reassigned to the parent first (so they are never left without a valid policy), then
// has_agent_version_conditions is cleared, then the stale .fleet-policies documents are deleted.
async function cleanupVersionSpecificPoliciesAfterRollback(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  rollbackResult: RollbackResult
) {
  const logger = appContextService.getLogger();

  const parentAgentPolicyIds = uniq(
    Object.values(rollbackResult.updatedPolicies)
      .flat()
      .flatMap((policy) => policy.attributes.policy_ids ?? [])
      .filter((id) => !id.includes(AGENT_POLICY_VERSION_SEPARATOR))
  );

  for (const parentId of parentAgentPolicyIds) {
    const packagePolicies = await packagePolicyService.findAllForAgentPolicy(soClient, parentId);
    const stillHasVersionConditions = packagePolicies.some(
      (pp) => pp.package_agent_version_condition
    );
    if (stillHasVersionConditions) continue;

    const variantKuery = `policy_id:${escapeKuery(parentId)}${AGENT_POLICY_VERSION_SEPARATOR}*`;
    const { total: variantAgentCount } = await getAgentsByKuery(esClient, soClient, {
      kuery: variantKuery,
      showInactive: false,
      perPage: 0,
    });
    if (variantAgentCount > 0) {
      logger.info(
        `[rollback] Reassigning ${variantAgentCount} agents from variant policies of ${parentId} back to parent`
      );
      await reassignAgents(
        soClient,
        esClient,
        { kuery: variantKuery, showInactive: false },
        parentId
      );
    }

    const updatedParent = await agentPolicyService.update(
      soClient,
      esClient,
      parentId,
      {},
      {
        bumpRevision: false,
        skipValidation: true,
      }
    );

    // Only delete variant fleet-policy documents if the recomputed flag is still false.
    // If the rolled-back version has template-level conditions, update() will have set
    // has_agent_version_conditions back to true and those variants are still needed.
    if (!updatedParent.has_agent_version_conditions) {
      await esClient.deleteByQuery({
        index: AGENT_POLICY_INDEX,
        ignore_unavailable: true,
        query: { prefix: { policy_id: `${parentId}${AGENT_POLICY_VERSION_SEPARATOR}` } },
        refresh: true,
      });
    }

    logger.info(
      `[rollback] Cleaned up version-specific policy variants for agent policy ${parentId}`
    );
  }
}

function sendRollbackTelemetry({
  packageName,
  currentVersion,
  previousVersion,
  success,
  errorMessage,
}: {
  packageName: string;
  currentVersion: string;
  previousVersion: string;
  success: boolean;
  errorMessage?: string;
}) {
  const upgradeTelemetry: PackageUpdateEvent = {
    packageName,
    currentVersion,
    newVersion: previousVersion,
    status: success ? 'success' : 'failure',
    eventType: UpdateEventType.PACKAGE_ROLLBACK,
    errorMessage,
  };
  sendTelemetryEvents(
    appContextService.getLogger(),
    appContextService.getTelemetryEventsSender(),
    upgradeTelemetry
  );
  appContextService
    .getLogger()
    .debug(`Send rollback telemetry: ${JSON.stringify(upgradeTelemetry)}`);
}
