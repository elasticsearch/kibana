/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  coreMock,
  elasticsearchServiceMock,
  httpServerMock,
  loggingSystemMock,
} from '@kbn/core/server/mocks';
import { ChangeHistoryClient } from '@kbn/change-history';
import { RULE_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import type { RuleChange, RuleChangeHistorySnapshot } from './types';
import { ChangeTrackingService } from './service';

jest.mock('@kbn/change-history', () => ({
  ChangeHistoryClient: jest.fn(),
}));

const ChangeHistoryClientMock = ChangeHistoryClient as jest.MockedClass<typeof ChangeHistoryClient>;

interface MockChangeHistoryClient {
  isInitialized: jest.Mock<boolean, []>;
  initialize: jest.Mock<Promise<void>, [unknown]>;
  logBulk: jest.Mock<Promise<void>, [unknown, unknown]>;
  getHistory: jest.Mock<
    Promise<{ items: unknown[]; total: number }>,
    [string, string, string, unknown]
  >;
}

const createMockClient = (): MockChangeHistoryClient => ({
  isInitialized: jest.fn().mockReturnValue(false),
  initialize: jest.fn().mockResolvedValue(undefined),
  logBulk: jest.fn().mockResolvedValue(undefined),
  getHistory: jest.fn().mockResolvedValue({ items: [], total: 0 }),
});

describe('ChangeTrackingService', () => {
  const kibanaVersion = '9.0.0';
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;
  let service: ChangeTrackingService;

  const ruleSnapshot = (name: string): RuleChangeHistorySnapshot =>
    ({ name } as unknown as RuleChangeHistorySnapshot);

  const initializeService = (user: { username: string; profile_uid?: string } | null) => {
    const authService = coreMock.createStart().security.authc;
    (authService.getCurrentUser as jest.Mock).mockReturnValue(user);
    service.initialize({
      elasticsearchClient: elasticsearchServiceMock.createClusterClient().asInternalUser,
      authService,
    });
    return { authService };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ChangeHistoryClientMock.mockImplementation(
      () => createMockClient() as unknown as ChangeHistoryClient
    );
    logger = loggingSystemMock.createLogger();
    service = new ChangeTrackingService(logger, kibanaVersion);
  });

  describe('register', () => {
    it('creates one ChangeHistoryClient per module', () => {
      service.register('stack');
      service.register('stack');
      expect(ChangeHistoryClientMock).toHaveBeenCalledTimes(1);
      expect(ChangeHistoryClientMock).toHaveBeenCalledWith(
        expect.objectContaining({
          module: 'stack',
          dataset: 'alerting-rules',
          logger: expect.objectContaining({ context: ['change_tracking'] }),
          kibanaVersion,
        })
      );
    });

    it('creates distinct clients for different modules', () => {
      service.register('stack');
      service.register('security');
      expect(ChangeHistoryClientMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('isInitialized', () => {
    it('delegates to the client isInitialized()', () => {
      service.register('stack');
      const instance = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
      instance.isInitialized.mockReturnValue(true);
      expect(service.isInitialized('stack')).toBe(true);
      expect(instance.isInitialized).toHaveBeenCalled();
    });

    it('returns false when the module was not registered', () => {
      expect(service.isInitialized('stack')).toBe(false);
    });
  });

  describe('initialize', () => {
    it('calls initialize on each registered client', async () => {
      service.register('stack');
      service.register('security');
      const stackClient = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
      const securityClient = ChangeHistoryClientMock.mock.results[1]!
        .value as MockChangeHistoryClient;
      stackClient.isInitialized.mockReturnValue(true);
      securityClient.isInitialized.mockReturnValue(true);

      const elasticsearchClient = elasticsearchServiceMock.createClusterClient().asInternalUser;
      const authService = coreMock.createStart().security.authc;
      service.initialize({ elasticsearchClient, authService });

      await new Promise(process.nextTick);

      expect(stackClient.initialize).toHaveBeenCalledWith(elasticsearchClient);
      expect(securityClient.initialize).toHaveBeenCalledWith(elasticsearchClient);

      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('asScoped', () => {
    const change: RuleChange = {
      module: 'stack',
      objectType: RULE_SAVED_OBJECT_TYPE,
      objectId: 'rule-1',
      snapshot: { name: 'after' } as unknown as RuleChangeHistorySnapshot,
    };

    describe('log', () => {
      it('throws when called before initialize()', () => {
        service.register('stack');
        expect(() => service.asScoped(httpServerMock.createKibanaRequest())).toThrow(
          /before initialize/
        );
      });

      it('forwards a single change to logBulk', async () => {
        service.register('stack');
        const client = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
        const request = httpServerMock.createKibanaRequest();

        initializeService({
          username: 'alice',
          profile_uid: 'profile-123',
        });

        await service.asScoped(request).log(change, { action: 'rule_update', spaceId: 'default' });

        expect(client.logBulk).toHaveBeenCalledTimes(1);
        expect(client.logBulk).toHaveBeenCalledWith(
          [
            {
              objectType: RULE_SAVED_OBJECT_TYPE,
              objectId: 'rule-1',
              before: undefined,
              snapshot: ruleSnapshot('after'),
            },
          ],
          expect.objectContaining({
            action: 'rule_update',
            spaceId: 'default',
            fieldsToHash: { apiKey: true, uiamApiKey: true },
            correlationId: expect.any(String),
          })
        );
      });

      it('resolves user identity from the request and forwards a single change to the underlying client logBulk', async () => {
        service.register('stack');
        const client = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
        const { authService } = initializeService({
          username: 'alice',
          profile_uid: 'profile-123',
        });

        const request = httpServerMock.createKibanaRequest();
        await service.asScoped(request).log(change, { action: 'rule_update', spaceId: 'default' });

        expect(authService.getCurrentUser).toHaveBeenCalledWith(request);
        expect(client.logBulk).toHaveBeenCalledTimes(1);
        expect(client.logBulk).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({
            username: 'alice',
            userProfileId: 'profile-123',
          })
        );
      });

      it('falls back to an empty username when no user is on the request', async () => {
        service.register('stack');
        const client = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
        initializeService(null);

        await service
          .asScoped(httpServerMock.createKibanaRequest())
          .log(change, { action: 'rule_update', spaceId: 'default' });

        expect(client.logBulk).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({
            username: '',
            userProfileId: undefined,
          })
        );
      });
    });

    describe('logBulk', () => {
      it('throws when called before initialize()', () => {
        service.register('stack');
        expect(() => service.asScoped(httpServerMock.createKibanaRequest())).toThrow(
          /before initialize/
        );
      });

      it('forwards multiple changes to logBulk', async () => {
        service.register('stack');
        const client = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
        const request = httpServerMock.createKibanaRequest();
        const changes: RuleChange[] = [
          {
            module: 'stack',
            objectType: RULE_SAVED_OBJECT_TYPE,
            objectId: 'rule-1',
            snapshot: ruleSnapshot('a'),
          },
          {
            module: 'stack',
            objectType: RULE_SAVED_OBJECT_TYPE,
            objectId: 'rule-2',
            snapshot: ruleSnapshot('b'),
          },
        ];

        initializeService({
          username: 'alice',
          profile_uid: 'profile-123',
        });

        await service
          .asScoped(request)
          .logBulk(changes, { action: 'rule_update', spaceId: 'default' });

        expect(client.logBulk).toHaveBeenCalledTimes(1);
        expect(client.logBulk).toHaveBeenCalledWith(
          [
            {
              objectType: RULE_SAVED_OBJECT_TYPE,
              objectId: 'rule-1',
              before: undefined,
              snapshot: ruleSnapshot('a'),
            },
            {
              objectType: RULE_SAVED_OBJECT_TYPE,
              objectId: 'rule-2',
              before: undefined,
              snapshot: ruleSnapshot('b'),
            },
          ],
          expect.objectContaining({
            action: 'rule_update',
            spaceId: 'default',
            correlationId: expect.any(String),
          })
        );
      });

      it('resolves user identity from the request and forwards multiple changes to the underlying client logBulk', async () => {
        service.register('stack');
        const client = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
        const { authService } = initializeService({
          username: 'alice',
          profile_uid: 'profile-123',
        });

        const request = httpServerMock.createKibanaRequest();
        const changes: RuleChange[] = [
          {
            module: 'stack',
            objectType: RULE_SAVED_OBJECT_TYPE,
            objectId: 'rule-1',
            snapshot: ruleSnapshot('a'),
          },
          {
            module: 'stack',
            objectType: RULE_SAVED_OBJECT_TYPE,
            objectId: 'rule-2',
            snapshot: ruleSnapshot('b'),
          },
        ];

        await service
          .asScoped(request)
          .logBulk(changes, { action: 'rule_update', spaceId: 'default' });

        expect(authService.getCurrentUser).toHaveBeenCalledWith(request);
        expect(client.logBulk).toHaveBeenCalledTimes(1);
        expect(client.logBulk).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({
            username: 'alice',
            userProfileId: 'profile-123',
          })
        );
      });

      it('falls back to an empty username when no user is on the request', async () => {
        service.register('stack');
        const client = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
        initializeService(null);

        await service
          .asScoped(httpServerMock.createKibanaRequest())
          .logBulk([change], { action: 'rule_update', spaceId: 'default' });

        expect(client.logBulk).toHaveBeenCalledWith(
          expect.any(Array),
          expect.objectContaining({
            username: '',
            userProfileId: undefined,
          })
        );
      });

      it('groups changes by module and shares one correlationId across bulk calls', async () => {
        service.register('stack');
        service.register('security');
        const stackClient = ChangeHistoryClientMock.mock.results[0]!
          .value as MockChangeHistoryClient;
        const securityClient = ChangeHistoryClientMock.mock.results[1]!
          .value as MockChangeHistoryClient;
        initializeService({ username: 'alice' });

        const changes: RuleChange[] = [
          {
            module: 'stack',
            objectType: RULE_SAVED_OBJECT_TYPE,
            objectId: 'a',
            snapshot: ruleSnapshot('a'),
          },
          {
            module: 'security',
            objectType: RULE_SAVED_OBJECT_TYPE,
            objectId: 'b',
            snapshot: ruleSnapshot('b'),
          },
        ];

        await service
          .asScoped(httpServerMock.createKibanaRequest())
          .logBulk(changes, { action: 'rule_update', spaceId: 'default' });

        expect(stackClient.logBulk).toHaveBeenCalledTimes(1);
        expect(securityClient.logBulk).toHaveBeenCalledTimes(1);

        const stackOpts = stackClient.logBulk.mock.calls[0]![1] as { correlationId: string };
        const securityOpts = securityClient.logBulk.mock.calls[0]![1] as { correlationId: string };
        expect(stackOpts.correlationId).toBe(securityOpts.correlationId);
      });

      it('swallows logBulk errors and logs them', async () => {
        service.register('stack');
        const client = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
        client.logBulk.mockRejectedValueOnce(new Error('es down'));
        initializeService({ username: 'alice' });

        const failingChange: RuleChange = {
          module: 'stack',
          objectType: RULE_SAVED_OBJECT_TYPE,
          objectId: 'rule-1',
          snapshot: ruleSnapshot('x'),
        };

        await expect(
          service
            .asScoped(httpServerMock.createKibanaRequest())
            .logBulk([failingChange], { action: 'rule_update', spaceId: 'default' })
        ).resolves.toBeUndefined();
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringMatching(
              /^Error saving change history for \[stack, alerting-rules\], missing 1 change\(s\) with correlationId=[a-f0-9]{32}: Error: es down$/
            ),
          })
        );
      });

      it('does not call logBulk when the change module was never registered', async () => {
        service.register('stack');
        const stackClient = ChangeHistoryClientMock.mock.results[0]!
          .value as MockChangeHistoryClient;
        initializeService({ username: 'alice' });

        const securityChange: RuleChange = {
          module: 'security',
          objectType: RULE_SAVED_OBJECT_TYPE,
          objectId: 'rule-1',
          snapshot: ruleSnapshot('x'),
        };

        await service
          .asScoped(httpServerMock.createKibanaRequest())
          .logBulk([securityChange], { action: 'rule_update', spaceId: 'default' });

        expect(stackClient.logBulk).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringMatching(
              /^Unable to log changes\. Change history client not initialized for \[security, alerting-rules\] correlationId=[a-f0-9]{32}; dropped 1 change\(s\)$/
            ),
          })
        );
      });
    });

    describe('getHistory', () => {
      it('delegates to the underlying client getHistory with rule saved object type', async () => {
        service.register('stack');
        const client = ChangeHistoryClientMock.mock.results[0]!.value as MockChangeHistoryClient;
        initializeService({ username: 'alice' });
        const opts = { size: 10 };

        await service
          .asScoped(httpServerMock.createKibanaRequest())
          .getHistory('stack', 'default', 'rule-1', opts);

        expect(client.getHistory).toHaveBeenCalledTimes(1);
        expect(client.getHistory).toHaveBeenCalledWith(
          'default',
          RULE_SAVED_OBJECT_TYPE,
          'rule-1',
          opts
        );
      });

      it('throws when the module has no client and adds a warning to the logs', async () => {
        initializeService({ username: 'alice' });
        await expect(
          service
            .asScoped(httpServerMock.createKibanaRequest())
            .getHistory('stack', 'default', 'rule-1', {})
        ).rejects.toThrow(
          'Unable to get history. Change history client not initialized for [stack, alerting-rules]'
        );
        expect(logger.error).not.toHaveBeenCalled();
        expect(logger.warn).toHaveBeenCalledWith(
          'Unable to get history. Change history client not initialized for [stack, alerting-rules]'
        );
      });
    });
  });
});
