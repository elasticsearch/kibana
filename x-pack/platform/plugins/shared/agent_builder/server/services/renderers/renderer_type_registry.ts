/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RendererTypeDefinition } from '@kbn/agent-builder-server/renderers';

export interface RendererTypeRegistry {
  register(rendererType: RendererTypeDefinition): void;
  has(rendererType: string): boolean;
  get(rendererType: string): RendererTypeDefinition | undefined;
  list(): RendererTypeDefinition[];
}

export const createRendererTypeRegistry = (): RendererTypeRegistry => {
  return new RendererTypeRegistryImpl();
};

class RendererTypeRegistryImpl implements RendererTypeRegistry {
  private rendererTypes: Map<string, RendererTypeDefinition> = new Map();

  register(type: RendererTypeDefinition) {
    if (this.rendererTypes.has(type.type)) {
      throw new Error(`Renderer type with type "${type.type}" already registered`);
    }
    this.rendererTypes.set(type.type, type);
  }

  has(rendererType: string): boolean {
    return this.rendererTypes.has(rendererType);
  }

  get(rendererType: string) {
    return this.rendererTypes.get(rendererType);
  }

  list() {
    return [...this.rendererTypes.values()];
  }
}
