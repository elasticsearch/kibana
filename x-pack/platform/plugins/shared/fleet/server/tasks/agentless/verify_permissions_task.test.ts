/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';

import { createAppContextStartContractMock } from '../../mocks';
import { appContextService } from '../../services';
import { agentPolicyService, getAgentPolicySavedObjectType } from '../../services/agent_policy';

import { CLOUD_CONNECTOR_SAVED_OBJECT_TYPE } from '../../../common/constants';

import {
  registerVerifyPermissionsTask,
  scheduleVerifyPermissionsTask,
} from './verify_permissions_task';

jest.mock('../../services/agent_policy_update', () => ({
  agentPolicyUpdateEventHandler: jest.fn(),
}));

jest.mock('../../services/agent_policy', () => ({
  agentPolicyService: {
    list: jest.fn(),
    createVerifierPolicy: jest.fn(),
    deleteVerifierPolicy: jest.fn(),
  },
  getAgentPolicySavedObjectType: jest.fn().mockResolvedValue('ingest-agent-policies'),
}));

jest.mock('../../services/epm/packages', () => ({
  getPackageInfo: jest.fn().mockResolvedValue({ name: 'aws', title: 'AWS', version: '2.0.0' }),
}));

jest.mock('../../services/epm/packages/install', () => ({
  ensureInstalledPackage: jest.fn().mockResolvedValue({
    status: 'already_installed',
    package: { name: 'aws', version: '2.0.0' },
  }),
}));

const mockedAgentPolicyService = agentPolicyService as jest.Mocked<typeof agentPolicyService>;
const mockedGetAgentPolicySavedObjectType = getAgentPolicySavedObjectType as jest.MockedFunction<
  typeof getAgentPolicySavedObjectType
>;

const mockSoClient = {
  find: jest.fn(),
  update: jest.fn(),
} as any;

const mockEsClient = {} as any;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();

const makePackagePolicySO = (
  id: string,
  connectorId: string,
  template: string,
  enabled = true
) => ({
  id,
  attributes: {
    cloud_connector_id: connectorId,
    inputs: [{ enabled, policy_template: template }],
    package: { name: 'aws', title: 'AWS', version: '2.0.0' },
  },
});

const makeConnectorSO = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  attributes: {
    name: `Connector ${id}`,
    cloudProvider: 'aws',
    vars: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  },
});

