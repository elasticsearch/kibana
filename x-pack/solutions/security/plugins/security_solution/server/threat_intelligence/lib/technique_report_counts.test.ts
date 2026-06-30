/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  mergeTechniqueReportCounts,
  parseTechniqueCountsFromBehaviors,
  parseTechniqueCountsFromTtps,
  topTechniqueBuckets,
} from './technique_report_counts';

describe('technique_report_counts', () => {
  it('parses nested behavior buckets via reverse_nested report_count', () => {
    const counts = parseTechniqueCountsFromBehaviors([
      { key: 'T1059', doc_count: 3, report_count: { doc_count: 2 } },
      { key: 'T1078', doc_count: 1, report_count: { doc_count: 1 } },
    ]);
    expect(counts.get('T1059')).toBe(2);
    expect(counts.get('T1078')).toBe(1);
  });

  it('parses flat ttps buckets as report counts', () => {
    const counts = parseTechniqueCountsFromTtps([
      { key: 'T1059', doc_count: 4 },
      { key: 'T1486', doc_count: 1 },
    ]);
    expect(counts.get('T1059')).toBe(4);
    expect(counts.get('T1486')).toBe(1);
  });

  it('merges without double-counting when both sources list the same technique', () => {
    const merged = mergeTechniqueReportCounts(new Map([['T1059', 5]]), new Map([['T1059', 5]]));
    expect(merged.get('T1059')).toBe(5);
  });

  it('takes the higher count when sources disagree', () => {
    const merged = mergeTechniqueReportCounts(new Map([['T1059', 3]]), new Map([['T1059', 7]]));
    expect(merged.get('T1059')).toBe(7);
  });

  it('sorts and caps top technique buckets', () => {
    const top = topTechniqueBuckets(
      new Map([
        ['T1059', 10],
        ['T1078', 25],
        ['T1486', 5],
      ]),
      2
    );
    expect(top).toEqual([
      { technique_id: 'T1078', report_count: 25 },
      { technique_id: 'T1059', report_count: 10 },
    ]);
  });
});
