/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { VISUALIZE_EMBEDDABLE_TYPE } from '@kbn/visualizations-common';
import { waitFor } from '@testing-library/react';
import { apiPublishesEsql } from '@kbn/presentation-publishing';
import type { VisualizeApi } from './types';
import { visualizeEmbeddableFactory } from './visualize_embeddable';
import { getExpressionRendererProps } from './get_expression_renderer_props';
import { BehaviorSubject } from 'rxjs';
import { initializeDrilldownsManager } from '@kbn/embeddable-plugin/public/drilldowns/drilldowns_manager';
import type { SerializedVis } from '../vis';

jest.mock('./get_expression_renderer_props', () => ({
  getExpressionRendererProps: jest.fn(async () => ({
    params: { expression: 'mock expression' },
    abortController: new AbortController(),
  })),
}));

const mockGetExpressionRendererProps = jest.mocked(getExpressionRendererProps);

const mockVisTypeRegistry: Record<
  string,
  {
    name: string;
    getEsqlQuery?: (visParams?: { spec?: string }) => { esql: string } | undefined;
  }
> = {
  metric: { name: 'metric' },
  'vega-esql': {
    name: 'vega',
    getEsqlQuery: (visParams) => ({
      esql: visParams?.spec ?? 'FROM logs-* | WHERE os == ?fizzbuzz',
    }),
  },
  'vega-no-esql': { name: 'vega' },
};

jest.mock('./create_vis_instance', () => {
  return {
    createVisInstance: async (serializedVis: SerializedVis) => ({
      ...serializedVis,
      type: mockVisTypeRegistry[serializedVis.type as unknown as string] ?? {
        name: serializedVis.type,
      },
      serialize: () => serializedVis,
      uiState: {
        on: jest.fn(),
        off: jest.fn(),
      },
    }),
  };
});

describe('visualizeEmbeddable', () => {
  let embeddableApi: VisualizeApi;
  beforeEach((done) => {
    mockGetExpressionRendererProps.mockClear();
    const parent = {};
    const uuid = '1';
    const finalizeApi = (api: any) => ({
      ...api,
      uuid,
      parent,
      type: VISUALIZE_EMBEDDABLE_TYPE,
      phase$: new BehaviorSubject(undefined),
    });
    visualizeEmbeddableFactory
      .buildEmbeddable({
        initializeDrilldownsManager,
        initialState: {
          savedVis: {
            title: 'count',
            type: 'metric',
            data: {
              aggs: [
                {
                  id: '1',
                  enabled: true,
                  type: 'count',
                  params: {
                    emptyAsNull: false,
                  },
                  schema: 'metric',
                },
              ],
              searchSource: {
                query: {
                  query: '',
                  language: 'kuery',
                },
                filter: [],
                index: '90943e30-9a47-11e8-b64d-95841ca0b247',
              },
            },
            params: {
              type: 'metric',
              metric: {},
            },
          },
        },
        finalizeApi,
        uuid: '1',
        parentApi: {},
      })
      .then(({ api }) => {
        embeddableApi = api;
        done();
      })
      .catch(done);
  });

  describe('anyStateChange$', () => {
    test('should not emit on subscribe and emit when any state changes', (done) => {
      embeddableApi.anyStateChange$.subscribe(() => {
        try {
          const { title } = embeddableApi.serializeState();
          expect(title).toBe('cute puppies');
        } catch (error) {
          // title assertion fails when
          // anyStateChange$ emits on subscribe
          done(error);
          return;
        }
        done();
      });
      embeddableApi.setTitle('cute puppies');
    });
  });

  describe('esql$', () => {
    const buildEmbeddableWithVisType = async (type: string, spec?: string) => {
      const parent = {};
      const uuid = '1';
      const finalizeApi = (api: any) => ({
        ...api,
        uuid,
        parent,
        type: VISUALIZE_EMBEDDABLE_TYPE,
        phase$: new BehaviorSubject(undefined),
      });
      const { api } = await visualizeEmbeddableFactory.buildEmbeddable({
        initializeDrilldownsManager,
        initialState: {
          savedVis: {
            title: 'esql query test',
            type,
            data: {
              aggs: [],
              searchSource: {},
            },
            params: spec ? { spec } : {},
          },
        },
        finalizeApi,
        uuid: '1',
        parentApi: {},
      });
      return api;
    };

    test('esql$ is empty when the vis type has no getEsqlQuery', () => {
      expect(embeddableApi.esql$.getValue()).toEqual([]);
      expect(apiPublishesEsql(embeddableApi)).toBe(true);
    });

    test('esql$ contains the query when the vis type reports one', async () => {
      const api = await buildEmbeddableWithVisType('vega-esql');
      expect(api.esql$.getValue()).toEqual([
        {
          esql: 'FROM logs-* | WHERE os == ?fizzbuzz',
        },
      ]);
    });

    test('esql$ is empty when the vis type reports no ES|QL query', async () => {
      const api = await buildEmbeddableWithVisType('vega-no-esql');
      expect(api.esql$.getValue()).toEqual([]);
    });

    test('updates esql$ when the vis params change', async () => {
      const api = await buildEmbeddableWithVisType(
        'vega-esql',
        'FROM logs-* | WHERE os == ?fizzbuzz'
      );
      expect(api.esql$.getValue()).toEqual([
        {
          esql: 'FROM logs-* | WHERE os == ?fizzbuzz',
        },
      ]);

      api.updateVis({ params: { spec: 'FROM logs-* | WHERE color == ?color' } });

      await waitFor(() => {
        expect(api.esql$.getValue()).toEqual([
          {
            esql: 'FROM logs-* | WHERE color == ?color',
          },
        ]);
      });
    });
  });

  describe('esqlVariables', () => {
    test('forwards parent esqlVariables into getExpressionRendererProps', async () => {
      const esqlVariables = [{ key: 'fizzbuzz', value: 'ios', type: 'values' }];
      const esqlVariables$ = new BehaviorSubject(esqlVariables);
      const parentApi = { esqlVariables$ };
      const uuid = 'vega-vis-panel';
      mockGetExpressionRendererProps.mockClear();

      await visualizeEmbeddableFactory.buildEmbeddable({
        initializeDrilldownsManager,
        initialState: {
          savedVis: {
            title: 'esql variables test',
            type: 'vega-esql',
            data: {
              aggs: [],
              searchSource: {},
            },
            params: {},
          },
        },
        finalizeApi: (api: any) => ({
          ...api,
          uuid,
          parentApi,
          type: VISUALIZE_EMBEDDABLE_TYPE,
          phase$: new BehaviorSubject(undefined),
        }),
        uuid,
        parentApi,
      });

      await waitFor(() => {
        expect(mockGetExpressionRendererProps).toHaveBeenCalledWith(
          expect.objectContaining({ esqlVariables })
        );
      });
    });
  });
});
