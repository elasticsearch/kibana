/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PACKAGES_SAVED_OBJECT_TYPE, PACKAGE_POLICY_SAVED_OBJECT_TYPE } from '../../../../common';
import { agentPolicyService, appContextService, packagePolicyService } from '../..';
import type { PackagePolicyClient } from '../../package_policy_service';
import { getAgentsByKuery } from '../../agents';

import { sendTelemetryEvents } from '../../upgrade_sender';

import { fetchInfo } from '../registry';

import { installPackage } from './install';
import { removeInstallation } from './remove';
import {
  bulkRollbackAvailableCheck,
  isIntegrationRollbackTTLExpired,
  rollbackAvailableCheck,
  rollbackInstallation,
} from './rollback';

jest.mock('../..', () => ({
  appContextService: {
    getLogger: jest
      .fn()
      .mockReturnValue({ info: jest.fn(), debug: jest.fn(), warn: jest.fn() } as any),
    getInternalUserSOClientWithoutSpaceExtension: jest.fn(),
    getTelemetryEventsSender: jest.fn(),
    getConfig: jest.fn().mockReturnValue({}),
    getInternalUserSOClient: jest.fn(),
    getExperimentalFeatures: jest.fn().mockReturnValue({}),
  },
  packagePolicyService: {
    getPackagePolicySavedObjects: jest.fn(),
    rollback: jest.fn(),
    restoreRollback: jest.fn(),
    cleanupRollbackSavedObjects: jest.fn(),
    bumpAgentPolicyRevisionAfterRollback: jest.fn(),
    findAllForAgentPolicy: jest.fn().mockResolvedValue([]),
  },
  agentPolicyService: {
    getByIds: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ has_agent_version_conditions: false }),
  },
}));

