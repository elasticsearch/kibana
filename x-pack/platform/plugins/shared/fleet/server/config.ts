/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'path';

import { schema } from '@kbn/config-schema';
import type { TypeOf } from '@kbn/config-schema';
import type { PluginConfigDescriptor } from '@kbn/core/server';

import { isValidExperimentalValue } from '../common/experimental_features';

import {
  PreconfiguredPackagesSchema,
  PreconfiguredAgentPoliciesSchema,
  PreconfiguredOutputsSchema,
  PreconfiguredFleetServerHostsSchema,
  PreconfiguredFleetProxiesSchema,
  PreconfiguredSpaceSettingsSchema,
} from './types';
import { BULK_CREATE_MAX_ARTIFACTS_BYTES } from './services/artifacts/artifacts';

const DEFAULT_BUNDLED_PACKAGE_LOCATION = path.join(__dirname, '../target/bundled_packages');
const DEFAULT_GPG_KEY_PATH = path.join(__dirname, '../target/keys/GPG-KEY-elasticsearch');

const REGISTRY_SPEC_MIN_VERSION = '2.3';
const REGISTRY_SPEC_MAX_VERSION = '3.6';

export const DEFAULT_PRODUCT_VERSIONS_TIMEOUT_MS = 60 * 1000;

export const config: PluginConfigDescriptor = {
  dynamicConfig: {
    experimentalFeatures: true, // To allow to be changed for tests
  },
  exposeToBrowser: {
    epm: true,
    agents: {
      enabled: true,
    },
    agentless: {
      enabled: true,
      isDefault: true,
      customIntegrations: {
        enabled: true,
      },
    },
    enableExperimental: true,
    experimentalFeatures: true,
    developer: {
      maxAgentPoliciesWithInactivityTimeout: true,
    },
    internal: {
      fleetServerStandalone: true,
      activeAgentsSoftLimit: true,
      onlyAllowAgentUpgradeToKnownVersions: true,
      excludeDataStreamTypes: true,
      privateFleetServerHost: true,
      privateElasticsearchHost: true,
    },
    integrationsHomeOverride: true,
    prereleaseEnabledByDefault: true,
    hideDashboards: true,
    isAirGapped: true,
    installIntegrationsKnowledge: true,
  },
  deprecations: ({ renameFromRoot, unused, unusedFromRoot }) => [
    // Unused settings before Fleet server exists
    unused('agents.kibana', { level: 'critical' }),
    unused('agents.maxConcurrentConnections', { level: 'critical' }),
    unused('agents.agentPolicyRolloutRateLimitIntervalMs', { level: 'critical' }),
    unused('agents.agentPolicyRolloutRateLimitRequestPerInterval', { level: 'critical' }),
    unused('agents.pollingRequestTimeout', { level: 'critical' }),
    unused('agents.tlsCheckDisabled', { level: 'critical' }),
    unused('agents.fleetServerEnabled', { level: 'critical' }),
    // Deprecate default policy flags
    (fullConfig, fromPath, addDeprecation) => {
      if (
        (fullConfig?.xpack?.fleet?.agentPolicies || []).find((policy: any) => policy.is_default)
      ) {
        addDeprecation({
          configPath: 'xpack.fleet.agentPolicies.is_default',
          message: `Config key [xpack.fleet.agentPolicies.is_default] is deprecated.`,
          correctiveActions: {
            manualSteps: [`Create a dedicated policy instead through the UI or API.`],
          },
          level: 'warning',
        });
      }
      return fullConfig;
    },
    (fullConfig, fromPath, addDeprecation) => {
      if (
        (fullConfig?.xpack?.fleet?.agentPolicies || []).find(
          (policy: any) => policy.is_default_fleet_server
        )
      ) {
        addDeprecation({
          configPath: 'xpack.fleet.agentPolicies.is_default_fleet_server',
          message: `Config key [xpack.fleet.agentPolicies.is_default_fleet_server] is deprecated.`,
          correctiveActions: {
            manualSteps: [`Create a dedicated fleet server policy instead through the UI or API.`],
          },
          level: 'warning',
        });
      }
      return fullConfig;
    },
    // Renaming elasticsearch.host => elasticsearch.hosts
    (fullConfig, fromPath, addDeprecation) => {
      const oldValue = fullConfig?.xpack?.fleet?.agents?.elasticsearch?.host;
      if (oldValue) {
        delete fullConfig.xpack.fleet.agents.elasticsearch.host;
        fullConfig.xpack.fleet.agents.elasticsearch.hosts = [oldValue];
        addDeprecation({
          configPath: 'xpack.fleet.agents.elasticsearch.host',
          message: `Config key [xpack.fleet.agents.elasticsearch.host] is deprecated and replaced by [xpack.fleet.agents.elasticsearch.hosts]`,
          correctiveActions: {
            manualSteps: [
              `Use [xpack.fleet.agents.elasticsearch.hosts] with an array of host instead.`,
            ],
          },
          level: 'critical',
        });
      }

      return fullConfig;
    },
    // Log invalid experimental values listed in xpack.fleet.enableExperimental
    (fullConfig, fromPath, addDeprecation) => {
      for (const key of fullConfig?.xpack?.fleet?.enableExperimental ?? []) {
        if (!isValidExperimentalValue(key)) {
          addDeprecation({
            configPath: 'xpack.fleet.enableExperimental',
            message: `[${key}] is not a valid fleet experimental feature [xpack.fleet.enableExperimental].`,
            correctiveActions: {
              manualSteps: [
                `Use [xpack.fleet.enableExperimental] with an array of valid experimental features.`,
              ],
            },
            level: 'warning',
          });
        }
      }
    },

    // Prefer using xpack.fleet.experimentalFeatures over xpack.fleet.enableExperimental
    (fullConfig, fromPath, addDeprecation) => {
      if (fullConfig?.xpack?.fleet?.enableExperimental?.length > 0) {
        addDeprecation({
          configPath: 'xpack.fleet.enableExperimental',
          message: `Config key [xpack.fleet.enableExperimental] is deprecated. Please use [xpack.fleet.experimentalFeatures] instead.`,
          correctiveActions: {
            manualSteps: [
              `Use [xpack.fleet.experimentalFeatures] to enable or disable experimental features.`,
            ],
          },
          level: 'warning',
        });
      }
    },

    // Log invalid experimental values listed in xpack.fleet.experimentalFeatures
    (fullConfig, fromPath, addDeprecation) => {
      for (const key of Object.keys(fullConfig?.xpack?.fleet?.experimentalFeatures ?? {})) {
        if (!isValidExperimentalValue(key)) {
          addDeprecation({
            configPath: 'xpack.fleet.experimentalFeatures',
            message: `[${key}] is not a valid fleet experimental feature [xpack.fleet.experimentalFeatures].`,
            correctiveActions: {
              manualSteps: [
                `Use [xpack.fleet.experimentalFeatures] with an object containing valid experimental features.`,
              ],
            },
            level: 'warning',
          });
        }
      }
    },
  ],
  schema: schema.object(
    {
      isAirGapped: schema.maybe(schema.boolean({ defaultValue: false })),
      productVersionsApiTimeoutMs: schema.number({
        defaultValue: DEFAULT_PRODUCT_VERSIONS_TIMEOUT_MS,
        min: 1000,
      }),
      enableDeleteUnenrolledAgents: schema.maybe(schema.boolean({ defaultValue: false })),
      enableManagedLogsAndMetricsDataviews: schema.boolean({ defaultValue: true }),
      registryUrl: schema.maybe(schema.uri({ scheme: ['http', 'https'] })),
      registryProxyUrl: schema.maybe(schema.uri({ scheme: ['http', 'https'] })),
      agents: schema.object({
        enabled: schema.boolean({ defaultValue: true }),
        elasticsearch: schema.object({
          hosts: schema.maybe(schema.arrayOf(schema.uri({ scheme: ['http', 'https'] }))),
          ca_sha256: schema.maybe(schema.string()),
          ca_trusted_fingerprint: schema.maybe(schema.string()),
        }),
        fleet_server: schema.maybe(
          schema.object({
            hosts: schema.maybe(schema.arrayOf(schema.uri({ scheme: ['http', 'https'] }))),
          })
        ),
      }),
      agentless: schema.maybe(
        schema.object({
          enabled: schema.boolean({ defaultValue: false }),
          isDefault: schema.maybe(schema.boolean({ defaultValue: false })),
          api: schema.maybe(
            schema.object({
              url: schema.maybe(schema.uri({ scheme: ['http', 'https'] })),
              tls: schema.maybe(
                schema.object({
                  certificate: schema.maybe(schema.string()),
                  key: schema.maybe(schema.string()),
                  ca: schema.maybe(schema.string()),
                })
              ),
            })
          ),
          deploymentSecrets: schema.maybe(
            schema.object({
              fleetAppToken: schema.maybe(schema.string()),
              elasticsearchAppToken: schema.maybe(schema.string()),
            })
          ),
          customIntegrations: schema.maybe(
            schema.object({
              enabled: schema.maybe(schema.boolean({ defaultValue: false })),
            })
          ),
          backgroundSync: schema.maybe(
            schema.object({
              enabled: schema.boolean({ defaultValue: true }),
              dryRun: schema.boolean({ defaultValue: false }),
              interval: schema.maybe(schema.string({ defaultValue: '10m' })),
            })
          ),
        })
      ),
      packages: PreconfiguredPackagesSchema,
      agentPolicies: PreconfiguredAgentPoliciesSchema,
      outputs: PreconfiguredOutputsSchema,
      fleetServerHosts: PreconfiguredFleetServerHostsSchema,
      proxies: PreconfiguredFleetProxiesSchema,
      spaceSettings: PreconfiguredSpaceSettingsSchema,
      agentIdVerificationEnabled: schema.boolean({ defaultValue: true }),
      eventIngestedEnabled: schema.boolean({ defaultValue: false }),
      setup: schema.maybe(
        schema.object({
          agentPolicySchemaUpgradeBatchSize: schema.maybe(schema.number()),
          uninstallTokenVerificationBatchSize: schema.maybe(schema.number()),
        })
      ),
      /**
       * Startup optimization settings to reduce memory usage during Fleet initialization.
       */
      startupOptimization: schema.maybe(
        schema.object({
          /** Defer package install version bump operations to background tasks */
          deferPackageBumpInstallVersion: schema.boolean({ defaultValue: false }),
          /** Maximum packages to process concurrently during startup */
          maxConcurrentPackageOperations: schema.number({ defaultValue: 10, min: 1, max: 20 }),
          /** Batch size for package upgrade operations */
          packageUpgradeBatchSize: schema.number({ defaultValue: 50, min: 10, max: 200 }),
        })
      ),
      /**
       * Package installation settings to tune ES operation concurrency and error handling.
       */
      packageInstallation: schema.maybe(
        schema.object({
          /** Maximum data stream operations to run concurrently per Kibana node during package installation */
          maxConcurrentDatastreamOperations: schema.number({ defaultValue: 50, min: 1, max: 50 }),
        })
      ),
      developer: schema.object({
        maxAgentPoliciesWithInactivityTimeout: schema.maybe(schema.number()),
        disableRegistryVersionCheck: schema.boolean({ defaultValue: false }),
        allowAgentUpgradeSourceUri: schema.boolean({ defaultValue: false }),
        bundledPackageLocation: schema.string({ defaultValue: DEFAULT_BUNDLED_PACKAGE_LOCATION }),
        disableBundledPackagesCache: schema.boolean({
          defaultValue: false,
        }),
      }),
      packageVerification: schema.object({
        gpgKeyPath: schema.string({ defaultValue: DEFAULT_GPG_KEY_PATH }),
      }),
      /**
       * For internal use. A list of string values (comma delimited) that will enable experimental
       * type of functionality that is not yet released.
       *
       * @example
       * xpack.fleet.enableExperimental:
       *   - feature1
       *   - feature2
       */
      enableExperimental: schema.arrayOf(schema.string(), {
        defaultValue: () => [],
      }),

      /**
       * A record of experimental features that can be enabled or disabled.
       * Keys must be one of the values listed in `allowedExperimentalValues`.
       *
       * @example
       * xpack.fleet.experimentalFeatures:
       *   enableAgentStatusAlerting: false # Disable agent status alerting (enabled by default)
       *   enableAgentPrivilegeLevelChange: true # Enable agent privilege level change (disabled by default)
       */
      experimentalFeatures: schema.recordOf(schema.string(), schema.boolean(), {
        defaultValue: {},
      }),

      internal: schema.object({
        useMeteringApi: schema.boolean({
          defaultValue: false,
        }),
        disableILMPolicies: schema.boolean({
          defaultValue: false,
        }),
        fleetServerStandalone: schema.boolean({
          defaultValue: false,
        }),
        onlyAllowAgentUpgradeToKnownVersions: schema.boolean({
          defaultValue: false,
        }),
        activeAgentsSoftLimit: schema.maybe(
          schema.number({
            min: 0,
          })
        ),
        retrySetupOnBoot: schema.boolean({ defaultValue: true }),
        // Injected by project-controller/kibana-controller when PrivateLink is enabled for this project.
        privateFleetServerHost: schema.maybe(schema.uri({ scheme: ['https'] })),
        privateElasticsearchHost: schema.maybe(schema.uri({ scheme: ['https'] })),
        registry: schema.object(
          {
            kibanaVersionCheckEnabled: schema.boolean({ defaultValue: true }),
            excludePackages: schema.arrayOf(schema.string(), { defaultValue: [] }),
            spec: schema.object(
              {
                min: schema.string({
                  coerceFromNumber: true,
                  defaultValue: REGISTRY_SPEC_MIN_VERSION,
                }),
                max: schema.string({
                  coerceFromNumber: true,
                  defaultValue: REGISTRY_SPEC_MAX_VERSION,
                }),
              },
              {
                defaultValue: {
                  min: REGISTRY_SPEC_MIN_VERSION,
                  max: REGISTRY_SPEC_MAX_VERSION,
                },
              }
            ),
            capabilities: schema.arrayOf(
              schema.oneOf([
                // See package-spec for the list of available capabilities https://github.com/elastic/package-spec/blob/dcc37b652690f8a2bca9cf8a12fc28fd015730a0/spec/integration/manifest.spec.yml#L113
                schema.literal('apm'),
                schema.literal('enterprise_search'),
                schema.literal('observability'),
                schema.literal('security'),
                schema.literal('serverless_search'),
                schema.literal('uptime'),
              ]),
              { defaultValue: [] }
            ),
            searchAiLakePackageAllowlistEnabled: schema.maybe(
              schema.boolean({ defaultValue: false })
            ),
          },
          {
            defaultValue: {
              kibanaVersionCheckEnabled: true,
              capabilities: [],
              excludePackages: [],
              spec: {
                min: REGISTRY_SPEC_MIN_VERSION,
                max: REGISTRY_SPEC_MAX_VERSION,
              },
            },
          }
        ),
        excludeDataStreamTypes: schema.arrayOf(schema.string(), {
          defaultValue: () => [],
        }),
      }),
      enabled: schema.boolean({ defaultValue: true }),
      /**
       * The max size of the artifacts encoded_size sum in a batch when more than one (there is at least one artifact in a batch).
       * @example
       * artifact1.encoded_size = 400
       * artifact2.encoded_size = 600
       * artifact3.encoded_size = 1_200
       * and
       * createArtifactsBulkBatchSize: 1_000
       * then
       * batch1 = [artifact1, artifact2]
       * batch2 = [artifact3]
       */
      createArtifactsBulkBatchSize: schema.maybe(
        schema.number({
          defaultValue: BULK_CREATE_MAX_ARTIFACTS_BYTES,
          max: 4_000_000,
          min: 400,
        })
      ),
      autoUpgrades: schema.maybe(
        schema.object({
          taskInterval: schema.maybe(schema.string()),
          retryDelays: schema.maybe(schema.arrayOf(schema.string())),
        })
      ),
      syncIntegrations: schema.maybe(
        schema.object({
          taskInterval: schema.maybe(schema.string()),
        })
      ),
      agentStatusChange: schema.maybe(
        schema.object({
          taskInterval: schema.maybe(schema.string()),
        })
      ),
      autoInstallContentPackages: schema.maybe(
        schema.object({
          taskInterval: schema.maybe(schema.string()),
        })
      ),
      fleetPolicyRevisionsCleanup: schema.maybe(
        schema.object({
          maxRevisions: schema.number({ min: 1, defaultValue: 10 }),
          interval: schema.string({ defaultValue: '1h' }),
          maxPoliciesPerRun: schema.number({ min: 1, defaultValue: 100 }),
        })
      ),
      versionSpecificPolicyAssignment: schema.maybe(
        schema.object({
          taskInterval: schema.maybe(schema.string()),
        })
      ),
      unenrollInactiveAgents: schema.maybe(
        schema.object({
          taskInterval: schema.maybe(schema.string()),
          gracePeriodMs: schema.maybe(schema.number()),
        })
      ),
      integrationsHomeOverride: schema.maybe(schema.string()),
      prereleaseEnabledByDefault: schema.boolean({ defaultValue: false }),
      hideDashboards: schema.boolean({ defaultValue: false }),
      installIntegrationsKnowledge: schema.maybe(schema.boolean()),
      integrationRollbackTTL: schema.maybe(schema.string()),
    },
    {
      validate: (configToValidate) => {
        const hasDefaultPreconfiguredOuputs = configToValidate.outputs.some(
          (o) => o.is_default || o.is_default_monitoring
        );
        const hasDefaulElasticsearchOutputDefined =
          configToValidate.agents?.elasticsearch?.hosts?.length ?? 0 > 0;

        if (hasDefaulElasticsearchOutputDefined && hasDefaultPreconfiguredOuputs) {
          return 'xpack.fleet.agents.elasticsearch.hosts should not be used when defining default outputs in xpack.fleet.outputs, please remove it.';
        }
      },
    }
  ),
};

export type FleetConfigType = TypeOf<typeof config.schema>;
