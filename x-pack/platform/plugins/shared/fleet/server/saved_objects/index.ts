/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsServiceSetup, SavedObjectsType } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';

import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';

import {
  LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  CLOUD_CONNECTOR_SAVED_OBJECT_TYPE,
  CLOUD_ONBOARDING_DEPLOYMENT_SAVED_OBJECT_TYPE,
} from '../../common/constants';

import {
  OUTPUT_SAVED_OBJECT_TYPE,
  LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
  AGENT_POLICY_SAVED_OBJECT_TYPE,
  PACKAGES_SAVED_OBJECT_TYPE,
  ASSETS_SAVED_OBJECT_TYPE,
  GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
  PRECONFIGURATION_DELETION_RECORD_SAVED_OBJECT_TYPE,
  DOWNLOAD_SOURCE_SAVED_OBJECT_TYPE,
  FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
  FLEET_PROXY_SAVED_OBJECT_TYPE,
  MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE,
  INGEST_SAVED_OBJECT_INDEX,
  UNINSTALL_TOKENS_SAVED_OBJECT_TYPE,
  FLEET_SETUP_LOCK_TYPE,
  SPACE_SETTINGS_SAVED_OBJECT_TYPE,
} from '../constants';

import {
  AgentPolicySchemaV3,
  AgentPolicySchemaV4,
  AgentPolicySchemaV5,
  AgentPolicySchemaV6,
  EpmPackagesSchemaV6,
  EpmPackagesSchemaV7,
  EpmPackagesSchemaV8,
  EpmPackagesSchemaV9,
  EpmPackagesSchemaV10,
  EpmPackagesSchemaV11,
  SettingsSchemaV5,
  SettingsSchemaV6,
  SettingsSchemaV7,
  SettingsSchemaV8,
  PackagePolicySchemaV22,
  PackagePolicySchemaV24,
  PackagePolicySchemaV25,
  CloudConnectorSchemaV4,
  CloudOnboardingDeploymentSchemaV1,
} from '../types';

import { migrateSyntheticsPackagePolicyToV8120 } from './migrations/synthetics/to_v8_12_0';

import {
  migratePackagePolicyEvictionsFromV8110,
  migratePackagePolicyToV8110,
} from './migrations/security_solution/to_v8_11_0';

import { migrateCspPackagePolicyToV8110 } from './migrations/cloud_security_posture';

import { migrateOutputEvictionsFromV8100, migrateOutputToV8100 } from './migrations/to_v8_10_0';

import { migrateSyntheticsPackagePolicyToV8100 } from './migrations/synthetics/to_v8_10_0';

import { migratePackagePolicyEvictionsFromV8100 } from './migrations/security_solution/to_v8_10_0';

import {
  migrateAgentPolicyToV7100,
  migratePackagePolicyToV7100,
  migrateSettingsToV7100,
} from './migrations/to_v7_10_0';

import { migratePackagePolicyToV7110 } from './migrations/to_v7_11_0';

import { migrateAgentPolicyToV7120, migratePackagePolicyToV7120 } from './migrations/to_v7_12_0';
import {
  migratePackagePolicyToV7130,
  migrateSettingsToV7130,
  migrateOutputToV7130,
} from './migrations/to_v7_13_0';
import { migratePackagePolicyToV7140, migrateInstallationToV7140 } from './migrations/to_v7_14_0';
import { migratePackagePolicyToV7150 } from './migrations/to_v7_15_0';
import { migrateInstallationToV7160, migratePackagePolicyToV7160 } from './migrations/to_v7_16_0';
import { migrateInstallationToV800, migrateOutputToV800 } from './migrations/to_v8_0_0';
import { migratePackagePolicyToV820 } from './migrations/to_v8_2_0';
import { migrateInstallationToV830, migratePackagePolicyToV830 } from './migrations/to_v8_3_0';
import {
  migrateInstallationToV840,
  migrateAgentPolicyToV840,
  migratePackagePolicyToV840,
} from './migrations/to_v8_4_0';
import { migratePackagePolicyToV850, migrateAgentPolicyToV850 } from './migrations/to_v8_5_0';
import {
  migrateSettingsToV860,
  migrateInstallationToV860,
  migratePackagePolicyToV860,
} from './migrations/to_v8_6_0';
import {
  migratePackagePolicyAddAntivirusRegistrationModeToV8140,
  migratePackagePolicyToV8100,
  migratePackagePolicyToV8140,
  migratePackagePolicyEnableCapsToV8140,
  migratePackagePolicyToV870,
} from './migrations/security_solution';
import { migratePackagePolicyToV880 } from './migrations/to_v8_8_0';
import { migrateAgentPolicyToV890 } from './migrations/to_v8_9_0';
import {
  migratePackagePolicyToV81102,
  migratePackagePolicyEvictionsFromV81102,
} from './migrations/security_solution/to_v8_11_0_2';
import { settingsV1 } from './model_versions/settings_v1';
import {
  packagePolicyV13AdvancedFields,
  packagePolicyV10OnWriteScanFix,
} from './model_versions/security_solution';
import {
  migratePackagePolicyIdsToV8150,
  migratePackagePolicySetRequiresRootToV8150,
} from './migrations/to_v8_15_0';
import { backfillAgentPolicyToV4 } from './model_versions/agent_policy_v4';
import { backfillOutputPolicyToV7 } from './model_versions/outputs';
import { packagePolicyV17AdvancedFieldsForEndpointV818 } from './model_versions/security_solution/v17_advanced_package_policy_fields';
import { backfillPackagePolicyLatestRevision } from './model_versions/package_policy_latest_revision_backfill';
import { disableBrowserInputWhenBothEnabled } from './model_versions/synthetics_disable_browser_input';

