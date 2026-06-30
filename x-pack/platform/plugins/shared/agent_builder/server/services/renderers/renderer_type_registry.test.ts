/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { RendererTypeDefinition } from '@kbn/agent-builder-server/renderers';
import { createRendererTypeRegistry } from './renderer_type_registry';

const dashboardDefinition: RendererTypeDefinition = {
  type: 'dashboard',
  payloadSchema: z.object({ id: z.string() }),
};

describe('createRendererTypeRegistry', () => {
  it('registers a renderer type and returns it via get', () => {
    const registry = createRendererTypeRegistry();
    registry.register(dashboardDefinition);

    expect(registry.get('dashboard')).toBe(dashboardDefinition);
  });

  it('reports registration via has', () => {
    const registry = createRendererTypeRegistry();
    expect(registry.has('dashboard')).toBe(false);

    registry.register(dashboardDefinition);
    expect(registry.has('dashboard')).toBe(true);
  });

  it('throws when registering a duplicate type', () => {
    const registry = createRendererTypeRegistry();
    registry.register(dashboardDefinition);

    expect(() => registry.register(dashboardDefinition)).toThrowError(
      'Renderer type with type "dashboard" already registered'
    );
  });

  it('returns undefined for an unknown type', () => {
    const registry = createRendererTypeRegistry();
    expect(registry.get('unknown')).toBeUndefined();
    expect(registry.has('unknown')).toBe(false);
  });

  it('lists all registered renderer types', () => {
    const registry = createRendererTypeRegistry();
    const tableDefinition: RendererTypeDefinition = {
      type: 'table',
      payloadSchema: z.object({ rows: z.array(z.string()) }),
    };

    expect(registry.list()).toEqual([]);

    registry.register(dashboardDefinition);
    registry.register(tableDefinition);

    expect(registry.list()).toEqual([dashboardDefinition, tableDefinition]);
  });
});
