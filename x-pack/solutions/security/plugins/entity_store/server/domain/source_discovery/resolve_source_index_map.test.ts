/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IndicesResolveIndexResponse } from '@elastic/elasticsearch/lib/api/types';
import { buildConcreteIndexToSourceNameMap } from './resolve_source_index_map';

const asResolveResponse = (partial: {
  indices?: Array<{ name: string }>;
  aliases?: Array<{ name: string; indices: string | string[] }>;
  data_streams?: Array<{ name: string; backing_indices: string | string[] }>;
}): IndicesResolveIndexResponse =>
  ({
    indices: partial.indices ?? [],
    aliases: partial.aliases ?? [],
    data_streams: partial.data_streams ?? [],
  } as unknown as IndicesResolveIndexResponse);

describe('buildConcreteIndexToSourceNameMap', () => {
  it('maps every backing index of a data stream to the data stream name', () => {
    const map = buildConcreteIndexToSourceNameMap(
      asResolveResponse({
        data_streams: [
          {
            name: 'logs-okta.system-default',
            backing_indices: [
              '.ds-logs-okta.system-default-2024.01.01-000001',
              '.ds-logs-okta.system-default-2024.02.01-000002',
            ],
          },
        ],
      })
    );

    expect(map.get('.ds-logs-okta.system-default-2024.01.01-000001')).toBe(
      'logs-okta.system-default'
    );
    expect(map.get('.ds-logs-okta.system-default-2024.02.01-000002')).toBe(
      'logs-okta.system-default'
    );
  });

  it('maps alias member indices to the alias name', () => {
    const map = buildConcreteIndexToSourceNameMap(
      asResolveResponse({
        aliases: [
          {
            name: '.alerts-security.alerts-default',
            indices: ['.internal.alerts-security.alerts-default-000001'],
          },
        ],
      })
    );

    expect(map.get('.internal.alerts-security.alerts-default-000001')).toBe(
      '.alerts-security.alerts-default'
    );
  });

  it('maps standalone (classic) indices to themselves', () => {
    const map = buildConcreteIndexToSourceNameMap(
      asResolveResponse({ indices: [{ name: 'logs-classic-index' }] })
    );

    expect(map.get('logs-classic-index')).toBe('logs-classic-index');
  });

  it('prefers the data stream name when an index is reachable as data stream, alias, and standalone', () => {
    const map = buildConcreteIndexToSourceNameMap(
      asResolveResponse({
        indices: [{ name: 'dup-index' }],
        aliases: [{ name: 'my-alias', indices: ['dup-index'] }],
        data_streams: [{ name: 'logs-ds', backing_indices: ['dup-index'] }],
      })
    );

    expect(map.get('dup-index')).toBe('logs-ds');
  });

  it('accepts the ES `Indices` shape given as a single string', () => {
    const map = buildConcreteIndexToSourceNameMap(
      asResolveResponse({
        aliases: [{ name: 'an-alias', indices: 'single-alias-member' }],
        data_streams: [{ name: 'logs-ds', backing_indices: 'single-backing-index' }],
      })
    );

    expect(map.get('single-alias-member')).toBe('an-alias');
    expect(map.get('single-backing-index')).toBe('logs-ds');
  });

  it('returns an empty map when nothing resolves', () => {
    expect(buildConcreteIndexToSourceNameMap(asResolveResponse({})).size).toBe(0);
  });
});
