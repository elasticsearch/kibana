/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { of } from 'rxjs';

import {
  coreMock,
  elasticsearchServiceMock,
  loggingSystemMock,
  savedObjectsClientMock,
  savedObjectsServiceMock,
  securityServiceMock,
} from '@kbn/core/server/mocks';
import { dataPluginMock } from '@kbn/data-plugin/server/mocks';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { securityMock } from '@kbn/security-plugin/server/mocks';
import { cloudMock } from '@kbn/cloud-plugin/public/mocks';
import { SPACES_EXTENSION_ID } from '@kbn/core-saved-objects-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { reportingMock } from '@kbn/reporting-plugin/server/mocks';

import type { DeeplyMockedKeys } from '@kbn/utility-types-jest';

import { createFleetActionsClientMock } from '../services/actions/mocks';

import { createFleetFilesClientFactoryMock } from '../services/files/mocks';

import { createArtifactsClientMock } from '../services/artifacts/mocks';
import { createOutputClientMock } from '../services/output_client.mock';

import type { PackagePolicyClient } from '../services/package_policy_service';
import type {
  AgentlessPoliciesService,
  AgentPolicyServiceInterface,
  CloudConnectorServiceInterface,
} from '../services';
import type { FleetAppContext, FleetStartContract } from '../plugin';
import { createMockTelemetryEventsSender } from '../telemetry/__mocks__';
import type { FleetConfigType } from '../../common/types';
import type { ExperimentalFeatures } from '../../common/experimental_features';
import { createFleetAuthzMock } from '../../common/mocks';
import { agentServiceMock } from '../services/agents/agent_service.mock';
import type { FleetRequestHandlerContext } from '../types';
import { packageServiceMock } from '../services/epm/package_service.mock';
import type { UninstallTokenServiceInterface } from '../services/security/uninstall_token_service';
import type { MessageSigningServiceInterface } from '../services/security';

import { getPackageSpecTagId } from '../services/epm/kibana/assets/tag_assets';

import { PackagePolicyMocks } from './package_policy.mocks';

// Export all mocks from artifacts
export * from '../services/artifacts/mocks';

// export all mocks from fleet files client
export * from '../services/files/mocks';

// export all mocks from fleet actions client
export * from '../services/actions/mocks';

export * from './package_policy.mocks';

export const createSavedObjectClientMock = () => {
  const soClientMock = savedObjectsClientMock.create();

  // The SO client mock does not return promises for async methods, so we mock those here in order
  // to avoid basic errors in tests (those where the methods are called, but the return value is
  // never used/checked
  [
    'create',
    'bulkCreate',
    'checkConflicts',
    'bulkUpdate',
    'delete',
    'bulkDelete',
    'bulkGet',
    'find',
    'get',
    'closePointInTime',
    'createPointInTimeFinder',
    'bulkResolve',
    'resolve',
    'update',
  ].forEach((methodName) => {
    let response: any;

    switch (methodName) {
      case 'find':
      case 'bulkGet':
        response = { saved_objects: [] };
        break;
    }

    (soClientMock[methodName as keyof typeof soClientMock] as jest.Mock).mockReturnValue(
      Promise.resolve(response)
    );
  });

  return soClientMock;
};

export interface MockedFleetAppContext extends FleetAppContext {
  elasticsearch: ReturnType<typeof elasticsearchServiceMock.createStart>;
  data: ReturnType<typeof dataPluginMock.createStartContract>;
  encryptedSavedObjectsStart?: ReturnType<typeof encryptedSavedObjectsMock.createStart>;
  savedObjects: ReturnType<typeof savedObjectsServiceMock.createStartContract>;
  securityCoreStart: ReturnType<typeof securityServiceMock.createStart>;
  securitySetup: ReturnType<typeof securityMock.createSetup>;
  securityStart: ReturnType<typeof securityMock.createStart>;
  logger: ReturnType<ReturnType<typeof loggingSystemMock.create>['get']>;
}

