/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { diff } from 'jest-diff';
import { isEqual, isEqualWith } from 'lodash';
import util from 'util';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');

  describe('Privileges', () => {
    describe('GET /api/security/privileges', () => {
      it('should return a privilege map with all known privileges, without actions', async () => {
        // If you're adding a privilege to the following, that's great!
        // If you're removing a privilege, this breaks backwards compatibility
        // Roles are associated with these privileges, and we shouldn't be removing them in a minor version.
        const expected = {
          features: {
            discover: ['all', 'read', 'minimal_all', 'minimal_read'],
            discover_v2: ['all', 'read', 'minimal_all', 'minimal_read'],
            visualize: ['all', 'read', 'minimal_all', 'minimal_read'],
            visualize_v2: ['all', 'read', 'minimal_all', 'minimal_read'],
            dashboard: ['all', 'read', 'minimal_all', 'minimal_read'],
            dashboard_v2: ['all', 'read', 'minimal_all', 'minimal_read'],
            dev_tools: ['all', 'read', 'minimal_all', 'minimal_read'],
            advancedSettings: ['all', 'read', 'minimal_all', 'minimal_read'],
            indexPatterns: ['all', 'read', 'minimal_all', 'minimal_read'],
            savedObjectsManagement: ['all', 'read', 'minimal_all', 'minimal_read'],
            savedQueryManagement: ['all', 'read', 'minimal_all', 'minimal_read'],
            savedObjectsTagging: ['all', 'read', 'minimal_all', 'minimal_read'],
            graph: ['all', 'read', 'minimal_all', 'minimal_read'],
            maps: ['all', 'read', 'minimal_all', 'minimal_read'],
            maps_v2: ['all', 'read', 'minimal_all', 'minimal_read'],
            generalCases: ['all', 'read', 'minimal_all', 'minimal_read'],
            generalCasesV2: ['all', 'read', 'minimal_all', 'minimal_read'],
            generalCasesV3: ['all', 'read', 'minimal_all', 'minimal_read'],
            observabilityCases: ['all', 'read', 'minimal_all', 'minimal_read'],
            observabilityCasesV2: ['all', 'read', 'minimal_all', 'minimal_read'],
            observabilityCasesV3: ['all', 'read', 'minimal_all', 'minimal_read'],
            observabilityAIAssistant: ['all', 'read', 'minimal_all', 'minimal_read'],
            agentBuilder: ['all', 'read', 'minimal_all', 'minimal_read'],
            agentContextLayer: ['all', 'read', 'minimal_all', 'minimal_read'],
            automatic_import: ['all', 'read', 'minimal_all', 'minimal_read'],
            slo: ['all', 'read', 'minimal_all', 'minimal_read'],
            canvas: ['all', 'read', 'minimal_all', 'minimal_read'],
            cloudConnect: ['all', 'read', 'minimal_all', 'minimal_read'],
            infrastructure: ['all', 'read', 'minimal_all', 'minimal_read'],
            logs: ['all', 'read', 'minimal_all', 'minimal_read'],
            uptime: ['all', 'read', 'minimal_all', 'minimal_read'],
            apm: ['all', 'read', 'minimal_all', 'minimal_read'],
            osquery: ['all', 'read', 'minimal_all', 'minimal_read'],
            enterpriseSearch: ['all', 'read', 'minimal_all', 'minimal_read'],
            enterpriseSearchApplications: ['all', 'read', 'minimal_all', 'minimal_read'],
            enterpriseSearchAnalytics: ['all', 'read', 'minimal_all', 'minimal_read'],
            ml: ['all', 'read', 'minimal_all', 'minimal_read'],
            siem: ['all', 'read', 'minimal_all', 'minimal_read'],
            siemV2: ['all', 'read', 'minimal_all', 'minimal_read'],
            siemV3: ['all', 'read', 'minimal_all', 'minimal_read'],
            siemV4: ['all', 'read', 'minimal_all', 'minimal_read'],
            siemV5: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionRulesV1: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionRulesV2: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionRulesV3: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionRulesV4: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionAlertsV1: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionAssistant: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionAttackDiscovery: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionCases: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionCasesV2: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionCasesV3: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionNotes: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionTimeline: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionSiemMigrations: ['all', 'read', 'minimal_all', 'minimal_read'],
            searchPlayground: ['all', 'read', 'minimal_all', 'minimal_read'],
            searchSynonyms: ['all', 'read', 'minimal_all', 'minimal_read'],
            searchQueryRules: ['all', 'read', 'minimal_all', 'minimal_read'],
            workflowsManagement: ['all', 'read', 'minimal_all', 'minimal_read'],
            searchInferenceEndpoints: ['all', 'read', 'minimal_all', 'minimal_read'],
            fleetv2: ['all', 'read', 'minimal_all', 'minimal_read'],
            fleet: ['all', 'read', 'minimal_all', 'minimal_read'],
            stackAlerts: ['all', 'read', 'minimal_all', 'minimal_read'],
            actions: ['all', 'read', 'minimal_all', 'minimal_read'],
            anonymization: ['all', 'read', 'minimal_all', 'minimal_read'],
            filesManagement: ['all', 'read', 'minimal_all', 'minimal_read'],
            filesSharedImage: ['all', 'read', 'minimal_all', 'minimal_read'],
            rulesSettings: ['all', 'read', 'minimal_all', 'minimal_read'],
            queryActivity: ['all', 'read', 'minimal_all', 'minimal_read'],
            maintenanceWindow: ['all', 'read', 'minimal_all', 'minimal_read'],
            streams: ['all', 'read', 'minimal_all', 'minimal_read'],
            dataQuality: ['all', 'read', 'minimal_all', 'minimal_read'],
            data_sets: ['all', 'read', 'minimal_all', 'minimal_read'],
            manageReporting: ['all', 'read', 'minimal_all', 'minimal_read'],
          },
          global: ['all', 'read'],
          space: ['all', 'read'],
          reserved: [
            'fleet-setup',
            'ml_user',
            'ml_admin',
            'ml_apm_user',
            'monitoring',
            'reporting_user',
          ],
        };

        await supertest
          .get('/api/security/privileges')
          .set('kbn-xsrf', 'xxx')
          .send()
          .expect(200)
          .expect((res: any) => {
            // when comparing privileges, the order of the privileges doesn't matter.
            // supertest uses assert.deepStrictEqual.
            // expect.js doesn't help us here.
            // and lodash's isEqual doesn't know how to compare Sets.
            const success = isEqualWith(res.body, expected, (value, other, key) => {
              if (Array.isArray(value) && Array.isArray(other)) {
                return isEqual(value.sort(), other.sort());
              }

              // Lodash types aren't correct, `undefined` should be supported as a return value here and it
              // has special meaning.
              return undefined as any;
            });

            if (!success) {
              throw new Error(
                `Expected ${util.inspect(res.body)} to equal ${util.inspect(expected)}`
              );
            }
          })
          .expect(200);
      });

      it('should include sub-feature privileges when respectlicenseLevel is false', async () => {
        const expected = {
          global: ['all', 'read'],
          space: ['all', 'read'],
          features: {
            graph: ['all', 'read', 'minimal_all', 'minimal_read'],
            savedObjectsTagging: ['all', 'read', 'minimal_all', 'minimal_read'],
            canvas: ['all', 'read', 'minimal_all', 'minimal_read'],
            cloudConnect: ['all', 'read', 'minimal_all', 'minimal_read'],
            maps: ['all', 'read', 'minimal_all', 'minimal_read'],
            maps_v2: ['all', 'read', 'minimal_all', 'minimal_read'],
            generalCases: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'cases_delete',
              'cases_settings',
            ],
            generalCasesV2: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'cases_delete',
              'cases_settings',
              'create_comment',
              'case_reopen',
              'cases_manage_templates',
            ],
            generalCasesV3: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'cases_delete',
              'cases_settings',
              'create_comment',
              'case_reopen',
              'cases_assign',
              'cases_manage_templates',
            ],
            observabilityCases: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'cases_delete',
              'cases_settings',
            ],
            observabilityCasesV2: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'cases_delete',
              'cases_settings',
              'create_comment',
              'case_reopen',
              'cases_manage_templates',
            ],
            observabilityCasesV3: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'cases_delete',
              'cases_settings',
              'create_comment',
              'case_reopen',
              'cases_assign',
              'cases_manage_templates',
            ],
            observabilityAIAssistant: ['all', 'read', 'minimal_all', 'minimal_read'],
            agentBuilder: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'manage_agents',
              'manage_tools',
              'manage_skills',
            ],
            agentContextLayer: ['all', 'read', 'minimal_all', 'minimal_read'],
            automatic_import: ['all', 'read', 'minimal_all', 'minimal_read'],
            slo: ['all', 'read', 'minimal_all', 'minimal_read'],
            searchPlayground: ['all', 'read', 'minimal_all', 'minimal_read'],
            searchSynonyms: ['all', 'read', 'minimal_all', 'minimal_read'],
            searchQueryRules: ['all', 'read', 'minimal_all', 'minimal_read'],
            workflowsManagement: [
              'all',
              'minimal_all',
              'minimal_read',
              'read',
              'workflow_create',
              'workflow_delete',
              'workflow_execute',
              'workflow_execution_cancel',
              'workflow_execution_read',
              'workflow_execution_read_managed',
              'workflow_read',
              'workflow_read_managed',
              'workflow_update',
              'workflow_update_managed',
            ],
            searchInferenceEndpoints: ['all', 'read', 'minimal_all', 'minimal_read'],
            fleetv2: [
              'agent_policies_all',
              'agent_policies_read',
              'agents_all',
              'agents_read',
              'all',
              'generate_report',
              'minimal_all',
              'minimal_read',
              'read',
              'settings_all',
              'settings_read',
            ],
            fleet: ['all', 'read', 'minimal_all', 'minimal_read'],
            actions: ['all', 'read', 'minimal_all', 'minimal_read', 'endpoint_security_execute'],
            anonymization: ['all', 'read', 'minimal_all', 'minimal_read'],
            stackAlerts: ['all', 'read', 'minimal_all', 'minimal_read'],
            ml: ['all', 'read', 'minimal_all', 'minimal_read'],
            siem: [
              'actions_log_management_all',
              'actions_log_management_read',
              'all',
              'blocklist_all',
              'blocklist_read',
              'endpoint_exceptions_all',
              'endpoint_exceptions_read',
              'endpoint_list_all',
              'endpoint_list_read',
              'event_filters_all',
              'event_filters_read',
              'host_isolation_all',
              'host_isolation_exceptions_all',
              'host_isolation_exceptions_read',
              'minimal_all',
              'minimal_read',
              'policy_management_all',
              'policy_management_read',
              'process_operations_all',
              'read',
              'trusted_applications_all',
              'trusted_applications_read',
              'file_operations_all',
              'execute_operations_all',
              'scan_operations_all',
              'soc_management_all',
            ],
            siemV2: [
              'actions_log_management_all',
              'actions_log_management_read',
              'all',
              'global_artifact_management_all',
              'blocklist_all',
              'blocklist_read',
              'endpoint_exceptions_all',
              'endpoint_exceptions_read',
              'endpoint_list_all',
              'endpoint_list_read',
              'event_filters_all',
              'event_filters_read',
              'host_isolation_all',
              'host_isolation_exceptions_all',
              'host_isolation_exceptions_read',
              'minimal_all',
              'minimal_read',
              'policy_management_all',
              'policy_management_read',
              'process_operations_all',
              'read',
              'trusted_applications_all',
              'trusted_applications_read',
              'file_operations_all',
              'execute_operations_all',
              'scan_operations_all',
              'soc_management_all',
              'workflow_insights_all',
              'workflow_insights_read',
            ],
            siemV3: [
              'actions_log_management_all',
              'actions_log_management_read',
              'all',
              'global_artifact_management_all',
              'blocklist_all',
              'blocklist_read',
              'endpoint_exceptions_all',
              'endpoint_exceptions_read',
              'endpoint_list_all',
              'endpoint_list_read',
              'event_filters_all',
              'event_filters_read',
              'host_isolation_all',
              'host_isolation_exceptions_all',
              'host_isolation_exceptions_read',
              'minimal_all',
              'minimal_read',
              'policy_management_all',
              'policy_management_read',
              'process_operations_all',
              'read',
              'trusted_applications_all',
              'trusted_applications_read',
              'file_operations_all',
              'execute_operations_all',
              'scan_operations_all',
              'soc_management_all',
              'trusted_devices_all',
              'trusted_devices_read',
              'workflow_insights_all',
              'workflow_insights_read',
            ],
            siemV4: [
              'actions_log_management_all',
              'actions_log_management_read',
              'all',
              'global_artifact_management_all',
              'blocklist_all',
              'blocklist_read',
              'endpoint_exceptions_all',
              'endpoint_exceptions_read',
              'endpoint_list_all',
              'endpoint_list_read',
              'event_filters_all',
              'event_filters_read',
              'host_isolation_all',
              'host_isolation_exceptions_all',
              'host_isolation_exceptions_read',
              'minimal_all',
              'minimal_read',
              'policy_management_all',
              'policy_management_read',
              'process_operations_all',
              'read',
              'trusted_applications_all',
              'trusted_applications_read',
              'trusted_devices_all',
              'trusted_devices_read',
              'file_operations_all',
              'execute_operations_all',
              'scan_operations_all',
              'soc_management_all',
              'workflow_insights_all',
              'workflow_insights_read',
            ],
            siemV5: [
              'actions_log_management_all',
              'actions_log_management_read',
              'all',
              'global_artifact_management_all',
              'blocklist_all',
              'blocklist_read',
              'endpoint_exceptions_all',
              'endpoint_exceptions_read',
              'endpoint_list_all',
              'endpoint_list_read',
              'event_filters_all',
              'event_filters_read',
              'host_isolation_all',
              'host_isolation_exceptions_all',
              'host_isolation_exceptions_read',
              'minimal_all',
              'minimal_read',
              'policy_management_all',
              'policy_management_read',
              'process_operations_all',
              'read',
              'trusted_applications_all',
              'trusted_applications_read',
              'file_operations_all',
              'execute_operations_all',
              'scan_operations_all',
              'scripts_management_all',
              'scripts_management_read',
              'soc_management_all',
              'trusted_devices_all',
              'trusted_devices_read',
              'workflow_insights_all',
              'workflow_insights_read',
            ],
            uptime: [
              'all',
              'can_manage_private_locations',
              'can_read_param_values',
              'elastic_managed_locations_enabled',
              'read',
              'minimal_all',
              'minimal_read',
            ],
            securitySolutionRulesV1: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'security_solution_custom_highlighted_fields_edit',
              'security_solution_enable_disable_rules',
              'security_solution_exceptions_all',
              'security_solution_investigation_guide_edit',
              'security_solution_manual_run_rules',
              'security_solution_rules_management_settings',
            ],
            securitySolutionRulesV2: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'security_solution_custom_highlighted_fields_edit',
              'security_solution_enable_disable_rules',
              'security_solution_exceptions_all',
              'security_solution_investigation_guide_edit',
              'security_solution_manual_run_rules',
              'security_solution_rules_management_settings',
            ],
            securitySolutionRulesV3: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'security_solution_custom_highlighted_fields_edit',
              'security_solution_enable_disable_rules',
              'security_solution_exceptions_all',
              'security_solution_investigation_guide_edit',
              'security_solution_manual_run_rules',
              'security_solution_rules_management_settings',
            ],
            securitySolutionRulesV4: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'security_solution_exceptions_all',
              'security_solution_investigation_guide_edit',
              'security_solution_custom_highlighted_fields_edit',
              'security_solution_enable_disable_rules',
              'security_solution_manual_run_rules',
              'security_solution_rules_management_settings',
            ],
            securitySolutionAlertsV1: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionAssistant: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'update_anonymization',
              'manage_global_knowledge_base',
            ],
            securitySolutionAttackDiscovery: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'update_schedule',
            ],
            securitySolutionCases: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'cases_delete',
              'cases_settings',
            ],
            securitySolutionCasesV2: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'cases_delete',
              'cases_settings',
              'create_comment',
              'case_reopen',
              'cases_manage_templates',
            ],
            securitySolutionCasesV3: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'cases_delete',
              'cases_settings',
              'create_comment',
              'case_reopen',
              'cases_assign',
              'cases_manage_templates',
            ],
            securitySolutionTimeline: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionSiemMigrations: ['all', 'read', 'minimal_all', 'minimal_read'],
            securitySolutionNotes: ['all', 'read', 'minimal_all', 'minimal_read'],
            infrastructure: ['all', 'read', 'minimal_all', 'minimal_read'],
            logs: ['all', 'read', 'minimal_all', 'minimal_read'],
            dataQuality: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'manage_rules',
              'manage_alerts',
            ],
            data_sets: ['all', 'read', 'minimal_all', 'minimal_read'],
            manageReporting: ['all', 'read', 'minimal_all', 'minimal_read'],
            apm: ['all', 'read', 'minimal_all', 'minimal_read', 'settings_save'],
            discover: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'url_create',
              'store_search_session',
              'generate_report',
            ],
            discover_v2: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'url_create',
              'store_search_session',
              'generate_report',
            ],
            visualize: ['all', 'read', 'minimal_all', 'minimal_read', 'url_create'],
            visualize_v2: ['all', 'read', 'minimal_all', 'minimal_read', 'url_create'],
            dashboard: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'url_create',
              'store_search_session',
              'download_csv_report',
            ],
            dashboard_v2: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'url_create',
              'store_search_session',
              'download_csv_report',
            ],
            dev_tools: ['all', 'read', 'minimal_all', 'minimal_read'],
            advancedSettings: ['all', 'read', 'minimal_all', 'minimal_read'],
            indexPatterns: ['all', 'read', 'minimal_all', 'minimal_read'],
            filesManagement: ['all', 'read', 'minimal_all', 'minimal_read'],
            filesSharedImage: ['all', 'read', 'minimal_all', 'minimal_read'],
            savedObjectsManagement: ['all', 'read', 'minimal_all', 'minimal_read'],
            savedQueryManagement: ['all', 'read', 'minimal_all', 'minimal_read'],
            osquery: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'live_queries_all',
              'live_queries_read',
              'run_saved_queries',
              'saved_queries_all',
              'saved_queries_read',
              'packs_all',
              'packs_read',
            ],
            enterpriseSearch: ['all', 'read', 'minimal_all', 'minimal_read'],
            enterpriseSearchApplications: ['all', 'read', 'minimal_all', 'minimal_read'],
            enterpriseSearchAnalytics: ['all', 'read', 'minimal_all', 'minimal_read'],
            rulesSettings: [
              'all',
              'read',
              'minimal_all',
              'minimal_read',
              'allFlappingSettings',
              'readFlappingSettings',
              'allAlertDeleteSettings',
              'readAlertDeleteSettings',
            ],
            maintenanceWindow: ['all', 'read', 'minimal_all', 'minimal_read'],
            queryActivity: ['all', 'read', 'minimal_all', 'minimal_read'],
            streams: ['all', 'read', 'minimal_all', 'minimal_read'],
          },
          reserved: [
            'fleet-setup',
            'ml_user',
            'ml_admin',
            'ml_apm_user',
            'monitoring',
            'reporting_user',
          ],
        };

        await supertest
          .get('/api/security/privileges?respectLicenseLevel=false')
          .set('kbn-xsrf', 'xxx')
          .send()
          .expect(200)
          .expect((res: any) => {
            let errorPointerMessage = '';
            // when comparing privileges, the order of the privileges doesn't matter.
            // supertest uses assert.deepStrictEqual.
            // expect.js doesn't help us here.
            // and lodash's isEqual doesn't know how to compare Sets.
            const success = isEqualWith(res.body, expected, (value, other, key) => {
              if (Array.isArray(value) && Array.isArray(other)) {
                const isArrayEqual = isEqual(value.sort(), other.sort());

                if (!isArrayEqual) {
                  errorPointerMessage = `Received value for property [${String(
                    key
                  )}] does not match expected value:\n${diff(other, value)}`;
                }

                return isArrayEqual;
              }

              // Lodash types aren't correct, `undefined` should be supported as a return value here and it
              // has special meaning.
              return undefined as any;
            });

            if (!success) {
              throw new Error(
                `${errorPointerMessage ? errorPointerMessage + '\n\n' : ''}Expected ${util.inspect(
                  res.body
                )} to equal ${util.inspect(expected)}`
              );
            }
          })
          .expect(200);
      });
    });
  });
}
