/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EPM_API_ROOT,
  EPM_API_ROUTES,
  PACKAGE_POLICY_API_ROUTES,
  AGENT_POLICY_API_ROUTES,
  DATA_STREAM_API_ROUTES,
  AGENTS_SETUP_API_ROUTES,
  AGENT_API_ROUTES,
  ENROLLMENT_API_KEY_ROUTES,
  SETUP_API_ROUTE,
  OUTPUT_API_ROUTES,
  SETTINGS_API_ROUTES,
  APP_API_ROUTES,
  K8S_API_ROUTES,
  PRECONFIGURATION_API_ROUTES,
  DOWNLOAD_SOURCE_API_ROUTES,
  FLEET_SERVER_HOST_API_ROUTES,
  FLEET_PROXY_API_ROUTES,
  UNINSTALL_TOKEN_ROUTES,
  FLEET_DEBUG_ROUTES,
  REMOTE_SYNCED_INTEGRATIONS_API_ROUTES,
  AGENTLESS_POLICIES_ROUTES,
} from '../constants';

export const epmRouteService = {
  getVerificationKeyIdPath: () => {
    return EPM_API_ROUTES.VERIFICATION_KEY_ID;
  },

  getCategoriesPath: () => {
    return EPM_API_ROUTES.CATEGORIES_PATTERN;
  },

  getListPath: () => {
    return EPM_API_ROUTES.LIST_PATTERN;
  },

  getListLimitedPath: () => {
    return EPM_API_ROUTES.LIMITED_LIST_PATTERN;
  },

  getDatastreamsPath: () => {
    return EPM_API_ROUTES.DATA_STREAMS_PATTERN;
  },

  getInfoPath: (pkgName: string, pkgVersion?: string) => {
    if (pkgVersion) {
      return EPM_API_ROUTES.INFO_PATTERN.replace('{pkgName}', pkgName).replace(
        '{pkgVersion}',
        pkgVersion
      );
    }

    return EPM_API_ROUTES.INFO_WITHOUT_VERSION_PATTERN.replace('{pkgName}', pkgName);
  },

  getStatsPath: (pkgName: string) => {
    return EPM_API_ROUTES.STATS_PATTERN.replace('{pkgName}', pkgName);
  },

  getDependenciesPath: (pkgName: string, pkgVersion: string) => {
    return EPM_API_ROUTES.DEPENDENCIES_PATTERN.replace('{pkgName}', pkgName).replace(
      '{pkgVersion}',
      pkgVersion
    );
  },

  getFilePath: (filePath: string) => {
    return `${EPM_API_ROOT}${filePath.replace('/package', '/packages')}`;
  },

  getInstallPath: (pkgName: string, pkgVersion?: string) => {
    if (pkgVersion) {
      return EPM_API_ROUTES.INSTALL_FROM_REGISTRY_PATTERN.replace('{pkgName}', pkgName)
        .replace('{pkgVersion}', pkgVersion)
        .replace(/\/$/, ''); // trim trailing slash
    }

    return EPM_API_ROUTES.INSTALL_FROM_REGISTRY_WITHOUT_VERSION_PATTERN.replace(
      '{pkgName}',
      pkgName
    ).replace(/\/$/, ''); // trim trailing slash
  },

  getBulkInstallPath: () => {
    return EPM_API_ROUTES.BULK_INSTALL_PATTERN;
  },

  getBulkUpgradePath: () => {
    return EPM_API_ROUTES.BULK_UPGRADE_PATTERN;
  },

  getBulkUninstallPath: () => {
    return EPM_API_ROUTES.BULK_UNINSTALL_PATTERN;
  },

  getOneBulkUpgradePath: (taskId: string) => {
    return EPM_API_ROUTES.BULK_UPGRADE_INFO_PATTERN.replace('{taskId}', taskId);
  },

  getOneBulkUninstallPath: (taskId: string) => {
    return EPM_API_ROUTES.BULK_UNINSTALL_INFO_PATTERN.replace('{taskId}', taskId);
  },

  getBulkRollbackPath: () => {
    return EPM_API_ROUTES.BULK_ROLLBACK_PATTERN;
  },

  getBulkRollbackInfoPath: (taskId: string) => {
    return EPM_API_ROUTES.BULK_ROLLBACK_INFO_PATTERN.replace('{taskId}', taskId);
  },

  getRollbackAvailableCheckPath: (pkgName: string) => {
    return EPM_API_ROUTES.ROLLBACK_AVAILABLE_CHECK_PATTERN.replace('{pkgName}', pkgName);
  },

  getBulkRollbackAvailableCheckPath: () => {
    return EPM_API_ROUTES.BULK_ROLLBACK_AVAILABLE_CHECK_PATTERN;
  },

  getRemovePath: (pkgName: string, pkgVersion?: string) => {
    if (pkgVersion) {
      return EPM_API_ROUTES.DELETE_PATTERN.replace('{pkgName}', pkgName)
        .replace('{pkgVersion}', pkgVersion)
        .replace(/\/$/, ''); // trim trailing slash
    }

    return EPM_API_ROUTES.DELETE_WITHOUT_VERSION_PATTERN.replace('{pkgName}', pkgName).replace(
      /\/$/,
      ''
    ); // trim trailing slash
  },

  getInstallKibanaAssetsPath: (pkgName: string, pkgVersion: string) => {
    return EPM_API_ROUTES.INSTALL_KIBANA_ASSETS_PATTERN.replace('{pkgName}', pkgName)
      .replace('{pkgVersion}', pkgVersion)
      .replace(/\/$/, ''); // trim trailing slash
  },

  getInstallRuleAssetsPath: (pkgName: string, pkgVersion: string) => {
    return EPM_API_ROUTES.INSTALL_RULE_ASSETS_PATTERN.replace('{pkgName}', pkgName)
      .replace('{pkgVersion}', pkgVersion)
      .replace(/\/$/, ''); // trim trailing slash
  },

  getUpdatePath: (pkgName: string, pkgVersion: string) => {
    return EPM_API_ROUTES.INFO_PATTERN.replace('{pkgName}', pkgName).replace(
      '{pkgVersion}',
      pkgVersion
    );
  },

  getReviewUpgradePath: (pkgName: string) => {
    return EPM_API_ROUTES.REVIEW_UPGRADE_PATTERN.replace('{pkgName}', pkgName);
  },

  getReauthorizeTransformsPath: (pkgName: string, pkgVersion: string) => {
    return EPM_API_ROUTES.REAUTHORIZE_TRANSFORMS.replace('{pkgName}', pkgName)
      .replace('{pkgVersion}', pkgVersion)
      .replace(/\/$/, ''); // trim trailing slash
  },
  getBulkAssetsPath: () => {
    return EPM_API_ROUTES.BULK_ASSETS_PATTERN;
  },
  getInputsTemplatesPath: (pkgName: string, pkgVersion: string) => {
    return EPM_API_ROUTES.INPUTS_PATTERN.replace('{pkgName}', pkgName).replace(
      '{pkgVersion}',
      pkgVersion
    );
  },
  getUpdateCustomIntegrationsPath: (pkgName: string) => {
    return EPM_API_ROUTES.UPDATE_CUSTOM_INTEGRATIONS_PATTERN.replace('{pkgName}', pkgName);
  },
  getDeletePackageDatastreamAssets: (pkgName: string, pkgVersion: string) => {
    return EPM_API_ROUTES.PACKAGES_DATASTREAM_ASSETS.replace('{pkgName}', pkgName).replace(
      '{pkgVersion}',
      pkgVersion
    );
  },
};

