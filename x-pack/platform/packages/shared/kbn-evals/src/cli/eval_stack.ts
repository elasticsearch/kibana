/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import { spawn } from 'child_process';
import type { ToolingLog } from '@kbn/tooling-log';
import { resolveCcmApiKey } from '@kbn/es';
import { scoutEvalsArgs } from './prompts';
import {
  isServiceRunning,
  isScoutStale,
  startService,
  stopService,
  connectorsHash,
  scoutEnvHash,
  tailLog,
  isEdotDockerRunning,
} from './services';
import { probeHttp } from './profiles';

const SCOUT_LOCAL_CONFIG = '.scout/servers/local.json';
const SCOUT_READY_POLL_INTERVAL_MS = 3000;
const SCOUT_READY_TIMEOUT_MS = 180_000;

const waitForScoutReady = async (repoRoot: string, log: ToolingLog): Promise<void> => {
  const configPath = Path.join(repoRoot, SCOUT_LOCAL_CONFIG);
  const startTime = Date.now();
  let esUrl: string | undefined;
  let kbnUrl: string | undefined;

  while (Date.now() - startTime < SCOUT_READY_TIMEOUT_MS) {
    if (!esUrl && Fs.existsSync(configPath)) {
      try {
        const raw = Fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(raw) as { hosts?: { kibana?: string; elasticsearch?: string } };
        esUrl = parsed.hosts?.elasticsearch;
        kbnUrl = parsed.hosts?.kibana;
      } catch {
        // file not fully written yet
      }
    }

    if (esUrl && kbnUrl) {
      const [esOk, kbnOk] = await Promise.all([
        probeHttp(esUrl),
        probeHttp(`${kbnUrl}/api/status`),
      ]);
      if (esOk && kbnOk) {
        return;
      }
    }

    await new Promise((r) => setTimeout(r, SCOUT_READY_POLL_INTERVAL_MS));
  }

  throw new Error(`Scout did not become ready within ${SCOUT_READY_TIMEOUT_MS / 1000}s`);
};

/**
 * Verify the Scout-managed ES and Kibana are actually reachable, not just that
 * the parent PID is alive. Covers the common case where ES crashes while the
 * Scout orchestrator (and Kibana) keep running.
 */
const probeScoutHealth = async (repoRoot: string): Promise<{ ok: boolean; reason?: string }> => {
  const configPath = Path.join(repoRoot, SCOUT_LOCAL_CONFIG);
  if (!Fs.existsSync(configPath)) {
    return { ok: false, reason: 'local config missing (.scout/servers/local.json)' };
  }

  try {
    const raw = Fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as { hosts?: { kibana?: string; elasticsearch?: string } };
    const esUrl = parsed.hosts?.elasticsearch;
    const kbnUrl = parsed.hosts?.kibana;

    if (!esUrl || !kbnUrl) {
      return { ok: false, reason: 'hosts missing from local config' };
    }

    const [esOk, kbnOk] = await Promise.all([probeHttp(esUrl), probeHttp(`${kbnUrl}/api/status`)]);

    if (!esOk && !kbnOk) {
      return { ok: false, reason: `ES (${esUrl}) and Kibana (${kbnUrl}) are unreachable` };
    }
    if (!esOk) {
      return { ok: false, reason: `ES is unreachable (${esUrl})` };
    }
    if (!kbnOk) {
      return { ok: false, reason: `Kibana is unreachable (${kbnUrl})` };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: 'failed to read local config' };
  }
};

export interface EnsureEdotOptions {
  repoRoot: string;
  log: ToolingLog;
  elasticsearchHost: string | undefined;
}

/**
 * Ensures the EDOT collector is running (exports traces to the configured ES),
 * reusing an existing instance when one is already up.
 */
export const ensureEdot = async ({
  repoRoot,
  log,
  elasticsearchHost,
}: EnsureEdotOptions): Promise<void> => {
  if (isServiceRunning(repoRoot, 'edot') || isEdotDockerRunning()) {
    log.info('[edot] EDOT collector already running -- reusing');
    return;
  }

  log.info('[edot] Starting EDOT collector (backgrounded)...');

  if (elasticsearchHost) {
    log.info(`[edot] EDOT collector will export to: ${elasticsearchHost}`);
  }
  startService(repoRoot, 'edot', 'node', ['scripts/edot_collector.js'], log, {
    env: elasticsearchHost ? { ELASTICSEARCH_HOST: elasticsearchHost } : undefined,
  });

  const stopTail = tailLog(repoRoot, 'edot', log, { fromStart: true });
  await new Promise((r) => setTimeout(r, 5000));
  stopTail();

  if (!isEdotDockerRunning()) {
    log.warning(
      'EDOT collector may not have started. Check logs: node scripts/evals logs --service edot'
    );
  } else {
    log.info('[edot] EDOT collector started');
  }
};

