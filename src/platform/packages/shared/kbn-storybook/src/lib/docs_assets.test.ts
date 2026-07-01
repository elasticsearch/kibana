/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildDocsAssets,
  buildDocsArchive,
  buildDocsRegistry,
  createDocsManifest,
  createDocsRegistry,
  createInlineRegistryEntrySource,
  createInlineRegistryWebpackConfig,
} from './docs_assets';
import type { StorybookIndex } from './docs_assets';
import { EMBEDDABLE_STORYBOOK_TAG } from './embeddable';

const INLINE_BASE_URL = 'https://ci-artifacts.kibana.dev/storybooks/pr-1/storybook-docs';
const IFRAME_BASE_URL = 'https://ci-artifacts.kibana.dev/storybooks/pr-1';

const storybookIndex: StorybookIndex = {
  entries: {
    'components-button--regular': {
      title: 'Components/Button',
      name: 'Regular',
      type: 'story',
      importPath: './src/button.stories.tsx',
      componentPath: './src/button.tsx',
      tags: [EMBEDDABLE_STORYBOOK_TAG],
    },
    'components-button--docs': {
      title: 'Components/Button',
      name: 'Docs',
      type: 'docs',
      importPath: './src/button.mdx',
    },
    'components-input--custom': {
      id: 'components-input--custom',
      title: 'Components/Input',
      name: 'Custom',
      type: 'story',
      importPath: './src/input.stories.tsx',
    },
  },
};

describe('createDocsManifest', () => {
  it('keeps only embeddable story entries and maps storybook fields into docs manifest stories', () => {
    const manifest = createDocsManifest({
      alias: 'shared_ux',
      inlineBaseUrl: `${INLINE_BASE_URL}/`,
      iframeBaseUrl: `${IFRAME_BASE_URL}/`,
      index: storybookIndex,
    });

    expect(manifest).toEqual({
      schemaVersion: 1,
      producer: 'kibana-storybook-docs-manifest',
      alias: 'shared_ux',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      stories: [
        {
          alias: 'shared_ux',
          docsId: 'components-button--regular',
          storybookId: 'components-button--regular',
          title: 'Components/Button',
          name: 'Regular',
          importPath: './src/button.stories.tsx',
          componentPath: './src/button.tsx',
          tags: [EMBEDDABLE_STORYBOOK_TAG],
          type: 'story',
          renderMode: 'iframe',
          iframe: {
            url: `${IFRAME_BASE_URL}/shared_ux/iframe.html?id=components-button--regular&viewMode=story`,
          },
        },
      ],
    });
  });

  it('can include all story entries for local debugging', () => {
    const manifest = createDocsManifest({
      alias: 'shared_ux',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      index: storybookIndex,
      filter: {
        includeAllStories: true,
      },
    });

    expect(manifest.stories.map(({ storybookId }) => storybookId)).toEqual([
      'components-button--regular',
      'components-input--custom',
    ]);
  });

  it('encodes storybook IDs in iframe URLs rooted at the static site', () => {
    const manifest = createDocsManifest({
      alias: 'shared_ux',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      index: {
        entries: {
          'components/button--regular variant': {
            title: 'Components/Button',
            name: 'Regular variant',
            type: 'story',
            importPath: './src/button.stories.tsx',
            tags: [EMBEDDABLE_STORYBOOK_TAG],
          },
        },
      },
    });

    expect(manifest.stories[0].iframe.url).toBe(
      `${IFRAME_BASE_URL}/shared_ux/iframe.html?id=components%2Fbutton--regular%20variant&viewMode=story`
    );
  });

  it('roots inline entries at the docs subpath and bootstrap at the static site', () => {
    const manifest = createDocsManifest({
      alias: 'shared_ux',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      index: {
        entries: {
          'components-button--regular': {
            title: 'Components/Button',
            name: 'Regular',
            type: 'story',
            importPath: './src/button.stories.tsx',
            tags: [EMBEDDABLE_STORYBOOK_TAG],
          },
        },
      },
      renderMode: 'inline',
    });

    expect(manifest.stories[0]).toMatchObject({
      renderMode: 'inline',
      inline: {
        entry: `${INLINE_BASE_URL}/shared_ux/registry.js`,
        bundleId: 'shared_ux',
        bootstrap: {
          publicPath: `${IFRAME_BASE_URL}/shared_ux/`,
          scripts: [
            `${IFRAME_BASE_URL}/shared_ux/kbn-ui-shared-deps-npm.dll.js`,
            `${IFRAME_BASE_URL}/shared_ux/kbn-ui-shared-deps-src.js`,
          ],
          styles: [
            `${IFRAME_BASE_URL}/shared_ux/kbn-ui-shared-deps-src.css`,
            'https://fonts.googleapis.com/css2?family=Inter:wght@300..700&family=Roboto+Mono:ital,wght@0,400..700;1,400..700&display=swap',
          ],
        },
      },
    });
  });

  it('uses docs metadata for stable docs IDs and default heights', () => {
    const manifest = createDocsManifest({
      alias: 'shared_ux',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      index: storybookIndex,
      docsMetadata: {
        'components-button--regular': {
          id: 'button-regular',
          height: 240,
        },
      },
    });

    expect(manifest.stories[0]).toMatchObject({
      docsId: 'button-regular',
      storybookId: 'components-button--regular',
      height: 240,
      iframe: {
        url: `${IFRAME_BASE_URL}/shared_ux/iframe.html?id=components-button--regular&viewMode=story`,
      },
    });
    expect(manifest.stories).toHaveLength(1);
  });

  it('fails on duplicate docs IDs within an alias', () => {
    expect(() =>
      createDocsManifest({
        alias: 'shared_ux',
        inlineBaseUrl: INLINE_BASE_URL,
        iframeBaseUrl: IFRAME_BASE_URL,
        index: storybookIndex,
        docsMetadata: {
          'components-button--regular': {
            id: 'duplicate',
          },
          'components-input--custom': {
            id: 'duplicate',
          },
        },
        filter: {
          includeAllStories: true,
        },
      })
    ).toThrowError('Duplicate Storybook docs ID [duplicate] in alias [shared_ux]');
  });
});

