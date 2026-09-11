/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  encodeCursor,
  decodeCursor,
  InvalidCursorError,
  type ReportCursorPayload,
} from './report_cursor';

const basePayload: ReportCursorPayload = {
  version: 2,
  pitId: 'pit-abc',
  sort: 'relevance',
  sortValues: [0.87, 42],
};

describe('report_cursor', () => {
  it('returns a round-tripped cursor payload', () => {
    expect(decodeCursor(encodeCursor(basePayload))).toEqual(basePayload);
  });

  it('returns a round-tripped null primary sort value', () => {
    const encoded = encodeCursor({ ...basePayload, sortValues: [null, 7] });
    expect(decodeCursor(encoded).sortValues[0]).toBeNull();
  });

  it('returns a round-tripped string primary sort value', () => {
    const encoded = encodeCursor({
      ...basePayload,
      sort: 'updated_at',
      sortValues: ['2024-01-01T00:00:00.000Z', 7],
    });
    expect(decodeCursor(encoded).sortValues[0]).toBe('2024-01-01T00:00:00.000Z');
  });

  it('returns the round-tripped pit id', () => {
    expect(decodeCursor(encodeCursor(basePayload)).pitId).toBe('pit-abc');
  });

  it('returns the round-tripped sort mode', () => {
    const encoded = encodeCursor({ ...basePayload, sort: 'updated_at' });
    expect(decodeCursor(encoded).sort).toBe('updated_at');
  });

  it('returns a non-empty opaque string', () => {
    expect(encodeCursor(basePayload).length).toBeGreaterThan(0);
  });

  it('throws InvalidCursorError on a completely invalid token', () => {
    expect(() => decodeCursor('not-valid-base64url-json')).toThrow(InvalidCursorError);
  });

  it('throws when version is wrong', () => {
    const bad = Buffer.from(JSON.stringify({ ...basePayload, version: 1 })).toString('base64url');
    expect(() => decodeCursor(bad)).toThrow('Invalid or unsupported cursor');
  });

  it('throws when pitId is missing', () => {
    const bad = Buffer.from(
      JSON.stringify({ version: 2, sort: 'relevance', sortValues: [1, 2] })
    ).toString('base64url');
    expect(() => decodeCursor(bad)).toThrow('Invalid or unsupported cursor');
  });

  it('throws when sortValues length is wrong', () => {
    const bad = Buffer.from(JSON.stringify({ ...basePayload, sortValues: [1] })).toString(
      'base64url'
    );
    expect(() => decodeCursor(bad)).toThrow('Invalid or unsupported cursor');
  });

  it('throws when the shard-doc tiebreak is not a number', () => {
    const bad = Buffer.from(JSON.stringify({ ...basePayload, sortValues: [1, 'x'] })).toString(
      'base64url'
    );
    expect(() => decodeCursor(bad)).toThrow('Invalid or unsupported cursor');
  });
});
