/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useCallback, useRef, useState } from 'react';
import { isEqual } from 'lodash';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import {
  EuiTitle,
  EuiAccordion,
  useEuiTheme,
  EuiFlexGroup,
  EuiFlexItem,
  euiScrollBarStyles,
  EuiWindowEvent,
  keys,
  EuiButtonIcon,
  EuiToolTip,
} from '@elastic/eui';
import type {
  DatasourceStates,
  TypedLensSerializedState,
  LensDatasourceId,
} from '@kbn/lens-common';
import { LENS_DATASOURCE_ID, isTextBasedAttributes } from '@kbn/lens-common';
import { buildExpression } from '../../../editor_frame_service/editor_frame/expression_helpers';
import type { TextBasedQueryState } from '../../../editor_frame_service/editor_frame/config_panel/types';
import { getLensFeatureFlags } from '../../../get_feature_flags';
import {
  useLensSelector,
  selectFramePublicAPI,
  useLensDispatch,
  selectHideTextBasedEditor,
} from '../../../state_management';
import { serializeVisualizationToSave } from '../../../state_management/shared_logic';
import {
  EXPRESSION_BUILD_ERROR_ID,
  getAbsoluteDateRange,
  getActiveDatasourceIdFromDoc,
} from '../../../utils';
import { LayerConfiguration } from './layer_configuration_section';
import type { EditConfigPanelProps } from './types';
import { FlyoutWrapper } from './flyout_wrapper';
import { SuggestionPanel } from '../../../editor_frame_service/editor_frame/suggestion_panel';
import { VisualizationToolbarWrapper } from '../../../editor_frame_service/editor_frame/visualization_toolbar';
import { useEditorFrameService } from '../../../editor_frame_service/editor_frame_service_context';
import { useApplicationUserMessages } from '../../get_application_user_messages';
import { trackSaveUiCounterEvents } from '../../../lens_ui_telemetry';
import { useCurrentAttributes } from './use_current_attributes';
import { deleteUserChartTypeFromSessionStorage } from '../../../chart_type_session_storage';
import { LayerTabsWrapper } from './layer_tabs';
import { useAddLayerButton } from './use_add_layer_button';
import { ConvertToEsqlModal } from './convert_to_esql_modal';
import { useEsqlConversionCheck } from './use_esql_conversion_check';

