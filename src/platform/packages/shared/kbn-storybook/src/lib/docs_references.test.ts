/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { extractStorybookDocsReferences, validateStorybookDocsReferences } from './docs_references';
import type { StorybookDocsRegistry } from './docs_assets';

describe('extractStorybookDocsReferences', () => {
  it('extracts IDs from indented storybook directives', () => {
    const references = extractStorybookDocsReferences({
      file: 'guide.md',
      markdown: [
        ':id: outside-block',
        '  ::::{storybook}',
        '  :id: kibana:shared_ux:button-regular',
        '  :height: 240',
        '  ::::',
        '',
        ':::{storybook}',
        ':id: kibana:observability:alert-severity',
        ':::',
      ].join('\n'),
    });

    expect(references).toEqual([
      {
        file: 'guide.md',
        id: 'kibana:shared_ux:button-regular',
        line: 3,
      },
      {
        file: 'guide.md',
        id: 'kibana:observability:alert-severity',
        line: 8,
      },
    ]);
  });
});

describe('validateStorybookDocsReferences', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kbn-storybook-docs-references-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reports storybook directive IDs missing from the registry', async () => {
    const docsRoot = join(tempDir, 'docs');
    const nestedDocsRoot = join(docsRoot, 'nested');
    const registryPath = join(tempDir, 'docs_registry.json');
    const registry: StorybookDocsRegistry = {
      schemaVersion: 1,
      producer: 'kibana-storybook',
      baseUrl: 'https://ci-artifacts.kibana.dev/storybooks/pr-1',
      build: {
        commit: 'abc123',
        branch: 'main',
      },
      stories: {
        'kibana:shared_ux:button-regular': {
          alias: 'shared_ux',
          docsId: 'button-regular',
          storybookId: 'components-button--regular',
          title: 'Components/Button',
          name: 'Regular',
          importPath: './src/button.stories.tsx',
          type: 'story',
          renderMode: 'iframe',
          iframe: {
            url: 'https://ci-artifacts.kibana.dev/storybooks/pr-1/shared_ux/iframe.html?id=components-button--regular&viewMode=story',
          },
        },
      },
    };

    await mkdir(nestedDocsRoot, { recursive: true });
    await writeFile(registryPath, JSON.stringify(registry), 'utf8');
    await writeFile(
      join(docsRoot, 'guide.md'),
      [':::{storybook}', ':id: kibana:shared_ux:button-regular', ':::'].join('\n'),
      'utf8'
    );
    await writeFile(
      join(nestedDocsRoot, 'missing.md'),
      [':::{storybook}', ':id: kibana:shared_ux:missing', ':::'].join('\n'),
      'utf8'
    );
    await writeFile(
      join(nestedDocsRoot, 'ignored.txt'),
      [':::{storybook}', ':id: kibana:shared_ux:ignored', ':::'].join('\n'),
      'utf8'
    );

    const result = await validateStorybookDocsReferences({ docsRoot, registryPath });

    expect(result.references.map(({ id }) => id).sort()).toEqual([
      'kibana:shared_ux:button-regular',
      'kibana:shared_ux:missing',
    ]);
    expect(result.missing).toEqual([
      {
        file: join(nestedDocsRoot, 'missing.md'),
        id: 'kibana:shared_ux:missing',
        line: 2,
      },
    ]);
  });
});
