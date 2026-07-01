/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { Template } from '@kbn/workflows-library';

import { LibraryFetcher } from './library_fetcher';
import { LibraryService } from './library_service';
import type { WorkflowsManagementConfig } from '../config';

jest.mock('./library_fetcher');

const MockedLibraryFetcher = LibraryFetcher as jest.MockedClass<typeof LibraryFetcher>;

const baseRow: Template = {
  slug: 'placeholder',
  version: '1.0.0',
  availability: '>=9.5.0',
  name: 'placeholder',
  description: 'placeholder',
  categories: ['utility'],
  definitionUrl: 'templates/placeholder/1.0.0.yaml',
  contentHash: `sha256:${'0'.repeat(64)}`,
  stepTypes: [],
  triggerTypes: [],
};

const row = (overrides: Partial<Template>): Template => ({ ...baseRow, ...overrides });

const buildService = (templates: Template[]) => {
  MockedLibraryFetcher.mockImplementation(
    () =>
      ({
        listTemplates: jest.fn().mockResolvedValue(templates),
        getTemplate: jest.fn(),
        getHealth: jest.fn(),
      } as unknown as LibraryFetcher)
  );

  return new LibraryService({
    config: {
      library: { ttlMs: 60_000 },
    } as unknown as WorkflowsManagementConfig,
    logger: loggerMock.create(),
    kibanaVersion: '9.5.0',
    isServerless: false,
  });
};

describe('LibraryService.listTemplates filtering', () => {
  it('returns every template when no filters are passed', async () => {
    const service = buildService([row({ slug: 'a' }), row({ slug: 'b' })]);

    const result = await service.listTemplates();

    expect(result.map((t) => t.slug)).toEqual(['a', 'b']);
  });

  it('includes solution-scoped rows and cross-solution rows when filtering by solution', async () => {
    const service = buildService([
      row({ slug: 'sec', solutions: ['security'] }),
      row({ slug: 'obs', solutions: ['observability'] }),
      row({ slug: 'shared', solutions: undefined }),
      row({ slug: 'shared-empty', solutions: [] }),
    ]);

    const result = await service.listTemplates({ solution: 'security' });

    expect(result.map((t) => t.slug).sort()).toEqual(['sec', 'shared', 'shared-empty']);
  });

  it('filters by category', async () => {
    const service = buildService([
      row({ slug: 'a', categories: ['enrichment'] }),
      row({ slug: 'b', categories: ['response'] }),
    ]);

    const result = await service.listTemplates({ category: 'enrichment' });

    expect(result.map((t) => t.slug)).toEqual(['a']);
  });

  it('search is case-insensitive across name + description + categories', async () => {
    const service = buildService([
      row({ slug: 'alpha', name: 'Alpha thing', description: 'noop', categories: ['utility'] }),
      row({
        slug: 'beta',
        name: 'Beta',
        description: 'About SLACK',
        categories: ['notification'],
      }),
    ]);

    expect((await service.listTemplates({ search: 'slack' })).map((t) => t.slug)).toEqual(['beta']);
    expect((await service.listTemplates({ search: 'NOTIF' })).map((t) => t.slug)).toEqual(['beta']);
    expect((await service.listTemplates({ search: 'alpha' })).map((t) => t.slug)).toEqual([
      'alpha',
    ]);
  });

  it('combines multiple filters with AND semantics', async () => {
    const service = buildService([
      row({ slug: 'a', solutions: ['security'], categories: ['enrichment'] }),
      row({ slug: 'b', solutions: ['security'], categories: ['response'] }),
      row({ slug: 'c', solutions: ['observability'], categories: ['enrichment'] }),
    ]);

    const result = await service.listTemplates({
      solution: 'security',
      category: 'enrichment',
    });

    expect(result.map((t) => t.slug)).toEqual(['a']);
  });
});
