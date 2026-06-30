/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { errors } from '@elastic/elasticsearch';
import inquirer from 'inquirer';
import moment from 'moment';
import type { ToolingLog } from '@kbn/tooling-log';
import type { ConnectionConfig } from './get_connection_config';
import { kibanaRequest } from './kibana';
import {
  DEFAULT_ENV_SNAPSHOT_LOGS_INDEX,
  INDEX_ALIAS_CONFIG,
  VALID_ALERT_INDICES,
  VALID_SYSTEM_INDICES,
} from './constants';

export function toSnapshotName(index: string): string {
  return `snapshot-${index.slice(1)}`;
}

export const parseRepeatableFlag = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
};

export interface CommonSnapshotFlags {
  snapshotName: string;
  systemIndices: string[];
  alertIndices: string[];
  logsIndex: string;
}

export const parseCommonSnapshotFlags = (flags: Record<string, unknown>): CommonSnapshotFlags => {
  const snapshotName = String(flags['snapshot-name'] || '');
  if (!snapshotName) {
    throw new Error('Required: --snapshot-name <name>');
  }

  // System indices are not configurable — there is a single fixed set, so always
  // capture/restore all of them. The KI data stream is handled separately.
  const systemIndices = [...VALID_SYSTEM_INDICES];

  const alertIndicesFlag = parseRepeatableFlag(flags['alert-indices']);
  const alertIndices = alertIndicesFlag.length > 0 ? alertIndicesFlag : [...VALID_ALERT_INDICES];

  const validAlertSet = new Set<string>(VALID_ALERT_INDICES);
  for (const idx of alertIndices) {
    if (!validAlertSet.has(idx)) {
      throw new Error(
        `Invalid --alert-indices value "${idx}". ` +
          `Allowed values: ${VALID_ALERT_INDICES.join(', ')}`
      );
    }
  }

  const logsIndex = String(flags['logs-index'] || DEFAULT_ENV_SNAPSHOT_LOGS_INDEX);

  return { snapshotName, systemIndices, alertIndices, logsIndex };
};

const DURATION_RE = /^(\d+)(s|m|h|d)$/;

/**
 * Parses a duration flag like "3m", "90s", "1h", "2d" into milliseconds. Returns `defaultMs`
 * when the flag is absent; throws on a malformed value.
 */
export const parseDurationFlag = (
  raw: string | string[] | boolean | undefined,
  flagName: string,
  defaultMs: number
): number => {
  if (!raw) return defaultMs;

  const value = String(raw);

  const match = value.match(DURATION_RE);
  if (!match) {
    throw new Error(`--${flagName} must be a duration like "3m", "90s", "1h". Got: "${value}"`);
  }

  const amount = Number(match[1]);
  const unit = match[2] as moment.unitOfTime.DurationConstructor;
  return moment.duration(amount, unit).asMilliseconds();
};

export async function resolvePatterns(
  esClient: Client,
  log: ToolingLog,
  patterns: string[]
): Promise<string[]> {
  const resolved: string[] = [];

  for (const pattern of patterns) {
    if (!pattern.includes('*')) {
      resolved.push(pattern);
      continue;
    }

    try {
      const response = await esClient.indices.resolveIndex({
        name: pattern,
        expand_wildcards: 'all',
      });

      const indices = (response.indices ?? []).map((idx) => idx.name);
      const dataStreamNames = (response.data_streams ?? []).map((ds) => ds.name);

      if (indices.length === 0 && dataStreamNames.length === 0) {
        log.warning(`No indices matched pattern "${pattern}" — skipping`);
      } else {
        for (const idx of indices) {
          log.info(`Resolved ${pattern} → ${idx}`);
        }
        for (const ds of dataStreamNames) {
          log.info(`Resolved ${pattern} → ${ds} (data stream)`);
        }
        resolved.push(...indices, ...dataStreamNames);
      }
    } catch (err) {
      if (err instanceof errors.ResponseError && err.statusCode === 404) {
        log.warning(`No indices matched pattern "${pattern}" — skipping`);
        continue;
      }
      throw err;
    }
  }

  return resolved;
}

