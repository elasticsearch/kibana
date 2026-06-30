/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnomalySummaryEntry } from '../../../../../common/api/entity_analytics';
import { formatBaselineAndAnomaly, buildDescription, mapSummaryToRow } from './map_summary_to_row';

const makeEntry = (overrides: Partial<AnomalySummaryEntry> = {}): AnomalySummaryEntry => ({
  recordId: 'rec-1',
  jobId: 'security-job-1',
  jobName: 'Security Job 1',
  detectorIndex: 0,
  detectorFunction: 'rare',
  fieldName: null,
  byFieldName: 'client.geo.name',
  byFieldValue: 'Iran',
  overFieldName: null,
  overFieldValue: null,
  partitionFieldName: 'host.name',
  partitionFieldValue: 'web-01',
  recordScore: 75,
  timestamp: '2026-05-19T13:41:58.725Z',
  actual: [5],
  typical: [1],
  baselineValues: ['UK', 'Germany', 'France'],
  anomalousValue: 'Iran',
  anomalousValueCount: 2,
  ...overrides,
});

describe('formatBaselineAndAnomaly', () => {
  describe('rare detector', () => {
    it('shows the anomalous by_field_value', () => {
      const { anomaly } = formatBaselineAndAnomaly(
        makeEntry({ detectorFunction: 'rare', anomalousValue: 'Iran' })
      );
      expect(anomaly).toBe('Iran');
    });

    it('joins all baseline values', () => {
      const { baseline } = formatBaselineAndAnomaly(
        makeEntry({ detectorFunction: 'rare', baselineValues: ['UK', 'Germany', 'France'] })
      );
      expect(baseline).toBe('UK, Germany, France');
    });

    it('falls back to "—" baseline when baselineValues is empty', () => {
      const { baseline } = formatBaselineAndAnomaly(
        makeEntry({ detectorFunction: 'rare', baselineValues: [] })
      );
      expect(baseline).toBe('—');
    });

    it('falls back to "-" anomaly when byFieldValue is absent', () => {
      const { anomaly } = formatBaselineAndAnomaly(
        makeEntry({ detectorFunction: 'rare', byFieldValue: null })
      );
      expect(anomaly).toBe('-');
    });
  });

  describe('time_of_day detector', () => {
    it('formats anomalous seconds as HH:mm clock time', () => {
      // 7200s since midnight = 02:00
      const { anomaly } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'time_of_day',
          actual: [7200],
          baselineValues: ['32400'],
        })
      );
      expect(anomaly).toBe('02:00');
    });

    it('formats baseline seconds as HH:mm clock time', () => {
      // 32400s since midnight = 09:00
      const { baseline } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'time_of_day',
          actual: [7200],
          baselineValues: ['32400'],
        })
      );
      expect(baseline).toBe('09:00');
    });
  });

  describe('time_of_week detector', () => {
    it('formats anomalous seconds since Sunday midnight as "Day HH:mm"', () => {
      // 93600s since midnight Sunday = 1*86400 + 7200 = Mon 02:00
      const { anomaly } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'time_of_week',
          actual: [93600],
          baselineValues: ['291600'],
        })
      );
      expect(anomaly).toBe('Mon 02:00');
    });

    it('formats baseline seconds since Sunday midnight as "Day HH:mm"', () => {
      // 291600s since midnight Sunday = 3*86400 + 32400 = Wed 09:00
      const { baseline } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'time_of_week',
          actual: [93600],
          baselineValues: ['291600'],
        })
      );
      expect(baseline).toBe('Wed 09:00');
    });
  });

  describe('metric detector (high_count, high_mean, etc.)', () => {
    it('appends "events" unit and ≤ comparator for high_count', () => {
      const { anomaly, baseline } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'high_count',
          fieldName: null,
          actual: [1000],
          baselineValues: ['50'],
        })
      );
      expect(anomaly).toBe('1000 events');
      expect(baseline).toBe('≤ 50 events');
    });

    it('appends "events" unit and ≥ comparator for low_count', () => {
      const { anomaly, baseline } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'low_count',
          fieldName: null,
          actual: [0],
          baselineValues: ['350'],
        })
      );
      expect(anomaly).toBe('0 events');
      expect(baseline).toBe('≥ 350 events');
    });

    it('formats bytes fields using human-readable sizes with comparator', () => {
      const { anomaly, baseline } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'high_sum',
          fieldName: 'source.bytes',
          actual: [5368709120],
          baselineValues: ['104857600'],
        })
      );
      expect(anomaly).toBe('5.4 GB');
      expect(baseline).toBe('≤ 104.9 MB');
    });

    it('converts session.duration milliseconds to human-readable duration with comparator', () => {
      // 14400000 ms = 4 h, 900000 ms = 15 min
      const { anomaly, baseline } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'high_mean',
          fieldName: 'session.duration',
          actual: [14400000],
          baselineValues: ['900000'],
        })
      );
      expect(anomaly).toBe('4.0 h');
      expect(baseline).toBe('≤ 15 min');
    });

    it('joins all baseline values with units under one comparator', () => {
      const { baseline } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'high_mean',
          fieldName: null,
          baselineValues: ['10', '20', '30'],
        })
      );
      expect(baseline).toBe('≤ 10 events, 20 events, 30 events');
    });

    it('passes categorical rare values through unchanged (no comparator)', () => {
      const { anomaly, baseline } = formatBaselineAndAnomaly(
        makeEntry({
          detectorFunction: 'rare',
          fieldName: null,
          anomalousValue: 'Iran',
          baselineValues: ['UK', 'Germany', 'France'],
        })
      );
      expect(anomaly).toBe('Iran');
      expect(baseline).toBe('UK, Germany, France');
    });

    it('returns "—" for baseline when baselineValues is empty', () => {
      const { baseline } = formatBaselineAndAnomaly(
        makeEntry({ detectorFunction: 'high_count', fieldName: null, baselineValues: [] })
      );
      expect(baseline).toBe('—');
    });

    it('falls back to "-" for anomaly when actual is empty', () => {
      const { anomaly } = formatBaselineAndAnomaly(
        makeEntry({ detectorFunction: 'high_count', fieldName: null, actual: [] })
      );
      expect(anomaly).toBe('-');
    });
  });
});

