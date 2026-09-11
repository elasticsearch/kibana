/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { createPortal } from 'react-dom';
import { css } from '@emotion/react';
import { EuiFlexItem, useEuiTheme } from '@elastic/eui';
import type { AggregateQuery, Query } from '@kbn/es-query';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { getRepresentativeQuery } from '@kbn/lens-common';
import type { DatatableColumn } from '@kbn/expressions-plugin/public';
import { useFetchContext } from '@kbn/presentation-publishing';
import type { CoreStart, IUiSettingsClient } from '@kbn/core/public';
import { isEqual } from 'lodash';
import type { MutableRefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ESQLLangEditor, useESQLQueryStats } from '@kbn/esql/public';
import { type ESQLControlVariable, type ESQLQueryStats } from '@kbn/esql-types';
import { i18n } from '@kbn/i18n';
import React from 'react';
import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import type { Simplify } from '@kbn/chart-expressions-common';
import { useObservable } from '@kbn/use-observable';
import { EMPTY } from 'rxjs';
import { useCurrentAttributes } from '../../../app_plugin/shared/edit_on_the_fly/use_current_attributes';
import { useESQLEditorContext } from './esql_editor_context';
import { getActiveDataFromDatatable } from '../../../state_management/shared_logic';
import { useLensSelector, selectSearchSessionId } from '../../../state_management';
import type { ESQLDataGridAttrs } from '../../../app_plugin/shared/edit_on_the_fly/helpers';
import { getGridAttrs, getSuggestions } from '../../../app_plugin/shared/edit_on_the_fly/helpers';
import { addColumnsToCache } from '../../../datasources/text_based/fieldlist_cache';
import { useESQLVariables } from '../../../app_plugin/shared/edit_on_the_fly/use_esql_variables';
import { MAX_NUM_OF_COLUMNS } from '../../../datasources/text_based/utils';
import type { LayerPanelProps } from './types';
import { ESQLDataGridAccordion } from '../../../app_plugin/shared/edit_on_the_fly/esql_data_grid_accordion';
import { useInitializeChart } from './use_initialize_chart';
import { useEditorFrameService } from '../../editor_frame_service_context';

export type ESQLEditorProps = Simplify<
  {
    isTextBasedLanguage: boolean;
    uiSettings: IUiSettingsClient;
    http: CoreStart['http'];
    layerQuery?: AggregateQuery;
    onLayerQuerySubmit?: (
      query: AggregateQuery,
      columns: DatatableColumn[],
      abortController?: AbortController
    ) => Promise<void>;
  } & Pick<
    LayerPanelProps,
    | 'attributes'
    | 'framePublicAPI'
    | 'lensAdapters'
    | 'parentApi'
    | 'layerId'
    | 'panelId'
    | 'closeFlyout'
    | 'data'
    | 'editorContainer'
    | 'setCurrentAttributes'
    | 'updateSuggestion'
    | 'dataLoading$'
    | 'parentApi'
    | 'onTextBasedQueryStateChange'
  >
>;

/**
 * This is a wrapper around the Monaco ESQL editor for Lens
 * It handles its internal state and update both attributes & activeData on changes
 * in the Redux store.
 * Mind that this component will render either inline (classic React)
 * or in a portal if the editorContainer props is provided
 */
