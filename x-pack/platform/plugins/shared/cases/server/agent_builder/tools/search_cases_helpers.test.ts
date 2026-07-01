/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, httpServerMock } from '@kbn/core/server/mocks';
import { getCaseUrl, deduplicateCases } from './search_cases_helpers';
import { CaseStatuses } from '../../../common/types/domain';
import type { RelatedCase } from '../../../common/types/domain';

// ---------------------------------------------------------------------------
// getCaseUrl
// ---------------------------------------------------------------------------

describe('getCaseUrl', () => {
  const buildCoreStart = (publicBaseUrl?: string) => {
    const core = coreMock.createStart();
    if (publicBaseUrl) {
      // @ts-ignore — force for test path
      core.http.basePath.publicBaseUrl = publicBaseUrl;
    } else {
      // @ts-ignore — force undefined for the no-publicBaseUrl test path
      core.http.basePath.publicBaseUrl = undefined;
    }
    // @ts-ignore — force for test path
    core.http.basePath.serverBasePath = '';
    return core;
  };

  it('uses getCaseViewPath when publicBaseUrl is set', () => {
    const core = buildCoreStart('https://kibana.example.com');
    const request = httpServerMock.createKibanaRequest();
    const url = getCaseUrl(request, core, 'default', 'case-1', 'securitySolution');
    expect(url).toContain('kibana.example.com');
    expect(url).toContain('case-1');
  });

  it('falls back to header-derived URL when publicBaseUrl is absent', () => {
    const core = buildCoreStart();
    const request = httpServerMock.createKibanaRequest({
      headers: { host: 'localhost:5601', 'x-forwarded-proto': 'https' },
    });
    const url = getCaseUrl(request, core, 'default', 'case-1', 'securitySolution');
    expect(url).toMatch(/^https:\/\/localhost:5601/);
    expect(url).toContain('case-1');
  });

  it('defaults protocol to http when x-forwarded-proto header is absent', () => {
    const core = buildCoreStart();
    const request = httpServerMock.createKibanaRequest({
      headers: { host: 'localhost:5601' },
    });
    const url = getCaseUrl(request, core, 'default', 'case-1', 'securitySolution');
    expect(url).toMatch(/^http:\/\//);
  });
});

// ---------------------------------------------------------------------------
// deduplicateCases
// ---------------------------------------------------------------------------

describe('deduplicateCases', () => {
  const rel = (id: string): RelatedCase => ({
    id,
    title: `Case ${id}`,
    description: 'test description',
    status: CaseStatuses.open,
    createdAt: '2026-01-01',
    totals: { alerts: 0, events: 0, userComments: 0 },
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateCases([])).toEqual([]);
  });

  it('deduplicates cases with the same ID across multiple arrays', () => {
    const result = deduplicateCases([
      [rel('a'), rel('b')],
      [rel('b'), rel('c')],
    ]);
    const ids = result.map((r) => r.id);
    expect(ids).toHaveLength(3);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
  });

  it('preserves the first occurrence when IDs collide', () => {
    const first = { ...rel('a'), title: 'First' };
    const second = { ...rel('a'), title: 'Second' };
    const result = deduplicateCases([[first], [second]]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('First');
  });
});
