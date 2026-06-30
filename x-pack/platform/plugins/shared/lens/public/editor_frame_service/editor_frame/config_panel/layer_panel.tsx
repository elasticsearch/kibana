/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LensDatasourceId } from '@kbn/lens-common';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { EMPTY } from 'rxjs';
import { useObservable } from '@kbn/use-observable';
import {
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiText,
  EuiIconTip,
  EuiButtonIcon,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { BehaviorSubject } from 'rxjs';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import type { DragDropIdentifier, DropType } from '@kbn/dom-drag-drop';
import { ReorderProvider } from '@kbn/dom-drag-drop';
import { DimensionButton } from '@kbn/visualization-ui-components';
import { useStateFromPublishingSubject } from '@kbn/presentation-publishing';
import { apiPublishesApproximation } from '@kbn/presentation-publishing';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { apiPublishesESQLVariables } from '@kbn/esql-types';
import type { VisualizationDimensionGroupConfig } from '@kbn/lens-common';
import { getTabIdAttribute } from '@kbn/unified-tabs';
import { isOperation } from '../../../types_guards';
import { LayerHeader } from './layer_header';
import type { LayerPanelProps } from './types';
import { DimensionContainer } from './dimension_container';
import { EmptyDimensionButton } from './buttons/empty_dimension_button';
import { DraggableDimensionButton } from './buttons/draggable_dimension_button';
import { useFocusUpdate } from './use_focus_update';
import {
  useLensSelector,
  useLensDispatch,
  onActiveDataChange,
  selectCanEditTextBasedQuery,
  selectIsFullscreenDatasource,
  selectResolvedDateRange,
  selectDatasourceStates,
} from '../../../state_management';
import { getActiveDataFromDatatable } from '../../../state_management/shared_logic';
import { FlyoutContainer } from '../../../shared_components/flyout_container';
import { LENS_LAYER_TABS_CONTENT_ID } from '../../../app_plugin/shared/edit_on_the_fly/layer_tabs';
import { FakeDimensionButton } from './buttons/fake_dimension_button';
import { getLongMessage } from '../../../user_messages_utils';
import { ESQLEditor } from './esql_editor';
import { useEditorFrameService } from '../../editor_frame_service_context';
import { getOpenLayerSettingsAction } from './layer_actions/open_layer_settings';
import { getRemoveLayerAction } from './layer_actions/remove_layer_action';
import { getCloneLayerAction } from './layer_actions/clone_layer_action';

export function LayerPanel(props: LayerPanelProps) {
  const { datasourceMap } = useEditorFrameService();

  const [openDimension, setOpenDimension] = useState<{
    isComplete?: boolean;
    openColumnId?: string;
    openColumnGroup?: VisualizationDimensionGroupConfig;
  }>({});

  const [isPanelSettingsOpen, setPanelSettingsOpen] = useState(false);
  const { euiTheme } = useEuiTheme();

  const {
    framePublicAPI,
    layerId,
    isOnlyLayer,
    dimensionGroups,
    onRemoveLayer,
    onCloneLayer,
    layerIndex,
    activeVisualization,
    updateVisualization,
    updateDatasource,
    toggleFullscreen,
    updateAll,
    updateDatasourceAsync,
    visualizationState,
    onChangeIndexPattern,
    core,
    onDropToDimension,
    setIsInlineFlyoutVisible,
    onlyAllowSwitchToSubtypes,
    ...editorProps
  } = props;

  const { parentApi } = editorProps;
  const esqlVariables = useStateFromPublishingSubject(
    apiPublishesESQLVariables(parentApi)
      ? parentApi?.esqlVariables$
      : new BehaviorSubject(undefined)
  );
  const useApproximation = useStateFromPublishingSubject(
    apiPublishesApproximation(parentApi)
      ? parentApi?.useApproximation$
      : new BehaviorSubject(undefined)
  );

  const isInlineEditing = Boolean(props?.setIsInlineFlyoutVisible);

  const datasourceStates = useLensSelector(selectDatasourceStates);
  const canEditTextBasedQuery = useLensSelector(selectCanEditTextBasedQuery);
  const isFullscreen = useLensSelector(selectIsFullscreenDatasource);
  const dateRange = useLensSelector(selectResolvedDateRange);
  const dispatch = useLensDispatch();

  // Sync the chart's finished-loading data into Redux so that downstream consumers
  // (e.g. color mapping term lists) always have access to activeData.
  // The default layer id mirrors WorkspacePanel#onData$ so the safety-net dispatch agrees
  // with the canonical one on how single-table adapter output is keyed, and avoids
  // re-keying the previous layer's table under the currently selected tab's layerId.
  const isDataLoading = useObservable(editorProps.dataLoading$ ?? EMPTY);
  const lensAdaptersRef = useRef(editorProps.lensAdapters);
  lensAdaptersRef.current = editorProps.lensAdapters;
  const [defaultLayerId] = Object.keys(framePublicAPI.datasourceLayers ?? {});

  useEffect(() => {
    if (isDataLoading !== false || !defaultLayerId) return;
    const activeData = getActiveDataFromDatatable(
      defaultLayerId,
      lensAdaptersRef.current?.tables?.tables
    );
    if (Object.keys(activeData).length > 0) {
      dispatch(onActiveDataChange({ activeData }));
    }
  }, [isDataLoading, dispatch, defaultLayerId]);

  useEffect(() => {
    // is undefined when the dimension panel is closed
    setIsInlineFlyoutVisible?.(!openDimension.openColumnId);
  }, [openDimension.openColumnId, setIsInlineFlyoutVisible]);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);

  const closeDimensionEditor = () => {
    if (layerDatasource) {
      if (layerDatasource.updateStateOnCloseDimension) {
        const newState = layerDatasource.updateStateOnCloseDimension({
          state: layerDatasourceState,
          layerId,
          columnId: openColumnId!,
        });
        if (newState) {
          props.updateDatasource(datasourceId, newState);
        }
      }
    }

    setOpenDimension({});
    if (isFullscreen) {
      toggleFullscreen();
    }
  };

  const layerVisualizationConfigProps = {
    layerId,
    state: props.visualizationState,
    frame: props.framePublicAPI,
    dateRange,
    activeData: props.framePublicAPI.activeData,
  };

  const datasourcePublicAPI = framePublicAPI.datasourceLayers?.[layerId];
  const datasourceId = datasourcePublicAPI?.datasourceId! as LensDatasourceId;
  let layerDatasourceState = datasourceStates?.[datasourceId]?.state;
  // try again with aliases
  if (!layerDatasourceState && datasourcePublicAPI?.datasourceAliasIds && datasourceStates) {
    const aliasId = datasourcePublicAPI.datasourceAliasIds.find(
      (id) => datasourceStates?.[id]?.state
    );
    if (aliasId) {
      layerDatasourceState = datasourceStates[aliasId].state;
    }
  }
  const layerDatasource = datasourceId ? datasourceMap[datasourceId] : undefined;

  const layerDatasourceConfigProps = {
    state: layerDatasourceState,
    setState: (newState: unknown) => {
      updateDatasource(datasourceId, newState);
    },
    layerId,
    frame: props.framePublicAPI,
    dateRange,
  };

  const columnLabelMap =
    !layerDatasource && activeVisualization.getUniqueLabels
      ? activeVisualization.getUniqueLabels(props.visualizationState)
      : layerDatasource?.uniqueLabels?.(
          layerDatasourceConfigProps?.state,
          framePublicAPI.dataViews.indexPatterns
        );

  const isEmptyLayer = !dimensionGroups.some((d) => d.accessors.length > 0);
  const { openColumnId, openColumnGroup, isComplete } = openDimension;

  useEffect(() => {
    if (!openColumnId) {
      return;
    }

    const derivedOpenColumnGroup = dimensionGroups.find((group) =>
      group.accessors.some((a) => a.columnId === openColumnId)
    );
    // dont update if nothing has changed
    if (
      isComplete === !!derivedOpenColumnGroup &&
      derivedOpenColumnGroup?.groupId === openColumnGroup?.groupId
    ) {
      return;
    }
    if (derivedOpenColumnGroup) {
      // if column is found, mark it as complete. If it's moved to another group, update the group
      setOpenDimension({
        openColumnId,
        openColumnGroup: derivedOpenColumnGroup,
        isComplete: !!derivedOpenColumnGroup,
      });
    }
    // if column is not found but is not new (is complete), close the dimension panel
    if (isComplete && !derivedOpenColumnGroup) {
      setOpenDimension({});
    }
  }, [openColumnId, dimensionGroups, isComplete, openColumnGroup?.groupId]);

  const allAccessors = dimensionGroups.flatMap((group) =>
    group.accessors.map((accessor) => accessor.columnId)
  );

  const {
    setNextFocusedId: setNextFocusedButtonId,
    removeRef: removeButtonRef,
    registerNewRef: registerNewButtonRef,
  } = useFocusUpdate(allAccessors);

  const onDrop = useCallback(
    (source: DragDropIdentifier, target: DragDropIdentifier, dropType?: DropType) => {
      if (!dropType) {
        return;
      }
      if (!isOperation(target)) {
        throw new Error('Drop target should be an operation');
      }

      if (dropType === 'reorder' || dropType === 'field_replace' || dropType === 'field_add') {
        setNextFocusedButtonId(source.id);
      } else {
        setNextFocusedButtonId(target.columnId);
      }

      onDropToDimension({ source, target, dropType });
    },
    [setNextFocusedButtonId, onDropToDimension]
  );

  const isDimensionPanelOpen = Boolean(openColumnId);

  const updateDataLayerState = useCallback(
    (
      newState: unknown,
      {
        isDimensionComplete = true,
        // this flag is a hack to force a sync render where it was planned an async/setTimeout state update
        // TODO: revisit this once we get rid of updateDatasourceAsync upstream
        forceRender = false,
      }: { isDimensionComplete?: boolean; forceRender?: boolean } = {}
    ) => {
      if (!openColumnGroup || !openColumnId) {
        return;
      }
      if (allAccessors.includes(openColumnId)) {
        if (isDimensionComplete) {
          if (forceRender) {
            updateDatasource(datasourceId, newState);
          } else {
            updateDatasourceAsync(datasourceId, newState);
          }
        } else {
          // The datasource can indicate that the previously-valid column is no longer
          // complete, which clears the visualization. This keeps the flyout open and reuses
          // the previous columnId
          props.updateDatasource(datasourceId, newState);
          props.onRemoveDimension({ layerId, columnId: openColumnId });
        }
      } else if (isDimensionComplete) {
        updateAll({
          datasourceId,
          newDatasourceState: newState,
          layerId,
          groupId: openColumnGroup.groupId,
          columnId: openColumnId,
        });
      } else {
        if (forceRender) {
          updateDatasource(datasourceId, newState);
        } else {
          updateDatasourceAsync(datasourceId, newState);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      openDimension,
      openColumnGroup,
      openColumnId,
      activeVisualization,
      datasourceId,
      layerId,
      updateAll,
      updateDatasourceAsync,
    ]
  );

  const { dataViews } = props.framePublicAPI;
  const [datasource] = Object.values(framePublicAPI.datasourceLayers);
  const isTextBasedLanguage =
    datasource?.isTextBasedLanguage() ||
    isOfAggregateQueryType(editorProps.attributes?.state.query) ||
    false;
  const shouldRenderESQLEditor =
    isTextBasedLanguage &&
    canEditTextBasedQuery &&
    isOfAggregateQueryType(editorProps.attributes?.state.query);

  const visualizationLayerSettings = useMemo(
    () =>
      activeVisualization.hasLayerSettings?.({
        layerId,
        state: visualizationState,
        frame: props.framePublicAPI,
      }) || { data: false, appearance: false },
    [activeVisualization, layerId, props.framePublicAPI, visualizationState]
  );

  const hasLayerSettings = Boolean(
    (Object.values(visualizationLayerSettings).some(Boolean) &&
      activeVisualization.LayerSettingsComponent) ||
      layerDatasource?.LayerSettingsComponent
  );

  const layerSettingsAction = useMemo(
    () =>
      getOpenLayerSettingsAction({
        openLayerSettings: () => setPanelSettingsOpen(true),
        hasLayerSettings,
      }),
    [hasLayerSettings]
  );

  const layerActions = useMemo(() => {
    // Only show clear layer button for single layer visualizations
    // or if it's the only layer in a multi-layer visualization.
    if (!isOnlyLayer) {
      return null;
    }

    const layerType = activeVisualization.getLayerType(layerId, visualizationState);

    const removeLayerAction = getRemoveLayerAction({
      execute: () => onRemoveLayer(layerId),
      layerIndex,
      layerType,
      isOnlyLayer: true,
      core,
      customModalText: activeVisualization.getCustomRemoveLayerText?.(layerId, visualizationState),
    });

    const cloneLayerAction = getCloneLayerAction({
      execute: onCloneLayer,
      layerIndex,
      activeVisualization,
      isTextBasedLanguage,
    });

    return { removeLayerAction, cloneLayerAction };
  }, [
    activeVisualization,
    isOnlyLayer,
    layerId,
    visualizationState,
    layerIndex,
    core,
    onRemoveLayer,
    onCloneLayer,
    isTextBasedLanguage,
  ]);

  const supportsMultipleLayers = useMemo(
    () => Boolean(activeVisualization.getAddLayerButtonComponent),
    [activeVisualization]
  );

  return (
    <>
      <section
        tabIndex={-1}
        css={css`
          margin-bottom: ${euiTheme.size.base};
          // disable focus ring - this is a container element that receives programmatic focus
          // for screen reader announcements, not an interactive element
          &:focus {
            outline: none;
          }
        `}
        data-test-subj={`lns-layerPanel-${layerIndex}`}
        id={LENS_LAYER_TABS_CONTENT_ID}
        role="tabpanel"
        aria-labelledby={getTabIdAttribute({
          id: layerId,
          label: 'tab item',
        })}
      >
        <div>
          <header
            className="lnsLayerPanel__layerHeader"
            css={css`
              padding: 0 0 ${euiTheme.size.base} 0;
              border-bottom: ${euiTheme.border.thin};
            `}
          >
            <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
              <EuiFlexItem
                grow
                css={css`
                  min-width: 0; // fixes truncation for too long chart switcher labels
                `}
              >
                <LayerHeader
                  layerConfigProps={{
                    ...layerVisualizationConfigProps,
                    setState: props.updateVisualization,
                    onChangeIndexPattern: (indexPatternId) =>
                      onChangeIndexPattern({
                        indexPatternId,
                        layerId,
                        visualizationId: activeVisualization.id,
                      }),
                  }}
                  activeVisualizationId={activeVisualization.id}
                  onlyAllowSwitchToSubtypes={onlyAllowSwitchToSubtypes}
                />
              </EuiFlexItem>
              {props.displayLayerSettings && layerSettingsAction.isCompatible && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={layerSettingsAction.displayName} disableScreenReaderOutput>
                    <EuiButtonIcon
                      iconType={layerSettingsAction.icon}
                      aria-label={layerSettingsAction.displayName}
                      onClick={() => layerSettingsAction.execute(null)}
                      data-test-subj={layerSettingsAction['data-test-subj']}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              )}
              {layerActions && (
                <>
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      content={layerActions.removeLayerAction.displayName}
                      disableScreenReaderOutput
                    >
                      <EuiButtonIcon
                        iconType={layerActions.removeLayerAction.icon}
                        color={layerActions.removeLayerAction.color}
                        aria-label={layerActions.removeLayerAction.displayName}
                        onClick={() => layerActions.removeLayerAction.execute(null)}
                        data-test-subj={layerActions.removeLayerAction['data-test-subj']}
                      />
                    </EuiToolTip>
                  </EuiFlexItem>
                  {supportsMultipleLayers && !isTextBasedLanguage ? (
                    <EuiFlexItem grow={false}>
                      <EuiToolTip
                        content={layerActions.cloneLayerAction.displayName}
                        disableScreenReaderOutput
                      >
                        <EuiButtonIcon
                          iconType={layerActions.cloneLayerAction.icon}
                          color={layerActions.cloneLayerAction.color}
                          aria-label={layerActions.cloneLayerAction.displayName}
                          onClick={() => layerActions.cloneLayerAction.execute(null)}
                          data-test-subj={layerActions.cloneLayerAction['data-test-subj']}
                        />
                      </EuiToolTip>
                    </EuiFlexItem>
                  ) : null}
                </>
              )}
            </EuiFlexGroup>
            {props.indexPatternService &&
              !isTextBasedLanguage &&
              (layerDatasource || activeVisualization.LayerPanelComponent) && (
                <EuiSpacer size="s" />
              )}
            {layerDatasource && props.indexPatternService && !isTextBasedLanguage && (
              <layerDatasource.LayerPanelComponent
                {...{
                  layerId,
                  state: layerDatasourceState,
                  activeData: props.framePublicAPI.activeData,
                  dataViews,
                  onChangeIndexPattern: (indexPatternId) =>
                    onChangeIndexPattern({ indexPatternId, layerId, datasourceId }),
                }}
              />
            )}
            {shouldRenderESQLEditor ? (
              <ESQLEditor
                uiSettings={core.uiSettings}
                http={core.http}
                isTextBasedLanguage={isTextBasedLanguage}
                framePublicAPI={framePublicAPI}
                layerId={layerId}
                {...editorProps}
              />
            ) : null}
            {activeVisualization.LayerPanelComponent && (
              <activeVisualization.LayerPanelComponent
                {...{
                  layerId,
                  state: visualizationState,
                  frame: framePublicAPI,
                  setState: props.updateVisualization,
                  onChangeIndexPattern: (indexPatternId) =>
                    onChangeIndexPattern({
                      indexPatternId,
                      layerId,
                      visualizationId: activeVisualization.id,
                    }),
                }}
              />
            )}
          </header>

          {dimensionGroups
            .filter((group) => !group.isHidden)
            .map((group, groupIndex) => {
              let errorText: string = '';

              if (!isEmptyLayer || isInlineEditing) {
                if (
                  group.requiredMinDimensionCount &&
                  group.requiredMinDimensionCount > group.accessors.length
                ) {
                  if (group.requiredMinDimensionCount > 1) {
                    errorText = i18n.translate(
                      'xpack.lens.editorFrame.requiresTwoOrMoreFieldsWarningLabel',
                      {
                        defaultMessage: 'Requires {requiredMinDimensionCount} fields',
                        values: {
                          requiredMinDimensionCount: group.requiredMinDimensionCount,
                        },
                      }
                    );
                  } else {
                    errorText = i18n.translate('xpack.lens.editorFrame.requiresFieldWarningLabel', {
                      defaultMessage: 'Requires field',
                    });
                  }
                } else if (group.dimensionsTooMany && group.dimensionsTooMany > 0) {
                  errorText = i18n.translate(
                    'xpack.lens.editorFrame.tooManyDimensionsSingularWarningLabel',
                    {
                      defaultMessage:
                        'Please remove {dimensionsTooMany, plural, one {a dimension} other {{dimensionsTooMany} dimensions}}',
                      values: {
                        dimensionsTooMany: group.dimensionsTooMany,
                      },
                    }
                  );
                }
              }
              const isOptional = !group.requiredMinDimensionCount && !group.suggestedValue;
              return (
                <EuiFormRow
                  css={css`
                    padding: ${euiTheme.size.base} 0;
                    &:last-child {
                      border-radius: 0 0 ${euiTheme.border.radius.medium}
                        ${euiTheme.border.radius.medium};
                    }

                    // Add border to the top of the next same panel
                    & + & {
                      border-top: ${euiTheme.border.thin};
                      margin-top: 0;
                    }

                    & > * {
                      margin-bottom: 0;
                    }

                    // Targeting EUI class as we are unable to apply a class to this element in component
                    &,
                    .euiFormRow__fieldWrapper {
                      & > * + * {
                        margin-top: ${euiTheme.size.s};
                      }
                    }
                  `}
                  className="lnsLayerPanel__row"
                  fullWidth
                  label={
                    <>
                      {group.groupLabel}
                      {group.groupTooltip && (
                        <>
                          <EuiIconTip
                            color="subdued"
                            content={group.groupTooltip}
                            iconProps={{
                              className: 'eui-alignTop',
                            }}
                            position="top"
                            size="s"
                            type="question"
                          />
                        </>
                      )}
                    </>
                  }
                  labelAppend={
                    isOptional ? (
                      <EuiText color="subdued" size="xs" data-test-subj="lnsGroup_optional">
                        {i18n.translate('xpack.lens.editorFrame.optionalDimensionLabel', {
                          defaultMessage: 'Optional',
                        })}
                      </EuiText>
                    ) : null
                  }
                  labelType="legend"
                  key={group.groupId}
                  isInvalid={Boolean(errorText)}
                  error={errorText}
                >
                  <>
                    {group.accessors.length ? (
                      <ReorderProvider
                        dataTestSubj="lnsDragDrop"
                        css={css`
                          margin: -${euiTheme.size.xs} 0;
                          padding: ${euiTheme.size.xs} 0;
                        `}
                      >
                        {group.accessors.map((accessorConfig, accessorIndex) => {
                          const { columnId } = accessorConfig;

                          const messages =
                            props?.getUserMessages?.('dimensionButton', {
                              dimensionId: columnId,
                            }) ?? [];
                          const firstMessage = messages.at(0);

                          return (
                            <DraggableDimensionButton
                              activeVisualization={activeVisualization}
                              registerNewButtonRef={registerNewButtonRef}
                              order={[2, layerIndex, groupIndex, accessorIndex]}
                              target={{
                                id: columnId,
                                layerId,
                                columnId,
                                groupId: group.groupId,
                                filterOperations: group.filterOperations,
                                prioritizedOperation: group.prioritizedOperation,
                                isMetricDimension: group?.isMetricDimension,
                                indexPatternId: layerDatasource
                                  ? layerDatasource.getUsedDataView(layerDatasourceState, layerId)
                                  : activeVisualization.getUsedDataView?.(
                                      visualizationState,
                                      layerId
                                    ),
                                humanData: {
                                  label: columnLabelMap?.[columnId] ?? '',
                                  groupLabel: group.groupLabel,
                                  position: accessorIndex + 1,
                                  layerNumber: layerIndex + 1,
                                },
                              }}
                              group={group}
                              key={columnId}
                              state={layerDatasourceState}
                              layerDatasource={layerDatasource}
                              datasourceLayers={framePublicAPI.datasourceLayers}
                              onDrop={onDrop}
                              indexPatterns={dataViews.indexPatterns}
                            >
                              <DimensionButton
                                accessorConfig={accessorConfig}
                                label={columnLabelMap?.[accessorConfig.columnId] ?? ''}
                                groupLabel={group.groupLabel}
                                onClick={(id: string) => {
                                  setOpenDimension({
                                    openColumnGroup: group,
                                    openColumnId: id,
                                  });
                                }}
                                onRemoveClick={(id: string) => {
                                  props.onRemoveDimension({ columnId: id, layerId });
                                  removeButtonRef(id);
                                }}
                                message={
                                  firstMessage
                                    ? {
                                        severity: firstMessage.severity,
                                        content:
                                          firstMessage.shortMessage || getLongMessage(firstMessage),
                                      }
                                    : undefined
                                }
                              >
                                {layerDatasource ? (
                                  <>
                                    {layerDatasource.DimensionTriggerComponent({
                                      ...layerDatasourceConfigProps,
                                      columnId: accessorConfig.columnId,
                                      groupId: group.groupId,
                                      filterOperations: group.filterOperations,
                                      indexPatterns: dataViews.indexPatterns,
                                    })}
                                  </>
                                ) : (
                                  <>
                                    {activeVisualization?.DimensionTriggerComponent?.({
                                      columnId,
                                      label: columnLabelMap?.[columnId] ?? '',
                                    })}
                                  </>
                                )}
                              </DimensionButton>
                            </DraggableDimensionButton>
                          );
                        })}
                      </ReorderProvider>
                    ) : null}

                    {group.fakeFinalAccessor && (
                      <FakeDimensionButton label={group.fakeFinalAccessor.label} />
                    )}

                    {group.supportsMoreColumns ? (
                      <EmptyDimensionButton
                        activeVisualization={activeVisualization}
                        order={[2, layerIndex, groupIndex, group.accessors.length]}
                        group={group}
                        target={{
                          layerId,
                          groupId: group.groupId,
                          filterOperations: group.filterOperations,
                          prioritizedOperation: group.prioritizedOperation,
                          isNewColumn: true,
                          isMetricDimension: group?.isMetricDimension,
                          indexPatternId: layerDatasource
                            ? layerDatasource.getUsedDataView(layerDatasourceState, layerId)
                            : activeVisualization.getUsedDataView?.(visualizationState, layerId),
                          humanData: {
                            groupLabel: group.groupLabel,
                            layerNumber: layerIndex + 1,
                            position: group.accessors.length + 1,
                            label: i18n.translate('xpack.lens.indexPattern.emptyDimensionButton', {
                              defaultMessage: 'Empty dimension',
                            }),
                          },
                        }}
                        layerDatasource={layerDatasource}
                        state={layerDatasourceState}
                        datasourceLayers={framePublicAPI.datasourceLayers}
                        onClick={(id) => {
                          props.onEmptyDimensionAdd(id, group);
                          setOpenDimension({
                            openColumnGroup: group,
                            openColumnId: id,
                          });
                        }}
                        onDrop={onDrop}
                        indexPatterns={dataViews.indexPatterns}
                        isInlineEditing={isInlineEditing}
                      />
                    ) : null}
                  </>
                </EuiFormRow>
              );
            })}
        </div>
      </section>
      {(layerDatasource?.LayerSettingsComponent || activeVisualization?.LayerSettingsComponent) && (
        <FlyoutContainer
          panelRef={(el) => (settingsPanelRef.current = el)}
          isFullscreen={false}
          label={i18n.translate('xpack.lens.editorFrame.layerSettingsTitle', {
            defaultMessage: 'Settings',
          })}
          isOpen={isPanelSettingsOpen}
          handleClose={() => {
            setPanelSettingsOpen(false);
          }}
          isInlineEditing={isInlineEditing}
        >
          <div id={layerId}>
            <div className="lnsIndexPatternDimensionEditor--padded">
              {layerDatasource?.LayerSettingsComponent || visualizationLayerSettings.data ? (
                <EuiText
                  size="s"
                  css={css`
                    margin-bottom: ${euiTheme.size.base};
                  `}
                >
                  <h4>
                    {i18n.translate('xpack.lens.editorFrame.layerSettings.headingData', {
                      defaultMessage: 'Data',
                    })}
                  </h4>
                </EuiText>
              ) : null}
              {layerDatasource?.LayerSettingsComponent && (
                <layerDatasource.LayerSettingsComponent {...layerDatasourceConfigProps} />
              )}
              {activeVisualization?.LayerSettingsComponent && visualizationLayerSettings.data ? (
                <activeVisualization.LayerSettingsComponent
                  {...{
                    ...layerVisualizationConfigProps,
                    setState: props.updateVisualization,
                    panelRef: settingsPanelRef,
                    section: 'data',
                  }}
                />
              ) : null}
              {visualizationLayerSettings.appearance ? (
                <EuiText
                  size="s"
                  css={css`
                    margin-bottom: ${euiTheme.size.base};
                  `}
                >
                  <h4>
                    {i18n.translate('xpack.lens.editorFrame.layerSettings.headingAppearance', {
                      defaultMessage: 'Appearance',
                    })}
                  </h4>
                </EuiText>
              ) : null}
              {activeVisualization?.LayerSettingsComponent && (
                <activeVisualization.LayerSettingsComponent
                  {...{
                    ...layerVisualizationConfigProps,
                    setState: props.updateVisualization,
                    panelRef: settingsPanelRef,
                    section: 'appearance',
                  }}
                />
              )}
            </div>
          </div>
        </FlyoutContainer>
      )}
      <DimensionContainer
        panelRef={(el) => (panelRef.current = el)}
        isOpen={isDimensionPanelOpen}
        isFullscreen={isFullscreen}
        label={openColumnGroup?.dimensionEditorGroupLabel ?? (openColumnGroup?.groupLabel || '')}
        isInlineEditing={isInlineEditing}
        handleClose={closeDimensionEditor}
        panel={
          <div>
            {openColumnGroup &&
              openColumnId &&
              layerDatasource &&
              layerDatasource.DimensionEditorComponent({
                ...layerDatasourceConfigProps,
                core: props.core,
                columnId: openColumnId,
                groupId: openColumnGroup.groupId,
                hideGrouping: openColumnGroup.hideGrouping,
                filterOperations: openColumnGroup.filterOperations,
                isMetricDimension: openColumnGroup?.isMetricDimension,
                dimensionGroups,
                toggleFullscreen,
                isFullscreen,
                setState: updateDataLayerState,
                supportStaticValue: Boolean(openColumnGroup.supportStaticValue),
                paramEditorCustomProps: openColumnGroup.paramEditorCustomProps,
                enableFormatSelector: openColumnGroup.enableFormatSelector !== false,
                layerType: activeVisualization.getLayerType(layerId, visualizationState),
                indexPatterns: dataViews.indexPatterns,
                activeData: layerVisualizationConfigProps.activeData,
                esqlVariables,
                useApproximation: useApproximation ?? undefined,
                dataSectionExtra: !isFullscreen &&
                  openDimension.isComplete &&
                  activeVisualization.DimensionEditorDataExtraComponent && (
                    <activeVisualization.DimensionEditorDataExtraComponent
                      {...{
                        ...layerVisualizationConfigProps,
                        groupId: openColumnGroup.groupId,
                        accessor: openColumnId,
                        datasource,
                        setState: props.updateVisualization,
                        addLayer: props.addLayer,
                        removeLayer: props.onRemoveLayer,
                        panelRef,
                      }}
                    />
                  ),
              })}
            {openColumnGroup &&
              openColumnId &&
              !isFullscreen &&
              openDimension.isComplete &&
              activeVisualization.DimensionEditorComponent &&
              openColumnGroup?.enableDimensionEditor && (
                <>
                  <activeVisualization.DimensionEditorComponent
                    {...{
                      ...layerVisualizationConfigProps,
                      groupId: openColumnGroup.groupId,
                      accessor: openColumnId,
                      datasource,
                      setState: props.updateVisualization,
                      addLayer: props.addLayer,
                      removeLayer: props.onRemoveLayer,
                      panelRef,
                      isInlineEditing,
                    }}
                  />
                  {activeVisualization.DimensionEditorAdditionalSectionComponent && (
                    <activeVisualization.DimensionEditorAdditionalSectionComponent
                      {...{
                        ...layerVisualizationConfigProps,
                        groupId: openColumnGroup.groupId,
                        accessor: openColumnId,
                        datasource,
                        setState: props.updateVisualization,
                        addLayer: props.addLayer,
                        removeLayer: props.onRemoveLayer,
                        panelRef,
                      }}
                    />
                  )}
                </>
              )}
          </div>
        }
      />
    </>
  );
}