export const packagePolicyRouteService = {
  getListPath: () => {
    return PACKAGE_POLICY_API_ROUTES.LIST_PATTERN;
  },

  getInfoPath: (packagePolicyId: string) => {
    return PACKAGE_POLICY_API_ROUTES.INFO_PATTERN.replace('{packagePolicyId}', packagePolicyId);
  },

  getCreatePath: () => {
    return PACKAGE_POLICY_API_ROUTES.CREATE_PATTERN;
  },

  getUpdatePath: (packagePolicyId: string) => {
    return PACKAGE_POLICY_API_ROUTES.UPDATE_PATTERN.replace('{packagePolicyId}', packagePolicyId);
  },

  getDeletePath: () => {
    return PACKAGE_POLICY_API_ROUTES.DELETE_PATTERN;
  },

  getUpgradePath: () => {
    return PACKAGE_POLICY_API_ROUTES.UPGRADE_PATTERN;
  },

  getDryRunPath: () => {
    return PACKAGE_POLICY_API_ROUTES.DRYRUN_PATTERN;
  },

  getOrphanedIntegrationPoliciesPath: () => {
    return PACKAGE_POLICY_API_ROUTES.ORPHANED_INTEGRATION_POLICIES;
  },

  getBulkGetPath: (): string => {
    return PACKAGE_POLICY_API_ROUTES.BULK_GET_PATTERN;
  },
};

