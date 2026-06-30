/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { NewPackagePolicy, UpdatePackagePolicyWithId } from '@kbn/fleet-plugin/common';
import type { NewPackagePolicyWithId } from '@kbn/fleet-plugin/server/services/package_policy';
import { cloneDeep } from 'lodash';
import type { SavedObjectError } from '@kbn/core-saved-objects-common';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
import { ALL_SPACES_ID } from '@kbn/spaces-plugin/common/constants';
import { DEFAULT_NAMESPACE_STRING } from '@kbn/core-saved-objects-utils-server';
import { getAgentPoliciesAsInternalUser } from '../../routes/settings/private_locations/get_agent_policies';
import {
  syntheticsMonitorSOTypes,
  syntheticsMonitorSavedObjectType,
  legacySyntheticsMonitorTypeSingle,
} from '../../../common/types/saved_objects';
import {
  BROWSER_TEST_NOW_RUN,
  LIGHTWEIGHT_TEST_NOW_RUN,
} from '../synthetics_monitor/synthetics_monitor_client';
import { scheduleCleanUpTask } from './clean_up_task';
import type { SyntheticsServerSetup } from '../../types';
import { formatSyntheticsPolicy } from '../formatters/private_formatters/format_synthetics_policy';
import type {
  HeartbeatConfig,
  MonitorFields,
  PrivateLocation,
} from '../../../common/runtime_types';
import {
  ConfigKey,
  SourceType,
  type SyntheticsPrivateLocations,
} from '../../../common/runtime_types';
import { stringifyString } from '../formatters/private_formatters/formatting_utils';
import type { PrivateLocationAttributes } from '../../runtime_types/private_locations';
import { PackagePolicyService } from './package_policy_service';

export interface PrivateConfig {
  config: HeartbeatConfig;
  globalParams: Record<string, string>;
}

export interface FailedPolicyUpdate {
  packagePolicy: NewPackagePolicyWithId;
  config?: HeartbeatConfig;
  error?: Error | SavedObjectError;
}

export class SyntheticsPrivateLocation {
  private readonly server: SyntheticsServerSetup;
  private readonly packagePolicyService: PackagePolicyService;

  constructor(_server: SyntheticsServerSetup) {
    this.server = _server;
    this.packagePolicyService = new PackagePolicyService(_server);
  }

  async buildNewPolicy(spaceId: string): Promise<NewPackagePolicy> {
    const newPolicy = await this.packagePolicyService.buildPackagePolicyFromPackage({ spaceId });

    if (!newPolicy) {
      throw new Error(`Unable to create Synthetics package policy template for private location`);
    }

    return newPolicy;
  }

  /**
   * Returns the new (space-agnostic) policy ID format.
   * Format: `${configId}-${locationId}`
   * This removes the spaceId dependency to support multispace monitors.
   */
  getPolicyId(config: { origin?: string; id: string }, locId: string) {
    return `${config.id}-${locId}`;
  }

  getPolicyName(config: { id: string; origin?: string; name: string }, locName: string) {
    if (config.origin === SourceType.PROJECT) {
      return `${config.id}-${locName}`;
    }
    return `${config.name}-${locName}`;
  }

  async getPolicyNamespace(configNamespace: string) {
    if (configNamespace && configNamespace !== DEFAULT_NAMESPACE_STRING) {
      return configNamespace;
    }
    return undefined;
  }

