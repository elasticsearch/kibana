/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { readFile, stat } from 'fs/promises';
import path from 'path';
import type { Logger } from '@kbn/core/server';
import type {
  KibanaVersionsManifest,
  Template,
  TemplateBody,
  TemplatesCatalog,
} from '@kbn/workflows-library';
import {
  KibanaVersionsManifestConsumptionSchema,
  parseTemplateYaml,
  TemplateParseError,
  TemplatesCatalogConsumptionSchema,
} from '@kbn/workflows-library';
import { ZodError } from '@kbn/zod/v4';

import { LibraryFetchError, LibraryNotFoundError } from './errors';
import { LibraryCache, type LibraryHealth } from './library_cache';
import type { LibrarySource } from './library_source';
import { resolveVersionId } from './resolve_version_id';

const VERSIONS_FILE = 'kibana-versions.json';

export interface LibraryBundleReaderDeps {
  /**
   * Filesystem path to an extracted catalog bundle (the air-gap tarball). The
   * bundle mirrors the CDN `/v1` tree, so `bundlePath` is the local equivalent
   * of `registryUrl`. It may point either at that root directory (the one
   * holding `kibana-versions.json`) or at its parent containing a single `v1/`
   * directory, which is what extracting the release tarball produces.
   */
  bundlePath: string;
  /** Resolved runtime Kibana semver, used to select the per-version catalog. */
  kibanaVersion: string;
  /** Whether this is a serverless deployment (always resolves to `main`). */
  isServerless: boolean;
  logger: Logger;
}

/**
 * Local bundle source mode for the Workflow Template Library (air-gapped
 * deployments). Reads the catalog and template bodies from an extracted
 * tarball on the Kibana host's filesystem instead of the CDN.
 *
 * The bundle is a faithful mirror of the CDN `/v1` tree, so this reader is a
 * file-backed twin of {@link LibraryFetcher}: it resolves the per-version
 * directory through the same {@link resolveVersionId} helper and resolves each
 * row's `definitionUrl` against the same root. The only differences are the
 * transport (`readFile` instead of HTTP) and the absence of TTL/ETag/retry/SWR
 * — the bundle is immutable for the process lifetime (operators replace the
 * directory and restart Kibana), so the catalog is read once and cached.
 *
 * Validation reuses the same consumption schemas + YAML parser as the HTTP
 * path, so parsed shapes and forward-compatibility behavior are identical.
 */
export class LibraryBundleReader implements LibrarySource {
  private readonly cache = new LibraryCache(Number.POSITIVE_INFINITY, 'bundle');
  private root?: string;
  private loaded = false;
  private loading?: Promise<void>;

  constructor(private readonly deps: LibraryBundleReaderDeps) {}

  async listTemplates(): Promise<Template[]> {
    const catalog = await this.getCatalog();
    return catalog.templates;
  }

  async getTemplate(slug: string): Promise<TemplateBody> {
    const catalog = await this.getCatalog();
    const row = catalog.templates.find((t) => t.slug === slug);
    if (!row) {
      throw new LibraryNotFoundError(slug);
    }
    const cached = this.cache.getBody(slug);
    if (cached) return cached;
    const body = await this.readTemplateBody(row.definitionUrl);
    this.cache.setBody(slug, body);
    return body;
  }

  getHealth(): LibraryHealth {
    return this.cache.getHealth();
  }

  private async getCatalog(): Promise<TemplatesCatalog> {
    await this.ensureLoaded();
    if (!this.cache.catalog) {
      // Defensive: ensureLoaded either populated the catalog or threw.
      throw new LibraryFetchError(
        'Workflow Template Library bundle catalog could not be loaded.',
        'unavailable'
      );
    }
    return this.cache.catalog;
  }

