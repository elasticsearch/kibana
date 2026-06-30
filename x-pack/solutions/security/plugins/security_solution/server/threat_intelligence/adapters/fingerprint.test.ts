/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import { buildFingerprint } from './fingerprint';

describe('buildFingerprint', () => {
  it('matches the workflow engine | sha256 Liquid filter shape', () => {
    // Hand-rolled control so we know the encoding matches the YAML
    // path the adapters replace. The Liquid filter joins parts with
    // `:`, NFKC-normalizes, and trims — same as `buildFingerprint`.
    const expected = createHash('sha256')
      .update('https://example.com/feed.xml:item-42:Title')
      .digest('hex');
    expect(buildFingerprint(['https://example.com/feed.xml', 'item-42', 'Title'])).toBe(expected);
  });

  it('returns a 64-char hex digest', () => {
    expect(buildFingerprint(['a', 'b'])).toMatch(/^[0-9a-f]{64}$/);
  });

  it('NFKC-normalizes parts so unicode equivalents collapse', () => {
    // U+FB01 (ﬁ ligature) vs ASCII "fi".
    expect(buildFingerprint(['url', 'id', '\ufb01nal'])).toBe(
      buildFingerprint(['url', 'id', 'final'])
    );
  });

  it('trims leading/trailing whitespace per part', () => {
    expect(buildFingerprint(['  url  ', '  id  '])).toBe(buildFingerprint(['url', 'id']));
  });

  it('treats undefined/null parts as empty strings (still positional)', () => {
    // Two leading missing parts are still part of the seed shape — a
    // re-fetch with the same shape produces the same digest.
    const a = buildFingerprint([undefined, undefined, 'id']);
    const b = buildFingerprint([undefined, undefined, 'id']);
    expect(a).toBe(b);
    // …but a missing part is *positionally distinct* from the part
    // moving up by one — `:::id` and `id` produce different digests.
    expect(a).not.toBe(buildFingerprint(['id']));
  });

  it('produces a stable digest for the same logical input', () => {
    const fp1 = buildFingerprint(['https://example.com', 'id-1', 'modified-2026-05-01']);
    const fp2 = buildFingerprint(['https://example.com', 'id-1', 'modified-2026-05-01']);
    expect(fp1).toBe(fp2);
  });

  it('produces different digests when the version stamp changes', () => {
    const a = buildFingerprint(['https://example.com', 'id-1', '2026-05-01']);
    const b = buildFingerprint(['https://example.com', 'id-1', '2026-05-02']);
    expect(a).not.toBe(b);
  });
});
