/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import Path from 'path';
import { createPlaywrightEvalsConfig } from '@kbn/evals';

/**
 * Red-team adversarial testing is intentionally an independent suite:
 * - separate CI step from "Evals: Agent Builder"
 * - separate Playwright config so it can be triggered/run on its own
 * - lives outside ./evals so the standard suite config does not pick it up
 */
export default createPlaywrightEvalsConfig({
  testDir: Path.resolve(__dirname, './red_team'),
  repetitions: 1,
  timeout: 30 * 60_000,
});
