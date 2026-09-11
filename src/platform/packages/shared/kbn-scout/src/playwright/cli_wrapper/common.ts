/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { REPO_ROOT } from '@kbn/repo-info';
import { spawn, type SpawnOptions } from 'node:child_process';
import type { ToolingLog } from '@kbn/tooling-log';
import { withKibanaSwcRegister } from '../utils';

export interface PlaywrightCLIResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export class PlaywrightCLIError extends Error {}

export async function runPlaywrightCLI(
  args: string[],
  env?: Record<string, string>,
  log?: ToolingLog
): Promise<PlaywrightCLIResult> {
  const playwrightBinPath = './node_modules/.bin/playwright';
  const options: SpawnOptions = {
    cwd: REPO_ROOT,
    env: withKibanaSwcRegister(
      env ? { ...process.env, ...env } : { ...process.env }
    ) as NodeJS.ProcessEnv,
    stdio: log ? 'pipe' : 'inherit',
  };

  log?.debug(
    `Running Playwright in a separate shell with command:\n` +
      `${playwrightBinPath} ${args.join(' ')}`
  );

  const playwrightProcess = spawn(playwrightBinPath, args, options);

  if (log) {
    playwrightProcess.stdout!.on('data', (data) => {
      log.write(`[🎭] ${data}`);
    });

    playwrightProcess.stderr!.on('data', (data) => {
      log.error(`[🎭] ${data}`);
    });
  }

  const exitCode = await new Promise<number>((resolve, reject) => {
    playwrightProcess.on('close', (code) => resolve(code ?? 1));
    playwrightProcess.on('error', (error) => reject(new PlaywrightCLIError(error.message)));
  });

  return { exitCode };
}