jest.mock('../../agents', () => ({
  getAgentsByKuery: jest.fn().mockResolvedValue({ total: 0, agents: [] }),
  reassignAgents: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../audit_logging');

jest.mock('../../upgrade_sender');

const packagePolicyServiceMock = packagePolicyService as jest.Mocked<PackagePolicyClient>;
const agentPolicyServiceMock = agentPolicyService as jest.Mocked<typeof agentPolicyService>;

const esClient = {} as any;
const pkgName = 'test-package';
const oldPkgVersion = '1.0.0';
const newPkgVersion = '1.5.0';
const spaceId = 'default';

const sendTelemetryEventsMock = sendTelemetryEvents as jest.Mock;

jest.mock('./install', () => ({
  installPackage: jest.fn(),
}));

jest.mock('./remove', () => ({
  removeInstallation: jest.fn().mockResolvedValue([]),
}));

jest.mock('../registry', () => ({
  fetchInfo: jest.fn().mockResolvedValue({}),
}));

describe('rollbackInstallation', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should throw an error if the package is not installed', async () => {
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue({
        saved_objects: [],
      }),
    });
    await expect(
      rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId })
    ).rejects.toThrow('Package test-package not found');
  });

  it('should throw an error if no previous package version is found', async () => {
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: { install_source: 'registry', previous_version: null },
          },
        ],
      }),
    });

    await expect(
      rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId })
    ).rejects.toThrow('No previous version found for package test-package');
  });

  it('should throw an error if the package was not installed from the registry', async () => {
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: { install_source: 'upload', previous_version: oldPkgVersion },
          },
        ],
      }),
    });

    await expect(
      rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId })
    ).rejects.toThrow('test-package was not installed from the registry (install source: upload)');
  });

  it('should throw an error if TTL expired', async () => {
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              install_source: 'registry',
              previous_version: oldPkgVersion,
              install_started_at: '2023-01-01T00:00:00Z',
            },
          },
        ],
      }),
    });

    await expect(
      rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId })
    ).rejects.toThrow('Rollback not allowed as TTL expired');
  });

  it('should throw an error if at least one package policy does not have a previous version', async () => {
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              install_source: 'registry',
              previous_version: oldPkgVersion,
              version: newPkgVersion,
            },
          },
        ],
      }),
    });
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
      ],
    } as any);

    await expect(
      rollbackInstallation({
        esClient,
        currentUserPolicyIds: ['test-package-policy'],
        pkgName,
        spaceId,
      })
    ).rejects.toThrow('No previous version found for package policies: test-package-policy');
  });

  it('should rollback if one package policy is not upgraded to the current package version', async () => {
    (installPackage as jest.Mock).mockResolvedValue({ pkgName });
    const savedObjectsClient = {
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              install_source: 'registry',
              previous_version: oldPkgVersion,
              version: newPkgVersion,
            },
          },
        ],
      }),
    } as any;
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 1,
            latest_revision: false,
          },
        },
        {
          id: 'test-package-policy2',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: '1.4.0' },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy2:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 1,
            latest_revision: false,
          },
        },
      ],
    } as any);

    await rollbackInstallation({
      esClient,
      currentUserPolicyIds: [
        'test-package-policy',
        'test-package-policy:prev',
        'test-package-policy2',
        'test-package-policy2:prev',
      ],
      pkgName,
      spaceId,
    });
    expect(packagePolicyServiceMock.rollback).toHaveBeenCalled();
  });

  it('should throw an error if at least one package policy has a different previous version', async () => {
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              install_source: 'registry',
              previous_version: oldPkgVersion,
              version: newPkgVersion,
            },
          },
        ],
      }),
    });
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: '1.2.0' },
            revision: 1,
            latest_revision: false,
          },
        },
      ],
    } as any);

    await expect(
      rollbackInstallation({
        esClient,
        currentUserPolicyIds: ['test-package-policy', 'test-package-policy:prev'],
        pkgName,
        spaceId,
      })
    ).rejects.toThrow(
      'Rollback not available because not all integration policies were upgraded from the same previous version 1.0.0'
    );
  });

  it('should throw an error and cancel the rollback if the package could not be installed on the previous version', async () => {
    (installPackage as jest.Mock).mockResolvedValue({ error: new Error('Installation failed') });
    const savedObjectsClient = {
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              install_source: 'registry',
              previous_version: oldPkgVersion,
              version: newPkgVersion,
            },
          },
        ],
      }),
    } as any;
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 1,
            latest_revision: false,
          },
        },
      ],
    } as any);

    await expect(
      rollbackInstallation({
        esClient,
        currentUserPolicyIds: ['test-package-policy', 'test-package-policy:prev'],
        pkgName,
        spaceId,
      })
    ).rejects.toThrow(
      'Failed to rollback package test-package to version 1.0.0: Installation failed'
    );
    expect(packagePolicyServiceMock.rollback).toHaveBeenCalled();
    expect(installPackage).toHaveBeenCalledWith({
      esClient,
      savedObjectsClient,
      installSource: 'registry',
      pkgkey: `${pkgName}-${oldPkgVersion}`,
      spaceId,
      force: true,
    });
    expect(packagePolicyServiceMock.restoreRollback).toHaveBeenCalled();
    expect(packagePolicyServiceMock.cleanupRollbackSavedObjects).not.toHaveBeenCalled();
    expect(packagePolicyServiceMock.bumpAgentPolicyRevisionAfterRollback).not.toHaveBeenCalled();
    expect(sendTelemetryEventsMock).toHaveBeenCalledWith(expect.anything(), undefined, {
      packageName: pkgName,
      currentVersion: newPkgVersion,
      newVersion: oldPkgVersion,
      status: 'failure',
      eventType: 'package-rollback',
      errorMessage: 'Failed to rollback package test-package to version 1.0.0: Installation failed',
    });
  });

  it('should rollback package policies and install the package on the previous version', async () => {
    (installPackage as jest.Mock).mockResolvedValue({ pkgName });
    const savedObjectsClient = {
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              install_source: 'registry',
              previous_version: oldPkgVersion,
              version: newPkgVersion,
            },
          },
        ],
      }),
    } as any;
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 1,
            latest_revision: false,
          },
        },
      ],
    } as any);

    await rollbackInstallation({
      esClient,
      currentUserPolicyIds: ['test-package-policy', 'test-package-policy:prev'],
      pkgName,
      spaceId,
    });
    expect(packagePolicyServiceMock.rollback).toHaveBeenCalled();
    expect(installPackage).toHaveBeenCalledWith({
      esClient,
      savedObjectsClient,
      installSource: 'registry',
      pkgkey: `${pkgName}-${oldPkgVersion}`,
      spaceId,
      force: true,
    });
    expect(packagePolicyServiceMock.restoreRollback).not.toHaveBeenCalled();
    expect(packagePolicyServiceMock.cleanupRollbackSavedObjects).toHaveBeenCalled();
    expect(packagePolicyServiceMock.bumpAgentPolicyRevisionAfterRollback).toHaveBeenCalled();
    expect(sendTelemetryEventsMock).toHaveBeenCalledWith(expect.anything(), undefined, {
      packageName: pkgName,
      currentVersion: newPkgVersion,
      newVersion: oldPkgVersion,
      status: 'success',
      eventType: 'package-rollback',
      errorMessage: undefined,
    });
  });

  it('should rollback package policies if some package policies are not upgraded', async () => {
    (installPackage as jest.Mock).mockResolvedValue({ pkgName });
    const savedObjectsClient = {
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              install_source: 'registry',
              previous_version: oldPkgVersion,
              version: newPkgVersion,
            },
          },
        ],
      }),
    } as any;
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 1,
            latest_revision: false,
          },
        },
        {
          id: 'test-package-policy2',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
      ],
    } as any);

    await rollbackInstallation({
      esClient,
      currentUserPolicyIds: [
        'test-package-policy',
        'test-package-policy:prev',
        'test-package-policy2',
      ],
      pkgName,
      spaceId,
    });
    expect(packagePolicyServiceMock.rollback).toHaveBeenCalled();
  });

  it('should throw error on rollback when package policy is managed', async () => {
    (installPackage as jest.Mock).mockResolvedValue({ pkgName });
    const savedObjectsClient = {
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: { install_source: 'registry', previous_version: oldPkgVersion },
          },
        ],
      }),
    } as any;
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 1,
            latest_revision: false,
          },
        },
      ],
    } as any);
    agentPolicyServiceMock.getByIds.mockResolvedValue([
      {
        is_managed: true,
      } as any,
    ]);

    await expect(
      rollbackInstallation({
        esClient,
        currentUserPolicyIds: ['test-package-policy', 'test-package-policy:prev'],
        pkgName,
        spaceId,
      })
    ).rejects.toThrow('Cannot rollback integration with managed package policies');
  });

  it('should throw error on rollback when current user does not have access to all package policies', async () => {
    (installPackage as jest.Mock).mockResolvedValue({ pkgName });
    const savedObjectsClient = {
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              install_source: 'registry',
              previous_version: oldPkgVersion,
              version: newPkgVersion,
            },
          },
        ],
      }),
    } as any;
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 1,
            latest_revision: false,
          },
        },
      ],
    } as any);
    agentPolicyServiceMock.getByIds.mockResolvedValue([{} as any]);

    await expect(
      rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId })
    ).rejects.toThrow('Not authorized to rollback integration policies in all spaces');
  });
});

