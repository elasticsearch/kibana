/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type { AiPanelEmbeddableState } from './embeddable/schemas';
export { AI_PANEL_EMBEDDABLE_TYPE } from '../common/constants';

export const plugin = async () => {
  const { AiPanelPlugin } = await import('./plugin');
  return new AiPanelPlugin();
};
