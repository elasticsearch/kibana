/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parseDiscoveries, parseSignificantEvents } from './parse_agent_output';

describe('parseDiscoveries', () => {
  it('parses a bare JSON object message', () => {
    const message = JSON.stringify({ discoveries: [{ discovery_id: 'a' }, { discovery_id: 'b' }] });
    expect(parseDiscoveries(message)).toEqual([{ discovery_id: 'a' }, { discovery_id: 'b' }]);
  });

  it('parses a ```json fenced block with surrounding prose', () => {
    const message =
      'Here is the result:\n```json\n{ "discoveries": [{ "discovery_id": "a" }] }\n```';
    expect(parseDiscoveries(message)).toEqual([{ discovery_id: 'a' }]);
  });

  it('returns [] for an empty or non-JSON message', () => {
    expect(parseDiscoveries('')).toEqual([]);
    expect(parseDiscoveries('no json here')).toEqual([]);
  });

  it('returns [] when discoveries is absent or not an array', () => {
    expect(parseDiscoveries(JSON.stringify({ discoveries: 'nope' }))).toEqual([]);
    expect(parseDiscoveries(JSON.stringify({ other: [] }))).toEqual([]);
  });
});

describe('parseSignificantEvents', () => {
  it('parses the significant_events array', () => {
    const message = JSON.stringify({
      significant_events: [{ discovery_id: 'a', status: 'promoted' }],
    });
    expect(parseSignificantEvents(message)).toEqual([{ discovery_id: 'a', status: 'promoted' }]);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseSignificantEvents('{ significant_events: [')).toEqual([]);
  });
});
