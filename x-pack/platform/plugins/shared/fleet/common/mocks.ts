/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type DeepPartial } from '@kbn/utility-types';

import type {
  AgentPolicy,
  AgentlessPolicy,
  InstallSource,
  NewPackagePolicy,
  PackageInfo,
  PackagePolicy,
  PostDeletePackagePoliciesResponse,
} from './types';
import type { FleetAuthz } from './authz';
import { dataTypes, ENDPOINT_PRIVILEGES } from './constants';

export const createNewPackagePolicyMock = (): NewPackagePolicy => {
  return {
    name: 'endpoint-1',
    description: '',
    namespace: 'default',
    enabled: true,
    policy_id: '93c46720-c217-11ea-9906-b5b8a21b268e',
    policy_ids: ['93c46720-c217-11ea-9906-b5b8a21b268e'],
    package: {
      name: 'endpoint',
      title: 'Elastic Endpoint',
      version: '0.9.0',
    },
    inputs: [],
  };
};

export const createPackagePolicyMock = (): PackagePolicy => {
  const newPackagePolicy = createNewPackagePolicyMock();
  return {
    ...newPackagePolicy,
    id: 'c6d16e42-c32d-4dce-8a88-113cfe276ad1',
    version: 'abcd',
    revision: 1,
    updated_at: '2020-06-25T16:03:38.159292',
    updated_by: 'kibana',
    created_at: '2020-06-25T16:03:38.159292',
    created_by: 'kibana',
    inputs: [
      {
        config: {},
        enabled: true,
        type: 'endpoint',
        streams: [],
      },
    ],
  };
};

export const deletePackagePolicyMock = (): PostDeletePackagePoliciesResponse => {
  const newPackagePolicy = createNewPackagePolicyMock();
  return [
    {
      id: 'c6d16e42-c32d-4dce-8a88-113cfe276ad1',
      success: true,
      package: newPackagePolicy.package,
    },
  ];
};

/**
 * Creates mock `authz` object
 */
export const createFleetAuthzMock = (): FleetAuthz => {
  const endpointActions = Object.keys(ENDPOINT_PRIVILEGES).reduce((acc, privilege) => {
    return {
      ...acc,
      [privilege]: {
        executePackageAction: true,
      },
    };
  }, {});

  return {
    fleet: {
      all: true,
      setup: true,
      readAgents: true,
      readEnrollmentTokens: true,
      readAgentPolicies: true,
      allAgentPolicies: true,
      allAgents: true,
      allSettings: true,
      readSettings: true,
      addAgents: true,
      addFleetServers: true,
      generateAgentReports: true,
    },
    integrations: {
      all: true,
      readPackageInfo: true,
      readInstalledPackages: true,
      installPackages: true,
      upgradePackages: true,
      uploadPackages: true,
      removePackages: true,
      readPackageSettings: true,
      writePackageSettings: true,
      readIntegrationPolicies: true,
      writeIntegrationPolicies: true,
    },
    packagePrivileges: {
      endpoint: {
        actions: endpointActions,
      },
      transform: {
        actions: {
          canCreateTransform: { executePackageAction: true },
          canDeleteTransform: { executePackageAction: true },
          canGetTransform: { executePackageAction: true },
          canStartStopTransform: { executePackageAction: true },
        },
      },
    },
    endpointExceptionsPrivileges: {
      actions: {
        showEndpointExceptions: true,
        crudEndpointExceptions: true,
      },
    },
  };
};

export const createAgentPolicyMock = (overrideProps?: Partial<AgentPolicy>): AgentPolicy => {
  return {
    id: 'agent-policy-1',
    name: 'agent-policy-1',
    description: 'an agent policy',
    status: 'active',
    namespace: 'default',
    monitoring_enabled: Object.values(dataTypes),
    inactivity_timeout: 1209600,
    updated_at: '2023-06-30T16:03:38.159292',
    updated_by: 'user-1',
    revision: 1,
    is_managed: false,
    is_protected: false,
    ...overrideProps,
  };
};

export const createAgentlessPolicyMock = (
  overrideProps?: Partial<AgentlessPolicy>
): AgentlessPolicy => {
  return {
    id: 'agentless-policy-1',
    name: 'agentless-policy-1',
    description: 'an agentless policy',
    namespace: 'default',
    package: {
      name: 'agentless_hello_world',
      title: 'Elastic Hello World',
      version: '0.5.0',
    },
    inputs: {},
    created_at: '2023-06-30T16:03:38.159292',
    created_by: 'user-1',
    updated_at: '2023-06-30T16:03:38.159292',
    updated_by: 'user-1',
    ...overrideProps,
  };
};

interface CreatePackageInfoMockOpts {
  installSource: InstallSource;
  agentless: {
    enabled: boolean;
    withGlobalDataTags: boolean;
    withResources: boolean;
  };
}

const defaultCreatePackageInfoMockOpts: CreatePackageInfoMockOpts = {
  installSource: 'registry',
  agentless: {
    enabled: true,
    withGlobalDataTags: true,
    withResources: true,
  },
};

export const createPackageInfoMock = (
  opts?: DeepPartial<CreatePackageInfoMockOpts>
): PackageInfo => {
  const _opts: CreatePackageInfoMockOpts = {
    ...defaultCreatePackageInfoMockOpts,
    ...opts,
    agentless: {
      ...defaultCreatePackageInfoMockOpts.agentless,
      ...opts?.agentless,
    },
  };

  const agentlessResources = _opts.agentless.withResources
    ? {
        requests: {
          memory: '256Mi',
          cpu: '100m',
        },
      }
    : undefined;

  const agentlessGlobalDataTags = _opts.agentless.withGlobalDataTags
    ? {
        organization: 'org',
        division: 'div',
        team: 'team',
      }
    : {};

  return {
    status: 'installed',
    type: 'integration',
    name: 'test',
    title: 'Test',
    latestVersion: '0.0.1',
    assets: { kibana: undefined, elasticsearch: undefined },
    version: '0.0.1',
    owner: {
      type: 'community',
    },
    savedObject: {
      id: 'abc-def',
      type: 'integration',
      attributes: {
        name: 'test',
        version: '0.0.1',
        installed_es: [],
        es_index_patterns: {},
        installed_kibana: [],
        install_status: 'installed',
        install_version: '0.0.1',
        install_started_at: new Date().toUTCString(),
        verification_status: 'unknown',
        install_source: _opts.installSource,
      },
    },
    policy_templates: [
      {
        name: 'cspm',
        title: 'Template 1',
        description: '',
        deployment_modes: {
          default: {
            enabled: true,
          },
          agentless: {
            enabled: _opts.agentless.enabled,
            ...agentlessGlobalDataTags,
            resources: agentlessResources,
          },
        },
      },
      {
        name: 'not-cspm',
        title: 'Template 2',
        description: '',
        deployment_modes: {
          default: {
            enabled: true,
          },
          agentless: {
            enabled: false,
          },
        },
      },
    ],
  };
};