export const createAppContextStartContractMock = (
  configOverrides: Partial<FleetConfigType> = {},
  isServerless: boolean = false,
  soClients: Partial<{
    internal?: SavedObjectsClientContract;
    withoutSpaceExtensions?: SavedObjectsClientContract;
  }> = {},
  experimentalFeatures: Partial<ExperimentalFeatures> = {} as Partial<ExperimentalFeatures>
): MockedFleetAppContext => {
  const config = {
    agents: { enabled: true, elasticsearch: {} },
    enabled: true,
    agentIdVerificationEnabled: true,
    eventIngestedEnabled: false,
    ...configOverrides,
  };

  const config$ = of(config);

  const mockedSavedObject = savedObjectsServiceMock.createStartContract();

  const internalSoClient = soClients.internal ?? createSavedObjectClientMock();

  const internalSoClientWithoutSpaceExtension =
    soClients.withoutSpaceExtensions ?? createSavedObjectClientMock();

  mockedSavedObject.getScopedClient.mockImplementation((request, options) => {
    if (options?.excludedExtensions?.includes(SPACES_EXTENSION_ID)) {
      return internalSoClientWithoutSpaceExtension;
    }

    return internalSoClient;
  });

  mockedSavedObject.getUnsafeInternalClient.mockImplementation((options) => {
    if (options?.excludedExtensions?.includes(SPACES_EXTENSION_ID)) {
      return internalSoClientWithoutSpaceExtension;
    }

    return internalSoClient;
  });

  return {
    taskManagerStart: taskManagerMock.createStart(),
    elasticsearch: elasticsearchServiceMock.createStart(),
    data: dataPluginMock.createStartContract(),
    encryptedSavedObjectsStart: encryptedSavedObjectsMock.createStart(),
    encryptedSavedObjectsSetup: encryptedSavedObjectsMock.createSetup({ canEncrypt: true }),
    savedObjects: mockedSavedObject,
    securityCoreStart: securityServiceMock.createStart(),
    securitySetup: securityMock.createSetup(),
    securityStart: securityMock.createStart(),
    logger: loggingSystemMock.create().get(),
    experimentalFeatures: experimentalFeatures as ExperimentalFeatures,
    isProductionMode: true,
    configInitialValue: {
      agents: { enabled: true, elasticsearch: {} },
      enabled: true,
      agentIdVerificationEnabled: true,
      eventIngestedEnabled: false,
    },
    config$,
    kibanaVersion: '8.99.0', // Fake version :)
    kibanaBranch: 'main',
    kibanaInstanceId: '1',
    telemetryEventsSender: createMockTelemetryEventsSender(),
    bulkActionsResolver: {} as any,
    messageSigningService: createMessageSigningServiceMock(),
    uninstallTokenService: createUninstallTokenServiceMock(),
    ...(isServerless
      ? {
          cloud: {
            ...cloudMock.createSetup(),
            apm: {},
            isCloudEnabled: true,
            isServerlessEnabled: true,
          },
        }
      : {}),
    unenrollInactiveAgentsTask: {} as any,
    deleteUnenrolledAgentsTask: {} as any,
    updateAgentlessDeploymentsTask: {} as any,
    syncIntegrationsTask: {} as any,
    automaticAgentUpgradeTask: {} as any,
    autoInstallContentPackagesTask: {} as any,
    alertingStart: {
      getRulesClientWithRequest: jest.fn(),
      getRulesClientWithRequestInSpace: jest.fn(),
    } as any,
    reportingStart: reportingMock.createStart(),
    lockManagerService: {
      withLock: jest
        .fn()
        .mockImplementation((_lockId: string, callback: () => Promise<unknown>) => callback()),
      getLock: jest.fn().mockResolvedValue(undefined),
    } as any,
  };
};

export const createFleetRequestHandlerContextMock = (): jest.Mocked<
  Awaited<FleetRequestHandlerContext['fleet']>
> => {
  return {
    authz: createFleetAuthzMock(),
    getAllSpaces: jest.fn(),
    agentClient: {
      asCurrentUser: agentServiceMock.createClient(),
      asInternalUser: agentServiceMock.createClient(),
    },
    packagePolicyService: {
      asCurrentUser: createPackagePolicyServiceMock(),
      asInternalUser: createPackagePolicyServiceMock(),
    },
    uninstallTokenService: {
      asCurrentUser: createUninstallTokenServiceMock(),
    },
    internalSoClient: createSavedObjectClientMock(),
    spaceId: 'default',
    limitedToPackages: undefined,
  };
};

