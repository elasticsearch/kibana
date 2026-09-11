/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import { createHash } from 'crypto';
import { execFileSync, spawn, type SpawnOptions } from 'child_process';
import type { ToolingLog } from '@kbn/tooling-log';

const EVALS_DIR = 'target/evals';
const STATE_FILE = 'target/evals/services.json';
const DEFAULT_SERVER_CONFIG_SET = 'evals_tracing';
export const EDOT_CONTAINER_NAME = 'kibana-edot-collector';

export type ServiceName = 'edot' | 'scout';

interface ServiceEntry {
  pid: number;
  logFile: string;
  startedAt: string;
  /** SHA-256 of KIBANA_TESTING_INFERENCE_ENDPOINTS + KIBANA_TESTING_AI_CONNECTORS at boot time (Scout only) */
  connectorsHash?: string;
  /** The serverConfigSet used to start Scout */
  serverConfigSet?: string;
  /**
   * SHA-256 of the env the service was started with (Scout: TRACING_EXPORTERS,
   * GCS_CREDENTIALS; EDOT: ELASTICSEARCH_HOST).
   */
  envHash?: string;
}

interface ServicesState {
  edot?: ServiceEntry;
  scout?: ServiceEntry;
}

const ensureDir = (repoRoot: string) => {
  const dir = Path.join(repoRoot, EVALS_DIR);
  Fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export const readState = (repoRoot: string): ServicesState => {
  const file = Path.join(repoRoot, STATE_FILE);
  if (!Fs.existsSync(file)) return {};
  try {
    return JSON.parse(Fs.readFileSync(file, 'utf-8')) as ServicesState;
  } catch {
    return {};
  }
};

const writeState = (repoRoot: string, state: ServicesState) => {
  ensureDir(repoRoot);
  Fs.writeFileSync(Path.join(repoRoot, STATE_FILE), JSON.stringify(state, null, 2) + '\n');
};

export const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const hashParts = (parts: Array<string | undefined>): string =>
  createHash('sha256')
    .update(parts.map((part) => part ?? '').join('\0'))
    .digest('hex')
    .slice(0, 12);

export const connectorsHash = (): string =>
  hashParts([
    process.env.KIBANA_TESTING_INFERENCE_ENDPOINTS,
    process.env.KIBANA_TESTING_AI_CONNECTORS,
  ]);

export const scoutEnvHash = (env: Record<string, string> | undefined): string =>
  hashParts([env?.TRACING_EXPORTERS, env?.GCS_CREDENTIALS]);

export const edotEnvHash = (elasticsearchHost: string | undefined): string =>
  hashParts([elasticsearchHost]);

export const isServiceRunning = (repoRoot: string, name: ServiceName): boolean => {
  const state = readState(repoRoot);
  const entry = state[name];
  return !!entry && isAlive(entry.pid);
};

/**
 * Returns true if the running Scout was started with a different set of connectors
 * than what's currently in the environment, a different serverConfigSet, or
 * different forwarded env vars (e.g. TRACING_EXPORTERS, GCS_CREDENTIALS).
 */
export const isScoutStale = (
  repoRoot: string,
  requestedConfigSet?: string,
  scoutEnv?: Record<string, string>
): { stale: boolean; reason?: string } => {
  const state = readState(repoRoot);
  const entry = state.scout;
  if (!entry || !isAlive(entry.pid)) return { stale: false };

  if (entry.connectorsHash !== connectorsHash()) {
    return { stale: true, reason: 'connectors configuration changed' };
  }

  const currentEnvHash = scoutEnvHash(scoutEnv);
  if (entry.envHash && entry.envHash !== currentEnvHash) {
    return { stale: true, reason: 'TRACING_EXPORTERS or GCS_CREDENTIALS changed' };
  }

  const runningConfigSet = entry.serverConfigSet ?? DEFAULT_SERVER_CONFIG_SET;
  const targetConfigSet = requestedConfigSet ?? DEFAULT_SERVER_CONFIG_SET;

  if (runningConfigSet !== targetConfigSet) {
    return {
      stale: true,
      reason: `serverConfigSet changed (running: ${
        entry.serverConfigSet ?? DEFAULT_SERVER_CONFIG_SET
      }, requested: ${targetConfigSet})`,
    };
  }

  return { stale: false };
};

/**
 * Returns true if the running EDOT collector exports to a different
 * Elasticsearch than this run reads traces from. Switching profiles between
 * runs is what moves the target, and a collector left pointing at the previous
 * one goes on accepting spans while indexing them somewhere the trace-based
 * evaluators never look.
 */
export const isEdotStale = (
  repoRoot: string,
  elasticsearchHost: string | undefined
): { stale: boolean; reason?: string } => {
  const entry = readState(repoRoot).edot;
  if (!entry || !isAlive(entry.pid)) return { stale: false };

  if (entry.envHash && entry.envHash !== edotEnvHash(elasticsearchHost)) {
    return { stale: true, reason: 'TRACING_ES_URL changed' };
  }

  return { stale: false };
};

/**
 * Spawn a detached service process. Stdout/stderr are written to a log file.
 * Returns the child PID.
 */
export const startService = (
  repoRoot: string,
  name: ServiceName,
  command: string,
  args: string[],
  log: ToolingLog,
  opts?: {
    connectorsHash?: string;
    serverConfigSet?: string;
    envHash?: string;
    env?: Record<string, string | undefined>;
  }
): number => {
  const dir = ensureDir(repoRoot);
  const logFile = Path.join(dir, `${name}.log`);

  // Truncate previous log
  Fs.writeFileSync(logFile, '');

  const fd = Fs.openSync(logFile, 'a');
  const spawnOpts: SpawnOptions = {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', fd, fd],
    env: { ...process.env, ...opts?.env },
  };

  const child = spawn(command, args, spawnOpts);
  child.unref();
  Fs.closeSync(fd);

  const pid = child.pid!;
  log.info(`[${name}] started (PID ${pid}, log: ${Path.relative(repoRoot, logFile)})`);

  const state = readState(repoRoot);
  state[name] = {
    pid,
    logFile: Path.relative(repoRoot, logFile),
    startedAt: new Date().toISOString(),
    ...(opts?.connectorsHash ? { connectorsHash: opts.connectorsHash } : {}),
    ...(opts?.serverConfigSet ? { serverConfigSet: opts.serverConfigSet } : {}),
    ...(opts?.envHash ? { envHash: opts.envHash } : {}),
  };
  writeState(repoRoot, state);

  return pid;
};

export const isEdotDockerRunning = (): boolean => {
  try {
    const result = execFileSync(
      'docker',
      ['ps', '--filter', `name=${EDOT_CONTAINER_NAME}`, '--format', '{{.Names}}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000 }
    ).trim();
    return result.split('\n').some((name) => name.trim() === EDOT_CONTAINER_NAME);
  } catch {
    return false;
  }
};

/**
 * Stop the EDOT Docker container. The container runs independently of the
 * tracked node process, so killing the PID alone is not enough.
 */
const stopEdotDockerContainer = (repoRoot: string, log: ToolingLog): void => {
  if (!isEdotDockerRunning()) {
    return;
  }

  const composePath = Path.join(repoRoot, 'data/edot_collector/docker-compose.yaml');

  if (Fs.existsSync(composePath)) {
    try {
      execFileSync('docker', ['compose', '-f', composePath, 'down'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
      });
      log.info('[edot] Docker container stopped via compose');
      return;
    } catch (err) {
      const { signal, stderr } = err as Record<string, unknown>;
      if (signal != null) {
        log.warning('[edot] docker compose down timed out, falling back to docker stop');
      } else {
        const detail = typeof stderr === 'string' && stderr.trim() ? stderr.trim() : String(err);
        log.warning(`[edot] docker compose down failed (${detail}), falling back to docker stop`);
      }
    }
  } else {
    log.info('[edot] compose file not found, using docker stop');
  }

  try {
    execFileSync('docker', ['stop', EDOT_CONTAINER_NAME], {
      stdio: 'ignore',
      timeout: 15_000,
    });
    log.info('[edot] Docker container stopped');
  } catch (err) {
    log.warning(`[edot] docker stop failed (${err instanceof Error ? err.message : err})`);
  }
};

/**
 * Best-effort kill of a process group. Useful when the group leader (tracked
 * PID) has exited but children (ES, Kibana) may still be running.
 * Returns true if any process in the group was signalled.
 */
const killProcessGroup = (pid: number, signal: NodeJS.Signals, log?: ToolingLog): boolean => {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (err) {
    if (log && (err as NodeJS.ErrnoException).code !== 'ESRCH') {
      log.warning(`Failed to signal process group ${pid}: ${(err as Error).message}`);
    }
    return false;
  }
};

/**
 * Returns true if any process in the given process group is still alive.
 */
const isProcessGroupAlive = (pid: number): boolean => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Send SIGTERM to a process group, wait up to {@link timeoutMs} for all
 * members to exit, then SIGKILL any survivors.
 */
const terminateProcessGroup = async (
  pid: number,
  log: ToolingLog,
  label: string,
  timeoutMs = 10_000
): Promise<void> => {
  if (!killProcessGroup(pid, 'SIGTERM', log)) {
    return;
  }

  const deadline = Date.now() + timeoutMs;
  while (isProcessGroupAlive(pid) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
  }

  if (isProcessGroupAlive(pid)) {
    log.warning(`[${label}] did not stop gracefully, sending SIGKILL`);
    killProcessGroup(pid, 'SIGKILL', log);

    const killDeadline = Date.now() + 2_000;
    while (isProcessGroupAlive(pid) && Date.now() < killDeadline) {
      await new Promise((r) => setTimeout(r, 100));
    }

    if (isProcessGroupAlive(pid)) {
      log.warning(`[${label}] process group ${pid} still alive after SIGKILL`);
    }
  }
};

/**
 * Stop a service by PID. Sends SIGTERM, waits briefly, then SIGKILL if needed.
 * For EDOT, also tears down the Docker container.
 */
export const stopService = async (
  repoRoot: string,
  name: ServiceName,
  log: ToolingLog
): Promise<boolean> => {
  const state = readState(repoRoot);
  const entry = state[name];

  if (!entry) {
    log.info(`[${name}] no tracked process`);
    if (name === 'edot') {
      stopEdotDockerContainer(repoRoot, log);
    }
    return false;
  }

  if (!isAlive(entry.pid)) {
    log.info(`[${name}] tracked process already exited (PID ${entry.pid})`);

    await terminateProcessGroup(entry.pid, log, name);

    if (name === 'edot') {
      stopEdotDockerContainer(repoRoot, log);
    }

    delete state[name];
    writeState(repoRoot, state);
    return true;
  }

  log.info(`[${name}] stopping (PID ${entry.pid})...`);

  await terminateProcessGroup(entry.pid, log, name);

  if (name === 'edot') {
    stopEdotDockerContainer(repoRoot, log);
  }

  if (isProcessGroupAlive(entry.pid)) {
    log.warning(`[${name}] may not have fully stopped (PID ${entry.pid})`);
  } else {
    log.info(`[${name}] stopped`);
  }
  delete state[name];
  writeState(repoRoot, state);
  return true;
};

export const stopAll = async (repoRoot: string, log: ToolingLog): Promise<boolean> => {
  // Stop Scout first (it has child processes), then EDOT
  const scoutStopped = await stopService(repoRoot, 'scout', log);
  const edotStopped = await stopService(repoRoot, 'edot', log);
  return scoutStopped || edotStopped;
};

/**
 * Tail a service log file, streaming new lines to the ToolingLog.
 * Returns a cleanup function to stop tailing.
 */
export const tailLog = (
  repoRoot: string,
  name: ServiceName,
  log: ToolingLog,
  opts?: { fromStart?: boolean }
): (() => void) => {
  const state = readState(repoRoot);
  const entry = state[name];
  if (!entry) {
    log.warning(`[${name}] no tracked process`);
    return () => {};
  }

  const logPath = Path.resolve(repoRoot, entry.logFile);
  if (!Fs.existsSync(logPath)) {
    log.warning(`[${name}] log file not found: ${entry.logFile}`);
    return () => {};
  }

  const tailArgs = ['-f'];
  if (!opts?.fromStart) {
    tailArgs.push('-n', '0');
  }
  tailArgs.push(logPath);

  const child = spawn('tail', tailArgs, { stdio: ['ignore', 'pipe', 'ignore'] });

  let buffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf-8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      log.info(`[${name}] ${line}`);
    }
  });

  return () => {
    child.kill();
  };
};