export const ensureKnownAliases = async ({
  esClient,
  log,
  systemIndices,
  alertIndices,
}: {
  esClient: Client;
  log: ToolingLog;
  systemIndices: string[];
  alertIndices: string[];
}): Promise<void> => {
  let created = 0;
  let skipped = 0;

  for (const indexPattern of [...systemIndices, ...alertIndices]) {
    const config = INDEX_ALIAS_CONFIG[indexPattern as keyof typeof INDEX_ALIAS_CONFIG];
    if (!config?.alias) {
      log.warning(`No alias config for "${indexPattern}" — skipping`);
      continue;
    }

    const { alias: aliasName } = config;

    const aliasExists = await esClient.indices.existsAlias({ name: aliasName });
    if (aliasExists) {
      log.debug(`Alias "${aliasName}" already exists — skipping`);
      skipped++;
      continue;
    }

    try {
      const resolved = await esClient.indices.resolveIndex({
        name: indexPattern,
        expand_wildcards: 'all',
      });
      const concreteIndex = resolved.indices?.[0]?.name;
      if (!concreteIndex) {
        log.debug(`No index found for pattern "${indexPattern}" — skipping alias`);
        continue;
      }

      log.info(`Creating alias "${aliasName}" → "${concreteIndex}"`);
      await esClient.indices.updateAliases({
        actions: [{ add: { index: concreteIndex, is_write_index: true, ...config } }],
      });
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Alias creation failed for "${indexPattern}": ${msg}`);
    }
  }

  log.info(`Aliases: ${created} created, ${skipped} already existed`);
};

export async function resolveExisting(esClient: Client, patterns: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const pattern of patterns) {
    try {
      const response = await esClient.indices.resolveIndex({
        name: pattern,
        expand_wildcards: 'all',
      });
      found.push(
        ...(response.indices ?? []).map((i) => i.name),
        ...(response.data_streams ?? []).map((d) => d.name)
      );
    } catch (err) {
      if (err instanceof errors.ResponseError && err.statusCode === 404) {
        continue;
      }
      throw err;
    }
  }
  return found;
}

/**
 * Detect bare concrete indices whose name equals a stable alias from INDEX_ALIAS_CONFIG.
 * Versioned wildcard patterns like `.kibana_alerting_cases_*` do not match a bare index named
 * exactly `.kibana_alerting_cases`, so these slip past `resolveExisting` and only surface later
 * as `invalid_alias_name_exception` during `updateAliases`. Deleting them up-front keeps the
 * restore linear.
 */
async function findCollidingAliasNameIndices(
  esClient: Client,
  patterns: string[]
): Promise<string[]> {
  const aliasNames = new Set<string>();
  for (const pattern of patterns) {
    const config = INDEX_ALIAS_CONFIG[pattern as keyof typeof INDEX_ALIAS_CONFIG];
    if (config?.alias) {
      aliasNames.add(config.alias);
    }
  }

  const colliding: string[] = [];
  for (const aliasName of aliasNames) {
    try {
      const response = await esClient.indices.resolveIndex({
        name: aliasName,
        expand_wildcards: 'all',
      });
      const exactConcrete = (response.indices ?? []).find((i) => i.name === aliasName);
      if (exactConcrete) {
        colliding.push(aliasName);
      }
    } catch (err) {
      if (err instanceof errors.ResponseError && err.statusCode === 404) {
        continue;
      }
      throw err;
    }
  }
  return colliding;
}

export async function deleteExisting(
  esClient: Client,
  log: ToolingLog,
  names: string[]
): Promise<void> {
  for (const name of names) {
    try {
      await esClient.indices.deleteDataStream({ name });
      log.info(`  deleted data stream: ${name}`);
    } catch (dsErr) {
      log.debug(
        `  not a data stream "${name}" (${
          dsErr instanceof Error ? dsErr.message : String(dsErr)
        }) — trying index delete`
      );
      try {
        await esClient.indices.delete({ index: name, ignore_unavailable: true });
        log.info(`  deleted index: ${name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warning(`  failed to delete "${name}": ${msg}`);
        throw new Error(`Cannot continue restore: failed to delete "${name}": ${msg}`);
      }
    }
  }
}

async function promptConfirm(question: string): Promise<boolean> {
  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    { type: 'confirm', name: 'confirmed', message: question, default: false },
  ]);
  return confirmed;
}

export async function ensureCleanEnvironment({
  esClient,
  log,
  systemIndices,
  alertIndices,
  logsIndex,
  clean,
}: {
  esClient: Client;
  log: ToolingLog;
  systemIndices: string[];
  alertIndices: string[];
  logsIndex: string;
  clean: boolean;
}): Promise<void> {
  const [matchedByPattern, aliasNameCollisions] = await Promise.all([
    resolveExisting(esClient, [logsIndex, ...systemIndices, ...alertIndices]),
    findCollidingAliasNameIndices(esClient, [...systemIndices, ...alertIndices]),
  ]);

  const seen = new Set<string>();
  const allExisting: string[] = [];
  for (const name of [...matchedByPattern, ...aliasNameCollisions]) {
    if (!seen.has(name)) {
      seen.add(name);
      allExisting.push(name);
    }
  }

  if (allExisting.length === 0) {
    log.debug('Environment is clean — no existing indices found');
    return;
  }

  log.warning('Found existing indices that will conflict with the restore:');
  for (const name of allExisting) {
    log.warning(`  - ${name}`);
  }

  if (!clean) {
    if (!process.stdin.isTTY) {
      throw new Error(
        `Environment is not clean. Re-run with --clean to automatically delete the listed indices, or delete them manually before restoring.`
      );
    }

    const confirmed = await promptConfirm(
      `This will permanently delete all existing Streams and Significant Events data (${allExisting.length} indices listed above) and replace it with the snapshot contents. Proceed?`
    );
    if (!confirmed) {
      throw new Error(
        `Restore aborted. Delete the listed indices manually or re-run with --clean.`
      );
    }
  }

  log.info('Cleaning up environment...');
  await deleteExisting(esClient, log, allExisting);
}

export async function getEnabledStreams(esClient: Client, log: ToolingLog): Promise<string[]> {
  try {
    const response = (await esClient.transport.request({
      method: 'GET',
      path: '/_streams/status',
    })) as Record<string, { enabled?: boolean }>;

    const enabled = Object.entries(response)
      .filter(([, v]) => v?.enabled)
      .map(([name]) => name);

    if (enabled.length > 0) {
      log.info(`Enabled ES streams: ${enabled.join(', ')}`);
    }
    return enabled;
  } catch {
    log.debug('GET /_streams/status not available — no pipeline exclusions');
    return [];
  }
}

export async function ensureStreamsEnabled(
  config: ConnectionConfig,
  log: ToolingLog
): Promise<void> {
  const { status, data } = await kibanaRequest(config, 'POST', '/api/streams/_enable');
  if (status === 200) {
    log.info('Streams enabled successfully');
  } else if (status === 400) {
    const msg = JSON.stringify(data ?? '');
    if (msg.includes('already enabled') || msg.includes('Cannot change stream types')) {
      log.info('Streams already enabled');
    } else {
      throw new Error(`Failed to enable streams: ${status} ${msg}`);
    }
  } else if (status === 404) {
    log.warning('Streams API not available — skipping');
  } else {
    throw new Error(`Failed to enable streams: ${status} ${JSON.stringify(data)}`);
  }
}