  /**
   * Checks whether new-format or legacy-format policy IDs exist for a given monitor + location.
   *
   * Finds legacy IDs (`{configId}-{locationId}-{spaceId}`) via prefix match + suffix
   * validation against known spaces. Suffix validation uses O(1) Set lookup, keeping
   * performance identical to plain prefix matching regardless of space count.
   *
   * This prevents most false positives — e.g. monitor "monitor-a" / location "loc-b"
   * won't match policies for monitor "monitor-a-loc-b", because the suffix after
   * "monitor-a-loc-b-" won't be a known space. A residual ambiguity remains when space IDs contain dashes (inherent to
   * the dash-separated legacy format), but is unlikely in practice since it
   * requires monitor IDs, location IDs, and space names to overlap in a specific way.
   */
  getPolicyIdFormatInfo(
    config: { id: string },
    locationId: string,
    existingPolicies: Array<{ id: string }> | undefined,
    allSpaces: Set<string>
  ): { hasNewFormatPolicyId: boolean; hasAnyLegacyPolicyId: boolean; legacyPolicyIds: string[] } {
    const newId = this.getPolicyId(config, locationId);
    const hasNewFormatPolicyId = existingPolicies?.some((policy) => policy.id === newId) ?? false;

    const legacyIdPrefix = `${config.id}-${locationId}-`;
    const legacyPolicyIds =
      existingPolicies
        ?.filter((policy) => {
          if (!policy.id.startsWith(legacyIdPrefix)) return false;
          const spaceId = policy.id.slice(legacyIdPrefix.length);
          return allSpaces.has(spaceId);
        })
        .map((policy) => policy.id) ?? [];
    const hasAnyLegacyPolicyId = legacyPolicyIds.length > 0;

    return { hasNewFormatPolicyId, hasAnyLegacyPolicyId, legacyPolicyIds };
  }

  /**
   * Returns the legacy policy ID format that included spaceId.
   * Format: `${configId}-${locationId}-${spaceId}`
   * Used for backward compatibility when looking up existing policies.
   */
  getLegacyPolicyId(configId: string, locId: string, spaceId: string) {
    return `${configId}-${locId}-${spaceId}`;
  }

  getLegacyPolicyIdsForAllSpaces(configId: string, locId: string, allSpaces: Set<string>) {
    return [...allSpaces].map((space) => this.getLegacyPolicyId(configId, locId, space));
  }

  /**
   * Gets all unique spaces that have any synthetics monitors.
   */
  async getAllSpacesWithMonitors(): Promise<string[]> {
    const soClient = this.server.coreStart.savedObjects.createInternalRepository();
    const spaces = new Set<string>();

    try {
      const result = await soClient.find<
        unknown,
        {
          namespaces: {
            buckets: Array<{ key: string; doc_count: number }>;
          };
          legacyNamespaces: {
            buckets: Array<{ key: string; doc_count: number }>;
          };
        }
      >({
        type: syntheticsMonitorSOTypes,
        perPage: 0,
        namespaces: [ALL_SPACES_ID],
        fields: [],
        aggs: {
          namespaces: {
            terms: { field: `${syntheticsMonitorSavedObjectType}.namespaces`, size: 1000 },
          },
          legacyNamespaces: {
            terms: { field: `${legacySyntheticsMonitorTypeSingle}.namespaces`, size: 1000 },
          },
        },
      });

      result.aggregations?.namespaces?.buckets?.forEach((bucket) => {
        spaces.add(bucket.key);
      });
      result.aggregations?.legacyNamespaces?.buckets?.forEach((bucket) => {
        spaces.add(bucket.key);
      });
    } catch (e) {
      this.server.logger.error(
        `Error fetching spaces with monitors. Legacy package policies will not be removed: ${e.message}`
      );
    }

    return [...spaces];
  }

  async generateNewPolicy(
    config: HeartbeatConfig,
    privateLocation: PrivateLocation,
    newPolicyTemplate: NewPackagePolicy,
    spaceId: string,
    globalParams: Record<string, string>,
    maintenanceWindows: MaintenanceWindow[],
    testRunId?: string,
    runOnce?: boolean
  ): Promise<NewPackagePolicy | null> {
    const { label: locName } = privateLocation;

    const newPolicy = cloneDeep(newPolicyTemplate);

    try {
      newPolicy.is_managed = true;
      newPolicy.policy_id = privateLocation.agentPolicyId;
      newPolicy.policy_ids = [privateLocation.agentPolicyId];
      if (testRunId) {
        newPolicy.name =
          config.type === 'browser' ? BROWSER_TEST_NOW_RUN : LIGHTWEIGHT_TEST_NOW_RUN;
      } else {
        newPolicy.name = this.getPolicyName(config, locName);
      }
      const configNamespace = config[ConfigKey.NAMESPACE];

      newPolicy.namespace = await this.getPolicyNamespace(configNamespace);

      const { formattedPolicy } = formatSyntheticsPolicy(
        newPolicy,
        config.type,
        {
          ...(config as Partial<MonitorFields>),
          space_id: spaceId,
          config_id: config.fields?.config_id,
          location_name: stringifyString(privateLocation.label),
          location_id: privateLocation.id,
          'monitor.project.id':
            config.fields?.['monitor.project.id'] ?? config[ConfigKey.PROJECT_ID],
          'monitor.project.name':
            config.fields?.['monitor.project.name'] ?? config[ConfigKey.PROJECT_ID],
          ...(testRunId
            ? {
                test_run_id: testRunId,
                'monitor.id': config[ConfigKey.MONITOR_QUERY_ID],
                id: testRunId,
              }
            : {}),
          ...(runOnce ? { run_once: runOnce } : {}),
          ...(config.fields?.kibanaUrl ? { kibanaUrl: config.fields.kibanaUrl } : {}),
        },
        globalParams,
        maintenanceWindows
      );

      return formattedPolicy;
    } catch (e) {
      this.server.logger.error(e);
      return null;
    }
  }

