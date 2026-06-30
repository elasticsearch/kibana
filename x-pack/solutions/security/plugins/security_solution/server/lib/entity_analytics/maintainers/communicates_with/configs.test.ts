/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS } from './configs';
import { buildActorDiscoveryQuery } from '../engine/build_actor_discovery_query';
import { buildTargetsPerActorQuery } from '../engine/build_targets_per_actor_query';
import { COMPOSITE_PAGE_SIZE } from '../engine/constants';
import type { StandardRelationshipIntegrationConfig } from '../engine/types';

const standardConfigs = COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS.filter(
  (c): c is StandardRelationshipIntegrationConfig => c.kind === 'standard'
);

describe('COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS', () => {
  it('ships exactly the five expected integrations', () => {
    expect(COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS.map((c) => c.id).sort()).toEqual([
      'aws_cloudtrail',
      'elastic_defend',
      'jamf_pro',
      'system_auth',
      'system_security',
    ]);
  });

  it('declares relationshipKey "communicates_with" on every config', () => {
    for (const config of standardConfigs) {
      expect(config.relationshipKey).toBe('communicates_with');
    }
  });

  it('uses only kind: "standard" (no bucketing or overrides — communicates_with is a flat targets list)', () => {
    for (const config of COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS) {
      expect(config.kind).toBe('standard');
    }
    expect(standardConfigs.length).toBe(COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS.length);
  });

  it.each(COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS)(
    '$id: builds a syntactically-locked actor discovery query',
    (config) => {
      const query = buildActorDiscoveryQuery(config, undefined) as {
        size: number;
        query: { bool: { filter: unknown[] } };
        aggs: { users: { composite: { size: number; sources: unknown[] } } };
      };
      expect(query.size).toBe(0);
      expect(query.aggs.users.composite.size).toBe(COMPOSITE_PAGE_SIZE);
      expect(query.aggs.users.composite.sources.length).toBeGreaterThan(0);
    }
  );

  it.each(COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS)(
    '$id: indexPattern is namespace-templated',
    (config) => {
      expect(config.indexPattern('myns')).toContain('-myns');
      expect(config.indexPattern('default')).not.toContain('-myns');
    }
  );

  describe('host-targeted configs (require Step1/Step2 EUID-exists consistency)', () => {
    const hostTargeted = COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS.filter(
      (c) => c.targetEntityType === 'host'
    );

    it('all configs are host-targeted', () => {
      expect(hostTargeted.map((c) => c.id).sort()).toEqual([
        'aws_cloudtrail',
        'elastic_defend',
        'jamf_pro',
        'system_auth',
        'system_security',
      ]);
    });

    // Each host-targeted config narrows Step 1 by target presence so it
    // matches what Step 2's WHERE clause filters on. Two equivalent
    // mechanisms exist:
    //   - `requireTargetEntityIdExists: true` for configs whose target eval
    //     reads any host.* EUID source (jamf_pro uses the engine default).
    //   - explicit `compositeAggAdditionalFilters: [{ exists: { field } }]`
    //     for configs whose target eval reads a single specific field
    //     (aws_cloudtrail reads only `host.target.entity.id`, so the broad
    //     EUID gate would surface actors that never produce target rows).
    it.each(hostTargeted)(
      '$id: narrows Step 1 by target presence so Step 1 and Step 2 select the same docs',
      (config) => {
        const broadGate = config.requireTargetEntityIdExists === true;
        const narrowGate =
          config.compositeAggAdditionalFilters?.some((f) => {
            const filter = f as { exists?: { field?: string } };
            return filter.exists?.field !== undefined;
          }) ?? false;
        expect(broadGate || narrowGate).toBe(true);
      }
    );

    it('jamf_pro uses the broad target-EUID gate (no targetEvalOverride) and restricts to UserLogin events in both steps', () => {
      const jamf = standardConfigs.find((c) => c.id === 'jamf_pro');
      expect(jamf).toBeDefined();
      expect(jamf?.requireTargetEntityIdExists).toBe(true);
      expect(jamf?.targetEvalOverride).toBeUndefined();
      expect(jamf?.esqlWhereClause).toContain('"UserLogin"');
      expect(jamf?.compositeAggAdditionalFilters).toContainEqual({
        term: { 'event.action': 'UserLogin' },
      });
    });

    it('aws_cloudtrail uses the narrow exists filter (because targetEvalOverride reads a single field)', () => {
      const aws = standardConfigs.find((c) => c.id === 'aws_cloudtrail');
      expect(aws).toBeDefined();
      expect(aws?.requireTargetEntityIdExists).toBeUndefined();
      expect(aws?.targetEvalOverride).toContain('host.target.entity.id');
      expect(aws?.compositeAggAdditionalFilters).toEqual(
        expect.arrayContaining([{ exists: { field: 'host.target.entity.id' } }])
      );
    });

    it.each(hostTargeted)(
      '$id: produces a single communicates_with STATS column (no bucket classification)',
      (config) => {
        const query = buildTargetsPerActorQuery(config, 'default');
        expect(query).toContain(
          '| STATS communicates_with = VALUES(targetEntityId) BY actorUserId'
        );
        expect(query).not.toContain('access_count');
      }
    );
  });

  describe('non-override configs share the COALESCE empty-guard form', () => {
    it.each(standardConfigs)('$id: uses COALESCE for the actorUserId guard', (config) => {
      expect(buildTargetsPerActorQuery(config, 'default')).toContain(
        '| WHERE COALESCE(actorUserId, "") != ""'
      );
    });

    it.each(standardConfigs)('$id: uses COALESCE for the targetEntityId guard', (config) => {
      expect(buildTargetsPerActorQuery(config, 'default')).toContain(
        '| WHERE COALESCE(targetEntityId, "") != ""'
      );
    });
  });

  // Golden snapshots: any future template change will surface here in PR review.
  // Update with `--ci=false -u` only when the change is intentional and reviewed.
  describe('golden snapshots', () => {
    it.each(COMMUNICATES_WITH_INTEGRATION_RELATIONSHIP_CONFIGS)(
      '$id: targets-per-actor ES|QL is locked',
      (config) => {
        expect(buildTargetsPerActorQuery(config, '__namespace__')).toMatchSnapshot();
      }
    );
  });
});
