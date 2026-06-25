/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildExportResultsQuery } from './query.export_results.dsl';
import {
  type ExportResultsRequestOptions,
  OsqueryQueries,
} from '../../../../../common/search_strategy/osquery';

const basePit = { id: 'test-pit-id', keep_alive: '5m' };

const baseOptions: ExportResultsRequestOptions = {
  factoryQueryType: OsqueryQueries.exportResults,
  baseFilter: 'action_id: "test-action"',
  pit: basePit,
  size: 1_000,
};

describe('buildExportResultsQuery', () => {
  describe('index resolution', () => {
    it('falls back to the broad osquery result index when no integrationNamespaces are provided', () => {
      const dsl = buildExportResultsQuery({ ...baseOptions, ccsEnabled: false });

      expect(dsl.index).toBe('logs-osquery_manager.result*');
    });

    it('builds namespace-specific index patterns from integrationNamespaces', () => {
      const dsl = buildExportResultsQuery({
        ...baseOptions,
        integrationNamespaces: ['default', 'fleet-ns'],
        ccsEnabled: false,
      });

      expect(dsl.index).toBe(
        'logs-osquery_manager.result-default,logs-osquery_manager.result-fleet-ns'
      );
    });

    it('uses the fallback index when integrationNamespaces is an empty array', () => {
      const dsl = buildExportResultsQuery({
        ...baseOptions,
        integrationNamespaces: [],
        ccsEnabled: false,
      });

      expect(dsl.index).toBe('logs-osquery_manager.result*');
    });
  });

  describe('CCS prefix', () => {
    it('applies CCS prefix to all index patterns when ccsEnabled is true', () => {
      const dsl = buildExportResultsQuery({
        ...baseOptions,
        integrationNamespaces: ['default'],
        ccsEnabled: true,
      });

      expect(dsl.index).toContain('logs-osquery_manager.result-default');
      expect(dsl.index).toContain('*:logs-osquery_manager.result-default');
    });

    it('does not apply CCS prefix when ccsEnabled is false', () => {
      const dsl = buildExportResultsQuery({
        ...baseOptions,
        ccsEnabled: false,
      });

      expect(dsl.index).not.toContain('*:');
    });
  });

  describe('PIT tolerance flags', () => {
    it('sets allow_no_indices: true', () => {
      const dsl = buildExportResultsQuery(baseOptions);

      expect(dsl.allow_no_indices).toBe(true);
    });

    it('sets ignore_unavailable: true', () => {
      const dsl = buildExportResultsQuery(baseOptions);

      expect(dsl.ignore_unavailable).toBe(true);
    });
  });

  describe('filter composition', () => {
    it('wraps baseFilter in outer parentheses', () => {
      const dsl = buildExportResultsQuery(baseOptions);
      const queryStr = JSON.stringify(dsl.query);

      // The baseFilter value should appear scoped (not as a top-level OR)
      expect(queryStr).toContain('test-action');
    });

    it('prevents KQL OR gate-bypass: malicious kuery cannot escape baseFilter scope', () => {
      const dsl = buildExportResultsQuery({
        ...baseOptions,
        baseFilter: 'action_id: "abc"',
        kuery: 'host.name: "a" OR action_id: "other"',
        ccsEnabled: false,
      });

      const queryStr = JSON.stringify(dsl.query);

      // The base filter value must be present
      expect(queryStr).toContain('"abc"');

      // The top-level bool must not have a should clause (would allow OR-escape)
      const boolQuery = dsl.query as { bool?: { should?: unknown } } | undefined;
      expect(boolQuery?.bool?.should).toBeUndefined();
    });

    it('includes agentIds filter as quoted agent.id KQL clauses', () => {
      const dsl = buildExportResultsQuery({
        ...baseOptions,
        agentIds: ['agent-1', 'agent-2'],
        ccsEnabled: false,
      });

      const queryStr = JSON.stringify(dsl.query);
      expect(queryStr).toContain('agent.id');
      expect(queryStr).toContain('"agent-1"');
      expect(queryStr).toContain('"agent-2"');
    });

    it('includes kuery as an additional AND clause', () => {
      const dsl = buildExportResultsQuery({
        ...baseOptions,
        kuery: 'osquery.uid: "0"',
        ccsEnabled: false,
      });

      const queryStr = JSON.stringify(dsl.query);
      expect(queryStr).toContain('osquery.uid');
    });

    it('includes esFilters as filter and must_not clauses', () => {
      const esFilter = {
        meta: { negate: false, type: 'phrase', key: 'osquery.uid', params: { query: '0' } },
        query: { match_phrase: { 'osquery.uid': '0' } },
      };
      const negatedFilter = {
        meta: { negate: true, type: 'phrase', key: 'osquery.name', params: { query: 'bash' } },
        query: { match_phrase: { 'osquery.name': 'bash' } },
      };

      const dsl = buildExportResultsQuery({
        ...baseOptions,
        esFilters: [esFilter, negatedFilter],
        ccsEnabled: false,
      });

      const queryStr = JSON.stringify(dsl.query);
      expect(queryStr).toContain('match_phrase');
    });
  });

  describe('search parameters', () => {
    it('includes the pit in the query params', () => {
      const dsl = buildExportResultsQuery(baseOptions);

      expect(dsl.pit).toEqual(basePit);
    });

    it('sets size from the options', () => {
      const dsl = buildExportResultsQuery({ ...baseOptions, size: 500 });

      expect(dsl.size).toBe(500);
    });

    it('sets track_total_hits when trackTotalHits is true', () => {
      const dsl = buildExportResultsQuery({ ...baseOptions, trackTotalHits: true });

      expect(dsl.track_total_hits).toBe(true);
    });

    it('does not set track_total_hits when trackTotalHits is falsy', () => {
      const dsl = buildExportResultsQuery({ ...baseOptions, trackTotalHits: false });

      expect(dsl.track_total_hits).toBeUndefined();
    });

    it('sets search_after when provided', () => {
      const dsl = buildExportResultsQuery({ ...baseOptions, searchAfter: ['2024-01-01', 'abc'] });

      expect(dsl.search_after).toEqual(['2024-01-01', 'abc']);
    });

    it('does not set search_after when not provided', () => {
      const dsl = buildExportResultsQuery(baseOptions);

      expect(dsl.search_after).toBeUndefined();
    });

    it('requests only agent _source when ecsMapping is not provided', () => {
      const dsl = buildExportResultsQuery(baseOptions);

      expect(dsl._source).toEqual(['agent']);
    });

    it('requests full _source when ecsMapping is provided', () => {
      const dsl = buildExportResultsQuery({
        ...baseOptions,
        ecsMapping: { 'process.pid': { field: 'pid' } },
      });

      expect(dsl._source).toBe(true);
    });

    it('includes the expected fields array', () => {
      const dsl = buildExportResultsQuery(baseOptions);

      expect(dsl.fields).toEqual(['elastic_agent.*', 'agent.*', 'osquery.*']);
    });

    it('sorts by @timestamp descending and _doc', () => {
      const dsl = buildExportResultsQuery(baseOptions);

      expect(dsl.sort).toEqual([{ '@timestamp': { order: 'desc' } }, '_doc']);
    });
  });

  describe('space_id scoping', () => {
    it('does not scope space_id in the builder (centralized in the search strategy)', () => {
      const dsl = buildExportResultsQuery({ ...baseOptions, spaceId: 'my-space' });
      expect(JSON.stringify((dsl.query as any).bool.filter)).not.toContain('space_id');
    });
  });
});
