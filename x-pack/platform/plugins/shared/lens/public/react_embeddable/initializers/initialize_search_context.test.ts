/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LensRuntimeState } from '@kbn/lens-common';
import { getLensRuntimeStateMock, getLensInternalApiMock, makeEmbeddableServices } from '../mocks';
import { initializeSearchContext } from './initialize_search_context';

function setupSearchContextApi(runtimeOverrides?: Partial<LensRuntimeState>) {
  const runtimeState = getLensRuntimeStateMock(runtimeOverrides);
  const internalApiMock = getLensInternalApiMock();
  const services = makeEmbeddableServices();
  const { api, cleanup } = initializeSearchContext(runtimeState, internalApiMock, {}, services);
  return { api, cleanup, internalApi: internalApiMock };
}

describe('Context API', () => {
  it('should update the context query and filters when the corresponding attributes change', async () => {
    const { api, cleanup, internalApi } = setupSearchContextApi();
    internalApi.updateAttributes({
      ...internalApi.attributes$.getValue(),
      state: {
        ...internalApi.attributes$.getValue().state,
        filters: [{ meta: { alias: 'test', disabled: false, negate: false, index: 'test' } }],
      },
    });
    expect(api.query$.getValue()).toEqual(internalApi.attributes$.getValue().state.query);
    expect(api.filters$.getValue()).toEqual(internalApi.attributes$.getValue().state.filters);

    cleanup();
  });

  describe('Subscriptions', () => {
    afterEach(() => {
      jest.resetAllMocks();
    });

    function setupApisAndSubscriptionSpies() {
      const { api, cleanup, internalApi } = setupSearchContextApi();
      const { query$, filters$ } = api;
      const querySpy = jest.fn();
      const filtersSpy = jest.fn();

      const querySub = query$.subscribe(querySpy);
      const filtersSub = filters$.subscribe(filtersSpy);

      // Reset spies after the initial emission
      querySpy.mockClear();
      filtersSpy.mockClear();

      return {
        internalApi,
        querySpy,
        filtersSpy,
        cleanupSubs: () => {
          cleanup();
          querySub.unsubscribe();
          filtersSub.unsubscribe();
        },
      };
    }

    it('should only emit to query$ when the query attribute is changed and the filters remain the same', () => {
      const { internalApi, querySpy, filtersSpy, cleanupSubs } = setupApisAndSubscriptionSpies();

      internalApi.updateAttributes({
        ...internalApi.attributes$.getValue(),
        state: {
          ...internalApi.attributes$.getValue().state,
          query: { query: 'new-query', language: 'kuery' },
        },
      });

      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(filtersSpy).not.toHaveBeenCalled();

      cleanupSubs();
    });

    it('should only emit to filters$ when the attribute filters are changed and the query remains the same', () => {
      const { internalApi, querySpy, filtersSpy, cleanupSubs } = setupApisAndSubscriptionSpies();

      internalApi.updateAttributes({
        ...internalApi.attributes$.getValue(),
        state: {
          ...internalApi.attributes$.getValue().state,
          filters: [{ meta: { alias: 'test', disabled: false, negate: false, index: 'test' } }],
        },
      });

      expect(filtersSpy).toHaveBeenCalledTimes(1);
      expect(querySpy).not.toHaveBeenCalled();

      cleanupSubs();
    });

    it('should not emit to either filters$ or query$, when attribute filters and query remain the same', () => {
      const { internalApi, querySpy, filtersSpy, cleanupSubs } = setupApisAndSubscriptionSpies();

      internalApi.updateAttributes({
        ...internalApi.attributes$.getValue(),
      });

      expect(filtersSpy).not.toHaveBeenCalled();
      expect(querySpy).not.toHaveBeenCalled();

      cleanupSubs();
    });
  });

  describe('esql$', () => {
    it('should be empty by default for a non-ES|QL query', () => {
      const { api, cleanup } = setupSearchContextApi();
      expect(api.esql$.getValue()).toEqual([]);
      cleanup();
    });

    it('should emit the ES|QL query when the query attribute changes to an ES|QL query', () => {
      const { api, cleanup, internalApi } = setupSearchContextApi();

      internalApi.updateAttributes({
        ...internalApi.attributes$.getValue(),
        state: {
          ...internalApi.attributes$.getValue().state,
          datasourceStates: {
            textBased: {
              layers: {
                layer1: {
                  query: { esql: 'FROM kibana_sample_data_logs | LIMIT 1' },
                  columns: [],
                },
              },
            },
          },
        },
      });

      expect(api.esql$.getValue().length).toBeGreaterThan(0);
      cleanup();
    });

    it('should become empty again when the query attribute changes back to a non-ES|QL query', () => {
      const { api, cleanup, internalApi } = setupSearchContextApi();

      internalApi.updateAttributes({
        ...internalApi.attributes$.getValue(),
        state: {
          ...internalApi.attributes$.getValue().state,
          datasourceStates: {
            textBased: {
              layers: {
                layer1: {
                  query: { esql: 'FROM kibana_sample_data_logs | LIMIT 1' },
                  columns: [],
                },
              },
            },
          },
        },
      });
      expect(api.esql$.getValue().length).toBeGreaterThan(0);

      internalApi.updateAttributes({
        ...internalApi.attributes$.getValue(),
        state: {
          ...internalApi.attributes$.getValue().state,
          datasourceStates: { formBased: { layers: {} } },
          query: { query: '', language: 'kuery' },
        },
      });

      expect(api.esql$.getValue()).toEqual([]);
      cleanup();
    });
  });
});
