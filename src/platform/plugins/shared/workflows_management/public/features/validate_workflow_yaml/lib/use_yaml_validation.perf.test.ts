/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const mockValidateQuery = jest.fn();

jest.mock('@kbn/esql-language', () => ({
  __esModule: true,
  validateQuery: (...args: unknown[]) => mockValidateQuery(...args),
}));

// eslint-disable-next-line import/no-nodejs-modules
import fs from 'fs';
// eslint-disable-next-line import/no-nodejs-modules
import path from 'path';
import YAML, { LineCounter } from 'yaml';
import type { ESQLCallbacks } from '@kbn/esql-types';
import { VARIABLE_REGEX_GLOBAL } from '@kbn/workflows-yaml';
import { collectAllConnectorIds } from './collect_all_connector_ids';
import { collectAllStepPropertyItems } from './collect_all_step_property_items';
import { collectAllVariables } from './collect_all_variables';
import { validateConnectorIds } from './validate_connector_ids';
import { validateIfConditions } from './validate_if_conditions';
import { validateJsonSchemaDefaults } from './validate_json_schema_defaults';
import { validateLiquidTemplate } from './validate_liquid_template';
import { validateStepNameUniqueness } from './validate_step_name_uniqueness';
import { validateStepProperties } from './validate_step_properties';
import { validateTriggerConditions } from './validate_trigger_conditions';
import { validateVariables } from './validate_variables';
import { validateWorkflowInputs } from './validate_workflow_inputs';
import { validateWorkflowOutputsInYaml } from './validate_workflow_outputs_in_yaml';
import { createFakeMonacoModel } from '../../../../common/mocks/monaco_model';
import { getPropertyHandler } from '../../../../common/schema';
import { performComputation } from '../../../entities/workflows/store/workflow_detail/utils/computation';
import { validateEsqlSteps } from '../../../widgets/workflow_yaml_editor/lib/esql_validation/validate_esql_steps';

const WARMUP_ITERATIONS = 5;

/** Per-step budgets use ~8× local median on large fixtures to absorb CI agent variance (#261389). */
const stubEsqlCallbacks: ESQLCallbacks = {};

interface BenchmarkConfig {
  iterations: number;
  totalThresholdMs: number;
  defaultBudgetMs: number;
  stepBudgets?: Record<string, number>;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function benchmarkSync(fn: () => void, iterations: number): number {
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    fn();
  }
  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}

function resolveStepBudget(stepName: string, config: BenchmarkConfig): number {
  if (config.stepBudgets?.[stepName] !== undefined) {
    return config.stepBudgets[stepName];
  }
  for (const [prefix, budget] of Object.entries(config.stepBudgets ?? {})) {
    if (stepName.startsWith(prefix)) {
      return budget;
    }
  }
  return config.defaultBudgetMs;
}

function assertTimingsWithinBudget(
  timings: Record<string, number>,
  config: BenchmarkConfig
): Array<{ step: string; ms: number; budgetMs: number }> {
  const violations: Array<{ step: string; ms: number; budgetMs: number }> = [];
  for (const [step, ms] of Object.entries(timings)) {
    if (step !== 'total') {
      const budgetMs = resolveStepBudget(step, config);
      if (ms >= budgetMs) {
        violations.push({ step, ms, budgetMs });
      }
      expect(ms).toBeLessThan(budgetMs);
    }
  }
  return violations;
}

function logTimingsTable(title: string, timings: Record<string, number>, logOnSuccess: boolean) {
  if (!logOnSuccess && process.env.CI) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(title);
  // eslint-disable-next-line no-console
  console.table(
    Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Number(v.toFixed(3))]))
  );
}

function loadYaml(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf-8');
}

/** Extends the shared fake model with APIs required by validateEsqlSteps. */
function createPerfMonacoModel(yamlContent: string) {
  return Object.assign(createFakeMonacoModel(yamlContent), {
    getValueLength: () => yamlContent.length,
  });
}

