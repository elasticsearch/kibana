/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { toContinuationCandidate, mergeContinuationCandidates } from './continuation_candidate';

describe('toContinuationCandidate', () => {
  it('stamps the id and derives stream_names from detections', () => {
    const candidate = toContinuationCandidate({
      discoveryId: 'svc__cascade-aaaa1111-cycle-0',
      discovery: {
        kind: 'discovery',
        discovery_slug: 'svc__cascade-aaaa1111',
        summary: 'cascade',
        root_cause: 'db down',
        title: 'Cascade',
        confidence: 80,
        criticality: 90,
        detections: [
          { rule_name: 'r1', rule_uuid: 'u1', stream_name: 'logs-a', kind: 'detection' },
          { rule_name: 'r2', rule_uuid: 'u2', stream_name: 'logs-b', kind: 'detection' },
          // duplicate stream — should be de-duped
          { rule_name: 'r3', rule_uuid: 'u3', stream_name: 'logs-a', kind: 'detection' },
        ],
      },
    });

    expect(candidate.discovery_id).toBe('svc__cascade-aaaa1111-cycle-0');
    expect(candidate.discovery_slug).toBe('svc__cascade-aaaa1111');
    expect(candidate.stream_names).toEqual(['logs-a', 'logs-b']);
    expect(candidate.detections).toHaveLength(3);
    expect(candidate.confidence).toBe(80);
    expect(candidate.criticality).toBe(90);
  });

  it('defaults kind to discovery and tolerates missing detections', () => {
    const candidate = toContinuationCandidate({
      discoveryId: 'svc__x-bbbb2222-cycle-0',
      discovery: { discovery_slug: 'svc__x-bbbb2222' },
    });

    expect(candidate.kind).toBe('discovery');
    expect(candidate.detections).toEqual([]);
    expect(candidate.stream_names).toEqual([]);
  });
});

describe('mergeContinuationCandidates', () => {
  it('keeps the latest doc per slug (last write wins)', () => {
    const merged = mergeContinuationCandidates([
      { discovery_slug: 'a', confidence: 50 },
      { discovery_slug: 'b', confidence: 60 },
      { discovery_slug: 'a', confidence: 70 }, // newer for slug a
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.find((c) => c.discovery_slug === 'a')?.confidence).toBe(70);
    expect(merged.find((c) => c.discovery_slug === 'b')?.confidence).toBe(60);
  });

  it('skips discoveries without a slug', () => {
    const merged = mergeContinuationCandidates([{ confidence: 10 }, { discovery_slug: 'a' }]);
    expect(merged).toEqual([{ discovery_slug: 'a' }]);
  });
});
