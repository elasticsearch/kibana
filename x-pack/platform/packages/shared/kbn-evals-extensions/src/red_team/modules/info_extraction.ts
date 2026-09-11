/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackModule } from '../types';
import { loadTemplates } from '../template_loader';

export const createInfoExtractionModule = (): AttackModule => ({
  name: 'info_extraction',
  description: 'Tests resistance to system prompt leakage and internal data disclosure attempts',
  owaspCategory: 'LLM06',
  defaultEvaluators: ['prompt-leak-detection', 'scope-violation', 'attack-success-judge'],
  generate: async (config) => loadTemplates('info_extraction', config),
});