  async createPackagePolicies(
    configs: PrivateConfig[],
    privateLocations: SyntheticsPrivateLocations,
    spaceId: string,
    maintenanceWindows: MaintenanceWindow[],
    testRunId?: string,
    runOnce?: boolean
  ) {
    if (configs.length === 0) {
      return { created: [], failed: [] };
    }
    const newPolicies: NewPackagePolicyWithId[] = [];
    const newPolicyTemplate = await this.buildNewPolicy(spaceId);

    for (const { config, globalParams } of configs) {
      try {
        const { locations } = config;
        const fleetManagedLocations = locations.filter((loc) => !loc.isServiceManaged);

        for (const privateLocation of fleetManagedLocations) {
          const location = privateLocations?.find((loc) => loc.id === privateLocation.id)!;
          if (!location) {
            throw new Error(
              `Unable to find Synthetics private location for agentId ${privateLocation.id}`
            );
          }

          const newPolicy = await this.generateNewPolicy(
            config,
            location,
            newPolicyTemplate,
            spaceId,
            globalParams,
            maintenanceWindows,
            testRunId,
            runOnce
          );

          if (!newPolicy) {
            throw new Error(
              `Unable to create Synthetics package policy for monitor ${
                config[ConfigKey.NAME]
              } with private location ${location.label}`
            );
          }
          if (newPolicy) {
            if (testRunId) {
              newPolicies.push(newPolicy as NewPackagePolicyWithId);
            } else {
              newPolicies.push({
                ...newPolicy,
                id: this.getPolicyId(config, location.id),
              });
            }
          }
        }
      } catch (e) {
        this.server.logger.error(e);
        throw e;
      }
    }

    if (newPolicies.length === 0) {
      throw new Error('Failed to build package policies for all monitors');
    }

    try {
      const result = await this.packagePolicyService.bulkCreate({
        newPolicies,
        spaceId,
      });
      if (result?.created && result?.created?.length > 0 && testRunId) {
        // ignore await here, we don't want to wait for this to finish
        void scheduleCleanUpTask(this.server);
      }
      return result;
    } catch (e) {
      this.server.logger.error(e);
      throw e;
    }
  }

  async inspectPackagePolicy({
    privateConfig,
    spaceId,
    allPrivateLocations,
    maintenanceWindows,
  }: {
    privateConfig?: PrivateConfig;
    allPrivateLocations: PrivateLocationAttributes[];
    spaceId: string;
    maintenanceWindows: MaintenanceWindow[];
  }) {
    if (!privateConfig) {
      return null;
    }
    const newPolicyTemplate = await this.buildNewPolicy(spaceId);

    const { config, globalParams } = privateConfig;
    try {
      const { locations } = config;

      const privateLocation = locations.find((loc) => !loc.isServiceManaged);

      const location = allPrivateLocations?.find((loc) => loc.id === privateLocation?.id)!;

      const newPolicy = await this.generateNewPolicy(
        config,
        location,
        newPolicyTemplate,
        spaceId,
        globalParams,
        maintenanceWindows
      );

      const pkgPolicy = {
        ...newPolicy,
        id: this.getPolicyId(config, location.id),
      } as NewPackagePolicyWithId;

      return await this.packagePolicyService.inspect({
        spaceId,
        packagePolicy: pkgPolicy,
      });
    } catch (e) {
      this.server.logger.error(e);
      return null;
    }
  }

