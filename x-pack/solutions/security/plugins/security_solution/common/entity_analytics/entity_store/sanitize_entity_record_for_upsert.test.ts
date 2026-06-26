/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { sanitizeEntityRecordForUpsert } from './sanitize_entity_record_for_upsert';

describe('sanitize_entity_record_for_upsert', () => {
  it('coerces host.risk.inputs object to array and notes string to array', () => {
    const record = {
      entity: {
        id: 'host:test',
        type: 'host',
        attributes: { watchlists: ['wl-1'], asset: true },
        behaviors: { rule_names: ['a'], brute_force_victim: true },
        relationships: {
          communicates_with: ['host:a'],
          resolution: { risk: { calculated_level: 'Low' } },
        },
      },
      host: {
        name: 'h1',
        risk: {
          '@timestamp': '2026-03-28T01:41:12.286Z',
          id_field: 'host.name',
          id_value: 'h1',
          calculated_level: 'Moderate',
          calculated_score: 42.5,
          calculated_score_norm: 55,
          category_1_score: 30,
          category_1_count: 3,
          inputs: {
            id: 'alert-1',
            index: '.alerts',
            category: 'category_1',
            description: 'demo',
            risk_score: 65,
            timestamp: '2026-03-28T01:41:12.286Z',
            contribution_score: 12,
          },
          notes: 'one note',
          criticality_level: 'medium_impact',
        },
      },
      event: { ingested: '2026-03-28T01:41:12.286Z' },
    };

    const out = sanitizeEntityRecordForUpsert(record as never);

    expect(
      (out as { host?: { risk?: { inputs?: unknown; notes?: unknown } } }).host?.risk?.inputs
    ).toEqual([
      {
        id: 'alert-1',
        index: '.alerts',
        category: 'category_1',
        description: 'demo',
        risk_score: 65,
        timestamp: '2026-03-28T01:41:12.286Z',
        contribution_score: 12,
      },
    ]);
    expect((out as { host?: { risk?: { notes?: string[] } } }).host?.risk?.notes).toEqual([
      'one note',
    ]);
    expect(
      (out as { entity?: { attributes?: { watchlists?: unknown } } }).entity?.attributes
    ).toEqual({
      asset: true,
    });
    expect(
      (out as { entity?: { behaviors?: { rule_names?: unknown; brute_force_victim?: boolean } } })
        .entity?.behaviors
    ).toEqual({ brute_force_victim: true });
    expect(
      (
        out as {
          entity?: { relationships?: { communicates_with?: string[]; resolution?: unknown } };
        }
      ).entity?.relationships
    ).toEqual({ communicates_with: ['host:a'] });
  });
});