export const agentlessPolicyRouteService = {
  getCreatePath: () => {
    return AGENTLESS_POLICIES_ROUTES.CREATE_PATTERN;
  },
  getDeletePath: (policyId: string) => {
    return AGENTLESS_POLICIES_ROUTES.DELETE_PATTERN.replace('{policyId}', policyId);
  },
  getBulkThroughputPath: () => {
    return AGENTLESS_POLICIES_ROUTES.BULK_THROUGHPUT_PATTERN;
  },
};

export const agentPolicyRouteService = {
  getListPath: () => {
    return AGENT_POLICY_API_ROUTES.LIST_PATTERN;
  },

  getBulkGetPath: () => {
    return AGENT_POLICY_API_ROUTES.BULK_GET_PATTERN;
  },

  getInfoPath: (agentPolicyId: string) => {
    return AGENT_POLICY_API_ROUTES.INFO_PATTERN.replace('{agentPolicyId}', agentPolicyId);
  },

  getAutoUpgradeAgentsStatusPath: (agentPolicyId: string) => {
    return AGENT_POLICY_API_ROUTES.AUTO_UPGRADE_AGENTS_STATUS_PATTERN.replace(
      '{agentPolicyId}',
      agentPolicyId
    );
  },

  getCreatePath: () => {
    return AGENT_POLICY_API_ROUTES.CREATE_PATTERN;
  },

  getUpdatePath: (agentPolicyId: string) => {
    return AGENT_POLICY_API_ROUTES.UPDATE_PATTERN.replace('{agentPolicyId}', agentPolicyId);
  },

  getCopyPath: (agentPolicyId: string) => {
    return AGENT_POLICY_API_ROUTES.COPY_PATTERN.replace('{agentPolicyId}', agentPolicyId);
  },

  getDeletePath: () => {
    return AGENT_POLICY_API_ROUTES.DELETE_PATTERN;
  },

  getInfoFullPath: (agentPolicyId: string) => {
    return AGENT_POLICY_API_ROUTES.FULL_INFO_PATTERN.replace('{agentPolicyId}', agentPolicyId);
  },

  getInfoFullDownloadPath: (agentPolicyId: string) => {
    return AGENT_POLICY_API_ROUTES.FULL_INFO_DOWNLOAD_PATTERN.replace(
      '{agentPolicyId}',
      agentPolicyId
    );
  },

  getK8sInfoPath: () => {
    return K8S_API_ROUTES.K8S_INFO_PATTERN;
  },

  getK8sFullDownloadPath: () => {
    return K8S_API_ROUTES.K8S_DOWNLOAD_PATTERN;
  },

  getResetOnePreconfiguredAgentPolicyPath: (agentPolicyId: string) => {
    return PRECONFIGURATION_API_ROUTES.RESET_ONE_PATTERN.replace(`{agentPolicyId}`, agentPolicyId);
  },

  getResetAllPreconfiguredAgentPolicyPath: () => {
    return PRECONFIGURATION_API_ROUTES.RESET_PATTERN;
  },

  getInfoOutputsPath: (agentPolicyId: string) => {
    return AGENT_POLICY_API_ROUTES.INFO_OUTPUTS_PATTERN.replace('{agentPolicyId}', agentPolicyId);
  },

  getListOutputsPath: () => {
    return AGENT_POLICY_API_ROUTES.LIST_OUTPUTS_PATTERN;
  },
};

