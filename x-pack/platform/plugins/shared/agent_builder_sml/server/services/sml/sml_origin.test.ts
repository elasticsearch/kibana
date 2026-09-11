/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getSmlOriginId } from './sml_origin';

const docWithOriginUri = (uri: string) => ({
  attributes: {
    id: 'entry-1',
    origin: { uri },
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ingestion_method: 'crawled' as const,
  },
});

describe('getSmlOriginId', () => {
  it('returns the part after the type scheme', () => {
    expect(getSmlOriginId(docWithOriginUri('dashboard://dash-1'))).toBe('dash-1');
  });

  it('keeps an origin id that itself contains the separator', () => {
    expect(getSmlOriginId(docWithOriginUri('workflow://https://example.com/wf'))).toBe(
      'https://example.com/wf'
    );
  });

  it('keeps an origin id containing colons and slashes', () => {
    expect(getSmlOriginId(docWithOriginUri('esql://my-query:v2/step1'))).toBe('my-query:v2/step1');
  });

  it('returns an empty string for a uri without a scheme', () => {
    expect(getSmlOriginId(docWithOriginUri('dash-1'))).toBe('');
  });

  it('returns an empty string for a uri with a scheme but no id', () => {
    expect(getSmlOriginId(docWithOriginUri('dashboard://'))).toBe('');
  });

  // `sml_service` falls back to `uri: ''` when a hit has no `attributes.origin.uri`.
  it('returns an empty string for an empty uri', () => {
    expect(getSmlOriginId(docWithOriginUri(''))).toBe('');
  });
});