describe('rollbackInstallation - dependency rollback (enableResolveDependencies=true)', () => {
  const depName = 'dep-pkg';
  const depPreviousVersion = '1.0.0';

  beforeEach(() => {
    (installPackage as jest.Mock).mockResolvedValue({ pkgName });
    (appContextService.getExperimentalFeatures as jest.Mock).mockReturnValue({
      enableResolveDependencies: true,
    });
  });

  afterEach(() => {
    (appContextService.getExperimentalFeatures as jest.Mock).mockReturnValue({});
    jest.clearAllMocks();
  });

  const buildSavedObjectsClient = (
    previousDependencyVersions: Array<{ name: string; previous_version: string | null }>,
    depIsDependencyOf: Array<{ name: string; version: string }>
  ) => {
    return {
      find: jest.fn().mockImplementation(({ search }: { search: string }) => {
        if (search === pkgName) {
          return Promise.resolve({
            saved_objects: [
              {
                id: pkgName,
                type: PACKAGES_SAVED_OBJECT_TYPE,
                attributes: {
                  install_source: 'registry',
                  previous_version: oldPkgVersion,
                  version: newPkgVersion,
                  previous_dependency_versions: previousDependencyVersions,
                },
              },
            ],
          });
        }
        if (search === depName) {
          return Promise.resolve({
            saved_objects: [
              {
                id: depName,
                type: PACKAGES_SAVED_OBJECT_TYPE,
                attributes: {
                  name: depName,
                  install_started_at: new Date().toISOString(),
                  is_dependency_of: depIsDependencyOf,
                },
              },
            ],
          });
        }
        return Promise.resolve({ saved_objects: [] });
      }),
      update: jest.fn().mockResolvedValue({}),
    } as any;
  };

  it('re-installs an upgraded dependency at its previous version', async () => {
    const savedObjectsClient = buildSavedObjectsClient(
      [{ name: depName, previous_version: depPreviousVersion }],
      [{ name: pkgName, version: newPkgVersion }]
    );
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [],
    } as any);

    await rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId });

    expect(installPackage).toHaveBeenCalledWith(
      expect.objectContaining({ pkgkey: `${depName}-${depPreviousVersion}`, force: true })
    );
    expect(savedObjectsClient.update).toHaveBeenCalledWith(PACKAGES_SAVED_OBJECT_TYPE, pkgName, {
      previous_dependency_versions: null,
    });
  });

  it('removes a freshly-installed dependency when no other package depends on it', async () => {
    const savedObjectsClient = buildSavedObjectsClient(
      [{ name: depName, previous_version: null }],
      [{ name: pkgName, version: newPkgVersion }]
    );
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [],
    } as any);

    await rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId });

    expect(removeInstallation).toHaveBeenCalledWith(expect.objectContaining({ pkgName: depName }));
    expect(savedObjectsClient.update).toHaveBeenCalledWith(PACKAGES_SAVED_OBJECT_TYPE, pkgName, {
      previous_dependency_versions: null,
    });
  });

  it('skips removing a freshly-installed dependency still needed by another package', async () => {
    // availability check passes because feature flag is on but we override find to allow it through
    const savedObjectsClient = buildSavedObjectsClient(
      [{ name: depName, previous_version: null }],
      [
        { name: pkgName, version: newPkgVersion },
        { name: 'other-composable', version: '2.0.0' },
      ]
    );
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [],
    } as any);

    // rollbackAvailableCheck will block this because dep is still needed — expect a throw
    await expect(
      rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId })
    ).rejects.toThrow(
      `Cannot rollback: dependency ${depName} is still required by other-composable`
    );
    expect(removeInstallation).not.toHaveBeenCalled();
  });

  it('throws and preserves the snapshot when a dependency rollback fails', async () => {
    const savedObjectsClient = buildSavedObjectsClient(
      [{ name: depName, previous_version: depPreviousVersion }],
      [{ name: pkgName, version: newPkgVersion }]
    );
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [],
    } as any);
    // Make installPackage fail on the first call (the dep reinstall), succeed on subsequent calls.
    (installPackage as jest.Mock)
      .mockRejectedValueOnce(new Error('registry unavailable'))
      .mockResolvedValue({ pkgName });

    await expect(
      rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId })
    ).rejects.toThrow(`Failed to roll back dependency: ${depName}`);

    // The composable package itself must NOT have been reinstalled.
    expect(installPackage).toHaveBeenCalledTimes(1);
    // The snapshot must NOT have been cleared so a retry can re-attempt.
    expect(savedObjectsClient.update).not.toHaveBeenCalledWith(
      PACKAGES_SAVED_OBJECT_TYPE,
      pkgName,
      { previous_dependency_versions: null }
    );
  });

  it('does not clear the snapshot when dependency rollback partially fails', async () => {
    const dep2Name = 'dep-pkg-2';
    const savedObjectsClient = {
      find: jest.fn().mockImplementation(({ search }: { search: string }) => {
        if (search === pkgName) {
          return Promise.resolve({
            saved_objects: [
              {
                id: pkgName,
                type: PACKAGES_SAVED_OBJECT_TYPE,
                attributes: {
                  install_source: 'registry',
                  previous_version: oldPkgVersion,
                  version: newPkgVersion,
                  previous_dependency_versions: [
                    { name: depName, previous_version: depPreviousVersion },
                    { name: dep2Name, previous_version: '2.0.0' },
                  ],
                },
              },
            ],
          });
        }
        return Promise.resolve({
          saved_objects: [
            {
              id: search,
              type: PACKAGES_SAVED_OBJECT_TYPE,
              attributes: {
                name: search,
                install_started_at: new Date().toISOString(),
                is_dependency_of: [{ name: pkgName, version: newPkgVersion }],
              },
            },
          ],
        });
      }),
      update: jest.fn().mockResolvedValue({}),
    } as any;
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [],
    } as any);
    // First dep succeeds, second fails.
    (installPackage as jest.Mock)
      .mockResolvedValueOnce({ pkgName })
      .mockRejectedValueOnce(new Error('dep2 unavailable'));

    await expect(
      rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId })
    ).rejects.toThrow(dep2Name);

    expect(savedObjectsClient.update).not.toHaveBeenCalledWith(
      PACKAGES_SAVED_OBJECT_TYPE,
      pkgName,
      { previous_dependency_versions: null }
    );
  });
});

