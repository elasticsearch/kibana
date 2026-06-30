/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import nodePath from 'path';
import { Jsonc } from '@kbn/repo-packages';
import { REPO_ROOT } from '@kbn/repo-info';

import { getCodeOwnersForFile, getPathsWithOwnersReversed } from '../lib/code_owners.ts';
import { cruiseExternalDeps } from '../dependency_graph/providers/cruiser.ts';
import { buildRenovateMatcher, type RenovateMatch } from './renovate.ts';
import type { PathWithOwners } from '../lib/code_owners.ts';

// ---------------------------------------------------------------------------
// kibana.jsonc reader
// ---------------------------------------------------------------------------

interface KibanaJsonc {
  id?: string;
  type?: string;
  group?: string;
  visibility?: string;
}

/**
 * Read and parse the kibana.jsonc manifest for a package path.
 * Returns null if the file is absent or unparseable.
 */
function readKibanaJsonc(packagePath: string): KibanaJsonc | null {
  const filePath = nodePath.join(REPO_ROOT, packagePath, 'kibana.jsonc');
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, 'utf8');
    return Jsonc.parse(raw) as KibanaJsonc;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Package discovery
// ---------------------------------------------------------------------------

/**
 * Recursively discover all package paths under a search path.
 *
 * A directory is a package if it contains a `kibana.jsonc` — return it directly.
 * Otherwise it is a grouping directory (e.g. x-pack/platform/packages/shared/security)
 * — recurse into its children until actual packages are found.
 *
 * `maxDepth` limits how many grouping levels we'll traverse (default 3) to
 * avoid accidentally walking deep trees that don't follow the expected structure.
 */
export function discoverPackages(searchPath: string, maxDepth: number = 3): string[] {
  function walk(relPath: string, depth: number): string[] {
    const abs = nodePath.join(REPO_ROOT, relPath);
    if (!existsSync(abs)) return [];
    if (existsSync(nodePath.join(abs, 'kibana.jsonc'))) return [relPath];
    if (depth >= maxDepth) return [];
    return readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .flatMap((e) => walk(`${relPath}/${e.name}`, depth + 1));
  }
  return walk(searchPath, 0);
}

// ---------------------------------------------------------------------------
// Shared context (loaded once, reused across all search paths in a run)
// ---------------------------------------------------------------------------

export interface SharedContext {
  snapshotId: string;
  timestamp: string;
  reversedCodeowners: PathWithOwners[];
  matchRenovate: (dep: string) => RenovateMatch;
  declaredVersions: Map<string, string>;
  excludedDepPatterns: string[];
}

export function buildSharedContext(
  snapshotId: string,
  excludedDepPatterns: string[] = DEFAULT_EXCLUDED_DEPS
): SharedContext {
  const pkgPath = nodePath.join(REPO_ROOT, 'package.json');
  let declaredVersions = new Map<string, string>();
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    declaredVersions = new Map(Object.entries(all));
  } catch {
    // missing package.json — versions stay empty
  }

  return {
    snapshotId,
    timestamp: new Date(snapshotId).toISOString(),
    reversedCodeowners: getPathsWithOwnersReversed(),
    matchRenovate: buildRenovateMatcher(),
    declaredVersions,
    excludedDepPatterns,
  };
}

// ---------------------------------------------------------------------------
// Doc building
// ---------------------------------------------------------------------------

const TEST_PATH_PATTERNS = [
  /\.test\.(ts|tsx)$/,
  /\.mock\.(ts|tsx)$/,
  /\.stories\.(ts|tsx)$/,
  /__fixtures__\//,
  /__mocks__\//,
  /\/test\//,
  /\/tests\//,
  /\.spec\.(ts|tsx)$/,
];

function isTestFile(filePath: string): boolean {
  return TEST_PATH_PATTERNS.some((p) => p.test(filePath));
}

/**
 * Default deps to drop at index time. Conventions:
 *   - trailing `/` → namespace prefix (e.g. "@elastic/" drops "@elastic/eui", "@elastic/ebt")
 *   - no `/`      → exact match     (e.g. "react" drops "react" but keeps "react-redux")
 *
 * `@elastic/` and `@kbn/` are our internal namespaces; `react` and `react-dom`
 * are the React core that every Kibana plugin transitively depends on (third-party
 * React-ecosystem packages like react-redux, react-router-dom, @testing-library/react
 * are intentionally still indexed).
 */
