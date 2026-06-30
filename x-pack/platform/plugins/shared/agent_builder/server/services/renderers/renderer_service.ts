/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createRendererTypeRegistry, type RendererTypeRegistry } from './renderer_type_registry';
import type { RendererServiceSetup, RendererServiceStart } from './types';

export interface RendererService {
  setup: () => RendererServiceSetup;
  start: () => RendererServiceStart;
}

export const createRendererService = (): RendererService => {
  return new RendererServiceImpl();
};

export class RendererServiceImpl implements RendererService {
  readonly rendererTypeRegistry: RendererTypeRegistry;

  constructor() {
    this.rendererTypeRegistry = createRendererTypeRegistry();
  }

  setup(): RendererServiceSetup {
    return {
      register: (rendererType) => this.rendererTypeRegistry.register(rendererType),
    };
  }

  start(): RendererServiceStart {
    return {
      getRegisteredRenderers: () => this.rendererTypeRegistry.list(),
      getRenderer: (type) => this.rendererTypeRegistry.get(type),
    };
  }
}
