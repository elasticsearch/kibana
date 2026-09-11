/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { createRedTeamOrchestrator } from './orchestrator';
export type { RedTeamOrchestratorOptions } from './orchestrator';

export { RED_TEAM_MODULE_IDS } from './types';
export type { RedTeamModuleId } from './types';

export { createAttackSuccessJudge } from './judge/attack_success';
export { createRefusalQualityJudge } from './judge/refusal_quality';

export type {
  AttackModule,
  AttackModuleConfig,
  AttackResult,
  ConversationTurn,
  GuardrailConfig,
  GuardrailRule,
  GuardrailViolation,
  ModuleReport,
  MultiTurnStrategy,
  NamedScore,
  RedTeamConfig,
  RedTeamReport,
  Severity,
  SingleTurnStrategy,
  Strategy,
  StrategyFactory,
  TargetContext,
} from './types';

export { OWASP_LLM_TOP_10, getOwaspCategory } from './taxonomy';
export type { OwaspCategory } from './taxonomy';

export { DEFAULT_GUARDRAIL_RULES, scanWithGuardrails, mergeGuardrailRules } from './guardrails';

export { classifySeverity } from './severity';
export type { NamedEvaluationResult } from './severity';

export { getAttackModule, getAvailableModules } from './modules';
export { getStrategy, getAvailableStrategies } from './strategies';

export { formatRedTeamReport } from './report';
export { writeRedTeamReport } from './report_writer';