describe('rollbackInstallation - feature flag disabled with existing snapshot', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not roll back dependencies or clear snapshot when enableResolveDependencies is false', async () => {
    const depName = 'dep-pkg';
    const savedObjectsClient = {
      find: jest.fn().mockImplementation(({ search }: { search: string }) => {
        if (search === pkgName) {
          return Promise.resolve({
            saved_objects: [
              {
                id: pkgName,
                type: PACKAGES_SAVED_OBJECT_TYPE,
                attributes: {
                  install_source: 'registry',
                  previous_version: oldPkgVersion,
                  version: newPkgVersion,
                  previous_dependency_versions: [{ name: depName, previous_version: '1.0.0' }],
                },
              },
            ],
          });
        }
        return Promise.resolve({ saved_objects: [] });
      }),
      update: jest.fn().mockResolvedValue({}),
    } as any;
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      savedObjectsClient
    );
    (appContextService.getExperimentalFeatures as jest.Mock).mockReturnValue({
      enableResolveDependencies: false,
    });
    (installPackage as jest.Mock).mockResolvedValue({ pkgName });
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [],
    } as any);

    await rollbackInstallation({ esClient, currentUserPolicyIds: [], pkgName, spaceId });

    // No dep rollback should have been attempted.
    expect(installPackage).toHaveBeenCalledTimes(1);
    expect(installPackage).toHaveBeenCalledWith(
      expect.objectContaining({ pkgkey: `${pkgName}-${oldPkgVersion}` })
    );
    // Snapshot must be preserved so it can be used when the flag is re-enabled.
    expect(savedObjectsClient.update).not.toHaveBeenCalledWith(
      PACKAGES_SAVED_OBJECT_TYPE,
      pkgName,
      { previous_dependency_versions: null }
    );
  });
});