function runPerStepBenchmarks(yamlContent: string, config: BenchmarkConfig) {
  const lineCounter = new LineCounter();
  const yamlDocument = YAML.parseDocument(yamlContent, {
    lineCounter,
    keepSourceTokens: true,
  });
  const mockModel = createPerfMonacoModel(yamlContent);
  const computed = performComputation(yamlContent);
  const { workflowDefinition, workflowGraph, workflowLookup } = computed;
  const { iterations } = config;

  const timings: Record<string, number> = {};

  timings.validateStepNameUniqueness = benchmarkSync(() => {
    validateStepNameUniqueness(yamlDocument, lineCounter);
  }, iterations);

  timings.validateLiquidTemplate = benchmarkSync(() => {
    validateLiquidTemplate(yamlContent, yamlDocument);
  }, iterations);

  timings.collectAllConnectorIds = benchmarkSync(() => {
    collectAllConnectorIds(yamlDocument, lineCounter);
  }, iterations);

  const connectorIdItems = collectAllConnectorIds(yamlDocument, lineCounter);
  timings.validateConnectorIds = benchmarkSync(() => {
    validateConnectorIds(connectorIdItems, null, '');
  }, iterations);

  timings.validateWorkflowOutputsInYaml = benchmarkSync(() => {
    validateWorkflowOutputsInYaml(yamlDocument, mockModel, undefined);
  }, iterations);

  if (workflowLookup) {
    timings.validateWorkflowInputs = benchmarkSync(() => {
      validateWorkflowInputs(workflowLookup, null, lineCounter);
    }, iterations);

    timings.validateIfConditions = benchmarkSync(() => {
      validateIfConditions(workflowLookup, lineCounter);
    }, iterations);

    timings.collectAllStepPropertyItems = benchmarkSync(() => {
      collectAllStepPropertyItems(workflowLookup, lineCounter, getPropertyHandler);
    }, iterations);
  }

  if (workflowGraph && workflowDefinition) {
    timings.collectAllVariables = benchmarkSync(() => {
      collectAllVariables(mockModel, yamlDocument, workflowGraph);
    }, iterations);

    const variableItems = collectAllVariables(mockModel, yamlDocument, workflowGraph);
    timings[`validateVariables (${variableItems.length} vars)`] = benchmarkSync(() => {
      validateVariables(variableItems, workflowGraph, workflowDefinition, yamlDocument, mockModel);
    }, iterations);

    timings.validateTriggerConditions = benchmarkSync(() => {
      validateTriggerConditions(workflowDefinition, yamlDocument);
    }, iterations);

    timings.validateJsonSchemaDefaults = benchmarkSync(() => {
      validateJsonSchemaDefaults(yamlDocument, workflowDefinition, mockModel);
    }, iterations);
  }

  return { timings, config };
}

async function runE2EBenchmark(yamlContent: string, config: BenchmarkConfig) {
  const { iterations } = config;
  const timings: Record<string, number[]> = {};
  const record = (name: string, ms: number) => {
    if (!timings[name]) {
      timings[name] = [];
    }
    timings[name].push(ms);
  };

  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    performComputation(yamlContent);
  }

  for (let i = 0; i < iterations; i++) {
    const totalStart = performance.now();

    let start = performance.now();
    const computed = performComputation(yamlContent);
    record('performComputation', performance.now() - start);

    const {
      yamlDocument,
      yamlLineCounter: lc,
      workflowDefinition,
      workflowGraph,
      workflowLookup,
    } = computed;

    if (!yamlDocument || !lc) {
      throw new Error(`performComputation returned no document on iteration ${i}`);
    }

    const model = createPerfMonacoModel(yamlContent);

    start = performance.now();
    validateStepNameUniqueness(yamlDocument, lc);
    record('validateStepNameUniqueness', performance.now() - start);

    start = performance.now();
    validateLiquidTemplate(yamlContent, yamlDocument);
    record('validateLiquidTemplate', performance.now() - start);

    start = performance.now();
    const connectorIdItems = collectAllConnectorIds(yamlDocument, lc);
    validateConnectorIds(connectorIdItems, null, '');
    record('connectorIds (collect+validate)', performance.now() - start);

    start = performance.now();
    validateWorkflowOutputsInYaml(yamlDocument, model, workflowDefinition?.outputs);
    record('validateWorkflowOutputsInYaml', performance.now() - start);

    if (workflowLookup && lc) {
      start = performance.now();
      const stepPropertyItems = collectAllStepPropertyItems(workflowLookup, lc, getPropertyHandler);
      record('collectAllStepPropertyItems', performance.now() - start);

      start = performance.now();
      await validateStepProperties(stepPropertyItems);
      record('validateStepProperties', performance.now() - start);

      start = performance.now();
      validateWorkflowInputs(workflowLookup, null, lc);
      record('validateWorkflowInputs', performance.now() - start);

      start = performance.now();
      validateIfConditions(workflowLookup, lc);
      record('validateIfConditions', performance.now() - start);

      start = performance.now();
      await validateEsqlSteps(workflowLookup, lc, model, stubEsqlCallbacks);
      record('validateEsqlSteps', performance.now() - start);
    }

    if (workflowGraph && workflowDefinition) {
      start = performance.now();
      const variableItems = collectAllVariables(model, yamlDocument, workflowGraph);
      record('collectAllVariables', performance.now() - start);

      start = performance.now();
      validateVariables(variableItems, workflowGraph, workflowDefinition, yamlDocument, model);
      record('validateVariables', performance.now() - start);

      start = performance.now();
      validateTriggerConditions(workflowDefinition, yamlDocument);
      record('validateTriggerConditions', performance.now() - start);

      start = performance.now();
      validateJsonSchemaDefaults(yamlDocument, workflowDefinition, model);
      record('validateJsonSchemaDefaults', performance.now() - start);
    }

    record('total', performance.now() - totalStart);
  }

  const medians: Record<string, number> = {};
  for (const [name, samples] of Object.entries(timings)) {
    medians[name] = Number(median(samples).toFixed(3));
  }

  return { medians, config };
}

