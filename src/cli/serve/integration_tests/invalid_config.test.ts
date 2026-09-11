/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { spawnSync } from 'child_process';

import { REPO_ROOT } from '@kbn/repo-info';

const INVALID_CONFIG_PATH = require.resolve('./__fixtures__/invalid_config.yml');

interface LogEntry {
  message: string;
  log: {
    level: string;
  };
}

describe('cli invalid config support', () => {
  it(
    'exits with statusCode 64 and logs an error when config is invalid',
    () => {
      // Unused keys only throw once LegacyService starts, so disable migrations so that Core
      // will finish the start lifecycle without a running Elasticsearch instance.
      const { error, status, stdout, stderr } = spawnSync(
        process.execPath,
        ['scripts/kibana', '--config', INVALID_CONFIG_PATH, '--migrations.skip=true'],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            DISABLE_SWC_REGISTER_CACHE: '1',
          },
          timeout: 20 * 1000,
        }
      );
      expect(error).toBe(undefined);

      let fatalLogEntries;
      try {
        fatalLogEntries = stdout
          .toString('utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as LogEntry)
          .filter((line) => line.log?.level === 'FATAL');
      } catch (e) {
        throw new Error(
          `error parsing log output:\n\n${e.stack}\n\nstdout: \n${stdout}\n\nstderr:\n${stderr}`
        );
      }

      expect(fatalLogEntries).toHaveLength(1);
      expect(fatalLogEntries[0].message).toContain(
        'Unknown configuration key(s): "unknown.key", "other.unknown.key", "other.third", "some.flat.key", ' +
          '"some.array". Check for spelling errors and ensure that expected plugins are installed.'
      );

      expect(status).toBe(64);
    },
    20 * 1000
  );
});
