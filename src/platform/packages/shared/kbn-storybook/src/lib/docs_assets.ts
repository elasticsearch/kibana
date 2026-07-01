/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createHash } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import archiver from 'archiver';
import webpack from 'webpack';
import type { Configuration, StatsError } from 'webpack';
import { default as WebpackConfig } from '../webpack.config';
import { EMBEDDABLE_STORYBOOK_TAG } from './embeddable';

export interface StorybookIndexEntry {
  id?: string;
  title: string;
  name: string;
  type: string;
  importPath: string;
  exportName?: string;
  componentPath?: string;
  tags?: string[];
}

export interface StorybookIndex {
  entries: Record<string, StorybookIndexEntry>;
}

export interface StorybookDocsBootstrap {
  publicPath: string;
  scripts: string[];
  styles: string[];
}

export interface StorybookDocsManifestStory {
  alias: string;
  docsId: string;
  storybookId: string;
  title: string;
  name: string;
  importPath: string;
  componentPath?: string;
  tags?: string[];
  height?: number;
  type: 'story';
  renderMode: 'inline' | 'iframe';
  inline?: {
    entry: string;
    bundleId: string;
    bootstrap: StorybookDocsBootstrap;
  };
  iframe: {
    url: string;
  };
}

export interface StorybookDocsManifest {
  schemaVersion: 1;
  producer: 'kibana-storybook-docs-manifest';
  alias: string;
  inlineBaseUrl: string;
  iframeBaseUrl: string;
  stories: StorybookDocsManifestStory[];
}

export interface StorybookDocsRegistry {
  schemaVersion: 1;
  producer: 'kibana-storybook';
  baseUrl: string;
  build: {
    commit: string;
    branch: string;
    buildUrl?: string;
  };
  stories: Record<`kibana:${string}:${string}`, StorybookDocsManifestStory>;
}

export interface StorybookDocsBundleParameters {
  id?: string;
  height?: number;
}

export type StorybookDocsMetadata = Record<string, StorybookDocsBundleParameters>;

export interface StorybookDocsFilterOptions {
  includeAllStories?: boolean;
  includeTags?: string[];
}

export interface BuildDocsAssetsOptions {
  alias: string;
  storybookDir: string;
  docsOutputDir: string;
  inlineBaseUrl: string;
  iframeBaseUrl: string;
  renderMode?: StorybookDocsManifestStory['renderMode'];
  previewAnnotationsImportPath?: string;
  configDir?: string;
  buildInlineBundle?: boolean;
  docsMetadata?: StorybookDocsMetadata;
  filter?: StorybookDocsFilterOptions;
}

export interface BuildDocsRegistryOptions {
  aliases: string[];
  docsRootDir: string;
  baseUrl: string;
  build: StorybookDocsRegistry['build'];
}

export interface BuildDocsRegistryResult {
  registry: StorybookDocsRegistry;
  integrity: `sha256-${string}`;
  outputPath: string;
  sha256: string;
  size: number;
}

export interface BuildDocsArchiveOptions {
  aliases: string[];
  docsRootDir: string;
  outputPath: string;
}

export interface BuildDocsArchiveResult {
  integrity: `sha256-${string}`;
  outputPath: string;
  sha256: string;
  size: number;
}

