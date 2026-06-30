/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RendererServiceStartContract } from '@kbn/agent-builder-browser';
import type { RenderersService } from './renderers_service';

export const createPublicRenderersContract = ({
  renderersService,
}: {
  renderersService: RenderersService;
}): RendererServiceStartContract => {
  return {
    register: (definition) => {
      return renderersService.register(definition);
    },
    getRendererUiDefinition: (type) => {
      return renderersService.getRendererUiDefinition(type);
    },
    hasRenderer: (type) => {
      return renderersService.hasRenderer(type);
    },
  };
};
