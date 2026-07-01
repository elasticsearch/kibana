/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useRef } from 'react';
import { css } from '@emotion/react';

import { EuiSpacer } from '@elastic/eui';
import type { CoreStart } from '@kbn/core/public';
import type { ReactExpressionRendererType } from '@kbn/expressions-plugin/public';
import type { DragDropIdentifier } from '@kbn/dom-drag-drop';
import { type DragDropAction, RootDragDropProvider } from '@kbn/dom-drag-drop';
import type {
  FormBasedPrivateState,
  FramePublicAPI,
  Suggestion,
  UserMessagesGetter,
  AddUserMessages,
  LensInspector,
} from '@kbn/lens-common';
import type { UseEuiTheme } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { DRAG_DROP_EXTRA_TARGETS_PADDING } from '@kbn/lens-common';
import { getAbsoluteDateRange } from '../../utils';
import { trackUiCounterEvents } from '../../lens_ui_telemetry';
import { useAddLayerButton } from '../../app_plugin/shared/edit_on_the_fly/use_add_layer_button';
import { DataPanelWrapper } from './data_panel_wrapper';
import { BannerWrapper } from './banner_wrapper';
import { ConfigPanelWrapper } from './config_panel';
import { FrameLayout } from './frame_layout';
import { SuggestionPanelWrapper } from './suggestion_panel';
import { WorkspacePanel } from './workspace_panel';
import type { EditorFrameStartPlugins } from '../service';
import { getTopSuggestionForField, switchToSuggestion } from './suggestion_helpers';
import {
  useLensSelector,
  useLensDispatch,
  selectAreDatasourcesLoaded,
  selectFramePublicAPI,
  selectActiveDatasourceId,
  selectDatasourceStates,
  selectVisualization,
} from '../../state_management';
import { ErrorBoundary, showMemoizedErrorNotification } from '../../lens_ui_errors';
import type { IndexPatternServiceAPI } from '../../data_views_service/service';
import { getLongMessage } from '../../user_messages_utils';
import { useEditorFrameService } from '../editor_frame_service_context';
import { VisualizationToolbarWrapper } from './visualization_toolbar';
import { LayerTabsWrapper } from '../../app_plugin/shared/edit_on_the_fly/layer_tabs';
import { applyVizTypeDatasourceDefaults } from '../../datasources/form_based/viz_type_defaults';

export interface EditorFrameProps {
  ExpressionRenderer: ReactExpressionRendererType;
  core: CoreStart;
  plugins: EditorFrameStartPlugins;
  showNoDataPopover: () => void;
  lensInspector: LensInspector;
  indexPatternService: IndexPatternServiceAPI;
  getUserMessages: UserMessagesGetter;
  addUserMessages: AddUserMessages;
}