describe('buildDocsAssets', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kbn-storybook-docs-assets-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reads Storybook index.json and writes the docs manifest into the docs output tree', async () => {
    const docsOutputDir = join(tempDir, 'docs-output');
    await mkdir(tempDir, { recursive: true });
    await writeFile(join(tempDir, 'index.json'), JSON.stringify(storybookIndex), 'utf8');

    const manifest = await buildDocsAssets({
      alias: 'shared_ux',
      storybookDir: tempDir,
      docsOutputDir,
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      docsMetadata: {
        'components-button--regular': {
          id: 'button-regular',
          height: 240,
        },
      },
    });
    const manifestJson = await readFile(join(docsOutputDir, 'shared_ux', 'manifest.json'), 'utf8');

    expect(JSON.parse(manifestJson)).toEqual(manifest);
    expect(manifest.stories.map(({ docsId }) => docsId)).toEqual(['button-regular']);
    expect(manifest.stories[0].height).toBe(240);
  });

  it('writes a generated registry entry source for inline assets', async () => {
    const docsOutputDir = join(tempDir, 'docs-output');
    await mkdir(tempDir, { recursive: true });
    await writeFile(join(tempDir, 'index.json'), JSON.stringify(storybookIndex), 'utf8');

    const manifest = await buildDocsAssets({
      alias: 'shared_ux',
      storybookDir: tempDir,
      docsOutputDir,
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      renderMode: 'inline',
      configDir: join(tempDir, '.storybook'),
    });
    const registryEntrySource = await readFile(
      join(docsOutputDir, 'shared_ux', 'registry_entry.js'),
      'utf8'
    );

    expect(manifest.stories.every(({ renderMode }) => renderMode === 'inline')).toBe(true);
    expect(registryEntrySource).toContain(
      `import * as previewAnnotations from "${join(tempDir, '.storybook', 'preview')}";`
    );
    expect(registryEntrySource).toContain(
      `"components-button--regular": () => import("${join(
        process.cwd(),
        'src/button.stories.tsx'
      )}"),`
    );
    expect(registryEntrySource).not.toContain(
      `"components-input--custom": () => import("${join(process.cwd(), 'src/input.stories.tsx')}"),`
    );
  });

  it('requires preview annotations when writing inline assets', async () => {
    const docsOutputDir = join(tempDir, 'docs-output');
    await mkdir(tempDir, { recursive: true });
    await writeFile(join(tempDir, 'index.json'), JSON.stringify(storybookIndex), 'utf8');

    await expect(
      buildDocsAssets({
        alias: 'shared_ux',
        storybookDir: tempDir,
        docsOutputDir,
        inlineBaseUrl: INLINE_BASE_URL,
        iframeBaseUrl: IFRAME_BASE_URL,
        renderMode: 'inline',
      })
    ).rejects.toThrowError(
      'Inline Storybook docs assets require previewAnnotationsImportPath or configDir.'
    );
  });

  it('skips inline source generation when no stories are embeddable', async () => {
    const docsOutputDir = join(tempDir, 'docs-output');
    await mkdir(tempDir, { recursive: true });
    await writeFile(
      join(tempDir, 'index.json'),
      JSON.stringify({
        entries: {
          'components-input--custom': storybookIndex.entries['components-input--custom'],
        },
      }),
      'utf8'
    );

    const manifest = await buildDocsAssets({
      alias: 'shared_ux',
      storybookDir: tempDir,
      docsOutputDir,
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      renderMode: 'inline',
    });

    expect(manifest.stories).toEqual([]);
    await expect(
      readFile(join(docsOutputDir, 'shared_ux', 'registry_entry.js'), 'utf8')
    ).rejects.toThrow();
  });
});

