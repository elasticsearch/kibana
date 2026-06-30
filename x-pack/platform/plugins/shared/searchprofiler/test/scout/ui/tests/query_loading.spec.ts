/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout/ui';
import { test, testData } from '../fixtures';

const INDEX_NAME = 'test';
const PRECONFIGURED_QUERY = JSON.stringify(
  {
    query: {
      bool: {
        must: [{ match_all: {} }],
      },
    },
  },
  null,
  2
);
const PERSISTED_INDEX_NAME = 'persisted-search-profiler-index';
const PERSISTED_QUERY = JSON.stringify(
  {
    query: {
      match: {
        message: 'persisted profiler query',
      },
    },
  },
  null,
  2
);

test.describe('Search Profiler query loading', { tag: testData.SEARCH_PROFILER_TAGS }, () => {
  test.beforeEach(async ({ browserAuth }) => {
    await browserAuth.loginAsSearchProfilerUser();
  });

  test('loads index and query from URL parameters', async ({ pageObjects }) => {
    await pageObjects.searchProfiler.goto({
      index: INDEX_NAME,
      loadFrom: PRECONFIGURED_QUERY,
    });

    await expect(pageObjects.searchProfiler.indexInput).toHaveValue(INDEX_NAME);
    await expect.poll(() => pageObjects.searchProfiler.getQuery()).toBe(PRECONFIGURED_QUERY);
  });

  test('restores index and query after navigating away and back', async ({ pageObjects }) => {
    await pageObjects.searchProfiler.goto();

    await pageObjects.searchProfiler.setIndex(PERSISTED_INDEX_NAME);
    await pageObjects.searchProfiler.setQuery(PERSISTED_QUERY);

    await expect(pageObjects.searchProfiler.indexInput).toHaveValue(PERSISTED_INDEX_NAME);
    await expect.poll(() => pageObjects.searchProfiler.getQuery()).toBe(PERSISTED_QUERY);

    await pageObjects.searchProfiler.gotoConsole();
    await pageObjects.searchProfiler.goto();

    await expect(pageObjects.searchProfiler.indexInput).toHaveValue(PERSISTED_INDEX_NAME);
    await expect.poll(() => pageObjects.searchProfiler.getQuery()).toBe(PERSISTED_QUERY);
  });
});
