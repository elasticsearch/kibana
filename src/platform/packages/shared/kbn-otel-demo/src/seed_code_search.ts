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
import path from 'path';
import { REPO_ROOT } from '@kbn/repo-info';
import type { ElasticsearchConfig } from './read_kibana_config';
import { applyCodeScenario } from './apply_code_scenario';
import { getCodeScenarioById } from './code_scenarios';
import { ensureOtelDemoAtVersion, OTEL_DEMO_REPOSITORY, SCS_CACHE_DIR } from './otel_demo_source';
const SCS_REPO_URL = 'https://github.com/elastic/semantic-code-search.git';

const SCS_BIN = path.join(SCS_CACHE_DIR, 'packages', 'cli', 'dist', 'src', 'bin.js');
const CODE_SCENARIO_STATE_PATH = path.join(
  REPO_ROOT,
  'data',
  'demo_environments',
  'code_scenario_state.json'
);

interface SeedCodeSearchOptions {
  elasticsearch: ElasticsearchConfig;
  kibanaCredentials: { username: string; password: string };
  kibanaUrl: string;
  version: string;
  log: ToolingLog;
  codeScenarioId?: string;
  codeScenarioRepoDir?: string;
}

interface CodeScenarioState {
  activeCodeScenarioId?: string;
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

async function readCodeScenarioState(): Promise<CodeScenarioState> {
  try {
    const state = await fs.promises.readFile(CODE_SCENARIO_STATE_PATH, 'utf8');
    return JSON.parse(state) as CodeScenarioState;
  } catch {
    return {};
  }
}

async function writeCodeScenarioState(state: CodeScenarioState): Promise<void> {
  await fs.promises.mkdir(path.dirname(CODE_SCENARIO_STATE_PATH), { recursive: true });
  await fs.promises.writeFile(
    CODE_SCENARIO_STATE_PATH,
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8'
  );
}

export async function seedCodeSearch({
  elasticsearch,
  kibanaCredentials,
  kibanaUrl,
  version,
  log,
  codeScenarioId,
  codeScenarioRepoDir,
}: SeedCodeSearchOptions) {
  const scsBin = await ensureScs(log);
  const [exe, ...prefixArgs] = scsBin;
  let repoDir: string;
  let forceReindex = false;

  if (codeScenarioId) {
    const scenario = getCodeScenarioById(codeScenarioId);
    if (!scenario) {
      throw new Error(`Unknown code scenario: ${codeScenarioId}`);
    }
    repoDir = codeScenarioRepoDir || (await applyCodeScenario({ version, scenario, log }));
    forceReindex = true;
  } else {
    repoDir = await ensureOtelDemoAtVersion(version, log);
    const previousState = await readCodeScenarioState();
    forceReindex = Boolean(previousState.activeCodeScenarioId);
  }

  // scs reads ES credentials from environment variables
  const env = {
    ...process.env,
    ELASTICSEARCH_ENDPOINT: elasticsearch.hosts,
    ELASTICSEARCH_USERNAME: elasticsearch.username,
    ELASTICSEARCH_PASSWORD: elasticsearch.password,
    // Use the ELSER 2 inference endpoint that ships with Elastic Stack
    SCS_ELASTICSEARCH_INFERENCE_ID: '.elser-2-elasticsearch',
  };

  // First run: full clean index. Subsequent runs: no-op (local clone is pinned to a tag,
  // so there's nothing to pull — the indexed source already matches the deployed version).
  const alreadyIndexed =
    !forceReindex &&
    (await chunksIndexHasDocs(elasticsearch.hosts, elasticsearch.username, elasticsearch.password));

  if (alreadyIndexed) {
    log.info('Existing code index found — skipping re-index (source is pinned to a tag).');
    return;
  }

  if (codeScenarioId) {
    log.info(
      `Indexing OTel demo v${version} with code scenario ${codeScenarioId} (--clean). May take several minutes.`
    );
  } else if (forceReindex) {
    log.info(
      `Re-indexing clean OTel demo v${version} after code scenario reset (--clean). May take several minutes.`
    );
  } else {
    log.info(
      `No existing code index — indexing OTel demo v${version} (--clean). May take several minutes.`
    );
  }

  await execa(
    exe,
    [...prefixArgs, 'index', repoDir, '--clean', '--repository', OTEL_DEMO_REPOSITORY],
    { stdio: 'inherit', env }
  );

  log.info('Code indexing complete. Installing agentic interfaces into Kibana ...');

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
  await writeCodeScenarioState({ activeCodeScenarioId: codeScenarioId });
}