/*
 * Saved object types and mappings
 *
 * Please update typings in `/common/types` as well as
 * schemas in `/server/types` if mappings are updated.
 */
export const getSavedObjectTypes = (
  options = { useSpaceAwareness: false }
): { [key: string]: SavedObjectsType } => {
  const { useSpaceAwareness } = options;

  return {
    [FLEET_SETUP_LOCK_TYPE]: {
      name: FLEET_SETUP_LOCK_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        properties: {
          status: { type: 'keyword' },
          uuid: { type: 'text' },
          started_at: { type: 'date' },
        },
      },
    },
    [SPACE_SETTINGS_SAVED_OBJECT_TYPE]: {
      name: SPACE_SETTINGS_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'single',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {},
      },
    },
    // Deprecated
    [GLOBAL_SETTINGS_SAVED_OBJECT_TYPE]: {
      name: GLOBAL_SETTINGS_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        properties: {
          fleet_server_hosts: { type: 'keyword' },
          has_seen_add_data_notice: { type: 'boolean', index: false },
          prerelease_integrations_enabled: { type: 'boolean' },
          secret_storage_requirements_met: { type: 'boolean' },
          output_secret_storage_requirements_met: { type: 'boolean' },
          use_space_awareness_migration_status: { type: 'keyword', index: false },
          use_space_awareness_migration_started_at: { type: 'date', index: false },
          delete_unenrolled_agents: {
            properties: {
              enabled: { type: 'boolean', index: false },
              is_preconfigured: { type: 'boolean', index: false },
            },
          },
          action_secret_storage_requirements_met: { type: 'boolean' },
          ilm_migration_status: {
            dynamic: false,
            properties: {},
          },
          integration_knowledge_enabled: { type: 'boolean' },
          ssl_secret_storage_requirements_met: { type: 'boolean' },
          download_source_auth_secret_storage_requirements_met: { type: 'boolean' },
        },
      },
      migrations: {
        '7.10.0': migrateSettingsToV7100,
        '7.13.0': migrateSettingsToV7130,
        '8.6.0': migrateSettingsToV860,
      },
      modelVersions: {
        1: settingsV1,
        2: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                use_space_awareness_migration_status: { type: 'keyword', index: false },
                use_space_awareness_migration_started_at: { type: 'date', index: false },
              },
            },
          ],
        },
        3: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                delete_unenrolled_agents: {
                  properties: {
                    enabled: { type: 'boolean', index: false },
                    is_preconfigured: { type: 'boolean', index: false },
                  },
                },
              },
            },
          ],
        },
        4: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                action_secret_storage_requirements_met: { type: 'boolean' },
              },
            },
          ],
        },
        5: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                ilm_migration_status: {
                  dynamic: false,
                  properties: {},
                },
              },
            },
          ],
          schemas: {
            forwardCompatibility: SettingsSchemaV5.extends({}, { unknowns: 'ignore' }),
            create: SettingsSchemaV5,
          },
        },
        6: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                ssl_secret_storage_requirements_met: { type: 'boolean' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: SettingsSchemaV6.extends({}, { unknowns: 'ignore' }),
            create: SettingsSchemaV6,
          },
        },
        7: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                integration_knowledge_enabled: { type: 'boolean' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: SettingsSchemaV7.extends({}, { unknowns: 'ignore' }),
            create: SettingsSchemaV7,
          },
        },
        8: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                download_source_auth_secret_storage_requirements_met: { type: 'boolean' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: SettingsSchemaV8.extends({}, { unknowns: 'ignore' }),
            create: SettingsSchemaV8,
          },
        },
      },
    },
    [LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE]: {
      name: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          name: { type: 'keyword' },
          schema_version: { type: 'version' },
          description: { type: 'text' },
          namespace: { type: 'keyword' },
          is_managed: { type: 'boolean' },
          is_default: { type: 'boolean' },
          is_default_fleet_server: { type: 'boolean' },
          status: { type: 'keyword' },
          unenroll_timeout: { type: 'integer' },
          inactivity_timeout: { type: 'integer' },
          updated_at: { type: 'date' },
          updated_by: { type: 'keyword' },
          revision: { type: 'integer' },
          monitoring_enabled: { type: 'keyword', index: false },
          is_preconfigured: { type: 'keyword' },
          data_output_id: { type: 'keyword' },
          monitoring_output_id: { type: 'keyword' },
          download_source_id: { type: 'keyword' },
          fleet_server_host_id: { type: 'keyword' },
          agent_features: {
            properties: {
              name: { type: 'keyword' },
              enabled: { type: 'boolean' },
            },
          },
          is_protected: { type: 'boolean' },
          overrides: { type: 'flattened', index: false },
          keep_monitoring_alive: { type: 'boolean' },
          advanced_settings: { type: 'flattened', index: false },
          supports_agentless: { type: 'boolean' },
          global_data_tags: { type: 'flattened', index: false },
          agentless: {
            dynamic: false,
            properties: {},
          },
          monitoring_pprof_enabled: { type: 'boolean', index: false },
          monitoring_http: { type: 'flattened', index: false },
          monitoring_diagnostics: { type: 'flattened', index: false },
          required_versions: { type: 'flattened', index: false },
          has_agent_version_conditions: { type: 'boolean' },
          is_verifier: { type: 'boolean' },
          min_agent_version: { type: 'keyword' },
          package_agent_version_conditions: { dynamic: false, properties: {} },
        },
      },
      migrations: {
        '7.10.0': migrateAgentPolicyToV7100,
        '7.12.0': migrateAgentPolicyToV7120,
        '8.4.0': migrateAgentPolicyToV840,
        '8.5.0': migrateAgentPolicyToV850,
        '8.9.0': migrateAgentPolicyToV890,
      },
      modelVersions: {
        '1': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                advanced_settings: { type: 'flattened', index: false },
              },
            },
          ],
        },
        '2': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                supports_agentless: { type: 'boolean' },
              },
            },
          ],
        },
        '3': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                global_data_tags: { type: 'flattened', index: false },
              },
            },
          ],
        },
        '4': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                monitoring_pprof_enabled: { type: 'boolean', index: false },
                monitoring_http: { type: 'flattened', index: false },
                monitoring_diagnostics: { type: 'flattened', index: false },
              },
            },
            {
              type: 'data_backfill',
              backfillFn: backfillAgentPolicyToV4,
            },
          ],
        },
        '5': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {},
            },
          ],
        },
        '6': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                agentless: {
                  dynamic: false,
                  properties: {},
                },
              },
            },
          ],
        },
        '7': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                required_versions: { type: 'flattened', index: false },
              },
            },
          ],
        },
        '8': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                has_agent_version_conditions: { type: 'boolean' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: AgentPolicySchemaV3.extends({}, { unknowns: 'ignore' }),
            create: AgentPolicySchemaV3.extends({}, { unknowns: 'ignore' }),
          },
        },
        '9': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                min_agent_version: { type: 'keyword' },
                package_agent_version_conditions: { dynamic: false, properties: {} },
              },
            },
          ],
          schemas: {
            forwardCompatibility: AgentPolicySchemaV4.extends({}, { unknowns: 'ignore' }),
            create: AgentPolicySchemaV4.extends({}, { unknowns: 'ignore' }),
          },
        },
        '10': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                is_verifier: { type: 'boolean' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: AgentPolicySchemaV5.extends({}, { unknowns: 'ignore' }),
            create: AgentPolicySchemaV5.extends({}, { unknowns: 'ignore' }),
          },
        },
        '11': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {},
            },
          ],
          schemas: {
            forwardCompatibility: AgentPolicySchemaV6.extends({}, { unknowns: 'ignore' }),
            create: AgentPolicySchemaV6.extends({}, { unknowns: 'ignore' }),
          },
        },
      },
    },
    [AGENT_POLICY_SAVED_OBJECT_TYPE]: {
      name: AGENT_POLICY_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'multiple',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          name: { type: 'keyword' },
          schema_version: { type: 'version' },
          description: { type: 'text' },
          namespace: { type: 'keyword' },
          is_managed: { type: 'boolean' },
          is_default: { type: 'boolean' },
          is_default_fleet_server: { type: 'boolean' },
          status: { type: 'keyword' },
          unenroll_timeout: { type: 'integer' },
          inactivity_timeout: { type: 'integer' },
          updated_at: { type: 'date' },
          updated_by: { type: 'keyword' },
          revision: { type: 'integer' },
          monitoring_enabled: { type: 'keyword', index: false },
          is_preconfigured: { type: 'keyword' },
          data_output_id: { type: 'keyword' },
          monitoring_output_id: { type: 'keyword' },
          download_source_id: { type: 'keyword' },
          fleet_server_host_id: { type: 'keyword' },
          agent_features: {
            properties: {
              name: { type: 'keyword' },
              enabled: { type: 'boolean' },
            },
          },
          is_protected: { type: 'boolean' },
          overrides: { type: 'flattened', index: false },
          keep_monitoring_alive: { type: 'boolean' },
          advanced_settings: { type: 'flattened', index: false },
          supports_agentless: { type: 'boolean' },
          global_data_tags: { type: 'flattened', index: false },
          agentless: {
            dynamic: false,
            properties: {},
          },
          required_versions: { type: 'flattened', index: false },
          has_agent_version_conditions: { type: 'boolean' },
          is_verifier: { type: 'boolean' },
          min_agent_version: { type: 'keyword' },
          package_agent_version_conditions: { dynamic: false, properties: {} },
        },
      },
      modelVersions: {
        '1': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {},
            },
          ],
        },
        '2': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                required_versions: { type: 'flattened', index: false },
              },
            },
          ],
        },
        '3': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                has_agent_version_conditions: { type: 'boolean' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: AgentPolicySchemaV3.extends({}, { unknowns: 'ignore' }),
            create: AgentPolicySchemaV3.extends({}, { unknowns: 'ignore' }),
          },
        },
        '4': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                min_agent_version: { type: 'keyword' },
                package_agent_version_conditions: { dynamic: false, properties: {} },
              },
            },
          ],
          schemas: {
            forwardCompatibility: AgentPolicySchemaV4.extends({}, { unknowns: 'ignore' }),
            create: AgentPolicySchemaV4.extends({}, { unknowns: 'ignore' }),
          },
        },
        '5': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                is_verifier: { type: 'boolean' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: AgentPolicySchemaV5.extends({}, { unknowns: 'ignore' }),
            create: AgentPolicySchemaV5.extends({}, { unknowns: 'ignore' }),
          },
        },
        '6': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {},
            },
          ],
          schemas: {
            forwardCompatibility: AgentPolicySchemaV6.extends({}, { unknowns: 'ignore' }),
            create: AgentPolicySchemaV6.extends({}, { unknowns: 'ignore' }),
          },
        },
      },
    },
    [OUTPUT_SAVED_OBJECT_TYPE]: {
      name: OUTPUT_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          output_id: { type: 'keyword', index: false },
          name: { type: 'keyword' },
          type: { type: 'keyword' },
          is_default: { type: 'boolean' },
          is_default_monitoring: { type: 'boolean' },
          hosts: { type: 'keyword' },
          ca_sha256: { type: 'keyword', index: false },
          ca_trusted_fingerprint: { type: 'keyword', index: false },
          service_token: { type: 'keyword', index: false },
          config: { type: 'flattened' },
          config_yaml: { type: 'text' },
          otel_exporter_config_yaml: { type: 'text' },
          otel_disable_beatsauth: { type: 'boolean' },
          is_preconfigured: { type: 'boolean', index: false },
          is_internal: { type: 'boolean', index: false },
          ssl: { type: 'binary' },
          proxy_id: { type: 'keyword' },
          shipper: {
            dynamic: false, // we aren't querying or aggregating over this data, so we don't need to specify any fields
            properties: {},
          },
          allow_edit: { enabled: false },
          version: { type: 'keyword' },
          key: { type: 'keyword' },
          compression: { type: 'keyword' },
          compression_level: { type: 'integer' },
          client_id: { type: 'keyword' },
          auth_type: { type: 'keyword' },
          connection_type: { type: 'keyword' },
          username: { type: 'keyword' },
          password: { type: 'text', index: false },
          sasl: {
            dynamic: false,
            properties: {
              mechanism: { type: 'text' },
            },
          },
          partition: { type: 'keyword' },
          random: {
            dynamic: false,
            properties: {
              group_events: { type: 'integer' },
            },
          },
          round_robin: {
            dynamic: false,
            properties: {
              group_events: { type: 'integer' },
            },
          },
          hash: {
            dynamic: false,
            properties: {
              hash: { type: 'text' },
              random: { type: 'boolean' },
            },
          },
          topic: { type: 'text', index: false },
          topics: {
            dynamic: false,
            properties: {
              topic: { type: 'keyword' },
              when: {
                dynamic: false,
                properties: {
                  type: { type: 'text' },
                  condition: { type: 'text' },
                },
              },
            },
          },
          headers: {
            dynamic: false,
            properties: {
              key: { type: 'text' },
              value: { type: 'text' },
            },
          },
          timeout: { type: 'integer' },
          broker_timeout: { type: 'integer' },
          broker_ack_reliability: { type: 'text' },
          broker_buffer_size: { type: 'integer' },
          required_acks: { type: 'integer' },
          channel_buffer_size: { type: 'integer' },
          secrets: {
            dynamic: false,
            properties: {
              password: {
                dynamic: false,
                properties: {
                  id: { type: 'keyword' },
                },
              },
              ssl: {
                dynamic: false,
                properties: {
                  key: {
                    dynamic: false,
                    properties: {
                      id: { type: 'keyword' },
                    },
                  },
                },
              },
              service_token: {
                dynamic: false,
                properties: {
                  id: { type: 'keyword' },
                },
              },
            },
          },
          preset: {
            type: 'keyword',
            index: false,
          },
        },
      },
      modelVersions: {
        '1': {
          changes: [
            {
              type: 'mappings_deprecation',
              deprecatedMappings: [
                'broker_ack_reliability',
                'broker_buffer_size',
                'channel_buffer_size',
              ],
            },
            {
              type: 'data_backfill',
              backfillFn: migrateOutputToV8100,
            },
          ],
          schemas: {
            forwardCompatibility: migrateOutputEvictionsFromV8100,
          },
        },
        '2': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                service_token: { type: 'keyword', index: false },
              },
            },
          ],
        },
        '3': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                secrets: {
                  properties: {
                    service_token: {
                      dynamic: false,
                      properties: {
                        id: { type: 'keyword' },
                      },
                    },
                  },
                },
              },
            },
          ],
        },
        '4': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                preset: {
                  type: 'keyword',
                  index: false,
                },
              },
            },
          ],
        },
        '5': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                is_internal: { type: 'boolean', index: false },
              },
            },
          ],
        },
        '6': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                topic: { type: 'text', index: false },
              },
            },
          ],
        },
        '7': {
          changes: [
            {
              type: 'mappings_deprecation',
              deprecatedMappings: ['topics'],
            },
            {
              type: 'data_backfill',
              backfillFn: backfillOutputPolicyToV7,
            },
          ],
        },
        '8': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {},
            },
          ],
        },
        '9': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                otel_exporter_config_yaml: { type: 'text' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: (unknownAttributes: unknown) => {
              const { otel_exporter_config_yaml: _, ...rest } = unknownAttributes as Record<
                string,
                unknown
              >;
              return rest;
            },
            create: schema.object({}, { unknowns: 'allow' }),
          },
        },
        '10': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                otel_disable_beatsauth: { type: 'boolean' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: (unknownAttributes: unknown) => {
              const { otel_disable_beatsauth: _, ...rest } = unknownAttributes as Record<
                string,
                unknown
              >;
              return rest;
            },
            create: schema.object({}, { unknowns: 'allow' }),
          },
        },
      },
      migrations: {
        '7.13.0': migrateOutputToV7130,
        '8.0.0': migrateOutputToV800,
      },
    },
    [LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE]: {
      name: LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          name: { type: 'keyword' },
          description: { type: 'text' },
          namespace: { type: 'keyword' },
          enabled: { type: 'boolean' },
          is_managed: { type: 'boolean' },
          policy_id: { type: 'keyword' },
          policy_ids: { type: 'keyword' },
          output_id: { type: 'keyword' },
          cloud_connector_id: { type: 'keyword' },
          package: {
            properties: {
              name: { type: 'keyword' },
              title: { type: 'keyword' },
              version: { type: 'keyword' },
              requires_root: { type: 'boolean' },
            },
          },
          elasticsearch: {
            dynamic: false,
            properties: {},
          },
          vars: { type: 'flattened' },
          inputs: {
            dynamic: false,
            properties: {},
          },
          secret_references: { properties: { id: { type: 'keyword' } } },
          overrides: { type: 'flattened', index: false },
          supports_agentless: { type: 'boolean' },
          supports_cloud_connector: { type: 'boolean' },
          revision: { type: 'integer' },
          updated_at: { type: 'date' },
          updated_by: { type: 'keyword' },
          created_at: { type: 'date' },
          created_by: { type: 'keyword' },
          bump_agent_policy_revision: { type: 'boolean' },
          latest_revision: { type: 'boolean' },
          package_agent_version_condition: { type: 'keyword' },
        },
      },
      modelVersions: {
        '1': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: migratePackagePolicyToV8100,
            },
            {
              type: 'data_backfill',
              backfillFn: migrateSyntheticsPackagePolicyToV8100,
            },
          ],
          schemas: {
            forwardCompatibility: migratePackagePolicyEvictionsFromV8100,
          },
        },
        '2': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: migratePackagePolicyToV8110,
            },
          ],
          schemas: {
            forwardCompatibility: migratePackagePolicyEvictionsFromV8110,
          },
        },
        '3': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: migratePackagePolicyToV81102,
            },
          ],
          schemas: {
            forwardCompatibility: migratePackagePolicyEvictionsFromV81102,
          },
        },
        '4': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: migrateCspPackagePolicyToV8110,
            },
          ],
        },
        '5': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: migrateSyntheticsPackagePolicyToV8120,
            },
          ],
        },
        '6': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: migratePackagePolicyToV8140,
            },
          ],
        },
        '7': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: migratePackagePolicyEnableCapsToV8140,
            },
          ],
        },
        '8': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: migratePackagePolicyAddAntivirusRegistrationModeToV8140,
            },
          ],
        },
        '9': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                overrides: { type: 'flattened', index: false },
              },
            },
          ],
        },
        '10': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: packagePolicyV10OnWriteScanFix,
            },
          ],
        },
        '11': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                policy_ids: { type: 'keyword' },
              },
            },
            {
              type: 'data_backfill',
              backfillFn: migratePackagePolicySetRequiresRootToV8150,
            },
          ],
        },
        '12': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                package: { properties: { requires_root: { type: 'boolean' } } },
              },
            },
            {
              type: 'data_backfill',
              backfillFn: migratePackagePolicyIdsToV8150,
            },
          ],
        },
        '13': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: packagePolicyV13AdvancedFields,
            },
          ],
        },
        '14': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                output_id: { type: 'keyword' },
              },
            },
          ],
        },
        '15': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                bump_agent_policy_revision: { type: 'boolean' },
              },
            },
          ],
        },
        '16': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                supports_agentless: { type: 'boolean' },
              },
            },
          ],
        },
        '17': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: packagePolicyV17AdvancedFieldsForEndpointV818,
            },
          ],
        },
        '18': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {}, // Empty to add dynamic:false
            },
          ],
        },
        '19': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                latest_revision: { type: 'boolean' },
              },
            },
            {
              type: 'data_backfill',
              backfillFn: backfillPackagePolicyLatestRevision,
            },
          ],
        },
        '20': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                supports_cloud_connector: { type: 'boolean' },
                cloud_connector_id: { type: 'keyword' },
              },
            },
          ],
        },
        '21': {
          changes: [
            {
              type: 'unsafe_transform',
              transformFn: (typeSafeGuard) => typeSafeGuard(disableBrowserInputWhenBothEnabled),
            },
          ],
        },
        '22': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                package_agent_version_condition: { type: 'keyword' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: PackagePolicySchemaV22.extends({}, { unknowns: 'ignore' }),
            create: PackagePolicySchemaV22.extends({}, { unknowns: 'ignore' }),
          },
        },
        '23': {
          changes: [],
          schemas: {
            forwardCompatibility: PackagePolicySchemaV24.extends({}, { unknowns: 'ignore' }),
            create: PackagePolicySchemaV24.extends({}, { unknowns: 'ignore' }),
          },
        },
        '24': {
          changes: [],
          schemas: {
            forwardCompatibility: PackagePolicySchemaV25.extends({}, { unknowns: 'ignore' }),
            create: PackagePolicySchemaV25.extends({}, { unknowns: 'ignore' }),
          },
        },
      },
      migrations: {
        '7.10.0': migratePackagePolicyToV7100,
        '7.11.0': migratePackagePolicyToV7110,
        '7.12.0': migratePackagePolicyToV7120,
        '7.13.0': migratePackagePolicyToV7130,
        '7.14.0': migratePackagePolicyToV7140,
        '7.15.0': migratePackagePolicyToV7150,
        '7.16.0': migratePackagePolicyToV7160,
        '8.2.0': migratePackagePolicyToV820,
        '8.3.0': migratePackagePolicyToV830,
        '8.4.0': migratePackagePolicyToV840,
        '8.5.0': migratePackagePolicyToV850,
        '8.6.0': migratePackagePolicyToV860,
        '8.7.0': migratePackagePolicyToV870,
        '8.8.0': migratePackagePolicyToV880,
      },
    },
    [PACKAGE_POLICY_SAVED_OBJECT_TYPE]: {
      name: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'multiple',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          name: { type: 'keyword' },
          description: { type: 'text' },
          namespace: { type: 'keyword' },
          enabled: { type: 'boolean' },
          is_managed: { type: 'boolean' },
          policy_id: { type: 'keyword' },
          policy_ids: { type: 'keyword' },
          output_id: { type: 'keyword' },
          cloud_connector_id: { type: 'keyword' },
          package: {
            properties: {
              name: { type: 'keyword' },
              title: { type: 'keyword' },
              version: { type: 'keyword' },
              requires_root: { type: 'boolean' },
            },
          },
          elasticsearch: {
            dynamic: false,
            properties: {},
          },
          vars: { type: 'flattened' },
          inputs: {
            dynamic: false,
            properties: {},
          },
          secret_references: { properties: { id: { type: 'keyword' } } },
          overrides: { type: 'flattened', index: false },
          supports_agentless: { type: 'boolean' },
          supports_cloud_connector: { type: 'boolean' },
          revision: { type: 'integer' },
          updated_at: { type: 'date' },
          updated_by: { type: 'keyword' },
          created_at: { type: 'date' },
          created_by: { type: 'keyword' },
          bump_agent_policy_revision: { type: 'boolean' },
          latest_revision: { type: 'boolean' },
          package_agent_version_condition: { type: 'keyword' },
        },
      },
      modelVersions: {
        '1': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                bump_agent_policy_revision: { type: 'boolean' },
              },
            },
          ],
        },
        '2': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                supports_agentless: { type: 'boolean' },
              },
            },
          ],
        },
        '3': {
          changes: [
            {
              type: 'data_backfill',
              backfillFn: packagePolicyV17AdvancedFieldsForEndpointV818,
            },
          ],
        },
        '4': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {}, // Empty to add dynamic:false
            },
          ],
        },
        '5': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                latest_revision: { type: 'boolean' },
              },
            },
            {
              type: 'data_backfill',
              backfillFn: backfillPackagePolicyLatestRevision,
            },
          ],
        },
        '6': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                cloud_connector_id: { type: 'keyword' },
                supports_cloud_connector: { type: 'boolean' },
              },
            },
          ],
        },
        '7': {
          changes: [
            {
              type: 'unsafe_transform',
              transformFn: (typeSafeGuard) => typeSafeGuard(disableBrowserInputWhenBothEnabled),
            },
          ],
        },
        '8': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                package_agent_version_condition: { type: 'keyword' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: PackagePolicySchemaV22.extends({}, { unknowns: 'ignore' }),
            create: PackagePolicySchemaV22.extends({}, { unknowns: 'ignore' }),
          },
        },
        '9': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {},
            },
          ],
          schemas: {
            forwardCompatibility: PackagePolicySchemaV24.extends({}, { unknowns: 'ignore' }),
            create: PackagePolicySchemaV24.extends({}, { unknowns: 'ignore' }),
          },
        },
        '10': {
          changes: [],
          schemas: {
            forwardCompatibility: PackagePolicySchemaV25.extends({}, { unknowns: 'ignore' }),
            create: PackagePolicySchemaV25.extends({}, { unknowns: 'ignore' }),
          },
        },
      },
    },
    [PACKAGES_SAVED_OBJECT_TYPE]: {
      name: PACKAGES_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          name: { type: 'keyword' },
          version: { type: 'keyword' },
          internal: { type: 'boolean' },
          dependencies: {
            type: 'nested',
            properties: {
              name: { type: 'keyword' },
              version: { type: 'keyword' },
            },
          },
          keep_policies_up_to_date: { type: 'boolean', index: false },
          es_index_patterns: {
            dynamic: false,
            properties: {},
          },
          verification_status: { type: 'keyword' },
          verification_key_id: { type: 'keyword' },
          installed_es: {
            dynamic: false,
            type: 'nested',
            properties: {
              id: { type: 'keyword' },
              type: { type: 'keyword' },
              version: { type: 'keyword' },
              deferred: { type: 'boolean' },
            },
          },
          latest_install_failed_attempts: { type: 'object', enabled: false },
          latest_executed_state: { type: 'object', enabled: false },
          installed_kibana: {
            dynamic: false,
            properties: {},
          },
          installed_kibana_space_id: { type: 'keyword' },
          package_assets: {
            dynamic: false,
            properties: {},
          },
          additional_spaces_installed_kibana: {
            type: 'flattened',
            index: false,
          },
          install_started_at: { type: 'date' },
          install_version: { type: 'keyword' },
          install_status: { type: 'keyword' },
          install_source: { type: 'keyword' },
          is_dependency_of: {
            dynamic: false,
            properties: {},
          },
          installed_as_dependency: { type: 'boolean' },
          install_format_schema_version: { type: 'version' },
          experimental_data_stream_features: {
            type: 'nested',
            properties: {
              data_stream: { type: 'keyword' },
              features: {
                type: 'nested',
                dynamic: false,
                properties: {
                  synthetic_source: { type: 'boolean' },
                  tsdb: { type: 'boolean' },
                },
              },
            },
          },
          previous_version: { type: 'keyword' },
          pending_upgrade_review: {
            dynamic: false,
            properties: {},
          },
          previous_dependency_versions: {
            dynamic: false,
            properties: {},
          },
        },
      },
      modelVersions: {
        '1': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                latest_install_failed_attempts: { type: 'object', enabled: false },
              },
            },
          ],
        },
        '2': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                latest_executed_state: { type: 'object', enabled: false },
              },
            },
          ],
        },
        '3': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                additional_spaces_installed_kibana: { type: 'flattened', index: false },
              },
            },
          ],
        },
        '4': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {}, // Empty to add dynamic:false
            },
          ],
        },
        '5': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                previous_version: { type: 'keyword' },
              },
            },
          ],
        },
        '6': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                pending_upgrade_review: {
                  dynamic: false,
                  properties: {},
                },
              },
            },
          ],
          schemas: {
            forwardCompatibility: EpmPackagesSchemaV6.extends({}, { unknowns: 'ignore' }),
            create: EpmPackagesSchemaV6.extends({}, { unknowns: 'ignore' }),
          },
        },
        '7': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                dependencies: {
                  type: 'nested',
                  properties: {
                    name: { type: 'keyword' },
                    version: { type: 'keyword' },
                  },
                },
              },
            },
          ],
          schemas: {
            forwardCompatibility: EpmPackagesSchemaV7.extends({}, { unknowns: 'ignore' }),
            create: EpmPackagesSchemaV7,
          },
        },
        '8': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                is_dependency_of: {
                  dynamic: false,
                  properties: {},
                },
                installed_as_dependency: { type: 'boolean' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: EpmPackagesSchemaV8.extends({}, { unknowns: 'ignore' }),
            create: EpmPackagesSchemaV8,
          },
        },
        '9': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                previous_dependency_versions: {
                  dynamic: false,
                  properties: {},
                },
              },
            },
          ],
          schemas: {
            forwardCompatibility: EpmPackagesSchemaV9.extends({}, { unknowns: 'ignore' }),
            create: EpmPackagesSchemaV9,
          },
        },
        '10': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {}, // Empty to add dynamic:false on installed_es
            },
          ],
          schemas: {
            forwardCompatibility: EpmPackagesSchemaV10.extends({}, { unknowns: 'ignore' }),
            create: EpmPackagesSchemaV10,
          },
        },
        '11': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {},
            },
          ],
          schemas: {
            forwardCompatibility: EpmPackagesSchemaV11.extends({}, { unknowns: 'ignore' }),
            create: EpmPackagesSchemaV11,
          },
        },
      },
      migrations: {
        '7.14.0': migrateInstallationToV7140,
        '7.14.1': migrateInstallationToV7140,
        '7.16.0': migrateInstallationToV7160,
        '8.0.0': migrateInstallationToV800,
        '8.3.0': migrateInstallationToV830,
        '8.4.0': migrateInstallationToV840,
        '8.6.0': migrateInstallationToV860,
      },
    },
    [ASSETS_SAVED_OBJECT_TYPE]: {
      name: ASSETS_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        properties: {
          package_name: { type: 'keyword' },
          package_version: { type: 'keyword' },
          install_source: { type: 'keyword' },
          asset_path: { type: 'keyword' },
          media_type: { type: 'keyword' },
          data_utf8: { type: 'text', index: false },
          data_base64: { type: 'binary' },
        },
      },
    },
    [PRECONFIGURATION_DELETION_RECORD_SAVED_OBJECT_TYPE]: {
      name: PRECONFIGURATION_DELETION_RECORD_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: useSpaceAwareness ? 'single' : 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        properties: {
          id: { type: 'keyword' },
        },
      },
    },
    [DOWNLOAD_SOURCE_SAVED_OBJECT_TYPE]: {
      name: DOWNLOAD_SOURCE_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          source_id: { type: 'keyword', index: false },
          name: { type: 'keyword' },
          is_default: { type: 'boolean' },
          host: { type: 'keyword' },
          proxy_id: { type: 'keyword' },
        },
      },
      modelVersions: {
        '1': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {},
            },
          ],
        },
      },
    },
    [FLEET_SERVER_HOST_SAVED_OBJECT_TYPE]: {
      name: FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          name: { type: 'keyword' },
          is_default: { type: 'boolean' },
          is_internal: { type: 'boolean', index: false },
          host_urls: { type: 'keyword', index: false },
          is_preconfigured: { type: 'boolean' },
          proxy_id: { type: 'keyword' },
        },
      },
      modelVersions: {
        '1': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                is_internal: { type: 'boolean', index: false },
              },
            },
          ],
        },
        '2': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {},
            },
          ],
        },
      },
    },
    [FLEET_PROXY_SAVED_OBJECT_TYPE]: {
      name: FLEET_PROXY_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        properties: {
          name: { type: 'keyword' },
          url: { type: 'keyword', index: false },
          proxy_headers: { type: 'text', index: false },
          certificate_authorities: { type: 'keyword', index: false },
          certificate: { type: 'keyword', index: false },
          certificate_key: { type: 'keyword', index: false },
          is_preconfigured: { type: 'boolean' },
        },
      },
    },
    [MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE]: {
      name: MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: true,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {},
      },
    },
    [UNINSTALL_TOKENS_SAVED_OBJECT_TYPE]: {
      name: UNINSTALL_TOKENS_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: true,
      namespaceType: 'agnostic',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          policy_id: { type: 'keyword' },
          token_plain: { type: 'keyword' },
          namespaces: { type: 'keyword' },
        },
      },
      modelVersions: {
        '1': {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                namespaces: { type: 'keyword' },
              },
            },
          ],
        },
      },
    },
    [CLOUD_CONNECTOR_SAVED_OBJECT_TYPE]: {
      name: CLOUD_CONNECTOR_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'multiple',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          name: { type: 'keyword' },
          namespace: { type: 'keyword' },
          cloudProvider: { type: 'keyword' },
          accountType: { type: 'keyword' },
          vars: { type: 'flattened' },
          packagePolicyCount: { type: 'integer' },
          created_at: { type: 'date' },
          updated_at: { type: 'date' },
          verification_status: { type: 'keyword' },
          verification_started_at: { type: 'date' },
          verification_failed_at: { type: 'date' },
        },
      },
      modelVersions: {
        1: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                name: { type: 'keyword' },
                namespace: { type: 'keyword' },
                cloudProvider: { type: 'keyword' },
                vars: { type: 'flattened' },
                packagePolicyCount: { type: 'integer' },
                created_at: { type: 'date' },
                updated_at: { type: 'date' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: schema.object(
              {
                name: schema.string(),
                namespace: schema.maybe(schema.string()),
                cloudProvider: schema.string(),
                vars: schema.any(),
                packagePolicyCount: schema.number(),
                created_at: schema.string(),
                updated_at: schema.string(),
              },
              { unknowns: 'ignore' }
            ),
          },
        },
        2: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                accountType: { type: 'keyword' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: schema.object(
              {
                name: schema.string(),
                namespace: schema.maybe(schema.string()),
                cloudProvider: schema.string(),
                accountType: schema.maybe(schema.string()),
                vars: schema.any(),
                packagePolicyCount: schema.number(),
                created_at: schema.string(),
                updated_at: schema.string(),
              },
              { unknowns: 'ignore' }
            ),
            create: schema.object({
              name: schema.string(),
              namespace: schema.maybe(schema.string()),
              cloudProvider: schema.string(),
              accountType: schema.maybe(schema.string()),
              vars: schema.any(),
              packagePolicyCount: schema.number(),
              created_at: schema.string(),
              updated_at: schema.string(),
            }),
          },
        },
        3: {
          changes: [
            {
              type: 'data_removal',
              removedAttributePaths: ['packagePolicyCount'],
            },
          ],
          schemas: {
            forwardCompatibility: schema.object(
              {
                name: schema.string(),
                namespace: schema.maybe(schema.string()),
                cloudProvider: schema.string(),
                accountType: schema.maybe(schema.string()),
                vars: schema.any(),
                created_at: schema.string(),
                updated_at: schema.string(),
              },
              { unknowns: 'ignore' }
            ),
            create: schema.object({
              name: schema.string(),
              namespace: schema.maybe(schema.string()),
              cloudProvider: schema.string(),
              accountType: schema.maybe(schema.string()),
              vars: schema.any(),
              created_at: schema.string(),
              updated_at: schema.string(),
            }),
          },
        },
        4: {
          changes: [
            {
              type: 'mappings_addition',
              addedMappings: {
                verification_status: { type: 'keyword' },
                verification_started_at: { type: 'date' },
                verification_failed_at: { type: 'date' },
              },
            },
          ],
          schemas: {
            forwardCompatibility: CloudConnectorSchemaV4.extends({}, { unknowns: 'ignore' }),
            create: CloudConnectorSchemaV4,
          },
        },
      },
    },
    [CLOUD_ONBOARDING_DEPLOYMENT_SAVED_OBJECT_TYPE]: {
      name: CLOUD_ONBOARDING_DEPLOYMENT_SAVED_OBJECT_TYPE,
      indexPattern: INGEST_SAVED_OBJECT_INDEX,
      hidden: false,
      namespaceType: 'multiple',
      management: {
        importableAndExportable: false,
      },
      mappings: {
        dynamic: false,
        properties: {
          connectorId: { type: 'keyword', ignore_above: 1024 },
        },
      },
      modelVersions: {
        1: {
          changes: [],
          schemas: {
            forwardCompatibility: CloudOnboardingDeploymentSchemaV1.extends(
              {},
              { unknowns: 'ignore' }
            ),
            create: CloudOnboardingDeploymentSchemaV1,
          },
        },
      },
    },
  };
};

