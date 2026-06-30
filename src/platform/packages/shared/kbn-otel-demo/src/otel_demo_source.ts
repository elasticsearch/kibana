/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';
import execa from 'execa';
import Fs from 'fs';
import Os from 'os';
import Path from 'path';

export const OTEL_DEMO_REPO_URL = 'https://github.com/open-telemetry/opentelemetry-demo.git';
export const OTEL_DEMO_REPOSITORY = 'open-telemetry/opentelemetry-demo';

// Cached outside the Kibana repo so it persists across branches and is never committed.
export const SCS_CACHE_DIR = Path.join(Os.homedir(), '.kbn-otel-scs');
export const SCS_REPOS_DIR = Path.join(SCS_CACHE_DIR, 'repos');

async function cloneOtelDemoAtVersion(repoDir: string, version: string): Promise<void> {
  try {
    await execa(
      'git',
      ['clone', '--depth', '1', '--branch', version, OTEL_DEMO_REPO_URL, repoDir],
      { stdio: 'inherit' }
    );
  } catch {
    await Fs.promises.rm(repoDir, { recursive: true, force: true });
    await execa(
      'git',
      ['clone', '--depth', '1', '--branch', `v${version}`, OTEL_DEMO_REPO_URL, repoDir],
      { stdio: 'inherit' }
    );
  }
}

/**
 * Returns a local path to the OTel demo repo checked out at the given tag.
 * Cached per-version under SCS_CACHE_DIR so repeated runs skip the clone.
 */
export async function ensureOtelDemoAtVersion(version: string, log: ToolingLog): Promise<string> {
  const repoDir = Path.join(SCS_REPOS_DIR, `opentelemetry-demo-${version}`);
  if (Fs.existsSync(repoDir)) {
    log.info(`Using cached OTel demo source at ${repoDir}`);
    return repoDir;
  }

  await Fs.promises.mkdir(SCS_REPOS_DIR, { recursive: true });
  log.info(`Cloning OTel demo at tag ${version} to ${repoDir} ...`);
  await cloneOtelDemoAtVersion(repoDir, version);
  return repoDir;
}

export function getCodeScenarioRepoDir(version: string, scenarioId: string): string {
  return Path.join(SCS_REPOS_DIR, `opentelemetry-demo-${version}-scenario-${scenarioId}`);
}
