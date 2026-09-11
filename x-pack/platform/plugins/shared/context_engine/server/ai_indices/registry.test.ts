/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { AiIndexRegistry } from './registry';
import { AiIndexConflictError, AiIndexIdConflictError, InvalidAiIndexDestError } from './errors';
import type { AiIndexService } from './service';
import type { AiIndexProperties } from '../../common/http_api/ai_indices';

const DEFAULT_SPACE = 'default';

const makeProperties = (overrides: Partial<AiIndexProperties> = {}): AiIndexProperties => ({
  description: 'A test AI index',
  dest: { type: 'index', value: 'ai-index-idx-test' },
  automations: [],
  sources: [],
  ...overrides,
});

const makeServiceMock = (): jest.Mocked<Pick<AiIndexService, 'putManaged'>> => ({
  putManaged: jest.fn(),
});

describe('AiIndexRegistry', () => {
  let registry: AiIndexRegistry;
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  beforeEach(() => {
    registry = new AiIndexRegistry();
    logger = loggingSystemMock.createLogger();
  });

  describe('register()', () => {
    it('buffers a registration before freeze is called', () => {
      registry.register('test', makeProperties());

      expect(registry.has('test')).toBe(true);
      expect(registry.getManagedIds()).toEqual(['test']);
    });

    it('throws if called after freeze', () => {
      registry.freeze();

      expect(() => registry.register('test', makeProperties())).toThrow(
        'registerAiIndex called after plugin setup'
      );
    });

    it('throws if the same id is registered twice', () => {
      registry.register('test', makeProperties());
      expect(() => registry.register('test', makeProperties())).toThrow(
        "AI index 'test' is already registered"
      );
    });
  });

  describe('getManagedIds() and has()', () => {
    it('returns registered ids and reports presence', () => {
      registry.register('a', makeProperties({ description: 'A' }));
      registry.register('b', makeProperties({ description: 'B' }));

      expect(registry.getManagedIds()).toEqual(['a', 'b']);
      expect(registry.has('a')).toBe(true);
      expect(registry.has('missing')).toBe(false);
    });
  });

  describe('ensure()', () => {
    it('does nothing when the id is not registered', async () => {
      const service = makeServiceMock();

      await registry.ensure({
        id: 'unknown',
        spaceId: DEFAULT_SPACE,
        aiIndexService: service as unknown as AiIndexService,
        logger,
      });

      expect(service.putManaged).not.toHaveBeenCalled();
    });

    it('calls putManaged with spaceId for a registered id', async () => {
      const properties = makeProperties();
      const service = makeServiceMock();
      service.putManaged.mockResolvedValue('created');
      registry.register('test', properties);

      await registry.ensure({
        id: 'test',
        spaceId: DEFAULT_SPACE,
        aiIndexService: service as unknown as AiIndexService,
        logger,
      });

      expect(service.putManaged).toHaveBeenCalledWith('test', DEFAULT_SPACE, properties);
      expect(logger.debug).toHaveBeenCalledWith(
        `AI index 'test' created in space '${DEFAULT_SPACE}'`
      );
    });

    it('rethrows InvalidAiIndexDestError', async () => {
      const service = makeServiceMock();
      service.putManaged.mockRejectedValue(new InvalidAiIndexDestError('dest not ready'));
      registry.register('test', makeProperties());

      await expect(
        registry.ensure({
          id: 'test',
          spaceId: DEFAULT_SPACE,
          aiIndexService: service as unknown as AiIndexService,
          logger,
        })
      ).rejects.toBeInstanceOf(InvalidAiIndexDestError);
    });

    it('rethrows when the id is taken by a user-owned index', async () => {
      const service = makeServiceMock();
      service.putManaged.mockRejectedValue(new AiIndexIdConflictError('test'));
      registry.register('test', makeProperties());

      await expect(
        registry.ensure({
          id: 'test',
          spaceId: DEFAULT_SPACE,
          aiIndexService: service as unknown as AiIndexService,
          logger,
        })
      ).rejects.toBeInstanceOf(AiIndexIdConflictError);
    });

    it('treats a concurrent registration (AiIndexConflictError) as benign', async () => {
      const service = makeServiceMock();
      service.putManaged.mockRejectedValue(new AiIndexConflictError('test'));
      registry.register('test', makeProperties());

      await expect(
        registry.ensure({
          id: 'test',
          spaceId: DEFAULT_SPACE,
          aiIndexService: service as unknown as AiIndexService,
          logger,
        })
      ).resolves.not.toThrow();

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('registered concurrently'));
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('rethrows unexpected errors', async () => {
      const service = makeServiceMock();
      service.putManaged.mockRejectedValue(new Error('ES cluster unavailable'));
      registry.register('test', makeProperties());

      await expect(
        registry.ensure({
          id: 'test',
          spaceId: DEFAULT_SPACE,
          aiIndexService: service as unknown as AiIndexService,
          logger,
        })
      ).rejects.toThrow('ES cluster unavailable');
    });
  });
});
