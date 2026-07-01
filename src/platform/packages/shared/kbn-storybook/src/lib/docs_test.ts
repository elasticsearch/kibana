/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { execFileSync } from 'child_process';
import { createReadStream, statSync } from 'fs';
import { createServer, type ServerResponse } from 'http';
import { extname, join, resolve, sep } from 'path';
import { buildDocsArchive, buildDocsAssets, buildDocsRegistry } from './docs_assets';
import type { BuildDocsArchiveResult, StorybookDocsManifest } from './docs_assets';
import { buildStorybook } from './run_storybook_cli';
import { ASSET_DIR, DOCS_ASSET_DIR } from './constants';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

interface StorybookDocsTestLog {
  info(message: string): void;
}

export interface RunStorybookDocsTestServerOptions {
  alias: string;
  configDir: string;
  port: number;
  baseUrl: string;
  skipStorybookBuild?: boolean;
  includeAllStories?: boolean;
  log: StorybookDocsTestLog;
}

export interface BuildStorybookDocsArtifactsOptions {
  alias: string;
  configDir: string;
  baseUrl: string;
  skipStorybookBuild?: boolean;
  includeAllStories?: boolean;
  writeArchive?: boolean;
  log: StorybookDocsTestLog;
}

export interface BuildStorybookDocsArtifactsResult {
  archive?: BuildDocsArchiveResult;
  assetDir: string;
  registryUrl: string;
  manifest: StorybookDocsManifest;
}

const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const getGitValue = (args: string[]): string => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
};

const sendNotFound = (response: ServerResponse) => {
  response.writeHead(404, corsHeaders({ 'Content-Type': 'text/plain; charset=utf-8' }));
  response.end('Not found');
};

const corsHeaders = (headers: Record<string, string> = {}) => ({
  ...headers,
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Origin': '*',
});

const isSubPath = (root: string, filePath: string): boolean =>
  filePath === root || filePath.startsWith(`${root}${sep}`);

const serveDirectory = async ({
  directory,
  port,
  registryUrl,
  log,
}: {
  directory: string;
  port: number;
  registryUrl: string;
  log: StorybookDocsTestLog;
}): Promise<void> => {
  const root = resolve(directory);

  await new Promise<void>((resolvePromise, reject) => {
    const server = createServer((request, response) => {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, corsHeaders());
        response.end();
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, corsHeaders({ Allow: 'GET, HEAD, OPTIONS' }));
        response.end();
        return;
      }

      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      } catch {
        sendNotFound(response);
        return;
      }
      const requestedPath = resolve(root, pathname.replace(/^\/+/, ''));

      if (!isSubPath(root, requestedPath)) {
        sendNotFound(response);
        return;
      }

      let filePath = requestedPath;

      try {
        const stats = statSync(filePath);
        if (stats.isDirectory()) {
          filePath = join(filePath, 'index.html');
        }
      } catch {
        sendNotFound(response);
        return;
      }

      try {
        const stats = statSync(filePath);
        if (!stats.isFile()) {
          sendNotFound(response);
          return;
        }

        response.writeHead(
          200,
          corsHeaders({
            'Content-Length': String(stats.size),
            'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
          })
        );

        if (request.method === 'HEAD') {
          response.end();
          return;
        }

        createReadStream(filePath).pipe(response);
      } catch {
        sendNotFound(response);
      }
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      log.info(`Serving Storybook docs assets at http://127.0.0.1:${port}`);
      log.info(`Registry URL: ${registryUrl}`);
    });

    const shutdown = () => {
      server.close(() => resolvePromise());
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
};

export const buildStorybookDocsArtifacts = async ({
  alias,
  configDir,
  baseUrl,
  skipStorybookBuild,
  includeAllStories,
  writeArchive = true,
  log,
}: BuildStorybookDocsArtifactsOptions): Promise<BuildStorybookDocsArtifactsResult> => {
  const storybookDir = join(ASSET_DIR, alias);
  const root = trimTrailingSlash(baseUrl);
  // The static Storybook site (shared deps + iframe fallback) and the docs assets are served from
  // sibling subpaths so their URL contracts stay independent.
  const iframeBaseUrl = `${root}/storybook`;
  const inlineBaseUrl = `${root}/storybook-docs`;
  const registryUrl = `${inlineBaseUrl}/docs_registry.json`;

  if (!skipStorybookBuild) {
    log.info(`Building static Storybook for [${alias}]`);
    process.env.STORYBOOK_BASE_URL = iframeBaseUrl;
    await buildStorybook({ configDir, name: alias, site: true });
  }

  log.info(`Generating inline Storybook docs assets for [${alias}]`);
  const manifest = await buildDocsAssets({
    alias,
    storybookDir,
    docsOutputDir: DOCS_ASSET_DIR,
    inlineBaseUrl,
    iframeBaseUrl,
    renderMode: 'inline',
    configDir,
    buildInlineBundle: true,
    filter: {
      includeAllStories,
    },
  });

  await buildDocsRegistry({
    aliases: [alias],
    docsRootDir: DOCS_ASSET_DIR,
    baseUrl: inlineBaseUrl,
    build: {
      commit: getGitValue(['rev-parse', 'HEAD']),
      branch: getGitValue(['branch', '--show-current']),
    },
  });
  let archive: BuildDocsArchiveResult | undefined;

  if (writeArchive) {
    const archivePath = resolve(
      DOCS_ASSET_DIR,
      '..',
      `storybook-docs-${alias}-${getGitValue(['rev-parse', '--short', 'HEAD'])}.tar.gz`
    );

    archive = await buildDocsArchive({
      aliases: manifest.stories.length > 0 ? [alias] : [],
      docsRootDir: DOCS_ASSET_DIR,
      outputPath: archivePath,
    });
  }

  return {
    archive,
    assetDir: resolve(DOCS_ASSET_DIR),
    registryUrl,
    manifest,
  };
};

export const runStorybookDocsTestServer = async ({
  alias,
  configDir,
  port,
  baseUrl,
  skipStorybookBuild,
  includeAllStories,
  log,
}: RunStorybookDocsTestServerOptions): Promise<void> => {
  const { archive, registryUrl, manifest } = await buildStorybookDocsArtifacts({
    alias,
    configDir,
    baseUrl,
    skipStorybookBuild,
    includeAllStories,
    log,
  });

  log.info(`Docs-builder docset.yml snippet:
storybook:
  registry: ${registryUrl}`);
  if (archive) {
    log.info(`Docs archive: ${archive.outputPath}`);
    log.info(`Docs archive integrity: ${archive.integrity}`);
    log.info(`Storybook sources manifest snippet:
sources:
  kibana:
    registry: ${registryUrl}
    integrity: ${archive.integrity}`);
  }
  log.info(`Markdown smoke test:
:::{storybook}
:id: kibana:${alias}:${manifest.stories[0]?.docsId ?? '<docsId>'}
:::`);

  await serveDirectory({ directory: resolve(ASSET_DIR, '..'), port, registryUrl, log });
};
