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
import { getSuggestions } from '../../../app_plugin/shared/edit_on_the_fly/helpers';
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
}: ESQLEditorProps) {
  const prevQuery = useRef<AggregateQuery | Query>(attributes?.state.query || { esql: '' });
  const [query, setQuery] = useState<AggregateQuery | Query>(
    attributes?.state.query || { esql: '' }
  );

  const { visualizationMap, datasourceMap } = useEditorFrameService();
  const { visualization } = useLensSelector((state) => state.lens);
  // Updated when the workspace kicks off a new search (manual refresh, auto-refresh,
  // or when chart requests run under a new session). Used as an effect dependency to
  // re-fetch the ES|QL results grid for the last submitted query.
  const searchSessionId = useLensSelector(selectSearchSessionId);

  const [errors, setErrors] = useState<Error[]>([]);
  const [submittedQuery, setSubmittedQuery] = useState<AggregateQuery | Query>(
    attributes?.state.query || { esql: '' }
  );
  const [isLayerAccordionOpen, setIsLayerAccordionOpen] = useState(true);
  const [suggestsLimitedColumns, setSuggestsLimitedColumns] = useState(false);
  const [isVisualizationLoading, setIsVisualizationLoading] = useState(false);
  const [dataGridAttrs, setDataGridAttrs] = useState<ESQLDataGridAttrs | undefined>(undefined);
  const [isSuggestionsAccordionOpen, setIsSuggestionsAccordionOpen] = useState(false);
  const [isESQLResultsAccordionOpen, setIsESQLResultsAccordionOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const currentAttributes = useCurrentAttributes({
    textBasedMode: isTextBasedLanguage,
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

  const { esqlVariables, useApproximation } = useFetchContext({ uuid: panelId, parentApi });
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
        useApproximation ?? undefined
      );
      if (attrs) {
        setCurrentAttributes?.(attrs);
        setErrors([]);
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
      useApproximation,
      setCurrentAttributes,
      updateSuggestion,
    ]
  );

  useInitializeChart({
    isTextBasedLanguage,
    query,
    dataGridAttrs,
    isInitialized,
    currentAttributes,
    runQuery,
    prevQueryRef: prevQuery,
    setErrors,
    setIsInitialized,
  });

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
      useApproximation ?? undefined
    ).catch(() => {
      // The chart itself will surface query errors via its own error handling path
    });

    return () => {
      abortController.abort();
    };
  }, [
    searchSessionId,
    esqlVariables,
    useApproximation,
    data,
    http,
    uiSettings,
    datasourceMap,
    visualizationMap,
    adHocDataViews,
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
        suggestsLimitedColumns={suggestsLimitedColumns}
        isVisualizationLoading={isVisualizationLoading}
        setIsVisualizationLoading={setIsVisualizationLoading}
        esqlVariables={esqlVariables}
        queryStats={esqlQueryStats}
        closeFlyout={closeFlyout}
        panelId={panelId}
        attributes={attributes}
        parentApi={parentApi}
      />
      {dataGridAttrs ? (
        <ESQLDataGridAccordion
          dataGridAttrs={dataGridAttrs}
          isAccordionOpen={isESQLResultsAccordionOpen}
          isTableView={visualization.activeId !== 'lnsDatatable'}
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
    isVisualizationLoading: boolean | undefined;
    setIsVisualizationLoading: (status: boolean) => void;
    suggestsLimitedColumns: boolean;
    adHocDataViews: DataViewSpec[];
    esqlVariables: ESQLControlVariable[] | undefined;
    queryStats?: ESQLQueryStats;
  } & Pick<LayerPanelProps, 'attributes' | 'parentApi' | 'panelId' | 'closeFlyout'>
>;

function InnerESQLEditor({
  query,
  adHocDataViews,
  errors,
  suggestsLimitedColumns,
  attributes,
  parentApi,
  panelId,
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
          onTextLangQueryChange={setQuery}
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
