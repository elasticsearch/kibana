/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { deepFreeze } from '@kbn/std';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core-application-common';

export const SECURITY_SOLUTION_APP_ID = 'siemV5';

export interface PrivilegeMapObject {
  appId: string;
  privilegeSplit: string;
  privilegeType: 'ui' | 'api';
  privilegeName: string;
}

/**
 * defines endpoint package privileges
 * the key is the name of the packagePrivilege (ie. 'readSecuritySolution')
 * the value object is for mapping kibana privileges and capabilities
 * see x-pack/platform/plugins/shared/fleet/server/services/security/security.ts for example of how object values are used
 */
export const ENDPOINT_PRIVILEGES: Record<string, PrivilegeMapObject> = deepFreeze({
  readSecuritySolution: {
    appId: SECURITY_SOLUTION_APP_ID,
    privilegeSplit: '/',
    privilegeType: 'ui',
    privilegeName: 'show',
  },
  writeSecuritySolution: {
    appId: SECURITY_SOLUTION_APP_ID,
    privilegeSplit: '/',
    privilegeType: 'ui',
    privilegeName: 'crud',
  },
  writeEndpointList: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeEndpointList',
  },
  readEndpointList: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readEndpointList',
  },
  writeTrustedApplications: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeTrustedApplications',
  },
  readTrustedApplications: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readTrustedApplications',
  },
  writeTrustedDevices: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeTrustedDevices',
  },
  readTrustedDevices: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readTrustedDevices',
  },
  writeHostIsolationExceptions: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeHostIsolationExceptions',
  },
  readHostIsolationExceptions: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readHostIsolationExceptions',
  },
  accessHostIsolationExceptions: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'accessHostIsolationExceptions',
  },
  deleteHostIsolationExceptions: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'deleteHostIsolationExceptions',
  },
  writeBlocklist: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeBlocklist',
  },
  readBlocklist: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readBlocklist',
  },
  writeEventFilters: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeEventFilters',
  },
  readEventFilters: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readEventFilters',
  },
  showEndpointExceptions: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'showEndpointExceptions',
  },
  crudEndpointExceptions: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'crudEndpointExceptions',
  },
  writeGlobalArtifacts: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeGlobalArtifacts',
  },
  writePolicyManagement: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writePolicyManagement',
  },
  readPolicyManagement: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readPolicyManagement',
  },
  readScriptsManagement: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readScriptsManagement',
  },
  writeScriptsManagement: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeScriptsManagement',
  },
  writeCustomYaraSignatures: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeCustomYaraSignatures',
  },
  readCustomYaraSignatures: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readCustomYaraSignatures',
  },
  writeActionsLogManagement: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeActionsLogManagement',
  },
  readActionsLogManagement: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readActionsLogManagement',
  },
  writeHostIsolation: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeHostIsolation',
  },
  writeHostIsolationRelease: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeHostIsolationRelease',
  },
  writeProcessOperations: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeProcessOperations',
  },
  writeFileOperations: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeFileOperations',
  },
  writeExecuteOperations: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeExecuteOperations',
  },
  writeScanOperations: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeScanOperations',
  },
  writeWorkflowInsights: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'writeWorkflowInsights',
  },
  readWorkflowInsights: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'readWorkflowInsights',
  },
});

export const ENDPOINT_EXCEPTIONS_PRIVILEGES: Record<string, PrivilegeMapObject> = deepFreeze({
  showEndpointExceptions: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'showEndpointExceptions',
  },
  crudEndpointExceptions: {
    appId: DEFAULT_APP_CATEGORIES.security.id,
    privilegeSplit: '-',
    privilegeType: 'api',
    privilegeName: 'crudEndpointExceptions',
  },
});
