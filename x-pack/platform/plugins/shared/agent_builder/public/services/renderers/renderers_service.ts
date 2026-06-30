/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ZodObject } from '@kbn/zod/v4';
import type { RendererUIDefinition } from '@kbn/agent-builder-browser';

/**
 * Internal service maintaining a registry of renderer UI definitions, keyed by
 * renderer type.
 */
export class RenderersService {
  private readonly registry: Map<string, RendererUIDefinition> = new Map();

  /**
   * Registers a UI definition for a renderer type.
   *
   * @param definition - The UI definition; the renderer type is taken from `definition.type`.
   * @throws Error if a renderer for the type is already registered.
   */
  register<TSchema extends ZodObject<any> = ZodObject<any>>(
    definition: RendererUIDefinition<TSchema>
  ): void {
    if (this.registry.has(definition.type)) {
      throw new Error(`Renderer type "${definition.type}" is already registered.`);
    }
    this.registry.set(definition.type, definition as unknown as RendererUIDefinition);
  }

  /**
   * Retrieves the UI definition for a renderer type, or `undefined` if none is registered.
   */
  getRendererUiDefinition(type: string): RendererUIDefinition | undefined {
    return this.registry.get(type);
  }

  /**
   * Checks whether a UI definition is registered for the given renderer type.
   */
  hasRenderer(type: string): boolean {
    return this.registry.has(type);
  }
}