export const dataStreamRouteService = {
  getListPath: () => {
    return DATA_STREAM_API_ROUTES.LIST_PATTERN;
  },
  getDeprecatedILMCheckPath: () => {
    return DATA_STREAM_API_ROUTES.DEPRECATED_ILM_CHECK_PATTERN;
  },
};

export const fleetSetupRouteService = {
  getFleetSetupPath: () => AGENTS_SETUP_API_ROUTES.INFO_PATTERN,
  postFleetSetupPath: () => AGENTS_SETUP_API_ROUTES.CREATE_PATTERN,
};

export const agentRouteService = {
  getInfoPath: (agentId: string) => AGENT_API_ROUTES.INFO_PATTERN.replace('{agentId}', agentId),
  getUpdatePath: (agentId: string) => AGENT_API_ROUTES.UPDATE_PATTERN.replace('{agentId}', agentId),
  getBulkUpdateTagsPath: () => AGENT_API_ROUTES.BULK_UPDATE_AGENT_TAGS_PATTERN,
  getUnenrollPath: (agentId: string) =>
    AGENT_API_ROUTES.UNENROLL_PATTERN.replace('{agentId}', agentId),
  getBulkUnenrollPath: () => AGENT_API_ROUTES.BULK_UNENROLL_PATTERN,
  getRemoveCollectorPath: (agentId: string) =>
    AGENT_API_ROUTES.REMOVE_COLLECTOR_PATTERN.replace('{agentId}', agentId),
  getBulkRemoveCollectorsPath: () => AGENT_API_ROUTES.BULK_REMOVE_COLLECTORS_PATTERN,
  getReassignPath: (agentId: string) =>
    AGENT_API_ROUTES.REASSIGN_PATTERN.replace('{agentId}', agentId),
  getBulkReassignPath: () => AGENT_API_ROUTES.BULK_REASSIGN_PATTERN,
  getUpgradePath: (agentId: string) =>
    AGENT_API_ROUTES.UPGRADE_PATTERN.replace('{agentId}', agentId),
  getBulkUpgradePath: () => AGENT_API_ROUTES.BULK_UPGRADE_PATTERN,
  getActionStatusPath: () => AGENT_API_ROUTES.ACTION_STATUS_PATTERN,
  getCancelActionPath: (actionId: string) =>
    AGENT_API_ROUTES.CANCEL_ACTIONS_PATTERN.replace('{actionId}', actionId),
  getListPath: () => AGENT_API_ROUTES.LIST_PATTERN,
  getStatusPath: () => AGENT_API_ROUTES.STATUS_PATTERN,
  getIncomingDataPath: () => AGENT_API_ROUTES.DATA_PATTERN,
  getCreateActionPath: (agentId: string) =>
    AGENT_API_ROUTES.ACTIONS_PATTERN.replace('{agentId}', agentId),
  getListTagsPath: () => AGENT_API_ROUTES.LIST_TAGS_PATTERN,
  getAvailableVersionsPath: () => AGENT_API_ROUTES.AVAILABLE_VERSIONS_PATTERN,
  getRequestDiagnosticsPath: (agentId: string) =>
    AGENT_API_ROUTES.REQUEST_DIAGNOSTICS_PATTERN.replace('{agentId}', agentId),
  getBulkRequestDiagnosticsPath: () => AGENT_API_ROUTES.BULK_REQUEST_DIAGNOSTICS_PATTERN,
  getListAgentUploads: (agentId: string) =>
    AGENT_API_ROUTES.LIST_UPLOADS_PATTERN.replace('{agentId}', agentId),
  getAgentFileDownloadLink: (fileId: string, fileName: string) =>
    AGENT_API_ROUTES.GET_UPLOAD_FILE_PATTERN.replace('{fileId}', fileId).replace(
      '{fileName}',
      fileName
    ),
  getAgentFileDeletePath: (fileId: string) =>
    AGENT_API_ROUTES.DELETE_UPLOAD_FILE_PATTERN.replace('{fileId}', fileId),
  getAgentsByActionsPath: () => AGENT_API_ROUTES.LIST_PATTERN,
  postMigrateSingleAgent: (agentId: string) =>
    AGENT_API_ROUTES.MIGRATE_PATTERN.replace('{agentId}', agentId),
  postBulkMigrateAgents: () => AGENT_API_ROUTES.BULK_MIGRATE_PATTERN,
  postChangeAgentPrivilegeLevel: (agentId: string) =>
    AGENT_API_ROUTES.PRIVILEGE_LEVEL_CHANGE_PATTERN.replace('{agentId}', agentId),
  postBulkChangeAgentPrivilegeLevel: () => AGENT_API_ROUTES.BULK_PRIVILEGE_LEVEL_CHANGE_PATTERN,
  postAgentRollback: (agentId: string) =>
    AGENT_API_ROUTES.ROLLBACK_PATTERN.replace('{agentId}', agentId),
  postBulkAgentRollback: () => AGENT_API_ROUTES.BULK_ROLLBACK_PATTERN,
  postGenerateAgentsReport: () => AGENT_API_ROUTES.GENERATE_REPORT_PATTERN,
  getAgentEffectiveConfig: (agentId: string) =>
    AGENT_API_ROUTES.EFFECTIVE_CONFIG_PATTERN.replace('{agentId}', agentId),
};

