/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { SubFeatureConfig } from '@kbn/features-plugin/common';
import { EXCEPTION_LIST_NAMESPACE_AGNOSTIC } from '@kbn/securitysolution-list-constants';

import { APP_ID, EXCEPTIONS_API_READ, EXCEPTIONS_API_ALL } from '../constants';
import type { SecurityFeatureParams } from './types';

const TRANSLATIONS = Object.freeze({
  all: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.allPrivilegeName',
    { defaultMessage: 'All' }
  ),
  read: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.readPrivilegeName',
    { defaultMessage: 'Read' }
  ),
});

export const endpointListSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.endpointList',
    { defaultMessage: 'Endpoint List' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.endpointList.description',
    {
      defaultMessage:
        'Displays all hosts running Elastic Defend and their relevant integration details.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeEndpointList`, `${APP_ID}-readEndpointList`],
          id: 'endpoint_list_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeEndpointList', 'readEndpointList'],
        },
        {
          api: [`${APP_ID}-readEndpointList`],
          id: 'endpoint_list_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readEndpointList'],
        },
      ],
    },
  ],
});

export const trustedApplicationsSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.trustedApplications',
    { defaultMessage: 'Trusted Applications' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.trustedApplications.description',
    {
      defaultMessage:
        'Helps mitigate conflicts with other software, usually other antivirus or endpoint security applications.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [
            'lists-all',
            EXCEPTIONS_API_READ,
            EXCEPTIONS_API_ALL,
            'lists-read',
            'lists-summary',
            `${APP_ID}-writeTrustedApplications`,
            `${APP_ID}-readTrustedApplications`,
          ],
          id: 'trusted_applications_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [EXCEPTION_LIST_NAMESPACE_AGNOSTIC],
            read: [],
          },
          ui: ['writeTrustedApplications', 'readTrustedApplications'],
        },
        {
          api: [
            'lists-read',
            EXCEPTIONS_API_READ,
            'lists-summary',
            `${APP_ID}-readTrustedApplications`,
          ],
          id: 'trusted_applications_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readTrustedApplications'],
        },
      ],
    },
  ],
});

export const trustedDevicesSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.trustedDevices',
    {
      defaultMessage: 'Trusted Devices',
    }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.trustedDevices.description',
    {
      defaultMessage: 'Manage security exceptions for USB and external devices.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [
            'lists-all',
            EXCEPTIONS_API_READ,
            EXCEPTIONS_API_ALL,
            'lists-read',
            'lists-summary',
            `${APP_ID}-writeTrustedDevices`,
            `${APP_ID}-readTrustedDevices`,
          ],
          id: 'trusted_devices_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [EXCEPTION_LIST_NAMESPACE_AGNOSTIC],
            read: [],
          },
          ui: ['writeTrustedDevices', 'readTrustedDevices'],
        },
        {
          api: ['lists-read', EXCEPTIONS_API_READ, 'lists-summary', `${APP_ID}-readTrustedDevices`],
          id: 'trusted_devices_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readTrustedDevices'],
        },
      ],
    },
  ],
});

export const hostIsolationExceptionsBasicSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.hostIsolationExceptions',
    { defaultMessage: 'Host Isolation Exceptions' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.hostIsolationExceptions.description',
    {
      defaultMessage:
        'Add specific IP addresses that isolated hosts are still allowed to communicate with, even when isolated from the rest of the network.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [
            'lists-all',
            EXCEPTIONS_API_READ,
            EXCEPTIONS_API_ALL,
            'lists-read',
            'lists-summary',
            `${APP_ID}-deleteHostIsolationExceptions`,
            `${APP_ID}-readHostIsolationExceptions`,
          ],
          id: 'host_isolation_exceptions_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [EXCEPTION_LIST_NAMESPACE_AGNOSTIC],
            read: [],
          },
          ui: ['readHostIsolationExceptions', 'deleteHostIsolationExceptions'],
        },
        {
          api: [
            'lists-read',
            EXCEPTIONS_API_READ,
            'lists-summary',
            `${APP_ID}-readHostIsolationExceptions`,
          ],
          id: 'host_isolation_exceptions_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readHostIsolationExceptions'],
        },
      ],
    },
  ],
});
export const blocklistSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate('securitySolutionPackages.features.featureRegistry.subFeatures.blockList', {
    defaultMessage: 'Blocklist',
  }),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.blockList.description',
    {
      defaultMessage:
        'Extend Elastic Defend’s protection against malicious processes and protect against potentially harmful applications.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [
            'lists-all',
            EXCEPTIONS_API_READ,
            EXCEPTIONS_API_ALL,
            'lists-read',
            'lists-summary',
            `${APP_ID}-writeBlocklist`,
            `${APP_ID}-readBlocklist`,
          ],
          id: 'blocklist_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [EXCEPTION_LIST_NAMESPACE_AGNOSTIC],
            read: [],
          },
          ui: ['writeBlocklist', 'readBlocklist'],
        },
        {
          api: ['lists-read', EXCEPTIONS_API_READ, 'lists-summary', `${APP_ID}-readBlocklist`],
          id: 'blocklist_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readBlocklist'],
        },
      ],
    },
  ],
});
export const eventFiltersSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.eventFilters',
    { defaultMessage: 'Event Filters' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.eventFilters.description',
    {
      defaultMessage:
        'Filter out endpoint events that you do not need or want stored in Elasticsearch.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [
            'lists-all',
            EXCEPTIONS_API_READ,
            EXCEPTIONS_API_ALL,
            'lists-read',
            'lists-summary',
            `${APP_ID}-writeEventFilters`,
            `${APP_ID}-readEventFilters`,
          ],
          id: 'event_filters_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [EXCEPTION_LIST_NAMESPACE_AGNOSTIC],
            read: [],
          },
          ui: ['writeEventFilters', 'readEventFilters'],
        },
        {
          api: ['lists-read', EXCEPTIONS_API_READ, 'lists-summary', `${APP_ID}-readEventFilters`],
          id: 'event_filters_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readEventFilters'],
        },
      ],
    },
  ],
});
export const policyManagementSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.policyManagement',
    { defaultMessage: 'Elastic Defend Policy Management' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.policyManagement.description',
    {
      defaultMessage:
        'Access the Elastic Defend integration policy to configure protections, event collection, and advanced policy features.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writePolicyManagement`, `${APP_ID}-readPolicyManagement`],
          id: 'policy_management_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: ['policy-settings-protection-updates-note'],
            read: [],
          },
          ui: ['writePolicyManagement', 'readPolicyManagement'],
        },
        {
          api: [`${APP_ID}-readPolicyManagement`],
          id: 'policy_management_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: ['policy-settings-protection-updates-note'],
          },
          ui: ['readPolicyManagement'],
        },
      ],
    },
  ],
});

