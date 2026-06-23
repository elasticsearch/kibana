/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggerMock } from '@kbn/logging-mocks';
import { StepCategory } from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import { ServerStepRegistry } from './step_registry';
import { isOneShotStepDefinition, type ServerHandlerStepDefinition } from './types';

const stepId = 'custom.myStep';
const handler = jest.fn();
const defaultDefinition: ServerHandlerStepDefinition = {
  id: stepId,
  category: StepCategory.Kibana,
  label: 'My Custom Step',
  description: 'A custom step implementation',
  inputSchema: z.object({ name: z.string() }),
  outputSchema: z.object({ name: z.string() }),
  handler,
};

describe('ServerStepRegistry', () => {
  let registry: ServerStepRegistry;
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    logger = loggerMock.create();
    registry = new ServerStepRegistry(logger);
  });

  describe('register', () => {
    it('should register a step definition', () => {
      registry.register(defaultDefinition);

      expect(registry.has(stepId)).toBe(true);
      expect(registry.get(stepId)).toBe(defaultDefinition);
    });

    it('should throw an error if a step with the same ID is already registered', () => {
      registry.register(defaultDefinition);

      expect(() => {
        registry.register(defaultDefinition);
      }).toThrow('Step definition for type "custom.myStep" is already registered');
    });
  });

  describe('get', () => {
    it('should return the handler for a registered step', () => {
      registry.register(defaultDefinition);

      const definition = registry.get(stepId);
      expect(isOneShotStepDefinition(definition!)).toBe(true);
      expect(
        definition && isOneShotStepDefinition(definition) ? definition.handler : undefined
      ).toBe(handler);
    });

    it('should return undefined for an unregistered step', () => {
      expect(registry.get('unknown.step')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for a registered step', () => {
      registry.register(defaultDefinition);

      expect(registry.has(stepId)).toBe(true);
    });

    it('should return false for an unregistered step', () => {
      expect(registry.has('unknown.step')).toBe(false);
    });
  });

  describe('getAllStepTypeIds', () => {
    it('should return all registered step type IDs', () => {
      registry.register({ ...defaultDefinition, id: 'custom.step1' });
      registry.register({ ...defaultDefinition, id: 'custom.step2' });
      registry.register({ ...defaultDefinition, id: 'plugin.step3' });

      const allIds = registry.getAll().map((step) => step.id);

      expect(allIds).toHaveLength(3);
      expect(allIds[0]).toBe('custom.step1');
      expect(allIds[1]).toBe('custom.step2');
      expect(allIds[2]).toBe('plugin.step3');
    });

    it('should return an empty array when no steps are registered', () => {
      const allIds = registry.getAll();
      expect(allIds).toEqual([]);
    });
  });

  describe('register with async loader', () => {
    it('should resolve loader and add definition to registry', async () => {
      registry.register(() => Promise.resolve(defaultDefinition));

      expect(registry.has(stepId)).toBe(false);
      await registry.whenReady();
      expect(registry.has(stepId)).toBe(true);
      expect(registry.get(stepId)).toEqual(defaultDefinition);
    });

    it('should skip registration when loader resolves with undefined', async () => {
      registry.register(() => Promise.resolve(undefined));

      await registry.whenReady();

      expect(registry.has(stepId)).toBe(false);
      expect(registry.getAll()).toHaveLength(0);
    });

    it('should log an error and skip registration when resolved definition duplicates an existing step type ID', async () => {
      registry.register(defaultDefinition);
      const loader = () => Promise.resolve({ ...defaultDefinition, label: 'Other' });

      registry.register(loader);

      await expect(registry.whenReady()).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to register step definition',
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining(
              'Step definition for type "custom.myStep" is already registered'
            ),
          }),
        })
      );
      // Original definition is preserved
      expect(registry.get(stepId)).toEqual(defaultDefinition);
    });

    it('whenReady() should resolve after all loaders have settled', async () => {
      const def1: ServerHandlerStepDefinition = { ...defaultDefinition, id: 'custom.step1' };
      const def2: ServerHandlerStepDefinition = { ...defaultDefinition, id: 'custom.step2' };
      let resolve1!: (d: ServerHandlerStepDefinition) => void;
      let resolve2!: (d: ServerHandlerStepDefinition) => void;
      const promise1 = new Promise<ServerHandlerStepDefinition>((r) => {
        resolve1 = r;
      });
      const promise2 = new Promise<ServerHandlerStepDefinition>((r) => {
        resolve2 = r;
      });

      registry.register(() => promise1);
      registry.register(() => promise2);

      const readyPromise = registry.whenReady();
      expect(registry.getAll()).toHaveLength(0);

      resolve1(def1);
      await Promise.resolve();
      expect(registry.getAll()).toHaveLength(1);

      resolve2(def2);
      await readyPromise;
      expect(registry.getAll()).toHaveLength(2);
    });

    it('should support mixed sync and async registration', async () => {
      const syncDef: ServerHandlerStepDefinition = { ...defaultDefinition, id: 'custom.sync' };
      const asyncDef: ServerHandlerStepDefinition = { ...defaultDefinition, id: 'custom.async' };

      registry.register(syncDef);
      registry.register(() => Promise.resolve(asyncDef));

      expect(registry.has('custom.sync')).toBe(true);
      expect(registry.has('custom.async')).toBe(false);

      await registry.whenReady();

      expect(registry.get('custom.sync')).toEqual(syncDef);
      expect(registry.get('custom.async')).toEqual(asyncDef);
      expect(registry.getAll()).toHaveLength(2);
    });

    it('should log an error and resolve whenReady() when loader rejects', async () => {
      const loadError = new Error('Failed to load step module');
      registry.register(() => Promise.reject(loadError));

      await expect(registry.whenReady()).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith('Failed to register step definition', {
        error: loadError,
      });
    });
  });

  describe('whenReady', () => {
    it('should resolve immediately when no pending loaders', async () => {
      registry.register(defaultDefinition);
      await expect(registry.whenReady()).resolves.toBeUndefined();
    });
  });
});