export function ESQLEditor({
  data,
  http,
  uiSettings,
  attributes,
  framePublicAPI,
  isTextBasedLanguage,
  lensAdapters,
  parentApi,
  panelId,
  layerId,
  closeFlyout,
  editorContainer,
  dataLoading$,
  setCurrentAttributes,
  updateSuggestion,
  onTextBasedQueryStateChange,
  layerQuery,
  onLayerQuerySubmit,
}: ESQLEditorProps) {
  // recomputed every render but only read by the useRef/useState initializers
  // below — do not hoist into a memo, later renders intentionally ignore it
  const initialQuery = layerQuery ?? (getRepresentativeQuery(attributes) || { esql: '' });
  const prevQuery = useRef<AggregateQuery | Query>(initialQuery);
  const [query, setQuery] = useState<AggregateQuery | Query>(initialQuery);

  const { visualizationMap, datasourceMap } = useEditorFrameService();
  const { visualization } = useLensSelector((state) => state.lens);
  // Updated when the workspace kicks off a new search (manual refresh, auto-refresh,
  // or when chart requests run under a new session). Used as an effect dependency to
  // re-fetch the ES|QL results grid for the last submitted query.
  const searchSessionId = useLensSelector(selectSearchSessionId);

  const [errors, setErrors] = useState<Error[]>([]);
  const [submittedQuery, setSubmittedQuery] = useState<AggregateQuery | Query>(initialQuery);
  const [isLayerAccordionOpen, setIsLayerAccordionOpen] = useState(true);
  const [suggestsLimitedColumns, setSuggestsLimitedColumns] = useState(false);
  const [isVisualizationLoading, setIsVisualizationLoading] = useState(false);
  const [dataGridAttrs, setDataGridAttrs] = useState<ESQLDataGridAttrs | undefined>(undefined);
  const [isSuggestionsAccordionOpen, setIsSuggestionsAccordionOpen] = useState(false);
  const [isESQLResultsAccordionOpen, setIsESQLResultsAccordionOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!layerQuery || isEqual(layerQuery, prevQuery.current)) {
      return;
    }

    prevQuery.current = layerQuery;
    setQuery(layerQuery);
    setSubmittedQuery(layerQuery);
    setErrors([]);
  }, [layerQuery]);

  const currentAttributes = useCurrentAttributes({
    initialAttributes: attributes,
  });

  // Use a ref to always read the latest currentAttributes in async callbacks,
  // avoiding stale closures when the user changes chart type/config between renders
  const currentAttributesRef = useRef(currentAttributes);
  currentAttributesRef.current = currentAttributes;

  const adHocDataViews = useMemo(() => {
    if (attributes && attributes.state.adHocDataViews) {
      return Object.values(attributes.state.adHocDataViews);
    }
    return Object.values(framePublicAPI.dataViews.indexPatterns).map((index) => index.spec);
  }, [attributes, framePublicAPI.dataViews.indexPatterns]);

  const lensAdaptersRef = useRef(lensAdapters);
  lensAdaptersRef.current = lensAdapters;

  // Avoids duplicating the first grid load
  const isInitialRenderRef = useRef(true);

  const submittedQueryRef = useRef(submittedQuery);
  submittedQueryRef.current = submittedQuery;

  const { esqlVariables, isApproximate } = useFetchContext({ uuid: panelId, parentApi });
  const esqlQueryStats = useESQLQueryStats(isTextBasedLanguage, lensAdapters?.requests);

  // Update column limit indicator when chart data finishes loading
  const isDataLoading = useObservable(dataLoading$ ?? EMPTY);

  useEffect(() => {
    if (isDataLoading !== false) return;
    const activeData = getActiveDataFromDatatable(layerId, lensAdaptersRef.current?.tables?.tables);
    const table = activeData?.[layerId];
    if (table) {
      setSuggestsLimitedColumns(table.columns.length >= MAX_NUM_OF_COLUMNS);
    }
  }, [isDataLoading, layerId]);

  const runQuery = useCallback(
    async (q: AggregateQuery, abortController?: AbortController, shouldUpdateAttrs?: boolean) => {
      setErrors([]);

      if (onLayerQuerySubmit) {
        try {
          const gridAttrs = await getGridAttrs(
            q,
            adHocDataViews,
            data,
            http,
            uiSettings,
            abortController,
            esqlVariables,
            isApproximate
          );
          // Commit the grid and fieldlist cache only after the layer accepted the
          // query; otherwise a rejected query (e.g. missing-dimension validation)
          // would leave them showing results the layer state does not reflect.
          await onLayerQuerySubmit(q, gridAttrs.columns, abortController);
          addColumnsToCache(q, gridAttrs.columns);
          setDataGridAttrs(gridAttrs);
          prevQuery.current = q;
          setSubmittedQuery(q);
        } catch (error) {
          if (!abortController?.signal.aborted) {
            setErrors([error instanceof Error ? error : new Error(String(error))]);
          }
        } finally {
          setIsVisualizationLoading(false);
        }
        return;
      }

      const attrs = await getSuggestions(
        q,
        data,
        http,
        uiSettings,
        datasourceMap,
        visualizationMap,
        adHocDataViews,
        setErrors,
        abortController,
        setDataGridAttrs,
        esqlVariables,
        shouldUpdateAttrs,
        currentAttributesRef.current,
        isApproximate
      );
      // An aborted run (e.g. the user clicked "Cancel", or a re-render tore
      // down the request) produced no result. Bail out *without* recording the
      // query as submitted: `onTextLangQuerySubmit` skips queries equal to
      // `prevQuery.current`, so marking an aborted run here would silently
      // drop every future resubmission of the same query text.
      if (abortController?.signal.aborted) {
        setIsVisualizationLoading(false);
        return;
      }
      if (attrs) {
        setCurrentAttributes?.(attrs);
        updateSuggestion?.(attrs);
      }
      prevQuery.current = q;
      setSubmittedQuery(q);
      setIsVisualizationLoading(false);
    },
    [
      uiSettings,
      data,
      http,
      datasourceMap,
      visualizationMap,
      adHocDataViews,
      esqlVariables,
      isApproximate,
      setCurrentAttributes,
      updateSuggestion,
      onLayerQuerySubmit,
    ]
  );

  useInitializeChart({
    isTextBasedLanguage: isTextBasedLanguage && !onLayerQuerySubmit,
    query,
    dataGridAttrs,
    isInitialized,
    currentAttributes,
    runQuery,
    prevQueryRef: prevQuery,
    setErrors,
    setIsInitialized,
  });

  // Initial ES|QL results grid load for the layer-scoped path: fetch grid attrs
  // for the last submitted layer query without re-submitting it to the layer state.
  useEffect(() => {
    if (!onLayerQuerySubmit || dataGridAttrs) {
      return;
    }
    const lastSubmittedQuery = submittedQueryRef.current;
    if (!isOfAggregateQueryType(lastSubmittedQuery)) {
      return;
    }
    const abortController = new AbortController();
    getGridAttrs(
      lastSubmittedQuery,
      adHocDataViews,
      data,
      http,
      uiSettings,
      abortController,
      esqlVariables,
      isApproximate
    )
      .then((gridAttrs) => {
        addColumnsToCache(lastSubmittedQuery, gridAttrs.columns);
        setDataGridAttrs(gridAttrs);
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          // expected: the effect cleanup aborted the request (unmount/re-run)
          return;
        }
        // deliberately not surfaced here: the chart itself reports query errors
        // via its own error handling path
      });
    return () => {
      abortController.abort();
    };
  }, [
    onLayerQuerySubmit,
    dataGridAttrs,
    adHocDataViews,
    data,
    http,
    uiSettings,
    esqlVariables,
    isApproximate,
  ]);

  // Track and report query state to parent
  useEffect(() => {
    onTextBasedQueryStateChange?.({
      hasErrors: errors.length > 0,
      isQueryPendingSubmit: !isEqual(query, submittedQuery),
    });
  }, [query, submittedQuery, errors.length, onTextBasedQueryStateChange]);

  // Refresh the ES|QL results table for the last submitted query when inputs to the preview
  // request change without the user submitting again.
  useEffect(() => {
    if (onLayerQuerySubmit) {
      return;
    }

    // Skip the initial render, the grid is populated by useInitializeChart → runQuery
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false;
      return;
    }

    const lastSubmittedQuery = submittedQueryRef.current;
    if (!isOfAggregateQueryType(lastSubmittedQuery)) {
      return;
    }

    const abortController = new AbortController();

    getSuggestions(
      lastSubmittedQuery,
      data,
      http,
      uiSettings,
      datasourceMap,
      visualizationMap,
      adHocDataViews,
      undefined,
      abortController,
      setDataGridAttrs,
      esqlVariables,
      false,
      currentAttributesRef.current,
      isApproximate
    ).catch(() => {
      // The chart itself will surface query errors via its own error handling path
    });

    return () => {
      abortController.abort();
    };
  }, [
    searchSessionId,
    esqlVariables,
    isApproximate,
    data,
    http,
    uiSettings,
    datasourceMap,
    visualizationMap,
    adHocDataViews,
    onLayerQuerySubmit,
  ]);

  if (!isOfAggregateQueryType(query)) {
    return null;
  }

  const EditorComponent = (
    <>
      <InnerESQLEditor
        query={query}
        prevQuery={prevQuery}
        setQuery={setQuery}
        runQuery={runQuery}
        adHocDataViews={adHocDataViews}
        errors={errors}
        setErrors={setErrors}
        suggestsLimitedColumns={suggestsLimitedColumns}
        isVisualizationLoading={isVisualizationLoading}
        setIsVisualizationLoading={setIsVisualizationLoading}
        esqlVariables={esqlVariables}
        queryStats={esqlQueryStats}
        closeFlyout={closeFlyout}
        panelId={panelId}
        layerId={layerId}
        attributes={attributes}
        parentApi={parentApi}
      />
      {dataGridAttrs ? (
        <ESQLDataGridAccordion
          dataGridAttrs={dataGridAttrs}
          isAccordionOpen={isESQLResultsAccordionOpen}
          isTableView={visualization.activeId !== 'lnsDatatable'}
          isApproximate={isApproximate}
          setIsAccordionOpen={setIsESQLResultsAccordionOpen}
          query={query}
          onAccordionToggleCb={(status) => {
            if (status && isSuggestionsAccordionOpen) {
              setIsSuggestionsAccordionOpen(!status);
            }
            if (status && isLayerAccordionOpen) {
              setIsLayerAccordionOpen(!status);
            }
          }}
        />
      ) : null}
    </>
  );

  if (editorContainer) {
    return <>{createPortal(EditorComponent, editorContainer)}</>;
  }
  return EditorComponent;
}