function createCoreRequestHandlerContextMock() {
  return {
    core: coreMock.createRequestHandlerContext(),
    licensing: licensingMock.createRequestHandlerContext(),
    fleet: createFleetRequestHandlerContextMock(),
  };
}

export const xpackMocks = {
  createRequestHandlerContext: createCoreRequestHandlerContextMock,
};

export const createPackagePolicyServiceMock = (): jest.Mocked<PackagePolicyClient> => {
  return {
    buildPackagePolicyFromPackage: jest.fn(),
    bulkCreate: jest.fn(),
    create: jest.fn(),
    inspect: jest.fn(),
    delete: jest.fn(),
    get: jest.fn(),
    getByIDs: jest.fn().mockResolvedValue(Promise.resolve([])),
    list: jest.fn(),
    listIds: jest.fn(),
    update: jest.fn(),
    bulkUpdate: jest.fn(),
    bulkUpgrade: jest.fn(),
    runExternalCallbacks: jest.fn(),
    runDeleteExternalCallbacks: jest.fn(),
    runPostDeleteExternalCallbacks: jest.fn(),
    upgrade: jest.fn(),
    getUpgradeDryRunDiff: jest.fn(),
    enrichPolicyWithDefaultsFromPackage: jest.fn(),
    findAllForAgentPolicy: jest.fn(),
    fetchAllItems: jest.fn((..._) => {
      return Promise.resolve({
        async *[Symbol.asyncIterator]() {
          yield Promise.resolve([PackagePolicyMocks.generatePackagePolicy({ id: '111' })]);
          yield Promise.resolve([PackagePolicyMocks.generatePackagePolicy({ id: '222' })]);
        },
      });
    }),
    fetchAllItemIds: jest.fn((..._) => {
      return Promise.resolve({
        async *[Symbol.asyncIterator]() {
          yield Promise.resolve(['111']);
          yield Promise.resolve(['222']);
        },
      });
    }),
    removeOutputFromAll: jest.fn(),
    getPackagePolicySavedObjects: jest.fn(),
    rollback: jest.fn(),
    restoreRollback: jest.fn(),
    cleanupRollbackSavedObjects: jest.fn(),
    bumpAgentPolicyRevisionAfterRollback: jest.fn(),
    compilePackagePolicyForVersions: jest.fn(),
  };
};

/**
 * Create mock AgentPolicyService
 */
export const createMockAgentPolicyService = (): jest.Mocked<AgentPolicyServiceInterface> => {
  return {
    create: jest.fn().mockReturnValue(Promise.resolve()),
    createWithPackagePolicies: jest.fn().mockReturnValue(Promise.resolve()),
    get: jest.fn().mockReturnValue(Promise.resolve()),
    list: jest.fn().mockReturnValue(Promise.resolve()),
    delete: jest.fn().mockReturnValue(Promise.resolve()),
    getFullAgentPolicy: jest.fn().mockReturnValue(Promise.resolve()),
    getByIds: jest.fn().mockReturnValue(Promise.resolve()),
    turnOffAgentTamperProtections: jest.fn().mockReturnValue(Promise.resolve()),
    fetchAllAgentPolicies: jest.fn().mockReturnValue(Promise.resolve()),
    fetchAllAgentPolicyIds: jest.fn().mockReturnValue(Promise.resolve()),
    deployPolicy: jest.fn().mockRejectedValue(Promise.resolve()),
  };
};

/**
 * Create mock AgentPolicyService
 */
export const createMockAgentlessPoliciesService = (): jest.Mocked<AgentlessPoliciesService> => {
  return {
    createAgentlessPolicy: jest.fn().mockReturnValue(Promise.resolve()),
    deleteAgentlessPolicy: jest.fn().mockReturnValue(Promise.resolve()),
  };
};