describe('rollbackInstallation - version-specific policy cleanup (enableVersionSpecificPolicies=true)', () => {
  const mockEsClient = {
    deleteByQuery: jest.fn().mockResolvedValue({ deleted: 0 }),
  } as any;

  beforeEach(() => {
    (installPackage as jest.Mock).mockResolvedValue({ pkgName });
    (appContextService.getExperimentalFeatures as jest.Mock).mockReturnValue({
      enableVersionSpecificPolicies: true,
    });
  });

  afterEach(() => {
    (appContextService.getExperimentalFeatures as jest.Mock).mockReturnValue({});
    jest.clearAllMocks();
  });

  const buildSoClient = () =>
    ({
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              install_source: 'registry',
              previous_version: '1.0.0',
              version: '1.5.0',
            },
          },
        ],
      }),
    } as any);

  it('triggers variant cleanup when no remaining version conditions after rollback', async () => {
    const soClient = buildSoClient();
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      soClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'pp-1',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: '1.5.0' },
            revision: 2,
            latest_revision: true,
            policy_ids: ['agent-policy-1'],
          },
        },
        {
          id: 'pp-1:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: '1.0.0' },
            revision: 1,
            latest_revision: false,
            policy_ids: ['agent-policy-1'],
          },
        },
      ],
    } as any);
    packagePolicyServiceMock.rollback.mockResolvedValue({
      updatedPolicies: {
        default: [
          {
            id: 'pp-1',
            type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
            namespaces: ['default'],
            attributes: {
              policy_ids: ['agent-policy-1'],
            },
            references: [],
            score: 0,
          },
        ],
      },
      copiedPolicies: { default: [] },
      previousVersionPolicies: { default: [] },
    } as any);
    packagePolicyServiceMock.findAllForAgentPolicy.mockResolvedValue([]);
    (agentPolicyService.update as jest.Mock).mockResolvedValue({
      has_agent_version_conditions: false,
    });

    await rollbackInstallation({
      esClient: mockEsClient,
      currentUserPolicyIds: ['pp-1', 'pp-1:prev'],
      pkgName,
      spaceId,
    });

    expect(agentPolicyService.update).toHaveBeenCalledWith(
      expect.anything(),
      mockEsClient,
      'agent-policy-1',
      {},
      { bumpRevision: false, skipValidation: true }
    );
    expect(mockEsClient.deleteByQuery).toHaveBeenCalled();
  });

  it('skips variant deletion when rolled-back package still has version conditions', async () => {
    const soClient = buildSoClient();
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      soClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'pp-1',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: '1.5.0' },
            revision: 2,
            latest_revision: true,
            policy_ids: ['agent-policy-1'],
          },
        },
        {
          id: 'pp-1:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: '1.0.0' },
            revision: 1,
            latest_revision: false,
            policy_ids: ['agent-policy-1'],
          },
        },
      ],
    } as any);
    packagePolicyServiceMock.rollback.mockResolvedValue({
      updatedPolicies: {
        default: [
          {
            id: 'pp-1',
            type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
            namespaces: ['default'],
            attributes: {
              policy_ids: ['agent-policy-1'],
            },
            references: [],
            score: 0,
          },
        ],
      },
      copiedPolicies: { default: [] },
      previousVersionPolicies: { default: [] },
    } as any);
    packagePolicyServiceMock.findAllForAgentPolicy.mockResolvedValue([]);
    (agentPolicyService.update as jest.Mock).mockResolvedValue({
      has_agent_version_conditions: true,
    });

    await rollbackInstallation({
      esClient: mockEsClient,
      currentUserPolicyIds: ['pp-1', 'pp-1:prev'],
      pkgName,
      spaceId,
    });

    expect(agentPolicyService.update).toHaveBeenCalled();
    expect(mockEsClient.deleteByQuery).not.toHaveBeenCalled();
  });

  it('skips cleanup for a policy that still has another package with version conditions', async () => {
    const soClient = buildSoClient();
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
      soClient
    );
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'pp-1',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: '1.5.0' },
            revision: 2,
            latest_revision: true,
            policy_ids: ['agent-policy-1'],
          },
        },
        {
          id: 'pp-1:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: '1.0.0' },
            revision: 1,
            latest_revision: false,
            policy_ids: ['agent-policy-1'],
          },
        },
      ],
    } as any);
    packagePolicyServiceMock.rollback.mockResolvedValue({
      updatedPolicies: {
        default: [
          {
            id: 'pp-1',
            type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
            namespaces: ['default'],
            attributes: { policy_ids: ['agent-policy-1'] },
            references: [],
            score: 0,
          },
        ],
      },
      copiedPolicies: { default: [] },
      previousVersionPolicies: { default: [] },
    } as any);
    // Another package policy on the same agent policy still has version conditions
    packagePolicyServiceMock.findAllForAgentPolicy.mockResolvedValue([
      { package_agent_version_condition: '^8.0.0' } as any,
    ]);

    await rollbackInstallation({
      esClient: mockEsClient,
      currentUserPolicyIds: ['pp-1', 'pp-1:prev'],
      pkgName,
      spaceId,
    });

    expect(agentPolicyService.update).not.toHaveBeenCalled();
    expect(mockEsClient.deleteByQuery).not.toHaveBeenCalled();
    expect(getAgentsByKuery).not.toHaveBeenCalled();
  });
});

