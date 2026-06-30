/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS, buildAdministersConfigs } from './configs';
import { buildActorDiscoveryQuery } from '../engine/build_actor_discovery_query';
import { buildTargetsPerActorQuery } from '../engine/build_targets_per_actor_query';
import { COMPOSITE_PAGE_SIZE } from '../engine/constants';
import type { OverrideRelationshipIntegrationConfig } from '../engine/types';

const overrideConfigs = ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS.filter(
  (c): c is OverrideRelationshipIntegrationConfig => c.kind === 'override'
);

describe('ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS', () => {
  it('ships exactly the one expected integration', () => {
    expect(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS.map((c) => c.id).sort()).toEqual([
      'entityanalytics_ad',
    ]);
  });

  it('declares kind: "override" on every administers config', () => {
    for (const config of ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS) {
      expect(config.kind).toBe('override');
    }
    expect(overrideConfigs).toHaveLength(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS.length);
  });

  it('declares relationshipKey "administers" on every config', () => {
    for (const config of overrideConfigs) {
      expect(config.relationshipKey).toBe('administers');
    }
  });

  it('declares targetEntityType "host" on every config', () => {
    for (const config of ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS) {
      expect(config.targetEntityType).toBe('host');
    }
  });

  it.each(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS)(
    '$id: builds a syntactically-locked actor discovery query',
    (config) => {
      const query = buildActorDiscoveryQuery(config, undefined) as {
        size: number;
        query: { bool: { filter: unknown[] } };
        aggs: { users: { composite: { size: number; sources: unknown[] } } };
      };
      expect(query.size).toBe(0);
      expect(query.query.bool.filter.length).toBeGreaterThanOrEqual(2);
      expect(query.aggs.users.composite.size).toBe(COMPOSITE_PAGE_SIZE);
    }
  );

  it.each(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS)(
    '$id: indexPattern points to the entity index (not a log index)',
    (config) => {
      expect(config.indexPattern('myns')).toContain('.entities.v2.latest.security_myns');
      expect(config.indexPattern('default')).not.toContain('myns');
    }
  );

  it.each(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS)(
    '$id: override query expands raw host.name before CONCAT to handle multi-valued fields',
    (config) => {
      const query = buildTargetsPerActorQuery(config, 'default');
      // MV_EXPAND must precede CONCAT so actors with multiple host.name values
      // (administers multiple hosts) resolve all targets instead of returning NULL.
      expect(query).toContain('raw_identifiers.host.name');
      expect(query).toContain('MV_EXPAND rawKey0');
      expect(query).toContain('CONCAT("host:", rawKey0)');
    }
  );

  it.each(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS)(
    '$id: override query guards against non-EUID target values via RLIKE',
    (config) => {
      const query = buildTargetsPerActorQuery(config, 'default');
      // Rejects empty/prefix-only values like "host:" produced by a blank raw field.
      expect(query).toContain('targetEntityId RLIKE ".+:.+"');
    }
  );

  it.each(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS)(
    '$id: override query does NOT filter by entity.type (both user and host actors)',
    (config) => {
      const query = buildTargetsPerActorQuery(config, 'default');
      expect(query).not.toContain('entity.type ==');
    }
  );

  it.each(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS)(
    '$id: override query sets actorUserId from entity.id (already EUID-prefixed)',
    (config) => {
      const query = buildTargetsPerActorQuery(config, 'default');
      expect(query).toContain('actorUserId = entity.id');
    }
  );

  describe('lookback window', () => {
    it('declares disableLookbackWindow on every config (entity-index source)', () => {
      for (const config of ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS) {
        expect(config.disableLookbackWindow).toBe(true);
      }
    });

    it.each(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS)(
      '$id: Step 1 actor discovery query omits the @timestamp lookback range',
      (config) => {
        const query = buildActorDiscoveryQuery(config, undefined) as {
          query: { bool: { filter: unknown[] } };
        };
        const hasTimestampRange = query.query.bool.filter.some((f) =>
          JSON.stringify(f).includes('"@timestamp"')
        );
        expect(hasTimestampRange).toBe(false);
      }
    );
  });

  describe('actor existence gate', () => {
    it('captures actors that carry administers raw_identifiers under host.name', () => {
      const config = buildAdministersConfigs()[0];
      const filters = config.compositeAggAdditionalFilters ?? [];
      const existenceGate = filters.find((f) =>
        JSON.stringify(f).includes('raw_identifiers.host.name')
      );
      expect(existenceGate).toBeDefined();
      const serialized = JSON.stringify(existenceGate);
      expect(serialized).toContain('entity.relationships.administers.raw_identifiers.host.name');
      expect(serialized).not.toContain('entity.relationships.administers.raw_identifiers.host.id');
    });
  });

  describe('entity.source filter', () => {
    it('Step 1 composite agg filters include an entity.source term for entityanalytics_ad', () => {
      const config = buildAdministersConfigs()[0];
      const filters = config.compositeAggAdditionalFilters ?? [];
      const sourceFilter = filters.find((f) => JSON.stringify(f).includes('entity.source'));
      expect(sourceFilter).toEqual({ term: { 'entity.source': 'entityanalytics_ad' } });
    });

    it('Step 2 ES|QL override filters on entity.source == "entityanalytics_ad"', () => {
      const config = buildAdministersConfigs()[0] as OverrideRelationshipIntegrationConfig;
      const query = config.esqlQueryOverride('default');
      expect(query).toContain('entity.source == "entityanalytics_ad"');
    });
  });

  describe('watermark behaviour', () => {
    const WATERMARK_FIELD = 'entity.lifecycle.last_seen';

    it('with no watermark: query does NOT contain a last_seen filter', () => {
      const config = buildAdministersConfigs()[0] as OverrideRelationshipIntegrationConfig;
      const query = config.esqlQueryOverride('default');
      expect(query).not.toContain(`${WATERMARK_FIELD} >`);
    });

    it('with watermark: query filters on entity.lifecycle.last_seen after the watermark value', () => {
      const ts = '2026-06-01T00:00:00.000Z';
      const config = buildAdministersConfigs(ts)[0] as OverrideRelationshipIntegrationConfig;
      const query = config.esqlQueryOverride('default');
      expect(query).toContain(`${WATERMARK_FIELD} > "${ts}"`);
      // The entity index @timestamp must NOT be used as the incremental signal.
      expect(query).not.toContain('@timestamp >');
    });

    it('with watermark: composite agg filters include an entity.lifecycle.last_seen range', () => {
      const ts = '2026-06-01T00:00:00.000Z';
      const config = buildAdministersConfigs(ts)[0];
      const filters = config.compositeAggAdditionalFilters ?? [];
      const rangeFilters = filters.filter((f) => JSON.stringify(f).includes(WATERMARK_FIELD));
      expect(rangeFilters.length).toBe(1);
      expect(JSON.stringify(rangeFilters[0])).toContain(ts);
      // Guard against a regression back to @timestamp on the entity index.
      const tsFilters = filters.filter((f) => JSON.stringify(f).includes('@timestamp'));
      expect(tsFilters.length).toBe(0);
    });

    it('with no watermark: composite agg filters do NOT include a last_seen range', () => {
      const config = buildAdministersConfigs()[0];
      const filters = config.compositeAggAdditionalFilters ?? [];
      const rangeFilters = filters.filter((f) => JSON.stringify(f).includes(WATERMARK_FIELD));
      expect(rangeFilters.length).toBe(0);
    });
  });

  describe('golden snapshots', () => {
    it.each(ADMINISTERS_INTEGRATION_RELATIONSHIP_CONFIGS)(
      '$id: targets-per-actor ES|QL is locked (no watermark)',
      (config) => {
        expect(buildTargetsPerActorQuery(config, '__namespace__')).toMatchSnapshot();
      }
    );

    it('entityanalytics_ad: targets-per-actor ES|QL with watermark is locked', () => {
      const config = buildAdministersConfigs(
        '2026-06-01T00:00:00.000Z'
      )[0] as OverrideRelationshipIntegrationConfig;
      expect(config.esqlQueryOverride('__namespace__')).toMatchSnapshot();
    });
  });
});