describe('verify_permissions_task', () => {
  const logger = loggingSystemMock.createLogger();

  beforeEach(() => {
    jest.clearAllMocks();
    mockSoClient.find.mockReset();
    mockSoClient.update.mockReset();
    mockedAgentPolicyService.list.mockReset();
    mockedAgentPolicyService.createVerifierPolicy.mockReset();
    mockedAgentPolicyService.deleteVerifierPolicy.mockReset();
    const mockContext = createAppContextStartContractMock();
    appContextService.start(mockContext);

    jest.spyOn(appContextService, 'getLogger').mockReturnValue(logger);
    jest
      .spyOn(appContextService, 'getInternalUserSOClientWithoutSpaceExtension')
      .mockReturnValue(mockSoClient);
    jest.spyOn(appContextService, 'getInternalUserESClient').mockReturnValue(mockEsClient);
    jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
      enableOTelVerifier: true,
    } as any);

    mockedGetAgentPolicySavedObjectType.mockResolvedValue('ingest-agent-policies');
  });

  describe('registerVerifyPermissionsTask', () => {
    it('should register the task definition', () => {
      const taskManager = taskManagerMock.createSetup();
      registerVerifyPermissionsTask(taskManager);
      expect(taskManager.registerTaskDefinitions).toHaveBeenCalledWith(
        expect.objectContaining({
          'fleet:verify_permissions': expect.objectContaining({
            title: 'OTel Verify Permission Task',
            timeout: '1d',
          }),
        })
      );
    });
  });

  describe('scheduleVerifyPermissionsTask', () => {
    it('should schedule the task with correct parameters', async () => {
      const taskManager = taskManagerMock.createStart();
      await scheduleVerifyPermissionsTask(taskManager);
      expect(taskManager.ensureScheduled).toHaveBeenCalledWith({
        id: 'fleet:verify_permissions:1.0.0',
        taskType: 'fleet:verify_permissions',
        schedule: { interval: '12h' },
        state: {},
        params: {},
      });
    });

    it('should log error if scheduling fails', async () => {
      const taskManager = taskManagerMock.createStart();
      taskManager.ensureScheduled.mockRejectedValueOnce(new Error('schedule failed'));
      await scheduleVerifyPermissionsTask(taskManager);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error scheduling permission verifier task'),
        expect.anything()
      );
    });
  });

  describe('runPermissionVerifierTask (via task runner)', () => {
    const createTaskRunner = (abortCtrl?: AbortController) => {
      const taskManager = taskManagerMock.createSetup();
      registerVerifyPermissionsTask(taskManager);
      const registeredDef =
        taskManager.registerTaskDefinitions.mock.calls[0][0]['fleet:verify_permissions'];
      return registeredDef.createTaskRunner(
        taskManagerMock.createRunContext({
          taskInstance: {} as any,
          ...(abortCtrl !== undefined && { abortController: abortCtrl }),
        })
      );
    };

    let taskRunner: ReturnType<typeof createTaskRunner>;

    beforeEach(() => {
      taskRunner = createTaskRunner();
    });

    it('should skip when enableOTelVerifier is disabled', async () => {
      jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
        enableOTelVerifier: false,
      } as any);

      await taskRunner.run();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('OTel verifier is disabled')
      );
      expect(mockedAgentPolicyService.list).not.toHaveBeenCalled();
    });

    it('should skip when experimental features are undefined', async () => {
      jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue(undefined as any);

      await taskRunner.run();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('OTel verifier is disabled')
      );
      expect(mockedAgentPolicyService.list).not.toHaveBeenCalled();
    });

    it('should skip verification when an active non-expired verifier policy exists', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({
        items: [
          {
            id: 'active-verifier',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      } as any);

      mockSoClient.find.mockResolvedValueOnce({ saved_objects: [] });

      await taskRunner.run();
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Active verifier policy'));
    });

    it('should proceed past gate check when verifier policy has expired', async () => {
      const sixMinutesAgo = minutesAgo(6);

      mockedAgentPolicyService.list.mockResolvedValueOnce({
        items: [{ id: 'expired-verifier', created_at: sixMinutesAgo, updated_at: sixMinutesAgo }],
      } as any);

      mockSoClient.find.mockResolvedValue({ saved_objects: [] });

      await taskRunner.run();

      expect(logger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('Active verifier policy')
      );
    });

    it('should complete when no connectors have installed packages', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockSoClient.find.mockResolvedValue({ saved_objects: [] });

      await taskRunner.run();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No connectors with installed packages found')
      );
    });

    it('should filter out empty connector IDs from package policy map', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [
            makePackagePolicySO('pp-1', '', 'cloudtrail'),
            makePackagePolicySO('pp-2', '  ', 'guardduty'),
          ],
        })
        .mockResolvedValueOnce({ saved_objects: [] });

      await taskRunner.run();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No connectors with installed packages found')
      );
    });

    it('should skip connector when not eligible', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [makePackagePolicySO('pp-1', 'conn-1', 'cloudtrail')],
        })
        .mockResolvedValueOnce({
          saved_objects: [
            makeConnectorSO('conn-1', {
              created_at: '2020-01-01T00:00:00Z',
              updated_at: '2020-01-01T00:00:00Z',
              verification_status: 'success',
              verification_started_at: new Date().toISOString(),
            }),
          ],
        });

      await taskRunner.run();
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('not eligible'));
    });

    it('should skip connector with empty policy templates', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [
            {
              id: 'pp-1',
              attributes: {
                cloud_connector_id: 'conn-1',
                inputs: [{ enabled: false, policy_template: 'cloudtrail' }],
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1')],
        });

      await taskRunner.run();

      expect(mockedAgentPolicyService.createVerifierPolicy).not.toHaveBeenCalled();
    });

    it('should verify eligible connector and update status on success', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockResolvedValueOnce({
        policyId: 'verifier-policy-1',
      });

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [makePackagePolicySO('pp-1', 'conn-1', 'cloudtrail')],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1')],
        });

      mockSoClient.update.mockResolvedValue({});

      await taskRunner.run();

      expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledWith(
        mockSoClient,
        mockEsClient,
        expect.objectContaining({ id: 'conn-1' }),
        expect.objectContaining({
          policyTemplates: ['cloudtrail'],
          packageName: 'aws',
          packageTitle: 'AWS',
          packageVersion: '2.0.0',
        })
      );

      expect(mockSoClient.update).toHaveBeenCalledWith(
        CLOUD_CONNECTOR_SAVED_OBJECT_TYPE,
        'conn-1',
        expect.objectContaining({
          verification_started_at: expect.any(String),
          verification_status: 'pending',
        })
      );
    });

    it('should mark connector as failed when createVerifierPolicy throws', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockRejectedValueOnce(
        new Error('deployment failed')
      );

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [makePackagePolicySO('pp-1', 'conn-1', 'guardduty')],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1')],
        });

      mockSoClient.update.mockResolvedValue({});

      await taskRunner.run();

      expect(mockSoClient.update).toHaveBeenCalledWith(
        CLOUD_CONNECTOR_SAVED_OBJECT_TYPE,
        'conn-1',
        expect.objectContaining({
          verification_status: 'failed',
          verification_failed_at: expect.any(String),
        })
      );
    });

    it('should log error but not throw when updateConnectorStatus fails', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockResolvedValueOnce({
        policyId: 'verifier-policy-1',
      });

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [makePackagePolicySO('pp-1', 'conn-1', 'cloudtrail')],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1')],
        });

      mockSoClient.update.mockRejectedValue(new Error('SO update failed'));

      await expect(taskRunner.run()).resolves.not.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update connector conn-1 status')
      );
    });

    it('should aggregate multiple policy templates for the same connector', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockResolvedValueOnce({
        policyId: 'verifier-policy-1',
      });

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [
            makePackagePolicySO('pp-1', 'conn-1', 'cloudtrail'),
            makePackagePolicySO('pp-2', 'conn-1', 'guardduty'),
          ],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1', { name: 'Multi Template Connector' })],
        });

      mockSoClient.update.mockResolvedValue({});

      await taskRunner.run();

      expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledWith(
        mockSoClient,
        mockEsClient,
        expect.anything(),
        expect.objectContaining({
          policyTemplates: ['cloudtrail', 'guardduty'],
        })
      );
    });

    it('should deduplicate identical policy templates for the same connector', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockResolvedValueOnce({
        policyId: 'verifier-policy-1',
      });

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [
            makePackagePolicySO('pp-1', 'conn-1', 'cloudtrail'),
            makePackagePolicySO('pp-2', 'conn-1', 'cloudtrail'),
          ],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1')],
        });

      mockSoClient.update.mockResolvedValue({});

      await taskRunner.run();

      expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledWith(
        mockSoClient,
        mockEsClient,
        expect.anything(),
        expect.objectContaining({
          policyTemplates: ['cloudtrail'],
        })
      );
    });

    it('should query verifier policies across all spaces during gate check', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockSoClient.find.mockResolvedValue({ saved_objects: [] });

      await taskRunner.run();

      expect(mockedAgentPolicyService.list).toHaveBeenCalledWith(
        mockSoClient,
        expect.objectContaining({
          kuery: expect.stringContaining('is_verifier: true'),
          spaceId: '*',
        })
      );
      expect(mockedAgentPolicyService.list).toHaveBeenCalledTimes(1);
      expect(mockedAgentPolicyService.list.mock.calls[0][1]).toMatchObject({ spaceId: '*' });
    });

    it('should skip verification when gate sees a verifier policy within TTL', async () => {
      const twoMinutesAgo = minutesAgo(2);

      mockedAgentPolicyService.list.mockResolvedValueOnce({
        items: [{ id: 'fresh-verifier', created_at: twoMinutesAgo, updated_at: twoMinutesAgo }],
      } as any);

      await taskRunner.run();

      expect(mockedAgentPolicyService.createVerifierPolicy).not.toHaveBeenCalled();
      expect(mockedAgentPolicyService.deleteVerifierPolicy).not.toHaveBeenCalled();
    });

    it('should verify only one connector per task run (one verifier deploy at a time)', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockResolvedValueOnce({
        policyId: 'verifier-policy-1',
      });

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [
            makePackagePolicySO('pp-1', 'conn-1', 'cloudtrail'),
            makePackagePolicySO('pp-2', 'conn-2', 'guardduty'),
          ],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1'), makeConnectorSO('conn-2')],
        });

      mockSoClient.update.mockResolvedValue({});

      await taskRunner.run();

      expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledTimes(1);
      expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledWith(
        mockSoClient,
        mockEsClient,
        expect.objectContaining({ id: 'conn-1' }),
        expect.anything()
      );
    });

    it('should request a follow-up run (runAt ~TTL+buffer) when more eligible connectors remain', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockResolvedValueOnce({
        policyId: 'verifier-policy-1',
      });

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [
            makePackagePolicySO('pp-1', 'conn-1', 'cloudtrail'),
            makePackagePolicySO('pp-2', 'conn-2', 'guardduty'),
          ],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1'), makeConnectorSO('conn-2')],
        });

      mockSoClient.update.mockResolvedValue({});

      const before = Date.now();
      const result = (await taskRunner.run()) as { runAt: Date } | undefined;
      const after = Date.now();

      expect(result).toBeDefined();
      expect(result!.runAt).toBeInstanceOf(Date);
      // Expected runAt is (now + TTL_MS + buffer). With TTL_MS = 5 min and buffer = 30 s
      // the bound is [before + 5:30, after + 5:30].
      const TTL_MS = 5 * 60 * 1000;
      const BUFFER_MS = 30 * 1000;
      expect(result!.runAt.getTime()).toBeGreaterThanOrEqual(before + TTL_MS + BUFFER_MS - 100);
      expect(result!.runAt.getTime()).toBeLessThanOrEqual(after + TTL_MS + BUFFER_MS + 100);
    });

    it('should request a follow-up run when only one eligible connector existed (verifier TTL cleanup)', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockResolvedValueOnce({
        policyId: 'verifier-policy-1',
      });

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [makePackagePolicySO('pp-1', 'conn-1', 'cloudtrail')],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1')],
        });

      mockSoClient.update.mockResolvedValue({});

      const before = Date.now();
      const result = (await taskRunner.run()) as { runAt: Date } | undefined;
      const after = Date.now();

      expect(result).toBeDefined();
      expect(result!.runAt).toBeInstanceOf(Date);
      const TTL_MS = 5 * 60 * 1000;
      const BUFFER_MS = 30 * 1000;
      expect(result!.runAt.getTime()).toBeGreaterThanOrEqual(before + TTL_MS + BUFFER_MS - 100);
      expect(result!.runAt.getTime()).toBeLessThanOrEqual(after + TTL_MS + BUFFER_MS + 100);
    });

    it('should request a follow-up run when the gate blocks because a verifier is still in flight', async () => {
      const twoMinutesAgo = minutesAgo(2);

      mockedAgentPolicyService.list.mockResolvedValueOnce({
        items: [
          {
            id: 'in-flight-verifier',
            created_at: twoMinutesAgo,
            updated_at: twoMinutesAgo,
          },
        ],
      } as any);

      const result = (await taskRunner.run()) as { runAt: Date } | undefined;

      expect(result).toBeDefined();
      expect(result!.runAt).toBeInstanceOf(Date);
      // Gate-blocked runs also reschedule so we can drain the queue after the
      // active verifier's TTL elapses (otherwise we'd wait the full 12 h cron).
      expect(result!.runAt.getTime()).toBeGreaterThan(Date.now());
      expect(mockedAgentPolicyService.createVerifierPolicy).not.toHaveBeenCalled();
    });

    it('should NOT request a follow-up run when the feature flag is off', async () => {
      jest.spyOn(appContextService, 'getExperimentalFeatures').mockReturnValue({
        enableOTelVerifier: false,
      } as any);

      const result = await taskRunner.run();
      expect(result).toBeUndefined();
    });

    it('should NOT request a follow-up run when an earlier verification fails with no other eligibles', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockRejectedValueOnce(
        new Error('agentless provisioning limit')
      );

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [makePackagePolicySO('pp-1', 'conn-1', 'cloudtrail')],
        })
        .mockResolvedValueOnce({
          saved_objects: [makeConnectorSO('conn-1')],
        });

      mockSoClient.update.mockResolvedValue({});

      const result = await taskRunner.run();

      // Only one connector, and it failed — no more work this cycle.
      expect(result).toBeUndefined();
    });

    it('should skip all verifications when a non-expired verifier deployment is in flight', async () => {
      const twoMinutesAgo = minutesAgo(2);

      mockedAgentPolicyService.list.mockResolvedValueOnce({
        items: [
          {
            id: 'in-flight-verifier',
            created_at: twoMinutesAgo,
            updated_at: twoMinutesAgo,
          },
        ],
      } as any);

      await taskRunner.run();

      expect(mockedAgentPolicyService.createVerifierPolicy).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Active verifier policy in-flight-verifier exists')
      );
    });

    it('should not retry a recently failed connector until the backoff window elapses', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      const twoMinutesAgo = minutesAgo(2);

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [makePackagePolicySO('pp-1', 'conn-failed', 'cloudtrail')],
        })
        .mockResolvedValueOnce({
          saved_objects: [
            makeConnectorSO('conn-failed', {
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              verification_status: 'failed',
              verification_started_at: twoMinutesAgo,
              verification_failed_at: twoMinutesAgo,
            }),
          ],
        });

      await taskRunner.run();

      expect(mockedAgentPolicyService.createVerifierPolicy).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('not eligible'));
    });

    it('should retry a failed connector after the backoff window elapses', async () => {
      mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

      mockedAgentPolicyService.createVerifierPolicy.mockResolvedValueOnce({
        policyId: 'verifier-policy-retry',
      });

      const sixMinutesAgo = minutesAgo(6);

      mockSoClient.find
        .mockResolvedValueOnce({
          saved_objects: [makePackagePolicySO('pp-1', 'conn-retry', 'cloudtrail')],
        })
        .mockResolvedValueOnce({
          saved_objects: [
            makeConnectorSO('conn-retry', {
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              verification_status: 'failed',
              verification_started_at: sixMinutesAgo,
              verification_failed_at: sixMinutesAgo,
            }),
          ],
        });

      mockSoClient.update.mockResolvedValue({});

      await taskRunner.run();

      expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledTimes(1);
    });

    describe('abort handling', () => {
      it('should exit gracefully when aborted before gate and verification', async () => {
        const abortCtrl = new AbortController();
        taskRunner = createTaskRunner(abortCtrl);

        mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

        abortCtrl.abort();

        await taskRunner.run();

        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Task was aborted'));
        expect(mockedAgentPolicyService.createVerifierPolicy).not.toHaveBeenCalled();
      });

      it('should exit gracefully when aborted during gate list before verification', async () => {
        const abortCtrl = new AbortController();
        taskRunner = createTaskRunner(abortCtrl);

        mockedAgentPolicyService.list.mockImplementationOnce(async () => {
          abortCtrl.abort();
          return { items: [] } as any;
        });

        mockSoClient.find.mockResolvedValue({ saved_objects: [] });

        await taskRunner.run();

        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Task was aborted'));
      });
    });

    describe('isConnectorEligible (integration via task runner)', () => {
      const setupEligibilityTest = (connectorAttrs: Record<string, unknown>) => {
        mockedAgentPolicyService.list.mockResolvedValueOnce({ items: [] } as any);

        mockedAgentPolicyService.createVerifierPolicy.mockResolvedValueOnce({
          policyId: 'verifier-policy-elig',
        });

        mockSoClient.find
          .mockResolvedValueOnce({
            saved_objects: [makePackagePolicySO('pp-1', 'conn-elig', 'cspm')],
          })
          .mockResolvedValueOnce({
            saved_objects: [makeConnectorSO('conn-elig', connectorAttrs)],
          });

        mockSoClient.update.mockResolvedValue({});
      };

      it('should verify connector that has never been verified (no verification_started_at)', async () => {
        setupEligibilityTest({});

        await taskRunner.run();

        expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledTimes(1);
      });

      it('should verify recently created connector', async () => {
        setupEligibilityTest({
          created_at: minutesAgo(2),
          verification_started_at: minutesAgo(6),
          verification_status: 'success',
        });

        await taskRunner.run();

        expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledTimes(1);
      });

      it('should verify recently updated connector', async () => {
        setupEligibilityTest({
          created_at: minutesAgo(10),
          updated_at: minutesAgo(2),
          verification_started_at: minutesAgo(6),
          verification_status: 'success',
        });

        await taskRunner.run();

        expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledTimes(1);
      });

      it('should re-verify connector whose verification_started_at expired and status is not failed', async () => {
        setupEligibilityTest({
          created_at: minutesAgo(10),
          updated_at: minutesAgo(10),
          verification_started_at: minutesAgo(6),
          verification_status: 'pending',
        });

        await taskRunner.run();

        expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledTimes(1);
      });

      it('should not re-verify connector whose verification_started_at is recent and status is success', async () => {
        setupEligibilityTest({
          created_at: minutesAgo(10),
          updated_at: minutesAgo(10),
          verification_started_at: minutesAgo(2),
          verification_status: 'success',
        });

        await taskRunner.run();

        expect(mockedAgentPolicyService.createVerifierPolicy).not.toHaveBeenCalled();
      });

      it('should verify connector with no verification_status set (backwards compat)', async () => {
        setupEligibilityTest({
          created_at: minutesAgo(10),
          updated_at: minutesAgo(10),
          verification_started_at: minutesAgo(6),
        });

        await taskRunner.run();

        expect(mockedAgentPolicyService.createVerifierPolicy).toHaveBeenCalledTimes(1);
      });
    });
  });
});
