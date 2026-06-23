/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ENDPOINT_PRIVILEGES, FleetAuthz } from '@kbn/fleet-plugin/common';

import { omit } from 'lodash';
import type { Capabilities } from '@kbn/core-capabilities-common';
import type { ProductFeaturesService } from '../../../../server/lib/product_features_service';
import {
  RESPONSE_CONSOLE_ACTION_COMMANDS_TO_REQUIRED_AUTHZ,
  CANCELLABLE_RESPONSE_ACTION_COMMANDS_TO_REQUIRED_AUTHZ,
} from '../response_actions/constants';
import type { LicenseService } from '../../../license';
import type { EndpointAuthz } from '../../types/authz';
import type { MaybeImmutable } from '../../types';

/**
 * Checks to see if a given Kibana privilege was granted.
 * Note that this only checks if the user has the privilege as part of their role. That
 * does not indicate that the user has the granted functionality behind that privilege
 * (ex. due to license level). To get an accurate representation of user's authorization
 * level, use `calculateEndpointAuthz()`
 *
 * @param fleetAuthz
 * @param productFeatureService
 */
function hasAuthFactory(fleetAuthz: FleetAuthz, productFeatureService?: ProductFeaturesService) {
  return function hasAuth(
    privilege: keyof typeof ENDPOINT_PRIVILEGES,
    { action }: { action?: string } = {}
  ): boolean {
    // Product features control
    if (productFeatureService) {
      // Only server side has to check this, to prevent "superuser" role from being allowed to use product gated APIs.
      // UI side does not need to check this. Capabilities list is correct for superuser.
      const actionToCheck = action ?? productFeatureService.getApiActionName(privilege);
      if (!productFeatureService.isActionRegistered(actionToCheck)) {
        return false;
      }
    }
    // Role access control
    if (privilege === 'showEndpointExceptions' || privilege === 'crudEndpointExceptions') {
      return fleetAuthz.endpointExceptionsPrivileges?.actions[privilege] ?? false;
    }
    return fleetAuthz.packagePrivileges?.endpoint?.actions[privilege].executePackageAction ?? false;
  };
}

/**
 * Used by both the server and the UI to generate the Authorization for access to Endpoint related
 * functionality
 *
 * @param licenseService
 * @param fleetAuthz
 * @param userRoles
 * @param productFeaturesService
 */