export function registerSavedObjects(
  savedObjects: SavedObjectsServiceSetup,
  options = { useSpaceAwareness: false }
) {
  const savedObjectTypes = getSavedObjectTypes({ useSpaceAwareness: options.useSpaceAwareness });
  Object.values(savedObjectTypes).forEach((type) => {
    savedObjects.registerType(type);
  });
}

export const OUTPUT_INCLUDE_AAD_FIELDS = new Set([
  'service_token',
  'shipper',
  'allow_edit',
  'broker_ack_reliability',
  'broker_buffer_size',
  'channel_buffer_size',
]);

// Encrypted fields need to be retrieved using an EncryptedSavedObjectsClient.
export const OUTPUT_ENCRYPTED_FIELDS = new Set([
  { key: 'ssl' },
  { key: 'password' },
  { key: 'kibana_api_key' },
]);

export const FLEET_SERVER_HOST_ENCRYPTED_FIELDS = new Set([{ key: 'ssl' }]);

export const DOWNLOAD_SOURCE_ENCRYPTED_FIELDS = new Set([{ key: 'ssl' }, { key: 'auth' }]);

export function registerEncryptedSavedObjects(
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup
) {
  encryptedSavedObjects.registerType({
    type: OUTPUT_SAVED_OBJECT_TYPE,
    attributesToEncrypt: OUTPUT_ENCRYPTED_FIELDS,
    attributesToIncludeInAAD: OUTPUT_INCLUDE_AAD_FIELDS,
  });
  // Encrypted saved objects
  encryptedSavedObjects.registerType({
    type: MESSAGE_SIGNING_KEYS_SAVED_OBJECT_TYPE,
    attributesToEncrypt: new Set(['passphrase']),
    attributesToIncludeInAAD: new Set(['private_key', 'public_key', 'passphrase_plain']),
  });
  encryptedSavedObjects.registerType({
    type: UNINSTALL_TOKENS_SAVED_OBJECT_TYPE,
    attributesToEncrypt: new Set(['token']),
    attributesToIncludeInAAD: new Set(['policy_id', 'token_plain']),
  });
  encryptedSavedObjects.registerType({
    type: FLEET_SERVER_HOST_SAVED_OBJECT_TYPE,
    attributesToEncrypt: FLEET_SERVER_HOST_ENCRYPTED_FIELDS,
    // enforceRandomId allows to create an SO with an arbitrary id
    enforceRandomId: false,
  });
  encryptedSavedObjects.registerType({
    type: DOWNLOAD_SOURCE_SAVED_OBJECT_TYPE,
    attributesToEncrypt: DOWNLOAD_SOURCE_ENCRYPTED_FIELDS,
    // enforceRandomId allows to create an SO with an arbitrary id
    enforceRandomId: false,
  });
}