export const DEFAULT_EXCLUDED_DEPS = [
  '@elastic/',
  '@kbn/',
  '@testing-library/',
  'react',
  'react-dom',
];

export function isExcludedDep(dep: string, patterns: string[]): boolean {
  return patterns.some((p) => (p.endsWith('/') ? dep.startsWith(p) : dep === p));
}

export interface DepUsageDoc {
  '@timestamp': string;
  snapshot_id: string;
  /** Package path relative to repo root */
  'package.path': string;
  /** Package id from kibana.jsonc, e.g. @kbn/security-solution-plugin */
  'package.name': string;
  /** Type from kibana.jsonc: plugin | shared-common | shared-browser | shared-server | … */
  'package.type': string | null;
  /** Group from kibana.jsonc: platform | security | observability | search | … */
  'package.group': string | null;
  /** Visibility from kibana.jsonc: private | shared */
  'package.visibility': string | null;
  code_owners: string[];
  'dependency.name': string;
  'dependency.declared_version': string | null;
  'dependent.file_count': number;
  'dependent.test_file_count': number;
  'dependent.prod_file_count': number;
  'dependent.files': string[];
  'renovate.team': string | null;
  'renovate.group': string | null;
  'renovate.orphan': boolean;
}

/**
 * Run cruise() on a single package directory and emit one doc per external
 * dependency it imports. Reads kibana.jsonc once for package metadata.
 */
export async function buildDocsForPackage(
  pkgPath: string,
  ctx: SharedContext
): Promise<DepUsageDoc[]> {
  const abs = nodePath.join(REPO_ROOT, pkgPath);
  if (!existsSync(abs)) return [];

  const result = await cruiseExternalDeps([pkgPath]);
  if (typeof result.output === 'string') {
    throw new Error('Unexpected string output from cruise');
  }

  const manifest = readKibanaJsonc(pkgPath);
  const codeOwners = getCodeOwnersForFile(pkgPath, ctx.reversedCodeowners);
  const docs: DepUsageDoc[] = [];

  for (const mod of result.output.modules) {
    if (typeof mod.source !== 'string' || !mod.source.startsWith('node_modules/')) continue;

    const depName = mod.source.replace(/^node_modules\//, '');
    if (isExcludedDep(depName, ctx.excludedDepPatterns)) continue;

    const dependents = [...new Set((mod.dependents ?? []) as string[])].sort();
    if (dependents.length === 0) continue;

    const testFiles = dependents.filter(isTestFile);
    const renovate = ctx.matchRenovate(depName);

    docs.push({
      '@timestamp': ctx.timestamp,
      snapshot_id: ctx.snapshotId,
      'package.path': pkgPath,
      'package.name': manifest?.id ?? pkgPath.split('/').pop() ?? pkgPath,
      'package.type': manifest?.type ?? null,
      'package.group': manifest?.group ?? null,
      'package.visibility': manifest?.visibility ?? null,
      code_owners: codeOwners,
      'dependency.name': depName,
      'dependency.declared_version': ctx.declaredVersions.get(depName) ?? null,
      'dependent.file_count': dependents.length,
      'dependent.test_file_count': testFiles.length,
      'dependent.prod_file_count': dependents.length - testFiles.length,
      'dependent.files': dependents,
      'renovate.team': renovate.team,
      'renovate.group': renovate.group,
      'renovate.orphan': renovate.orphan,
    });
  }

  return docs;
}

// ---------------------------------------------------------------------------
// Elasticsearch helpers
// ---------------------------------------------------------------------------

export interface IndexerOptions {
  snapshotId: string;
  dryRun: boolean;
  esUrl: string;
  apiKey: string | null;
  indexName: string;
}

const MAPPINGS_PROPERTIES = {
  '@timestamp': { type: 'date' },
  snapshot_id: { type: 'keyword' },
  package: {
    properties: {
      path: { type: 'keyword' },
      name: { type: 'keyword' },
      type: { type: 'keyword' },
      group: { type: 'keyword' },
      visibility: { type: 'keyword' },
    },
  },
  code_owners: { type: 'keyword' },
  dependency: {
    properties: {
      name: { type: 'keyword' },
      declared_version: { type: 'keyword' },
    },
  },
  dependent: {
    properties: {
      file_count: { type: 'integer' },
      test_file_count: { type: 'integer' },
      prod_file_count: { type: 'integer' },
      files: { type: 'keyword' },
    },
  },
  renovate: {
    properties: {
      team: { type: 'keyword' },
      group: { type: 'keyword' },
      orphan: { type: 'boolean' },
    },
  },
};

export const INDEX_NAME = 'kibana-dependency-usage';
export const TRANSFORM_INDEX_NAME = 'latest-kibana-dependency-usage';

/** ES index template — PUT once with --setup-template.
 *  Shard/replica settings are intentionally omitted so the template works on
 *  both stateful and serverless clusters (serverless manages those itself). */
export const INDEX_TEMPLATE = {
  index_patterns: [`${INDEX_NAME}*`],
  priority: 100,
  template: { mappings: { properties: MAPPINGS_PROPERTIES } },
};

/** Index template for the transform destination index. */
export const TRANSFORM_INDEX_TEMPLATE = {
  index_patterns: [TRANSFORM_INDEX_NAME],
  priority: 100,
  template: { mappings: { properties: MAPPINGS_PROPERTIES } },
};

/** Transform that keeps the latest snapshot doc per (package.name, dependency.name). */
export const TRANSFORM_DEFINITION = {
  source: { index: [`${INDEX_NAME}*`] },
  dest: { index: TRANSFORM_INDEX_NAME },
  latest: {
    sort: '@timestamp',
    unique_key: ['package.name', 'dependency.name'],
  },
  sync: { time: { field: '@timestamp' } },
};

function buildHeaders(opts: IndexerOptions): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers.Authorization = `ApiKey ${opts.apiKey}`;
  return headers;
}