export const calculateEndpointAuthz = (
  licenseService: LicenseService,
  fleetAuthz: FleetAuthz,
  userRoles: MaybeImmutable<string[]> = [],
  isServerless: boolean,
  productFeaturesService?: ProductFeaturesService // only exists on the server side
): EndpointAuthz => {
  const hasAuth = hasAuthFactory(fleetAuthz, productFeaturesService);
  const hasSuperuserRole = userRoles.includes('superuser');
  const hasAdminRole = userRoles.includes('admin');

  const hasSuperuserPrivileges = isServerless ? hasAdminRole : hasSuperuserRole;

  const isPlatinumPlusLicense = licenseService.isPlatinumPlus();
  const isEnterpriseLicense = licenseService.isEnterprise();
  const hasEndpointManagementAccess = hasSuperuserRole;

  const canWriteSecuritySolution = hasAuth('writeSecuritySolution', { action: 'ui:crud' });
  const canReadSecuritySolution = hasAuth('readSecuritySolution', { action: 'ui:show' });
  const canWriteEndpointList = hasAuth('writeEndpointList');
  const canReadEndpointList = hasAuth('readEndpointList');
  const canWritePolicyManagement = hasAuth('writePolicyManagement');
  const canReadPolicyManagement = hasAuth('readPolicyManagement');
  const canWriteActionsLogManagement = hasAuth('writeActionsLogManagement');
  const canReadActionsLogManagement = hasAuth('readActionsLogManagement');
  const canIsolateHost = hasAuth('writeHostIsolation');
  const canUnIsolateHost = hasAuth('writeHostIsolationRelease');
  const canWriteProcessOperations = hasAuth('writeProcessOperations');
  const canWriteTrustedApplications = hasAuth('writeTrustedApplications');
  const canReadTrustedApplications = hasAuth('readTrustedApplications');
  const canWriteTrustedDevices = hasAuth('writeTrustedDevices');
  const canReadTrustedDevices = hasAuth('readTrustedDevices');
  const canWriteHostIsolationExceptions = hasAuth('writeHostIsolationExceptions');
  const canReadHostIsolationExceptions = hasAuth('readHostIsolationExceptions');
  const canAccessHostIsolationExceptions = hasAuth('accessHostIsolationExceptions');
  const canDeleteHostIsolationExceptions = hasAuth('deleteHostIsolationExceptions');
  const canWriteBlocklist = hasAuth('writeBlocklist');
  const canReadBlocklist = hasAuth('readBlocklist');
  const canWriteEventFilters = hasAuth('writeEventFilters');
  const canReadEventFilters = hasAuth('readEventFilters');
  const canWriteFileOperations = hasAuth('writeFileOperations');

  const canWriteExecuteOperations = hasAuth('writeExecuteOperations');
  const canWriteScanOperations = hasAuth('writeScanOperations');

  const canReadEndpointExceptions = hasAuth('showEndpointExceptions');
  const canWriteEndpointExceptions = hasAuth('crudEndpointExceptions');

  const canManageGlobalArtifacts = hasAuth('writeGlobalArtifacts');

  const canReadWorkflowInsights = hasAuth('readWorkflowInsights');
  const canWriteWorkflowInsights = hasAuth('writeWorkflowInsights');

  const canReadScriptsLibrary = hasAuth('readScriptsManagement');
  const canWriteScriptsLibrary = hasAuth('writeScriptsManagement');

  const canReadCustomYaraSignatures = hasAuth('readCustomYaraSignatures');
  const canWriteCustomYaraSignatures = hasAuth('writeCustomYaraSignatures');

  // These are currently tied to the superuser role on ESS and the admin role on Serverless
  const canReadAdminData = hasSuperuserPrivileges;
  const canWriteAdminData = hasSuperuserPrivileges;

  const authz: EndpointAuthz = {
    canWriteSecuritySolution,
    canReadSecuritySolution,

    // ---------------------------------------------------------
    // Coming from Fleet authz
    // ---------------------------------------------------------
    canAccessFleet: fleetAuthz?.fleet.all ?? false,
    canReadFleetAgentPolicies: fleetAuthz?.fleet.readAgentPolicies ?? false,
    canWriteFleetAgents: fleetAuthz?.fleet.allAgents ?? false,
    canReadFleetAgents: fleetAuthz?.fleet.readAgents ?? false,
    canWriteIntegrationPolicies: fleetAuthz?.integrations.writeIntegrationPolicies ?? false,

    // ---------------------------------------------------------
    // Endpoint & policy management
    // ---------------------------------------------------------
    canAccessEndpointManagement: hasEndpointManagementAccess, // TODO: is this one deprecated? it is the only place we need to check for superuser.
    canCreateArtifactsByPolicy: isPlatinumPlusLicense,
    canWriteEndpointList,
    canReadEndpointList,
    canWritePolicyManagement,
    canReadPolicyManagement,
    canWriteActionsLogManagement,
    canReadActionsLogManagement: canReadActionsLogManagement && isEnterpriseLicense,
    canAccessEndpointActionsLogManagement: canReadActionsLogManagement && isPlatinumPlusLicense,
    canReadWorkflowInsights: canReadWorkflowInsights && isEnterpriseLicense,
    canWriteWorkflowInsights: canWriteWorkflowInsights && isEnterpriseLicense,

    // ---------------------------------------------------------
    // Response Actions
    // ---------------------------------------------------------
    canIsolateHost: canIsolateHost && isPlatinumPlusLicense,
    canUnIsolateHost,
    canKillProcess: canWriteProcessOperations && isEnterpriseLicense,
    canSuspendProcess: canWriteProcessOperations && isEnterpriseLicense,
    canGetRunningProcesses: canWriteProcessOperations && isEnterpriseLicense,
    canAccessResponseConsole: false, // set further below
    canCancelAction: false, // set further below
    canWriteExecuteOperations: canWriteExecuteOperations && isEnterpriseLicense,
    canWriteFileOperations: canWriteFileOperations && isEnterpriseLicense,
    canWriteScanOperations: canWriteScanOperations && isEnterpriseLicense,

    // ---------------------------------------------------------
    // Scripts Library Management
    // ---------------------------------------------------------
    canReadScriptsLibrary: canReadScriptsLibrary && isEnterpriseLicense,
    canWriteScriptsLibrary: canWriteScriptsLibrary && isEnterpriseLicense,

    // ---------------------------------------------------------
    // artifacts
    // ---------------------------------------------------------
    canWriteTrustedApplications,
    canReadTrustedApplications,
    canWriteTrustedDevices: canWriteTrustedDevices && isEnterpriseLicense,
    canReadTrustedDevices: canReadTrustedDevices && isEnterpriseLicense,
    canWriteHostIsolationExceptions: canWriteHostIsolationExceptions && isPlatinumPlusLicense,
    canAccessHostIsolationExceptions: canAccessHostIsolationExceptions && isPlatinumPlusLicense,
    canReadHostIsolationExceptions,
    canDeleteHostIsolationExceptions,
    canWriteBlocklist,
    canReadBlocklist,
    canWriteEventFilters,
    canReadEventFilters,
    canReadEndpointExceptions,
    canWriteEndpointExceptions,
    canReadCustomYaraSignatures: canReadCustomYaraSignatures && isEnterpriseLicense,
    canWriteCustomYaraSignatures: canWriteCustomYaraSignatures && isEnterpriseLicense,
    canManageGlobalArtifacts,

    // ---------------------------------------------------------
    // Special Purpose
    // ---------------------------------------------------------
    canReadAdminData,
    canWriteAdminData,
  };

  // Response console is only accessible when license is Enterprise and user has access to any
  // of the response actions except `release``. Sole access to `release` is something
  // that is supported for a user in a license downgrade scenario, and in that case, we don't want
  // to allow access to Response Console.
  authz.canAccessResponseConsole =
    isEnterpriseLicense &&
    Object.values(omit(RESPONSE_CONSOLE_ACTION_COMMANDS_TO_REQUIRED_AUTHZ, 'release')).some(
      (responseActionAuthzKey) => {
        return authz[responseActionAuthzKey];
      }
    );

  // Cancel actions are accessible when user has access to any cancellable response action.
  // This follows the same pattern as canAccessResponseConsole, ensuring users can only cancel
  // actions they have permission to execute.
  authz.canCancelAction = Object.values(
    CANCELLABLE_RESPONSE_ACTION_COMMANDS_TO_REQUIRED_AUTHZ
  ).some((responseActionAuthzKey) => {
    return authz[responseActionAuthzKey];
  });

  return authz;
};

