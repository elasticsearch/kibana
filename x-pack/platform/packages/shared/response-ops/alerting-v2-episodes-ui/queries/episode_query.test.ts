/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_EVENTS_DATA_STREAM, ALERT_ACTIONS_DATA_STREAM } from '../constants';
import { buildEpisodeQuery } from './episode_query';

const SPACE_ID = 'default';

describe('buildEpisodeQuery', () => {
  it('filters by episode id', () => {
    const episodeId = 'episode-abc';
    const queryString = buildEpisodeQuery(SPACE_ID, episodeId).print('basic');
    expect(queryString).toContain(`episode.id == "${episodeId}"`);
  });

  it('limits to 1 row', () => {
    const queryString = buildEpisodeQuery(SPACE_ID, 'ep-1').print('basic');
    expect(queryString).toContain('LIMIT 1');
  });

  it('joins both data streams', () => {
    const queryString = buildEpisodeQuery(SPACE_ID, 'ep-1').print('basic');
    expect(queryString).toContain(ALERT_EVENTS_DATA_STREAM);
    expect(queryString).toContain(ALERT_ACTIONS_DATA_STREAM);
  });

  it('computes triggered_at from first active event', () => {
    const queryString = buildEpisodeQuery(SPACE_ID, 'ep-1').print('basic');
    expect(queryString).toContain('triggered_at');
    expect(queryString).toContain('"active"');
  });

  it('aggregates severity from breached rule events', () => {
    const queryString = buildEpisodeQuery(SPACE_ID, 'ep-1').print('basic');
    expect(queryString).toContain(
      'severity = LAST(severity, @timestamp) WHERE status == "breached" AND severity IS NOT NULL'
    );
    expect(queryString).toContain('KEEP');
    expect(queryString).toContain('severity');
  });
});
