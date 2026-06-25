/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { SpecDefinitionsService } from '../../../services';
import type { EndpointDefinition } from '../../../../common/types';

describe('console query DSL autocomplete globals', () => {
  // `globals` holds the recursive autocomplete rule tree, which the service
  // itself types as `Record<string, any>`; `endpoints` keeps its real type.
  let globals: ReturnType<SpecDefinitionsService['asJson']>['globals'];
  let endpoints: EndpointDefinition;

  beforeAll(() => {
    const service = new SpecDefinitionsService();
    service.start({ endpointsAvailability: 'stack' });
    const json = service.asJson();
    globals = json.globals;
    endpoints = json.endpoints;
  });

  // Regression test for https://github.com/elastic/kibana/issues/188264:
  // filter context accepts the same query DSL as query context, so every
  // `filter` slot must resolve to the `query` global rules rather than the
  // removed legacy (Elasticsearch 1.x) filter DSL.
  describe('filter context (issue 188264)', () => {
    const queryLink = { __scope_link: 'GLOBAL.query' };

    it('does not register a legacy `filter` global rule set', () => {
      expect(globals).not.toHaveProperty('filter');
    });

    it('points bool.filter at the query rules', () => {
      expect(globals.query.bool.filter).toEqual([{ __scope_link: '.' }]);
    });

    it('points knn.filter at the query global rules', () => {
      expect(globals.query.knn.filter).toEqual(queryLink);
    });

    it('points query filter slots at the query global rules', () => {
      expect(globals.query.constant_score.filter).toEqual(queryLink);
      expect(globals.query.custom_filters_score.filters[0].filter).toEqual(queryLink);
      expect(globals.query.function_score.functions[0].filter).toEqual(queryLink);
    });

    it('keeps geo queries self-contained after removing the filter globals', () => {
      for (const geo of ['geo_shape', 'geo_bounding_box', 'geo_distance', 'geo_polygon']) {
        expect(globals.query[geo]).not.toHaveProperty('__scope_link');
        expect(globals.query[geo]).toHaveProperty('{field}');
      }
    });

    // These `filter` slots had empty rules ({}); their suggestions came from
    // the engine resolving the typed `filter` key against the global rule of
    // the same name (object_component.ts: globalComponentResolver(token)),
    // i.e. the legacy filter DSL. Deleting the `filter` global leaves them
    // suggesting nothing, so they must link to the query rules explicitly —
    // these are query-DSL slots in modern ES (`AggregationContainer.filter`
    // and `Alias.filter` are both `QueryContainer`).
    it('points the filter aggregation at the query global rules', () => {
      expect(globals.aggs['*'].filter).toEqual({ __scope_link: 'GLOBAL.query' });
      expect(globals.aggregations['*'].filter).toEqual({ __scope_link: 'GLOBAL.query' });
    });

    it('points alias filters at the query global rules', () => {
      expect(globals.aliases['*'].filter).toEqual(queryLink);
      expect(endpoints['indices.put_alias'].data_autocomplete_rules).toMatchObject({
        filter: queryLink,
      });
      expect(endpoints['indices.update_aliases'].data_autocomplete_rules).toMatchObject({
        actions: { __any_of: [{ add: { filter: queryLink } }] },
      });
    });
  });
});