/**
 * Create mock CloudConnectorService
 */
export const createMockCloudConnectorService = (): jest.Mocked<CloudConnectorServiceInterface> => {
  return {
    create: jest.fn().mockReturnValue(Promise.resolve()),
    getList: jest.fn().mockReturnValue(Promise.resolve()),
    getById: jest.fn().mockReturnValue(Promise.resolve()),
    update: jest.fn().mockReturnValue(Promise.resolve()),
    delete: jest.fn().mockReturnValue(Promise.resolve({ id: 'mock-id' })),
  };
};

/**
 * Creates a mock AgentService
 */
export const createMockAgentService = () => agentServiceMock.create();

/**
 * Creates a mock AgentClient
 */
export const createMockAgentClient = () => agentServiceMock.createClient();

/**
 * Creates a mock PackageService
 */
export const createMockPackageService = () => packageServiceMock.create();

export function createMessageSigningServiceMock(): jest.Mocked<MessageSigningServiceInterface> {
  return {
    isEncryptionAvailable: true,
    generateKeyPair: jest.fn(),
    sign: jest.fn().mockImplementation((message: Record<string, unknown>) =>
      Promise.resolve({
        data: Buffer.from(JSON.stringify(message), 'utf8'),
        signature: 'thisisasignature',
      })
    ),
    getPublicKey: jest.fn().mockResolvedValue('thisisapublickey'),
    rotateKeyPair: jest.fn(),
  };
}

export function createUninstallTokenServiceMock(): DeeplyMockedKeys<UninstallTokenServiceInterface> {
  return {
    getToken: jest.fn(),
    getTokenMetadata: jest.fn(),
    getHashedTokenForPolicyId: jest.fn(),
    getHashedTokensForPolicyIds: jest.fn(),
    getAllHashedTokens: jest.fn(),
    generateTokenForPolicyId: jest.fn(),
    generateTokensForPolicyIds: jest.fn(),
    generateTokensForAllPolicies: jest.fn(),
    encryptTokens: jest.fn(),
    checkTokenValidityForAllPolicies: jest.fn(),
    checkTokenValidityForPolicy: jest.fn(),
    scoped: jest.fn().mockImplementation(() => createUninstallTokenServiceMock()),
  };
}

export const createFleetStartContractMock = (): DeeplyMockedKeys<FleetStartContract> => {
  const fleetAuthzMock = createFleetAuthzMock();
  const fleetArtifactsClient = createArtifactsClientMock();
  const fleetActionsClient = createFleetActionsClientMock();

  const startContract: DeeplyMockedKeys<FleetStartContract> = {
    fleetSetupCompleted: jest.fn(async () => {}),
    agentless: { enabled: false },
    authz: { fromRequest: jest.fn(async (_) => fleetAuthzMock) },
    packageService: createMockPackageService(),
    agentService: createMockAgentService(),
    packagePolicyService: createPackagePolicyServiceMock(),
    agentPolicyService: createMockAgentPolicyService(),
    agentlessPoliciesService: createMockAgentlessPoliciesService(),
    cloudConnectorService: {
      create: jest.fn().mockReturnValue(Promise.resolve()),
      getList: jest.fn().mockReturnValue(Promise.resolve()),
      getById: jest.fn().mockReturnValue(Promise.resolve()),
      update: jest.fn().mockReturnValue(Promise.resolve()),
      delete: jest.fn().mockReturnValue(Promise.resolve({ id: 'mock-id' })),
    },
    registerExternalCallback: jest.fn(),
    createArtifactsClient: jest.fn((_) => fleetArtifactsClient),
    createFilesClient: createFleetFilesClientFactoryMock(),
    messageSigningService: createMessageSigningServiceMock(),
    uninstallTokenService: createUninstallTokenServiceMock(),
    createFleetActionsClient: jest.fn((_) => fleetActionsClient),
    getPackageSpecTagId: jest.fn(getPackageSpecTagId),
    createOutputClient: jest.fn(async (_) => createOutputClientMock()),
    runWithCache: (async (cb: any) => await cb()) as any,
  };

  return startContract;
};