export const responseActionsHistorySubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.responseActionsHistory',
    { defaultMessage: 'Response Actions History' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.responseActionsHistory.description',
    { defaultMessage: 'Access the history of response actions performed on endpoints.' }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeActionsLogManagement`, `${APP_ID}-readActionsLogManagement`],
          id: 'actions_log_management_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeActionsLogManagement', 'readActionsLogManagement'],
        },
        {
          api: [`${APP_ID}-readActionsLogManagement`],
          id: 'actions_log_management_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readActionsLogManagement'],
        },
      ],
    },
  ],
});

export const scriptsManagementSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.scriptsManagement',
    { defaultMessage: 'Elastic Defend Scripts Management' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.scriptsManagement.description',
    { defaultMessage: 'Management of scripts used with Elastic Defend response actions.' }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeScriptsManagement`, `${APP_ID}-readScriptsManagement`],
          id: 'scripts_management_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeScriptsManagement', 'readScriptsManagement'],
        },
        {
          api: [`${APP_ID}-readScriptsManagement`],
          id: 'scripts_management_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readScriptsManagement'],
        },
      ],
    },
  ],
});

export const customYaraSignaturesSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.customYaraSignatures',
    { defaultMessage: 'Custom YARA Signatures' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.customYaraSignatures.description',
    {
      defaultMessage: 'Management of custom YARA signatures used with Elastic Defend.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeCustomYaraSignatures`, `${APP_ID}-readCustomYaraSignatures`],
          id: 'custom_yara_signatures_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeCustomYaraSignatures', 'readCustomYaraSignatures'],
        },
        {
          api: [`${APP_ID}-readCustomYaraSignatures`],
          id: 'custom_yara_signatures_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readCustomYaraSignatures'],
        },
      ],
    },
  ],
});

export const hostIsolationSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.hostIsolation',
    { defaultMessage: 'Host Isolation' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.hostIsolation.description',
    { defaultMessage: 'Perform the "isolate" and "release" response actions.' }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeHostIsolationRelease`],
          id: 'host_isolation_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeHostIsolationRelease'],
        },
      ],
    },
  ],
});

export const processOperationsSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.processOperations',
    { defaultMessage: 'Process Operations' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.processOperations.description',
    { defaultMessage: 'Perform process-related response actions in the response console.' }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeProcessOperations`],
          id: 'process_operations_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeProcessOperations'],
        },
      ],
    },
  ],
});
export const fileOperationsSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.fileOperations',
    { defaultMessage: 'File Operations' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.fileOperations.description',
    { defaultMessage: 'Perform file-related response actions in the response console.' }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeFileOperations`],
          id: 'file_operations_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeFileOperations'],
        },
      ],
    },
  ],
});

// execute operations are not available in 8.7,
// but will be available in 8.8
export const executeActionSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.executeOperations',
    { defaultMessage: 'Execute Operations' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.executeOperations.description',
    { defaultMessage: 'Perform script execution response actions in the response console.' }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeExecuteOperations`],
          id: 'execute_operations_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeExecuteOperations'],
        },
      ],
    },
  ],
});

