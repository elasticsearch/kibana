/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spawn } from 'child_process';
import { createFlagError } from '@kbn/dev-cli-errors';
import type { Command, FlagOptions, FlagsReader } from '@kbn/dev-cli-runner';
import {
  ensureEvalStack,
  ensureEvalInit,
  resolveEvalRunContext,
  resolveEvalSuites,
  buildEvalRunEnv,
  promptForSuite,
  isTTY,
  evalRunFlags,
} from '@kbn/evals';
import { getAvailableModules, RED_TEAM_MODULE_IDS } from '../../red_team';

const DIFFICULTIES = ['basic', 'moderate', 'advanced'] as const;
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

const redTeamFlags: FlagOptions = {
  ...evalRunFlags,
  string: [
    ...(evalRunFlags.string ?? []),
    'module',
    'strategy',
    'count',
    'difficulty',
    'severity-threshold',
  ],
  boolean: [...(evalRunFlags.boolean ?? []), 'templates-only'],
  alias: { ...evalRunFlags.alias, modules: 'module' },
  default: { ...evalRunFlags.default, 'templates-only': false },
};

/**
 * Parse and validate the `--module`/`--modules` flag into a comma-separated list
 * of canonical module ids (dashes normalised to underscores). Validated against
 * {@link RED_TEAM_MODULE_IDS}.
 */
const parseModuleFlag = (flagsReader: FlagsReader): string | undefined => {
  const moduleFlag = flagsReader.string('module');
  if (!moduleFlag) {
    return undefined;
  }

  const moduleIds = moduleFlag
    .split(',')
    .map((id) => id.trim().replace(/-/g, '_'))
    .filter(Boolean);
  if (moduleIds.length === 0) {
    throw createFlagError('--module must list at least one module id.');
  }

  for (const id of moduleIds) {
    if (!(RED_TEAM_MODULE_IDS as readonly string[]).includes(id)) {
      throw createFlagError(
        `Unknown module "${id}". Valid modules: ${RED_TEAM_MODULE_IDS.join(', ')}`
      );
    }
  }

  return moduleIds.join(',');
};