export const outputRoutesService = {
  getInfoPath: (outputId: string) => OUTPUT_API_ROUTES.INFO_PATTERN.replace('{outputId}', outputId),
  getUpdatePath: (outputId: string) =>
    OUTPUT_API_ROUTES.UPDATE_PATTERN.replace('{outputId}', outputId),
  getListPath: () => OUTPUT_API_ROUTES.LIST_PATTERN,
  getDeletePath: (outputId: string) =>
    OUTPUT_API_ROUTES.DELETE_PATTERN.replace('{outputId}', outputId),
  getCreatePath: () => OUTPUT_API_ROUTES.CREATE_PATTERN,
  getCreateLogstashApiKeyPath: () => OUTPUT_API_ROUTES.LOGSTASH_API_KEY_PATTERN,
  getOutputHealthPath: (outputId: string) =>
    OUTPUT_API_ROUTES.GET_OUTPUT_HEALTH_PATTERN.replace('{outputId}', outputId),
  getRemoteSyncedIntegrationsStatusPath: (outputId: string) =>
    REMOTE_SYNCED_INTEGRATIONS_API_ROUTES.INFO_PATTERN.replace('{outputId}', outputId),
};

export const fleetProxiesRoutesService = {
  getInfoPath: (itemId: string) => FLEET_PROXY_API_ROUTES.INFO_PATTERN.replace('{itemId}', itemId),
  getUpdatePath: (itemId: string) =>
    FLEET_PROXY_API_ROUTES.UPDATE_PATTERN.replace('{itemId}', itemId),
  getListPath: () => FLEET_PROXY_API_ROUTES.LIST_PATTERN,
  getDeletePath: (itemId: string) =>
    FLEET_PROXY_API_ROUTES.DELETE_PATTERN.replace('{itemId}', itemId),
  getCreatePath: () => FLEET_PROXY_API_ROUTES.CREATE_PATTERN,
};