describe('createInlineRegistryEntrySource', () => {
  it('generates the dynamic story-import map and delegates to the embed runtime', () => {
    const source = createInlineRegistryEntrySource({
      alias: 'shared_ux',
      index: storybookIndex,
      previewAnnotationsImportPath: '../.storybook/preview',
    });

    expect(source).toContain('import * as previewAnnotations from "../.storybook/preview";');
    expect(source).toContain('import { createDocsRegistry } from "');
    expect(source).toContain('embed_runtime');
    expect(source).toContain(
      '"components-button--regular": () => import("./src/button.stories.tsx"),'
    );
    expect(source).not.toContain(
      '"components-input--custom": () => import("./src/input.stories.tsx"),'
    );
    expect(source).toContain(
      'export const { mountStory, unmountStory, getStoryParameters } = createDocsRegistry({'
    );
    expect(source).toContain('alias: "shared_ux",');
    expect(source).toContain('projectAnnotations: previewAnnotations,');
    expect(source).not.toContain('() => import("./src/button.mdx")');
  });
});

describe('createInlineRegistryWebpackConfig', () => {
  it('targets an ESM docs registry bundle with lazy chunks beside it', () => {
    const config = createInlineRegistryWebpackConfig({
      entryPath: '/storybook-docs/shared_ux/registry_entry.js',
      docsDir: '/storybook-docs/shared_ux',
    });

    expect(config.entry).toEqual({
      registry: '/storybook-docs/shared_ux/registry_entry.js',
    });
    expect(config.output).toMatchObject({
      path: '/storybook-docs/shared_ux',
      filename: 'registry.js',
      chunkFilename: '[name].[contenthash].registry.js',
      publicPath: 'auto',
      module: true,
      library: {
        type: 'module',
      },
    });
    expect(config.experiments).toMatchObject({
      outputModule: true,
    });
  });
});