export interface CreateInlineRegistryWebpackConfigOptions {
  entryPath: string;
  docsDir: string;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const joinUrl = (...parts: string[]): string =>
  parts
    .filter(Boolean)
    .map((part, index) => {
      if (index === 0) {
        return trimTrailingSlash(part);
      }
      return part.replace(/^\/+|\/+$/g, '');
    })
    .join('/');

const createIframeUrl = (aliasBaseUrl: string, storybookId: string): string =>
  `${joinUrl(aliasBaseUrl, 'iframe.html')}?id=${encodeURIComponent(storybookId)}&viewMode=story`;

const createBootstrap = (aliasBaseUrl: string): StorybookDocsBootstrap => ({
  publicPath: `${trimTrailingSlash(aliasBaseUrl)}/`,
  scripts: [
    joinUrl(aliasBaseUrl, 'kbn-ui-shared-deps-npm.dll.js'),
    joinUrl(aliasBaseUrl, 'kbn-ui-shared-deps-src.js'),
  ],
  styles: [
    joinUrl(aliasBaseUrl, 'kbn-ui-shared-deps-src.css'),
    'https://fonts.googleapis.com/css2?family=Inter:wght@300..700&family=Roboto+Mono:ital,wght@0,400..700;1,400..700&display=swap',
  ],
});

const stringify = (value: string): string => JSON.stringify(value);

const shouldIncludeStory = (
  entry: StorybookIndexEntry,
  {
    includeAllStories = false,
    includeTags = [EMBEDDABLE_STORYBOOK_TAG],
  }: StorybookDocsFilterOptions
): boolean => {
  if (entry.type !== 'story') {
    return false;
  }

  if (includeAllStories) {
    return true;
  }

  return includeTags.some((tag) => entry.tags?.includes(tag));
};

const getStoryEntries = (
  index: StorybookIndex,
  filter: StorybookDocsFilterOptions = {}
): Array<[string, StorybookIndexEntry]> =>
  Object.entries(index.entries).filter(([, entry]) => shouldIncludeStory(entry, filter));

export const createInlineRegistryEntrySource = ({
  alias,
  index,
  previewAnnotationsImportPath,
  storyImportRoot,
  filter,
}: {
  alias: string;
  index: StorybookIndex;
  previewAnnotationsImportPath: string;
  storyImportRoot?: string;
  filter?: StorybookDocsFilterOptions;
}): string => {
  const storyLoaders = getStoryEntries(index, filter)
    .map(([entryId, entry]) => {
      const storybookId = entry.id ?? entryId;
      const importPath =
        storyImportRoot?.startsWith('/') && entry.importPath.startsWith('.')
          ? resolve(storyImportRoot, entry.importPath)
          : entry.importPath;
      return `  ${stringify(storybookId)}: () => import(${stringify(importPath)}),`;
    })
    .join('\n');
  const runtimeImportPath = resolve(__dirname, 'embed_runtime');

  return `import * as previewAnnotations from ${stringify(previewAnnotationsImportPath)};
import { createDocsRegistry } from ${stringify(runtimeImportPath)};

const storyModules = {
${storyLoaders}
};

export const { mountStory, unmountStory, getStoryParameters } = createDocsRegistry({
  alias: ${stringify(alias)},
  storyModules,
  projectAnnotations: previewAnnotations,
});
`;
};

export const createInlineRegistryWebpackConfig = ({
  entryPath,
  docsDir,
}: CreateInlineRegistryWebpackConfigOptions): Configuration =>
  WebpackConfig({
    config: {
      mode: 'production',
      target: 'web',
      entry: {
        registry: resolve(entryPath),
      },
      output: {
        path: resolve(docsDir),
        filename: 'registry.js',
        chunkFilename: '[name].[contenthash].registry.js',
        publicPath: 'auto',
        module: true,
        library: {
          type: 'module',
        },
      },
      experiments: {
        outputModule: true,
      },
      externalsType: 'var',
      devtool: 'source-map',
      module: {
        rules: [
          {
            test: /\.(js|jsx|ts|tsx|mjs)$/,
            exclude: /node_modules/,
            use: {
              loader: require.resolve('babel-loader'),
              options: {
                presets: [
                  require.resolve('@kbn/babel-preset/common_preset'),
                  [
                    require.resolve('@emotion/babel-preset-css-prop'),
                    {
                      autoLabel: 'always',
                      labelFormat: '[filename]--[local]',
                    },
                  ],
                ],
              },
            },
          },
          {
            test: /\.css$/,
            use: ['style-loader', 'css-loader'],
          },
          {
            test: /\.mdx?$/,
            type: 'asset/source',
          },
          {
            test: /\.(woff|woff2|ttf|eot|svg|ico|png|jpg|gif|jpeg|webp)(\?|$)/,
            type: 'asset/resource',
            generator: {
              filename: 'assets/[name].[contenthash][ext]',
            },
          },
          {
            test: /\.scss$/,
            exclude: /\.module.(s(a|c)ss)$/,
            use: [
              { loader: 'style-loader' },
              { loader: 'css-loader', options: { importLoaders: 2 } },
              {
                loader: 'postcss-loader',
                options: {
                  postcssOptions: {
                    config: require.resolve('@kbn/optimizer/postcss.config'),
                  },
                },
              },
              {
                loader: 'sass-loader',
                options: {
                  additionalData: (content: string): string => {
                    const globalsPath = stringify(
                      resolve(
                        __dirname,
                        '../../../../../../core/public/styles/core_app/_globals_borealislight.scss'
                      )
                    );
                    return `@import ${globalsPath};\n${content}`;
                  },
                  implementation: require('sass-embedded'),
                  sassOptions: {
                    includePaths: [resolve(__dirname, '../../../../../../../node_modules')],
                    quietDeps: true,
                    silenceDeprecations: ['import', 'legacy-js-api'],
                  },
                },
              },
            ],
          },
        ],
      },
      plugins: [
        new webpack.DefinePlugin({
          'process.env.NODE_ENV': JSON.stringify('production'),
        }),
      ],
      resolve: {
        extensions: ['.js', '.mjs', '.ts', '.tsx', '.json', '.mdx'],
      },
      optimization: {
        runtimeChunk: false,
      },
      stats: 'errors-only',
    },
  });

const formatWebpackError = (error: StatsError): string => {
  if (error.message) {
    return error.message;
  }

  return JSON.stringify(error);
};

export const buildInlineRegistryBundle = async ({
  entryPath,
  docsDir,
}: CreateInlineRegistryWebpackConfigOptions): Promise<void> => {
  const config = createInlineRegistryWebpackConfig({ entryPath, docsDir });

  await new Promise<void>((resolvePromise, reject) => {
    const compiler = webpack(config);

    compiler.run((runError, stats) => {
      compiler.close((closeError) => {
        if (runError) {
          reject(runError);
          return;
        }

        if (closeError) {
          reject(closeError);
          return;
        }

        const errors = stats?.toJson({ errors: true }).errors ?? [];

        if (errors.length) {
          reject(new Error(errors.map(formatWebpackError).join('\n\n')));
          return;
        }

        resolvePromise();
      });
    });
  });
};

export const createDocsManifest = ({
  alias,
  inlineBaseUrl,
  iframeBaseUrl,
  index,
  renderMode = 'iframe',
  docsMetadata = {},
  filter,
}: {
  alias: string;
  inlineBaseUrl: string;
  iframeBaseUrl: string;
  index: StorybookIndex;
  renderMode?: StorybookDocsManifestStory['renderMode'];
  docsMetadata?: StorybookDocsMetadata;
  filter?: StorybookDocsFilterOptions;
}): StorybookDocsManifest => {
  const aliasInlineBaseUrl = joinUrl(inlineBaseUrl, alias);
  const aliasIframeBaseUrl = joinUrl(iframeBaseUrl, alias);
  const inlineEntry = joinUrl(aliasInlineBaseUrl, 'registry.js');
  // Shared deps and the iframe fallback are served from the Storybook static site, not the docs subpath.
  const bootstrap = createBootstrap(aliasIframeBaseUrl);
  const docsIds = new Set<string>();

  const stories = getStoryEntries(index, filter).map(([entryId, entry]) => {
    const storybookId = entry.id ?? entryId;
    const metadata = docsMetadata[storybookId];
    const docsId = metadata?.id ?? storybookId;

    if (docsIds.has(docsId)) {
      throw new Error(`Duplicate Storybook docs ID [${docsId}] in alias [${alias}]`);
    }

    docsIds.add(docsId);

    return {
      alias,
      docsId,
      storybookId,
      title: entry.title,
      name: entry.name,
      importPath: entry.importPath,
      ...(entry.componentPath ? { componentPath: entry.componentPath } : {}),
      ...(entry.tags ? { tags: entry.tags } : {}),
      ...(typeof metadata?.height === 'number' ? { height: metadata.height } : {}),
      type: 'story' as const,
      renderMode,
      ...(renderMode === 'inline'
        ? {
            inline: {
              entry: inlineEntry,
              bundleId: alias,
              bootstrap,
            },
          }
        : {}),
      iframe: {
        url: createIframeUrl(aliasIframeBaseUrl, storybookId),
      },
    };
  });

  return {
    schemaVersion: 1,
    producer: 'kibana-storybook-docs-manifest',
    alias,
    inlineBaseUrl: trimTrailingSlash(inlineBaseUrl),
    iframeBaseUrl: trimTrailingSlash(iframeBaseUrl),
    stories,
  };
};

export const buildDocsAssets = async ({
  alias,
  storybookDir,
  docsOutputDir,
  inlineBaseUrl,
  iframeBaseUrl,
  renderMode,
  previewAnnotationsImportPath,
  configDir,
  buildInlineBundle,
  docsMetadata,
  filter,
}: BuildDocsAssetsOptions): Promise<StorybookDocsManifest> => {
  const indexPath = join(storybookDir, 'index.json');
  const docsDir = join(docsOutputDir, alias);
  const manifestPath = join(docsDir, 'manifest.json');
  const registryEntryPath = join(docsDir, 'registry_entry.js');
  const index = JSON.parse(await readFile(indexPath, 'utf8')) as StorybookIndex;
  const manifest = createDocsManifest({
    alias,
    inlineBaseUrl,
    iframeBaseUrl,
    index,
    renderMode,
    docsMetadata,
    filter,
  });

  await mkdir(docsDir, { recursive: true });

  if (renderMode === 'inline' && manifest.stories.length > 0) {
    const resolvedPreviewAnnotationsImportPath =
      previewAnnotationsImportPath ?? (configDir ? resolve(configDir, 'preview') : undefined);

    if (!resolvedPreviewAnnotationsImportPath) {
      throw new Error(
        'Inline Storybook docs assets require previewAnnotationsImportPath or configDir.'
      );
    }

    await writeFile(
      registryEntryPath,
      createInlineRegistryEntrySource({
        alias,
        index,
        previewAnnotationsImportPath: resolvedPreviewAnnotationsImportPath,
        storyImportRoot: process.cwd(),
        filter,
      }),
      'utf8'
    );

    if (buildInlineBundle) {
      await buildInlineRegistryBundle({ entryPath: registryEntryPath, docsDir });
    }
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return manifest;
};

export const createDocsRegistry = ({
  baseUrl,
  build,
  manifests,
}: {
  baseUrl: string;
  build: StorybookDocsRegistry['build'];
  manifests: StorybookDocsManifest[];
}): StorybookDocsRegistry => {
  const stories: StorybookDocsRegistry['stories'] = {};

  manifests.forEach((manifest) => {
    manifest.stories.forEach((story) => {
      const registryId = `kibana:${manifest.alias}:${story.docsId}` as const;

      if (stories[registryId]) {
        throw new Error(`Duplicate Storybook docs ID [${registryId}]`);
      }

      stories[registryId] = story;
    });
  });

  return {
    schemaVersion: 1,
    producer: 'kibana-storybook',
    baseUrl: trimTrailingSlash(baseUrl),
    build,
    stories,
  };
};

const hashFile = async (filePath: string): Promise<{ sha256: string; size: number }> => {
  const stats = await stat(filePath);

  if (!stats.isFile() || stats.size === 0) {
    throw new Error(`Expected a non-empty file at [${filePath}]`);
  }

  const sha256 = await new Promise<string>((resolvePromise, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolvePromise(hash.digest('hex')));
  });

  return { sha256, size: stats.size };
};

export const buildDocsRegistry = async ({
  aliases,
  docsRootDir,
  baseUrl,
  build,
}: BuildDocsRegistryOptions): Promise<BuildDocsRegistryResult> => {
  const manifests = await Promise.all(
    aliases.map(async (alias) => {
      const manifestPath = join(docsRootDir, alias, 'manifest.json');
      return JSON.parse(await readFile(manifestPath, 'utf8')) as StorybookDocsManifest;
    })
  );
  const registry = createDocsRegistry({ baseUrl, build, manifests });
  const outputPath = join(docsRootDir, 'docs_registry.json');

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

  const { sha256, size } = await hashFile(outputPath);

  return {
    registry,
    integrity: `sha256-${sha256}`,
    outputPath,
    sha256,
    size,
  };
};

export const buildDocsArchive = async ({
  aliases,
  docsRootDir,
  outputPath,
}: BuildDocsArchiveOptions): Promise<BuildDocsArchiveResult> => {
  await mkdir(dirname(outputPath), { recursive: true });

  await new Promise<void>((resolvePromise, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: {
        level: 9,
      },
    });

    output.on('close', resolvePromise);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.file(join(docsRootDir, 'docs_registry.json'), { name: 'docs_registry.json' });

    aliases.forEach((alias) => {
      archive.directory(join(docsRootDir, alias), alias);
    });

    archive.finalize().catch(reject);
  });

  const { sha256, size } = await hashFile(outputPath);

  return {
    integrity: `sha256-${sha256}`,
    outputPath,
    sha256,
    size,
  };
};
