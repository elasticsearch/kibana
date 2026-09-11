/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Fs from 'fs';
import Path from 'path';
import type { FlagsReader } from '@kbn/dev-cli-runner';
import { KBN_EVALS_VAULT_PATHS, KBN_EVALS_VAULT_CONFIG_FIELD, safeExec } from './utils';
import { validateKbnEvalsConfig } from '../../scripts/vault/manage_secrets';

export const VAULT_CONFIG_DIR = 'x-pack/platform/packages/shared/kbn-evals/scripts/vault';

/**
 * Virtual profile: load golden-cluster config from dev Vault at runtime (no config file).
 * Use with `--datasets-profile dev-vault` or `--profile dev-vault`.
 */
export const DEV_VAULT_PROFILE = 'dev-vault';

export const isDevVaultProfile = (profile?: string): boolean =>
  profile?.trim() === DEV_VAULT_PROFILE;

export const stripTrailingSlash = (url: string): string => url.replace(/\/$/, '');

export const probeHttp = async (url: string): Promise<boolean> => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
};

export const isExportProfileImplicitLocal = (
  flagsReader: FlagsReader,
  exportProfile?: string
): boolean => {
  if (exportProfile !== 'local') return false;
  const hasExplicitExport = Boolean(
    flagsReader.string('export-profile') ?? flagsReader.string('profile')
  );
  return !hasExplicitExport;
};

interface VaultConfig {
  evaluationsKbn?: { url?: string; apiKey?: string };
  tracingEs?: { url?: string; apiKey?: string };
  tracingExporters?: unknown;
  agentBuilderTracingExporters?: unknown;
  gcsDatasetAccessCredentials?: unknown;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isPlaceholder = (value: string): boolean => value.includes('REPLACE_ME');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const maybeSetGcsCredentialsEnv = (cfg: VaultConfig | undefined, next: Record<string, string>) => {
  const creds = cfg?.gcsDatasetAccessCredentials;
  if (!isRecord(creds)) return;

  const serialized = JSON.stringify(creds);
  if (!isNonEmptyString(serialized) || isPlaceholder(serialized)) return;

  next.GCS_CREDENTIALS = serialized;
};

export const resolveVaultConfigPath = (repoRoot: string, profile?: string): string => {
  const normalized = profile && profile.trim().length > 0 ? profile.trim() : undefined;
  const isDefault = normalized === undefined || normalized === 'config' || normalized === 'default';
  const fileName = isDefault ? 'config.json' : `config.${normalized}.json`;
  return Path.resolve(repoRoot, VAULT_CONFIG_DIR, fileName);
};

export const defaultExportProfile = (repoRoot: string): string | undefined => {
  const candidate = resolveVaultConfigPath(repoRoot, 'local');
  return Fs.existsSync(candidate) ? 'local' : undefined;
};

export const readVaultConfigFromFile = (
  repoRoot: string,
  profile?: string
): VaultConfig | undefined => {
  const filePath = resolveVaultConfigPath(repoRoot, profile);
  if (!Fs.existsSync(filePath)) return undefined;
  const raw = Fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as VaultConfig;
};

export const readVaultConfigFromDevVault = (): VaultConfig | undefined => {
  const stdout = safeExec('vault', [
    'read',
    `-field=${KBN_EVALS_VAULT_CONFIG_FIELD}`,
    KBN_EVALS_VAULT_PATHS.dev,
  ]);
  if (!stdout) return undefined;

  try {
    const value = Buffer.from(stdout, 'base64').toString('utf-8').trim();
    const parsed = JSON.parse(value);
    return validateKbnEvalsConfig(parsed);
  } catch {
    return undefined;
  }
};

/**
 * Resolves golden-cluster config for CLI commands.
 * Order: dev Vault (`dev-vault` profile) → config file (default: config.json).
 */
export const loadVaultConfig = (repoRoot: string, profile?: string): VaultConfig | undefined => {
  if (isDevVaultProfile(profile)) {
    return readVaultConfigFromDevVault();
  }

  return readVaultConfigFromFile(repoRoot, profile);
};

export const envFromDatasetsProfile = (
  repoRoot: string,
  profile?: string
): Record<string, string> => {
  const cfg = loadVaultConfig(repoRoot, profile);
  const next: Record<string, string> = {};

  if (cfg?.evaluationsKbn) {
    if (isNonEmptyString(cfg.evaluationsKbn.url) && !isPlaceholder(cfg.evaluationsKbn.url)) {
      next.EVAL_KBN_URL = cfg.evaluationsKbn.url;
    }
    if (isNonEmptyString(cfg.evaluationsKbn.apiKey) && !isPlaceholder(cfg.evaluationsKbn.apiKey)) {
      next.EVAL_KBN_API_KEY = cfg.evaluationsKbn.apiKey;
    }
  }

  maybeSetGcsCredentialsEnv(cfg, next);
  return next;
};

export const envFromExportProfile = (
  repoRoot: string,
  profile?: string,
  options?: { defaultTracingExporters?: boolean }
): Record<string, string> => {
  // Critical safety/ergonomics: don't implicitly use config.json as an export profile.
  // Export profile must be explicitly selected (e.g. `local`, `ci`, `config`).
  if (!profile) return {};

  const cfg = loadVaultConfig(repoRoot, profile);
  if (!cfg) return {};

  const next: Record<string, string> = {};

  // Score ingest targets EVAL_KBN_*, which otherwise only the datasets profile
  // sets. Without this an explicit `--export-profile <remote>` silently leaves
  // scores pointed at the default local Kibana, so a run reports success while
  // the intended export target receives nothing.
  if (cfg.evaluationsKbn) {
    if (isNonEmptyString(cfg.evaluationsKbn.url) && !isPlaceholder(cfg.evaluationsKbn.url)) {
      next.EVAL_KBN_URL = cfg.evaluationsKbn.url;
    }
    if (isNonEmptyString(cfg.evaluationsKbn.apiKey) && !isPlaceholder(cfg.evaluationsKbn.apiKey)) {
      next.EVAL_KBN_API_KEY = cfg.evaluationsKbn.apiKey;
    }
  }

  if (isNonEmptyString(cfg.tracingEs?.url) && !isPlaceholder(cfg.tracingEs.url)) {
    next.TRACING_ES_URL = cfg.tracingEs.url;
  }
  if (isNonEmptyString(cfg.tracingEs?.apiKey) && !isPlaceholder(cfg.tracingEs.apiKey)) {
    next.TRACING_ES_API_KEY = cfg.tracingEs.apiKey;
  }

  if (Array.isArray(cfg.tracingExporters) && cfg.tracingExporters.length > 0) {
    next.TRACING_EXPORTERS = JSON.stringify(cfg.tracingExporters);
  } else if (options?.defaultTracingExporters) {
    next.TRACING_EXPORTERS = JSON.stringify([{ http: { url: 'http://localhost:4318/v1/traces' } }]);
  }

  // Agent Builder runs its own tracer provider (see register_tracing.ts); its
  // spans are what trace-based evaluators query and they do NOT flow through
  // telemetry.tracing.exporters. Kept separate so the built-in local-ES
  // exporter stays intact and this only ADDS a remote destination.
  if (
    Array.isArray(cfg.agentBuilderTracingExporters) &&
    cfg.agentBuilderTracingExporters.length > 0
  ) {
    next.AGENT_BUILDER_TRACING_EXPORTERS = JSON.stringify(cfg.agentBuilderTracingExporters);
  }

  maybeSetGcsCredentialsEnv(cfg, next);
  return next;
};
