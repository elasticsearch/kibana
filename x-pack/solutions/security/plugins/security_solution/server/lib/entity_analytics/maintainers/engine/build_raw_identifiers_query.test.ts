/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  buildRawIdentifiersEsqlQuery,
  buildRawIdentifiersExistenceGate,
  DEFAULT_DIRECT_EUID_RULES,
} from './build_raw_identifiers_query';

describe('buildRawIdentifiersEsqlQuery', () => {
  it('builds a single type-prefixed CONCAT for one rule (no MV_APPEND union)', () => {
    const query = buildRawIdentifiersEsqlQuery({
      relationshipKey: 'administers',
      rules: [{ field: 'host.name', euidType: 'host' }],
      namespace: 'default',
    });
    // MV_EXPAND must precede CONCAT so multi-valued fields don't silently produce NULL.
    expect(query).toContain(
      'EVAL rawKey0 = entity.relationships.administers.raw_identifiers.host.name'
    );
    expect(query).toContain('MV_EXPAND rawKey0');
    expect(query).toContain('EVAL t0 = CONCAT("host:", rawKey0)');
    expect(query).toContain('EVAL targetEntityId = t0');
    expect(query).not.toContain('MV_APPEND');
    // STATS column is named after the relationship key.
    expect(query).toContain('STATS administers = VALUES(targetEntityId) BY actorUserId');
  });

  it('unions multiple rules (different fields and EUID types) via MV_APPEND', () => {
    const query = buildRawIdentifiersEsqlQuery({
      relationshipKey: 'administers',
      rules: [
        { field: 'host.name', euidType: 'host' },
        { field: 'user.email', euidType: 'user' },
        { field: 'service.name', euidType: 'service' },
      ],
      namespace: 'default',
    });
    // Each rule: expand raw field first, then CONCAT.
    expect(query).toContain(
      'EVAL rawKey0 = entity.relationships.administers.raw_identifiers.host.name'
    );
    expect(query).toContain('MV_EXPAND rawKey0');
    expect(query).toContain('EVAL t0 = CONCAT("host:", rawKey0)');
    expect(query).toContain(
      'EVAL rawKey1 = entity.relationships.administers.raw_identifiers.user.email'
    );
    expect(query).toContain('MV_EXPAND rawKey1');
    expect(query).toContain('EVAL t1 = CONCAT("user:", rawKey1)');
    expect(query).toContain(
      'EVAL rawKey2 = entity.relationships.administers.raw_identifiers.service.name'
    );
    expect(query).toContain('MV_EXPAND rawKey2');
    expect(query).toContain('EVAL t2 = CONCAT("service:", rawKey2)');
    expect(query).toContain('EVAL targetEntityId = MV_APPEND(t0, t1, t2)');
    expect(query).toContain(
      'entity.relationships.administers.raw_identifiers.host.name IS NOT NULL OR ' +
        'entity.relationships.administers.raw_identifiers.user.email IS NOT NULL OR ' +
        'entity.relationships.administers.raw_identifiers.service.name IS NOT NULL'
    );
  });

  it('is generic over the relationship key (field path + STATS column reflect it)', () => {
    const query = buildRawIdentifiersEsqlQuery({
      relationshipKey: 'depends_on',
      rules: [{ field: 'host.name', euidType: 'host' }],
      namespace: 'default',
    });
    expect(query).toContain(
      'EVAL rawKey0 = entity.relationships.depends_on.raw_identifiers.host.name'
    );
    expect(query).toContain('EVAL t0 = CONCAT("host:", rawKey0)');
    expect(query).toContain('STATS depends_on = VALUES(targetEntityId) BY actorUserId');
  });

  it('guards against non-EUID target values via RLIKE', () => {
    const query = buildRawIdentifiersEsqlQuery({
      relationshipKey: 'administers',
      rules: [{ field: 'host.name', euidType: 'host' }],
      namespace: 'default',
    });
    // Rejects empty/prefix-only values like "host:" from a blank raw field.
    expect(query).toContain('targetEntityId RLIKE ".+:.+"');
  });

  it('sets actorUserId from entity.id and does not filter by entity.type', () => {
    const query = buildRawIdentifiersEsqlQuery({
      relationshipKey: 'administers',
      rules: [{ field: 'host.name', euidType: 'host' }],
      namespace: 'default',
    });
    expect(query).toContain('EVAL actorUserId = entity.id');
    expect(query).not.toContain('entity.type ==');
  });

  describe('watermark', () => {
    it('omits the last_seen filter when no watermark is provided', () => {
      const query = buildRawIdentifiersEsqlQuery({
        relationshipKey: 'administers',
        rules: [{ field: 'host.name', euidType: 'host' }],
        namespace: 'default',
      });
      expect(query).not.toContain('entity.lifecycle.last_seen >');
      // And never falls back to @timestamp as the incremental signal.
      expect(query).not.toContain('@timestamp >');
    });

    it('filters on entity.lifecycle.last_seen after the watermark value', () => {
      const ts = '2026-06-01T00:00:00.000Z';
      const query = buildRawIdentifiersEsqlQuery({
        relationshipKey: 'administers',
        rules: [{ field: 'host.name', euidType: 'host' }],
        namespace: 'default',
        lastProcessedTimestamp: ts,
      });
      expect(query).toContain(`entity.lifecycle.last_seen > "${ts}"`);
      expect(query).not.toContain('@timestamp >');
    });
  });

  describe('DEFAULT_DIRECT_EUID_RULES', () => {
    it('covers the common direct identity fields and excludes indirect id fields', () => {
      const fields = DEFAULT_DIRECT_EUID_RULES.map((r) => r.field);
      expect(fields).toEqual(
        expect.arrayContaining(['host.name', 'user.email', 'user.name', 'service.name'])
      );
      // host.id / user.id are likely indirect (DN/SID/GUID) and must not be default.
      expect(fields).not.toContain('host.id');
      expect(fields).not.toContain('user.id');
    });

    it('produces a query that unions all default fields with expand-before-concat', () => {
      const query = buildRawIdentifiersEsqlQuery({
        relationshipKey: 'administers',
        rules: DEFAULT_DIRECT_EUID_RULES,
        namespace: 'default',
      });
      expect(query).toContain(
        'EVAL rawKey0 = entity.relationships.administers.raw_identifiers.host.name'
      );
      expect(query).toContain('EVAL t0 = CONCAT("host:", rawKey0)');
      expect(query).toContain(
        'EVAL rawKey1 = entity.relationships.administers.raw_identifiers.user.email'
      );
      expect(query).toContain('EVAL t1 = CONCAT("user:", rawKey1)');
      expect(query).toContain(
        'EVAL rawKey2 = entity.relationships.administers.raw_identifiers.user.name'
      );
      expect(query).toContain('EVAL t2 = CONCAT("user:", rawKey2)');
      expect(query).toContain(
        'EVAL rawKey3 = entity.relationships.administers.raw_identifiers.service.name'
      );
      expect(query).toContain('EVAL t3 = CONCAT("service:", rawKey3)');
      expect(query).toContain('MV_APPEND(t0, t1, t2, t3)');
    });
  });
});

describe('buildRawIdentifiersExistenceGate', () => {
  it('ORs an exists filter per field under the relationship raw_identifiers prefix', () => {
    const gate = buildRawIdentifiersExistenceGate({
      relationshipKey: 'administers',
      fields: ['host.name', 'host.id'],
    });
    expect(gate).toEqual({
      bool: {
        should: [
          { exists: { field: 'entity.relationships.administers.raw_identifiers.host.name' } },
          { exists: { field: 'entity.relationships.administers.raw_identifiers.host.id' } },
        ],
        minimum_should_match: 1,
      },
    });
  });

  it('is generic over the relationship key', () => {
    const gate = buildRawIdentifiersExistenceGate({
      relationshipKey: 'depends_on',
      fields: ['host.name'],
    });
    expect(JSON.stringify(gate)).toContain(
      'entity.relationships.depends_on.raw_identifiers.host.name'
    );
  });
});