export function EditorFrame(props: EditorFrameProps) {
  const { datasourceMap, visualizationMap } = useEditorFrameService();
  const dispatchLens = useLensDispatch();
  const activeDatasourceId = useLensSelector(selectActiveDatasourceId);
  const datasourceStates = useLensSelector(selectDatasourceStates);
  const visualization = useLensSelector(selectVisualization);
  const areDatasourcesLoaded = useLensSelector(selectAreDatasourcesLoaded);

  const styles = useMemoCss(componentStyles);

  const isVisualizationLoaded = !!visualization.state;
  const visualizationTypeIsKnown = Boolean(
    visualization.activeId && visualizationMap[visualization.activeId]
  );

  const framePublicAPI: FramePublicAPI = useLensSelector((state) =>
    selectFramePublicAPI(state, datasourceMap)
  );

  framePublicAPI.absDateRange = getAbsoluteDateRange(
    props.plugins.data.query.timefilter.timefilter
  );

  // Using a ref to prevent rerenders in the child components while keeping the latest state
  const getSuggestionForField = useRef<(field: DragDropIdentifier) => Suggestion | undefined>();
  getSuggestionForField.current = (field: DragDropIdentifier) => {
    if (!field || !activeDatasourceId) {
      return;
    }
    return getTopSuggestionForField(
      framePublicAPI.datasourceLayers,
      visualization,
      datasourceStates,
      visualizationMap,
      datasourceMap[activeDatasourceId],
      field,
      framePublicAPI.dataViews,
      true
    );
  };

  const hasSuggestionForField = useCallback(
    (field: DragDropIdentifier) => getSuggestionForField.current!(field) !== undefined,
    [getSuggestionForField]
  );

  const dropOntoWorkspace = useCallback(
    (field: DragDropIdentifier) => {
      const suggestion = getSuggestionForField.current!(field);
      if (suggestion) {
        trackUiCounterEvents('drop_onto_workspace');
        const { datasourceId: suggestionDatasourceId } = suggestion;
        const targetVisualization = suggestionDatasourceId
          ? visualizationMap[suggestion.visualizationId]
          : undefined;
        // Intentional `as FormBasedPrivateState` type assertion as suggestions carry datasource state opaquely (`unknown`); `applyVizTypeDatasourceDefaults` re-checks `datasourceId === formBased` before touching it.
        const suggestionDatasourceState = suggestion.datasourceState as
          | FormBasedPrivateState
          | undefined;
        const adjustedSuggestion =
          targetVisualization && suggestionDatasourceId && suggestionDatasourceState
            ? {
                ...suggestion,
                datasourceState: applyVizTypeDatasourceDefaults({
                  kind: 'suggestion',
                  datasourceId: suggestionDatasourceId,
                  datasourceState: suggestionDatasourceState,
                  // Intentional `as FormBasedPrivateState` type assertion as the redux store carries datasource state opaquely (`unknown`);
                  previousDatasourceState: datasourceStates[suggestionDatasourceId]?.state as
                    | FormBasedPrivateState
                    | undefined,
                  targetVisualizationTypeId: targetVisualization.getVisualizationTypeId(
                    suggestion.visualizationState
                  ),
                }),
              }
            : suggestion;
        switchToSuggestion(dispatchLens, adjustedSuggestion, { clearStagedPreview: true });
      }
    },
    [getSuggestionForField, dispatchLens, visualizationMap, datasourceStates]
  );

  const onError = useCallback((error: Error) => {
    showMemoizedErrorNotification(error);
  }, []);

  const bannerMessages = props.getUserMessages('banner', { severity: 'warning' });

  const telemetryMiddleware = useCallback((action: DragDropAction) => {
    if (action.type === 'dropToTarget') {
      trackUiCounterEvents('drop_total');
    }
  }, []);

  const addLayerButton = useAddLayerButton(
    framePublicAPI,
    props.core,
    props.plugins.dataViews,
    props.plugins.uiActions,
    () => {}
  );

  return (
    <RootDragDropProvider
      initialState={{ dataTestSubjPrefix: 'lnsDragDrop' }}
      customMiddleware={telemetryMiddleware}
    >
      <FrameLayout
        bannerMessages={
          bannerMessages.length ? (
            <ErrorBoundary onError={onError}>
              <BannerWrapper nodes={bannerMessages.map(getLongMessage)} />
            </ErrorBoundary>
          ) : undefined
        }
        dataPanel={
          <ErrorBoundary onError={onError}>
            <DataPanelWrapper
              core={props.core}
              plugins={props.plugins}
              showNoDataPopover={props.showNoDataPopover}
              dropOntoWorkspace={dropOntoWorkspace}
              hasSuggestionForField={hasSuggestionForField}
              indexPatternService={props.indexPatternService}
              frame={framePublicAPI}
            />
          </ErrorBoundary>
        }
        configPanel={
          areDatasourcesLoaded && (
            <ErrorBoundary onError={onError}>
              {/* Flex container to enable proper scroll behavior for the config panel.
                  The toolbar and layer tabs remain fixed at the top while the
                  ConfigPanelWrapper content area scrolls independently. */}
              <div css={styles.configPanelFlexContainer}>
                {/* Toolbar area - fixed height, doesn't shrink */}
                <div css={styles.toolbarArea}>
                  <EuiFlexGroup
                    gutterSize="s"
                    css={styles.visualizationToolbar}
                    justifyContent="flexEnd"
                    responsive={false}
                    wrap={true}
                  >
                    <EuiFlexItem grow={false} data-test-subj="lnsVisualizationToolbar">
                      <VisualizationToolbarWrapper
                        framePublicAPI={framePublicAPI}
                        isInlineEditing={true}
                      />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>{addLayerButton}</EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer size="s" />
                </div>
                {/* Layer tabs - fixed height via its own styling */}
                <LayerTabsWrapper
                  coreStart={props.core}
                  framePublicAPI={framePublicAPI}
                  uiActions={props.plugins.uiActions}
                />
                {/* Scrollable config panel content area - takes remaining height */}
                <div
                  className="eui-scrollBar"
                  data-test-subj="lnsConfigPanelScrollContainer"
                  css={styles.scrollableConfigPanel}
                >
                  <ConfigPanelWrapper
                    core={props.core}
                    framePublicAPI={framePublicAPI}
                    uiActions={props.plugins.uiActions}
                    dataViews={props.plugins.dataViews}
                    data={props.plugins.data}
                    indexPatternService={props.indexPatternService}
                    getUserMessages={props.getUserMessages}
                  />
                </div>
              </div>
            </ErrorBoundary>
          )
        }
        workspacePanel={
          areDatasourcesLoaded &&
          isVisualizationLoaded && (
            <ErrorBoundary onError={onError}>
              <WorkspacePanel
                core={props.core}
                plugins={props.plugins}
                ExpressionRenderer={props.ExpressionRenderer}
                lensInspector={props.lensInspector}
                framePublicAPI={framePublicAPI}
                getSuggestionForField={getSuggestionForField.current}
                getUserMessages={props.getUserMessages}
                addUserMessages={props.addUserMessages}
              />
            </ErrorBoundary>
          )
        }
        suggestionsPanel={
          visualizationTypeIsKnown &&
          areDatasourcesLoaded && (
            <ErrorBoundary onError={onError}>
              <SuggestionPanelWrapper
                ExpressionRenderer={props.ExpressionRenderer}
                frame={framePublicAPI}
                getUserMessages={props.getUserMessages}
                nowProvider={props.plugins.data.nowProvider}
                core={props.core}
                showOnlyIcons
              />
            </ErrorBoundary>
          )
        }
      />
    </RootDragDropProvider>
  );
}

const componentStyles = {
  configPanelFlexContainer: () =>
    css({
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }),
  toolbarArea: ({ euiTheme }: UseEuiTheme) =>
    css({
      flexShrink: 0,
      backgroundColor: euiTheme.colors.backgroundBaseHighlighted,
      borderBottom: euiTheme.border.thin,
    }),
  scrollableConfigPanel: ({ euiTheme }: UseEuiTheme) =>
    css({
      flex: 1,
      minHeight: 0, // Required for overflow to work in flex container
      overflowY: 'auto',
      overflowX: 'hidden',
      // Extend the scroll container to the left to accommodate drag-drop extra targets
      // (e.g., "Alt/Option to duplicate" tooltip) that are positioned to the left of drop zones.
      // Use transparent background here - the EuiForm inside has its own background.
      paddingLeft: DRAG_DROP_EXTRA_TARGETS_PADDING,
      marginLeft: -DRAG_DROP_EXTRA_TARGETS_PADDING,
    }),
  visualizationToolbar: ({ euiTheme }: UseEuiTheme) =>
    css({
      margin: `${euiTheme.size.base} ${euiTheme.size.base} ${euiTheme.size.s} ${euiTheme.size.base}`,
    }),
};