export interface EnsureScoutOptions {
  repoRoot: string;
  log: ToolingLog;
  gcsCredentials: string | undefined;
  tracingExporters: string | undefined;
  serverConfigSet?: string;
}

/**
 * Ensures the Scout server (ES + Kibana) is running and reachable, restarting it
 * when the existing instance is stale or unhealthy.
 */
export const ensureScout = async ({
  repoRoot,
  log,
  gcsCredentials,
  tracingExporters,
  serverConfigSet = 'evals_tracing',
}: EnsureScoutOptions): Promise<void> => {
  const scoutEnv: Record<string, string> = {};
  if (gcsCredentials) {
    scoutEnv.GCS_CREDENTIALS = gcsCredentials;
  }
  if (tracingExporters) {
    scoutEnv.TRACING_EXPORTERS = tracingExporters;
  }

  const scoutAlive = isServiceRunning(repoRoot, 'scout');
  const staleCheck = scoutAlive
    ? isScoutStale(repoRoot, serverConfigSet, scoutEnv)
    : { stale: false };

  if (staleCheck.stale) {
    log.warning(`[scout] Scout server is stale (${staleCheck.reason}). Restarting...`);
    await stopService(repoRoot, 'scout', log);
  }

  let scoutReusable = scoutAlive && !staleCheck.stale;

  if (scoutReusable) {
    const health = await probeScoutHealth(repoRoot);
    if (!health.ok) {
      log.warning(`[scout] Scout PID alive but ${health.reason}. Restarting...`);
      await stopService(repoRoot, 'scout', log);
      scoutReusable = false;
    }
  }

  if (scoutReusable) {
    log.info('[scout] Scout server already running -- reusing');
    return;
  }

  const scoutConfigPath = Path.join(repoRoot, SCOUT_LOCAL_CONFIG);
  if (Fs.existsSync(scoutConfigPath)) {
    Fs.unlinkSync(scoutConfigPath);
  }

  log.info(`[scout] Starting Scout server (backgrounded, stateful/classic, ${serverConfigSet})...`);

  startService(
    repoRoot,
    'scout',
    'node',
    ['scripts/scout.js', ...scoutEvalsArgs(serverConfigSet)],
    log,
    {
      connectorsHash: connectorsHash(),
      serverConfigSet,
      envHash: scoutEnvHash(scoutEnv),
      env: Object.keys(scoutEnv).length > 0 ? scoutEnv : undefined,
    }
  );

  const stopTail = tailLog(repoRoot, 'scout', log, { fromStart: true });
  log.info('[scout] Waiting for ES + Kibana to be ready...');
  await waitForScoutReady(repoRoot, log);
  stopTail();
  log.info('[scout] Scout server ready');
};

export interface EnsureEisCcmOptions {
  repoRoot: string;
  log: ToolingLog;
}

/**
 * Enables EIS (Cloud Connected Mode).
 */
export const ensureEisCcm = async ({ repoRoot, log }: EnsureEisCcmOptions): Promise<void> => {
  log.info('[eis-ccm] Enabling EIS (Cloud Connected Mode)...');
  const ccmApiKey = await resolveCcmApiKey(log);

  const ccmResult = spawn(
    'node',
    ['x-pack/platform/packages/shared/kbn-evals/scripts/local_repros/enable_eis_ccm.js'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, KIBANA_EIS_CCM_API_KEY: ccmApiKey },
    }
  );

  await new Promise<void>((resolve, reject) => {
    ccmResult.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`enable_eis_ccm exited with code ${code}`));
      }
    });
    ccmResult.on('error', reject);
  });

  log.info('[eis-ccm] EIS CCM enabled');
};

export interface EnsureEvalStackOptions {
  repoRoot: string;
  log: ToolingLog;
  profileEnvOverrides: Record<string, string>;
  serverConfigSet?: string;
  requiresEisCcm: boolean;
}

/**
 * Boots EDOT collector, Scout server, and EIS CCM as background daemons by
 * composing the individual `ensure*` steps.
 */
export const ensureEvalStack = async ({
  repoRoot,
  log,
  profileEnvOverrides,
  serverConfigSet = 'evals_tracing',
  requiresEisCcm,
}: EnsureEvalStackOptions): Promise<void> => {
  await ensureEdot({ repoRoot, log, elasticsearchHost: profileEnvOverrides.TRACING_ES_URL });

  await ensureScout({
    repoRoot,
    log,
    gcsCredentials: profileEnvOverrides.GCS_CREDENTIALS,
    tracingExporters: profileEnvOverrides.TRACING_EXPORTERS,
    serverConfigSet,
  });

  if (requiresEisCcm) {
    await ensureEisCcm({ repoRoot, log });
  } else {
    log.info('[eis-ccm] Skipping EIS CCM (no eis- judge/models selected)');
  }
};