export const redTeamCmd: Command<void> = {
  name: 'red-team',
  description: `
  Run red-team adversarial testing against an evaluation suite.

  Boots the full eval stack (EDOT collector + Scout server + EIS CCM) via the shared
  @kbn/evals bootstrap helpers, then runs the suite's red-team specs. Daemons persist
  between runs; reuse them with --skip-server, and stop them with \`node scripts/evals stop\`.

  Requires the suite to expose a dedicated red-team Playwright config registered as
  "<suite>-red-team" in .buildkite/pipelines/evals/evals.suites.json (e.g.
  agent-builder-red-team -> red_team.playwright.config.ts with testDir ./red_team).
  The spec file drives the orchestrator from @kbn/evals-extensions with the suite's
  task function. Suites without a dedicated config fall back to a --grep "Red Team" run.

  Examples:
    node scripts/evals ext red-team --suite agent-builder
    node scripts/evals ext red-team --suite agent-builder --module prompt_injection
    node scripts/evals ext red-team --suite agent-builder --strategy jailbreak_wrapper
    node scripts/evals ext red-team --suite agent-builder --templates-only
    node scripts/evals ext red-team --suite agent-builder --count 20 --difficulty advanced
    node scripts/evals ext red-team --suite agent-builder --judge bedrock-claude --skip-server
  `,
  flags: redTeamFlags,
  run: async ({ log, flagsReader }) => {
    const repoRoot = process.cwd();
    let suiteId = flagsReader.string('suite');

    // Restore parity with `node scripts/evals run`: when --suite is omitted in an
    // interactive terminal, prompt for one instead of hard-failing. The chosen id
    // is normalised back to the base suite so the `<suite>-red-team` variant lookup
    // below still works whether the user picks the base or the red-team entry.
    if (!suiteId) {
      if (isTTY()) {
        const selected = await promptForSuite(repoRoot, log);
        suiteId = selected.id;
      } else {
        throw createFlagError('Missing required --suite flag.');
      }
    }
    // Normalize: strip -red-team suffix whether the id came from the prompt or --suite flag,
    // so the <suite>-red-team lookup below works consistently for both paths.
    suiteId = suiteId.replace(/-red-team$/, '');

    // Resolve the suite. Prefer a dedicated red-team config registered as
    // "<suiteId>-red-team"; fall back to the standard suite config (with --grep)
    // for suites that haven't migrated yet.
    const suites = resolveEvalSuites(repoRoot, log);
    const redTeamSuite = suites.find((s) => s.id === `${suiteId}-red-team`);
    const fallbackSuite = suites.find((s) => s.id === suiteId);
    const suite = redTeamSuite ?? fallbackSuite;
    if (!suite) {
      const available = suites.map((s) => s.id).join(', ');
      throw createFlagError(`Unknown suite "${suiteId}". Available: ${available || 'none found'}`);
    }
    const useDedicatedConfig = Boolean(redTeamSuite);

    // Parse red-team specific flags.
    const modules = parseModuleFlag(flagsReader);
    const strategyName = flagsReader.string('strategy');
    const countStr = flagsReader.string('count');
    const count = countStr ? parseInt(countStr, 10) : 10;
    if (countStr && (isNaN(count) || count < 1)) {
      throw createFlagError('--count must be a positive integer.');
    }
    const difficulty =
      (flagsReader.enum('difficulty', [...DIFFICULTIES]) as
        | 'basic'
        | 'moderate'
        | 'advanced'
        | undefined) ?? 'moderate';
    const severityThreshold = flagsReader.enum('severity-threshold', [...SEVERITIES]) ?? 'low';
    const templatesOnly = flagsReader.boolean('templates-only');

    // Resolve profile + run context via the shared @kbn/evals bootstrap helpers.
    const profile = await ensureEvalInit(repoRoot, log, flagsReader);
    const { evaluationConnectorId, projects, profileEnvOverrides, requiresEisCcm } =
      await resolveEvalRunContext({ repoRoot, log, flagsReader, profile });

    const skipServer = flagsReader.boolean('skip-server');

    // Base env via the shared helper so red-team runs stay at parity with
    // `node scripts/evals run`: connector id, profile overrides, --repetitions,
    // --evaluations-kbn-*, and KBN_EVALS_AWAIT_CCM_CONNECTORS (set when EIS CCM is
    // required and the server is managed, so the connector fixture retries instead
    // of failing fast). Red-team-specific vars are layered on top. EVAL_SUITE_ID is
    // pinned to the base suite id — not the `-red-team` variant — for the spec.
    const envOverrides: Record<string, string> = {
      ...buildEvalRunEnv({
        evaluationConnectorId,
        requiresEisCcm,
        skipServer,
        profileEnvOverrides,
        flagsReader,
        log,
      }),
      EVAL_SUITE_ID: suiteId,
      RED_TEAM_ENABLED: 'true',
      RED_TEAM_COUNT: String(count),
      RED_TEAM_DIFFICULTY: difficulty,
      RED_TEAM_SEVERITY_THRESHOLD: severityThreshold,
    };
    if (modules) {
      envOverrides.RED_TEAM_MODULES = modules;
    }
    if (strategyName) {
      envOverrides.RED_TEAM_STRATEGY = strategyName.replace(/-/g, '_');
    }
    if (templatesOnly) {
      envOverrides.RED_TEAM_TEMPLATES_ONLY = 'true';
    }

    log.info(`Red-team testing suite: ${suiteId}`);
    log.info(`  Modules: ${modules ?? getAvailableModules().join(', ')}`);
    log.info(`  Strategy: ${strategyName ?? 'direct'}`);
    log.info(`  Count: ${count} | Difficulty: ${difficulty} | Templates only: ${templatesOnly}`);

    // Spawn Playwright targeting the suite's red-team spec files. With a dedicated
    // config the testDir already points at the red-team specs; otherwise scope the
    // run with --grep against the shared config.
    const args = ['scripts/playwright', 'test', '--config', suite.absoluteConfigPath];
    if (!useDedicatedConfig) {
      args.push('--grep', 'Red Team');
    }
    for (const p of projects) {
      args.push('--project', p);
    }

    const commandPreview = Object.entries(envOverrides)
      .filter(([key]) => key.startsWith('RED_TEAM'))
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    log.info(`Running: ${commandPreview} node ${args.join(' ')}`);

    if (flagsReader.boolean('dry-run')) {
      return;
    }

    // Boot the eval stack (EDOT + Scout + EIS CCM) unless reusing existing services.
    log.info(`Server:    ${skipServer ? 'skip (using existing)' : 'managed'}`);
    if (!skipServer) {
      await ensureEvalStack({
        repoRoot,
        log,
        serverConfigSet: suite.serverConfigSet ?? 'evals_tracing',
        requiresEisCcm,
        profileEnvOverrides,
      });
    }

    await new Promise<void>((resolve, reject) => {
      const childEnv: Record<string, string> = {
        ...process.env,
        ...envOverrides,
      } as Record<string, string>;
      delete childEnv.NO_COLOR;

      const child = spawn('node', args, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: childEnv,
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`Playwright exited with code ${code}`));
      });

      child.on('error', reject);
    });

    if (!skipServer) {
      log.info('');
      log.info('EDOT and Scout are still running in the background.');
      log.info('To stop them: node scripts/evals stop');
    }
  },
};
