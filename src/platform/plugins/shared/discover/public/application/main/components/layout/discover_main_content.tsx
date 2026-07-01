/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiFlexGroup, EuiFlexItem, EuiHorizontalRule } from '@elastic/eui';
import { type DropType, DropOverlayWrapper, Droppable } from '@kbn/dom-drag-drop';
import React, { useCallback, useMemo } from 'react';
import type { DataView } from '@kbn/data-views-plugin/common';
import { METRIC_TYPE } from '@kbn/analytics';
import { i18n } from '@kbn/i18n';
import type { DocViewFilterFn } from '@kbn/unified-doc-viewer/types';
import { VIEW_MODE } from '../../../../../common/constants';
import { useDiscoverServices } from '../../../../hooks/use_discover_services';
import { DocumentViewModeToggle } from '../../../../components/view_mode_toggle';
import { FieldStatisticsTab } from '../field_stats_table';
import { DiscoverDocuments } from './discover_documents';
import { DOCUMENTS_VIEW_CLICK, FIELD_STATISTICS_VIEW_CLICK } from '../field_stats_table/constants';
import { useAppStateSelector } from '../../state_management/redux';
import { PanelsToggle } from '../../../../components/panels_toggle';
import { PatternAnalysisTab } from '../pattern_analysis/pattern_analysis_tab';
import { PATTERN_ANALYSIS_VIEW_CLICK } from '../pattern_analysis/constants';
import { useIsEsqlMode } from '../../hooks/use_is_esql_mode';
import {
  internalStateActions,
  useCurrentTabAction,
  useCurrentTabSelector,
  useInternalStateDispatch,
  useInternalStateGetState,
  selectTab,
} from '../../state_management/redux';

const DROP_PROPS = {
  value: {
    id: 'dscDropZoneTable',
    humanData: {
      label: i18n.translate('discover.dropZoneTableLabel', {
        defaultMessage: 'Drop zone to add field as a column to the table',
      }),
    },
  },
  order: [1, 0, 0, 0],
  types: ['field_add'] as DropType[],
};

export interface DiscoverMainContentProps {
  dataView: DataView;
  viewMode: VIEW_MODE;
  onAddFilter: DocViewFilterFn | undefined;
  onFieldEdited: (options: {
    editedDataView: DataView;
    removedFieldName?: string;
  }) => Promise<void>;
  onDropFieldToTable?: () => void;
  columns: string[];
  isChartAvailable?: boolean; // it will be injected by UnifiedHistogram
}

export const DiscoverMainContent = ({
  dataView,
  viewMode,
  onAddFilter,
  onFieldEdited,
  columns,
  onDropFieldToTable,
  isChartAvailable,
}: DiscoverMainContentProps) => {
  const { trackUiMetric } = useDiscoverServices();
  const dispatch = useInternalStateDispatch();
  const getState = useInternalStateGetState();
  const currentTabId = useCurrentTabSelector((tab) => tab.id);
  const updateAppState = useCurrentTabAction(internalStateActions.updateAppState);
  const updateAppStateAndReplaceUrl = useCurrentTabAction(
    internalStateActions.updateAppStateAndReplaceUrl
  );

  const setDiscoverViewMode = useCallback(
    (mode: VIEW_MODE, replace?: boolean) => {
      if (trackUiMetric) {
        if (mode === VIEW_MODE.AGGREGATED_LEVEL) {
          trackUiMetric(METRIC_TYPE.CLICK, FIELD_STATISTICS_VIEW_CLICK);
        } else if (mode === VIEW_MODE.PATTERN_LEVEL) {
          trackUiMetric(METRIC_TYPE.CLICK, PATTERN_ANALYSIS_VIEW_CLICK);
        } else {
          trackUiMetric(METRIC_TYPE.CLICK, DOCUMENTS_VIEW_CLICK);
        }
      }

      if (!replace) {
        dispatch(updateAppState({ appState: { viewMode: mode } }));
        return Promise.resolve(mode);
      }

      return new Promise<VIEW_MODE>((resolve, reject) => {
        // return a promise to report when the view mode has been updated
        dispatch(updateAppStateAndReplaceUrl({ appState: { viewMode: mode } })).then(() => {
          const appState = selectTab(getState(), currentTabId).appState;

          if (appState.viewMode === mode) {
            resolve(mode);
          } else {
            reject(mode);
          }
        });
      });
    },
    [dispatch, updateAppStateAndReplaceUrl, getState, currentTabId, trackUiMetric, updateAppState]
  );

  const isEsqlMode = useIsEsqlMode();
  const isDropAllowed = Boolean(onDropFieldToTable);
  const showChart = useAppStateSelector((state) => !state.hideChart);
  const showPanelsToggle = !isChartAvailable || !showChart;

  const renderViewModeToggle = useCallback(
    (patternCount?: number) => {
      return (
        <DocumentViewModeToggle
          viewMode={viewMode}
          isEsqlMode={isEsqlMode}
          setDiscoverViewMode={setDiscoverViewMode}
          patternCount={patternCount}
          dataView={dataView}
          prepend={
            showPanelsToggle ? (
              <PanelsToggle
                omitChartButton={!isChartAvailable}
                omitTableButton={!isChartAvailable}
                dataTestSubjSuffix="InPage"
              />
            ) : undefined
          }
        />
      );
    },
    [viewMode, isEsqlMode, setDiscoverViewMode, dataView, showPanelsToggle, isChartAvailable]
  );

  const viewModeToggle = useMemo(() => renderViewModeToggle(), [renderViewModeToggle]);

  return (
    <Droppable
      dropTypes={isDropAllowed ? DROP_PROPS.types : undefined}
      value={DROP_PROPS.value}
      order={DROP_PROPS.order}
      onDrop={onDropFieldToTable}
    >
      <DropOverlayWrapper isVisible={isDropAllowed}>
        <EuiFlexGroup
          className="eui-fullHeight"
          direction="column"
          gutterSize="none"
          responsive={false}
          data-test-subj="dscMainContent"
        >
          {showChart && isChartAvailable && <EuiHorizontalRule margin="none" />}
          {viewMode === VIEW_MODE.DOCUMENT_LEVEL ? (
            <DiscoverDocuments
              viewModeToggle={viewModeToggle}
              dataView={dataView}
              onAddFilter={onAddFilter}
              onFieldEdited={!isEsqlMode ? onFieldEdited : undefined}
            />
          ) : null}
          {viewMode === VIEW_MODE.AGGREGATED_LEVEL ? (
            <>
              <EuiFlexItem grow={false}>{viewModeToggle}</EuiFlexItem>
              <FieldStatisticsTab
                dataView={dataView}
                columns={columns}
                onAddFilter={!isEsqlMode ? onAddFilter : undefined}
                trackUiMetric={trackUiMetric}
                isEsqlMode={isEsqlMode}
              />
            </>
          ) : null}
          {viewMode === VIEW_MODE.PATTERN_LEVEL ? (
            <PatternAnalysisTab
              dataView={dataView}
              switchToDocumentView={() => setDiscoverViewMode(VIEW_MODE.DOCUMENT_LEVEL, true)}
              trackUiMetric={trackUiMetric}
              renderViewModeToggle={renderViewModeToggle}
            />
          ) : null}
        </EuiFlexGroup>
      </DropOverlayWrapper>
    </Droppable>
  );
};
