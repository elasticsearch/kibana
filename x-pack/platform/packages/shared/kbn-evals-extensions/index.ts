/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * @kbn/evals-extensions - experimental extensions for @kbn/evals.
 *
 * Home for evals capabilities that are experimental or extended.
 *
 *
 * @packageDocumentation
 */

// Re-export core types from kbn-evals for convenience
// This allows users to import from one place, but doesn't create reverse dependency
export type { Evaluator, Example, EvaluationDataset, TaskOutput } from '@kbn/evals';

export type { EvaluationScoreDocument } from '@kbn/evals-common';

export * as cli from './src/cli';

export {
  createRedTeamOrchestrator,
  formatRedTeamReport,
  writeRedTeamReport,
  RED_TEAM_MODULE_IDS,
} from './src/red_team';
export type {
  RedTeamConfig,
  RedTeamReport,
  RedTeamOrchestratorOptions,
  RedTeamModuleId,
  Severity,
} from './src/red_team';
