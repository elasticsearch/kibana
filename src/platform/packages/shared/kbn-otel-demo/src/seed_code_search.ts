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
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ElasticsearchConfig } from './read_kibana_config';

const OTEL_DEMO_REPO_URL = 'https://github.com/open-telemetry/opentelemetry-demo.git';
const OTEL_DEMO_REPOSITORY = 'open-telemetry/opentelemetry-demo';
const SCS_REPO_URL = 'https://github.com/elastic/semantic-code-search.git';

// Cached outside the Kibana repo so it persists across branches and is never committed.
const SCS_CACHE_DIR = path.join(os.homedir(), '.kbn-otel-scs');
const SCS_BIN = path.join(SCS_CACHE_DIR, 'packages', 'cli', 'dist', 'src', 'bin.js');
// Tracks which version is currently indexed so --version changes trigger a re-index.
const INDEXED_VERSION_FILE = path.join(SCS_CACHE_DIR, '.indexed-version');

interface SeedCodeSearchOptions {
  elasticsearch: ElasticsearchConfig;
  kibanaCredentials: { username: string; password: string };
  kibanaUrl: string;
  version: string;
  log: ToolingLog;
}

/**
 * Returns [exe, ...prefixArgs] for invoking the scs CLI.
 * Prefers a PATH-installed `scs`; falls back to cloning + building the monorepo.
 */
async function ensureScs(log: ToolingLog): Promise<[string, ...string[]]> {
  try {
    await execa.command('scs --version');
    log.info('Using scs from PATH.');
    return ['scs'];
  } catch {
    // not on PATH — fall through to local build
  }

  if (!fs.existsSync(SCS_BIN)) {
    if (!fs.existsSync(SCS_CACHE_DIR)) {
      log.info(`Cloning elastic/semantic-code-search to ${SCS_CACHE_DIR} ...`);
      await execa('git', ['clone', '--depth', '1', SCS_REPO_URL, SCS_CACHE_DIR], {
        stdio: 'inherit',
      });
    } else {
      log.info(`Pulling latest scs in ${SCS_CACHE_DIR} ...`);
      await execa('git', ['pull'], { cwd: SCS_CACHE_DIR, stdio: 'inherit' });
    }

    log.info('Installing scs dependencies (yarn install) ...');
    // CXXFLAGS=--std=c++20 is required to compile tree-sitter native bindings against Node 24 headers.
    await execa('yarn', ['install'], {
      cwd: SCS_CACHE_DIR,
      stdio: 'inherit',
      env: { ...process.env, CXXFLAGS: '--std=c++20' },
    });

    log.info('Building scs CLI (nx run @elastic/scs:build) ...');
    await execa('yarn', ['nx', 'run', '@elastic/scs:build'], {
      cwd: SCS_CACHE_DIR,
      stdio: 'inherit',
      env: { ...process.env, NX_LOAD_DOT_ENV_FILES: 'false' },
    });
  } else {
    log.info(`Using cached scs build at ${SCS_BIN}`);
  }

  return ['node', SCS_BIN];
}

/**
 * Returns a local path to the OTel demo repo checked out at the given tag.
 * Cached per-version under SCS_CACHE_DIR so repeated runs skip the clone.
 */
async function ensureOtelDemoAtVersion(version: string, log: ToolingLog): Promise<string> {
  const repoDir = path.join(SCS_CACHE_DIR, 'repos', `opentelemetry-demo-${version}`);
  if (fs.existsSync(repoDir)) {
    log.info(`Using cached OTel demo source at ${repoDir}`);
    return repoDir;
  }
  log.info(`Cloning OTel demo at tag v${version} to ${repoDir} ...`);
  await execa(
    'git',
    ['clone', '--depth', '1', '--branch', `v${version}`, OTEL_DEMO_REPO_URL, repoDir],
    { stdio: 'inherit' }
  );
  return repoDir;
}

function getIndexedVersion(): string | null {
  try {
    return fs.readFileSync(INDEXED_VERSION_FILE, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

function setIndexedVersion(version: string): void {
  fs.mkdirSync(SCS_CACHE_DIR, { recursive: true });
  fs.writeFileSync(INDEXED_VERSION_FILE, version);
}

async function chunksIndexHasDocs(esHosts: string, username: string, password: string) {
  try {
    const res = await fetch(`${esHosts}/code-open-telemetry_opentelemetry-demo_chunks/_count`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { count?: number };
    return (body.count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function seedCodeSearch({
  elasticsearch,
  kibanaCredentials,
  kibanaUrl,
  version,
  log,
}: SeedCodeSearchOptions) {
  const [scsBin, repoDir] = await Promise.all([
    ensureScs(log),
    ensureOtelDemoAtVersion(version, log),
  ]);
  const [exe, ...prefixArgs] = scsBin;

  // scs reads ES credentials from environment variables
  const env = {
    ...process.env,
    ELASTICSEARCH_ENDPOINT: elasticsearch.hosts,
    ELASTICSEARCH_USERNAME: elasticsearch.username,
    ELASTICSEARCH_PASSWORD: elasticsearch.password,
    // Use the ELSER 2 inference endpoint that ships with Elastic Stack
    SCS_ELASTICSEARCH_INFERENCE_ID: '.elser-2-elasticsearch',
  };

  // Skip re-index only when the same version is already indexed.
  // If --version changes, force a clean re-index so indexed source matches the deployed demo.
  const indexedVersion = getIndexedVersion();
  const hasDocs = await chunksIndexHasDocs(
    elasticsearch.hosts,
    elasticsearch.username,
    elasticsearch.password
  );

  if (indexedVersion === version && hasDocs) {
    log.info(`Existing code index found for v${version} — skipping re-index.`);
  } else {
    if (indexedVersion && indexedVersion !== version) {
      log.info(`Version changed (${indexedVersion} → ${version}) — re-indexing with --clean.`);
    } else {
      log.info(
        `No existing code index for v${version} — indexing with --clean. May take several minutes.`
      );
    }

    await execa(
      exe,
      [...prefixArgs, 'index', repoDir, '--clean', '--repository', OTEL_DEMO_REPOSITORY],
      { stdio: 'inherit', env }
    );

    setIndexedVersion(version);
    log.info('Code indexing complete.');
  }

  log.info('Installing agentic interfaces into Kibana ...');

  await execa(
    exe,
    [
      ...prefixArgs,
      'install-agentic-interfaces',
      '--kibana-url',
      kibanaUrl,
      '--username',
      kibanaCredentials.username,
      '--password',
      kibanaCredentials.password,
    ],
    { stdio: 'inherit', env }
  );

  log.info('Agentic interfaces installed.');
}
