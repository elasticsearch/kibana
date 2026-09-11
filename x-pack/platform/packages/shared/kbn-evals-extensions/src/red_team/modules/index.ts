/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackModule } from '../types';
import { createPromptInjectionModule } from './prompt_injection';
import { createInfoExtractionModule } from './info_extraction';
import { createJailbreakingModule } from './jailbreaking';
import { createPrivilegeEscalationModule } from './privilege_escalation';
import { createIndirectInjectionModule } from './indirect_injection';

const ATTACK_MODULES: Record<string, () => AttackModule> = {
  prompt_injection: createPromptInjectionModule,
  info_extraction: createInfoExtractionModule,
  jailbreaking: createJailbreakingModule,
  privilege_escalation: createPrivilegeEscalationModule,
  indirect_injection: createIndirectInjectionModule,
};

export const getAttackModule = (name: string): AttackModule => {
  const factory = ATTACK_MODULES[name];
  if (!factory) {
    const available = Object.keys(ATTACK_MODULES).join(', ');
    throw new Error(`Unknown attack module "${name}". Available: ${available}`);
  }
  return factory();
};

export const getAvailableModules = (): string[] => Object.keys(ATTACK_MODULES);
