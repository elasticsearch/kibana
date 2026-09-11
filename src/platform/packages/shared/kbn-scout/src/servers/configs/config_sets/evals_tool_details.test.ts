/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import path from 'path';

/**
 * Every `evals_*` config set must boot with
 * `agentBuilder:tracing:includeToolDetails=true`.
 *
 * Agent Builder's span processor strips `gen_ai.tool.call.arguments` at span
 * creation unless the setting is on (it defaults to false for privacy). Every
 * trace-based evaluator that matches on those arguments -- SkillInvoked looks
 * for the skill name inside them -- then scores 0 for EVERY model, and the
 * board reads as "models stopped invoking skills" rather than "the attribute
 * is missing". The scores look plausible, which is what makes it dangerous.
 *
 * The sibling test in `evals_tracing` pins the setting for the base config.
 * This one pins the *invariant across the whole family*, so a new eval suite
 * that forgets to inherit -- or inherits from a config that later drops it --
 * fails here instead of silently producing a board of false zeros weeks later.
 *
 * Deliberately a filesystem sweep rather than a hardcoded list: a new
 * `evals_*` directory is covered the moment it is added, without anyone
 * remembering to update this file.
 */
describe('evals_* config sets: tool-detail capture', () => {
  const CONFIG_SETS_DIR = __dirname;
  const SETTING = 'agentBuilder:tracing:includeToolDetails';
  const ENABLED = `--uiSettings.overrides.${SETTING}=true`;

  const evalsConfigSets = fs
    .readdirSync(CONFIG_SETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('evals_'))
    .map((entry) => entry.name)
    .sort();

  const configFilesFor = (configSet: string): string[] => {
    const setDir = path.join(CONFIG_SETS_DIR, configSet);
    return fs
      .readdirSync(setDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((arch) =>
        fs
          .readdirSync(path.join(setDir, arch.name))
          .filter((file) => file.endsWith('.config.ts'))
          .map((file) => path.join(setDir, arch.name, file))
      );
  };

  const loadServerArgs = (configPath: string): string[] => {
    let servers: { kbnTestServer?: { serverArgs?: string[] } } | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      servers = require(configPath).servers;
    });
    return servers?.kbnTestServer?.serverArgs ?? [];
  };

  it('finds the evals_* config sets to check', () => {
    // Guards the sweep itself: if the directory layout moves, the loop below
    // would silently iterate over nothing and pass while checking nothing.
    expect(evalsConfigSets.length).toBeGreaterThan(5);
  });

  describe.each(evalsConfigSets)('%s', (configSet) => {
    const configFiles = configFilesFor(configSet);

    it('has at least one server config', () => {
      expect(configFiles.length).toBeGreaterThan(0);
    });

    it.each(configFiles.map((f) => [path.relative(CONFIG_SETS_DIR, f), f]))(
      'captures tool call arguments in %s',
      (_relative, configPath) => {
        const serverArgs = loadServerArgs(configPath as string);

        // An eval stack that boots no Kibana args at all cannot run evals; if
        // that ever happens the config has bigger problems than this setting.
        expect(serverArgs.length).toBeGreaterThan(0);
        expect(serverArgs).toContain(ENABLED);
      }
    );

    it.each(configFiles.map((f) => [path.relative(CONFIG_SETS_DIR, f), f]))(
      'never disables tool detail capture in %s',
      (_relative, configPath) => {
        const serverArgs = loadServerArgs(configPath as string);
        const disabling = serverArgs.filter(
          (arg) => arg.includes(SETTING) && !arg.endsWith('=true')
        );

        expect(disabling).toEqual([]);
      }
    );
  });
});