type InnerEditorProps = Simplify<
  {
    query: AggregateQuery;
    prevQuery: MutableRefObject<AggregateQuery | Query>;
    setQuery: (query: AggregateQuery | Query) => void;
    runQuery: (
      q: AggregateQuery,
      abortController?: AbortController,
      shouldUpdateAttrs?: boolean
    ) => Promise<void>;
    errors: Error[];
    setErrors: (errors: Error[]) => void;
    isVisualizationLoading: boolean | undefined;
    setIsVisualizationLoading: (status: boolean) => void;
    suggestsLimitedColumns: boolean;
    adHocDataViews: DataViewSpec[];
    esqlVariables: ESQLControlVariable[] | undefined;
    queryStats?: ESQLQueryStats;
  } & Pick<LayerPanelProps, 'attributes' | 'parentApi' | 'panelId' | 'layerId' | 'closeFlyout'>
>;

function InnerESQLEditor({
  query,
  adHocDataViews,
  errors,
  setErrors,
  suggestsLimitedColumns,
  attributes,
  parentApi,
  panelId,
  layerId,
  closeFlyout,
  setQuery,
  isVisualizationLoading,
  setIsVisualizationLoading,
  prevQuery,
  runQuery,
  esqlVariables,
  queryStats,
}: InnerEditorProps) {
  const { euiTheme } = useEuiTheme();
  const esqlEditorContext = useESQLEditorContext();
  const { onSaveControl, onCancelControl } = useESQLVariables({
    parentApi,
    panelId,
    layerId,
    attributes,
    closeFlyout,
  });

  return (
    <EuiFlexItem grow={false} data-test-subj="InlineEditingESQLEditor">
      <div
        css={css`
          border-top: ${euiTheme.border.thin};
        `}
      >
        <ESQLLangEditor
          query={query}
          onTextLangQueryChange={(nextQuery) => {
            setQuery(nextQuery);
            if (errors.length > 0) {
              setErrors([]);
            }
          }}
          errors={errors}
          warning={
            suggestsLimitedColumns
              ? i18n.translate('xpack.lens.config.configFlyoutCallout', {
                  defaultMessage:
                    'Displaying a limited portion of the available fields. Add more from the configuration panel.',
                })
              : undefined
          }
          editorIsInline
          onTextLangQuerySubmit={async (q, a) => {
            // do not run the suggestions if the query is the same as the previous one
            if (q && !isEqual(q, prevQuery.current)) {
              setIsVisualizationLoading(true);
              await runQuery(q, a);
            }
          }}
          isDisabled={false}
          allowQueryCancellation
          isLoading={isVisualizationLoading}
          controlsContext={{
            supportsControls: parentApi !== undefined,
            onSaveControl,
            onCancelControl,
          }}
          esqlVariables={esqlVariables}
          queryStats={queryStats}
          initialState={
            esqlEditorContext?.editorHeightRef.current !== undefined
              ? { editorHeight: esqlEditorContext.editorHeightRef.current }
              : undefined
          }
          onInitialStateChange={(state) => {
            if (state.editorHeight !== undefined && esqlEditorContext) {
              esqlEditorContext.editorHeightRef.current = state.editorHeight;
            }
          }}
        />
      </div>
    </EuiFlexItem>
  );
}
