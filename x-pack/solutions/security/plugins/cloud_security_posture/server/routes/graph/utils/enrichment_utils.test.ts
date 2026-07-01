/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { rebuildDocData, addValuesToSet } from './enrichment_utils';
import type { EntityEnrichmentFields } from '../fetch_entity_enrichment';

describe('addValuesToSet', () => {
  it('adds a scalar value', () => {
    const set = new Set<string>();
    addValuesToSet(set, 'a', { dropEmpty: false });
    expect([...set]).toEqual(['a']);
  });

  it('adds every element of an array value', () => {
    const set = new Set<string>();
    addValuesToSet(set, ['a', 'b'], { dropEmpty: false });
    expect([...set]).toEqual(['a', 'b']);
  });

  it('unions into an existing set and deduplicates', () => {
    const set = new Set<string>(['a']);
    addValuesToSet(set, ['a', 'b'], { dropEmpty: false });
    expect([...set]).toEqual(['a', 'b']);
  });

  it('ignores null and undefined values', () => {
    const set = new Set<string>();
    addValuesToSet(set, null, { dropEmpty: false });
    addValuesToSet(set, undefined, { dropEmpty: false });
    expect([...set]).toEqual([]);
  });

  it('keeps empty strings when dropEmpty is false', () => {
    const set = new Set<string>();
    addValuesToSet(set, ['', 'a'], { dropEmpty: false });
    expect([...set]).toEqual(['', 'a']);
  });

  it('drops the empty-string sentinel when dropEmpty is true', () => {
    const set = new Set<string>();
    addValuesToSet(set, ['', 'a'], { dropEmpty: true });
    expect([...set]).toEqual(['a']);
  });
});

describe('rebuildDocData', () => {
  it('returns empty array for empty input', () => {
    const result = rebuildDocData([], new Map());
    expect(result).toEqual([]);
  });

  it('returns item unchanged when JSON parse fails', () => {
    const invalid = 'not-valid-json';
    const result = rebuildDocData([invalid], new Map());
    expect(result).toEqual([invalid]);
  });

  it('returns item unchanged when no id in doc', () => {
    const noId = JSON.stringify({ type: 'entity', sourceFields: {} });
    const result = rebuildDocData([noId], new Map());
    expect(result).toEqual([noId]);
  });

  it('applies availableInEntityStore: false when entity not in enrichment map', () => {
    const item = JSON.stringify({
      id: 'user:alice',
      type: 'entity',
      sourceFields: { 'user.name': 'alice' },
    });
    const result = rebuildDocData([item], new Map());

    expect(result).toHaveLength(1);
    const doc = JSON.parse(result[0]);
    expect(doc.entity.availableInEntityStore).toBe(false);
    expect(doc.entity.sourceFields).toEqual({ 'user.name': 'alice' });
    expect(doc.sourceFields).toBeUndefined();
  });

  it('applies availableInEntityStore: true and enrichment fields when entity found', () => {
    const item = JSON.stringify({
      id: 'user:alice',
      type: 'entity',
      sourceFields: { 'user.name': 'alice' },
    });
    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      [
        'user:alice',
        {
          name: 'Alice Smith',
          type: 'user',
          subType: 'admin',
          engineType: 'ecs',
          hostIps: ['10.0.0.1'],
        },
      ],
    ]);

    const result = rebuildDocData([item], enrichmentMap);

    expect(result).toHaveLength(1);
    const doc = JSON.parse(result[0]);
    expect(doc.entity.availableInEntityStore).toBe(true);
    expect(doc.entity.name).toBe('Alice Smith');
    expect(doc.entity.type).toBe('user');
    expect(doc.entity.sub_type).toBe('admin');
    expect(doc.entity.engine_type).toBe('ecs');
    expect(doc.entity.host).toEqual({ ip: ['10.0.0.1'] });
    expect(doc.entity.sourceFields).toEqual({ 'user.name': 'alice' });
    expect(doc.sourceFields).toBeUndefined();
  });

  it('moves sourceFields from top-level into entity object (events docData format)', () => {
    const item = JSON.stringify({
      id: 'host:server1',
      type: 'entity',
      sourceFields: { 'host.name': 'server1', 'host.id': 'h1' },
    });

    const result = rebuildDocData([item], new Map());

    expect(result).toHaveLength(1);
    const doc = JSON.parse(result[0]);
    expect(doc.sourceFields).toBeUndefined();
    expect(doc.entity.sourceFields).toEqual({ 'host.name': 'server1', 'host.id': 'h1' });
  });

  it('handles sourceFields already inside existing entity object (entity store docData format)', () => {
    const item = JSON.stringify({
      id: 'host:server1',
      type: 'entity',
      entity: {
        availableInEntityStore: true,
        sourceFields: { 'host.name': 'server1' },
        name: 'server1',
      },
    });

    const result = rebuildDocData([item], new Map());

    expect(result).toHaveLength(1);
    const doc = JSON.parse(result[0]);
    expect(doc.sourceFields).toBeUndefined();
    expect(doc.entity.sourceFields).toEqual({ 'host.name': 'server1' });
    expect(doc.entity.availableInEntityStore).toBe(false);
  });

  it('falls back to enrichment sourceFields when input doc has no sourceFields', () => {
    // Relationship target docData has no sourceFields — enrichment provides them
    const item = JSON.stringify({ id: 'user:alice', type: 'entity' });
    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      [
        'user:alice',
        {
          name: 'Alice',
          type: 'user',
          subType: null,
          engineType: null,
          hostIps: [],
          sourceFields: { 'user.id': 'alice', 'user.email': 'alice@example.com' },
        },
      ],
    ]);

    const result = rebuildDocData([item], enrichmentMap);

    const doc = JSON.parse(result[0]);
    expect(doc.entity.sourceFields).toEqual({
      'user.id': 'alice',
      'user.email': 'alice@example.com',
    });
    expect(doc.entity.availableInEntityStore).toBe(true);
  });

  it('prefers input sourceFields over enrichment sourceFields', () => {
    // Events docData has sourceFields from the event row — those take precedence
    const item = JSON.stringify({
      id: 'user:alice',
      type: 'entity',
      sourceFields: { 'user.id': 'from-event' },
    });
    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      [
        'user:alice',
        {
          name: 'Alice',
          type: 'user',
          subType: null,
          engineType: null,
          hostIps: [],
          sourceFields: { 'user.id': 'from-enrichment' },
        },
      ],
    ]);

    const result = rebuildDocData([item], enrichmentMap);

    const doc = JSON.parse(result[0]);
    expect(doc.entity.sourceFields?.['user.id']).toBe('from-event');
  });

  it('handles host.ip array in enrichment', () => {
    const item = JSON.stringify({ id: 'host:server1', type: 'entity', sourceFields: {} });
    const enrichmentMap = new Map<string, EntityEnrichmentFields>([
      [
        'host:server1',
        {
          name: 'server1',
          type: 'host',
          subType: null,
          engineType: null,
          hostIps: ['192.168.1.1', '10.0.0.1'],
        },
      ],
    ]);

    const result = rebuildDocData([item], enrichmentMap);

    expect(result).toHaveLength(1);
    const doc = JSON.parse(result[0]);
    expect(doc.entity.host).toEqual({ ip: ['192.168.1.1', '10.0.0.1'] });
  });
});