export const fleetServerHostsRoutesService = {
  getInfoPath: (itemId: string) =>
    FLEET_SERVER_HOST_API_ROUTES.INFO_PATTERN.replace('{itemId}', itemId),
  getUpdatePath: (itemId: string) =>
    FLEET_SERVER_HOST_API_ROUTES.UPDATE_PATTERN.replace('{itemId}', itemId),
  getListPath: () => FLEET_SERVER_HOST_API_ROUTES.LIST_PATTERN,
  getDeletePath: (itemId: string) =>
    FLEET_SERVER_HOST_API_ROUTES.DELETE_PATTERN.replace('{itemId}', itemId),
  getCreatePath: () => FLEET_SERVER_HOST_API_ROUTES.CREATE_PATTERN,
  getPolicyStatusPath: () => FLEET_SERVER_HOST_API_ROUTES.POLICY_STATUS_PATTERN,
};

export const settingsRoutesService = {
  getInfoPath: () => SETTINGS_API_ROUTES.INFO_PATTERN,
  getUpdatePath: () => SETTINGS_API_ROUTES.UPDATE_PATTERN,
  getEnrollmentInfoPath: () => SETTINGS_API_ROUTES.ENROLLMENT_INFO_PATTERN,
  getSpaceInfoPath: () => SETTINGS_API_ROUTES.SPACE_INFO_PATTERN,
  postSpaceAwarenessMigrationPath: () => APP_API_ROUTES.SPACE_AWARENESS_MIGRATION,
};

export const appRoutesService = {
  getCheckPermissionsPath: () => APP_API_ROUTES.CHECK_PERMISSIONS_PATTERN,
  getRegenerateServiceTokenPath: () => APP_API_ROUTES.GENERATE_SERVICE_TOKEN_PATTERN,
  postHealthCheckPath: () => APP_API_ROUTES.HEALTH_CHECK_PATTERN,
  getAgentPoliciesSpacesPath: () => APP_API_ROUTES.AGENT_POLICIES_SPACES,
};

export const enrollmentAPIKeyRouteService = {
  getListPath: () => ENROLLMENT_API_KEY_ROUTES.LIST_PATTERN,
  getCreatePath: () => ENROLLMENT_API_KEY_ROUTES.CREATE_PATTERN,
  getInfoPath: (keyId: string) => ENROLLMENT_API_KEY_ROUTES.INFO_PATTERN.replace('{keyId}', keyId),
  getDeletePath: (keyId: string) =>
    ENROLLMENT_API_KEY_ROUTES.DELETE_PATTERN.replace('{keyId}', keyId),
  getBulkDeletePath: () => ENROLLMENT_API_KEY_ROUTES.BULK_DELETE_PATTERN,
};

export const uninstallTokensRouteService = {
  getListPath: () => UNINSTALL_TOKEN_ROUTES.LIST_PATTERN,
  getInfoPath: (uninstallTokenId: string) =>
    UNINSTALL_TOKEN_ROUTES.INFO_PATTERN.replace('{uninstallTokenId}', uninstallTokenId),
};

export const setupRouteService = {
  getSetupPath: () => SETUP_API_ROUTE,
};

export const downloadSourceRoutesService = {
  getInfoPath: (downloadSourceId: string) =>
    DOWNLOAD_SOURCE_API_ROUTES.INFO_PATTERN.replace('{sourceId}', downloadSourceId),
  getUpdatePath: (downloadSourceId: string) =>
    DOWNLOAD_SOURCE_API_ROUTES.UPDATE_PATTERN.replace('{sourceId}', downloadSourceId),
  getListPath: () => DOWNLOAD_SOURCE_API_ROUTES.LIST_PATTERN,
  getDeletePath: (downloadSourceId: string) =>
    DOWNLOAD_SOURCE_API_ROUTES.DELETE_PATTERN.replace('{sourceId}', downloadSourceId),
  getCreatePath: () => DOWNLOAD_SOURCE_API_ROUTES.CREATE_PATTERN,
};

export const debugRoutesService = {
  getIndexPath: () => FLEET_DEBUG_ROUTES.INDEX_PATTERN,
  getSavedObjectsPath: () => FLEET_DEBUG_ROUTES.SAVED_OBJECTS_PATTERN,
  getSavedObjectNamesPath: () => FLEET_DEBUG_ROUTES.SAVED_OBJECT_NAMES_PATTERN,
};