// buildDescription uses anomalyToDisplayDetails which formats values based on detector type.
// entityType = 'generic' is used throughout so no entity-field filtering is applied.
describe('buildDescription', () => {
  describe('rare detector', () => {
    it('shows the anomalous value as the observed header', () => {
      const result = buildDescription(
        'generic',
        makeEntry({ detectorFunction: 'rare', anomalousValue: 'Iran' })
      );
      expect(result).toContain('Iran');
    });

    it('includes partition context as "where field is value"', () => {
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'rare',
          anomalousValue: 'robocopy.exe',
          partitionFieldName: 'host.name',
          partitionFieldValue: 'server-01',
        })
      );
      expect(result).toBe('robocopy.exe where host.name is server-01');
    });

    it('includes over context as "for value fieldName"', () => {
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'rare',
          anomalousValue: 'malware-c2.tk',
          partitionFieldName: null,
          partitionFieldValue: null,
          overFieldName: 'source.ip',
          overFieldValue: '10.0.0.1',
        })
      );
      // over clause: "for 10.0.0.1 source IPs"
      expect(result).toBe('malware-c2.tk for 10.0.0.1 source IPs');
    });

    it('returns just the anomalous value when no qualifier fields are set', () => {
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'rare',
          anomalousValue: 'svc_backup',
          partitionFieldName: null,
          partitionFieldValue: null,
          overFieldName: null,
          overFieldValue: null,
        })
      );
      expect(result).toBe('svc_backup');
    });

    it('filters out the entity-type field from context', () => {
      // When entityType is 'host', host.name partition is excluded from the subtitle
      const result = buildDescription(
        'host',
        makeEntry({
          detectorFunction: 'rare',
          anomalousValue: 'Crimea',
          partitionFieldName: 'host.name',
          partitionFieldValue: 'web-01',
        })
      );
      expect(result).toBe('Crimea');
    });
  });

  describe('time_of_day detector', () => {
    it('formats observed seconds as "Activity at HH:mm"', () => {
      // 7200s since midnight = 02:00
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'time_of_day',
          actual: [7200],
          typical: [32400],
          byFieldName: null,
          byFieldValue: null,
          partitionFieldName: null,
          partitionFieldValue: null,
        })
      );
      expect(result).toBe('Activity at 02:00');
    });

    it('appends "where" context for by field', () => {
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'time_of_day',
          actual: [7200],
          typical: [32400],
          byFieldName: 'user.name',
          byFieldValue: 'john.doe',
          partitionFieldName: null,
          partitionFieldValue: null,
        })
      );
      expect(result).toBe('Activity at 02:00 where user.name is john.doe');
    });
  });

  describe('time_of_week detector', () => {
    it('formats observed seconds as "Activity at Day HH:mm" using Monday as week start', () => {
      // moment.utc('2018-01-01') is Monday; adding 93600s = 1 day 2 hours = Tuesday 02:00
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'time_of_week',
          actual: [93600],
          typical: [291600],
          byFieldName: null,
          byFieldValue: null,
          partitionFieldName: null,
          partitionFieldValue: null,
        })
      );
      expect(result).toBe('Activity at Tue 02:00');
    });

    it('appends "where" context for partition field', () => {
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'time_of_week',
          actual: [93600],
          typical: [291600],
          byFieldName: null,
          byFieldValue: null,
          partitionFieldName: 'source.ip',
          partitionFieldValue: '10.1.2.3',
        })
      );
      expect(result).toBe('Activity at Tue 02:00 where source.ip is 10.1.2.3');
    });
  });

  describe('metric detector', () => {
    it('shows formatted event count for high_count', () => {
      // actual[0] = 1523, no field → "1523 events"
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'high_count',
          actual: [1523],
          typical: [152],
          fieldName: null,
          byFieldName: null,
          byFieldValue: null,
          partitionFieldName: null,
          partitionFieldValue: null,
        })
      );
      expect(result).toBe('1523 events, which is 10.0× greater than baseline');
    });

    it('formats bytes fields using human-readable sizes', () => {
      // actual[0] = 5368709120 bytes ≈ 5.4 GB
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'high_sum',
          actual: [5368709120],
          typical: [104857600],
          fieldName: 'source.bytes',
          byFieldName: null,
          byFieldValue: null,
          partitionFieldName: null,
          partitionFieldValue: null,
        })
      );
      expect(result).toBe('5.4 GB, which is 51.2× greater than baseline');
    });

    it('appends "where" context for by field', () => {
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'high_count',
          actual: [847],
          typical: [43],
          fieldName: null,
          byFieldName: 'event.action',
          byFieldValue: 'file-copy',
          partitionFieldName: null,
          partitionFieldValue: null,
        })
      );
      expect(result).toBe(
        '847 events where event.action is file-copy, which is 19.7× greater than baseline'
      );
    });

    it('uses "distinct" label for high_distinct_count', () => {
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'high_distinct_count',
          actual: [47],
          typical: [3],
          fieldName: 'destination.ip',
          byFieldName: null,
          byFieldValue: null,
          partitionFieldName: 'source.ip',
          partitionFieldValue: '10.1.2.3',
        })
      );
      expect(result).toBe(
        '47 distinct destination IPs where source.ip is 10.1.2.3, which is 15.7× greater than baseline'
      );
    });

    it('includes both by and partition context', () => {
      const result = buildDescription(
        'generic',
        makeEntry({
          detectorFunction: 'high_non_zero_count',
          actual: [127],
          typical: [3],
          fieldName: null,
          byFieldName: 'event.action',
          byFieldValue: 'special-logon',
          partitionFieldName: 'user.name',
          partitionFieldValue: 'administrator',
        })
      );
      expect(result).toBe(
        '127 events where event.action is special-logon where user.name is administrator, which is 42.3× greater than baseline'
      );
    });
  });
});