  async editMonitors(
    configs: Array<{ config: HeartbeatConfig; globalParams: Record<string, string> }>,
    allPrivateLocations: SyntheticsPrivateLocations,
    spaceId: string,
    maintenanceWindows: MaintenanceWindow[]
  ) {
    if (configs.length === 0) {
      return {
        failedUpdates: [],
      };
    }

    const [newPolicyTemplate, { policies: existingPolicies, allSpaces }] = await Promise.all([
      this.buildNewPolicy(spaceId),
      this.getExistingPolicies(
        configs.map(({ config }) => config),
        allPrivateLocations,
        spaceId
      ),
    ]);

    const policiesToUpdate: UpdatePackagePolicyWithId[] = [];
    const policiesToCreate: NewPackagePolicyWithId[] = [];
    const policiesToDelete: string[] = [];

    for (const { config, globalParams } of configs) {
      const { locations } = config;

      const monitorPrivateLocations = locations.filter((loc) => !loc.isServiceManaged);

      for (const privateLocation of allPrivateLocations) {
        const hasLocation = monitorPrivateLocations?.some((loc) => loc.id === privateLocation.id);
        const newId = this.getPolicyId(config, privateLocation.id);
        const { hasNewFormatPolicyId, hasAnyLegacyPolicyId, legacyPolicyIds } =
          this.getPolicyIdFormatInfo(config, privateLocation.id, existingPolicies, allSpaces);
        const hasPolicy = hasNewFormatPolicyId || hasAnyLegacyPolicyId;

        try {
          if (hasLocation) {
            const newPolicy = await this.generateNewPolicy(
              config,
              privateLocation,
              newPolicyTemplate,
              spaceId,
              globalParams,
              maintenanceWindows
            );

            if (!newPolicy) {
              throwAddEditError(hasPolicy, privateLocation.label);
            }

            if (hasNewFormatPolicyId) {
              policiesToUpdate.push({ ...newPolicy, id: newId } as UpdatePackagePolicyWithId);
              policiesToDelete.push(...legacyPolicyIds);
            } else if (hasAnyLegacyPolicyId) {
              policiesToDelete.push(...legacyPolicyIds);
              policiesToCreate.push({ ...newPolicy, id: newId } as NewPackagePolicyWithId);
            } else {
              policiesToCreate.push({ ...newPolicy, id: newId } as NewPackagePolicyWithId);
            }
          } else {
            if (hasNewFormatPolicyId) {
              policiesToDelete.push(newId);
            }
            policiesToDelete.push(...legacyPolicyIds);
          }
        } catch (e) {
          this.server.logger.error(e);
          throwAddEditError(hasPolicy, privateLocation.label, config[ConfigKey.NAME]);
        }
      }
    }

    const uniqueToDelete = [...new Set(policiesToDelete)];

    this.server.logger.debug(
      `[editingMonitors] Creating ${policiesToCreate.length} policies (${policiesToCreate
        .map((p) => p.id)
        .join(', ')}), updating ${policiesToUpdate.length} policies, deleting ${
        uniqueToDelete.length
      } policies (${uniqueToDelete.join(', ')})`
    );

    const createResponse = await this.packagePolicyService.bulkCreate({
      newPolicies: policiesToCreate,
      spaceId,
    });

    if (createResponse.failed.length > 0) {
      this.server.logger.error(
        `[editingMonitors] Failed to create ${
          createResponse.failed.length
        } package policies: ${JSON.stringify(
          createResponse.failed.map(({ packagePolicy, error }) => ({
            id: (packagePolicy as NewPackagePolicyWithId).id,
            error: error?.message ?? error,
          }))
        )}`
      );
    }

    const [failedUpdatesRes] = await Promise.all([
      this.packagePolicyService.bulkUpdate({
        policiesToUpdate,
        spaceId,
      }),
      this.packagePolicyService.bulkDelete({
        policyIdsToDelete: uniqueToDelete,
        spaceId,
      }),
    ]);

    const failedUpdates = failedUpdatesRes?.map(({ packagePolicy, error }) => {
      const policyConfig = configs.find(({ config }) => {
        const { locations } = config;

        const monitorPrivateLocations = locations.filter((loc) => !loc.isServiceManaged);
        for (const privateLocation of monitorPrivateLocations) {
          const currId = this.getPolicyId(config, privateLocation.id);
          return currId === packagePolicy.id;
        }
      });
      return {
        error,
        packagePolicy,
        config: policyConfig?.config,
      };
    });

    return {
      failedUpdates,
      failedCreates: createResponse.failed,
    };
  }