describe('isIntegrationRollbackTTLExpired', () => {
  it('should return true if integration rollback TTL is expired', () => {
    const installStartedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days ago
    const isExpired = isIntegrationRollbackTTLExpired(installStartedAt);
    expect(isExpired).toBe(true);
  });

  it('should return false if integration rollback TTL is not expired', () => {
    const installStartedAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(); // 6 days ago
    const isExpired = isIntegrationRollbackTTLExpired(installStartedAt);
    expect(isExpired).toBe(false);
  });

  it('should return true if integration rollback TTL is expired with changed config', () => {
    (appContextService.getConfig as jest.Mock).mockReturnValue({
      integrationRollbackTTL: '1h',
    });
    const installStartedAt = new Date(Date.now() - 60 * 60 * 1000 - 100).toISOString();
    const isExpired = isIntegrationRollbackTTLExpired(installStartedAt);
    expect(isExpired).toBe(true);
  });

  it('should return false if integration rollback TTL is not expired with changed config', () => {
    (appContextService.getConfig as jest.Mock).mockReturnValue({
      integrationRollbackTTL: '1h',
    });
    const installStartedAt = new Date(Date.now() - 60 * 60 * 1000 + 100).toISOString();
    const isExpired = isIntegrationRollbackTTLExpired(installStartedAt);
    expect(isExpired).toBe(false);
  });
});

