/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { TriggerRegistry } from './trigger_registry';
import type { ServerTriggerDefinition } from '../types';

const validEventSchema = z.object({
  caseId: z.string(),
  status: z.string(),
  updatedBy: z.string(),
});

const createValidDefinition = (
  overrides: Partial<ServerTriggerDefinition> = {}
): ServerTriggerDefinition => ({
  id: 'cases.updated',
  stability: 'tech_preview',
  title: 'Case updated',
  description: 'Fired when a case is updated.',
  eventSchema: validEventSchema,
  ...overrides,
});

describe('TriggerRegistry', () => {
  let registry: TriggerRegistry;

  beforeEach(() => {
    registry = new TriggerRegistry();
  });

  describe('register', () => {
    it('registers a valid trigger and retrieves it via get and list', () => {
      const def = createValidDefinition();
      registry.register(def);

      expect(registry.has('cases.updated')).toBe(true);
      expect(registry.get('cases.updated')).toBe(def);
      expect(registry.list()).toHaveLength(1);
      expect(registry.list()[0]).toBe(def);
    });

    it('throws if trigger id is already registered', () => {
      registry.register(createValidDefinition());

      expect(() => {
        registry.register(createValidDefinition());
      }).toThrow('Trigger "cases.updated" is already registered');
    });

    it('throws if id is empty', () => {
      expect(() => {
        registry.register(createValidDefinition({ id: '' }));
      }).toThrow('"id" must be a non-empty string');
    });

    it('throws if id does not follow <solution>.<event> format', () => {
      expect(() => {
        registry.register(createValidDefinition({ id: 'no-dot' }));
      }).toThrow('must follow namespaced format');

      expect(() => {
        registry.register(createValidDefinition({ id: '.leading' }));
      }).toThrow('must follow namespaced format');

      expect(() => {
        registry.register(createValidDefinition({ id: 'trailing.' }));
      }).toThrow('must follow namespaced format');
    });

    it('accepts valid id formats', () => {
      registry.register(createValidDefinition({ id: 'cases.updated' }));
      registry.register(createValidDefinition({ id: 'alerts.severityHigh' }));
      registry.register(createValidDefinition({ id: 'my-namespace.myEvent' }));
      expect(registry.list()).toHaveLength(3);
    });

    it('rejects snake_case namespace or event segments', () => {
      expect(() => {
        registry.register(createValidDefinition({ id: 'my_plugin.myEvent' }));
      }).toThrow('must follow namespaced format');

      expect(() => {
        registry.register(createValidDefinition({ id: 'my-namespace.my_event' }));
      }).toThrow('must follow namespaced format');
    });

    it('accepts kebab-case namespace ids from naming conventions', () => {
      const idsFromDocs = [
        'my-namespace.customTrigger',
        'cases.updated',
        'custom-feature.alertFired',
        'my-plugin.myTrigger',
        'alertingV2.episodeAssigned',
      ];

      for (const id of idsFromDocs) {
        registry.register(createValidDefinition({ id }));
      }

      expect(registry.list()).toHaveLength(idsFromDocs.length);
      for (const id of idsFromDocs) {
        expect(registry.has(id)).toBe(true);
      }
    });

    it('rejects event segment with dashes (event must be camelCase)', () => {
      expect(() => {
        registry.register(createValidDefinition({ id: 'my-namespace.custom-trigger' }));
      }).toThrow('must follow namespaced format');
    });

    it('throws if eventSchema is null', () => {
      expect(() => {
        registry.register(
          createValidDefinition({
            eventSchema: null as unknown as ServerTriggerDefinition['eventSchema'],
          })
        );
      }).toThrow('"eventSchema" must be a Zod schema');
    });

    it('throws if eventSchema is undefined', () => {
      expect(() => {
        registry.register(
          createValidDefinition({
            eventSchema: undefined as unknown as ServerTriggerDefinition['eventSchema'],
          })
        );
      }).toThrow('"eventSchema" must be a Zod schema');
    });

    it('throws if eventSchema is a plain object without safeParse', () => {
      expect(() => {
        registry.register(
          createValidDefinition({
            eventSchema: { shape: {} } as unknown as ServerTriggerDefinition['eventSchema'],
          })
        );
      }).toThrow('"eventSchema" must be a Zod schema');
    });

    it('throws if eventSchema is not a Zod object schema', () => {
      expect(() => {
        registry.register(
          createValidDefinition({
            eventSchema: z.string() as unknown as ServerTriggerDefinition['eventSchema'],
          })
        );
      }).toThrow('"eventSchema" must be a Zod object schema');
    });

    it('rejects missing stability', () => {
      expect(() => {
        registry.register(createValidDefinition({ stability: undefined }));
      }).toThrow('"stability" is required');
    });

    it('rejects stable stability until event-driven triggers GA', () => {
      expect(() => {
        registry.register(createValidDefinition({ stability: 'stable' }));
      }).toThrow('stability "stable" is not supported until event-driven triggers GA');
    });

    it('rejects beta stability until event-driven triggers GA', () => {
      expect(() => {
        registry.register(createValidDefinition({ stability: 'beta' }));
      }).toThrow('stability "beta" is not supported until event-driven triggers GA');
    });
  });

  describe('freeze', () => {
    it('throws when register is called after freeze', () => {
      registry.register(createValidDefinition());
      registry.freeze();

      expect(() => {
        registry.register(createValidDefinition({ id: 'other.trigger' }));
      }).toThrow('only allowed during plugin setup');
    });

    it('get and list still work after freeze', () => {
      const def = createValidDefinition();
      registry.register(def);
      registry.freeze();

      expect(registry.get('cases.updated')).toBe(def);
      expect(registry.list()).toHaveLength(1);
    });
  });

  describe('get', () => {
    it('returns undefined for unregistered trigger', () => {
      expect(registry.get('unknown.trigger')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('returns false for unregistered trigger', () => {
      expect(registry.has('unknown.trigger')).toBe(false);
    });
  });

  describe('list', () => {
    it('returns empty array when no triggers are registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('returns all registered triggers in insertion order', () => {
      const a = createValidDefinition({ id: 'a.x' });
      const b = createValidDefinition({ id: 'b.y' });
      registry.register(a);
      registry.register(b);

      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list[0]).toBe(a);
      expect(list[1]).toBe(b);
    });
  });
});
