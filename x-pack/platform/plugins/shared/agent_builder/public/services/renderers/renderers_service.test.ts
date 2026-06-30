/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { RendererUIDefinition } from '@kbn/agent-builder-browser';
import { RenderersService } from './renderers_service';

const dashboardDefinition: RendererUIDefinition = {
  type: 'dashboard',
  payloadSchema: z.object({ id: z.string() }),
  render: () => null,
};

describe('RenderersService', () => {
  it('registers a renderer and returns it via getRendererUiDefinition', () => {
    const service = new RenderersService();
    service.register(dashboardDefinition);

    expect(service.getRendererUiDefinition('dashboard')).toBe(dashboardDefinition);
  });

  it('reports registration via hasRenderer', () => {
    const service = new RenderersService();
    expect(service.hasRenderer('dashboard')).toBe(false);

    service.register(dashboardDefinition);
    expect(service.hasRenderer('dashboard')).toBe(true);
  });

  it('throws when registering a duplicate type', () => {
    const service = new RenderersService();
    service.register(dashboardDefinition);

    expect(() => service.register(dashboardDefinition)).toThrowError(
      'Renderer type "dashboard" is already registered.'
    );
  });

  it('returns undefined / false for an unknown type', () => {
    const service = new RenderersService();
    expect(service.getRendererUiDefinition('unknown')).toBeUndefined();
    expect(service.hasRenderer('unknown')).toBe(false);
  });
});