function buildBulkBody(docs: DepUsageDoc[]): string {
  return (
    docs
      .flatMap((doc) => [
        JSON.stringify({
          index: {
            _id: `${doc.snapshot_id}::${doc['package.path']}::${doc['dependency.name']}`,
          },
        }),
        JSON.stringify(doc),
      ])
      .join('\n') + '\n'
  );
}

async function putJson(url: string, body: unknown, opts: IndexerOptions): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: buildHeaders(opts),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`PUT ${url} failed (${res.status}): ${await res.text()}`);
  }
}

export async function ensureIndexTemplate(opts: IndexerOptions): Promise<void> {
  await putJson(
    `${opts.esUrl}/_index_template/kibana-dependency-usage-template`,
    INDEX_TEMPLATE,
    opts
  );
  await putJson(
    `${opts.esUrl}/_index_template/kibana-dependency-usage-transform-template`,
    TRANSFORM_INDEX_TEMPLATE,
    opts
  );
  // Transform creation is not idempotent — skip if it already exists.
  const checkRes = await fetch(`${opts.esUrl}/_transform/${TRANSFORM_INDEX_NAME}`, {
    headers: buildHeaders(opts),
  });
  if (checkRes.status === 404) {
    await putJson(`${opts.esUrl}/_transform/${TRANSFORM_INDEX_NAME}`, TRANSFORM_DEFINITION, opts);
    const startRes = await fetch(`${opts.esUrl}/_transform/${TRANSFORM_INDEX_NAME}/_start`, {
      method: 'POST',
      headers: buildHeaders(opts),
    });
    if (!startRes.ok) {
      throw new Error(`Failed to start transform (${startRes.status}): ${await startRes.text()}`);
    }
  }
}

export async function indexDocs(docs: DepUsageDoc[], opts: IndexerOptions): Promise<void> {
  if (docs.length === 0) return;

  if (opts.dryRun) {
    process.stdout.write(buildBulkBody(docs));
    return;
  }

  const url = `${opts.esUrl}/${opts.indexName}/_bulk`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...buildHeaders(opts), 'Content-Type': 'application/x-ndjson' },
    body: buildBulkBody(docs),
  });

  if (!res.ok) {
    throw new Error(`Bulk index failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { errors: boolean; items: unknown[] };
  if (json.errors) {
    const failed = (json.items as Array<{ index?: { error?: unknown } }>)
      .filter((i) => i.index?.error)
      .map((i) => i.index?.error);
    throw new Error(`Bulk index had errors:\n${JSON.stringify(failed, null, 2)}`);
  }
}