describe('createDocsRegistry', () => {
  it('aggregates manifests into namespaced story records', () => {
    const sharedUxManifest = createDocsManifest({
      alias: 'shared_ux',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      index: storybookIndex,
    });
    const observabilityManifest = createDocsManifest({
      alias: 'observability',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      index: {
        entries: {
          'components-button--regular': {
            title: 'Components/Button',
            name: 'Regular',
            type: 'story',
            importPath: './src/observability_button.stories.tsx',
            tags: [EMBEDDABLE_STORYBOOK_TAG],
          },
        },
      },
    });

    const registry = createDocsRegistry({
      baseUrl: `${INLINE_BASE_URL}/`,
      build: {
        commit: 'abc123',
        branch: 'main',
        buildUrl: 'https://buildkite.example/builds/1',
      },
      manifests: [sharedUxManifest, observabilityManifest],
    });

    expect(registry.schemaVersion).toBe(1);
    expect(registry.producer).toBe('kibana-storybook');
    expect(registry.baseUrl).toBe(INLINE_BASE_URL);
    expect(registry.build).toEqual({
      commit: 'abc123',
      branch: 'main',
      buildUrl: 'https://buildkite.example/builds/1',
    });
    expect(Object.keys(registry.stories)).toEqual([
      'kibana:shared_ux:components-button--regular',
      'kibana:observability:components-button--regular',
    ]);
    expect(registry.stories['kibana:shared_ux:components-button--regular'].importPath).toBe(
      './src/button.stories.tsx'
    );
    expect(registry.stories['kibana:observability:components-button--regular'].importPath).toBe(
      './src/observability_button.stories.tsx'
    );
  });

  it('fails on duplicate docs IDs within an alias', () => {
    const manifest = createDocsManifest({
      alias: 'shared_ux',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      index: storybookIndex,
    });

    expect(() =>
      createDocsRegistry({
        baseUrl: INLINE_BASE_URL,
        build: {
          commit: 'abc123',
          branch: 'main',
        },
        manifests: [manifest, manifest],
      })
    ).toThrowError('Duplicate Storybook docs ID [kibana:shared_ux:components-button--regular]');
  });
});

describe('buildDocsRegistry', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kbn-storybook-docs-registry-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reads alias manifests, writes the root docs registry, and reports integrity', async () => {
    const sharedUxDir = join(tempDir, 'shared_ux');
    const observabilityDir = join(tempDir, 'observability');
    const sharedUxManifest = createDocsManifest({
      alias: 'shared_ux',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      index: storybookIndex,
    });
    const observabilityManifest = createDocsManifest({
      alias: 'observability',
      inlineBaseUrl: INLINE_BASE_URL,
      iframeBaseUrl: IFRAME_BASE_URL,
      index: {
        entries: {
          'app-alerts--severity': {
            title: 'App/Alerts',
            name: 'Severity',
            type: 'story',
            importPath: './src/alert_severity_badge.stories.tsx',
            tags: [EMBEDDABLE_STORYBOOK_TAG],
          },
        },
      },
    });

    await mkdir(sharedUxDir, { recursive: true });
    await mkdir(observabilityDir, { recursive: true });
    await writeFile(join(sharedUxDir, 'manifest.json'), JSON.stringify(sharedUxManifest), 'utf8');
    await writeFile(
      join(observabilityDir, 'manifest.json'),
      JSON.stringify(observabilityManifest),
      'utf8'
    );

    const result = await buildDocsRegistry({
      aliases: ['shared_ux', 'observability'],
      docsRootDir: tempDir,
      baseUrl: INLINE_BASE_URL,
      build: {
        commit: 'abc123',
        branch: 'main',
      },
    });
    const registryPath = join(tempDir, 'docs_registry.json');
    const registryJson = await readFile(registryPath, 'utf8');
    const registryStats = await stat(registryPath);

    expect(JSON.parse(registryJson)).toEqual(result.registry);
    expect(Object.keys(result.registry.stories)).toEqual([
      'kibana:shared_ux:components-button--regular',
      'kibana:observability:app-alerts--severity',
    ]);
    expect(result.outputPath).toBe(registryPath);
    expect(result.size).toBe(registryStats.size);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.integrity).toBe(`sha256-${result.sha256}`);
  });
});

describe('buildDocsArchive', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kbn-storybook-docs-archive-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes a tarball containing the root registry and selected alias docs assets', async () => {
    const sharedUxDir = join(tempDir, 'shared_ux');
    const archivePath = join(tempDir, 'storybook-docs-test.tar.gz');

    await mkdir(sharedUxDir, { recursive: true });
    await writeFile(join(tempDir, 'docs_registry.json'), '{}\n', 'utf8');
    await writeFile(join(sharedUxDir, 'registry.js'), 'export {};\n', 'utf8');

    const archive = await buildDocsArchive({
      aliases: ['shared_ux'],
      docsRootDir: tempDir,
      outputPath: archivePath,
    });

    const archiveStats = await stat(archivePath);

    expect(archiveStats.isFile()).toBe(true);
    expect(archiveStats.size).toBeGreaterThan(0);
    expect(archive).toEqual({
      integrity: `sha256-${archive.sha256}`,
      outputPath: archivePath,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      size: archiveStats.size,
    });
  });
});
