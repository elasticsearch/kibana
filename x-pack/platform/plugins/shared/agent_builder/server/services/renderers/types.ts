/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RendererTypeDefinition } from '@kbn/agent-builder-server/renderers';

export interface RendererServiceSetup {
  register(rendererType: RendererTypeDefinition): void;
}

export interface RendererServiceStart {
  getRegisteredRenderers(): RendererTypeDefinition[];
  getRenderer(type: string): RendererTypeDefinition | undefined;
}