export const getEndpointAuthzInitialState = (): EndpointAuthz => {
  return {
    canWriteSecuritySolution: false,
    canReadSecuritySolution: false,
    canAccessFleet: false,
    canReadFleetAgentPolicies: false,
    canReadFleetAgents: false,
    canWriteFleetAgents: false,
    canWriteIntegrationPolicies: false,
    canAccessEndpointActionsLogManagement: false,
    canAccessEndpointManagement: false,
    canCreateArtifactsByPolicy: false,
    canWriteEndpointList: false,
    canReadEndpointList: false,
    canWritePolicyManagement: false,
    canReadPolicyManagement: false,
    canWriteActionsLogManagement: false,
    canReadActionsLogManagement: false,
    canIsolateHost: false,
    canUnIsolateHost: false,
    canKillProcess: false,
    canSuspendProcess: false,
    canGetRunningProcesses: false,
    canAccessResponseConsole: false,
    canCancelAction: false,
    canWriteFileOperations: false,
    canWriteExecuteOperations: false,
    canWriteScanOperations: false,
    canWriteTrustedApplications: false,
    canReadTrustedApplications: false,
    canWriteTrustedDevices: false,
    canReadTrustedDevices: false,
    canWriteHostIsolationExceptions: false,
    canAccessHostIsolationExceptions: false,
    canReadHostIsolationExceptions: false,
    canDeleteHostIsolationExceptions: false,
    canWriteBlocklist: false,
    canReadBlocklist: false,
    canWriteEventFilters: false,
    canReadEventFilters: false,
    canReadEndpointExceptions: false,
    canWriteEndpointExceptions: false,
    canManageGlobalArtifacts: false,
    canReadWorkflowInsights: false,
    canWriteWorkflowInsights: false,
    canReadAdminData: false,
    canWriteAdminData: false,
    canReadScriptsLibrary: false,
    canWriteScriptsLibrary: false,
    canReadCustomYaraSignatures: false,
    canWriteCustomYaraSignatures: false,
  };
};

/**
 * Duplicate logic to calculate if user has privilege to fetch Agent Policies,
 * working only with Capabilities, in order to be able to use it e.g. in middleware.
 *
 * The logic works with Fleet granular privileges (`subfeaturePrivileges`) both enabled and disabled.
 *
 * @param capabilities Capabilities from coreStart.application
 */
export const canFetchPackageAndAgentPolicies = (capabilities: Capabilities): boolean => {
  const canReadPolicyManagement = Boolean(capabilities.siem?.readPolicyManagement);

  const fleetv2 = capabilities.fleetv2;
  const canReadFleetAgentPolicies = Boolean(
    fleetv2?.read && (fleetv2?.agent_policies_read ?? true)
  );

  const canReadIntegrations = Boolean(capabilities.fleet?.read);

  return canReadPolicyManagement || (canReadFleetAgentPolicies && canReadIntegrations);
};
