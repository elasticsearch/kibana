/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackModule } from '../types';
import { loadTemplates } from '../template_loader';

export const createPromptInjectionModule = (): AttackModule => ({
  name: 'prompt_injection',
  description: 'Tests resistance to direct and indirect instruction injection attacks',
  owaspCategory: 'LLM01',
  defaultEvaluators: ['prompt-leak-detection', 'attack-success-judge'],
  generate: async (config) => loadTemplates('prompt_injection', config),
});
