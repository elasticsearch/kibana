/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutTestOptions } from '@kbn/scout';
import { createPlaywrightConfig } from '@kbn/scout';
import type { PlaywrightTestConfig } from '@playwright/test';
import { defineConfig } from '@playwright/test';
import {
  loadInferenceEndpoints,
  type InferenceEndpointDefinition,
} from '../utils/inference_endpoint_definition';
import {
  loadStackConnectors,
  type EvalConnector,
  type StackConnectorDefinition,
} from '../utils/eval_connector';

export interface EvaluationTestOptions extends ScoutTestOptions {
  connectorParam: EvalConnector;
  evaluationConnectorParam: EvalConnector;
  repetitions: number;
  timeout?: number;
}

/**
 * Exports a Playwright configuration specifically for offline evals
 */
export function createPlaywrightEvalsConfig({
  testDir,
  testIgnore,
  repetitions,
  timeout,
  runGlobalSetup,
  workers,
}: {
  testDir: string;
  testIgnore?: PlaywrightTestConfig['testIgnore'];
  repetitions?: number;
  timeout?: number;
  runGlobalSetup?: boolean;
  workers?: 1 | 2 | 3;
}): PlaywrightTestConfig<{}, EvaluationTestOptions> {
  const { reporter, use, outputDir, projects, ...config } = createPlaywrightConfig({
    testDir,
    runGlobalSetup,
    workers,
  });

  const inferenceEndpoints: InferenceEndpointDefinition[] = loadInferenceEndpoints();

  const stackConnectors: StackConnectorDefinition[] = loadStackConnectors();

  const inferenceEndpointIds = new Set(inferenceEndpoints.map((c) => c.id));
  const uniqueStackConnectors = stackConnectors.filter((c) => !inferenceEndpointIds.has(c.id));

  const allConnectors: EvalConnector[] = [...inferenceEndpoints, ...uniqueStackConnectors];

  const evaluationConnectorId = process.env.EVAL_CONNECTOR_ID
    ? String(process.env.EVAL_CONNECTOR_ID)
    : undefined;

  if (!evaluationConnectorId) {
    throw new Error(
      `process.env.EVAL_CONNECTOR_ID is required. Pick one from ${allConnectors
        .map((c) => c.id)
        .join(', ')}`
    );
  }

  const evaluationConnector = allConnectors.find((c) => c.id === evaluationConnectorId);

  if (!evaluationConnector) {
    throw new Error(
      `Evaluation connector id ${evaluationConnectorId} was not found, pick one from ${allConnectors
        .map((c) => c.id)
        .join(', ')}`
    );
  }

  // Priority of determining repetition number: env variable, config parameter, default
  const experimentRepetitions =
    parseInt(process.env.EVAL_REPETITIONS || '', 10) || repetitions || 1;

  // Pass through Scout's setup AND teardown hook projects unchanged. Scout's `setup-local`
  // references its teardown via Playwright's `teardown` field; dropping the `teardown-local`
  // project would leave a dangling reference and Playwright fails with "Project 'setup-local'
  // has unknown teardown project 'teardown-local'".
  const hookProjects =
    projects?.filter(
      (project) => project.name === 'setup-local' || project.name === 'teardown-local'
    ) ?? [];

  // get just the 'local' project (for now)
  const nextProjects = allConnectors.flatMap((connector) => {
    return (
      projects
        ?.filter((project) => project.name === 'local')
        .map((project) => {
          return {
            ...project,
            name: connector.id,
            use: {
              ...project.use,
              connectorParam: connector,
              evaluationConnectorParam: evaluationConnector,
              repetitions: experimentRepetitions,
            },
          };
        }) ?? []
    );
  });

  return defineConfig<{}, EvaluationTestOptions>({
    ...config,
    // some reports write to disk, which we don't need
    reporter: Array.isArray(reporter)
      ? reporter.filter(([name]) => {
          return name !== 'html' && name !== 'json';
        })
      : reporter,
    use: {
      serversConfigDir: (use as ScoutTestOptions).serversConfigDir,
    },
    projects: [...hookProjects, ...nextProjects],
    globalSetup: require.resolve('./setup.js'),
    globalTeardown: require.resolve('./teardown.js'),
    timeout: timeout ?? 5 * 60_000,
    // Playwright's default also matches `*.test.ts`, which would load Jest unit tests colocated
    // with the specs and fail on `describe is not defined`. Evals are always `*.spec.ts`.
    testMatch: '**/*.spec.ts',
    // Playwright 1.61 on Node >=23.5 registers a synchronous `module.registerHooks` load hook
    // that transforms all first-party TypeScript (anything not in node_modules) with its own
    // bundled Babel. Workspace `@kbn/*` symlinks resolve to real paths outside node_modules, so
    // they are captured by Playwright's hook BEFORE `@kbn/swc-register` (pirates) can run.
    // Playwright's bundled Babel does not handle TypeScript namespace `export import` syntax
    // correctly and produces invalid CJS output, causing a SyntaxError at load time.
    //
    // Defer all first-party Kibana TypeScript to `@kbn/swc-register`; Playwright already
    // skips node_modules itself. `x-pack/` covers plugins and packages; `src/` covers core.
    build: {
      external: ['**/x-pack/**', '**/src/**'],
    },
    ...(testIgnore !== undefined ? { testIgnore } : {}),
  });
}