  private ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = this.load().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  private async load(): Promise<void> {
    try {
      const root = await this.resolveRoot();
      const manifest = await this.readManifest(root);
      const versionId = resolveVersionId(this.deps.kibanaVersion, this.deps.isServerless, manifest);
      const catalog = await this.readCatalog(root, versionId);
      this.root = root;
      this.cache.setVersionId(versionId);
      this.cache.setCatalog(catalog);
      this.cache.markRefreshSuccess();
      this.loaded = true;
    } catch (err) {
      this.cache.markRefreshFailure(err);
      this.deps.logger.warn(
        `Workflows library bundle load failed: ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
  }

  /**
   * Resolves the catalog root — the directory holding `kibana-versions.json`,
   * the local equivalent of the `/v1` registry root. Accepts either a path
   * that is the root itself or its parent containing a single `v1/` directory
   * (the natural result of extracting `tar -C dist v1`).
   */
  private async resolveRoot(): Promise<string> {
    const { bundlePath } = this.deps;
    if (await fileExists(path.join(bundlePath, VERSIONS_FILE))) {
      return bundlePath;
    }
    const nested = path.join(bundlePath, 'v1');
    if (await fileExists(path.join(nested, VERSIONS_FILE))) {
      return nested;
    }
    throw new LibraryFetchError(
      `No Workflow Template Library bundle found under bundlePath "${bundlePath}". ` +
        `Expected "${VERSIONS_FILE}" directly under the path or inside a "v1/" directory.`,
      'unavailable',
      bundlePath
    );
  }

  private async readManifest(root: string): Promise<KibanaVersionsManifest> {
    const file = path.join(root, VERSIONS_FILE);
    return this.readJson(file, (json) =>
      // Loosened consumption schema: tolerate unknown fields from a newer bundle.
      KibanaVersionsManifestConsumptionSchema.parse(json)
    );
  }

  private async readCatalog(root: string, versionId: string): Promise<TemplatesCatalog> {
    const file = path.join(root, versionId, 'catalogs', 'templates.json');
    return this.readJson(file, (json) =>
      // Loosened consumption schema: tolerate unknown fields from a newer bundle.
      TemplatesCatalogConsumptionSchema.parse(json)
    );
  }

  private async readTemplateBody(definitionUrl: string): Promise<TemplateBody> {
    const root = this.root;
    if (!root) {
      // Defensive: bodies are only read after a successful catalog load.
      throw new LibraryFetchError('Workflow Template Library bundle is not loaded.', 'unavailable');
    }
    const file = this.resolveBodyPath(root, definitionUrl);
    const text = await this.readFileOrThrow(file);
    try {
      const { metadata, body, raw } = parseTemplateYaml(text);
      return { metadata, body, raw };
    } catch (err) {
      if (err instanceof TemplateParseError) {
        throw new LibraryFetchError(
          `Failed to parse template body at ${file}: ${err.message}`,
          'malformed',
          file,
          undefined,
          err
        );
      }
      throw err;
    }
  }

  /**
   * Resolves a catalog `definitionUrl` (relative to the bundle root, exactly as
   * on the CDN) against the bundle, rejecting any path that escapes the root.
   */
  private resolveBodyPath(root: string, definitionUrl: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(resolvedRoot, definitionUrl);
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
      throw new LibraryFetchError(
        `Template definitionUrl "${definitionUrl}" escapes the bundle directory.`,
        'malformed',
        resolved
      );
    }
    return resolved;
  }

  private async readJson<T>(file: string, parse: (json: unknown) => T): Promise<T> {
    const text = await this.readFileOrThrow(file);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new LibraryFetchError(
        `Bundle file at ${file} was not valid JSON.`,
        'malformed',
        file,
        undefined,
        err
      );
    }
    try {
      return parse(json);
    } catch (err) {
      throw new LibraryFetchError(
        `Bundle file at ${file} failed schema validation${
          err instanceof ZodError ? `: ${formatZodIssues(err)}` : '.'
        }`,
        'malformed',
        file,
        undefined,
        err
      );
    }
  }

  private async readFileOrThrow(file: string): Promise<string> {
    try {
      return await readFile(file, 'utf8');
    } catch (err) {
      throw new LibraryFetchError(
        `Could not read ${file} from the Workflow Template Library bundle: ${
          err instanceof Error ? err.message : String(err)
        }`,
        'unavailable',
        file,
        undefined,
        err
      );
    }
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    const stats = await stat(file);
    return stats.isFile();
  } catch {
    return false;
  }
}

function formatZodIssues(err: ZodError): string {
  return err.issues
    .map((issue) => {
      const issuePath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${issuePath}: ${issue.message}`;
    })
    .join('; ');
}