  /**
   * Fetches existing package policies for the given configs and locations.
   * Looks for new (space-agnostic) format and legacy format for all spaces
   * that have any synthetics monitors.
   */
  async getExistingPolicies(
    configs: HeartbeatConfig[],
    allPrivateLocations: SyntheticsPrivateLocations,
    spaceId: string
  ) {
    const allSpacesWithMonitors = await this.getAllSpacesWithMonitors();
    const allSpaces = new Set([spaceId, ...allSpacesWithMonitors]);
    const policyIdsToFetch = new Set<string>();

    for (const config of configs) {
      for (const privateLocation of allPrivateLocations) {
        policyIdsToFetch.add(this.getPolicyId(config, privateLocation.id));
        this.getLegacyPolicyIdsForAllSpaces(config.id, privateLocation.id, allSpaces).forEach(
          (id) => policyIdsToFetch.add(id)
        );
      }
    }

    const policies = await this.packagePolicyService.getByIds({
      spaceId,
      packagePolicyIds: Array.from(policyIdsToFetch),
    });

    return { policies, allSpaces };
  }

  async deleteMonitors(configs: HeartbeatConfig[], spaceId: string) {
    const allSpacesWithMonitors = await this.getAllSpacesWithMonitors();
    const allSpaces = new Set([spaceId, ...allSpacesWithMonitors]);

    const policyIdsToFetch = new Set<string>();
    for (const config of configs) {
      const monitorPrivateLocations = config.locations.filter((loc) => !loc.isServiceManaged);
      for (const privateLocation of monitorPrivateLocations) {
        policyIdsToFetch.add(this.getPolicyId(config, privateLocation.id));
        this.getLegacyPolicyIdsForAllSpaces(config.id, privateLocation.id, allSpaces).forEach(
          (id) => policyIdsToFetch.add(id)
        );
      }
    }

    const existingPolicies = await this.packagePolicyService.getByIds({
      spaceId,
      packagePolicyIds: Array.from(policyIdsToFetch),
    });

    const policyIdsToDelete = new Set<string>();
    for (const config of configs) {
      const monitorPrivateLocations = config.locations.filter((loc) => !loc.isServiceManaged);
      for (const privateLocation of monitorPrivateLocations) {
        const { hasNewFormatPolicyId, legacyPolicyIds } = this.getPolicyIdFormatInfo(
          config,
          privateLocation.id,
          existingPolicies,
          allSpaces
        );
        if (hasNewFormatPolicyId) {
          policyIdsToDelete.add(this.getPolicyId(config, privateLocation.id));
        }
        legacyPolicyIds.forEach((id) => policyIdsToDelete.add(id));
      }
    }

    if (policyIdsToDelete.size > 0) {
      const result = await this.packagePolicyService.bulkDelete({
        policyIdsToDelete: Array.from(policyIdsToDelete),
        spaceId,
      });
      const failedPolicies = result?.filter((policy) => {
        return policy && !policy.success && policy?.statusCode !== 404;
      });
      if (failedPolicies?.length === policyIdsToDelete.size) {
        throw new Error(deletePolicyError(configs[0][ConfigKey.NAME]));
      }
      return result;
    }
  }

  async getAgentPolicies() {
    return getAgentPoliciesAsInternalUser({ server: this.server, spaceId: ALL_SPACES_ID });
  }
}

const throwAddEditError = (hasPolicy: boolean, location?: string, name?: string) => {
  throw new Error(
    `Unable to ${hasPolicy ? 'update' : 'create'} Synthetics package policy ${
      name ? 'for monitor ' + name : ''
    } for private location: ${location}`
  );
};

const deletePolicyError = (name: string, location?: string) => {
  return `Unable to delete Synthetics package policy for monitor ${name} with private location ${location}`;
};