// 8.15 feature
export const scanActionSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.scanOperations',
    { defaultMessage: 'Scan Operations' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.scanOperations.description',
    { defaultMessage: 'Perform folder scan response actions in the response console.' }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeScanOperations`],
          id: 'scan_operations_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeScanOperations'],
        },
      ],
    },
  ],
});

export const workflowInsightsSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.workflowInsights',
    { defaultMessage: 'Automatic Troubleshooting' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.workflowInsights.description',
    { defaultMessage: 'Access to the automatic troubleshooting.' }
  ),

  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-writeWorkflowInsights`, `${APP_ID}-readWorkflowInsights`],
          id: 'workflow_insights_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['writeWorkflowInsights', 'readWorkflowInsights'],
        },
        {
          api: [`${APP_ID}-readWorkflowInsights`],
          id: 'workflow_insights_read',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['readWorkflowInsights'],
        },
      ],
    },
  ],
});

export const endpointExceptionsSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.endpointExceptions',
    { defaultMessage: 'Endpoint Exceptions' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.endpointExceptions.description',
    {
      defaultMessage:
        'Reduce false positive alerts, and keep Elastic Defend from blocking standard processes.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          id: 'endpoint_exceptions_all',
          includeIn: 'none',
          name: TRANSLATIONS.all,
          savedObject: {
            all: [EXCEPTION_LIST_NAMESPACE_AGNOSTIC],
            read: [],
          },
          ui: ['showEndpointExceptions', 'crudEndpointExceptions'],
          api: [
            'lists-all',
            EXCEPTIONS_API_READ,
            EXCEPTIONS_API_ALL,
            'lists-read',
            'lists-summary',
            `${APP_ID}-showEndpointExceptions`,
            `${APP_ID}-crudEndpointExceptions`,
          ],
        },
        {
          id: 'endpoint_exceptions_read',
          includeIn: 'none',
          name: TRANSLATIONS.read,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['showEndpointExceptions'],
          api: [
            'lists-read',
            EXCEPTIONS_API_READ,
            'lists-summary',
            `${APP_ID}-showEndpointExceptions`,
          ],
        },
      ],
    },
  ],
});

/**
 * Writing global (i.e. not per-policy) Artifacts is gated with `Global Artifact Management: ALL`, starting with `siemV3`.
 *
 * **Role migration implemented:**
 * Users, who have been able to write ANY artifact before, are now granted with this privilege to keep existing behavior.
 * - for Trusted Apps, Event Filters, Host Isolation Exceptions, Blocklists: the new privilege is added based on `artifact:ALL` sub-feature privilege
 * - for Endpoint Exceptions:
 *   - on Serverless offering, the new privilege is added for Endpoint Exceptions sub-privilege `ALL`,
 *   - on ESS offering, there is no EE sub-privilege, so the new privilege is added to `siem|siemV2:ALL|MINIMAL_ALL`,
 *     as these include the Endpoint Exceptions write privilege
 *
 */
export const globalArtifactManagementSubFeature = (
  experimentalFeatures: SecurityFeatureParams['experimentalFeatures']
): SubFeatureConfig => {
  const GLOBAL_ARTIFACT_MANAGEMENT = i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.globalArtifactManagement',
    { defaultMessage: 'Global Artifact Management' }
  );

  return {
    name: GLOBAL_ARTIFACT_MANAGEMENT,
    description: i18n.translate(
      'securitySolutionPackages.features.featureRegistry.subFeatures.globalArtifactManagement.description',
      {
        defaultMessage:
          'Manage global assignment of endpoint artifacts (e.g., Trusted Applications, Event Filters) ' +
          'across all policies. This privilege controls global assignment rights only; privileges for each ' +
          'artifact type are required for full artifact management.',
      }
    ),
    privilegeGroups: [
      {
        groupType: 'mutually_exclusive',
        privileges: [
          {
            api: [`${APP_ID}-writeGlobalArtifacts`],
            id: 'global_artifact_management_all',
            includeIn: 'none',
            name: TRANSLATIONS.all,
            savedObject: {
              all: [],
              read: [],
            },
            ui: ['writeGlobalArtifacts'],
          },
        ],
      },
    ],
  };
};

export const socManagementSubFeature = (): SubFeatureConfig => ({
  name: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.socManagement',
    { defaultMessage: 'SOC Management' }
  ),
  description: i18n.translate(
    'securitySolutionPackages.features.featureRegistry.subFeatures.socManagement.description',
    {
      defaultMessage:
        'Access to SOC management capabilities including AI value reporting and analytics.',
    }
  ),
  privilegeGroups: [
    {
      groupType: 'mutually_exclusive',
      privileges: [
        {
          api: [`${APP_ID}-socManagement`],
          id: 'soc_management_all',
          includeIn: 'none',
          excludeFromBasePrivileges: true,
          name: TRANSLATIONS.all,
          savedObject: {
            all: [],
            read: [],
          },
          ui: ['socManagement'],
        },
      ],
    },
  ],
});