describe('rollbackAvailableCheck', () => {
  beforeEach(() => {
    (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue({
      find: jest.fn().mockResolvedValue({
        saved_objects: [
          {
            id: pkgName,
            type: PACKAGES_SAVED_OBJECT_TYPE,
            attributes: {
              name: pkgName,
              install_source: 'registry',
              previous_version: oldPkgVersion,
              version: newPkgVersion,
            },
          },
        ],
      }),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return isAvailable: true if all package policies are upgraded to the current package version', async () => {
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 1,
            latest_revision: false,
          },
        },
      ],
    } as any);

    const response = await rollbackAvailableCheck(pkgName, [
      'test-package-policy',
      'test-package-policy:prev',
    ]);

    expect(response).toEqual({
      isAvailable: true,
    });
  });

  it('should return isAvailable: true if all package policies are upgraded or on the previous package version', async () => {
    packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
      saved_objects: [
        {
          id: 'test-package-policy',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy:prev',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-1`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 1,
            latest_revision: false,
          },
        },
        {
          id: 'test-package-policy2',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-2`,
            package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
            revision: 3,
            latest_revision: true,
          },
        },
        {
          id: 'test-package-policy3',
          type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
          attributes: {
            name: `${pkgName}-3`,
            package: { name: pkgName, title: 'Test Package', version: '0.9.0' },
            revision: 3,
            latest_revision: true,
          },
        },
      ],
    } as any);

    const response = await rollbackAvailableCheck(pkgName, [
      'test-package-policy',
      'test-package-policy:prev',
      'test-package-policy2',
      'test-package-policy3',
    ]);

    expect(response).toEqual({
      isAvailable: true,
    });
  });

  describe('dependency rollback availability (enableResolveDependencies=true)', () => {
    beforeEach(() => {
      (appContextService.getExperimentalFeatures as jest.Mock).mockReturnValue({
        enableResolveDependencies: true,
      });
    });

    afterEach(() => {
      (appContextService.getExperimentalFeatures as jest.Mock).mockReturnValue({});
      jest.clearAllMocks();
    });

    it('returns unavailable when a freshly-installed dependency is still needed by another composable package', async () => {
      const depName = 'dep-pkg';
      (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
        {
          find: jest.fn().mockImplementation(({ search }: { search: string }) => {
            if (search === pkgName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: pkgName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: pkgName,
                      install_source: 'registry',
                      previous_version: oldPkgVersion,
                      version: newPkgVersion,
                      previous_dependency_versions: [{ name: depName, previous_version: null }],
                    },
                  },
                ],
              });
            }
            if (search === depName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: depName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: depName,
                      install_started_at: new Date().toISOString(),
                      is_dependency_of: [
                        { name: pkgName, version: newPkgVersion },
                        { name: 'other-composable', version: '2.0.0' },
                      ],
                    },
                  },
                ],
              });
            }
            return Promise.resolve({ saved_objects: [] });
          }),
        }
      );
      packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
        saved_objects: [],
      } as any);

      const response = await rollbackAvailableCheck(pkgName, []);
      expect(response).toEqual({
        isAvailable: false,
        reason: `Cannot rollback: dependency ${depName} is still required by other-composable`,
      });
    });

    it('returns unavailable when the previous registry version of an upgraded dependency is no longer available', async () => {
      const depName = 'dep-pkg';
      (fetchInfo as jest.Mock).mockRejectedValueOnce(new Error('404 Not Found'));
      (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
        {
          find: jest.fn().mockImplementation(({ search }: { search: string }) => {
            if (search === pkgName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: pkgName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: pkgName,
                      install_source: 'registry',
                      previous_version: oldPkgVersion,
                      version: newPkgVersion,
                      previous_dependency_versions: [{ name: depName, previous_version: '1.0.0' }],
                    },
                  },
                ],
              });
            }
            if (search === depName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: depName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: depName,
                      install_started_at: new Date().toISOString(),
                      is_dependency_of: [{ name: pkgName, version: newPkgVersion }],
                    },
                  },
                ],
              });
            }
            return Promise.resolve({ saved_objects: [] });
          }),
        }
      );
      packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
        saved_objects: [],
      } as any);

      const response = await rollbackAvailableCheck(pkgName, []);
      expect(response).toEqual({
        isAvailable: false,
        reason: `Rollback not available: dependency ${depName}@1.0.0 is no longer available in the registry`,
      });
    });

    it('returns unavailable when rolling back a dependency would violate another package constraint', async () => {
      const depName = 'dep-pkg';
      (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
        {
          find: jest.fn().mockImplementation(({ search }: { search: string }) => {
            if (search === pkgName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: pkgName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: pkgName,
                      install_source: 'registry',
                      previous_version: oldPkgVersion,
                      version: newPkgVersion,
                      previous_dependency_versions: [{ name: depName, previous_version: '1.0.0' }],
                    },
                  },
                ],
              });
            }
            if (search === depName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: depName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: depName,
                      install_started_at: new Date().toISOString(),
                      is_dependency_of: [
                        { name: pkgName, version: newPkgVersion },
                        { name: 'other-composable', version: '3.0.0' },
                      ],
                    },
                  },
                ],
              });
            }
            if (search === 'other-composable') {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: 'other-composable',
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: 'other-composable',
                      // requires dep-pkg@^2.0.0, which 1.0.0 does not satisfy
                      dependencies: [{ name: depName, version: '^2.0.0' }],
                    },
                  },
                ],
              });
            }
            return Promise.resolve({ saved_objects: [] });
          }),
        }
      );
      packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
        saved_objects: [],
      } as any);

      const response = await rollbackAvailableCheck(pkgName, []);
      expect(response).toEqual({
        isAvailable: false,
        reason: `Rollback not available: rolling back dependency ${depName} to 1.0.0 would violate other-composable's constraint ^2.0.0`,
      });
    });

    it('returns available when rolling back a dependency still satisfies all other packages constraints', async () => {
      const depName = 'dep-pkg';
      (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
        {
          find: jest.fn().mockImplementation(({ search }: { search: string }) => {
            if (search === pkgName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: pkgName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: pkgName,
                      install_source: 'registry',
                      previous_version: oldPkgVersion,
                      version: newPkgVersion,
                      previous_dependency_versions: [{ name: depName, previous_version: '1.5.0' }],
                    },
                  },
                ],
              });
            }
            if (search === depName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: depName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: depName,
                      install_started_at: new Date().toISOString(),
                      is_dependency_of: [
                        { name: pkgName, version: newPkgVersion },
                        { name: 'other-composable', version: '3.0.0' },
                      ],
                    },
                  },
                ],
              });
            }
            if (search === 'other-composable') {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: 'other-composable',
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: 'other-composable',
                      // requires dep-pkg@^1.0.0, which 1.5.0 satisfies
                      dependencies: [{ name: depName, version: '^1.0.0' }],
                    },
                  },
                ],
              });
            }
            return Promise.resolve({ saved_objects: [] });
          }),
        }
      );
      packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
        saved_objects: [],
      } as any);

      const response = await rollbackAvailableCheck(pkgName, []);
      expect(response).toEqual({ isAvailable: true });
    });

    it('returns unavailable when a dependency TTL is expired', async () => {
      const depName = 'dep-pkg';
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
        {
          find: jest.fn().mockImplementation(({ search }: { search: string }) => {
            if (search === pkgName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: pkgName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: pkgName,
                      install_source: 'registry',
                      previous_version: oldPkgVersion,
                      version: newPkgVersion,
                      previous_dependency_versions: [{ name: depName, previous_version: '1.0.0' }],
                    },
                  },
                ],
              });
            }
            if (search === depName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: depName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: depName,
                      install_started_at: eightDaysAgo,
                      is_dependency_of: [{ name: pkgName, version: newPkgVersion }],
                    },
                  },
                ],
              });
            }
            return Promise.resolve({ saved_objects: [] });
          }),
        }
      );
      packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
        saved_objects: [],
      } as any);

      const response = await rollbackAvailableCheck(pkgName, []);
      expect(response).toEqual({
        isAvailable: false,
        reason: `Rollback not available: TTL expired for dependency ${depName}`,
      });
    });

    it('returns unavailable when multiple saved objects match a dependency name', async () => {
      const depName = 'aws';
      (appContextService.getInternalUserSOClientWithoutSpaceExtension as jest.Mock).mockReturnValue(
        {
          find: jest.fn().mockImplementation(({ search }: { search: string }) => {
            if (search === pkgName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: pkgName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: {
                      name: pkgName,
                      install_source: 'registry',
                      previous_version: oldPkgVersion,
                      version: newPkgVersion,
                      previous_dependency_versions: [{ name: depName, previous_version: '1.0.0' }],
                    },
                  },
                ],
              });
            }
            if (search === depName) {
              return Promise.resolve({
                saved_objects: [
                  {
                    id: depName,
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: { name: depName, install_started_at: new Date().toISOString() },
                  },
                  {
                    id: 'aws-logs',
                    type: PACKAGES_SAVED_OBJECT_TYPE,
                    attributes: { name: 'aws-logs', install_started_at: new Date().toISOString() },
                  },
                ],
              });
            }
            return Promise.resolve({ saved_objects: [] });
          }),
        }
      );
      packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
        saved_objects: [],
      } as any);

      const response = await rollbackAvailableCheck(pkgName, []);
      expect(response).toEqual({
        isAvailable: false,
        reason: `Expected exactly one saved object for dependency ${depName}`,
      });
    });
  });

  describe('bulkRollbackAvailableCheck', () => {
    it('should return isAvailable: true if installed package has rollback available', async () => {
      packagePolicyServiceMock.getPackagePolicySavedObjects.mockResolvedValue({
        saved_objects: [
          {
            id: 'test-package-policy',
            type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
            attributes: {
              name: `${pkgName}-1`,
              package: { name: pkgName, title: 'Test Package', version: newPkgVersion },
              revision: 3,
              latest_revision: true,
            },
          },
          {
            id: 'test-package-policy:prev',
            type: PACKAGE_POLICY_SAVED_OBJECT_TYPE,
            attributes: {
              name: `${pkgName}-1`,
              package: { name: pkgName, title: 'Test Package', version: oldPkgVersion },
              revision: 1,
              latest_revision: false,
            },
          },
        ],
      } as any);

      const response = await bulkRollbackAvailableCheck({} as any);

      expect(response).toEqual({
        'test-package': {
          isAvailable: true,
        },
      });
    });
  });
});
