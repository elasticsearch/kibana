/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { PublicTriggerRegistry } from './trigger_registry';
import type { PublicTriggerDefinition } from './types';

const triggerId = 'example.test_trigger';
const eventSchema = z.object({ message: z.string() });
const defaultDefinition: PublicTriggerDefinition<typeof eventSchema> = {
  id: triggerId,
  stability: 'tech_preview',
  title: 'Test Trigger',
  description: 'A trigger for testing',
  eventSchema,
};

describe('PublicTriggerRegistry', () => {
  let registry: PublicTriggerRegistry;

  beforeEach(() => {
    registry = new PublicTriggerRegistry();
  });

  describe('register', () => {
    it('should register trigger definition', () => {
      registry.register(defaultDefinition);

      expect(registry.has(triggerId)).toBe(true);
      const retrieved = registry.get(triggerId);
      expect(retrieved).toEqual(defaultDefinition);
    });

    it('should throw an error if definition for the same trigger id is already registered', () => {
      const definition1: PublicTriggerDefinition = {
        ...defaultDefinition,
        title: 'First',
      };
      const definition2: PublicTriggerDefinition = {
        ...defaultDefinition,
        title: 'Second',
      };

      registry.register(definition1);

      expect(() => {
        registry.register(definition2);
      }).toThrow('Trigger definition for "example.test_trigger" is already registered');
    });

    it('should register trigger definition with snippets.condition', () => {
      const definition: PublicTriggerDefinition = {
        ...defaultDefinition,
        snippets: { condition: 'event.message: *test*' },
      };
      registry.register(definition);
      expect(registry.get(triggerId)?.snippets?.condition).toBe('event.message: *test*');
    });

    it('should reject registration when stability is missing', () => {
      expect(() => {
        registry.register({
          ...defaultDefinition,
          stability: undefined,
        } as unknown as PublicTriggerDefinition);
      }).toThrow('"stability" is required');
    });
  });

  describe('get', () => {
    it('should return definition for a registered trigger', () => {
      registry.register(defaultDefinition);

      const retrieved = registry.get(triggerId);
      expect(retrieved).toEqual(defaultDefinition);
    });

    it('should return undefined for an unregistered trigger', () => {
      const retrieved = registry.get('unknown.trigger');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for a registered trigger', () => {
      registry.register(defaultDefinition);
      expect(registry.has(triggerId)).toBe(true);
    });

    it('should return false for an unregistered trigger', () => {
      expect(registry.has('unknown.trigger')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no triggers are registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered trigger definitions', () => {
      const definition2: PublicTriggerDefinition = {
        id: 'other.trigger',
        stability: 'tech_preview',
        title: 'Other',
        description: 'Another trigger',
        eventSchema: z.object({ id: z.string() }),
      };
      registry.register(defaultDefinition);
      registry.register(definition2);

      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual(defaultDefinition);
      expect(all).toContainEqual(definition2);
    });
  });

  describe('register with async loader', () => {
    it('should resolve loader and add definition to registry', async () => {
      registry.register(() => Promise.resolve(defaultDefinition));

      expect(registry.has(triggerId)).toBe(false);
      await registry.whenReady();
      expect(registry.has(triggerId)).toBe(true);
      expect(registry.get(triggerId)).toEqual(defaultDefinition);
    });

    it('should not resolve loader until whenReady is called', async () => {
      const mockLoader = jest.fn().mockResolvedValue(defaultDefinition);
      registry.register(mockLoader);

      expect(registry.has(triggerId)).toBe(false);
      expect(mockLoader).not.toHaveBeenCalled();

      await registry.whenReady();
      expect(registry.has(triggerId)).toBe(true);
      expect(mockLoader).toHaveBeenCalled();
    });

    it('should throw when resolved definition duplicates an existing trigger id', async () => {
      registry.register(defaultDefinition);
      const loader = () =>
        Promise.resolve({ ...defaultDefinition, title: 'Other' } as PublicTriggerDefinition);

      registry.register(loader);

      await expect(registry.whenReady()).rejects.toThrow(
        'Trigger definition for "example.test_trigger" is already registered'
      );
    });

    it('whenReady() should resolve after all loaders have settled', async () => {
      const def1: PublicTriggerDefinition = {
        ...defaultDefinition,
        id: 'example.trigger1',
      };
      const def2: PublicTriggerDefinition = {
        ...defaultDefinition,
        id: 'example.trigger2',
      };
      let resolve1!: (d: PublicTriggerDefinition) => void;
      let resolve2!: (d: PublicTriggerDefinition) => void;
      const promise1 = new Promise<PublicTriggerDefinition>((r) => {
        resolve1 = r;
      });
      const promise2 = new Promise<PublicTriggerDefinition>((r) => {
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
      const syncDef: PublicTriggerDefinition = {
        ...defaultDefinition,
        id: 'example.sync',
      };
      const asyncDef: PublicTriggerDefinition = {
        ...defaultDefinition,
        id: 'example.async',
      };

      registry.register(syncDef);
      registry.register(() => Promise.resolve(asyncDef));

      expect(registry.has('example.sync')).toBe(true);
      expect(registry.has('example.async')).toBe(false);

      await registry.whenReady();

      expect(registry.get('example.sync')).toEqual(syncDef);
      expect(registry.get('example.async')).toEqual(asyncDef);
      expect(registry.getAll()).toHaveLength(2);
    });

    it('should throw when loader resolves with undefined', async () => {
      registry.register(() => Promise.resolve(undefined as unknown as PublicTriggerDefinition));

      await expect(registry.whenReady()).rejects.toThrow(
        'Trigger definition is not loaded correctly'
      );
    });

    it('should throw when loader resolves with null', async () => {
      registry.register(() => Promise.resolve(null as unknown as PublicTriggerDefinition));

      await expect(registry.whenReady()).rejects.toThrow(
        'Trigger definition is not loaded correctly'
      );
    });

    it('should reject whenReady() when loader rejects', async () => {
      const loadError = new Error('Failed to load trigger module');
      registry.register(() => Promise.reject(loadError));

      await expect(registry.whenReady()).rejects.toThrow('Failed to load trigger module');
    });
  });

  describe('whenReady', () => {
    it('should resolve immediately when no pending loaders', async () => {
      registry.register(defaultDefinition);
      await expect(registry.whenReady()).resolves.toBeUndefined();
    });
  });
});
