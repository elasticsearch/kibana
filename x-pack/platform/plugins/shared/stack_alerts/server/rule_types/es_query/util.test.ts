/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { OnlyEsQueryRuleParams } from './types';
import type { Comparator } from '../../../common/comparator_types';
import {
  getParsedQuery,
  checkForShardFailures,
  getSourceFields,
  getSourceFieldsFromHit,
} from './util';

describe('es_query utils', () => {
  const defaultProps = {
    size: 3,
    timeWindowSize: 5,
    timeWindowUnit: 'm',
    threshold: [],
    thresholdComparator: '>=' as Comparator,
    esQuery: '{ "query": "test-query" }',
    index: ['test-index'],
    timeField: '',
    searchType: 'esQuery',
    excludeHitsFromPreviousRun: true,
    aggType: 'count',
    groupBy: 'all',
    searchConfiguration: {},
    esqlQuery: { esql: 'test-query' },
  };

  describe('getParsedQuery', () => {
    it('should return search params correctly', () => {
      const parsedQuery = getParsedQuery(defaultProps as OnlyEsQueryRuleParams);
      expect(parsedQuery.query).toBe('test-query');
    });

    it('should throw invalid query error', () => {
      expect(() =>
        getParsedQuery({ ...defaultProps, esQuery: '' } as OnlyEsQueryRuleParams)
      ).toThrow('invalid query specified: "" - query must be JSON');
    });

    it('should throw invalid query error due to missing query property', () => {
      expect(() =>
        getParsedQuery({
          ...defaultProps,
          esQuery: '{ "someProperty": "test-query" }',
        } as OnlyEsQueryRuleParams)
      ).toThrow('invalid query specified: "{ "someProperty": "test-query" }" - query must be JSON');
    });
  });

  describe('parseShardFailures', () => {
    it('should return error message if any failures in the shard response', () => {
      expect(
        checkForShardFailures({
          took: 16,
          timed_out: false,
          _shards: {
            total: 51,
            successful: 48,
            skipped: 48,
            failed: 3,
            failures: [
              {
                shard: 0,
                index: 'ccs-index',
                node: '8jMc8jz-Q6qFmKZXfijt-A',
                reason: {
                  type: 'illegal_argument_exception',
                  reason:
                    "Top hits result window is too large, the top hits aggregator [topHitsAgg]'s from + size must be less than or equal to: [100] but was [300]. This limit can be set by changing the [index.max_inner_result_window] index level setting.",
                },
              },
            ],
          },
          _clusters: { total: 1, successful: 1, running: 0, partial: 0, failed: 0, skipped: 0 },
          hits: { total: { value: 0, relation: 'eq' }, max_score: 0, hits: [] },
        })
      ).toEqual(
        `Top hits result window is too large, the top hits aggregator [topHitsAgg]'s from + size must be less than or equal to: [100] but was [300]. This limit can be set by changing the [index.max_inner_result_window] index level setting.`
      );
    });

    it('should return default error message if malformed error', () => {
      expect(
        checkForShardFailures({
          took: 16,
          timed_out: false,
          _shards: {
            total: 51,
            successful: 48,
            skipped: 48,
            failed: 3,
            failures: [
              // @ts-expect-error
              {
                shard: 0,
                index: 'ccs-index',
                node: '8jMc8jz-Q6qFmKZXfijt-A',
              },
            ],
          },
          _clusters: { total: 1, successful: 1, running: 0, partial: 0, failed: 0, skipped: 0 },
          hits: { total: { value: 0, relation: 'eq' }, max_score: 0, hits: [] },
        })
      ).toEqual(`Search returned partial results due to shard failures.`);

      expect(
        checkForShardFailures({
          took: 16,
          timed_out: false,
          _shards: { total: 51, successful: 48, skipped: 48, failed: 3, failures: [] },
          hits: {
            total: {
              value: 0,
              relation: 'eq',
            },
            max_score: 0,
            hits: [],
          },
        })
      ).toEqual(`Search returned partial results due to shard failures.`);
    });

    it('should return error if any skipped clusters with failures', () => {
      expect(
        checkForShardFailures({
          took: 6,
          timed_out: false,
          num_reduce_phases: 0,
          _shards: { total: 0, successful: 0, skipped: 0, failed: 0 },
          _clusters: {
            total: 1,
            successful: 0,
            skipped: 1,
            running: 0,
            partial: 0,
            failed: 0,
            details: {
              test: {
                status: 'skipped',
                indices: '.kibana-event-log*',
                timed_out: false,
                failures: [
                  {
                    shard: -1,
                    // @ts-expect-error
                    index: null,
                    reason: {
                      type: 'search_phase_execution_exception',
                      reason: 'all shards failed',
                      phase: 'query',
                      grouped: true,
                      failed_shards: [
                        {
                          shard: 0,
                          index: 'test:.ds-.kibana-event-log-ds-2024.07.31-000001',
                          node: 'X1aMu4BpQR-7PHi-bEI8Fw',
                          reason: {
                            type: 'illegal_argument_exception',
                            reason:
                              "Top hits result window is too large, the top hits aggregator [topHitsAgg]'s from + size must be less than or equal to: [100] but was [300]. This limit can be set by changing the [index.max_inner_result_window] index level setting.",
                          },
                        },
                      ],
                      caused_by: {
                        type: '',
                        reason:
                          "Top hits result window is too large, the top hits aggregator [topHitsAgg]'s from + size must be less than or equal to: [100] but was [300]. This limit can be set by changing the [index.max_inner_result_window] index level setting.",
                        caused_by: {
                          type: 'illegal_argument_exception',
                          reason:
                            "Top hits result window is too large, the top hits aggregator [topHitsAgg]'s from + size must be less than or equal to: [100] but was [300]. This limit can be set by changing the [index.max_inner_result_window] index level setting.",
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
          hits: { total: { value: 0, relation: 'eq' }, max_score: 0, hits: [] },
        })
      ).toEqual(
        `Top hits result window is too large, the top hits aggregator [topHitsAgg]'s from + size must be less than or equal to: [100] but was [300]. This limit can be set by changing the [index.max_inner_result_window] index level setting.`
      );
    });

    it('should return default error message if malformed skipped cluster error', () => {
      expect(
        checkForShardFailures({
          took: 6,
          timed_out: false,
          num_reduce_phases: 0,
          _shards: { total: 0, successful: 0, skipped: 0, failed: 0 },
          _clusters: {
            total: 1,
            successful: 0,
            skipped: 1,
            running: 0,
            partial: 0,
            failed: 0,
            details: {
              test: {
                status: 'skipped',
                indices: '.kibana-event-log*',
                timed_out: false,
                failures: [],
              },
            },
          },
          hits: { total: { value: 0, relation: 'eq' }, max_score: 0, hits: [] },
        })
      ).toEqual(`Search returned partial results due to skipped cluster errors.`);

      expect(
        checkForShardFailures({
          took: 6,
          timed_out: false,
          num_reduce_phases: 0,
          _shards: { total: 0, successful: 0, skipped: 0, failed: 0 },
          _clusters: {
            total: 1,
            successful: 0,
            skipped: 1,
            running: 0,
            partial: 0,
            failed: 0,
            details: {
              test: {
                status: 'skipped',
                indices: '.kibana-event-log*',
                timed_out: false,
                // @ts-expect-error
                failures: [{ shard: -1 }],
              },
            },
          },
          hits: { total: { value: 0, relation: 'eq' }, max_score: 0, hits: [] },
        })
      ).toEqual(`Search returned partial results due to skipped cluster errors.`);
    });

    it('should return undefined if no failures', () => {
      expect(
        checkForShardFailures({
          took: 16,
          timed_out: false,
          _shards: { total: 51, successful: 51, skipped: 51, failed: 0, failures: [] },
          _clusters: { total: 1, successful: 1, running: 0, partial: 0, failed: 0, skipped: 0 },
          hits: { total: { value: 0, relation: 'eq' }, max_score: 0, hits: [] },
        })
      ).toBeUndefined();
    });
  });

  describe('getSourceFieldsFromHit', () => {
    const candidateFields = [
      { label: 'host.hostname', searchPath: 'host.hostname' },
      { label: 'host.id', searchPath: 'host.id' },
      { label: 'service.name', searchPath: 'service.name' },
    ];

    it('should return empty object when hit is undefined', () => {
      expect(getSourceFieldsFromHit(undefined, candidateFields)).toEqual({});
    });

    it('should return empty object when sourceFieldsParams is empty', () => {
      expect(getSourceFieldsFromHit({ 'host.hostname': 'host-1' }, [])).toEqual({});
    });

    it('should return empty object when no matching keys exist on the hit', () => {
      expect(getSourceFieldsFromHit({ unrelated: 'value' }, candidateFields)).toEqual({});
    });

    it('should return matched fields as string arrays', () => {
      const hit = {
        'host.hostname': 'host-1',
        'host.id': '42',
      };
      expect(getSourceFieldsFromHit(hit, candidateFields)).toEqual({
        'host.hostname': ['host-1'],
        'host.id': ['42'],
      });
    });

    it('should preserve array values and normalise each element to a string', () => {
      const hit = {
        'host.hostname': ['host-1', 'host-2'],
        'host.id': [1, 2],
      };
      expect(getSourceFieldsFromHit(hit, candidateFields)).toEqual({
        'host.hostname': ['host-1', 'host-2'],
        'host.id': ['1', '2'],
      });
    });

    it('should skip null and undefined values', () => {
      const hit = {
        'host.hostname': null,
        'host.id': undefined,
        'service.name': 'my-service',
      };
      expect(getSourceFieldsFromHit(hit, candidateFields)).toEqual({
        'service.name': ['my-service'],
      });
    });

    it('should use literal dotted bracket access and not traverse nested objects', () => {
      // Ensure we do NOT mistake a nested object for the dotted key
      const hit = {
        host: { hostname: 'should-be-ignored' },
        'host.hostname': 'correct-value',
      };
      expect(getSourceFieldsFromHit(hit, candidateFields)).toEqual({
        'host.hostname': ['correct-value'],
      });
    });
  });

  describe('getSourceFields', () => {
    it('should generate the correct source fields', async () => {
      const sourceFields = getSourceFields();
      expect(sourceFields).toMatchInlineSnapshot(`
        Array [
          Object {
            "label": "agent.build.original",
            "searchPath": "agent.build.original",
          },
          Object {
            "label": "agent.ephemeral_id",
            "searchPath": "agent.ephemeral_id",
          },
          Object {
            "label": "agent.id",
            "searchPath": "agent.id",
          },
          Object {
            "label": "agent.name",
            "searchPath": "agent.name",
          },
          Object {
            "label": "agent.type",
            "searchPath": "agent.type",
          },
          Object {
            "label": "agent.version",
            "searchPath": "agent.version",
          },
          Object {
            "label": "client.address",
            "searchPath": "client.address",
          },
          Object {
            "label": "client.as.number",
            "searchPath": "client.as.number",
          },
          Object {
            "label": "client.as.organization.name",
            "searchPath": "client.as.organization.name",
          },
          Object {
            "label": "client.bytes",
            "searchPath": "client.bytes",
          },
          Object {
            "label": "client.domain",
            "searchPath": "client.domain",
          },
          Object {
            "label": "client.geo.city_name",
            "searchPath": "client.geo.city_name",
          },
          Object {
            "label": "client.geo.continent_code",
            "searchPath": "client.geo.continent_code",
          },
          Object {
            "label": "client.geo.continent_name",
            "searchPath": "client.geo.continent_name",
          },
          Object {
            "label": "client.geo.country_iso_code",
            "searchPath": "client.geo.country_iso_code",
          },
          Object {
            "label": "client.geo.country_name",
            "searchPath": "client.geo.country_name",
          },
          Object {
            "label": "client.geo.location",
            "searchPath": "client.geo.location",
          },
          Object {
            "label": "client.geo.name",
            "searchPath": "client.geo.name",
          },
          Object {
            "label": "client.geo.postal_code",
            "searchPath": "client.geo.postal_code",
          },
          Object {
            "label": "client.geo.region_iso_code",
            "searchPath": "client.geo.region_iso_code",
          },
          Object {
            "label": "client.geo.region_name",
            "searchPath": "client.geo.region_name",
          },
          Object {
            "label": "client.geo.timezone",
            "searchPath": "client.geo.timezone",
          },
          Object {
            "label": "client.ip",
            "searchPath": "client.ip",
          },
          Object {
            "label": "client.mac",
            "searchPath": "client.mac",
          },
          Object {
            "label": "client.nat.ip",
            "searchPath": "client.nat.ip",
          },
          Object {
            "label": "client.nat.port",
            "searchPath": "client.nat.port",
          },
          Object {
            "label": "client.packets",
            "searchPath": "client.packets",
          },
          Object {
            "label": "client.port",
            "searchPath": "client.port",
          },
          Object {
            "label": "client.registered_domain",
            "searchPath": "client.registered_domain",
          },
          Object {
            "label": "client.subdomain",
            "searchPath": "client.subdomain",
          },
          Object {
            "label": "client.top_level_domain",
            "searchPath": "client.top_level_domain",
          },
          Object {
            "label": "client.user.domain",
            "searchPath": "client.user.domain",
          },
          Object {
            "label": "client.user.email",
            "searchPath": "client.user.email",
          },
          Object {
            "label": "client.user.full_name",
            "searchPath": "client.user.full_name",
          },
          Object {
            "label": "client.user.group.domain",
            "searchPath": "client.user.group.domain",
          },
          Object {
            "label": "client.user.group.id",
            "searchPath": "client.user.group.id",
          },
          Object {
            "label": "client.user.group.name",
            "searchPath": "client.user.group.name",
          },
          Object {
            "label": "client.user.hash",
            "searchPath": "client.user.hash",
          },
          Object {
            "label": "client.user.id",
            "searchPath": "client.user.id",
          },
          Object {
            "label": "client.user.name",
            "searchPath": "client.user.name",
          },
          Object {
            "label": "client.user.roles",
            "searchPath": "client.user.roles",
          },
          Object {
            "label": "cloud.account.id",
            "searchPath": "cloud.account.id",
          },
          Object {
            "label": "cloud.account.name",
            "searchPath": "cloud.account.name",
          },
          Object {
            "label": "cloud.availability_zone",
            "searchPath": "cloud.availability_zone",
          },
          Object {
            "label": "cloud.entity.attributes",
            "searchPath": "cloud.entity.attributes",
          },
          Object {
            "label": "cloud.entity.behavior",
            "searchPath": "cloud.entity.behavior",
          },
          Object {
            "label": "cloud.entity.display_name",
            "searchPath": "cloud.entity.display_name",
          },
          Object {
            "label": "cloud.entity.id",
            "searchPath": "cloud.entity.id",
          },
          Object {
            "label": "cloud.entity.last_seen_timestamp",
            "searchPath": "cloud.entity.last_seen_timestamp",
          },
          Object {
            "label": "cloud.entity.lifecycle",
            "searchPath": "cloud.entity.lifecycle",
          },
          Object {
            "label": "cloud.entity.metrics",
            "searchPath": "cloud.entity.metrics",
          },
          Object {
            "label": "cloud.entity.name",
            "searchPath": "cloud.entity.name",
          },
          Object {
            "label": "cloud.entity.raw",
            "searchPath": "cloud.entity.raw",
          },
          Object {
            "label": "cloud.entity.reference",
            "searchPath": "cloud.entity.reference",
          },
          Object {
            "label": "cloud.entity.source",
            "searchPath": "cloud.entity.source",
          },
          Object {
            "label": "cloud.entity.sub_type",
            "searchPath": "cloud.entity.sub_type",
          },
          Object {
            "label": "cloud.entity.type",
            "searchPath": "cloud.entity.type",
          },
          Object {
            "label": "cloud.instance.id",
            "searchPath": "cloud.instance.id",
          },
          Object {
            "label": "cloud.instance.name",
            "searchPath": "cloud.instance.name",
          },
          Object {
            "label": "cloud.machine.type",
            "searchPath": "cloud.machine.type",
          },
          Object {
            "label": "cloud.origin.account.id",
            "searchPath": "cloud.origin.account.id",
          },
          Object {
            "label": "cloud.origin.account.name",
            "searchPath": "cloud.origin.account.name",
          },
          Object {
            "label": "cloud.origin.availability_zone",
            "searchPath": "cloud.origin.availability_zone",
          },
          Object {
            "label": "cloud.origin.entity.attributes",
            "searchPath": "cloud.origin.entity.attributes",
          },
          Object {
            "label": "cloud.origin.entity.behavior",
            "searchPath": "cloud.origin.entity.behavior",
          },
          Object {
            "label": "cloud.origin.entity.display_name",
            "searchPath": "cloud.origin.entity.display_name",
          },
          Object {
            "label": "cloud.origin.entity.id",
            "searchPath": "cloud.origin.entity.id",
          },
          Object {
            "label": "cloud.origin.entity.last_seen_timestamp",
            "searchPath": "cloud.origin.entity.last_seen_timestamp",
          },
          Object {
            "label": "cloud.origin.entity.lifecycle",
            "searchPath": "cloud.origin.entity.lifecycle",
          },
          Object {
            "label": "cloud.origin.entity.metrics",
            "searchPath": "cloud.origin.entity.metrics",
          },
          Object {
            "label": "cloud.origin.entity.name",
            "searchPath": "cloud.origin.entity.name",
          },
          Object {
            "label": "cloud.origin.entity.raw",
            "searchPath": "cloud.origin.entity.raw",
          },
          Object {
            "label": "cloud.origin.entity.reference",
            "searchPath": "cloud.origin.entity.reference",
          },
          Object {
            "label": "cloud.origin.entity.source",
            "searchPath": "cloud.origin.entity.source",
          },
          Object {
            "label": "cloud.origin.entity.sub_type",
            "searchPath": "cloud.origin.entity.sub_type",
          },
          Object {
            "label": "cloud.origin.entity.type",
            "searchPath": "cloud.origin.entity.type",
          },
          Object {
            "label": "cloud.origin.instance.id",
            "searchPath": "cloud.origin.instance.id",
          },
          Object {
            "label": "cloud.origin.instance.name",
            "searchPath": "cloud.origin.instance.name",
          },
          Object {
            "label": "cloud.origin.machine.type",
            "searchPath": "cloud.origin.machine.type",
          },
          Object {
            "label": "cloud.origin.project.id",
            "searchPath": "cloud.origin.project.id",
          },
          Object {
            "label": "cloud.origin.project.name",
            "searchPath": "cloud.origin.project.name",
          },
          Object {
            "label": "cloud.origin.provider",
            "searchPath": "cloud.origin.provider",
          },
          Object {
            "label": "cloud.origin.region",
            "searchPath": "cloud.origin.region",
          },
          Object {
            "label": "cloud.origin.service.name",
            "searchPath": "cloud.origin.service.name",
          },
          Object {
            "label": "cloud.project.id",
            "searchPath": "cloud.project.id",
          },
          Object {
            "label": "cloud.project.name",
            "searchPath": "cloud.project.name",
          },
          Object {
            "label": "cloud.provider",
            "searchPath": "cloud.provider",
          },
          Object {
            "label": "cloud.region",
            "searchPath": "cloud.region",
          },
          Object {
            "label": "cloud.service.name",
            "searchPath": "cloud.service.name",
          },
          Object {
            "label": "cloud.target.account.id",
            "searchPath": "cloud.target.account.id",
          },
          Object {
            "label": "cloud.target.account.name",
            "searchPath": "cloud.target.account.name",
          },
          Object {
            "label": "cloud.target.availability_zone",
            "searchPath": "cloud.target.availability_zone",
          },
          Object {
            "label": "cloud.target.entity.attributes",
            "searchPath": "cloud.target.entity.attributes",
          },
          Object {
            "label": "cloud.target.entity.behavior",
            "searchPath": "cloud.target.entity.behavior",
          },
          Object {
            "label": "cloud.target.entity.display_name",
            "searchPath": "cloud.target.entity.display_name",
          },
          Object {
            "label": "cloud.target.entity.id",
            "searchPath": "cloud.target.entity.id",
          },
          Object {
            "label": "cloud.target.entity.last_seen_timestamp",
            "searchPath": "cloud.target.entity.last_seen_timestamp",
          },
          Object {
            "label": "cloud.target.entity.lifecycle",
            "searchPath": "cloud.target.entity.lifecycle",
          },
          Object {
            "label": "cloud.target.entity.metrics",
            "searchPath": "cloud.target.entity.metrics",
          },
          Object {
            "label": "cloud.target.entity.name",
            "searchPath": "cloud.target.entity.name",
          },
          Object {
            "label": "cloud.target.entity.raw",
            "searchPath": "cloud.target.entity.raw",
          },
          Object {
            "label": "cloud.target.entity.reference",
            "searchPath": "cloud.target.entity.reference",
          },
          Object {
            "label": "cloud.target.entity.source",
            "searchPath": "cloud.target.entity.source",
          },
          Object {
            "label": "cloud.target.entity.sub_type",
            "searchPath": "cloud.target.entity.sub_type",
          },
          Object {
            "label": "cloud.target.entity.type",
            "searchPath": "cloud.target.entity.type",
          },
          Object {
            "label": "cloud.target.instance.id",
            "searchPath": "cloud.target.instance.id",
          },
          Object {
            "label": "cloud.target.instance.name",
            "searchPath": "cloud.target.instance.name",
          },
          Object {
            "label": "cloud.target.machine.type",
            "searchPath": "cloud.target.machine.type",
          },
          Object {
            "label": "cloud.target.project.id",
            "searchPath": "cloud.target.project.id",
          },
          Object {
            "label": "cloud.target.project.name",
            "searchPath": "cloud.target.project.name",
          },
          Object {
            "label": "cloud.target.provider",
            "searchPath": "cloud.target.provider",
          },
          Object {
            "label": "cloud.target.region",
            "searchPath": "cloud.target.region",
          },
          Object {
            "label": "cloud.target.service.name",
            "searchPath": "cloud.target.service.name",
          },
          Object {
            "label": "container.cpu.usage",
            "searchPath": "container.cpu.usage",
          },
          Object {
            "label": "container.disk.read.bytes",
            "searchPath": "container.disk.read.bytes",
          },
          Object {
            "label": "container.disk.write.bytes",
            "searchPath": "container.disk.write.bytes",
          },
          Object {
            "label": "container.id",
            "searchPath": "container.id",
          },
          Object {
            "label": "container.image.hash.all",
            "searchPath": "container.image.hash.all",
          },
          Object {
            "label": "container.image.name",
            "searchPath": "container.image.name",
          },
          Object {
            "label": "container.image.tag",
            "searchPath": "container.image.tag",
          },
          Object {
            "label": "container.labels",
            "searchPath": "container.labels",
          },
          Object {
            "label": "container.memory.usage",
            "searchPath": "container.memory.usage",
          },
          Object {
            "label": "container.name",
            "searchPath": "container.name",
          },
          Object {
            "label": "container.network.egress.bytes",
            "searchPath": "container.network.egress.bytes",
          },
          Object {
            "label": "container.network.ingress.bytes",
            "searchPath": "container.network.ingress.bytes",
          },
          Object {
            "label": "container.runtime",
            "searchPath": "container.runtime",
          },
          Object {
            "label": "container.security_context.privileged",
            "searchPath": "container.security_context.privileged",
          },
          Object {
            "label": "destination.address",
            "searchPath": "destination.address",
          },
          Object {
            "label": "destination.as.number",
            "searchPath": "destination.as.number",
          },
          Object {
            "label": "destination.as.organization.name",
            "searchPath": "destination.as.organization.name",
          },
          Object {
            "label": "destination.bytes",
            "searchPath": "destination.bytes",
          },
          Object {
            "label": "destination.domain",
            "searchPath": "destination.domain",
          },
          Object {
            "label": "destination.geo.city_name",
            "searchPath": "destination.geo.city_name",
          },
          Object {
            "label": "destination.geo.continent_code",
            "searchPath": "destination.geo.continent_code",
          },
          Object {
            "label": "destination.geo.continent_name",
            "searchPath": "destination.geo.continent_name",
          },
          Object {
            "label": "destination.geo.country_iso_code",
            "searchPath": "destination.geo.country_iso_code",
          },
          Object {
            "label": "destination.geo.country_name",
            "searchPath": "destination.geo.country_name",
          },
          Object {
            "label": "destination.geo.location",
            "searchPath": "destination.geo.location",
          },
          Object {
            "label": "destination.geo.name",
            "searchPath": "destination.geo.name",
          },
          Object {
            "label": "destination.geo.postal_code",
            "searchPath": "destination.geo.postal_code",
          },
          Object {
            "label": "destination.geo.region_iso_code",
            "searchPath": "destination.geo.region_iso_code",
          },
          Object {
            "label": "destination.geo.region_name",
            "searchPath": "destination.geo.region_name",
          },
          Object {
            "label": "destination.geo.timezone",
            "searchPath": "destination.geo.timezone",
          },
          Object {
            "label": "destination.ip",
            "searchPath": "destination.ip",
          },
          Object {
            "label": "destination.mac",
            "searchPath": "destination.mac",
          },
          Object {
            "label": "destination.nat.ip",
            "searchPath": "destination.nat.ip",
          },
          Object {
            "label": "destination.nat.port",
            "searchPath": "destination.nat.port",
          },
          Object {
            "label": "destination.packets",
            "searchPath": "destination.packets",
          },
          Object {
            "label": "destination.port",
            "searchPath": "destination.port",
          },
          Object {
            "label": "destination.registered_domain",
            "searchPath": "destination.registered_domain",
          },
          Object {
            "label": "destination.subdomain",
            "searchPath": "destination.subdomain",
          },
          Object {
            "label": "destination.top_level_domain",
            "searchPath": "destination.top_level_domain",
          },
          Object {
            "label": "destination.user.domain",
            "searchPath": "destination.user.domain",
          },
          Object {
            "label": "destination.user.email",
            "searchPath": "destination.user.email",
          },
          Object {
            "label": "destination.user.full_name",
            "searchPath": "destination.user.full_name",
          },
          Object {
            "label": "destination.user.group.domain",
            "searchPath": "destination.user.group.domain",
          },
          Object {
            "label": "destination.user.group.id",
            "searchPath": "destination.user.group.id",
          },
          Object {
            "label": "destination.user.group.name",
            "searchPath": "destination.user.group.name",
          },
          Object {
            "label": "destination.user.hash",
            "searchPath": "destination.user.hash",
          },
          Object {
            "label": "destination.user.id",
            "searchPath": "destination.user.id",
          },
          Object {
            "label": "destination.user.name",
            "searchPath": "destination.user.name",
          },
          Object {
            "label": "destination.user.roles",
            "searchPath": "destination.user.roles",
          },
          Object {
            "label": "device.id",
            "searchPath": "device.id",
          },
          Object {
            "label": "device.manufacturer",
            "searchPath": "device.manufacturer",
          },
          Object {
            "label": "device.model.identifier",
            "searchPath": "device.model.identifier",
          },
          Object {
            "label": "device.model.name",
            "searchPath": "device.model.name",
          },
          Object {
            "label": "device.product.id",
            "searchPath": "device.product.id",
          },
          Object {
            "label": "device.product.name",
            "searchPath": "device.product.name",
          },
          Object {
            "label": "device.serial_number",
            "searchPath": "device.serial_number",
          },
          Object {
            "label": "device.type",
            "searchPath": "device.type",
          },
          Object {
            "label": "device.vendor.id",
            "searchPath": "device.vendor.id",
          },
          Object {
            "label": "device.vendor.name",
            "searchPath": "device.vendor.name",
          },
          Object {
            "label": "dll.code_signature.digest_algorithm",
            "searchPath": "dll.code_signature.digest_algorithm",
          },
          Object {
            "label": "dll.code_signature.exists",
            "searchPath": "dll.code_signature.exists",
          },
          Object {
            "label": "dll.code_signature.flags",
            "searchPath": "dll.code_signature.flags",
          },
          Object {
            "label": "dll.code_signature.signing_id",
            "searchPath": "dll.code_signature.signing_id",
          },
          Object {
            "label": "dll.code_signature.status",
            "searchPath": "dll.code_signature.status",
          },
          Object {
            "label": "dll.code_signature.subject_name",
            "searchPath": "dll.code_signature.subject_name",
          },
          Object {
            "label": "dll.code_signature.team_id",
            "searchPath": "dll.code_signature.team_id",
          },
          Object {
            "label": "dll.code_signature.thumbprint_sha256",
            "searchPath": "dll.code_signature.thumbprint_sha256",
          },
          Object {
            "label": "dll.code_signature.timestamp",
            "searchPath": "dll.code_signature.timestamp",
          },
          Object {
            "label": "dll.code_signature.trusted",
            "searchPath": "dll.code_signature.trusted",
          },
          Object {
            "label": "dll.code_signature.valid",
            "searchPath": "dll.code_signature.valid",
          },
          Object {
            "label": "dll.hash.cdhash",
            "searchPath": "dll.hash.cdhash",
          },
          Object {
            "label": "dll.hash.md5",
            "searchPath": "dll.hash.md5",
          },
          Object {
            "label": "dll.hash.sha1",
            "searchPath": "dll.hash.sha1",
          },
          Object {
            "label": "dll.hash.sha256",
            "searchPath": "dll.hash.sha256",
          },
          Object {
            "label": "dll.hash.sha384",
            "searchPath": "dll.hash.sha384",
          },
          Object {
            "label": "dll.hash.sha512",
            "searchPath": "dll.hash.sha512",
          },
          Object {
            "label": "dll.hash.ssdeep",
            "searchPath": "dll.hash.ssdeep",
          },
          Object {
            "label": "dll.hash.tlsh",
            "searchPath": "dll.hash.tlsh",
          },
          Object {
            "label": "dll.name",
            "searchPath": "dll.name",
          },
          Object {
            "label": "dll.origin_referrer_url",
            "searchPath": "dll.origin_referrer_url",
          },
          Object {
            "label": "dll.origin_url",
            "searchPath": "dll.origin_url",
          },
          Object {
            "label": "dll.path",
            "searchPath": "dll.path",
          },
          Object {
            "label": "dll.pe.architecture",
            "searchPath": "dll.pe.architecture",
          },
          Object {
            "label": "dll.pe.company",
            "searchPath": "dll.pe.company",
          },
          Object {
            "label": "dll.pe.description",
            "searchPath": "dll.pe.description",
          },
          Object {
            "label": "dll.pe.file_version",
            "searchPath": "dll.pe.file_version",
          },
          Object {
            "label": "dll.pe.go_import_hash",
            "searchPath": "dll.pe.go_import_hash",
          },
          Object {
            "label": "dll.pe.go_imports_names_entropy",
            "searchPath": "dll.pe.go_imports_names_entropy",
          },
          Object {
            "label": "dll.pe.go_imports_names_var_entropy",
            "searchPath": "dll.pe.go_imports_names_var_entropy",
          },
          Object {
            "label": "dll.pe.go_stripped",
            "searchPath": "dll.pe.go_stripped",
          },
          Object {
            "label": "dll.pe.imphash",
            "searchPath": "dll.pe.imphash",
          },
          Object {
            "label": "dll.pe.import_hash",
            "searchPath": "dll.pe.import_hash",
          },
          Object {
            "label": "dll.pe.imports_names_entropy",
            "searchPath": "dll.pe.imports_names_entropy",
          },
          Object {
            "label": "dll.pe.imports_names_var_entropy",
            "searchPath": "dll.pe.imports_names_var_entropy",
          },
          Object {
            "label": "dll.pe.original_file_name",
            "searchPath": "dll.pe.original_file_name",
          },
          Object {
            "label": "dll.pe.pehash",
            "searchPath": "dll.pe.pehash",
          },
          Object {
            "label": "dll.pe.product",
            "searchPath": "dll.pe.product",
          },
          Object {
            "label": "dns.answers",
            "searchPath": "dns.answers",
          },
          Object {
            "label": "dns.answers.class",
            "searchPath": "dns.answers.class",
          },
          Object {
            "label": "dns.answers.data",
            "searchPath": "dns.answers.data",
          },
          Object {
            "label": "dns.answers.name",
            "searchPath": "dns.answers.name",
          },
          Object {
            "label": "dns.answers.ttl",
            "searchPath": "dns.answers.ttl",
          },
          Object {
            "label": "dns.answers.type",
            "searchPath": "dns.answers.type",
          },
          Object {
            "label": "dns.header_flags",
            "searchPath": "dns.header_flags",
          },
          Object {
            "label": "dns.id",
            "searchPath": "dns.id",
          },
          Object {
            "label": "dns.op_code",
            "searchPath": "dns.op_code",
          },
          Object {
            "label": "dns.question.class",
            "searchPath": "dns.question.class",
          },
          Object {
            "label": "dns.question.name",
            "searchPath": "dns.question.name",
          },
          Object {
            "label": "dns.question.registered_domain",
            "searchPath": "dns.question.registered_domain",
          },
          Object {
            "label": "dns.question.subdomain",
            "searchPath": "dns.question.subdomain",
          },
          Object {
            "label": "dns.question.top_level_domain",
            "searchPath": "dns.question.top_level_domain",
          },
          Object {
            "label": "dns.question.type",
            "searchPath": "dns.question.type",
          },
          Object {
            "label": "dns.resolved_ip",
            "searchPath": "dns.resolved_ip",
          },
          Object {
            "label": "dns.response_code",
            "searchPath": "dns.response_code",
          },
          Object {
            "label": "dns.type",
            "searchPath": "dns.type",
          },
          Object {
            "label": "ecs.version",
            "searchPath": "ecs.version",
          },
          Object {
            "label": "email.bcc.address",
            "searchPath": "email.bcc.address",
          },
          Object {
            "label": "email.cc.address",
            "searchPath": "email.cc.address",
          },
          Object {
            "label": "email.content_type",
            "searchPath": "email.content_type",
          },
          Object {
            "label": "email.delivery_timestamp",
            "searchPath": "email.delivery_timestamp",
          },
          Object {
            "label": "email.direction",
            "searchPath": "email.direction",
          },
          Object {
            "label": "email.from.address",
            "searchPath": "email.from.address",
          },
          Object {
            "label": "email.local_id",
            "searchPath": "email.local_id",
          },
          Object {
            "label": "email.message_id",
            "searchPath": "email.message_id",
          },
          Object {
            "label": "email.origination_timestamp",
            "searchPath": "email.origination_timestamp",
          },
          Object {
            "label": "email.reply_to.address",
            "searchPath": "email.reply_to.address",
          },
          Object {
            "label": "email.sender.address",
            "searchPath": "email.sender.address",
          },
          Object {
            "label": "email.subject",
            "searchPath": "email.subject",
          },
          Object {
            "label": "email.to.address",
            "searchPath": "email.to.address",
          },
          Object {
            "label": "email.x_mailer",
            "searchPath": "email.x_mailer",
          },
          Object {
            "label": "entity.attributes",
            "searchPath": "entity.attributes",
          },
          Object {
            "label": "entity.behavior",
            "searchPath": "entity.behavior",
          },
          Object {
            "label": "entity.display_name",
            "searchPath": "entity.display_name",
          },
          Object {
            "label": "entity.id",
            "searchPath": "entity.id",
          },
          Object {
            "label": "entity.last_seen_timestamp",
            "searchPath": "entity.last_seen_timestamp",
          },
          Object {
            "label": "entity.lifecycle",
            "searchPath": "entity.lifecycle",
          },
          Object {
            "label": "entity.metrics",
            "searchPath": "entity.metrics",
          },
          Object {
            "label": "entity.name",
            "searchPath": "entity.name",
          },
          Object {
            "label": "entity.raw",
            "searchPath": "entity.raw",
          },
          Object {
            "label": "entity.reference",
            "searchPath": "entity.reference",
          },
          Object {
            "label": "entity.source",
            "searchPath": "entity.source",
          },
          Object {
            "label": "entity.sub_type",
            "searchPath": "entity.sub_type",
          },
          Object {
            "label": "entity.target.attributes",
            "searchPath": "entity.target.attributes",
          },
          Object {
            "label": "entity.target.behavior",
            "searchPath": "entity.target.behavior",
          },
          Object {
            "label": "entity.target.display_name",
            "searchPath": "entity.target.display_name",
          },
          Object {
            "label": "entity.target.id",
            "searchPath": "entity.target.id",
          },
          Object {
            "label": "entity.target.last_seen_timestamp",
            "searchPath": "entity.target.last_seen_timestamp",
          },
          Object {
            "label": "entity.target.lifecycle",
            "searchPath": "entity.target.lifecycle",
          },
          Object {
            "label": "entity.target.metrics",
            "searchPath": "entity.target.metrics",
          },
          Object {
            "label": "entity.target.name",
            "searchPath": "entity.target.name",
          },
          Object {
            "label": "entity.target.raw",
            "searchPath": "entity.target.raw",
          },
          Object {
            "label": "entity.target.reference",
            "searchPath": "entity.target.reference",
          },
          Object {
            "label": "entity.target.source",
            "searchPath": "entity.target.source",
          },
          Object {
            "label": "entity.target.sub_type",
            "searchPath": "entity.target.sub_type",
          },
          Object {
            "label": "entity.target.type",
            "searchPath": "entity.target.type",
          },
          Object {
            "label": "entity.type",
            "searchPath": "entity.type",
          },
          Object {
            "label": "error.code",
            "searchPath": "error.code",
          },
          Object {
            "label": "error.id",
            "searchPath": "error.id",
          },
          Object {
            "label": "error.message",
            "searchPath": "error.message",
          },
          Object {
            "label": "error.stack_trace",
            "searchPath": "error.stack_trace",
          },
          Object {
            "label": "error.type",
            "searchPath": "error.type",
          },
          Object {
            "label": "event.agent_id_status",
            "searchPath": "event.agent_id_status",
          },
          Object {
            "label": "event.category",
            "searchPath": "event.category",
          },
          Object {
            "label": "event.code",
            "searchPath": "event.code",
          },
          Object {
            "label": "event.created",
            "searchPath": "event.created",
          },
          Object {
            "label": "event.dataset",
            "searchPath": "event.dataset",
          },
          Object {
            "label": "event.duration",
            "searchPath": "event.duration",
          },
          Object {
            "label": "event.end",
            "searchPath": "event.end",
          },
          Object {
            "label": "event.hash",
            "searchPath": "event.hash",
          },
          Object {
            "label": "event.id",
            "searchPath": "event.id",
          },
          Object {
            "label": "event.ingested",
            "searchPath": "event.ingested",
          },
          Object {
            "label": "event.module",
            "searchPath": "event.module",
          },
          Object {
            "label": "event.outcome",
            "searchPath": "event.outcome",
          },
          Object {
            "label": "event.provider",
            "searchPath": "event.provider",
          },
          Object {
            "label": "event.reason",
            "searchPath": "event.reason",
          },
          Object {
            "label": "event.reference",
            "searchPath": "event.reference",
          },
          Object {
            "label": "event.risk_score",
            "searchPath": "event.risk_score",
          },
          Object {
            "label": "event.risk_score_norm",
            "searchPath": "event.risk_score_norm",
          },
          Object {
            "label": "event.sequence",
            "searchPath": "event.sequence",
          },
          Object {
            "label": "event.severity",
            "searchPath": "event.severity",
          },
          Object {
            "label": "event.start",
            "searchPath": "event.start",
          },
          Object {
            "label": "event.timezone",
            "searchPath": "event.timezone",
          },
          Object {
            "label": "event.type",
            "searchPath": "event.type",
          },
          Object {
            "label": "event.url",
            "searchPath": "event.url",
          },
          Object {
            "label": "faas.coldstart",
            "searchPath": "faas.coldstart",
          },
          Object {
            "label": "faas.execution",
            "searchPath": "faas.execution",
          },
          Object {
            "label": "faas.id",
            "searchPath": "faas.id",
          },
          Object {
            "label": "faas.name",
            "searchPath": "faas.name",
          },
          Object {
            "label": "faas.version",
            "searchPath": "faas.version",
          },
          Object {
            "label": "file.accessed",
            "searchPath": "file.accessed",
          },
          Object {
            "label": "file.attributes",
            "searchPath": "file.attributes",
          },
          Object {
            "label": "file.code_signature.digest_algorithm",
            "searchPath": "file.code_signature.digest_algorithm",
          },
          Object {
            "label": "file.code_signature.exists",
            "searchPath": "file.code_signature.exists",
          },
          Object {
            "label": "file.code_signature.flags",
            "searchPath": "file.code_signature.flags",
          },
          Object {
            "label": "file.code_signature.signing_id",
            "searchPath": "file.code_signature.signing_id",
          },
          Object {
            "label": "file.code_signature.status",
            "searchPath": "file.code_signature.status",
          },
          Object {
            "label": "file.code_signature.subject_name",
            "searchPath": "file.code_signature.subject_name",
          },
          Object {
            "label": "file.code_signature.team_id",
            "searchPath": "file.code_signature.team_id",
          },
          Object {
            "label": "file.code_signature.thumbprint_sha256",
            "searchPath": "file.code_signature.thumbprint_sha256",
          },
          Object {
            "label": "file.code_signature.timestamp",
            "searchPath": "file.code_signature.timestamp",
          },
          Object {
            "label": "file.code_signature.trusted",
            "searchPath": "file.code_signature.trusted",
          },
          Object {
            "label": "file.code_signature.valid",
            "searchPath": "file.code_signature.valid",
          },
          Object {
            "label": "file.created",
            "searchPath": "file.created",
          },
          Object {
            "label": "file.ctime",
            "searchPath": "file.ctime",
          },
          Object {
            "label": "file.device",
            "searchPath": "file.device",
          },
          Object {
            "label": "file.directory",
            "searchPath": "file.directory",
          },
          Object {
            "label": "file.drive_letter",
            "searchPath": "file.drive_letter",
          },
          Object {
            "label": "file.elf.architecture",
            "searchPath": "file.elf.architecture",
          },
          Object {
            "label": "file.elf.byte_order",
            "searchPath": "file.elf.byte_order",
          },
          Object {
            "label": "file.elf.cpu_type",
            "searchPath": "file.elf.cpu_type",
          },
          Object {
            "label": "file.elf.creation_date",
            "searchPath": "file.elf.creation_date",
          },
          Object {
            "label": "file.elf.go_import_hash",
            "searchPath": "file.elf.go_import_hash",
          },
          Object {
            "label": "file.elf.go_imports_names_entropy",
            "searchPath": "file.elf.go_imports_names_entropy",
          },
          Object {
            "label": "file.elf.go_imports_names_var_entropy",
            "searchPath": "file.elf.go_imports_names_var_entropy",
          },
          Object {
            "label": "file.elf.go_stripped",
            "searchPath": "file.elf.go_stripped",
          },
          Object {
            "label": "file.elf.header.abi_version",
            "searchPath": "file.elf.header.abi_version",
          },
          Object {
            "label": "file.elf.header.class",
            "searchPath": "file.elf.header.class",
          },
          Object {
            "label": "file.elf.header.data",
            "searchPath": "file.elf.header.data",
          },
          Object {
            "label": "file.elf.header.entrypoint",
            "searchPath": "file.elf.header.entrypoint",
          },
          Object {
            "label": "file.elf.header.object_version",
            "searchPath": "file.elf.header.object_version",
          },
          Object {
            "label": "file.elf.header.os_abi",
            "searchPath": "file.elf.header.os_abi",
          },
          Object {
            "label": "file.elf.header.type",
            "searchPath": "file.elf.header.type",
          },
          Object {
            "label": "file.elf.header.version",
            "searchPath": "file.elf.header.version",
          },
          Object {
            "label": "file.elf.import_hash",
            "searchPath": "file.elf.import_hash",
          },
          Object {
            "label": "file.elf.imports_names_entropy",
            "searchPath": "file.elf.imports_names_entropy",
          },
          Object {
            "label": "file.elf.imports_names_var_entropy",
            "searchPath": "file.elf.imports_names_var_entropy",
          },
          Object {
            "label": "file.elf.shared_libraries",
            "searchPath": "file.elf.shared_libraries",
          },
          Object {
            "label": "file.elf.telfhash",
            "searchPath": "file.elf.telfhash",
          },
          Object {
            "label": "file.extension",
            "searchPath": "file.extension",
          },
          Object {
            "label": "file.fork_name",
            "searchPath": "file.fork_name",
          },
          Object {
            "label": "file.gid",
            "searchPath": "file.gid",
          },
          Object {
            "label": "file.group",
            "searchPath": "file.group",
          },
          Object {
            "label": "file.hash.cdhash",
            "searchPath": "file.hash.cdhash",
          },
          Object {
            "label": "file.hash.md5",
            "searchPath": "file.hash.md5",
          },
          Object {
            "label": "file.hash.sha1",
            "searchPath": "file.hash.sha1",
          },
          Object {
            "label": "file.hash.sha256",
            "searchPath": "file.hash.sha256",
          },
          Object {
            "label": "file.hash.sha384",
            "searchPath": "file.hash.sha384",
          },
          Object {
            "label": "file.hash.sha512",
            "searchPath": "file.hash.sha512",
          },
          Object {
            "label": "file.hash.ssdeep",
            "searchPath": "file.hash.ssdeep",
          },
          Object {
            "label": "file.hash.tlsh",
            "searchPath": "file.hash.tlsh",
          },
          Object {
            "label": "file.inode",
            "searchPath": "file.inode",
          },
          Object {
            "label": "file.macho.go_import_hash",
            "searchPath": "file.macho.go_import_hash",
          },
          Object {
            "label": "file.macho.go_imports_names_entropy",
            "searchPath": "file.macho.go_imports_names_entropy",
          },
          Object {
            "label": "file.macho.go_imports_names_var_entropy",
            "searchPath": "file.macho.go_imports_names_var_entropy",
          },
          Object {
            "label": "file.macho.go_stripped",
            "searchPath": "file.macho.go_stripped",
          },
          Object {
            "label": "file.macho.import_hash",
            "searchPath": "file.macho.import_hash",
          },
          Object {
            "label": "file.macho.imports_names_entropy",
            "searchPath": "file.macho.imports_names_entropy",
          },
          Object {
            "label": "file.macho.imports_names_var_entropy",
            "searchPath": "file.macho.imports_names_var_entropy",
          },
          Object {
            "label": "file.macho.symhash",
            "searchPath": "file.macho.symhash",
          },
          Object {
            "label": "file.mime_type",
            "searchPath": "file.mime_type",
          },
          Object {
            "label": "file.mode",
            "searchPath": "file.mode",
          },
          Object {
            "label": "file.mtime",
            "searchPath": "file.mtime",
          },
          Object {
            "label": "file.name",
            "searchPath": "file.name",
          },
          Object {
            "label": "file.origin_referrer_url",
            "searchPath": "file.origin_referrer_url",
          },
          Object {
            "label": "file.origin_url",
            "searchPath": "file.origin_url",
          },
          Object {
            "label": "file.owner",
            "searchPath": "file.owner",
          },
          Object {
            "label": "file.path",
            "searchPath": "file.path",
          },
          Object {
            "label": "file.pe.architecture",
            "searchPath": "file.pe.architecture",
          },
          Object {
            "label": "file.pe.company",
            "searchPath": "file.pe.company",
          },
          Object {
            "label": "file.pe.description",
            "searchPath": "file.pe.description",
          },
          Object {
            "label": "file.pe.file_version",
            "searchPath": "file.pe.file_version",
          },
          Object {
            "label": "file.pe.go_import_hash",
            "searchPath": "file.pe.go_import_hash",
          },
          Object {
            "label": "file.pe.go_imports_names_entropy",
            "searchPath": "file.pe.go_imports_names_entropy",
          },
          Object {
            "label": "file.pe.go_imports_names_var_entropy",
            "searchPath": "file.pe.go_imports_names_var_entropy",
          },
          Object {
            "label": "file.pe.go_stripped",
            "searchPath": "file.pe.go_stripped",
          },
          Object {
            "label": "file.pe.imphash",
            "searchPath": "file.pe.imphash",
          },
          Object {
            "label": "file.pe.import_hash",
            "searchPath": "file.pe.import_hash",
          },
          Object {
            "label": "file.pe.imports_names_entropy",
            "searchPath": "file.pe.imports_names_entropy",
          },
          Object {
            "label": "file.pe.imports_names_var_entropy",
            "searchPath": "file.pe.imports_names_var_entropy",
          },
          Object {
            "label": "file.pe.original_file_name",
            "searchPath": "file.pe.original_file_name",
          },
          Object {
            "label": "file.pe.pehash",
            "searchPath": "file.pe.pehash",
          },
          Object {
            "label": "file.pe.product",
            "searchPath": "file.pe.product",
          },
          Object {
            "label": "file.size",
            "searchPath": "file.size",
          },
          Object {
            "label": "file.target_path",
            "searchPath": "file.target_path",
          },
          Object {
            "label": "file.type",
            "searchPath": "file.type",
          },
          Object {
            "label": "file.uid",
            "searchPath": "file.uid",
          },
          Object {
            "label": "file.x509.alternative_names",
            "searchPath": "file.x509.alternative_names",
          },
          Object {
            "label": "file.x509.issuer.common_name",
            "searchPath": "file.x509.issuer.common_name",
          },
          Object {
            "label": "file.x509.issuer.country",
            "searchPath": "file.x509.issuer.country",
          },
          Object {
            "label": "file.x509.issuer.distinguished_name",
            "searchPath": "file.x509.issuer.distinguished_name",
          },
          Object {
            "label": "file.x509.issuer.locality",
            "searchPath": "file.x509.issuer.locality",
          },
          Object {
            "label": "file.x509.issuer.organization",
            "searchPath": "file.x509.issuer.organization",
          },
          Object {
            "label": "file.x509.issuer.organizational_unit",
            "searchPath": "file.x509.issuer.organizational_unit",
          },
          Object {
            "label": "file.x509.issuer.state_or_province",
            "searchPath": "file.x509.issuer.state_or_province",
          },
          Object {
            "label": "file.x509.not_after",
            "searchPath": "file.x509.not_after",
          },
          Object {
            "label": "file.x509.not_before",
            "searchPath": "file.x509.not_before",
          },
          Object {
            "label": "file.x509.public_key_algorithm",
            "searchPath": "file.x509.public_key_algorithm",
          },
          Object {
            "label": "file.x509.public_key_curve",
            "searchPath": "file.x509.public_key_curve",
          },
          Object {
            "label": "file.x509.public_key_exponent",
            "searchPath": "file.x509.public_key_exponent",
          },
          Object {
            "label": "file.x509.public_key_size",
            "searchPath": "file.x509.public_key_size",
          },
          Object {
            "label": "file.x509.serial_number",
            "searchPath": "file.x509.serial_number",
          },
          Object {
            "label": "file.x509.signature_algorithm",
            "searchPath": "file.x509.signature_algorithm",
          },
          Object {
            "label": "file.x509.subject.common_name",
            "searchPath": "file.x509.subject.common_name",
          },
          Object {
            "label": "file.x509.subject.country",
            "searchPath": "file.x509.subject.country",
          },
          Object {
            "label": "file.x509.subject.distinguished_name",
            "searchPath": "file.x509.subject.distinguished_name",
          },
          Object {
            "label": "file.x509.subject.locality",
            "searchPath": "file.x509.subject.locality",
          },
          Object {
            "label": "file.x509.subject.organization",
            "searchPath": "file.x509.subject.organization",
          },
          Object {
            "label": "file.x509.subject.organizational_unit",
            "searchPath": "file.x509.subject.organizational_unit",
          },
          Object {
            "label": "file.x509.subject.state_or_province",
            "searchPath": "file.x509.subject.state_or_province",
          },
          Object {
            "label": "file.x509.version_number",
            "searchPath": "file.x509.version_number",
          },
          Object {
            "label": "gen_ai.agent.description",
            "searchPath": "gen_ai.agent.description",
          },
          Object {
            "label": "gen_ai.agent.id",
            "searchPath": "gen_ai.agent.id",
          },
          Object {
            "label": "gen_ai.agent.name",
            "searchPath": "gen_ai.agent.name",
          },
          Object {
            "label": "gen_ai.operation.name",
            "searchPath": "gen_ai.operation.name",
          },
          Object {
            "label": "gen_ai.output.type",
            "searchPath": "gen_ai.output.type",
          },
          Object {
            "label": "gen_ai.request.choice.count",
            "searchPath": "gen_ai.request.choice.count",
          },
          Object {
            "label": "gen_ai.request.frequency_penalty",
            "searchPath": "gen_ai.request.frequency_penalty",
          },
          Object {
            "label": "gen_ai.request.max_tokens",
            "searchPath": "gen_ai.request.max_tokens",
          },
          Object {
            "label": "gen_ai.request.model",
            "searchPath": "gen_ai.request.model",
          },
          Object {
            "label": "gen_ai.request.presence_penalty",
            "searchPath": "gen_ai.request.presence_penalty",
          },
          Object {
            "label": "gen_ai.request.seed",
            "searchPath": "gen_ai.request.seed",
          },
          Object {
            "label": "gen_ai.request.temperature",
            "searchPath": "gen_ai.request.temperature",
          },
          Object {
            "label": "gen_ai.request.top_k",
            "searchPath": "gen_ai.request.top_k",
          },
          Object {
            "label": "gen_ai.request.top_p",
            "searchPath": "gen_ai.request.top_p",
          },
          Object {
            "label": "gen_ai.response.id",
            "searchPath": "gen_ai.response.id",
          },
          Object {
            "label": "gen_ai.response.model",
            "searchPath": "gen_ai.response.model",
          },
          Object {
            "label": "gen_ai.system",
            "searchPath": "gen_ai.system",
          },
          Object {
            "label": "gen_ai.token.type",
            "searchPath": "gen_ai.token.type",
          },
          Object {
            "label": "gen_ai.tool.call.id",
            "searchPath": "gen_ai.tool.call.id",
          },
          Object {
            "label": "gen_ai.tool.name",
            "searchPath": "gen_ai.tool.name",
          },
          Object {
            "label": "gen_ai.tool.type",
            "searchPath": "gen_ai.tool.type",
          },
          Object {
            "label": "gen_ai.usage.input_tokens",
            "searchPath": "gen_ai.usage.input_tokens",
          },
          Object {
            "label": "gen_ai.usage.output_tokens",
            "searchPath": "gen_ai.usage.output_tokens",
          },
          Object {
            "label": "group.domain",
            "searchPath": "group.domain",
          },
          Object {
            "label": "group.id",
            "searchPath": "group.id",
          },
          Object {
            "label": "group.name",
            "searchPath": "group.name",
          },
          Object {
            "label": "host.architecture",
            "searchPath": "host.architecture",
          },
          Object {
            "label": "host.boot.id",
            "searchPath": "host.boot.id",
          },
          Object {
            "label": "host.cpu.usage",
            "searchPath": "host.cpu.usage",
          },
          Object {
            "label": "host.disk.read.bytes",
            "searchPath": "host.disk.read.bytes",
          },
          Object {
            "label": "host.disk.write.bytes",
            "searchPath": "host.disk.write.bytes",
          },
          Object {
            "label": "host.domain",
            "searchPath": "host.domain",
          },
          Object {
            "label": "host.entity.attributes",
            "searchPath": "host.entity.attributes",
          },
          Object {
            "label": "host.entity.behavior",
            "searchPath": "host.entity.behavior",
          },
          Object {
            "label": "host.entity.display_name",
            "searchPath": "host.entity.display_name",
          },
          Object {
            "label": "host.entity.id",
            "searchPath": "host.entity.id",
          },
          Object {
            "label": "host.entity.last_seen_timestamp",
            "searchPath": "host.entity.last_seen_timestamp",
          },
          Object {
            "label": "host.entity.lifecycle",
            "searchPath": "host.entity.lifecycle",
          },
          Object {
            "label": "host.entity.metrics",
            "searchPath": "host.entity.metrics",
          },
          Object {
            "label": "host.entity.name",
            "searchPath": "host.entity.name",
          },
          Object {
            "label": "host.entity.raw",
            "searchPath": "host.entity.raw",
          },
          Object {
            "label": "host.entity.reference",
            "searchPath": "host.entity.reference",
          },
          Object {
            "label": "host.entity.source",
            "searchPath": "host.entity.source",
          },
          Object {
            "label": "host.entity.sub_type",
            "searchPath": "host.entity.sub_type",
          },
          Object {
            "label": "host.entity.type",
            "searchPath": "host.entity.type",
          },
          Object {
            "label": "host.geo.city_name",
            "searchPath": "host.geo.city_name",
          },
          Object {
            "label": "host.geo.continent_code",
            "searchPath": "host.geo.continent_code",
          },
          Object {
            "label": "host.geo.continent_name",
            "searchPath": "host.geo.continent_name",
          },
          Object {
            "label": "host.geo.country_iso_code",
            "searchPath": "host.geo.country_iso_code",
          },
          Object {
            "label": "host.geo.country_name",
            "searchPath": "host.geo.country_name",
          },
          Object {
            "label": "host.geo.location",
            "searchPath": "host.geo.location",
          },
          Object {
            "label": "host.geo.name",
            "searchPath": "host.geo.name",
          },
          Object {
            "label": "host.geo.postal_code",
            "searchPath": "host.geo.postal_code",
          },
          Object {
            "label": "host.geo.region_iso_code",
            "searchPath": "host.geo.region_iso_code",
          },
          Object {
            "label": "host.geo.region_name",
            "searchPath": "host.geo.region_name",
          },
          Object {
            "label": "host.geo.timezone",
            "searchPath": "host.geo.timezone",
          },
          Object {
            "label": "host.hostname",
            "searchPath": "host.hostname",
          },
          Object {
            "label": "host.id",
            "searchPath": "host.id",
          },
          Object {
            "label": "host.ip",
            "searchPath": "host.ip",
          },
          Object {
            "label": "host.mac",
            "searchPath": "host.mac",
          },
          Object {
            "label": "host.name",
            "searchPath": "host.name",
          },
          Object {
            "label": "host.network.egress.bytes",
            "searchPath": "host.network.egress.bytes",
          },
          Object {
            "label": "host.network.egress.packets",
            "searchPath": "host.network.egress.packets",
          },
          Object {
            "label": "host.network.ingress.bytes",
            "searchPath": "host.network.ingress.bytes",
          },
          Object {
            "label": "host.network.ingress.packets",
            "searchPath": "host.network.ingress.packets",
          },
          Object {
            "label": "host.os.family",
            "searchPath": "host.os.family",
          },
          Object {
            "label": "host.os.full",
            "searchPath": "host.os.full",
          },
          Object {
            "label": "host.os.kernel",
            "searchPath": "host.os.kernel",
          },
          Object {
            "label": "host.os.name",
            "searchPath": "host.os.name",
          },
          Object {
            "label": "host.os.platform",
            "searchPath": "host.os.platform",
          },
          Object {
            "label": "host.os.type",
            "searchPath": "host.os.type",
          },
          Object {
            "label": "host.os.version",
            "searchPath": "host.os.version",
          },
          Object {
            "label": "host.pid_ns_ino",
            "searchPath": "host.pid_ns_ino",
          },
          Object {
            "label": "host.risk.calculated_level",
            "searchPath": "host.risk.calculated_level",
          },
          Object {
            "label": "host.risk.calculated_score",
            "searchPath": "host.risk.calculated_score",
          },
          Object {
            "label": "host.risk.calculated_score_norm",
            "searchPath": "host.risk.calculated_score_norm",
          },
          Object {
            "label": "host.risk.static_level",
            "searchPath": "host.risk.static_level",
          },
          Object {
            "label": "host.risk.static_score",
            "searchPath": "host.risk.static_score",
          },
          Object {
            "label": "host.risk.static_score_norm",
            "searchPath": "host.risk.static_score_norm",
          },
          Object {
            "label": "host.target.architecture",
            "searchPath": "host.target.architecture",
          },
          Object {
            "label": "host.target.boot.id",
            "searchPath": "host.target.boot.id",
          },
          Object {
            "label": "host.target.cpu.usage",
            "searchPath": "host.target.cpu.usage",
          },
          Object {
            "label": "host.target.disk.read.bytes",
            "searchPath": "host.target.disk.read.bytes",
          },
          Object {
            "label": "host.target.disk.write.bytes",
            "searchPath": "host.target.disk.write.bytes",
          },
          Object {
            "label": "host.target.domain",
            "searchPath": "host.target.domain",
          },
          Object {
            "label": "host.target.entity.attributes",
            "searchPath": "host.target.entity.attributes",
          },
          Object {
            "label": "host.target.entity.behavior",
            "searchPath": "host.target.entity.behavior",
          },
          Object {
            "label": "host.target.entity.display_name",
            "searchPath": "host.target.entity.display_name",
          },
          Object {
            "label": "host.target.entity.id",
            "searchPath": "host.target.entity.id",
          },
          Object {
            "label": "host.target.entity.last_seen_timestamp",
            "searchPath": "host.target.entity.last_seen_timestamp",
          },
          Object {
            "label": "host.target.entity.lifecycle",
            "searchPath": "host.target.entity.lifecycle",
          },
          Object {
            "label": "host.target.entity.metrics",
            "searchPath": "host.target.entity.metrics",
          },
          Object {
            "label": "host.target.entity.name",
            "searchPath": "host.target.entity.name",
          },
          Object {
            "label": "host.target.entity.raw",
            "searchPath": "host.target.entity.raw",
          },
          Object {
            "label": "host.target.entity.reference",
            "searchPath": "host.target.entity.reference",
          },
          Object {
            "label": "host.target.entity.source",
            "searchPath": "host.target.entity.source",
          },
          Object {
            "label": "host.target.entity.sub_type",
            "searchPath": "host.target.entity.sub_type",
          },
          Object {
            "label": "host.target.entity.type",
            "searchPath": "host.target.entity.type",
          },
          Object {
            "label": "host.target.geo.city_name",
            "searchPath": "host.target.geo.city_name",
          },
          Object {
            "label": "host.target.geo.continent_code",
            "searchPath": "host.target.geo.continent_code",
          },
          Object {
            "label": "host.target.geo.continent_name",
            "searchPath": "host.target.geo.continent_name",
          },
          Object {
            "label": "host.target.geo.country_iso_code",
            "searchPath": "host.target.geo.country_iso_code",
          },
          Object {
            "label": "host.target.geo.country_name",
            "searchPath": "host.target.geo.country_name",
          },
          Object {
            "label": "host.target.geo.location",
            "searchPath": "host.target.geo.location",
          },
          Object {
            "label": "host.target.geo.name",
            "searchPath": "host.target.geo.name",
          },
          Object {
            "label": "host.target.geo.postal_code",
            "searchPath": "host.target.geo.postal_code",
          },
          Object {
            "label": "host.target.geo.region_iso_code",
            "searchPath": "host.target.geo.region_iso_code",
          },
          Object {
            "label": "host.target.geo.region_name",
            "searchPath": "host.target.geo.region_name",
          },
          Object {
            "label": "host.target.geo.timezone",
            "searchPath": "host.target.geo.timezone",
          },
          Object {
            "label": "host.target.hostname",
            "searchPath": "host.target.hostname",
          },
          Object {
            "label": "host.target.id",
            "searchPath": "host.target.id",
          },
          Object {
            "label": "host.target.ip",
            "searchPath": "host.target.ip",
          },
          Object {
            "label": "host.target.mac",
            "searchPath": "host.target.mac",
          },
          Object {
            "label": "host.target.name",
            "searchPath": "host.target.name",
          },
          Object {
            "label": "host.target.network.egress.bytes",
            "searchPath": "host.target.network.egress.bytes",
          },
          Object {
            "label": "host.target.network.egress.packets",
            "searchPath": "host.target.network.egress.packets",
          },
          Object {
            "label": "host.target.network.ingress.bytes",
            "searchPath": "host.target.network.ingress.bytes",
          },
          Object {
            "label": "host.target.network.ingress.packets",
            "searchPath": "host.target.network.ingress.packets",
          },
          Object {
            "label": "host.target.os.family",
            "searchPath": "host.target.os.family",
          },
          Object {
            "label": "host.target.os.full",
            "searchPath": "host.target.os.full",
          },
          Object {
            "label": "host.target.os.kernel",
            "searchPath": "host.target.os.kernel",
          },
          Object {
            "label": "host.target.os.name",
            "searchPath": "host.target.os.name",
          },
          Object {
            "label": "host.target.os.platform",
            "searchPath": "host.target.os.platform",
          },
          Object {
            "label": "host.target.os.type",
            "searchPath": "host.target.os.type",
          },
          Object {
            "label": "host.target.os.version",
            "searchPath": "host.target.os.version",
          },
          Object {
            "label": "host.target.pid_ns_ino",
            "searchPath": "host.target.pid_ns_ino",
          },
          Object {
            "label": "host.target.risk.calculated_level",
            "searchPath": "host.target.risk.calculated_level",
          },
          Object {
            "label": "host.target.risk.calculated_score",
            "searchPath": "host.target.risk.calculated_score",
          },
          Object {
            "label": "host.target.risk.calculated_score_norm",
            "searchPath": "host.target.risk.calculated_score_norm",
          },
          Object {
            "label": "host.target.risk.static_level",
            "searchPath": "host.target.risk.static_level",
          },
          Object {
            "label": "host.target.risk.static_score",
            "searchPath": "host.target.risk.static_score",
          },
          Object {
            "label": "host.target.risk.static_score_norm",
            "searchPath": "host.target.risk.static_score_norm",
          },
          Object {
            "label": "host.target.type",
            "searchPath": "host.target.type",
          },
          Object {
            "label": "host.target.uptime",
            "searchPath": "host.target.uptime",
          },
          Object {
            "label": "host.type",
            "searchPath": "host.type",
          },
          Object {
            "label": "host.uptime",
            "searchPath": "host.uptime",
          },
          Object {
            "label": "http.request.body.bytes",
            "searchPath": "http.request.body.bytes",
          },
          Object {
            "label": "http.request.body.content",
            "searchPath": "http.request.body.content",
          },
          Object {
            "label": "http.request.bytes",
            "searchPath": "http.request.bytes",
          },
          Object {
            "label": "http.request.id",
            "searchPath": "http.request.id",
          },
          Object {
            "label": "http.request.method",
            "searchPath": "http.request.method",
          },
          Object {
            "label": "http.request.mime_type",
            "searchPath": "http.request.mime_type",
          },
          Object {
            "label": "http.request.referrer",
            "searchPath": "http.request.referrer",
          },
          Object {
            "label": "http.response.body.bytes",
            "searchPath": "http.response.body.bytes",
          },
          Object {
            "label": "http.response.body.content",
            "searchPath": "http.response.body.content",
          },
          Object {
            "label": "http.response.bytes",
            "searchPath": "http.response.bytes",
          },
          Object {
            "label": "http.response.mime_type",
            "searchPath": "http.response.mime_type",
          },
          Object {
            "label": "http.response.status_code",
            "searchPath": "http.response.status_code",
          },
          Object {
            "label": "http.version",
            "searchPath": "http.version",
          },
          Object {
            "label": "labels",
            "searchPath": "labels",
          },
          Object {
            "label": "log.file.path",
            "searchPath": "log.file.path",
          },
          Object {
            "label": "log.level",
            "searchPath": "log.level",
          },
          Object {
            "label": "log.logger",
            "searchPath": "log.logger",
          },
          Object {
            "label": "log.origin.file.line",
            "searchPath": "log.origin.file.line",
          },
          Object {
            "label": "log.origin.file.name",
            "searchPath": "log.origin.file.name",
          },
          Object {
            "label": "log.origin.function",
            "searchPath": "log.origin.function",
          },
          Object {
            "label": "log.syslog",
            "searchPath": "log.syslog",
          },
          Object {
            "label": "log.syslog.appname",
            "searchPath": "log.syslog.appname",
          },
          Object {
            "label": "log.syslog.facility.code",
            "searchPath": "log.syslog.facility.code",
          },
          Object {
            "label": "log.syslog.facility.name",
            "searchPath": "log.syslog.facility.name",
          },
          Object {
            "label": "log.syslog.hostname",
            "searchPath": "log.syslog.hostname",
          },
          Object {
            "label": "log.syslog.msgid",
            "searchPath": "log.syslog.msgid",
          },
          Object {
            "label": "log.syslog.priority",
            "searchPath": "log.syslog.priority",
          },
          Object {
            "label": "log.syslog.procid",
            "searchPath": "log.syslog.procid",
          },
          Object {
            "label": "log.syslog.severity.code",
            "searchPath": "log.syslog.severity.code",
          },
          Object {
            "label": "log.syslog.severity.name",
            "searchPath": "log.syslog.severity.name",
          },
          Object {
            "label": "log.syslog.version",
            "searchPath": "log.syslog.version",
          },
          Object {
            "label": "message",
            "searchPath": "message",
          },
          Object {
            "label": "network.application",
            "searchPath": "network.application",
          },
          Object {
            "label": "network.bytes",
            "searchPath": "network.bytes",
          },
          Object {
            "label": "network.community_id",
            "searchPath": "network.community_id",
          },
          Object {
            "label": "network.direction",
            "searchPath": "network.direction",
          },
          Object {
            "label": "network.forwarded_ip",
            "searchPath": "network.forwarded_ip",
          },
          Object {
            "label": "network.iana_number",
            "searchPath": "network.iana_number",
          },
          Object {
            "label": "network.inner",
            "searchPath": "network.inner",
          },
          Object {
            "label": "network.inner.vlan.id",
            "searchPath": "network.inner.vlan.id",
          },
          Object {
            "label": "network.inner.vlan.name",
            "searchPath": "network.inner.vlan.name",
          },
          Object {
            "label": "network.name",
            "searchPath": "network.name",
          },
          Object {
            "label": "network.packets",
            "searchPath": "network.packets",
          },
          Object {
            "label": "network.protocol",
            "searchPath": "network.protocol",
          },
          Object {
            "label": "network.transport",
            "searchPath": "network.transport",
          },
          Object {
            "label": "network.type",
            "searchPath": "network.type",
          },
          Object {
            "label": "network.vlan.id",
            "searchPath": "network.vlan.id",
          },
          Object {
            "label": "network.vlan.name",
            "searchPath": "network.vlan.name",
          },
          Object {
            "label": "observer.egress",
            "searchPath": "observer.egress",
          },
          Object {
            "label": "observer.egress.interface.alias",
            "searchPath": "observer.egress.interface.alias",
          },
          Object {
            "label": "observer.egress.interface.id",
            "searchPath": "observer.egress.interface.id",
          },
          Object {
            "label": "observer.egress.interface.name",
            "searchPath": "observer.egress.interface.name",
          },
          Object {
            "label": "observer.egress.vlan.id",
            "searchPath": "observer.egress.vlan.id",
          },
          Object {
            "label": "observer.egress.vlan.name",
            "searchPath": "observer.egress.vlan.name",
          },
          Object {
            "label": "observer.egress.zone",
            "searchPath": "observer.egress.zone",
          },
          Object {
            "label": "observer.geo.city_name",
            "searchPath": "observer.geo.city_name",
          },
          Object {
            "label": "observer.geo.continent_code",
            "searchPath": "observer.geo.continent_code",
          },
          Object {
            "label": "observer.geo.continent_name",
            "searchPath": "observer.geo.continent_name",
          },
          Object {
            "label": "observer.geo.country_iso_code",
            "searchPath": "observer.geo.country_iso_code",
          },
          Object {
            "label": "observer.geo.country_name",
            "searchPath": "observer.geo.country_name",
          },
          Object {
            "label": "observer.geo.location",
            "searchPath": "observer.geo.location",
          },
          Object {
            "label": "observer.geo.name",
            "searchPath": "observer.geo.name",
          },
          Object {
            "label": "observer.geo.postal_code",
            "searchPath": "observer.geo.postal_code",
          },
          Object {
            "label": "observer.geo.region_iso_code",
            "searchPath": "observer.geo.region_iso_code",
          },
          Object {
            "label": "observer.geo.region_name",
            "searchPath": "observer.geo.region_name",
          },
          Object {
            "label": "observer.geo.timezone",
            "searchPath": "observer.geo.timezone",
          },
          Object {
            "label": "observer.hostname",
            "searchPath": "observer.hostname",
          },
          Object {
            "label": "observer.ingress",
            "searchPath": "observer.ingress",
          },
          Object {
            "label": "observer.ingress.interface.alias",
            "searchPath": "observer.ingress.interface.alias",
          },
          Object {
            "label": "observer.ingress.interface.id",
            "searchPath": "observer.ingress.interface.id",
          },
          Object {
            "label": "observer.ingress.interface.name",
            "searchPath": "observer.ingress.interface.name",
          },
          Object {
            "label": "observer.ingress.vlan.id",
            "searchPath": "observer.ingress.vlan.id",
          },
          Object {
            "label": "observer.ingress.vlan.name",
            "searchPath": "observer.ingress.vlan.name",
          },
          Object {
            "label": "observer.ingress.zone",
            "searchPath": "observer.ingress.zone",
          },
          Object {
            "label": "observer.ip",
            "searchPath": "observer.ip",
          },
          Object {
            "label": "observer.mac",
            "searchPath": "observer.mac",
          },
          Object {
            "label": "observer.name",
            "searchPath": "observer.name",
          },
          Object {
            "label": "observer.os.family",
            "searchPath": "observer.os.family",
          },
          Object {
            "label": "observer.os.full",
            "searchPath": "observer.os.full",
          },
          Object {
            "label": "observer.os.kernel",
            "searchPath": "observer.os.kernel",
          },
          Object {
            "label": "observer.os.name",
            "searchPath": "observer.os.name",
          },
          Object {
            "label": "observer.os.platform",
            "searchPath": "observer.os.platform",
          },
          Object {
            "label": "observer.os.type",
            "searchPath": "observer.os.type",
          },
          Object {
            "label": "observer.os.version",
            "searchPath": "observer.os.version",
          },
          Object {
            "label": "observer.product",
            "searchPath": "observer.product",
          },
          Object {
            "label": "observer.serial_number",
            "searchPath": "observer.serial_number",
          },
          Object {
            "label": "observer.type",
            "searchPath": "observer.type",
          },
          Object {
            "label": "observer.vendor",
            "searchPath": "observer.vendor",
          },
          Object {
            "label": "observer.version",
            "searchPath": "observer.version",
          },
          Object {
            "label": "orchestrator.api_version",
            "searchPath": "orchestrator.api_version",
          },
          Object {
            "label": "orchestrator.cluster.id",
            "searchPath": "orchestrator.cluster.id",
          },
          Object {
            "label": "orchestrator.cluster.name",
            "searchPath": "orchestrator.cluster.name",
          },
          Object {
            "label": "orchestrator.cluster.url",
            "searchPath": "orchestrator.cluster.url",
          },
          Object {
            "label": "orchestrator.cluster.version",
            "searchPath": "orchestrator.cluster.version",
          },
          Object {
            "label": "orchestrator.entity.attributes",
            "searchPath": "orchestrator.entity.attributes",
          },
          Object {
            "label": "orchestrator.entity.behavior",
            "searchPath": "orchestrator.entity.behavior",
          },
          Object {
            "label": "orchestrator.entity.display_name",
            "searchPath": "orchestrator.entity.display_name",
          },
          Object {
            "label": "orchestrator.entity.id",
            "searchPath": "orchestrator.entity.id",
          },
          Object {
            "label": "orchestrator.entity.last_seen_timestamp",
            "searchPath": "orchestrator.entity.last_seen_timestamp",
          },
          Object {
            "label": "orchestrator.entity.lifecycle",
            "searchPath": "orchestrator.entity.lifecycle",
          },
          Object {
            "label": "orchestrator.entity.metrics",
            "searchPath": "orchestrator.entity.metrics",
          },
          Object {
            "label": "orchestrator.entity.name",
            "searchPath": "orchestrator.entity.name",
          },
          Object {
            "label": "orchestrator.entity.raw",
            "searchPath": "orchestrator.entity.raw",
          },
          Object {
            "label": "orchestrator.entity.reference",
            "searchPath": "orchestrator.entity.reference",
          },
          Object {
            "label": "orchestrator.entity.source",
            "searchPath": "orchestrator.entity.source",
          },
          Object {
            "label": "orchestrator.entity.sub_type",
            "searchPath": "orchestrator.entity.sub_type",
          },
          Object {
            "label": "orchestrator.entity.type",
            "searchPath": "orchestrator.entity.type",
          },
          Object {
            "label": "orchestrator.namespace",
            "searchPath": "orchestrator.namespace",
          },
          Object {
            "label": "orchestrator.organization",
            "searchPath": "orchestrator.organization",
          },
          Object {
            "label": "orchestrator.resource.annotation",
            "searchPath": "orchestrator.resource.annotation",
          },
          Object {
            "label": "orchestrator.resource.id",
            "searchPath": "orchestrator.resource.id",
          },
          Object {
            "label": "orchestrator.resource.ip",
            "searchPath": "orchestrator.resource.ip",
          },
          Object {
            "label": "orchestrator.resource.label",
            "searchPath": "orchestrator.resource.label",
          },
          Object {
            "label": "orchestrator.resource.name",
            "searchPath": "orchestrator.resource.name",
          },
          Object {
            "label": "orchestrator.resource.parent.type",
            "searchPath": "orchestrator.resource.parent.type",
          },
          Object {
            "label": "orchestrator.resource.type",
            "searchPath": "orchestrator.resource.type",
          },
          Object {
            "label": "orchestrator.type",
            "searchPath": "orchestrator.type",
          },
          Object {
            "label": "organization.id",
            "searchPath": "organization.id",
          },
          Object {
            "label": "organization.name",
            "searchPath": "organization.name",
          },
          Object {
            "label": "package.architecture",
            "searchPath": "package.architecture",
          },
          Object {
            "label": "package.build_version",
            "searchPath": "package.build_version",
          },
          Object {
            "label": "package.checksum",
            "searchPath": "package.checksum",
          },
          Object {
            "label": "package.description",
            "searchPath": "package.description",
          },
          Object {
            "label": "package.install_scope",
            "searchPath": "package.install_scope",
          },
          Object {
            "label": "package.installed",
            "searchPath": "package.installed",
          },
          Object {
            "label": "package.license",
            "searchPath": "package.license",
          },
          Object {
            "label": "package.name",
            "searchPath": "package.name",
          },
          Object {
            "label": "package.path",
            "searchPath": "package.path",
          },
          Object {
            "label": "package.reference",
            "searchPath": "package.reference",
          },
          Object {
            "label": "package.size",
            "searchPath": "package.size",
          },
          Object {
            "label": "package.type",
            "searchPath": "package.type",
          },
          Object {
            "label": "package.version",
            "searchPath": "package.version",
          },
          Object {
            "label": "process.args",
            "searchPath": "process.args",
          },
          Object {
            "label": "process.args_count",
            "searchPath": "process.args_count",
          },
          Object {
            "label": "process.code_signature.digest_algorithm",
            "searchPath": "process.code_signature.digest_algorithm",
          },
          Object {
            "label": "process.code_signature.exists",
            "searchPath": "process.code_signature.exists",
          },
          Object {
            "label": "process.code_signature.flags",
            "searchPath": "process.code_signature.flags",
          },
          Object {
            "label": "process.code_signature.signing_id",
            "searchPath": "process.code_signature.signing_id",
          },
          Object {
            "label": "process.code_signature.status",
            "searchPath": "process.code_signature.status",
          },
          Object {
            "label": "process.code_signature.subject_name",
            "searchPath": "process.code_signature.subject_name",
          },
          Object {
            "label": "process.code_signature.team_id",
            "searchPath": "process.code_signature.team_id",
          },
          Object {
            "label": "process.code_signature.thumbprint_sha256",
            "searchPath": "process.code_signature.thumbprint_sha256",
          },
          Object {
            "label": "process.code_signature.timestamp",
            "searchPath": "process.code_signature.timestamp",
          },
          Object {
            "label": "process.code_signature.trusted",
            "searchPath": "process.code_signature.trusted",
          },
          Object {
            "label": "process.code_signature.valid",
            "searchPath": "process.code_signature.valid",
          },
          Object {
            "label": "process.command_line",
            "searchPath": "process.command_line",
          },
          Object {
            "label": "process.elf.architecture",
            "searchPath": "process.elf.architecture",
          },
          Object {
            "label": "process.elf.byte_order",
            "searchPath": "process.elf.byte_order",
          },
          Object {
            "label": "process.elf.cpu_type",
            "searchPath": "process.elf.cpu_type",
          },
          Object {
            "label": "process.elf.creation_date",
            "searchPath": "process.elf.creation_date",
          },
          Object {
            "label": "process.elf.go_import_hash",
            "searchPath": "process.elf.go_import_hash",
          },
          Object {
            "label": "process.elf.go_imports_names_entropy",
            "searchPath": "process.elf.go_imports_names_entropy",
          },
          Object {
            "label": "process.elf.go_imports_names_var_entropy",
            "searchPath": "process.elf.go_imports_names_var_entropy",
          },
          Object {
            "label": "process.elf.go_stripped",
            "searchPath": "process.elf.go_stripped",
          },
          Object {
            "label": "process.elf.header.abi_version",
            "searchPath": "process.elf.header.abi_version",
          },
          Object {
            "label": "process.elf.header.class",
            "searchPath": "process.elf.header.class",
          },
          Object {
            "label": "process.elf.header.data",
            "searchPath": "process.elf.header.data",
          },
          Object {
            "label": "process.elf.header.entrypoint",
            "searchPath": "process.elf.header.entrypoint",
          },
          Object {
            "label": "process.elf.header.object_version",
            "searchPath": "process.elf.header.object_version",
          },
          Object {
            "label": "process.elf.header.os_abi",
            "searchPath": "process.elf.header.os_abi",
          },
          Object {
            "label": "process.elf.header.type",
            "searchPath": "process.elf.header.type",
          },
          Object {
            "label": "process.elf.header.version",
            "searchPath": "process.elf.header.version",
          },
          Object {
            "label": "process.elf.import_hash",
            "searchPath": "process.elf.import_hash",
          },
          Object {
            "label": "process.elf.imports_names_entropy",
            "searchPath": "process.elf.imports_names_entropy",
          },
          Object {
            "label": "process.elf.imports_names_var_entropy",
            "searchPath": "process.elf.imports_names_var_entropy",
          },
          Object {
            "label": "process.elf.shared_libraries",
            "searchPath": "process.elf.shared_libraries",
          },
          Object {
            "label": "process.elf.telfhash",
            "searchPath": "process.elf.telfhash",
          },
          Object {
            "label": "process.end",
            "searchPath": "process.end",
          },
          Object {
            "label": "process.entity_id",
            "searchPath": "process.entity_id",
          },
          Object {
            "label": "process.entry_leader.args",
            "searchPath": "process.entry_leader.args",
          },
          Object {
            "label": "process.entry_leader.args_count",
            "searchPath": "process.entry_leader.args_count",
          },
          Object {
            "label": "process.entry_leader.attested_groups.name",
            "searchPath": "process.entry_leader.attested_groups.name",
          },
          Object {
            "label": "process.entry_leader.attested_user.id",
            "searchPath": "process.entry_leader.attested_user.id",
          },
          Object {
            "label": "process.entry_leader.attested_user.name",
            "searchPath": "process.entry_leader.attested_user.name",
          },
          Object {
            "label": "process.entry_leader.command_line",
            "searchPath": "process.entry_leader.command_line",
          },
          Object {
            "label": "process.entry_leader.entity_id",
            "searchPath": "process.entry_leader.entity_id",
          },
          Object {
            "label": "process.entry_leader.entry_meta.source.ip",
            "searchPath": "process.entry_leader.entry_meta.source.ip",
          },
          Object {
            "label": "process.entry_leader.entry_meta.type",
            "searchPath": "process.entry_leader.entry_meta.type",
          },
          Object {
            "label": "process.entry_leader.executable",
            "searchPath": "process.entry_leader.executable",
          },
          Object {
            "label": "process.entry_leader.group.id",
            "searchPath": "process.entry_leader.group.id",
          },
          Object {
            "label": "process.entry_leader.group.name",
            "searchPath": "process.entry_leader.group.name",
          },
          Object {
            "label": "process.entry_leader.interactive",
            "searchPath": "process.entry_leader.interactive",
          },
          Object {
            "label": "process.entry_leader.name",
            "searchPath": "process.entry_leader.name",
          },
          Object {
            "label": "process.entry_leader.parent.entity_id",
            "searchPath": "process.entry_leader.parent.entity_id",
          },
          Object {
            "label": "process.entry_leader.parent.pid",
            "searchPath": "process.entry_leader.parent.pid",
          },
          Object {
            "label": "process.entry_leader.parent.session_leader.entity_id",
            "searchPath": "process.entry_leader.parent.session_leader.entity_id",
          },
          Object {
            "label": "process.entry_leader.parent.session_leader.pid",
            "searchPath": "process.entry_leader.parent.session_leader.pid",
          },
          Object {
            "label": "process.entry_leader.parent.session_leader.start",
            "searchPath": "process.entry_leader.parent.session_leader.start",
          },
          Object {
            "label": "process.entry_leader.parent.session_leader.vpid",
            "searchPath": "process.entry_leader.parent.session_leader.vpid",
          },
          Object {
            "label": "process.entry_leader.parent.start",
            "searchPath": "process.entry_leader.parent.start",
          },
          Object {
            "label": "process.entry_leader.parent.vpid",
            "searchPath": "process.entry_leader.parent.vpid",
          },
          Object {
            "label": "process.entry_leader.pid",
            "searchPath": "process.entry_leader.pid",
          },
          Object {
            "label": "process.entry_leader.real_group.id",
            "searchPath": "process.entry_leader.real_group.id",
          },
          Object {
            "label": "process.entry_leader.real_group.name",
            "searchPath": "process.entry_leader.real_group.name",
          },
          Object {
            "label": "process.entry_leader.real_user.id",
            "searchPath": "process.entry_leader.real_user.id",
          },
          Object {
            "label": "process.entry_leader.real_user.name",
            "searchPath": "process.entry_leader.real_user.name",
          },
          Object {
            "label": "process.entry_leader.same_as_process",
            "searchPath": "process.entry_leader.same_as_process",
          },
          Object {
            "label": "process.entry_leader.saved_group.id",
            "searchPath": "process.entry_leader.saved_group.id",
          },
          Object {
            "label": "process.entry_leader.saved_group.name",
            "searchPath": "process.entry_leader.saved_group.name",
          },
          Object {
            "label": "process.entry_leader.saved_user.id",
            "searchPath": "process.entry_leader.saved_user.id",
          },
          Object {
            "label": "process.entry_leader.saved_user.name",
            "searchPath": "process.entry_leader.saved_user.name",
          },
          Object {
            "label": "process.entry_leader.start",
            "searchPath": "process.entry_leader.start",
          },
          Object {
            "label": "process.entry_leader.supplemental_groups.id",
            "searchPath": "process.entry_leader.supplemental_groups.id",
          },
          Object {
            "label": "process.entry_leader.supplemental_groups.name",
            "searchPath": "process.entry_leader.supplemental_groups.name",
          },
          Object {
            "label": "process.entry_leader.tty",
            "searchPath": "process.entry_leader.tty",
          },
          Object {
            "label": "process.entry_leader.tty.char_device.major",
            "searchPath": "process.entry_leader.tty.char_device.major",
          },
          Object {
            "label": "process.entry_leader.tty.char_device.minor",
            "searchPath": "process.entry_leader.tty.char_device.minor",
          },
          Object {
            "label": "process.entry_leader.user.id",
            "searchPath": "process.entry_leader.user.id",
          },
          Object {
            "label": "process.entry_leader.user.name",
            "searchPath": "process.entry_leader.user.name",
          },
          Object {
            "label": "process.entry_leader.vpid",
            "searchPath": "process.entry_leader.vpid",
          },
          Object {
            "label": "process.entry_leader.working_directory",
            "searchPath": "process.entry_leader.working_directory",
          },
          Object {
            "label": "process.env_vars",
            "searchPath": "process.env_vars",
          },
          Object {
            "label": "process.executable",
            "searchPath": "process.executable",
          },
          Object {
            "label": "process.exit_code",
            "searchPath": "process.exit_code",
          },
          Object {
            "label": "process.group.id",
            "searchPath": "process.group.id",
          },
          Object {
            "label": "process.group.name",
            "searchPath": "process.group.name",
          },
          Object {
            "label": "process.group_leader.args",
            "searchPath": "process.group_leader.args",
          },
          Object {
            "label": "process.group_leader.args_count",
            "searchPath": "process.group_leader.args_count",
          },
          Object {
            "label": "process.group_leader.command_line",
            "searchPath": "process.group_leader.command_line",
          },
          Object {
            "label": "process.group_leader.entity_id",
            "searchPath": "process.group_leader.entity_id",
          },
          Object {
            "label": "process.group_leader.executable",
            "searchPath": "process.group_leader.executable",
          },
          Object {
            "label": "process.group_leader.group.id",
            "searchPath": "process.group_leader.group.id",
          },
          Object {
            "label": "process.group_leader.group.name",
            "searchPath": "process.group_leader.group.name",
          },
          Object {
            "label": "process.group_leader.interactive",
            "searchPath": "process.group_leader.interactive",
          },
          Object {
            "label": "process.group_leader.name",
            "searchPath": "process.group_leader.name",
          },
          Object {
            "label": "process.group_leader.pid",
            "searchPath": "process.group_leader.pid",
          },
          Object {
            "label": "process.group_leader.real_group.id",
            "searchPath": "process.group_leader.real_group.id",
          },
          Object {
            "label": "process.group_leader.real_group.name",
            "searchPath": "process.group_leader.real_group.name",
          },
          Object {
            "label": "process.group_leader.real_user.id",
            "searchPath": "process.group_leader.real_user.id",
          },
          Object {
            "label": "process.group_leader.real_user.name",
            "searchPath": "process.group_leader.real_user.name",
          },
          Object {
            "label": "process.group_leader.same_as_process",
            "searchPath": "process.group_leader.same_as_process",
          },
          Object {
            "label": "process.group_leader.saved_group.id",
            "searchPath": "process.group_leader.saved_group.id",
          },
          Object {
            "label": "process.group_leader.saved_group.name",
            "searchPath": "process.group_leader.saved_group.name",
          },
          Object {
            "label": "process.group_leader.saved_user.id",
            "searchPath": "process.group_leader.saved_user.id",
          },
          Object {
            "label": "process.group_leader.saved_user.name",
            "searchPath": "process.group_leader.saved_user.name",
          },
          Object {
            "label": "process.group_leader.start",
            "searchPath": "process.group_leader.start",
          },
          Object {
            "label": "process.group_leader.supplemental_groups.id",
            "searchPath": "process.group_leader.supplemental_groups.id",
          },
          Object {
            "label": "process.group_leader.supplemental_groups.name",
            "searchPath": "process.group_leader.supplemental_groups.name",
          },
          Object {
            "label": "process.group_leader.tty",
            "searchPath": "process.group_leader.tty",
          },
          Object {
            "label": "process.group_leader.tty.char_device.major",
            "searchPath": "process.group_leader.tty.char_device.major",
          },
          Object {
            "label": "process.group_leader.tty.char_device.minor",
            "searchPath": "process.group_leader.tty.char_device.minor",
          },
          Object {
            "label": "process.group_leader.user.id",
            "searchPath": "process.group_leader.user.id",
          },
          Object {
            "label": "process.group_leader.user.name",
            "searchPath": "process.group_leader.user.name",
          },
          Object {
            "label": "process.group_leader.vpid",
            "searchPath": "process.group_leader.vpid",
          },
          Object {
            "label": "process.group_leader.working_directory",
            "searchPath": "process.group_leader.working_directory",
          },
          Object {
            "label": "process.hash.cdhash",
            "searchPath": "process.hash.cdhash",
          },
          Object {
            "label": "process.hash.md5",
            "searchPath": "process.hash.md5",
          },
          Object {
            "label": "process.hash.sha1",
            "searchPath": "process.hash.sha1",
          },
          Object {
            "label": "process.hash.sha256",
            "searchPath": "process.hash.sha256",
          },
          Object {
            "label": "process.hash.sha384",
            "searchPath": "process.hash.sha384",
          },
          Object {
            "label": "process.hash.sha512",
            "searchPath": "process.hash.sha512",
          },
          Object {
            "label": "process.hash.ssdeep",
            "searchPath": "process.hash.ssdeep",
          },
          Object {
            "label": "process.hash.tlsh",
            "searchPath": "process.hash.tlsh",
          },
          Object {
            "label": "process.interactive",
            "searchPath": "process.interactive",
          },
          Object {
            "label": "process.io",
            "searchPath": "process.io",
          },
          Object {
            "label": "process.io.bytes_skipped",
            "searchPath": "process.io.bytes_skipped",
          },
          Object {
            "label": "process.io.bytes_skipped.length",
            "searchPath": "process.io.bytes_skipped.length",
          },
          Object {
            "label": "process.io.bytes_skipped.offset",
            "searchPath": "process.io.bytes_skipped.offset",
          },
          Object {
            "label": "process.io.max_bytes_per_process_exceeded",
            "searchPath": "process.io.max_bytes_per_process_exceeded",
          },
          Object {
            "label": "process.io.text",
            "searchPath": "process.io.text",
          },
          Object {
            "label": "process.io.total_bytes_captured",
            "searchPath": "process.io.total_bytes_captured",
          },
          Object {
            "label": "process.io.total_bytes_skipped",
            "searchPath": "process.io.total_bytes_skipped",
          },
          Object {
            "label": "process.io.type",
            "searchPath": "process.io.type",
          },
          Object {
            "label": "process.macho.go_import_hash",
            "searchPath": "process.macho.go_import_hash",
          },
          Object {
            "label": "process.macho.go_imports_names_entropy",
            "searchPath": "process.macho.go_imports_names_entropy",
          },
          Object {
            "label": "process.macho.go_imports_names_var_entropy",
            "searchPath": "process.macho.go_imports_names_var_entropy",
          },
          Object {
            "label": "process.macho.go_stripped",
            "searchPath": "process.macho.go_stripped",
          },
          Object {
            "label": "process.macho.import_hash",
            "searchPath": "process.macho.import_hash",
          },
          Object {
            "label": "process.macho.imports_names_entropy",
            "searchPath": "process.macho.imports_names_entropy",
          },
          Object {
            "label": "process.macho.imports_names_var_entropy",
            "searchPath": "process.macho.imports_names_var_entropy",
          },
          Object {
            "label": "process.macho.symhash",
            "searchPath": "process.macho.symhash",
          },
          Object {
            "label": "process.name",
            "searchPath": "process.name",
          },
          Object {
            "label": "process.parent.args",
            "searchPath": "process.parent.args",
          },
          Object {
            "label": "process.parent.args_count",
            "searchPath": "process.parent.args_count",
          },
          Object {
            "label": "process.parent.code_signature.digest_algorithm",
            "searchPath": "process.parent.code_signature.digest_algorithm",
          },
          Object {
            "label": "process.parent.code_signature.exists",
            "searchPath": "process.parent.code_signature.exists",
          },
          Object {
            "label": "process.parent.code_signature.flags",
            "searchPath": "process.parent.code_signature.flags",
          },
          Object {
            "label": "process.parent.code_signature.signing_id",
            "searchPath": "process.parent.code_signature.signing_id",
          },
          Object {
            "label": "process.parent.code_signature.status",
            "searchPath": "process.parent.code_signature.status",
          },
          Object {
            "label": "process.parent.code_signature.subject_name",
            "searchPath": "process.parent.code_signature.subject_name",
          },
          Object {
            "label": "process.parent.code_signature.team_id",
            "searchPath": "process.parent.code_signature.team_id",
          },
          Object {
            "label": "process.parent.code_signature.thumbprint_sha256",
            "searchPath": "process.parent.code_signature.thumbprint_sha256",
          },
          Object {
            "label": "process.parent.code_signature.timestamp",
            "searchPath": "process.parent.code_signature.timestamp",
          },
          Object {
            "label": "process.parent.code_signature.trusted",
            "searchPath": "process.parent.code_signature.trusted",
          },
          Object {
            "label": "process.parent.code_signature.valid",
            "searchPath": "process.parent.code_signature.valid",
          },
          Object {
            "label": "process.parent.command_line",
            "searchPath": "process.parent.command_line",
          },
          Object {
            "label": "process.parent.elf.architecture",
            "searchPath": "process.parent.elf.architecture",
          },
          Object {
            "label": "process.parent.elf.byte_order",
            "searchPath": "process.parent.elf.byte_order",
          },
          Object {
            "label": "process.parent.elf.cpu_type",
            "searchPath": "process.parent.elf.cpu_type",
          },
          Object {
            "label": "process.parent.elf.creation_date",
            "searchPath": "process.parent.elf.creation_date",
          },
          Object {
            "label": "process.parent.elf.go_import_hash",
            "searchPath": "process.parent.elf.go_import_hash",
          },
          Object {
            "label": "process.parent.elf.go_imports_names_entropy",
            "searchPath": "process.parent.elf.go_imports_names_entropy",
          },
          Object {
            "label": "process.parent.elf.go_imports_names_var_entropy",
            "searchPath": "process.parent.elf.go_imports_names_var_entropy",
          },
          Object {
            "label": "process.parent.elf.go_stripped",
            "searchPath": "process.parent.elf.go_stripped",
          },
          Object {
            "label": "process.parent.elf.header.abi_version",
            "searchPath": "process.parent.elf.header.abi_version",
          },
          Object {
            "label": "process.parent.elf.header.class",
            "searchPath": "process.parent.elf.header.class",
          },
          Object {
            "label": "process.parent.elf.header.data",
            "searchPath": "process.parent.elf.header.data",
          },
          Object {
            "label": "process.parent.elf.header.entrypoint",
            "searchPath": "process.parent.elf.header.entrypoint",
          },
          Object {
            "label": "process.parent.elf.header.object_version",
            "searchPath": "process.parent.elf.header.object_version",
          },
          Object {
            "label": "process.parent.elf.header.os_abi",
            "searchPath": "process.parent.elf.header.os_abi",
          },
          Object {
            "label": "process.parent.elf.header.type",
            "searchPath": "process.parent.elf.header.type",
          },
          Object {
            "label": "process.parent.elf.header.version",
            "searchPath": "process.parent.elf.header.version",
          },
          Object {
            "label": "process.parent.elf.import_hash",
            "searchPath": "process.parent.elf.import_hash",
          },
          Object {
            "label": "process.parent.elf.imports_names_entropy",
            "searchPath": "process.parent.elf.imports_names_entropy",
          },
          Object {
            "label": "process.parent.elf.imports_names_var_entropy",
            "searchPath": "process.parent.elf.imports_names_var_entropy",
          },
          Object {
            "label": "process.parent.elf.shared_libraries",
            "searchPath": "process.parent.elf.shared_libraries",
          },
          Object {
            "label": "process.parent.elf.telfhash",
            "searchPath": "process.parent.elf.telfhash",
          },
          Object {
            "label": "process.parent.end",
            "searchPath": "process.parent.end",
          },
          Object {
            "label": "process.parent.entity_id",
            "searchPath": "process.parent.entity_id",
          },
          Object {
            "label": "process.parent.executable",
            "searchPath": "process.parent.executable",
          },
          Object {
            "label": "process.parent.exit_code",
            "searchPath": "process.parent.exit_code",
          },
          Object {
            "label": "process.parent.group.id",
            "searchPath": "process.parent.group.id",
          },
          Object {
            "label": "process.parent.group.name",
            "searchPath": "process.parent.group.name",
          },
          Object {
            "label": "process.parent.group_leader.entity_id",
            "searchPath": "process.parent.group_leader.entity_id",
          },
          Object {
            "label": "process.parent.group_leader.pid",
            "searchPath": "process.parent.group_leader.pid",
          },
          Object {
            "label": "process.parent.group_leader.start",
            "searchPath": "process.parent.group_leader.start",
          },
          Object {
            "label": "process.parent.group_leader.vpid",
            "searchPath": "process.parent.group_leader.vpid",
          },
          Object {
            "label": "process.parent.hash.cdhash",
            "searchPath": "process.parent.hash.cdhash",
          },
          Object {
            "label": "process.parent.hash.md5",
            "searchPath": "process.parent.hash.md5",
          },
          Object {
            "label": "process.parent.hash.sha1",
            "searchPath": "process.parent.hash.sha1",
          },
          Object {
            "label": "process.parent.hash.sha256",
            "searchPath": "process.parent.hash.sha256",
          },
          Object {
            "label": "process.parent.hash.sha384",
            "searchPath": "process.parent.hash.sha384",
          },
          Object {
            "label": "process.parent.hash.sha512",
            "searchPath": "process.parent.hash.sha512",
          },
          Object {
            "label": "process.parent.hash.ssdeep",
            "searchPath": "process.parent.hash.ssdeep",
          },
          Object {
            "label": "process.parent.hash.tlsh",
            "searchPath": "process.parent.hash.tlsh",
          },
          Object {
            "label": "process.parent.interactive",
            "searchPath": "process.parent.interactive",
          },
          Object {
            "label": "process.parent.macho.go_import_hash",
            "searchPath": "process.parent.macho.go_import_hash",
          },
          Object {
            "label": "process.parent.macho.go_imports_names_entropy",
            "searchPath": "process.parent.macho.go_imports_names_entropy",
          },
          Object {
            "label": "process.parent.macho.go_imports_names_var_entropy",
            "searchPath": "process.parent.macho.go_imports_names_var_entropy",
          },
          Object {
            "label": "process.parent.macho.go_stripped",
            "searchPath": "process.parent.macho.go_stripped",
          },
          Object {
            "label": "process.parent.macho.import_hash",
            "searchPath": "process.parent.macho.import_hash",
          },
          Object {
            "label": "process.parent.macho.imports_names_entropy",
            "searchPath": "process.parent.macho.imports_names_entropy",
          },
          Object {
            "label": "process.parent.macho.imports_names_var_entropy",
            "searchPath": "process.parent.macho.imports_names_var_entropy",
          },
          Object {
            "label": "process.parent.macho.symhash",
            "searchPath": "process.parent.macho.symhash",
          },
          Object {
            "label": "process.parent.name",
            "searchPath": "process.parent.name",
          },
          Object {
            "label": "process.parent.pe.architecture",
            "searchPath": "process.parent.pe.architecture",
          },
          Object {
            "label": "process.parent.pe.company",
            "searchPath": "process.parent.pe.company",
          },
          Object {
            "label": "process.parent.pe.description",
            "searchPath": "process.parent.pe.description",
          },
          Object {
            "label": "process.parent.pe.file_version",
            "searchPath": "process.parent.pe.file_version",
          },
          Object {
            "label": "process.parent.pe.go_import_hash",
            "searchPath": "process.parent.pe.go_import_hash",
          },
          Object {
            "label": "process.parent.pe.go_imports_names_entropy",
            "searchPath": "process.parent.pe.go_imports_names_entropy",
          },
          Object {
            "label": "process.parent.pe.go_imports_names_var_entropy",
            "searchPath": "process.parent.pe.go_imports_names_var_entropy",
          },
          Object {
            "label": "process.parent.pe.go_stripped",
            "searchPath": "process.parent.pe.go_stripped",
          },
          Object {
            "label": "process.parent.pe.imphash",
            "searchPath": "process.parent.pe.imphash",
          },
          Object {
            "label": "process.parent.pe.import_hash",
            "searchPath": "process.parent.pe.import_hash",
          },
          Object {
            "label": "process.parent.pe.imports_names_entropy",
            "searchPath": "process.parent.pe.imports_names_entropy",
          },
          Object {
            "label": "process.parent.pe.imports_names_var_entropy",
            "searchPath": "process.parent.pe.imports_names_var_entropy",
          },
          Object {
            "label": "process.parent.pe.original_file_name",
            "searchPath": "process.parent.pe.original_file_name",
          },
          Object {
            "label": "process.parent.pe.pehash",
            "searchPath": "process.parent.pe.pehash",
          },
          Object {
            "label": "process.parent.pe.product",
            "searchPath": "process.parent.pe.product",
          },
          Object {
            "label": "process.parent.pid",
            "searchPath": "process.parent.pid",
          },
          Object {
            "label": "process.parent.real_group.id",
            "searchPath": "process.parent.real_group.id",
          },
          Object {
            "label": "process.parent.real_group.name",
            "searchPath": "process.parent.real_group.name",
          },
          Object {
            "label": "process.parent.real_user.id",
            "searchPath": "process.parent.real_user.id",
          },
          Object {
            "label": "process.parent.real_user.name",
            "searchPath": "process.parent.real_user.name",
          },
          Object {
            "label": "process.parent.saved_group.id",
            "searchPath": "process.parent.saved_group.id",
          },
          Object {
            "label": "process.parent.saved_group.name",
            "searchPath": "process.parent.saved_group.name",
          },
          Object {
            "label": "process.parent.saved_user.id",
            "searchPath": "process.parent.saved_user.id",
          },
          Object {
            "label": "process.parent.saved_user.name",
            "searchPath": "process.parent.saved_user.name",
          },
          Object {
            "label": "process.parent.start",
            "searchPath": "process.parent.start",
          },
          Object {
            "label": "process.parent.supplemental_groups.id",
            "searchPath": "process.parent.supplemental_groups.id",
          },
          Object {
            "label": "process.parent.supplemental_groups.name",
            "searchPath": "process.parent.supplemental_groups.name",
          },
          Object {
            "label": "process.parent.thread.capabilities.effective",
            "searchPath": "process.parent.thread.capabilities.effective",
          },
          Object {
            "label": "process.parent.thread.capabilities.permitted",
            "searchPath": "process.parent.thread.capabilities.permitted",
          },
          Object {
            "label": "process.parent.thread.id",
            "searchPath": "process.parent.thread.id",
          },
          Object {
            "label": "process.parent.thread.name",
            "searchPath": "process.parent.thread.name",
          },
          Object {
            "label": "process.parent.title",
            "searchPath": "process.parent.title",
          },
          Object {
            "label": "process.parent.tty",
            "searchPath": "process.parent.tty",
          },
          Object {
            "label": "process.parent.tty.char_device.major",
            "searchPath": "process.parent.tty.char_device.major",
          },
          Object {
            "label": "process.parent.tty.char_device.minor",
            "searchPath": "process.parent.tty.char_device.minor",
          },
          Object {
            "label": "process.parent.uptime",
            "searchPath": "process.parent.uptime",
          },
          Object {
            "label": "process.parent.user.id",
            "searchPath": "process.parent.user.id",
          },
          Object {
            "label": "process.parent.user.name",
            "searchPath": "process.parent.user.name",
          },
          Object {
            "label": "process.parent.vpid",
            "searchPath": "process.parent.vpid",
          },
          Object {
            "label": "process.parent.working_directory",
            "searchPath": "process.parent.working_directory",
          },
          Object {
            "label": "process.pe.architecture",
            "searchPath": "process.pe.architecture",
          },
          Object {
            "label": "process.pe.company",
            "searchPath": "process.pe.company",
          },
          Object {
            "label": "process.pe.description",
            "searchPath": "process.pe.description",
          },
          Object {
            "label": "process.pe.file_version",
            "searchPath": "process.pe.file_version",
          },
          Object {
            "label": "process.pe.go_import_hash",
            "searchPath": "process.pe.go_import_hash",
          },
          Object {
            "label": "process.pe.go_imports_names_entropy",
            "searchPath": "process.pe.go_imports_names_entropy",
          },
          Object {
            "label": "process.pe.go_imports_names_var_entropy",
            "searchPath": "process.pe.go_imports_names_var_entropy",
          },
          Object {
            "label": "process.pe.go_stripped",
            "searchPath": "process.pe.go_stripped",
          },
          Object {
            "label": "process.pe.imphash",
            "searchPath": "process.pe.imphash",
          },
          Object {
            "label": "process.pe.import_hash",
            "searchPath": "process.pe.import_hash",
          },
          Object {
            "label": "process.pe.imports_names_entropy",
            "searchPath": "process.pe.imports_names_entropy",
          },
          Object {
            "label": "process.pe.imports_names_var_entropy",
            "searchPath": "process.pe.imports_names_var_entropy",
          },
          Object {
            "label": "process.pe.original_file_name",
            "searchPath": "process.pe.original_file_name",
          },
          Object {
            "label": "process.pe.pehash",
            "searchPath": "process.pe.pehash",
          },
          Object {
            "label": "process.pe.product",
            "searchPath": "process.pe.product",
          },
          Object {
            "label": "process.pid",
            "searchPath": "process.pid",
          },
          Object {
            "label": "process.previous.args",
            "searchPath": "process.previous.args",
          },
          Object {
            "label": "process.previous.args_count",
            "searchPath": "process.previous.args_count",
          },
          Object {
            "label": "process.previous.executable",
            "searchPath": "process.previous.executable",
          },
          Object {
            "label": "process.real_group.id",
            "searchPath": "process.real_group.id",
          },
          Object {
            "label": "process.real_group.name",
            "searchPath": "process.real_group.name",
          },
          Object {
            "label": "process.real_user.id",
            "searchPath": "process.real_user.id",
          },
          Object {
            "label": "process.real_user.name",
            "searchPath": "process.real_user.name",
          },
          Object {
            "label": "process.saved_group.id",
            "searchPath": "process.saved_group.id",
          },
          Object {
            "label": "process.saved_group.name",
            "searchPath": "process.saved_group.name",
          },
          Object {
            "label": "process.saved_user.id",
            "searchPath": "process.saved_user.id",
          },
          Object {
            "label": "process.saved_user.name",
            "searchPath": "process.saved_user.name",
          },
          Object {
            "label": "process.session_leader.args",
            "searchPath": "process.session_leader.args",
          },
          Object {
            "label": "process.session_leader.args_count",
            "searchPath": "process.session_leader.args_count",
          },
          Object {
            "label": "process.session_leader.command_line",
            "searchPath": "process.session_leader.command_line",
          },
          Object {
            "label": "process.session_leader.entity_id",
            "searchPath": "process.session_leader.entity_id",
          },
          Object {
            "label": "process.session_leader.executable",
            "searchPath": "process.session_leader.executable",
          },
          Object {
            "label": "process.session_leader.group.id",
            "searchPath": "process.session_leader.group.id",
          },
          Object {
            "label": "process.session_leader.group.name",
            "searchPath": "process.session_leader.group.name",
          },
          Object {
            "label": "process.session_leader.interactive",
            "searchPath": "process.session_leader.interactive",
          },
          Object {
            "label": "process.session_leader.name",
            "searchPath": "process.session_leader.name",
          },
          Object {
            "label": "process.session_leader.parent.entity_id",
            "searchPath": "process.session_leader.parent.entity_id",
          },
          Object {
            "label": "process.session_leader.parent.pid",
            "searchPath": "process.session_leader.parent.pid",
          },
          Object {
            "label": "process.session_leader.parent.session_leader.entity_id",
            "searchPath": "process.session_leader.parent.session_leader.entity_id",
          },
          Object {
            "label": "process.session_leader.parent.session_leader.pid",
            "searchPath": "process.session_leader.parent.session_leader.pid",
          },
          Object {
            "label": "process.session_leader.parent.session_leader.start",
            "searchPath": "process.session_leader.parent.session_leader.start",
          },
          Object {
            "label": "process.session_leader.parent.session_leader.vpid",
            "searchPath": "process.session_leader.parent.session_leader.vpid",
          },
          Object {
            "label": "process.session_leader.parent.start",
            "searchPath": "process.session_leader.parent.start",
          },
          Object {
            "label": "process.session_leader.parent.vpid",
            "searchPath": "process.session_leader.parent.vpid",
          },
          Object {
            "label": "process.session_leader.pid",
            "searchPath": "process.session_leader.pid",
          },
          Object {
            "label": "process.session_leader.real_group.id",
            "searchPath": "process.session_leader.real_group.id",
          },
          Object {
            "label": "process.session_leader.real_group.name",
            "searchPath": "process.session_leader.real_group.name",
          },
          Object {
            "label": "process.session_leader.real_user.id",
            "searchPath": "process.session_leader.real_user.id",
          },
          Object {
            "label": "process.session_leader.real_user.name",
            "searchPath": "process.session_leader.real_user.name",
          },
          Object {
            "label": "process.session_leader.same_as_process",
            "searchPath": "process.session_leader.same_as_process",
          },
          Object {
            "label": "process.session_leader.saved_group.id",
            "searchPath": "process.session_leader.saved_group.id",
          },
          Object {
            "label": "process.session_leader.saved_group.name",
            "searchPath": "process.session_leader.saved_group.name",
          },
          Object {
            "label": "process.session_leader.saved_user.id",
            "searchPath": "process.session_leader.saved_user.id",
          },
          Object {
            "label": "process.session_leader.saved_user.name",
            "searchPath": "process.session_leader.saved_user.name",
          },
          Object {
            "label": "process.session_leader.start",
            "searchPath": "process.session_leader.start",
          },
          Object {
            "label": "process.session_leader.supplemental_groups.id",
            "searchPath": "process.session_leader.supplemental_groups.id",
          },
          Object {
            "label": "process.session_leader.supplemental_groups.name",
            "searchPath": "process.session_leader.supplemental_groups.name",
          },
          Object {
            "label": "process.session_leader.tty",
            "searchPath": "process.session_leader.tty",
          },
          Object {
            "label": "process.session_leader.tty.char_device.major",
            "searchPath": "process.session_leader.tty.char_device.major",
          },
          Object {
            "label": "process.session_leader.tty.char_device.minor",
            "searchPath": "process.session_leader.tty.char_device.minor",
          },
          Object {
            "label": "process.session_leader.user.id",
            "searchPath": "process.session_leader.user.id",
          },
          Object {
            "label": "process.session_leader.user.name",
            "searchPath": "process.session_leader.user.name",
          },
          Object {
            "label": "process.session_leader.vpid",
            "searchPath": "process.session_leader.vpid",
          },
          Object {
            "label": "process.session_leader.working_directory",
            "searchPath": "process.session_leader.working_directory",
          },
          Object {
            "label": "process.start",
            "searchPath": "process.start",
          },
          Object {
            "label": "process.supplemental_groups.id",
            "searchPath": "process.supplemental_groups.id",
          },
          Object {
            "label": "process.supplemental_groups.name",
            "searchPath": "process.supplemental_groups.name",
          },
          Object {
            "label": "process.thread.capabilities.effective",
            "searchPath": "process.thread.capabilities.effective",
          },
          Object {
            "label": "process.thread.capabilities.permitted",
            "searchPath": "process.thread.capabilities.permitted",
          },
          Object {
            "label": "process.thread.id",
            "searchPath": "process.thread.id",
          },
          Object {
            "label": "process.thread.name",
            "searchPath": "process.thread.name",
          },
          Object {
            "label": "process.title",
            "searchPath": "process.title",
          },
          Object {
            "label": "process.tty",
            "searchPath": "process.tty",
          },
          Object {
            "label": "process.tty.char_device.major",
            "searchPath": "process.tty.char_device.major",
          },
          Object {
            "label": "process.tty.char_device.minor",
            "searchPath": "process.tty.char_device.minor",
          },
          Object {
            "label": "process.tty.columns",
            "searchPath": "process.tty.columns",
          },
          Object {
            "label": "process.tty.rows",
            "searchPath": "process.tty.rows",
          },
          Object {
            "label": "process.uptime",
            "searchPath": "process.uptime",
          },
          Object {
            "label": "process.user.id",
            "searchPath": "process.user.id",
          },
          Object {
            "label": "process.user.name",
            "searchPath": "process.user.name",
          },
          Object {
            "label": "process.vpid",
            "searchPath": "process.vpid",
          },
          Object {
            "label": "process.working_directory",
            "searchPath": "process.working_directory",
          },
          Object {
            "label": "registry.data.bytes",
            "searchPath": "registry.data.bytes",
          },
          Object {
            "label": "registry.data.strings",
            "searchPath": "registry.data.strings",
          },
          Object {
            "label": "registry.data.type",
            "searchPath": "registry.data.type",
          },
          Object {
            "label": "registry.hive",
            "searchPath": "registry.hive",
          },
          Object {
            "label": "registry.key",
            "searchPath": "registry.key",
          },
          Object {
            "label": "registry.path",
            "searchPath": "registry.path",
          },
          Object {
            "label": "registry.value",
            "searchPath": "registry.value",
          },
          Object {
            "label": "related.hash",
            "searchPath": "related.hash",
          },
          Object {
            "label": "related.hosts",
            "searchPath": "related.hosts",
          },
          Object {
            "label": "related.ip",
            "searchPath": "related.ip",
          },
          Object {
            "label": "related.user",
            "searchPath": "related.user",
          },
          Object {
            "label": "rule.author",
            "searchPath": "rule.author",
          },
          Object {
            "label": "rule.category",
            "searchPath": "rule.category",
          },
          Object {
            "label": "rule.description",
            "searchPath": "rule.description",
          },
          Object {
            "label": "rule.id",
            "searchPath": "rule.id",
          },
          Object {
            "label": "rule.license",
            "searchPath": "rule.license",
          },
          Object {
            "label": "rule.name",
            "searchPath": "rule.name",
          },
          Object {
            "label": "rule.reference",
            "searchPath": "rule.reference",
          },
          Object {
            "label": "rule.ruleset",
            "searchPath": "rule.ruleset",
          },
          Object {
            "label": "rule.uuid",
            "searchPath": "rule.uuid",
          },
          Object {
            "label": "rule.version",
            "searchPath": "rule.version",
          },
          Object {
            "label": "server.address",
            "searchPath": "server.address",
          },
          Object {
            "label": "server.as.number",
            "searchPath": "server.as.number",
          },
          Object {
            "label": "server.as.organization.name",
            "searchPath": "server.as.organization.name",
          },
          Object {
            "label": "server.bytes",
            "searchPath": "server.bytes",
          },
          Object {
            "label": "server.domain",
            "searchPath": "server.domain",
          },
          Object {
            "label": "server.geo.city_name",
            "searchPath": "server.geo.city_name",
          },
          Object {
            "label": "server.geo.continent_code",
            "searchPath": "server.geo.continent_code",
          },
          Object {
            "label": "server.geo.continent_name",
            "searchPath": "server.geo.continent_name",
          },
          Object {
            "label": "server.geo.country_iso_code",
            "searchPath": "server.geo.country_iso_code",
          },
          Object {
            "label": "server.geo.country_name",
            "searchPath": "server.geo.country_name",
          },
          Object {
            "label": "server.geo.location",
            "searchPath": "server.geo.location",
          },
          Object {
            "label": "server.geo.name",
            "searchPath": "server.geo.name",
          },
          Object {
            "label": "server.geo.postal_code",
            "searchPath": "server.geo.postal_code",
          },
          Object {
            "label": "server.geo.region_iso_code",
            "searchPath": "server.geo.region_iso_code",
          },
          Object {
            "label": "server.geo.region_name",
            "searchPath": "server.geo.region_name",
          },
          Object {
            "label": "server.geo.timezone",
            "searchPath": "server.geo.timezone",
          },
          Object {
            "label": "server.ip",
            "searchPath": "server.ip",
          },
          Object {
            "label": "server.mac",
            "searchPath": "server.mac",
          },
          Object {
            "label": "server.nat.ip",
            "searchPath": "server.nat.ip",
          },
          Object {
            "label": "server.nat.port",
            "searchPath": "server.nat.port",
          },
          Object {
            "label": "server.packets",
            "searchPath": "server.packets",
          },
          Object {
            "label": "server.port",
            "searchPath": "server.port",
          },
          Object {
            "label": "server.registered_domain",
            "searchPath": "server.registered_domain",
          },
          Object {
            "label": "server.subdomain",
            "searchPath": "server.subdomain",
          },
          Object {
            "label": "server.top_level_domain",
            "searchPath": "server.top_level_domain",
          },
          Object {
            "label": "server.user.domain",
            "searchPath": "server.user.domain",
          },
          Object {
            "label": "server.user.email",
            "searchPath": "server.user.email",
          },
          Object {
            "label": "server.user.full_name",
            "searchPath": "server.user.full_name",
          },
          Object {
            "label": "server.user.group.domain",
            "searchPath": "server.user.group.domain",
          },
          Object {
            "label": "server.user.group.id",
            "searchPath": "server.user.group.id",
          },
          Object {
            "label": "server.user.group.name",
            "searchPath": "server.user.group.name",
          },
          Object {
            "label": "server.user.hash",
            "searchPath": "server.user.hash",
          },
          Object {
            "label": "server.user.id",
            "searchPath": "server.user.id",
          },
          Object {
            "label": "server.user.name",
            "searchPath": "server.user.name",
          },
          Object {
            "label": "server.user.roles",
            "searchPath": "server.user.roles",
          },
          Object {
            "label": "service.address",
            "searchPath": "service.address",
          },
          Object {
            "label": "service.entity.attributes",
            "searchPath": "service.entity.attributes",
          },
          Object {
            "label": "service.entity.behavior",
            "searchPath": "service.entity.behavior",
          },
          Object {
            "label": "service.entity.display_name",
            "searchPath": "service.entity.display_name",
          },
          Object {
            "label": "service.entity.id",
            "searchPath": "service.entity.id",
          },
          Object {
            "label": "service.entity.last_seen_timestamp",
            "searchPath": "service.entity.last_seen_timestamp",
          },
          Object {
            "label": "service.entity.lifecycle",
            "searchPath": "service.entity.lifecycle",
          },
          Object {
            "label": "service.entity.metrics",
            "searchPath": "service.entity.metrics",
          },
          Object {
            "label": "service.entity.name",
            "searchPath": "service.entity.name",
          },
          Object {
            "label": "service.entity.raw",
            "searchPath": "service.entity.raw",
          },
          Object {
            "label": "service.entity.reference",
            "searchPath": "service.entity.reference",
          },
          Object {
            "label": "service.entity.source",
            "searchPath": "service.entity.source",
          },
          Object {
            "label": "service.entity.sub_type",
            "searchPath": "service.entity.sub_type",
          },
          Object {
            "label": "service.entity.type",
            "searchPath": "service.entity.type",
          },
          Object {
            "label": "service.environment",
            "searchPath": "service.environment",
          },
          Object {
            "label": "service.ephemeral_id",
            "searchPath": "service.ephemeral_id",
          },
          Object {
            "label": "service.id",
            "searchPath": "service.id",
          },
          Object {
            "label": "service.name",
            "searchPath": "service.name",
          },
          Object {
            "label": "service.node.name",
            "searchPath": "service.node.name",
          },
          Object {
            "label": "service.node.role",
            "searchPath": "service.node.role",
          },
          Object {
            "label": "service.node.roles",
            "searchPath": "service.node.roles",
          },
          Object {
            "label": "service.origin.address",
            "searchPath": "service.origin.address",
          },
          Object {
            "label": "service.origin.entity.attributes",
            "searchPath": "service.origin.entity.attributes",
          },
          Object {
            "label": "service.origin.entity.behavior",
            "searchPath": "service.origin.entity.behavior",
          },
          Object {
            "label": "service.origin.entity.display_name",
            "searchPath": "service.origin.entity.display_name",
          },
          Object {
            "label": "service.origin.entity.id",
            "searchPath": "service.origin.entity.id",
          },
          Object {
            "label": "service.origin.entity.last_seen_timestamp",
            "searchPath": "service.origin.entity.last_seen_timestamp",
          },
          Object {
            "label": "service.origin.entity.lifecycle",
            "searchPath": "service.origin.entity.lifecycle",
          },
          Object {
            "label": "service.origin.entity.metrics",
            "searchPath": "service.origin.entity.metrics",
          },
          Object {
            "label": "service.origin.entity.name",
            "searchPath": "service.origin.entity.name",
          },
          Object {
            "label": "service.origin.entity.raw",
            "searchPath": "service.origin.entity.raw",
          },
          Object {
            "label": "service.origin.entity.reference",
            "searchPath": "service.origin.entity.reference",
          },
          Object {
            "label": "service.origin.entity.source",
            "searchPath": "service.origin.entity.source",
          },
          Object {
            "label": "service.origin.entity.sub_type",
            "searchPath": "service.origin.entity.sub_type",
          },
          Object {
            "label": "service.origin.entity.type",
            "searchPath": "service.origin.entity.type",
          },
          Object {
            "label": "service.origin.environment",
            "searchPath": "service.origin.environment",
          },
          Object {
            "label": "service.origin.ephemeral_id",
            "searchPath": "service.origin.ephemeral_id",
          },
          Object {
            "label": "service.origin.id",
            "searchPath": "service.origin.id",
          },
          Object {
            "label": "service.origin.name",
            "searchPath": "service.origin.name",
          },
          Object {
            "label": "service.origin.node.name",
            "searchPath": "service.origin.node.name",
          },
          Object {
            "label": "service.origin.node.role",
            "searchPath": "service.origin.node.role",
          },
          Object {
            "label": "service.origin.node.roles",
            "searchPath": "service.origin.node.roles",
          },
          Object {
            "label": "service.origin.state",
            "searchPath": "service.origin.state",
          },
          Object {
            "label": "service.origin.type",
            "searchPath": "service.origin.type",
          },
          Object {
            "label": "service.origin.version",
            "searchPath": "service.origin.version",
          },
          Object {
            "label": "service.state",
            "searchPath": "service.state",
          },
          Object {
            "label": "service.target.address",
            "searchPath": "service.target.address",
          },
          Object {
            "label": "service.target.entity.attributes",
            "searchPath": "service.target.entity.attributes",
          },
          Object {
            "label": "service.target.entity.behavior",
            "searchPath": "service.target.entity.behavior",
          },
          Object {
            "label": "service.target.entity.display_name",
            "searchPath": "service.target.entity.display_name",
          },
          Object {
            "label": "service.target.entity.id",
            "searchPath": "service.target.entity.id",
          },
          Object {
            "label": "service.target.entity.last_seen_timestamp",
            "searchPath": "service.target.entity.last_seen_timestamp",
          },
          Object {
            "label": "service.target.entity.lifecycle",
            "searchPath": "service.target.entity.lifecycle",
          },
          Object {
            "label": "service.target.entity.metrics",
            "searchPath": "service.target.entity.metrics",
          },
          Object {
            "label": "service.target.entity.name",
            "searchPath": "service.target.entity.name",
          },
          Object {
            "label": "service.target.entity.raw",
            "searchPath": "service.target.entity.raw",
          },
          Object {
            "label": "service.target.entity.reference",
            "searchPath": "service.target.entity.reference",
          },
          Object {
            "label": "service.target.entity.source",
            "searchPath": "service.target.entity.source",
          },
          Object {
            "label": "service.target.entity.sub_type",
            "searchPath": "service.target.entity.sub_type",
          },
          Object {
            "label": "service.target.entity.type",
            "searchPath": "service.target.entity.type",
          },
          Object {
            "label": "service.target.environment",
            "searchPath": "service.target.environment",
          },
          Object {
            "label": "service.target.ephemeral_id",
            "searchPath": "service.target.ephemeral_id",
          },
          Object {
            "label": "service.target.id",
            "searchPath": "service.target.id",
          },
          Object {
            "label": "service.target.name",
            "searchPath": "service.target.name",
          },
          Object {
            "label": "service.target.node.name",
            "searchPath": "service.target.node.name",
          },
          Object {
            "label": "service.target.node.role",
            "searchPath": "service.target.node.role",
          },
          Object {
            "label": "service.target.node.roles",
            "searchPath": "service.target.node.roles",
          },
          Object {
            "label": "service.target.state",
            "searchPath": "service.target.state",
          },
          Object {
            "label": "service.target.type",
            "searchPath": "service.target.type",
          },
          Object {
            "label": "service.target.version",
            "searchPath": "service.target.version",
          },
          Object {
            "label": "service.type",
            "searchPath": "service.type",
          },
          Object {
            "label": "service.version",
            "searchPath": "service.version",
          },
          Object {
            "label": "source.address",
            "searchPath": "source.address",
          },
          Object {
            "label": "source.as.number",
            "searchPath": "source.as.number",
          },
          Object {
            "label": "source.as.organization.name",
            "searchPath": "source.as.organization.name",
          },
          Object {
            "label": "source.bytes",
            "searchPath": "source.bytes",
          },
          Object {
            "label": "source.domain",
            "searchPath": "source.domain",
          },
          Object {
            "label": "source.geo.city_name",
            "searchPath": "source.geo.city_name",
          },
          Object {
            "label": "source.geo.continent_code",
            "searchPath": "source.geo.continent_code",
          },
          Object {
            "label": "source.geo.continent_name",
            "searchPath": "source.geo.continent_name",
          },
          Object {
            "label": "source.geo.country_iso_code",
            "searchPath": "source.geo.country_iso_code",
          },
          Object {
            "label": "source.geo.country_name",
            "searchPath": "source.geo.country_name",
          },
          Object {
            "label": "source.geo.location",
            "searchPath": "source.geo.location",
          },
          Object {
            "label": "source.geo.name",
            "searchPath": "source.geo.name",
          },
          Object {
            "label": "source.geo.postal_code",
            "searchPath": "source.geo.postal_code",
          },
          Object {
            "label": "source.geo.region_iso_code",
            "searchPath": "source.geo.region_iso_code",
          },
          Object {
            "label": "source.geo.region_name",
            "searchPath": "source.geo.region_name",
          },
          Object {
            "label": "source.geo.timezone",
            "searchPath": "source.geo.timezone",
          },
          Object {
            "label": "source.ip",
            "searchPath": "source.ip",
          },
          Object {
            "label": "source.mac",
            "searchPath": "source.mac",
          },
          Object {
            "label": "source.nat.ip",
            "searchPath": "source.nat.ip",
          },
          Object {
            "label": "source.nat.port",
            "searchPath": "source.nat.port",
          },
          Object {
            "label": "source.packets",
            "searchPath": "source.packets",
          },
          Object {
            "label": "source.port",
            "searchPath": "source.port",
          },
          Object {
            "label": "source.registered_domain",
            "searchPath": "source.registered_domain",
          },
          Object {
            "label": "source.subdomain",
            "searchPath": "source.subdomain",
          },
          Object {
            "label": "source.top_level_domain",
            "searchPath": "source.top_level_domain",
          },
          Object {
            "label": "source.user.domain",
            "searchPath": "source.user.domain",
          },
          Object {
            "label": "source.user.email",
            "searchPath": "source.user.email",
          },
          Object {
            "label": "source.user.full_name",
            "searchPath": "source.user.full_name",
          },
          Object {
            "label": "source.user.group.domain",
            "searchPath": "source.user.group.domain",
          },
          Object {
            "label": "source.user.group.id",
            "searchPath": "source.user.group.id",
          },
          Object {
            "label": "source.user.group.name",
            "searchPath": "source.user.group.name",
          },
          Object {
            "label": "source.user.hash",
            "searchPath": "source.user.hash",
          },
          Object {
            "label": "source.user.id",
            "searchPath": "source.user.id",
          },
          Object {
            "label": "source.user.name",
            "searchPath": "source.user.name",
          },
          Object {
            "label": "source.user.roles",
            "searchPath": "source.user.roles",
          },
          Object {
            "label": "span.id",
            "searchPath": "span.id",
          },
          Object {
            "label": "threat.feed.dashboard_id",
            "searchPath": "threat.feed.dashboard_id",
          },
          Object {
            "label": "threat.feed.description",
            "searchPath": "threat.feed.description",
          },
          Object {
            "label": "threat.feed.name",
            "searchPath": "threat.feed.name",
          },
          Object {
            "label": "threat.feed.reference",
            "searchPath": "threat.feed.reference",
          },
          Object {
            "label": "threat.framework",
            "searchPath": "threat.framework",
          },
          Object {
            "label": "threat.group.alias",
            "searchPath": "threat.group.alias",
          },
          Object {
            "label": "threat.group.id",
            "searchPath": "threat.group.id",
          },
          Object {
            "label": "threat.group.name",
            "searchPath": "threat.group.name",
          },
          Object {
            "label": "threat.group.reference",
            "searchPath": "threat.group.reference",
          },
          Object {
            "label": "threat.indicator.as.number",
            "searchPath": "threat.indicator.as.number",
          },
          Object {
            "label": "threat.indicator.as.organization.name",
            "searchPath": "threat.indicator.as.organization.name",
          },
          Object {
            "label": "threat.indicator.confidence",
            "searchPath": "threat.indicator.confidence",
          },
          Object {
            "label": "threat.indicator.description",
            "searchPath": "threat.indicator.description",
          },
          Object {
            "label": "threat.indicator.email.address",
            "searchPath": "threat.indicator.email.address",
          },
          Object {
            "label": "threat.indicator.file.accessed",
            "searchPath": "threat.indicator.file.accessed",
          },
          Object {
            "label": "threat.indicator.file.attributes",
            "searchPath": "threat.indicator.file.attributes",
          },
          Object {
            "label": "threat.indicator.file.code_signature.digest_algorithm",
            "searchPath": "threat.indicator.file.code_signature.digest_algorithm",
          },
          Object {
            "label": "threat.indicator.file.code_signature.exists",
            "searchPath": "threat.indicator.file.code_signature.exists",
          },
          Object {
            "label": "threat.indicator.file.code_signature.flags",
            "searchPath": "threat.indicator.file.code_signature.flags",
          },
          Object {
            "label": "threat.indicator.file.code_signature.signing_id",
            "searchPath": "threat.indicator.file.code_signature.signing_id",
          },
          Object {
            "label": "threat.indicator.file.code_signature.status",
            "searchPath": "threat.indicator.file.code_signature.status",
          },
          Object {
            "label": "threat.indicator.file.code_signature.subject_name",
            "searchPath": "threat.indicator.file.code_signature.subject_name",
          },
          Object {
            "label": "threat.indicator.file.code_signature.team_id",
            "searchPath": "threat.indicator.file.code_signature.team_id",
          },
          Object {
            "label": "threat.indicator.file.code_signature.thumbprint_sha256",
            "searchPath": "threat.indicator.file.code_signature.thumbprint_sha256",
          },
          Object {
            "label": "threat.indicator.file.code_signature.timestamp",
            "searchPath": "threat.indicator.file.code_signature.timestamp",
          },
          Object {
            "label": "threat.indicator.file.code_signature.trusted",
            "searchPath": "threat.indicator.file.code_signature.trusted",
          },
          Object {
            "label": "threat.indicator.file.code_signature.valid",
            "searchPath": "threat.indicator.file.code_signature.valid",
          },
          Object {
            "label": "threat.indicator.file.created",
            "searchPath": "threat.indicator.file.created",
          },
          Object {
            "label": "threat.indicator.file.ctime",
            "searchPath": "threat.indicator.file.ctime",
          },
          Object {
            "label": "threat.indicator.file.device",
            "searchPath": "threat.indicator.file.device",
          },
          Object {
            "label": "threat.indicator.file.directory",
            "searchPath": "threat.indicator.file.directory",
          },
          Object {
            "label": "threat.indicator.file.drive_letter",
            "searchPath": "threat.indicator.file.drive_letter",
          },
          Object {
            "label": "threat.indicator.file.elf.architecture",
            "searchPath": "threat.indicator.file.elf.architecture",
          },
          Object {
            "label": "threat.indicator.file.elf.byte_order",
            "searchPath": "threat.indicator.file.elf.byte_order",
          },
          Object {
            "label": "threat.indicator.file.elf.cpu_type",
            "searchPath": "threat.indicator.file.elf.cpu_type",
          },
          Object {
            "label": "threat.indicator.file.elf.creation_date",
            "searchPath": "threat.indicator.file.elf.creation_date",
          },
          Object {
            "label": "threat.indicator.file.elf.go_import_hash",
            "searchPath": "threat.indicator.file.elf.go_import_hash",
          },
          Object {
            "label": "threat.indicator.file.elf.go_imports_names_entropy",
            "searchPath": "threat.indicator.file.elf.go_imports_names_entropy",
          },
          Object {
            "label": "threat.indicator.file.elf.go_imports_names_var_entropy",
            "searchPath": "threat.indicator.file.elf.go_imports_names_var_entropy",
          },
          Object {
            "label": "threat.indicator.file.elf.go_stripped",
            "searchPath": "threat.indicator.file.elf.go_stripped",
          },
          Object {
            "label": "threat.indicator.file.elf.header.abi_version",
            "searchPath": "threat.indicator.file.elf.header.abi_version",
          },
          Object {
            "label": "threat.indicator.file.elf.header.class",
            "searchPath": "threat.indicator.file.elf.header.class",
          },
          Object {
            "label": "threat.indicator.file.elf.header.data",
            "searchPath": "threat.indicator.file.elf.header.data",
          },
          Object {
            "label": "threat.indicator.file.elf.header.entrypoint",
            "searchPath": "threat.indicator.file.elf.header.entrypoint",
          },
          Object {
            "label": "threat.indicator.file.elf.header.object_version",
            "searchPath": "threat.indicator.file.elf.header.object_version",
          },
          Object {
            "label": "threat.indicator.file.elf.header.os_abi",
            "searchPath": "threat.indicator.file.elf.header.os_abi",
          },
          Object {
            "label": "threat.indicator.file.elf.header.type",
            "searchPath": "threat.indicator.file.elf.header.type",
          },
          Object {
            "label": "threat.indicator.file.elf.header.version",
            "searchPath": "threat.indicator.file.elf.header.version",
          },
          Object {
            "label": "threat.indicator.file.elf.import_hash",
            "searchPath": "threat.indicator.file.elf.import_hash",
          },
          Object {
            "label": "threat.indicator.file.elf.imports_names_entropy",
            "searchPath": "threat.indicator.file.elf.imports_names_entropy",
          },
          Object {
            "label": "threat.indicator.file.elf.imports_names_var_entropy",
            "searchPath": "threat.indicator.file.elf.imports_names_var_entropy",
          },
          Object {
            "label": "threat.indicator.file.elf.shared_libraries",
            "searchPath": "threat.indicator.file.elf.shared_libraries",
          },
          Object {
            "label": "threat.indicator.file.elf.telfhash",
            "searchPath": "threat.indicator.file.elf.telfhash",
          },
          Object {
            "label": "threat.indicator.file.extension",
            "searchPath": "threat.indicator.file.extension",
          },
          Object {
            "label": "threat.indicator.file.fork_name",
            "searchPath": "threat.indicator.file.fork_name",
          },
          Object {
            "label": "threat.indicator.file.gid",
            "searchPath": "threat.indicator.file.gid",
          },
          Object {
            "label": "threat.indicator.file.group",
            "searchPath": "threat.indicator.file.group",
          },
          Object {
            "label": "threat.indicator.file.hash.cdhash",
            "searchPath": "threat.indicator.file.hash.cdhash",
          },
          Object {
            "label": "threat.indicator.file.hash.md5",
            "searchPath": "threat.indicator.file.hash.md5",
          },
          Object {
            "label": "threat.indicator.file.hash.sha1",
            "searchPath": "threat.indicator.file.hash.sha1",
          },
          Object {
            "label": "threat.indicator.file.hash.sha256",
            "searchPath": "threat.indicator.file.hash.sha256",
          },
          Object {
            "label": "threat.indicator.file.hash.sha384",
            "searchPath": "threat.indicator.file.hash.sha384",
          },
          Object {
            "label": "threat.indicator.file.hash.sha512",
            "searchPath": "threat.indicator.file.hash.sha512",
          },
          Object {
            "label": "threat.indicator.file.hash.ssdeep",
            "searchPath": "threat.indicator.file.hash.ssdeep",
          },
          Object {
            "label": "threat.indicator.file.hash.tlsh",
            "searchPath": "threat.indicator.file.hash.tlsh",
          },
          Object {
            "label": "threat.indicator.file.inode",
            "searchPath": "threat.indicator.file.inode",
          },
          Object {
            "label": "threat.indicator.file.mime_type",
            "searchPath": "threat.indicator.file.mime_type",
          },
          Object {
            "label": "threat.indicator.file.mode",
            "searchPath": "threat.indicator.file.mode",
          },
          Object {
            "label": "threat.indicator.file.mtime",
            "searchPath": "threat.indicator.file.mtime",
          },
          Object {
            "label": "threat.indicator.file.name",
            "searchPath": "threat.indicator.file.name",
          },
          Object {
            "label": "threat.indicator.file.origin_referrer_url",
            "searchPath": "threat.indicator.file.origin_referrer_url",
          },
          Object {
            "label": "threat.indicator.file.origin_url",
            "searchPath": "threat.indicator.file.origin_url",
          },
          Object {
            "label": "threat.indicator.file.owner",
            "searchPath": "threat.indicator.file.owner",
          },
          Object {
            "label": "threat.indicator.file.path",
            "searchPath": "threat.indicator.file.path",
          },
          Object {
            "label": "threat.indicator.file.pe.architecture",
            "searchPath": "threat.indicator.file.pe.architecture",
          },
          Object {
            "label": "threat.indicator.file.pe.company",
            "searchPath": "threat.indicator.file.pe.company",
          },
          Object {
            "label": "threat.indicator.file.pe.description",
            "searchPath": "threat.indicator.file.pe.description",
          },
          Object {
            "label": "threat.indicator.file.pe.file_version",
            "searchPath": "threat.indicator.file.pe.file_version",
          },
          Object {
            "label": "threat.indicator.file.pe.go_import_hash",
            "searchPath": "threat.indicator.file.pe.go_import_hash",
          },
          Object {
            "label": "threat.indicator.file.pe.go_imports_names_entropy",
            "searchPath": "threat.indicator.file.pe.go_imports_names_entropy",
          },
          Object {
            "label": "threat.indicator.file.pe.go_imports_names_var_entropy",
            "searchPath": "threat.indicator.file.pe.go_imports_names_var_entropy",
          },
          Object {
            "label": "threat.indicator.file.pe.go_stripped",
            "searchPath": "threat.indicator.file.pe.go_stripped",
          },
          Object {
            "label": "threat.indicator.file.pe.imphash",
            "searchPath": "threat.indicator.file.pe.imphash",
          },
          Object {
            "label": "threat.indicator.file.pe.import_hash",
            "searchPath": "threat.indicator.file.pe.import_hash",
          },
          Object {
            "label": "threat.indicator.file.pe.imports_names_entropy",
            "searchPath": "threat.indicator.file.pe.imports_names_entropy",
          },
          Object {
            "label": "threat.indicator.file.pe.imports_names_var_entropy",
            "searchPath": "threat.indicator.file.pe.imports_names_var_entropy",
          },
          Object {
            "label": "threat.indicator.file.pe.original_file_name",
            "searchPath": "threat.indicator.file.pe.original_file_name",
          },
          Object {
            "label": "threat.indicator.file.pe.pehash",
            "searchPath": "threat.indicator.file.pe.pehash",
          },
          Object {
            "label": "threat.indicator.file.pe.product",
            "searchPath": "threat.indicator.file.pe.product",
          },
          Object {
            "label": "threat.indicator.file.size",
            "searchPath": "threat.indicator.file.size",
          },
          Object {
            "label": "threat.indicator.file.target_path",
            "searchPath": "threat.indicator.file.target_path",
          },
          Object {
            "label": "threat.indicator.file.type",
            "searchPath": "threat.indicator.file.type",
          },
          Object {
            "label": "threat.indicator.file.uid",
            "searchPath": "threat.indicator.file.uid",
          },
          Object {
            "label": "threat.indicator.file.x509.alternative_names",
            "searchPath": "threat.indicator.file.x509.alternative_names",
          },
          Object {
            "label": "threat.indicator.file.x509.issuer.common_name",
            "searchPath": "threat.indicator.file.x509.issuer.common_name",
          },
          Object {
            "label": "threat.indicator.file.x509.issuer.country",
            "searchPath": "threat.indicator.file.x509.issuer.country",
          },
          Object {
            "label": "threat.indicator.file.x509.issuer.distinguished_name",
            "searchPath": "threat.indicator.file.x509.issuer.distinguished_name",
          },
          Object {
            "label": "threat.indicator.file.x509.issuer.locality",
            "searchPath": "threat.indicator.file.x509.issuer.locality",
          },
          Object {
            "label": "threat.indicator.file.x509.issuer.organization",
            "searchPath": "threat.indicator.file.x509.issuer.organization",
          },
          Object {
            "label": "threat.indicator.file.x509.issuer.organizational_unit",
            "searchPath": "threat.indicator.file.x509.issuer.organizational_unit",
          },
          Object {
            "label": "threat.indicator.file.x509.issuer.state_or_province",
            "searchPath": "threat.indicator.file.x509.issuer.state_or_province",
          },
          Object {
            "label": "threat.indicator.file.x509.not_after",
            "searchPath": "threat.indicator.file.x509.not_after",
          },
          Object {
            "label": "threat.indicator.file.x509.not_before",
            "searchPath": "threat.indicator.file.x509.not_before",
          },
          Object {
            "label": "threat.indicator.file.x509.public_key_algorithm",
            "searchPath": "threat.indicator.file.x509.public_key_algorithm",
          },
          Object {
            "label": "threat.indicator.file.x509.public_key_curve",
            "searchPath": "threat.indicator.file.x509.public_key_curve",
          },
          Object {
            "label": "threat.indicator.file.x509.public_key_exponent",
            "searchPath": "threat.indicator.file.x509.public_key_exponent",
          },
          Object {
            "label": "threat.indicator.file.x509.public_key_size",
            "searchPath": "threat.indicator.file.x509.public_key_size",
          },
          Object {
            "label": "threat.indicator.file.x509.serial_number",
            "searchPath": "threat.indicator.file.x509.serial_number",
          },
          Object {
            "label": "threat.indicator.file.x509.signature_algorithm",
            "searchPath": "threat.indicator.file.x509.signature_algorithm",
          },
          Object {
            "label": "threat.indicator.file.x509.subject.common_name",
            "searchPath": "threat.indicator.file.x509.subject.common_name",
          },
          Object {
            "label": "threat.indicator.file.x509.subject.country",
            "searchPath": "threat.indicator.file.x509.subject.country",
          },
          Object {
            "label": "threat.indicator.file.x509.subject.distinguished_name",
            "searchPath": "threat.indicator.file.x509.subject.distinguished_name",
          },
          Object {
            "label": "threat.indicator.file.x509.subject.locality",
            "searchPath": "threat.indicator.file.x509.subject.locality",
          },
          Object {
            "label": "threat.indicator.file.x509.subject.organization",
            "searchPath": "threat.indicator.file.x509.subject.organization",
          },
          Object {
            "label": "threat.indicator.file.x509.subject.organizational_unit",
            "searchPath": "threat.indicator.file.x509.subject.organizational_unit",
          },
          Object {
            "label": "threat.indicator.file.x509.subject.state_or_province",
            "searchPath": "threat.indicator.file.x509.subject.state_or_province",
          },
          Object {
            "label": "threat.indicator.file.x509.version_number",
            "searchPath": "threat.indicator.file.x509.version_number",
          },
          Object {
            "label": "threat.indicator.first_seen",
            "searchPath": "threat.indicator.first_seen",
          },
          Object {
            "label": "threat.indicator.geo.city_name",
            "searchPath": "threat.indicator.geo.city_name",
          },
          Object {
            "label": "threat.indicator.geo.continent_code",
            "searchPath": "threat.indicator.geo.continent_code",
          },
          Object {
            "label": "threat.indicator.geo.continent_name",
            "searchPath": "threat.indicator.geo.continent_name",
          },
          Object {
            "label": "threat.indicator.geo.country_iso_code",
            "searchPath": "threat.indicator.geo.country_iso_code",
          },
          Object {
            "label": "threat.indicator.geo.country_name",
            "searchPath": "threat.indicator.geo.country_name",
          },
          Object {
            "label": "threat.indicator.geo.location",
            "searchPath": "threat.indicator.geo.location",
          },
          Object {
            "label": "threat.indicator.geo.name",
            "searchPath": "threat.indicator.geo.name",
          },
          Object {
            "label": "threat.indicator.geo.postal_code",
            "searchPath": "threat.indicator.geo.postal_code",
          },
          Object {
            "label": "threat.indicator.geo.region_iso_code",
            "searchPath": "threat.indicator.geo.region_iso_code",
          },
          Object {
            "label": "threat.indicator.geo.region_name",
            "searchPath": "threat.indicator.geo.region_name",
          },
          Object {
            "label": "threat.indicator.geo.timezone",
            "searchPath": "threat.indicator.geo.timezone",
          },
          Object {
            "label": "threat.indicator.id",
            "searchPath": "threat.indicator.id",
          },
          Object {
            "label": "threat.indicator.ip",
            "searchPath": "threat.indicator.ip",
          },
          Object {
            "label": "threat.indicator.last_seen",
            "searchPath": "threat.indicator.last_seen",
          },
          Object {
            "label": "threat.indicator.marking.tlp",
            "searchPath": "threat.indicator.marking.tlp",
          },
          Object {
            "label": "threat.indicator.marking.tlp_version",
            "searchPath": "threat.indicator.marking.tlp_version",
          },
          Object {
            "label": "threat.indicator.modified_at",
            "searchPath": "threat.indicator.modified_at",
          },
          Object {
            "label": "threat.indicator.name",
            "searchPath": "threat.indicator.name",
          },
          Object {
            "label": "threat.indicator.port",
            "searchPath": "threat.indicator.port",
          },
          Object {
            "label": "threat.indicator.provider",
            "searchPath": "threat.indicator.provider",
          },
          Object {
            "label": "threat.indicator.reference",
            "searchPath": "threat.indicator.reference",
          },
          Object {
            "label": "threat.indicator.registry.data.bytes",
            "searchPath": "threat.indicator.registry.data.bytes",
          },
          Object {
            "label": "threat.indicator.registry.data.strings",
            "searchPath": "threat.indicator.registry.data.strings",
          },
          Object {
            "label": "threat.indicator.registry.data.type",
            "searchPath": "threat.indicator.registry.data.type",
          },
          Object {
            "label": "threat.indicator.registry.hive",
            "searchPath": "threat.indicator.registry.hive",
          },
          Object {
            "label": "threat.indicator.registry.key",
            "searchPath": "threat.indicator.registry.key",
          },
          Object {
            "label": "threat.indicator.registry.path",
            "searchPath": "threat.indicator.registry.path",
          },
          Object {
            "label": "threat.indicator.registry.value",
            "searchPath": "threat.indicator.registry.value",
          },
          Object {
            "label": "threat.indicator.scanner_stats",
            "searchPath": "threat.indicator.scanner_stats",
          },
          Object {
            "label": "threat.indicator.sightings",
            "searchPath": "threat.indicator.sightings",
          },
          Object {
            "label": "threat.indicator.type",
            "searchPath": "threat.indicator.type",
          },
          Object {
            "label": "threat.indicator.url.domain",
            "searchPath": "threat.indicator.url.domain",
          },
          Object {
            "label": "threat.indicator.url.extension",
            "searchPath": "threat.indicator.url.extension",
          },
          Object {
            "label": "threat.indicator.url.fragment",
            "searchPath": "threat.indicator.url.fragment",
          },
          Object {
            "label": "threat.indicator.url.full",
            "searchPath": "threat.indicator.url.full",
          },
          Object {
            "label": "threat.indicator.url.original",
            "searchPath": "threat.indicator.url.original",
          },
          Object {
            "label": "threat.indicator.url.password",
            "searchPath": "threat.indicator.url.password",
          },
          Object {
            "label": "threat.indicator.url.path",
            "searchPath": "threat.indicator.url.path",
          },
          Object {
            "label": "threat.indicator.url.port",
            "searchPath": "threat.indicator.url.port",
          },
          Object {
            "label": "threat.indicator.url.query",
            "searchPath": "threat.indicator.url.query",
          },
          Object {
            "label": "threat.indicator.url.registered_domain",
            "searchPath": "threat.indicator.url.registered_domain",
          },
          Object {
            "label": "threat.indicator.url.scheme",
            "searchPath": "threat.indicator.url.scheme",
          },
          Object {
            "label": "threat.indicator.url.subdomain",
            "searchPath": "threat.indicator.url.subdomain",
          },
          Object {
            "label": "threat.indicator.url.top_level_domain",
            "searchPath": "threat.indicator.url.top_level_domain",
          },
          Object {
            "label": "threat.indicator.url.username",
            "searchPath": "threat.indicator.url.username",
          },
          Object {
            "label": "threat.indicator.x509.alternative_names",
            "searchPath": "threat.indicator.x509.alternative_names",
          },
          Object {
            "label": "threat.indicator.x509.issuer.common_name",
            "searchPath": "threat.indicator.x509.issuer.common_name",
          },
          Object {
            "label": "threat.indicator.x509.issuer.country",
            "searchPath": "threat.indicator.x509.issuer.country",
          },
          Object {
            "label": "threat.indicator.x509.issuer.distinguished_name",
            "searchPath": "threat.indicator.x509.issuer.distinguished_name",
          },
          Object {
            "label": "threat.indicator.x509.issuer.locality",
            "searchPath": "threat.indicator.x509.issuer.locality",
          },
          Object {
            "label": "threat.indicator.x509.issuer.organization",
            "searchPath": "threat.indicator.x509.issuer.organization",
          },
          Object {
            "label": "threat.indicator.x509.issuer.organizational_unit",
            "searchPath": "threat.indicator.x509.issuer.organizational_unit",
          },
          Object {
            "label": "threat.indicator.x509.issuer.state_or_province",
            "searchPath": "threat.indicator.x509.issuer.state_or_province",
          },
          Object {
            "label": "threat.indicator.x509.not_after",
            "searchPath": "threat.indicator.x509.not_after",
          },
          Object {
            "label": "threat.indicator.x509.not_before",
            "searchPath": "threat.indicator.x509.not_before",
          },
          Object {
            "label": "threat.indicator.x509.public_key_algorithm",
            "searchPath": "threat.indicator.x509.public_key_algorithm",
          },
          Object {
            "label": "threat.indicator.x509.public_key_curve",
            "searchPath": "threat.indicator.x509.public_key_curve",
          },
          Object {
            "label": "threat.indicator.x509.public_key_exponent",
            "searchPath": "threat.indicator.x509.public_key_exponent",
          },
          Object {
            "label": "threat.indicator.x509.public_key_size",
            "searchPath": "threat.indicator.x509.public_key_size",
          },
          Object {
            "label": "threat.indicator.x509.serial_number",
            "searchPath": "threat.indicator.x509.serial_number",
          },
          Object {
            "label": "threat.indicator.x509.signature_algorithm",
            "searchPath": "threat.indicator.x509.signature_algorithm",
          },
          Object {
            "label": "threat.indicator.x509.subject.common_name",
            "searchPath": "threat.indicator.x509.subject.common_name",
          },
          Object {
            "label": "threat.indicator.x509.subject.country",
            "searchPath": "threat.indicator.x509.subject.country",
          },
          Object {
            "label": "threat.indicator.x509.subject.distinguished_name",
            "searchPath": "threat.indicator.x509.subject.distinguished_name",
          },
          Object {
            "label": "threat.indicator.x509.subject.locality",
            "searchPath": "threat.indicator.x509.subject.locality",
          },
          Object {
            "label": "threat.indicator.x509.subject.organization",
            "searchPath": "threat.indicator.x509.subject.organization",
          },
          Object {
            "label": "threat.indicator.x509.subject.organizational_unit",
            "searchPath": "threat.indicator.x509.subject.organizational_unit",
          },
          Object {
            "label": "threat.indicator.x509.subject.state_or_province",
            "searchPath": "threat.indicator.x509.subject.state_or_province",
          },
          Object {
            "label": "threat.indicator.x509.version_number",
            "searchPath": "threat.indicator.x509.version_number",
          },
          Object {
            "label": "threat.software.alias",
            "searchPath": "threat.software.alias",
          },
          Object {
            "label": "threat.software.id",
            "searchPath": "threat.software.id",
          },
          Object {
            "label": "threat.software.name",
            "searchPath": "threat.software.name",
          },
          Object {
            "label": "threat.software.platforms",
            "searchPath": "threat.software.platforms",
          },
          Object {
            "label": "threat.software.reference",
            "searchPath": "threat.software.reference",
          },
          Object {
            "label": "threat.software.type",
            "searchPath": "threat.software.type",
          },
          Object {
            "label": "threat.tactic.id",
            "searchPath": "threat.tactic.id",
          },
          Object {
            "label": "threat.tactic.name",
            "searchPath": "threat.tactic.name",
          },
          Object {
            "label": "threat.tactic.reference",
            "searchPath": "threat.tactic.reference",
          },
          Object {
            "label": "threat.technique.id",
            "searchPath": "threat.technique.id",
          },
          Object {
            "label": "threat.technique.name",
            "searchPath": "threat.technique.name",
          },
          Object {
            "label": "threat.technique.reference",
            "searchPath": "threat.technique.reference",
          },
          Object {
            "label": "threat.technique.subtechnique.id",
            "searchPath": "threat.technique.subtechnique.id",
          },
          Object {
            "label": "threat.technique.subtechnique.name",
            "searchPath": "threat.technique.subtechnique.name",
          },
          Object {
            "label": "threat.technique.subtechnique.reference",
            "searchPath": "threat.technique.subtechnique.reference",
          },
          Object {
            "label": "tls.cipher",
            "searchPath": "tls.cipher",
          },
          Object {
            "label": "tls.client.certificate",
            "searchPath": "tls.client.certificate",
          },
          Object {
            "label": "tls.client.certificate_chain",
            "searchPath": "tls.client.certificate_chain",
          },
          Object {
            "label": "tls.client.hash.md5",
            "searchPath": "tls.client.hash.md5",
          },
          Object {
            "label": "tls.client.hash.sha1",
            "searchPath": "tls.client.hash.sha1",
          },
          Object {
            "label": "tls.client.hash.sha256",
            "searchPath": "tls.client.hash.sha256",
          },
          Object {
            "label": "tls.client.issuer",
            "searchPath": "tls.client.issuer",
          },
          Object {
            "label": "tls.client.ja3",
            "searchPath": "tls.client.ja3",
          },
          Object {
            "label": "tls.client.not_after",
            "searchPath": "tls.client.not_after",
          },
          Object {
            "label": "tls.client.not_before",
            "searchPath": "tls.client.not_before",
          },
          Object {
            "label": "tls.client.server_name",
            "searchPath": "tls.client.server_name",
          },
          Object {
            "label": "tls.client.subject",
            "searchPath": "tls.client.subject",
          },
          Object {
            "label": "tls.client.supported_ciphers",
            "searchPath": "tls.client.supported_ciphers",
          },
          Object {
            "label": "tls.client.x509.alternative_names",
            "searchPath": "tls.client.x509.alternative_names",
          },
          Object {
            "label": "tls.client.x509.issuer.common_name",
            "searchPath": "tls.client.x509.issuer.common_name",
          },
          Object {
            "label": "tls.client.x509.issuer.country",
            "searchPath": "tls.client.x509.issuer.country",
          },
          Object {
            "label": "tls.client.x509.issuer.distinguished_name",
            "searchPath": "tls.client.x509.issuer.distinguished_name",
          },
          Object {
            "label": "tls.client.x509.issuer.locality",
            "searchPath": "tls.client.x509.issuer.locality",
          },
          Object {
            "label": "tls.client.x509.issuer.organization",
            "searchPath": "tls.client.x509.issuer.organization",
          },
          Object {
            "label": "tls.client.x509.issuer.organizational_unit",
            "searchPath": "tls.client.x509.issuer.organizational_unit",
          },
          Object {
            "label": "tls.client.x509.issuer.state_or_province",
            "searchPath": "tls.client.x509.issuer.state_or_province",
          },
          Object {
            "label": "tls.client.x509.not_after",
            "searchPath": "tls.client.x509.not_after",
          },
          Object {
            "label": "tls.client.x509.not_before",
            "searchPath": "tls.client.x509.not_before",
          },
          Object {
            "label": "tls.client.x509.public_key_algorithm",
            "searchPath": "tls.client.x509.public_key_algorithm",
          },
          Object {
            "label": "tls.client.x509.public_key_curve",
            "searchPath": "tls.client.x509.public_key_curve",
          },
          Object {
            "label": "tls.client.x509.public_key_exponent",
            "searchPath": "tls.client.x509.public_key_exponent",
          },
          Object {
            "label": "tls.client.x509.public_key_size",
            "searchPath": "tls.client.x509.public_key_size",
          },
          Object {
            "label": "tls.client.x509.serial_number",
            "searchPath": "tls.client.x509.serial_number",
          },
          Object {
            "label": "tls.client.x509.signature_algorithm",
            "searchPath": "tls.client.x509.signature_algorithm",
          },
          Object {
            "label": "tls.client.x509.subject.common_name",
            "searchPath": "tls.client.x509.subject.common_name",
          },
          Object {
            "label": "tls.client.x509.subject.country",
            "searchPath": "tls.client.x509.subject.country",
          },
          Object {
            "label": "tls.client.x509.subject.distinguished_name",
            "searchPath": "tls.client.x509.subject.distinguished_name",
          },
          Object {
            "label": "tls.client.x509.subject.locality",
            "searchPath": "tls.client.x509.subject.locality",
          },
          Object {
            "label": "tls.client.x509.subject.organization",
            "searchPath": "tls.client.x509.subject.organization",
          },
          Object {
            "label": "tls.client.x509.subject.organizational_unit",
            "searchPath": "tls.client.x509.subject.organizational_unit",
          },
          Object {
            "label": "tls.client.x509.subject.state_or_province",
            "searchPath": "tls.client.x509.subject.state_or_province",
          },
          Object {
            "label": "tls.client.x509.version_number",
            "searchPath": "tls.client.x509.version_number",
          },
          Object {
            "label": "tls.curve",
            "searchPath": "tls.curve",
          },
          Object {
            "label": "tls.established",
            "searchPath": "tls.established",
          },
          Object {
            "label": "tls.next_protocol",
            "searchPath": "tls.next_protocol",
          },
          Object {
            "label": "tls.resumed",
            "searchPath": "tls.resumed",
          },
          Object {
            "label": "tls.server.certificate",
            "searchPath": "tls.server.certificate",
          },
          Object {
            "label": "tls.server.certificate_chain",
            "searchPath": "tls.server.certificate_chain",
          },
          Object {
            "label": "tls.server.hash.md5",
            "searchPath": "tls.server.hash.md5",
          },
          Object {
            "label": "tls.server.hash.sha1",
            "searchPath": "tls.server.hash.sha1",
          },
          Object {
            "label": "tls.server.hash.sha256",
            "searchPath": "tls.server.hash.sha256",
          },
          Object {
            "label": "tls.server.issuer",
            "searchPath": "tls.server.issuer",
          },
          Object {
            "label": "tls.server.ja3s",
            "searchPath": "tls.server.ja3s",
          },
          Object {
            "label": "tls.server.not_after",
            "searchPath": "tls.server.not_after",
          },
          Object {
            "label": "tls.server.not_before",
            "searchPath": "tls.server.not_before",
          },
          Object {
            "label": "tls.server.subject",
            "searchPath": "tls.server.subject",
          },
          Object {
            "label": "tls.server.x509.alternative_names",
            "searchPath": "tls.server.x509.alternative_names",
          },
          Object {
            "label": "tls.server.x509.issuer.common_name",
            "searchPath": "tls.server.x509.issuer.common_name",
          },
          Object {
            "label": "tls.server.x509.issuer.country",
            "searchPath": "tls.server.x509.issuer.country",
          },
          Object {
            "label": "tls.server.x509.issuer.distinguished_name",
            "searchPath": "tls.server.x509.issuer.distinguished_name",
          },
          Object {
            "label": "tls.server.x509.issuer.locality",
            "searchPath": "tls.server.x509.issuer.locality",
          },
          Object {
            "label": "tls.server.x509.issuer.organization",
            "searchPath": "tls.server.x509.issuer.organization",
          },
          Object {
            "label": "tls.server.x509.issuer.organizational_unit",
            "searchPath": "tls.server.x509.issuer.organizational_unit",
          },
          Object {
            "label": "tls.server.x509.issuer.state_or_province",
            "searchPath": "tls.server.x509.issuer.state_or_province",
          },
          Object {
            "label": "tls.server.x509.not_after",
            "searchPath": "tls.server.x509.not_after",
          },
          Object {
            "label": "tls.server.x509.not_before",
            "searchPath": "tls.server.x509.not_before",
          },
          Object {
            "label": "tls.server.x509.public_key_algorithm",
            "searchPath": "tls.server.x509.public_key_algorithm",
          },
          Object {
            "label": "tls.server.x509.public_key_curve",
            "searchPath": "tls.server.x509.public_key_curve",
          },
          Object {
            "label": "tls.server.x509.public_key_exponent",
            "searchPath": "tls.server.x509.public_key_exponent",
          },
          Object {
            "label": "tls.server.x509.public_key_size",
            "searchPath": "tls.server.x509.public_key_size",
          },
          Object {
            "label": "tls.server.x509.serial_number",
            "searchPath": "tls.server.x509.serial_number",
          },
          Object {
            "label": "tls.server.x509.signature_algorithm",
            "searchPath": "tls.server.x509.signature_algorithm",
          },
          Object {
            "label": "tls.server.x509.subject.common_name",
            "searchPath": "tls.server.x509.subject.common_name",
          },
          Object {
            "label": "tls.server.x509.subject.country",
            "searchPath": "tls.server.x509.subject.country",
          },
          Object {
            "label": "tls.server.x509.subject.distinguished_name",
            "searchPath": "tls.server.x509.subject.distinguished_name",
          },
          Object {
            "label": "tls.server.x509.subject.locality",
            "searchPath": "tls.server.x509.subject.locality",
          },
          Object {
            "label": "tls.server.x509.subject.organization",
            "searchPath": "tls.server.x509.subject.organization",
          },
          Object {
            "label": "tls.server.x509.subject.organizational_unit",
            "searchPath": "tls.server.x509.subject.organizational_unit",
          },
          Object {
            "label": "tls.server.x509.subject.state_or_province",
            "searchPath": "tls.server.x509.subject.state_or_province",
          },
          Object {
            "label": "tls.server.x509.version_number",
            "searchPath": "tls.server.x509.version_number",
          },
          Object {
            "label": "tls.version",
            "searchPath": "tls.version",
          },
          Object {
            "label": "tls.version_protocol",
            "searchPath": "tls.version_protocol",
          },
          Object {
            "label": "trace.id",
            "searchPath": "trace.id",
          },
          Object {
            "label": "transaction.id",
            "searchPath": "transaction.id",
          },
          Object {
            "label": "url.domain",
            "searchPath": "url.domain",
          },
          Object {
            "label": "url.extension",
            "searchPath": "url.extension",
          },
          Object {
            "label": "url.fragment",
            "searchPath": "url.fragment",
          },
          Object {
            "label": "url.full",
            "searchPath": "url.full",
          },
          Object {
            "label": "url.original",
            "searchPath": "url.original",
          },
          Object {
            "label": "url.password",
            "searchPath": "url.password",
          },
          Object {
            "label": "url.path",
            "searchPath": "url.path",
          },
          Object {
            "label": "url.port",
            "searchPath": "url.port",
          },
          Object {
            "label": "url.query",
            "searchPath": "url.query",
          },
          Object {
            "label": "url.registered_domain",
            "searchPath": "url.registered_domain",
          },
          Object {
            "label": "url.scheme",
            "searchPath": "url.scheme",
          },
          Object {
            "label": "url.subdomain",
            "searchPath": "url.subdomain",
          },
          Object {
            "label": "url.top_level_domain",
            "searchPath": "url.top_level_domain",
          },
          Object {
            "label": "url.username",
            "searchPath": "url.username",
          },
          Object {
            "label": "user.changes.domain",
            "searchPath": "user.changes.domain",
          },
          Object {
            "label": "user.changes.email",
            "searchPath": "user.changes.email",
          },
          Object {
            "label": "user.changes.entity.attributes",
            "searchPath": "user.changes.entity.attributes",
          },
          Object {
            "label": "user.changes.entity.behavior",
            "searchPath": "user.changes.entity.behavior",
          },
          Object {
            "label": "user.changes.entity.display_name",
            "searchPath": "user.changes.entity.display_name",
          },
          Object {
            "label": "user.changes.entity.id",
            "searchPath": "user.changes.entity.id",
          },
          Object {
            "label": "user.changes.entity.last_seen_timestamp",
            "searchPath": "user.changes.entity.last_seen_timestamp",
          },
          Object {
            "label": "user.changes.entity.lifecycle",
            "searchPath": "user.changes.entity.lifecycle",
          },
          Object {
            "label": "user.changes.entity.metrics",
            "searchPath": "user.changes.entity.metrics",
          },
          Object {
            "label": "user.changes.entity.name",
            "searchPath": "user.changes.entity.name",
          },
          Object {
            "label": "user.changes.entity.raw",
            "searchPath": "user.changes.entity.raw",
          },
          Object {
            "label": "user.changes.entity.reference",
            "searchPath": "user.changes.entity.reference",
          },
          Object {
            "label": "user.changes.entity.source",
            "searchPath": "user.changes.entity.source",
          },
          Object {
            "label": "user.changes.entity.sub_type",
            "searchPath": "user.changes.entity.sub_type",
          },
          Object {
            "label": "user.changes.entity.type",
            "searchPath": "user.changes.entity.type",
          },
          Object {
            "label": "user.changes.full_name",
            "searchPath": "user.changes.full_name",
          },
          Object {
            "label": "user.changes.group.domain",
            "searchPath": "user.changes.group.domain",
          },
          Object {
            "label": "user.changes.group.id",
            "searchPath": "user.changes.group.id",
          },
          Object {
            "label": "user.changes.group.name",
            "searchPath": "user.changes.group.name",
          },
          Object {
            "label": "user.changes.hash",
            "searchPath": "user.changes.hash",
          },
          Object {
            "label": "user.changes.id",
            "searchPath": "user.changes.id",
          },
          Object {
            "label": "user.changes.name",
            "searchPath": "user.changes.name",
          },
          Object {
            "label": "user.changes.risk.calculated_level",
            "searchPath": "user.changes.risk.calculated_level",
          },
          Object {
            "label": "user.changes.risk.calculated_score",
            "searchPath": "user.changes.risk.calculated_score",
          },
          Object {
            "label": "user.changes.risk.calculated_score_norm",
            "searchPath": "user.changes.risk.calculated_score_norm",
          },
          Object {
            "label": "user.changes.risk.static_level",
            "searchPath": "user.changes.risk.static_level",
          },
          Object {
            "label": "user.changes.risk.static_score",
            "searchPath": "user.changes.risk.static_score",
          },
          Object {
            "label": "user.changes.risk.static_score_norm",
            "searchPath": "user.changes.risk.static_score_norm",
          },
          Object {
            "label": "user.changes.roles",
            "searchPath": "user.changes.roles",
          },
          Object {
            "label": "user.domain",
            "searchPath": "user.domain",
          },
          Object {
            "label": "user.effective.domain",
            "searchPath": "user.effective.domain",
          },
          Object {
            "label": "user.effective.email",
            "searchPath": "user.effective.email",
          },
          Object {
            "label": "user.effective.entity.attributes",
            "searchPath": "user.effective.entity.attributes",
          },
          Object {
            "label": "user.effective.entity.behavior",
            "searchPath": "user.effective.entity.behavior",
          },
          Object {
            "label": "user.effective.entity.display_name",
            "searchPath": "user.effective.entity.display_name",
          },
          Object {
            "label": "user.effective.entity.id",
            "searchPath": "user.effective.entity.id",
          },
          Object {
            "label": "user.effective.entity.last_seen_timestamp",
            "searchPath": "user.effective.entity.last_seen_timestamp",
          },
          Object {
            "label": "user.effective.entity.lifecycle",
            "searchPath": "user.effective.entity.lifecycle",
          },
          Object {
            "label": "user.effective.entity.metrics",
            "searchPath": "user.effective.entity.metrics",
          },
          Object {
            "label": "user.effective.entity.name",
            "searchPath": "user.effective.entity.name",
          },
          Object {
            "label": "user.effective.entity.raw",
            "searchPath": "user.effective.entity.raw",
          },
          Object {
            "label": "user.effective.entity.reference",
            "searchPath": "user.effective.entity.reference",
          },
          Object {
            "label": "user.effective.entity.source",
            "searchPath": "user.effective.entity.source",
          },
          Object {
            "label": "user.effective.entity.sub_type",
            "searchPath": "user.effective.entity.sub_type",
          },
          Object {
            "label": "user.effective.entity.type",
            "searchPath": "user.effective.entity.type",
          },
          Object {
            "label": "user.effective.full_name",
            "searchPath": "user.effective.full_name",
          },
          Object {
            "label": "user.effective.group.domain",
            "searchPath": "user.effective.group.domain",
          },
          Object {
            "label": "user.effective.group.id",
            "searchPath": "user.effective.group.id",
          },
          Object {
            "label": "user.effective.group.name",
            "searchPath": "user.effective.group.name",
          },
          Object {
            "label": "user.effective.hash",
            "searchPath": "user.effective.hash",
          },
          Object {
            "label": "user.effective.id",
            "searchPath": "user.effective.id",
          },
          Object {
            "label": "user.effective.name",
            "searchPath": "user.effective.name",
          },
          Object {
            "label": "user.effective.risk.calculated_level",
            "searchPath": "user.effective.risk.calculated_level",
          },
          Object {
            "label": "user.effective.risk.calculated_score",
            "searchPath": "user.effective.risk.calculated_score",
          },
          Object {
            "label": "user.effective.risk.calculated_score_norm",
            "searchPath": "user.effective.risk.calculated_score_norm",
          },
          Object {
            "label": "user.effective.risk.static_level",
            "searchPath": "user.effective.risk.static_level",
          },
          Object {
            "label": "user.effective.risk.static_score",
            "searchPath": "user.effective.risk.static_score",
          },
          Object {
            "label": "user.effective.risk.static_score_norm",
            "searchPath": "user.effective.risk.static_score_norm",
          },
          Object {
            "label": "user.effective.roles",
            "searchPath": "user.effective.roles",
          },
          Object {
            "label": "user.email",
            "searchPath": "user.email",
          },
          Object {
            "label": "user.entity.attributes",
            "searchPath": "user.entity.attributes",
          },
          Object {
            "label": "user.entity.behavior",
            "searchPath": "user.entity.behavior",
          },
          Object {
            "label": "user.entity.display_name",
            "searchPath": "user.entity.display_name",
          },
          Object {
            "label": "user.entity.id",
            "searchPath": "user.entity.id",
          },
          Object {
            "label": "user.entity.last_seen_timestamp",
            "searchPath": "user.entity.last_seen_timestamp",
          },
          Object {
            "label": "user.entity.lifecycle",
            "searchPath": "user.entity.lifecycle",
          },
          Object {
            "label": "user.entity.metrics",
            "searchPath": "user.entity.metrics",
          },
          Object {
            "label": "user.entity.name",
            "searchPath": "user.entity.name",
          },
          Object {
            "label": "user.entity.raw",
            "searchPath": "user.entity.raw",
          },
          Object {
            "label": "user.entity.reference",
            "searchPath": "user.entity.reference",
          },
          Object {
            "label": "user.entity.source",
            "searchPath": "user.entity.source",
          },
          Object {
            "label": "user.entity.sub_type",
            "searchPath": "user.entity.sub_type",
          },
          Object {
            "label": "user.entity.type",
            "searchPath": "user.entity.type",
          },
          Object {
            "label": "user.full_name",
            "searchPath": "user.full_name",
          },
          Object {
            "label": "user.group.domain",
            "searchPath": "user.group.domain",
          },
          Object {
            "label": "user.group.id",
            "searchPath": "user.group.id",
          },
          Object {
            "label": "user.group.name",
            "searchPath": "user.group.name",
          },
          Object {
            "label": "user.hash",
            "searchPath": "user.hash",
          },
          Object {
            "label": "user.id",
            "searchPath": "user.id",
          },
          Object {
            "label": "user.name",
            "searchPath": "user.name",
          },
          Object {
            "label": "user.risk.calculated_level",
            "searchPath": "user.risk.calculated_level",
          },
          Object {
            "label": "user.risk.calculated_score",
            "searchPath": "user.risk.calculated_score",
          },
          Object {
            "label": "user.risk.calculated_score_norm",
            "searchPath": "user.risk.calculated_score_norm",
          },
          Object {
            "label": "user.risk.static_level",
            "searchPath": "user.risk.static_level",
          },
          Object {
            "label": "user.risk.static_score",
            "searchPath": "user.risk.static_score",
          },
          Object {
            "label": "user.risk.static_score_norm",
            "searchPath": "user.risk.static_score_norm",
          },
          Object {
            "label": "user.roles",
            "searchPath": "user.roles",
          },
          Object {
            "label": "user.target.domain",
            "searchPath": "user.target.domain",
          },
          Object {
            "label": "user.target.email",
            "searchPath": "user.target.email",
          },
          Object {
            "label": "user.target.entity.attributes",
            "searchPath": "user.target.entity.attributes",
          },
          Object {
            "label": "user.target.entity.behavior",
            "searchPath": "user.target.entity.behavior",
          },
          Object {
            "label": "user.target.entity.display_name",
            "searchPath": "user.target.entity.display_name",
          },
          Object {
            "label": "user.target.entity.id",
            "searchPath": "user.target.entity.id",
          },
          Object {
            "label": "user.target.entity.last_seen_timestamp",
            "searchPath": "user.target.entity.last_seen_timestamp",
          },
          Object {
            "label": "user.target.entity.lifecycle",
            "searchPath": "user.target.entity.lifecycle",
          },
          Object {
            "label": "user.target.entity.metrics",
            "searchPath": "user.target.entity.metrics",
          },
          Object {
            "label": "user.target.entity.name",
            "searchPath": "user.target.entity.name",
          },
          Object {
            "label": "user.target.entity.raw",
            "searchPath": "user.target.entity.raw",
          },
          Object {
            "label": "user.target.entity.reference",
            "searchPath": "user.target.entity.reference",
          },
          Object {
            "label": "user.target.entity.source",
            "searchPath": "user.target.entity.source",
          },
          Object {
            "label": "user.target.entity.sub_type",
            "searchPath": "user.target.entity.sub_type",
          },
          Object {
            "label": "user.target.entity.type",
            "searchPath": "user.target.entity.type",
          },
          Object {
            "label": "user.target.full_name",
            "searchPath": "user.target.full_name",
          },
          Object {
            "label": "user.target.group.domain",
            "searchPath": "user.target.group.domain",
          },
          Object {
            "label": "user.target.group.id",
            "searchPath": "user.target.group.id",
          },
          Object {
            "label": "user.target.group.name",
            "searchPath": "user.target.group.name",
          },
          Object {
            "label": "user.target.hash",
            "searchPath": "user.target.hash",
          },
          Object {
            "label": "user.target.id",
            "searchPath": "user.target.id",
          },
          Object {
            "label": "user.target.name",
            "searchPath": "user.target.name",
          },
          Object {
            "label": "user.target.risk.calculated_level",
            "searchPath": "user.target.risk.calculated_level",
          },
          Object {
            "label": "user.target.risk.calculated_score",
            "searchPath": "user.target.risk.calculated_score",
          },
          Object {
            "label": "user.target.risk.calculated_score_norm",
            "searchPath": "user.target.risk.calculated_score_norm",
          },
          Object {
            "label": "user.target.risk.static_level",
            "searchPath": "user.target.risk.static_level",
          },
          Object {
            "label": "user.target.risk.static_score",
            "searchPath": "user.target.risk.static_score",
          },
          Object {
            "label": "user.target.risk.static_score_norm",
            "searchPath": "user.target.risk.static_score_norm",
          },
          Object {
            "label": "user.target.roles",
            "searchPath": "user.target.roles",
          },
          Object {
            "label": "user_agent.device.name",
            "searchPath": "user_agent.device.name",
          },
          Object {
            "label": "user_agent.name",
            "searchPath": "user_agent.name",
          },
          Object {
            "label": "user_agent.original",
            "searchPath": "user_agent.original",
          },
          Object {
            "label": "user_agent.os.family",
            "searchPath": "user_agent.os.family",
          },
          Object {
            "label": "user_agent.os.full",
            "searchPath": "user_agent.os.full",
          },
          Object {
            "label": "user_agent.os.kernel",
            "searchPath": "user_agent.os.kernel",
          },
          Object {
            "label": "user_agent.os.name",
            "searchPath": "user_agent.os.name",
          },
          Object {
            "label": "user_agent.os.platform",
            "searchPath": "user_agent.os.platform",
          },
          Object {
            "label": "user_agent.os.type",
            "searchPath": "user_agent.os.type",
          },
          Object {
            "label": "user_agent.os.version",
            "searchPath": "user_agent.os.version",
          },
          Object {
            "label": "user_agent.version",
            "searchPath": "user_agent.version",
          },
          Object {
            "label": "volume.bus_type",
            "searchPath": "volume.bus_type",
          },
          Object {
            "label": "volume.default_access",
            "searchPath": "volume.default_access",
          },
          Object {
            "label": "volume.device_name",
            "searchPath": "volume.device_name",
          },
          Object {
            "label": "volume.device_type",
            "searchPath": "volume.device_type",
          },
          Object {
            "label": "volume.dos_name",
            "searchPath": "volume.dos_name",
          },
          Object {
            "label": "volume.file_system_type",
            "searchPath": "volume.file_system_type",
          },
          Object {
            "label": "volume.mount_name",
            "searchPath": "volume.mount_name",
          },
          Object {
            "label": "volume.nt_name",
            "searchPath": "volume.nt_name",
          },
          Object {
            "label": "volume.product_id",
            "searchPath": "volume.product_id",
          },
          Object {
            "label": "volume.product_name",
            "searchPath": "volume.product_name",
          },
          Object {
            "label": "volume.removable",
            "searchPath": "volume.removable",
          },
          Object {
            "label": "volume.serial_number",
            "searchPath": "volume.serial_number",
          },
          Object {
            "label": "volume.size",
            "searchPath": "volume.size",
          },
          Object {
            "label": "volume.vendor_id",
            "searchPath": "volume.vendor_id",
          },
          Object {
            "label": "volume.vendor_name",
            "searchPath": "volume.vendor_name",
          },
          Object {
            "label": "volume.writable",
            "searchPath": "volume.writable",
          },
          Object {
            "label": "vulnerability.category",
            "searchPath": "vulnerability.category",
          },
          Object {
            "label": "vulnerability.classification",
            "searchPath": "vulnerability.classification",
          },
          Object {
            "label": "vulnerability.description",
            "searchPath": "vulnerability.description",
          },
          Object {
            "label": "vulnerability.enumeration",
            "searchPath": "vulnerability.enumeration",
          },
          Object {
            "label": "vulnerability.id",
            "searchPath": "vulnerability.id",
          },
          Object {
            "label": "vulnerability.reference",
            "searchPath": "vulnerability.reference",
          },
          Object {
            "label": "vulnerability.report_id",
            "searchPath": "vulnerability.report_id",
          },
          Object {
            "label": "vulnerability.scanner.vendor",
            "searchPath": "vulnerability.scanner.vendor",
          },
          Object {
            "label": "vulnerability.score.base",
            "searchPath": "vulnerability.score.base",
          },
          Object {
            "label": "vulnerability.score.environmental",
            "searchPath": "vulnerability.score.environmental",
          },
          Object {
            "label": "vulnerability.score.temporal",
            "searchPath": "vulnerability.score.temporal",
          },
          Object {
            "label": "vulnerability.score.version",
            "searchPath": "vulnerability.score.version",
          },
          Object {
            "label": "vulnerability.severity",
            "searchPath": "vulnerability.severity",
          },
        ]
      `);
    });
  });
});