export function LensEditConfigurationFlyout({
  attributes,
  coreStart,
  startDependencies,
  updatePanelState,
  updateSuggestion,
  setCurrentAttributes,
  closeFlyout,
  saveByRef,
  savedObjectId,
  updateByRefInput,
  dataLoading$,
  lensAdapters,
  navigateToLensEditor,
  displayFlyoutHeader,
  isNewPanel,
  hidesSuggestions,
  onApply: onApplyCallback,
  onCancel: onCancelCallback,
  isReadOnly,
  parentApi,
  panelId,
  applyButtonLabel,
}: EditConfigPanelProps) {
  const euiTheme = useEuiTheme();
  const previousAttributes = useRef<TypedLensSerializedState['attributes']>(attributes);

  const { datasourceMap, visualizationMap } = useEditorFrameService();

  // Derive datasourceId from attributes - this updates when converting between formBased and textBased
  const datasourceId = getActiveDatasourceIdFromDoc(attributes) as LensDatasourceId;

  const [isInlineFlyoutVisible, setIsInlineFlyoutVisible] = useState(true);
  const [isLayerAccordionOpen, setIsLayerAccordionOpen] = useState(true);
  const [isSuggestionsAccordionOpen, setIsSuggestionsAccordionOpen] = useState(false);
  const [isESQLResultsAccordionOpen, setIsESQLResultsAccordionOpen] = useState(false);
  const [esqlQueryState, setESQLQueryState] = useState<TextBasedQueryState | null>(null);

  const { datasourceStates, visualization, isLoading, annotationGroups, searchSessionId } =
    useLensSelector((state) => state.lens);
  const hideTextBasedEditor = useLensSelector(selectHideTextBasedEditor);

  const activeVisualization =
    visualizationMap[visualization.activeId ?? attributes.visualizationType];

  const framePublicAPI = useLensSelector((state) => selectFramePublicAPI(state, datasourceMap));

  framePublicAPI.absDateRange = getAbsoluteDateRange(
    startDependencies.data.query.timefilter.timefilter
  );

  const dispatch = useLensDispatch();

  const attributesChanged = useMemo<boolean>(() => {
    if (isNewPanel) return true;

    const datasource = datasourceMap[datasourceId];

    const rawState = datasourceStates[datasourceId].state;
    const currentPersistable = rawState ? datasource.getPersistableState(rawState) : null;

    const previousAttrs = previousAttributes.current;
    const previousDsState = previousAttrs.state.datasourceStates[datasourceId];
    // Only textBased stores private state (e.g. indexPatternRefs) in attributes; normalize to persistable for comparison.
    // formBased attributes are already persistable and getPersistableState expects private state.
    let previousPersistable: typeof currentPersistable = null;
    if (previousDsState) {
      previousPersistable =
        datasourceId === LENS_DATASOURCE_ID.TEXT_BASED
          ? datasource.getPersistableState(previousDsState)
          : {
              state: previousDsState,
              references: previousAttrs.references,
            };
    }

    const datasourceStatesAreSame =
      currentPersistable != null &&
      previousPersistable != null &&
      datasource.isEqual(
        previousPersistable.state,
        previousPersistable.references,
        currentPersistable.state,
        currentPersistable.references
      );

    if (!datasourceStatesAreSame) return true;

    const visualizationState = visualization.state;
    const customIsEqual = visualizationMap[previousAttrs.visualizationType]?.isEqual;
    const visualizationStateIsEqual = customIsEqual
      ? (() => {
          try {
            return customIsEqual(
              previousAttrs.state.visualization,
              previousAttrs.references,
              visualizationState,
              attributes.references,
              annotationGroups
            );
          } catch (err) {
            return false;
          }
        })()
      : isEqual(visualizationState, previousAttrs.state.visualization);

    return !visualizationStateIsEqual;
  }, [
    datasourceStates,
    datasourceId,
    datasourceMap,
    attributes.references,
    visualization.state,
    isNewPanel,
    visualizationMap,
    annotationGroups,
  ]);

  const onCancel = useCallback(() => {
    setIsInlineFlyoutVisible(false);
    const previousAttrs = previousAttributes.current;
    if (attributesChanged) {
      // Use the datasourceId from the previous attributes, not the current one
      // This is important when canceling after a datasource conversion (e.g., formBased -> textBased)
      const previousDatasourceId = getActiveDatasourceIdFromDoc(previousAttrs) as LensDatasourceId;
      if (previousAttrs.visualizationType === visualization.activeId) {
        const currentDatasourceState = datasourceMap[previousDatasourceId].injectReferencesToLayers
          ? datasourceMap[previousDatasourceId]?.injectReferencesToLayers?.(
              previousAttrs.state.datasourceStates[previousDatasourceId],
              previousAttrs.references
            )
          : previousAttrs.state.datasourceStates[previousDatasourceId];
        // restore every datasource state from the previous attributes, not only the
        // active one, so non-active loaded states are not dropped on cancel
        const allPreviousDatasourceStates: DatasourceStates = Object.fromEntries(
          Object.entries(previousAttrs.state.datasourceStates).map(([id, state]) => [
            id,
            {
              isLoading: false,
              state:
                datasourceMap[id as LensDatasourceId]?.injectReferencesToLayers?.(
                  state,
                  previousAttrs.references
                ) ?? state,
            },
          ])
        );
        updatePanelState?.(
          currentDatasourceState,
          previousAttrs.state.visualization,
          undefined,
          previousDatasourceId,
          allPreviousDatasourceStates
        );
      } else {
        updateSuggestion?.(previousAttrs);
      }
      if (savedObjectId) {
        updateByRefInput?.(savedObjectId, previousAttrs);
      }
    }
    // Remove the user's preferred chart type from localStorage
    deleteUserChartTypeFromSessionStorage();
    onCancelCallback?.();
    closeFlyout?.();
  }, [
    attributesChanged,
    closeFlyout,
    visualization.activeId,
    savedObjectId,
    datasourceMap,
    updatePanelState,
    updateSuggestion,
    updateByRefInput,
    onCancelCallback,
  ]);

  const textBasedMode = isTextBasedAttributes(attributes);

  const currentAttributes: TypedLensSerializedState['attributes'] | undefined =
    useCurrentAttributes({
      initialAttributes: attributes,
    });

  const onTextBasedQueryStateChange = useCallback((state: TextBasedQueryState) => {
    setESQLQueryState(state);
  }, []);

  const onApply = useCallback(async () => {
    if (visualization.activeId == null || !currentAttributes) {
      return;
    }

    let attributesToSave: TypedLensSerializedState['attributes'];
    try {
      // Run the apply callback first so auto-save operations (e.g. linked annotations)
      // complete before the visualization is persisted via saveByRef.
      const updatedAttributes = await onApplyCallback?.(currentAttributes);
      attributesToSave = updatedAttributes ?? currentAttributes;
    } catch (err) {
      coreStart.notifications.toasts.addError(err instanceof Error ? err : new Error(String(err)), {
        title: i18n.translate('xpack.lens.config.applyError', {
          defaultMessage: 'Failed to apply changes',
        }),
      });
      return;
    }

    if (savedObjectId) {
      const serializedAttrs = serializeVisualizationToSave(attributesToSave, activeVisualization);
      saveByRef?.(serializedAttrs);
      updateByRefInput?.(savedObjectId, attributesToSave);
    }

    // check if visualization type changed, if it did, don't pass the previous visualization state
    const prevVisState =
      previousAttributes.current.visualizationType === visualization.activeId
        ? previousAttributes.current.state.visualization
        : undefined;
    const telemetryEvents = activeVisualization.getTelemetryEventsOnSave?.(
      visualization.state,
      prevVisState
    );
    if (telemetryEvents && telemetryEvents.length) {
      trackSaveUiCounterEvents(telemetryEvents);
    }

    deleteUserChartTypeFromSessionStorage();
    closeFlyout?.();
  }, [
    visualization.activeId,
    savedObjectId,
    closeFlyout,
    onApplyCallback,
    visualization.state,
    activeVisualization,
    currentAttributes,
    coreStart.notifications.toasts,
    saveByRef,
    updateByRefInput,
  ]);

  const { getUserMessages } = useApplicationUserMessages({
    coreStart,
    framePublicAPI,
    activeDatasourceId: datasourceId,
    datasourceState: datasourceStates[datasourceId],
    datasource: datasourceMap[datasourceId],
    dispatch,
    visualization: activeVisualization,
    visualizationType: visualization.activeId,
    visualizationState: visualization,
  });

  const editorContainer = useRef(null);

  const isSaveable = useMemo(() => {
    if (!attributesChanged) {
      return false;
    }
    if (!visualization.state || !visualization.activeId) {
      return false;
    }
    // For text-based mode, check if query has been successfully concluded (no runtime errors, and not pending)
    if (textBasedMode && esqlQueryState) {
      if (esqlQueryState.hasErrors || esqlQueryState.isQueryPendingSubmit) {
        return false;
      }
    }
    const visualizationErrors = getUserMessages(['visualization'], {
      severity: 'error',
    });
    // shouldn't build expression if there is any type of error other than an expression build error
    // (in which case we try again every time because the config might have changed)
    if (visualizationErrors.every((error) => error.uniqueId === EXPRESSION_BUILD_ERROR_ID)) {
      return Boolean(
        buildExpression({
          visualization: activeVisualization,
          visualizationState: visualization.state,
          datasourceMap,
          datasourceStates,
          datasourceLayers: framePublicAPI.datasourceLayers,
          indexPatterns: framePublicAPI.dataViews.indexPatterns,
          dateRange: framePublicAPI.dateRange,
          nowInstant: startDependencies.data.nowProvider.get(),
          searchSessionId,
        })
      );
    }
  }, [
    attributesChanged,
    activeVisualization,
    datasourceMap,
    datasourceStates,
    framePublicAPI.dataViews.indexPatterns,
    framePublicAPI.dateRange,
    framePublicAPI.datasourceLayers,
    searchSessionId,
    startDependencies.data.nowProvider,
    visualization.activeId,
    visualization.state,
    getUserMessages,
    textBasedMode,
    esqlQueryState,
  ]);

  // Tooltip message when Apply button is disabled due to an unrun ES|QL query
  const applyButtonDisabledTooltip = useMemo(() => {
    if (textBasedMode && esqlQueryState?.isQueryPendingSubmit) {
      return i18n.translate('xpack.lens.config.applyFlyoutRunQueryTooltip', {
        defaultMessage: 'Run the ES|QL query to apply changes',
      });
    }
    return undefined;
  }, [textBasedMode, esqlQueryState?.isQueryPendingSubmit]);

  const addLayerButton = useAddLayerButton(
    framePublicAPI,
    coreStart,
    startDependencies.dataViews,
    startDependencies.uiActions,
    setIsInlineFlyoutVisible
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === keys.ESCAPE) {
      onCancel();
    }
  };

  const layerIds = useMemo(() => {
    return activeVisualization && visualization.state
      ? activeVisualization.getLayerIds(visualization.state)
      : [];
  }, [activeVisualization, visualization.state]);

  const showConvertToEsqlButton = useMemo(() => {
    return getLensFeatureFlags().enableEsqlConversion && !textBasedMode;
  }, [textBasedMode]);

  const {
    isConvertToEsqlButtonDisabled,
    convertToEsqlButtonTooltip,
    convertibleLayers,
    attributes: esqlConvertAttributes,
  } = useEsqlConversionCheck(
    showConvertToEsqlButton,
    { attributes: currentAttributes, datasourceId, layerIds, visualization, activeVisualization },
    { framePublicAPI, coreStart, startDependencies }
  );

  const [isModalVisible, setIsModalVisible] = useState(false);

  const closeModal = useCallback(() => setIsModalVisible(false), []);
  const showModal = useCallback(() => setIsModalVisible(true), []);

  const handleConvertToEsql = useCallback(() => {
    closeModal();

    // This is just to satisfy TS, in practice we don't make the handler available
    // unless esqlConvertAttributes is defined
    if (!esqlConvertAttributes) return;

    // Update local attributes state - this triggers re-render of get_edit_lens_configuration
    // which will derive the new datasourceId (LENS_DATASOURCE_ID.TEXT_BASED) from the updated attributes
    // and recreate the Redux store with the correct datasource
    setCurrentAttributes?.(esqlConvertAttributes);

    // Also update the embeddable's attributes for persistence
    updateSuggestion?.(esqlConvertAttributes);
  }, [closeModal, setCurrentAttributes, updateSuggestion, esqlConvertAttributes]);

  if (isLoading) return null;

  const toolbar = (
    <>
      <EuiFlexItem grow={false} data-test-subj="lnsVisualizationToolbar">
        <VisualizationToolbarWrapper framePublicAPI={framePublicAPI} isInlineEditing={true} />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>{addLayerButton}</EuiFlexItem>
      {showConvertToEsqlButton ? (
        <EuiFlexItem grow={false}>
          <EuiToolTip position="top" content={convertToEsqlButtonTooltip}>
            <EuiButtonIcon
              color="success"
              display="base"
              size="s"
              iconType="code"
              aria-label={i18n.translate('xpack.lens.config.convertToEsqlLabel', {
                defaultMessage: 'Convert to ES|QL',
              })}
              isDisabled={isConvertToEsqlButtonDisabled}
              onClick={() => {
                showModal();
              }}
            />
          </EuiToolTip>
        </EuiFlexItem>
      ) : null}
    </>
  );

  const layerTabs = (
    <LayerTabsWrapper
      attributes={attributes}
      coreStart={coreStart}
      uiActions={startDependencies.uiActions}
      framePublicAPI={framePublicAPI}
    />
  );

  // Example is the Discover editing where we dont want to render the text based editor on the panel, neither the suggestions (for now)
  if (hideTextBasedEditor && hidesSuggestions) {
    return (
      <>
        {isInlineFlyoutVisible && <EuiWindowEvent event="keydown" handler={onKeyDown} />}

        <FlyoutWrapper
          isInlineFlyoutVisible={isInlineFlyoutVisible}
          displayFlyoutHeader={displayFlyoutHeader}
          onCancel={onCancel}
          navigateToLensEditor={navigateToLensEditor}
          onApply={onApply}
          isScrollable
          isSaveable={isSaveable}
          isReadOnly={isReadOnly}
          applyButtonLabel={applyButtonLabel}
          applyButtonDisabledTooltip={applyButtonDisabledTooltip}
          toolbar={toolbar}
          layerTabs={layerTabs}
        >
          <LayerConfiguration
            // TODO: remove this once we support switching to any chart in Discover
            onlyAllowSwitchToSubtypes
            getUserMessages={getUserMessages}
            attributes={attributes}
            coreStart={coreStart}
            startDependencies={startDependencies}
            hasPadding
            framePublicAPI={framePublicAPI}
            setIsInlineFlyoutVisible={setIsInlineFlyoutVisible}
            updateSuggestion={updateSuggestion}
            setCurrentAttributes={setCurrentAttributes}
            closeFlyout={closeFlyout}
            parentApi={parentApi}
            panelId={panelId}
            onTextBasedQueryStateChange={onTextBasedQueryStateChange}
          />
        </FlyoutWrapper>
      </>
    );
  }

  return (
    <>
      {isInlineFlyoutVisible && <EuiWindowEvent event="keydown" handler={onKeyDown} />}
      <FlyoutWrapper
        isInlineFlyoutVisible={isInlineFlyoutVisible}
        displayFlyoutHeader={displayFlyoutHeader}
        onCancel={onCancel}
        navigateToLensEditor={navigateToLensEditor}
        onApply={onApply}
        isSaveable={isSaveable}
        isScrollable
        isReadOnly={isReadOnly}
        applyButtonLabel={applyButtonLabel}
        applyButtonDisabledTooltip={applyButtonDisabledTooltip}
        toolbar={toolbar}
        layerTabs={layerTabs}
      >
        <>
          {/* Flex container for the flyout content layout.
              Enables proper scroll behavior where accordion headers stay fixed
              and only the accordion content areas scroll independently. */}
          <EuiFlexGroup
            css={css`
              block-size: 100%;
              /* Reset min-block-size to allow flex items to shrink below content size */
              .euiFlexItem,
              .euiAccordion,
              .euiAccordion__triggerWrapper,
              .euiAccordion__childWrapper {
                min-block-size: 0;
              }
              /* Make accordions flex containers to enable content scrolling */
              .euiAccordion {
                display: flex;
                flex: 1;
                flex-direction: column;
              }
              /* When accordion is open, its content area takes remaining space */
              .euiAccordion-isOpen {
                .euiAccordion__childWrapper {
                  // Override euiAccordion__childWrapper blockSize only when ES|QL mode is enabled
                  block-size: auto ${textBasedMode ? '!important' : ''};
                  flex: 1;
                }
              }
              /* Scrollable accordion content area with custom scrollbar styling.
                 pointer-events handling allows drag-drop to work outside content bounds. */
              .euiAccordion__childWrapper {
                ${euiScrollBarStyles(euiTheme)}
                overflow-y: auto !important;
                pointer-events: none;

                padding-left: ${euiTheme.euiTheme.components.forms.maxWidth};
                margin-left: -${euiTheme.euiTheme.components.forms.maxWidth};
                > * {
                  pointer-events: auto;
                }
              }
              /* Advanced options nested accordion should not scroll independently */
              .lnsIndexPatternDimensionEditor-advancedOptions {
                .euiAccordion__childWrapper {
                  flex: none;
                  overflow: hidden !important;
                }
              }
            `}
            direction="column"
            gutterSize="none"
          >
            {/* Container for ES|QL editor - fixed height, doesn't grow */}
            <EuiFlexItem grow={false}>
              <EuiFlexGroup
                css={css`
                  > * {
                    flex-grow: 0;
                  }
                `}
                gutterSize="none"
                direction="column"
                ref={editorContainer}
              />
            </EuiFlexItem>
            {/* Visualization parameters accordion - grows when open to fill available space */}
            <EuiFlexItem
              grow={isLayerAccordionOpen ? 1 : false}
              css={css`
                .euiAccordion__childWrapper {
                  flex: ${isLayerAccordionOpen ? 1 : 'none'};
                }
                padding: 0 ${euiTheme.euiTheme.size.base};
              `}
            >
              <EuiAccordion
                id="layer-configuration"
                buttonContent={
                  <EuiTitle
                    size="xxs"
                    css={css`
                      padding: 2px;
                    `}
                  >
                    <h5>
                      {i18n.translate('xpack.lens.config.visualizationConfigurationLabel', {
                        defaultMessage: 'Visualization parameters',
                      })}
                    </h5>
                  </EuiTitle>
                }
                buttonProps={{
                  paddingSize: 'm',
                }}
                initialIsOpen={isLayerAccordionOpen}
                forceState={isLayerAccordionOpen ? 'open' : 'closed'}
                onToggle={(status) => {
                  if (status && isSuggestionsAccordionOpen) {
                    setIsSuggestionsAccordionOpen(!status);
                  }
                  if (status && isESQLResultsAccordionOpen) {
                    setIsESQLResultsAccordionOpen(!status);
                  }
                  setIsLayerAccordionOpen(!isLayerAccordionOpen);
                }}
              >
                <>
                  <LayerConfiguration
                    attributes={attributes}
                    dataLoading$={dataLoading$}
                    lensAdapters={lensAdapters}
                    getUserMessages={getUserMessages}
                    coreStart={coreStart}
                    startDependencies={startDependencies}
                    framePublicAPI={framePublicAPI}
                    setIsInlineFlyoutVisible={setIsInlineFlyoutVisible}
                    updateSuggestion={updateSuggestion}
                    setCurrentAttributes={setCurrentAttributes}
                    closeFlyout={closeFlyout}
                    parentApi={parentApi}
                    panelId={panelId}
                    editorContainer={editorContainer.current || undefined}
                    onTextBasedQueryStateChange={onTextBasedQueryStateChange}
                  />
                </>
              </EuiAccordion>
            </EuiFlexItem>

            <EuiFlexItem
              grow={isSuggestionsAccordionOpen ? 1 : false}
              data-test-subj="InlineEditingSuggestions"
              css={css`
                border-top: ${euiTheme.euiTheme.border.thin};
                border-bottom: ${euiTheme.euiTheme.border.thin};
                padding-left: ${euiTheme.euiTheme.size.base};
                padding-right: ${euiTheme.euiTheme.size.base};
                .euiAccordion__childWrapper {
                  flex: ${isSuggestionsAccordionOpen ? 1 : 'none'};
                }
              `}
            >
              <SuggestionPanel
                ExpressionRenderer={startDependencies.expressions.ReactExpressionRenderer}
                frame={framePublicAPI}
                core={coreStart}
                nowProvider={startDependencies.data.nowProvider}
                showOnlyIcons
                wrapSuggestions
                isAccordionOpen={isSuggestionsAccordionOpen}
                toggleAccordionCb={(status) => {
                  if (!status && isLayerAccordionOpen) {
                    setIsLayerAccordionOpen(status);
                  }
                  if (status && isESQLResultsAccordionOpen) {
                    setIsESQLResultsAccordionOpen(!status);
                  }
                  setIsSuggestionsAccordionOpen(!isSuggestionsAccordionOpen);
                }}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          {isModalVisible && esqlConvertAttributes ? (
            <ConvertToEsqlModal
              layers={convertibleLayers}
              onCancel={closeModal}
              onConfirm={handleConvertToEsql}
            />
          ) : null}
        </>
      </FlyoutWrapper>
    </>
  );
}
