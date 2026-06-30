/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import React from 'react';
import type { DataView } from '@kbn/data-views-plugin/common';
import { DataSourceType } from '../../../../../common/data_sources';
import type { ContextWithProfileId } from '../../../profile_service';
import type { DataSourceProfileProviderParams, RootContext } from '../../../profiles';
import { DataSourceCategory, SolutionType } from '../../../profiles';
import type { DocViewsRegistry } from '@kbn/unified-doc-viewer';
import {
  CHANGE_POINT_DATA_SOURCE_PROFILE_ID,
  type ChangePointChartSectionSnapshot,
} from './change_point_context';
import { EMPTY_CONTEXT_AWARENESS_TOOLKIT } from '../../../toolkit';
import { createChangePointDataSourceProfileProvider } from './profile';

const RESOLUTION_MISMATCH = { isMatch: false };

describe('createChangePointDataSourceProfileProvider', () => {
  const ROOT_CONTEXT: ContextWithProfileId<RootContext> = {
    profileId: CHANGE_POINT_DATA_SOURCE_PROFILE_ID,
    solutionType: SolutionType.Default,
  };

  const createParams = (
    overrides: Partial<DataSourceProfileProviderParams>
  ): DataSourceProfileProviderParams => ({
    rootContext: ROOT_CONTEXT,
    dataSource: { type: DataSourceType.Esql },
    query: {
      esql: 'FROM logs-* | STATS avg_val = AVG(bytes) BY bucket = BUCKET(@timestamp, 1h) | CHANGE_POINT avg_val ON bucket',
    },
    ...overrides,
  });

  const provider = createChangePointDataSourceProfileProvider();

  /** Builds a minimal resolved context for use in profile accessor tests. */
  const buildContext = (overrides: Record<string, unknown> = {}) => ({
    category: DataSourceCategory.Default,
    pvalueColumnId: 'pvalue',
    chartSectionProps$: new BehaviorSubject<ChangePointChartSectionSnapshot | undefined>(undefined),
    ...overrides,
  });

  /**
   * Resolves the provider with the given params overrides, asserts it matched,
   * and returns the context — eliminating the repeated isMatch guard in each test.
   */
  const resolveMatch = async (overrides: Partial<DataSourceProfileProviderParams> = {}) => {
    const result = await provider.resolve(createParams(overrides));
    expect(result.isMatch).toBe(true);
    if (!result.isMatch) throw new Error('Expected isMatch: true');
    return result.context;
  };

  /** Builds a registry mock and the spread form expected by docViewsRegistry. */
  const buildRegistry = () => {
    const addMock = jest.fn();
    const registry = { add: addMock } as unknown as DocViewsRegistry;
    return { addMock, registryArg: { ...registry, clone: () => registry } as never };
  };

  const MOCK_RECORD = { id: 'row-1', raw: {}, flattened: {} } as never;

  describe('resolve', () => {
    describe('matches', () => {
      it('returns isMatch true with category and pvalueColumnId for a query with top-level CHANGE_POINT', async () => {
        const context = await resolveMatch();
        expect(context).toMatchObject({
          category: DataSourceCategory.Default,
          pvalueColumnId: 'pvalue',
        });
      });

      it('includes a BehaviorSubject as chartSectionProps$ in the context', async () => {
        const context = await resolveMatch();
        expect(context.chartSectionProps$).toBeInstanceOf(BehaviorSubject);
        expect((context.chartSectionProps$ as BehaviorSubject<unknown>).getValue()).toBeUndefined();
      });

      it('picks up a custom pvalue AS alias', async () => {
        const context = await resolveMatch({
          query: {
            esql: 'FROM logs-* | STATS avg_val = AVG(bytes) BY bucket = BUCKET(@timestamp, 1h) | CHANGE_POINT avg_val ON bucket AS change_type, p_value',
          },
        });
        expect(context).toMatchObject({
          category: DataSourceCategory.Default,
          pvalueColumnId: 'p_value',
        });
      });

      it('context does not include typeColumnId', async () => {
        const context = await resolveMatch();
        expect(context).not.toHaveProperty('typeColumnId');
      });
    });

    describe('does not match', () => {
      it('when data source is not ES|QL (DataView)', async () => {
        const result = await provider.resolve(
          createParams({ dataSource: { type: DataSourceType.DataView, dataViewId: 'logs' } })
        );
        expect(result).toEqual(RESOLUTION_MISMATCH);
      });

      it('when query is a non-aggregate KQL query', async () => {
        const result = await provider.resolve(
          createParams({ query: { language: 'kuery', query: 'message: error' } })
        );
        expect(result).toEqual(RESOLUTION_MISMATCH);
      });

      it('when ES|QL query has no CHANGE_POINT command', async () => {
        const result = await provider.resolve(
          createParams({ query: { esql: 'FROM logs-* | STATS count = COUNT(*)' } })
        );
        expect(result).toEqual(RESOLUTION_MISMATCH);
      });

      it('when CHANGE_POINT is only inside a FORK branch (not top-level)', async () => {
        const result = await provider.resolve(
          createParams({
            query: {
              esql: 'FROM logs-* | FORK (STATS avg = AVG(bytes) BY bucket = BUCKET(@timestamp, 1h) | CHANGE_POINT avg ON bucket)',
            },
          })
        );
        expect(result).toEqual(RESOLUTION_MISMATCH);
      });
    });
  });

  describe('getChartSectionConfiguration', () => {
    it('returns replaceDefaultChart: true and a renderChartSection function', () => {
      const getConfig = provider.profile.getChartSectionConfiguration!(
        () => ({ replaceDefaultChart: false }),
        {
          context: buildContext(),
          toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
        }
      );
      const config = getConfig();
      expect(config.replaceDefaultChart).toBe(true);
      if (config.replaceDefaultChart) {
        expect(typeof config.renderChartSection).toBe('function');
      }
    });
  });

  describe('getColumnsConfiguration', () => {
    it('customises the pvalue column when pvalueColumnId is present', () => {
      const getColumns = provider.profile.getColumnsConfiguration!(() => ({}), {
        context: buildContext({ pvalueColumnId: 'my_pvalue' }),
        toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      });
      expect(getColumns()).toHaveProperty('my_pvalue');
    });

    it('returns base config when pvalueColumnId is absent', () => {
      const base = { existing: {} as never };
      const getColumns = provider.profile.getColumnsConfiguration!(() => base, {
        context: buildContext({ pvalueColumnId: '' }),
        toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      });
      expect(getColumns()).toBe(base);
    });
  });

  describe('getCellRenderers', () => {
    const buildRenderers = (pvalueColumnId: string) => {
      const getCellRenderers = provider.profile.getCellRenderers!(() => ({}), {
        context: buildContext({ pvalueColumnId }),
        toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      });
      return getCellRenderers({
        rowHeight: 1,
        dataView: {} as DataView,
        density: undefined,
      });
    };

    it('registers a function renderer for the pvalue column', () => {
      const renderers = buildRenderers('pvalue');
      expect(renderers).toHaveProperty('pvalue');
      expect(renderers.pvalue).toBeInstanceOf(Function);
    });

    it('falls through to prev when pvalueColumnId is empty', () => {
      const existingRenderer = jest.fn();
      const prevRenderers = { some_col: existingRenderer };
      const getCellRenderers = provider.profile.getCellRenderers!(() => prevRenderers, {
        context: buildContext({ pvalueColumnId: '' }),
        toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT,
      });
      const renderers = getCellRenderers({
        rowHeight: 1,
        dataView: {} as DataView,
        density: undefined,
      });
      expect(renderers).toBe(prevRenderers);
    });
  });

  describe('getDocViewer', () => {
    const buildDocViewer = () => {
      const getDocViewer = provider.profile.getDocViewer!(
        () => ({ title: undefined, docViewsRegistry: (r: DocViewsRegistry) => r }),
        { context: buildContext(), toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT }
      );
      return getDocViewer({ record: MOCK_RECORD });
    };

    describe('registered tab', () => {
      let addMock: jest.Mock;

      beforeEach(() => {
        const { addMock: mock, registryArg } = buildRegistry();
        addMock = mock;
        buildDocViewer().docViewsRegistry(registryArg);
      });

      it('registers the doc_view_change_point_chart tab with correct id, order, and render function', () => {
        expect(addMock).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'doc_view_change_point_chart', order: 0 })
        );
        const renderFn = addMock.mock.calls[0][0].render;
        expect(React.isValidElement(renderFn({} as never))).toBe(true);
      });
    });

    it('chains the previous registry callback', () => {
      const prevRegistry = { add: jest.fn() } as unknown as DocViewsRegistry;
      const prevDocViewsRegistry = jest.fn(() => prevRegistry);
      const getDocViewer = provider.profile.getDocViewer!(
        () => ({ title: undefined, docViewsRegistry: prevDocViewsRegistry }),
        { context: buildContext(), toolkit: EMPTY_CONTEXT_AWARENESS_TOOLKIT }
      );
      const docViewer = getDocViewer({ record: MOCK_RECORD });
      const { registryArg } = buildRegistry();
      const result = docViewer.docViewsRegistry(registryArg);
      expect(prevDocViewsRegistry).toHaveBeenCalled();
      expect(result).toBe(prevRegistry);
    });
  });
});
