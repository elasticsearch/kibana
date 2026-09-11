/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, waitFor } from '@testing-library/react';
import type { AggregateQuery } from '@kbn/es-query';
import { coreMock } from '@kbn/core/public/mocks';
import type { TypedLensSerializedState } from '@kbn/lens-common';
import {
  renderWithReduxStore,
  mockVisualizationMap,
  mockDatasourceMap,
  mockDataPlugin,
} from '../../../mocks';
import { EditorFrameServiceProvider } from '../../editor_frame_service_context';
import { ESQLEditor, type ESQLEditorProps } from './esql_editor';
import { getGridAttrs, getSuggestions } from '../../../app_plugin/shared/edit_on_the_fly/helpers';
import { addColumnsToCache } from '../../../datasources/text_based/fieldlist_cache';

// Capture the submit callback that `ESQLEditor` wires into the language
// editor so the test can drive query submissions directly.
let capturedOnSubmit:
  | ((q: AggregateQuery, abortController?: AbortController) => Promise<void>)
  | undefined;
// Capture the query the editor currently displays, to assert seeding/reset behavior.
let capturedQuery: AggregateQuery | undefined;

jest.mock('@kbn/esql/public', () => ({
  ESQLLangEditor: (props: {
    query: AggregateQuery;
    onTextLangQuerySubmit: (q: AggregateQuery, a?: AbortController) => Promise<void>;
  }) => {
    capturedOnSubmit = props.onTextLangQuerySubmit;
    capturedQuery = props.query;
    return null;
  },
  useESQLQueryStats: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../../../app_plugin/shared/edit_on_the_fly/helpers', () => ({
  getSuggestions: jest.fn().mockResolvedValue(undefined),
  getGridAttrs: jest.fn().mockResolvedValue({ columns: [], rows: [] }),
}));

jest.mock('../../../datasources/text_based/fieldlist_cache', () => ({
  addColumnsToCache: jest.fn(),
}));

// The initialization hook triggers an initial `runQuery` against real
// services; irrelevant for these tests, which submit queries explicitly.
jest.mock('./use_initialize_chart', () => ({
  useInitializeChart: jest.fn(),
}));

jest.mock('../../../app_plugin/shared/edit_on_the_fly/use_esql_variables', () => ({
  useESQLVariables: jest.fn().mockReturnValue({
    onSaveControl: jest.fn(),
    onCancelControl: jest.fn(),
  }),
}));

jest.mock('@kbn/presentation-publishing', () => ({
  ...jest.requireActual('@kbn/presentation-publishing'),
  useFetchContext: jest.fn().mockReturnValue({ esqlVariables: [], isApproximate: false }),
}));

const getSuggestionsMock = getSuggestions as jest.MockedFunction<typeof getSuggestions>;
const getGridAttrsMock = getGridAttrs as jest.MockedFunction<typeof getGridAttrs>;
const addColumnsToCacheMock = addColumnsToCache as jest.MockedFunction<typeof addColumnsToCache>;

