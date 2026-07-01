/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { TemplateBody, TemplatesCatalog } from '@kbn/workflows-library';

export interface LibraryHealth {
  sourceMode: 'http';
  lastRefreshAt?: string;
  lastError?: { message: string; at: string };
}

/**
 * Owned in-memory state for the Workflow Template Library — the catalog,
 * its resolved per-Kibana-version directory id, lazily-loaded template
 * bodies, and the bookkeeping the fetcher reads to decide whether to
 * refresh and what to surface on `/library/health`.
 *
 * Deliberately no HTTP, no orchestration, no single-flight. Those concerns
 * live in {@link LibraryFetcher}, which owns this cache and mutates it
 * through the narrow setter surface below.
 *
 * `setCatalog` is the only mutation that does more than assign a field: it
 * also drops the slug-keyed body map, because a fresh catalog can re-point
 * a slug at a different `definitionUrl`.
 */
export class LibraryCache {
  public catalog?: TemplatesCatalog;
  public versionId?: string;
  private readonly bodies = new Map<string, TemplateBody>();
  private lastRefreshAt?: Date;
  private lastError?: { message: string; at: Date };

  constructor(private readonly ttlMs: number) {}

  isFresh(): boolean {
    if (!this.catalog || !this.lastRefreshAt) return false;
    return Date.now() - this.lastRefreshAt.getTime() < this.ttlMs;
  }

  setCatalog(catalog: TemplatesCatalog): void {
    this.catalog = catalog;
    this.bodies.clear();
  }

  setVersionId(id: string): void {
    this.versionId = id;
  }

  getBody(slug: string): TemplateBody | undefined {
    return this.bodies.get(slug);
  }

  setBody(slug: string, body: TemplateBody): void {
    this.bodies.set(slug, body);
  }

  markRefreshSuccess(): void {
    this.lastRefreshAt = new Date();
    this.lastError = undefined;
  }

  markRefreshFailure(err: unknown): void {
    this.lastError = {
      message: err instanceof Error ? err.message : String(err),
      at: new Date(),
    };
  }

  getHealth(): LibraryHealth {
    return {
      sourceMode: 'http',
      lastRefreshAt: this.lastRefreshAt?.toISOString(),
      lastError: this.lastError
        ? { message: this.lastError.message, at: this.lastError.at.toISOString() }
        : undefined,
    };
  }
}
