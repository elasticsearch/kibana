/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackModule } from '../types';
import { loadTemplates } from '../template_loader';

export const createPrivilegeEscalationModule = (): AttackModule => ({
  name: 'privilege_escalation',
  description:
    'Tests resistance to unauthorized tool usage, data access, and privilege escalation attempts',
  owaspCategory: 'LLM06',
  defaultEvaluators: ['tool-poisoning', 'scope-violation', 'attack-success-judge'],
  generate: async (config) => loadTemplates('privilege_escalation', config),
});