describe('mapSummaryToRow — keyFields', () => {
  it('includes all non-null field name/value pairs', () => {
    const row = mapSummaryToRow(
      'host',
      makeEntry({
        byFieldName: 'client.geo.name',
        byFieldValue: 'Iran',
        overFieldName: 'source.ip',
        overFieldValue: '10.0.0.1',
        partitionFieldName: 'host.name',
        partitionFieldValue: 'web-01',
      }),
      0
    );
    expect(row.keyFields).toEqual([
      'client.geo.name=Iran',
      'source.ip=10.0.0.1',
      'host.name=web-01',
    ]);
  });

  it('omits pairs where the value is null', () => {
    const row = mapSummaryToRow(
      'host',
      makeEntry({
        byFieldName: 'client.geo.name',
        byFieldValue: null,
        overFieldName: 'source.ip',
        overFieldValue: '10.0.0.1',
        partitionFieldName: null,
        partitionFieldValue: null,
      }),
      0
    );
    expect(row.keyFields).toEqual(['source.ip=10.0.0.1']);
  });

  it('returns an empty array when all field names are null', () => {
    const row = mapSummaryToRow(
      'host',
      makeEntry({
        byFieldName: null,
        byFieldValue: null,
        overFieldName: null,
        overFieldValue: null,
        partitionFieldName: null,
        partitionFieldValue: null,
      }),
      0
    );
    expect(row.keyFields).toEqual([]);
  });
});

describe('mapSummaryToRow — anomalyCount', () => {
  it('uses anomalousValueCount when present', () => {
    const row = mapSummaryToRow('host', makeEntry({ anomalousValueCount: 7 }), 0);
    expect(row.anomalyCount).toBe(7);
  });

  it('falls back to parsed anomalousValue when anomalousValueCount is absent', () => {
    const row = mapSummaryToRow(
      'host',
      makeEntry({ anomalousValueCount: undefined, anomalousValue: '42' }),
      0
    );
    expect(row.anomalyCount).toBe(42);
  });

  it('returns 0 when anomalousValue is a non-numeric string', () => {
    const row = mapSummaryToRow(
      'host',
      makeEntry({ anomalousValueCount: undefined, anomalousValue: 'Iran' }),
      0
    );
    expect(row.anomalyCount).toBe(0);
  });

  it('returns 0 when both anomalousValueCount and anomalousValue are absent', () => {
    const row = mapSummaryToRow(
      'host',
      makeEntry({ anomalousValueCount: undefined, anomalousValue: undefined }),
      0
    );
    expect(row.anomalyCount).toBe(0);
  });
});
