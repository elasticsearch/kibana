/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackModule } from '../types';
import { loadTemplates } from '../template_loader';

export const createJailbreakingModule = (): AttackModule => ({
  name: 'jailbreaking',
  description: 'Tests resistance to safety guideline bypass and jailbreak attempts',
  owaspCategory: 'LLM01',
  defaultEvaluators: ['attack-success-judge'],
  generate: async (config) => loadTemplates('jailbreaking', config),
});
