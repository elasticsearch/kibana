/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_EVENTS_DATA_STREAM } from '../constants';
import { buildEpisodeTrendQuery, parseEpisodeTrendRows } from './episode_trend_query';

const SPACE_ID = 'default';

describe('buildEpisodeTrendQuery', () => {
  it('queries the alert events data stream with _source metadata', () => {
    const queryString = buildEpisodeTrendQuery(SPACE_ID, 'ep-1', ['count']).print('basic');
    expect(queryString).toContain(ALERT_EVENTS_DATA_STREAM);
    expect(queryString).toContain('_source');
  });

  it('filters by space, alert type and episode id', () => {
    const episodeId = 'episode-abc';
    const queryString = buildEpisodeTrendQuery(SPACE_ID, episodeId, ['count']).print('basic');
    expect(queryString).toContain('space_id');
    expect(queryString).toContain('type == "alert"');
    expect(queryString).toContain('episode.id');
    expect(queryString).toContain(episodeId);
  });

  it('projects one column per requested metric, named after the label and reading from data', () => {
    const queryString = buildEpisodeTrendQuery(SPACE_ID, 'ep-1', ['count', 'error_rate']).print(
      'basic'
    );
    expect(queryString).toContain(`count = JSON_EXTRACT(_source, "data['count']")`);
    expect(queryString).toContain(`error_rate = JSON_EXTRACT(_source, "data['error_rate']")`);
  });

  it('escapes labels with special characters in both the column name and selector', () => {
    const queryString = buildEpisodeTrendQuery(SPACE_ID, 'ep-1', ['host.name']).print('basic');
    expect(queryString).toContain('`host.name` = JSON_EXTRACT(_source, "data[\'host.name\']")');
  });

  it('keeps the timestamp, status and metric columns, sorted oldest first', () => {
    const queryString = buildEpisodeTrendQuery(SPACE_ID, 'ep-1', ['count']).print('basic');
    expect(queryString).toContain('@timestamp');
    expect(queryString).toContain('episode.status');
    expect(queryString.toUpperCase()).toContain('KEEP');
    expect(queryString).toMatch(/KEEP[^|]*\bcount\b/);
    expect(queryString.toUpperCase()).toContain('SORT');
    expect(queryString.toUpperCase()).toContain('ASC');
  });

  it('builds a valid query when there are no metric labels', () => {
    const queryString = buildEpisodeTrendQuery(SPACE_ID, 'ep-1', []).print('basic');
    expect(queryString.toUpperCase()).not.toContain('JSON_EXTRACT');
    expect(queryString).toContain('@timestamp');
    expect(queryString).toContain('episode.status');
  });
});

describe('parseEpisodeTrendRows', () => {
  it('keys each event metric by label and coerces values to numbers', () => {
    const rows = parseEpisodeTrendRows(
      [
        {
          '@timestamp': '2026-06-18T00:00:00.000Z',
          'episode.status': 'active',
          count: '10',
          error_rate: '1.5',
        },
      ],
      ['count', 'error_rate']
    );

    expect(rows).toEqual([
      {
        '@timestamp': '2026-06-18T00:00:00.000Z',
        'episode.status': 'active',
        metrics: { count: 10, error_rate: 1.5 },
      },
    ]);
  });

  it('maps missing or non-numeric extracted values to null', () => {
    const [row] = parseEpisodeTrendRows(
      [
        {
          '@timestamp': '2026-06-18T00:00:00.000Z',
          'episode.status': 'recovered',
          count: null,
          error_rate: 'oops',
        },
      ],
      ['count', 'error_rate']
    );

    expect(row.metrics).toEqual({ count: null, error_rate: null });
  });
});