const EXAMPLES_DIR = '../../../../common/examples';

const SUITES = [
  {
    name: 'case_response.yaml (27 steps, 81 vars)',
    yamlPath: `${EXAMPLES_DIR}/case_response.yaml`,
    config: {
      iterations: 100,
      defaultBudgetMs: 50,
      totalThresholdMs: 100,
    },
  },
  {
    name: 'infosec_demo.yaml (150 steps, 361 vars)',
    yamlPath: `${EXAMPLES_DIR}/infosec_demo.yaml`,
    config: {
      iterations: 20,
      defaultBudgetMs: 50,
      totalThresholdMs: 2000,
      stepBudgets: {
        performComputation: 120,
        validateLiquidTemplate: 80,
        collectAllVariables: 200,
        validateVariables: 650,
        'connectorIds (collect+validate)': 80,
        validateIfConditions: 80,
        validateEsqlSteps: 120,
      },
    },
  },
] as const;

beforeEach(() => {
  mockValidateQuery.mockResolvedValue({ errors: [], warnings: [] });
});

for (const suite of SUITES) {
  // Regression guard for validation latency; per-step budgets fix #261389 CI flake.
  describe(`YAML validation performance: ${suite.name}`, () => {
    let yamlContent: string;

    beforeAll(() => {
      yamlContent = loadYaml(suite.yamlPath);
    });

    it('each validation step completes within budget', async () => {
      const { timings, config } = runPerStepBenchmarks(yamlContent, suite.config);

      const varCount = Array.from(yamlContent.matchAll(VARIABLE_REGEX_GLOBAL)).length;
      const lineCount = yamlContent.split('\n').length;

      let violations: Array<{ step: string; ms: number; budgetMs: number }> = [];
      try {
        violations = assertTimingsWithinBudget(timings, config);
      } finally {
        logTimingsTable(
          `\n--- Per-step (${lineCount} lines, ${varCount} vars, median of ${suite.config.iterations}, ms) ---`,
          timings,
          violations.length > 0
        );
      }
    });

    it('full validation pipeline completes within budget', async () => {
      const { medians, config } = await runE2EBenchmark(yamlContent, suite.config);

      expect(medians.total).toBeLessThan(config.totalThresholdMs);

      let violations: Array<{ step: string; ms: number; budgetMs: number }> = [];
      try {
        violations = assertTimingsWithinBudget(medians, config);
      } finally {
        logTimingsTable(
          `\n--- E2E (median of ${suite.config.iterations}, ms) ---`,
          medians,
          violations.length > 0
        );
      }
    });
  });
}