describe('ESQLEditor', () => {
  const coreStart = coreMock.createStart();

  const attributes = {
    title: '',
    visualizationType: 'lnsXY',
    references: [],
    state: {
      query: { esql: 'FROM index1' },
      filters: [],
      datasourceStates: { textBased: { layers: {} } },
      visualization: {},
      adHocDataViews: {},
    },
  } as unknown as TypedLensSerializedState['attributes'];

  const makeProps = (extraProps: Partial<ESQLEditorProps> = {}) => {
    return {
      data: mockDataPlugin(),
      http: coreStart.http,
      uiSettings: coreStart.uiSettings,
      attributes,
      framePublicAPI: { dataViews: { indexPatterns: {} } },
      isTextBasedLanguage: true,
      lensAdapters: undefined,
      parentApi: undefined,
      panelId: undefined,
      layerId: 'layer1',
      closeFlyout: jest.fn(),
      editorContainer: undefined,
      dataLoading$: undefined,
      setCurrentAttributes: jest.fn(),
      updateSuggestion: jest.fn(),
      onTextBasedQueryStateChange: jest.fn(),
      ...extraProps,
    } as unknown as ESQLEditorProps;
  };

  const buildEditor = (props: ESQLEditorProps) => (
    <EditorFrameServiceProvider
      visualizationMap={mockVisualizationMap()}
      datasourceMap={mockDatasourceMap()}
    >
      <ESQLEditor {...props} />
    </EditorFrameServiceProvider>
  );

  const renderEditor = (extraProps: Partial<ESQLEditorProps> = {}) => {
    const result = renderWithReduxStore(buildEditor(makeProps(extraProps)));
    return {
      ...result,
      rerenderEditor: (nextExtraProps: Partial<ESQLEditorProps> = {}) =>
        result.rerender(buildEditor(makeProps(nextExtraProps))),
    };
  };

  beforeEach(() => {
    capturedOnSubmit = undefined;
    capturedQuery = undefined;
    getSuggestionsMock.mockClear();
    getSuggestionsMock.mockResolvedValue(undefined);
    getGridAttrsMock.mockClear();
    getGridAttrsMock.mockResolvedValue({ columns: [], rows: [] } as unknown as Awaited<
      ReturnType<typeof getGridAttrs>
    >);
    addColumnsToCacheMock.mockClear();
  });

  it('runs the same query again after the previous run was aborted', async () => {
    renderEditor();
    await waitFor(() => expect(capturedOnSubmit).toBeDefined());

    const query = { esql: 'FROM index1 | STATS maxB = MAX(bytes)' };

    // First submission: the run gets cancelled mid-flight (the editor's
    // Search/Cancel button aborts the signal while getSuggestions is pending).
    const abortedController = new AbortController();
    getSuggestionsMock.mockImplementationOnce(async () => {
      abortedController.abort();
      return undefined;
    });
    await act(() => capturedOnSubmit!(query, abortedController));
    expect(getSuggestionsMock).toHaveBeenCalledTimes(1);

    // Second submission of the *same* text must run again: an aborted run
    // produced no result, so it must not count as "already submitted".
    await act(() => capturedOnSubmit!(query, new AbortController()));
    expect(getSuggestionsMock).toHaveBeenCalledTimes(2);
  });

  it('does not re-run the same query after a successful run', async () => {
    renderEditor();
    await waitFor(() => expect(capturedOnSubmit).toBeDefined());

    const query = { esql: 'FROM index1 | STATS maxB = MAX(bytes)' };

    await act(() => capturedOnSubmit!(query, new AbortController()));
    expect(getSuggestionsMock).toHaveBeenCalledTimes(1);

    // Same text again: deduplicated, no new run.
    await act(() => capturedOnSubmit!(query, new AbortController()));
    expect(getSuggestionsMock).toHaveBeenCalledTimes(1);
  });

  describe('layer-scoped query submission', () => {
    const query = { esql: 'FROM index1 | STATS maxB = MAX(bytes)' };

    it('commits grid columns to the cache only after the layer accepts the query', async () => {
      const onLayerQuerySubmit = jest.fn().mockResolvedValue(undefined);
      renderEditor({ onLayerQuerySubmit });
      await waitFor(() => expect(capturedOnSubmit).toBeDefined());

      await act(() => capturedOnSubmit!(query, new AbortController()));

      expect(onLayerQuerySubmit).toHaveBeenCalledTimes(1);
      // Ignore the initial-grid-load cache call for the last submitted query;
      // only the submitted query's cache commit must follow layer acceptance.
      const submitCacheCallIndex = addColumnsToCacheMock.mock.calls.findIndex(
        ([cachedQuery]) => cachedQuery === query
      );
      expect(submitCacheCallIndex).toBeGreaterThanOrEqual(0);
      expect(onLayerQuerySubmit.mock.invocationCallOrder[0]).toBeLessThan(
        addColumnsToCacheMock.mock.invocationCallOrder[submitCacheCallIndex]
      );
    });

    it('does not cache columns or mark the query submitted when the layer rejects it', async () => {
      const onLayerQuerySubmit = jest.fn().mockRejectedValue(new Error('incompatible dimensions'));
      renderEditor({ onLayerQuerySubmit });
      await waitFor(() => expect(capturedOnSubmit).toBeDefined());

      await act(() => capturedOnSubmit!(query, new AbortController()));

      // The initial grid load may cache the previously submitted query, but the
      // rejected query itself must not be cached.
      expect(addColumnsToCacheMock.mock.calls.some(([cachedQuery]) => cachedQuery === query)).toBe(
        false
      );

      // The rejected query must not count as submitted: the same text runs again.
      await act(() => capturedOnSubmit!(query, new AbortController()));
      expect(onLayerQuerySubmit).toHaveBeenCalledTimes(2);
    });
  });

  describe('global/per-layer query seam', () => {
    it('seeds the global (single-layer) path from the authoritative layer query, not the slot', async () => {
      // legacy dual-written document: stale aggregate slot copy + authoritative layer query
      const layerQuery = { esql: 'FROM index1 | STATS COUNT(*)' };
      const dualWrittenAttributes = {
        ...attributes,
        state: {
          ...attributes.state,
          query: { esql: 'FROM stale_slot' },
          datasourceStates: {
            textBased: { layers: { layer1: { query: layerQuery, columns: [] } } },
          },
        },
      } as unknown as TypedLensSerializedState['attributes'];

      renderEditor({ attributes: dualWrittenAttributes });
      await waitFor(() => expect(capturedQuery).toBeDefined());

      // both paths read the same source of truth: the layer query
      expect(capturedQuery).toEqual(layerQuery);
    });

    it('resets the editor to the layer query when switching to the per-layer path', async () => {
      const editor = renderEditor();
      await waitFor(() => expect(capturedQuery).toBeDefined());
      expect(capturedQuery).toEqual({ esql: 'FROM index1' });

      // a second layer is added: the layer-scoped path activates with a layer query
      const layerQuery = { esql: 'FROM index1 | STATS MAX(bytes)' };
      await act(async () => editor.rerenderEditor({ layerQuery, onLayerQuerySubmit: jest.fn() }));

      expect(capturedQuery).toEqual(layerQuery);
    });
  });
});
