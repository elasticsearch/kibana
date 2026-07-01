/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useMemo, memo } from 'react';
import { i18n } from '@kbn/i18n';
import type {
  DatasourceMap,
  DatasourcePublicAPI,
  FormBasedPrivateState,
  FramePublicAPI,
  LensDocument,
  Visualization,
  VisualizationMap,
  VisualizationState,
  VisualizationType,
  DatasourceStates,
  Suggestion,
} from '@kbn/lens-common';
import { ExperimentalBadge } from '../../../../shared_components';
import { getSuggestions, switchToSuggestion } from '../../suggestion_helpers';
import { showMemoizedErrorNotification } from '../../../../lens_ui_errors';
import {
  insertLayer,
  removeLayers,
  updateDatasourceState,
  useLensDispatch,
  useLensSelector,
  selectActiveDatasourceId,
  selectVisualization,
  selectDatasourceStates,
  selectPersistedDoc,
} from '../../../../state_management';
import { applyVizTypeDatasourceDefaults } from '../../../../datasources/form_based/viz_type_defaults';
import { generateId } from '../../../../id_generator/id_generator';
import type { SelectableEntry } from './chart_switch_selectable';
import { ChartSwitchSelectable } from './chart_switch_selectable';
import { ChartSwitchOptionPrepend } from './chart_option';
import { useEditorFrameService } from '../../../editor_frame_service_context';

type VisChartSwitchPosition = VisualizationType & {
  visualizationId: string;
  selection: VisualizationSelection;
};

interface VisualizationSelection {
  visualizationId: string;
  subVisualizationId: string;
  getVisualizationState: () => unknown;
  keptLayerIds: string[];
  dataLoss: 'nothing' | 'layers' | 'everything' | 'columns';
  datasourceId?: string;
  datasourceState?: unknown;
  sameDatasources?: boolean;
}

export interface ChartSwitchProps {
  filteredVisualizationMap: VisualizationMap;
  framePublicAPI: FramePublicAPI;
  layerId: string;
  onChartSelect: () => void;
}

const sortByPriority = (a: VisualizationType, b: VisualizationType) => {
  return a.sortPriority - b.sortPriority;
};

const deprecatedGroupChartSwitchElement = {
  key: 'deprecated',
  value: 'deprecated',
  label: i18n.translate('xpack.lens.configPanel.deprecated', {
    defaultMessage: 'Deprecated',
  }),
  isGroupLabel: true,
  'aria-label': 'deprecated',
  'data-test-subj': `lnsChartSwitchPopover_deprecated`,
};

function safeFnCall<TReturn>(action: () => TReturn, defaultReturnValue: TReturn): TReturn {
  try {
    return action();
  } catch (error) {
    showMemoizedErrorNotification(error);
    return defaultReturnValue;
  }
}

export const ChartSwitch = memo(function ChartSwitch({
  filteredVisualizationMap,
  framePublicAPI,
  layerId,
  onChartSelect,
}: ChartSwitchProps) {
  const visualizationMap = filteredVisualizationMap;
  const { datasourceMap } = useEditorFrameService();
  const dispatchLens = useLensDispatch();
  const activeDatasourceId = useLensSelector(selectActiveDatasourceId);
  const visualization = useLensSelector(selectVisualization);
  const datasourceStates = useLensSelector(selectDatasourceStates);
  const persistedDoc = useLensSelector(selectPersistedDoc);

  const [searchTerm, setSearchTerm] = useState('');

  const commitSelection = (selection: VisualizationSelection) => {
    const newVisualizationState = selection.getVisualizationState();
    const targetVisualizationTypeId = getVisualizationTypeId(
      visualizationMap[selection.visualizationId],
      newVisualizationState,
      layerId
    );
    const getPersistedVisualizationTypeId = (lId: string) =>
      getPersistedLayerVisualizationTypeId(persistedDoc, visualizationMap, lId);

    // Intentional `as FormBasedPrivateState` type assertion as the editor frame stores datasource state opaquely (`DatasourceState['state']` is `unknown`); `applyVizTypeDatasourceDefaults` re-checks `datasourceId === formBased` before touching it.
    const selectionDatasourceState = selection.datasourceState as FormBasedPrivateState | undefined;

    switchToSuggestion(
      dispatchLens,
      {
        ...selection,
        visualizationState: newVisualizationState,
        // A cross-visualization switch carries new datasource state; reconcile
        // it with the target visualization type's defaults.
        datasourceState: selectionDatasourceState
          ? applyVizTypeDatasourceDefaults({
              kind: 'typeSwitch',
              datasourceId: selection.datasourceId,
              datasourceState: selectionDatasourceState,
              persistedDoc,
              targetVisualizationTypeId,
              getPersistedVisualizationTypeId,
            })
          : selection.datasourceState,
      },
      { clearStagedPreview: true }
    );

    // A same-visualization subtype switch (e.g. XY bar -> line) reuses the
    // existing datasource state, so the defaults are reconciled through a
    // follow-up datasource update.
    if (selection.sameDatasources && !selection.datasourceState && activeDatasourceId) {
      // Intentional `as FormBasedPrivateState` type assertion as the redux datasource state is opaque (`DatasourceState['state']` is `unknown`);
      const currentState = datasourceStates[activeDatasourceId]?.state as
        | FormBasedPrivateState
        | undefined;
      if (currentState) {
        const nextState = applyVizTypeDatasourceDefaults({
          kind: 'typeSwitch',
          datasourceId: activeDatasourceId,
          datasourceState: currentState,
          persistedDoc,
          targetVisualizationTypeId,
          getPersistedVisualizationTypeId,
          // A subtype switch only changes this layer's type, so reconcile only
          // its columns and leave sibling layers (e.g. other XY series) intact.
          targetLayerId: layerId,
        });
        if (nextState !== currentState) {
          dispatchLens(
            updateDatasourceState({
              datasourceId: activeDatasourceId,
              newDatasourceState: nextState,
              clearStagedPreview: true,
            })
          );
        }
      }
    }

    if (
      (!selection.datasourceId && !selection.sameDatasources) ||
      selection.dataLoss === 'everything'
    ) {
      dispatchLens(
        removeLayers({
          visualizationId: visualization.activeId,
          layerIds: Object.keys(framePublicAPI.datasourceLayers),
        })
      );
    }
  };

  function getSelection(
    visualizationId: string,
    subVisualizationId: string
  ): VisualizationSelection {
    const newVisualization = visualizationMap[visualizationId];
    const switchVisType = (type: string, state: unknown, lId: string) => {
      if (visualizationMap[visualizationId].switchVisualizationType) {
        return safeFnCall(
          () => visualizationMap[visualizationId].switchVisualizationType!(type, state, lId),
          state
        );
      }
      return state;
    };
    const layers = Object.entries(framePublicAPI.datasourceLayers);

    // Always show the active visualization as a valid selection
    if (
      visualization.activeId === visualizationId &&
      visualization.state &&
      safeFnCall(
        () =>
          newVisualization.getVisualizationTypeId(visualization.state) === subVisualizationId ||
          newVisualization.isSubtypeCompatible?.(
            newVisualization.getVisualizationTypeId(visualization.state),
            subVisualizationId
          ),
        false
      )
    ) {
      return {
        visualizationId,
        subVisualizationId,
        dataLoss: 'nothing',
        keptLayerIds: Object.keys(framePublicAPI.datasourceLayers),
        getVisualizationState: () =>
          switchVisType(subVisualizationId, visualization.state, layerId),
        sameDatasources: true,
      };
    }

    const topSuggestion = getTopSuggestion(
      visualizationMap,
      datasourceMap,
      framePublicAPI,
      visualizationId,
      datasourceStates,
      visualization,
      newVisualization,
      subVisualizationId,
      layerId
    );

    const dataLoss = getDataLoss(layers, topSuggestion);

    function addNewLayer() {
      const newLayerId = generateId();
      dispatchLens(
        insertLayer({
          datasourceId: activeDatasourceId!,
          layerId: newLayerId,
        })
      );
      return newLayerId;
    }

    return {
      visualizationId,
      subVisualizationId,
      dataLoss,
      getVisualizationState: topSuggestion
        ? () =>
            switchVisType(
              subVisualizationId,
              newVisualization.initialize(addNewLayer, topSuggestion.visualizationState),
              layerId
            )
        : () =>
            switchVisType(
              subVisualizationId,
              newVisualization.initialize(
                addNewLayer,
                visualization.activeId === newVisualization.id ? visualization.state : undefined,
                visualization.activeId && visualizationMap[visualization.activeId].getMainPalette
                  ? visualizationMap[visualization.activeId].getMainPalette!(visualization.state)
                  : undefined
              ),
              layerId
            ),
      keptLayerIds: topSuggestion ? topSuggestion.keptLayerIds : [],
      datasourceState: topSuggestion ? topSuggestion.datasourceState : undefined,
      datasourceId: topSuggestion ? topSuggestion.datasourceId : undefined,
      sameDatasources: dataLoss === 'nothing' && visualization.activeId === newVisualization.id,
    };
  }

  const { visualizationTypes, visualizationsLookup } = useMemo(
    () => {
      const subVisualizationId =
        visualization.activeId && visualizationMap[visualization.activeId]
          ? getVisualizationTypeId(
              visualizationMap[visualization.activeId],
              visualization.state,
              layerId
            )
          : undefined;
      const lowercasedSearchTerm = searchTerm.toLowerCase();

      // Will need it later on to quickly pick up the metadata from it
      const lookup: Record<
        string,
        VisualizationType & {
          visualizationId: string;
          selection: VisualizationSelection;
        }
      > = {};

      const chartSwitchPositions: VisChartSwitchPosition[] = [];
      const deprecatedChartSwitchPositions: VisChartSwitchPosition[] = [];
      Object.entries(visualizationMap).forEach(([visualizationId, v]) => {
        const chartSwitchOptions = v.visualizationTypes;
        for (const visualizationType of chartSwitchOptions) {
          const isSearchMatch =
            visualizationType.label.toLowerCase().includes(lowercasedSearchTerm) ||
            visualizationType.description?.toLowerCase().includes(lowercasedSearchTerm);
          if (isSearchMatch) {
            const subtypeId = findSubtypeId(visualizationType, subVisualizationId);

            const visualizationEntry = {
              ...visualizationType,
              visualizationId,
              selection: getSelection(visualizationId, subtypeId),
            };
            if (visualizationEntry.isDeprecated) {
              deprecatedChartSwitchPositions.push(visualizationEntry);
            } else {
              chartSwitchPositions.push(visualizationEntry);
            }
            lookup[`${visualizationId}:${visualizationType.id}`] = visualizationEntry;
          }
        }
      });

      const toSelectableEntry = (v: VisChartSwitchPosition): SelectableEntry => {
        const isChecked = subVisualizationId === v.id;
        return {
          'aria-label': v.label,
          className: 'lnsChartSwitch__option',
          key: `${v.visualizationId}:${v.id}`, // todo: should we simplify?
          value: `${v.visualizationId}:${v.id}`,
          'data-test-subj': `lnsChartSwitchPopover_${v.id}`,
          label: v.label,
          prepend: (
            <ChartSwitchOptionPrepend
              isChecked={isChecked}
              dataLoss={v.selection.dataLoss}
              subtypeId={v.selection.subVisualizationId}
            />
          ),
          data: {
            description: v.description,
            icon: v.icon,
          },
          append: v.showExperimentalBadge ? <ExperimentalBadge size="m" /> : null,
          // Apparently checked: null is not valid for TS
          ...(isChecked && { checked: 'on' }),
        };
      };

      return {
        visualizationTypes: chartSwitchPositions
          .sort(sortByPriority)
          .map(toSelectableEntry)
          .concat(
            deprecatedChartSwitchPositions.length
              ? [
                  deprecatedGroupChartSwitchElement,
                  ...deprecatedChartSwitchPositions.map(toSelectableEntry),
                ]
              : []
          ),
        visualizationsLookup: lookup,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visualizationMap, framePublicAPI, visualization.activeId, visualization.state, searchTerm]
  );

  return (
    <ChartSwitchSelectable
      searchable
      options={visualizationTypes}
      onChange={(newOptions: Array<{ label: string; value?: string; checked?: string }>) => {
        onChartSelect();
        const chosenType = newOptions.find(({ checked }) => checked === 'on');
        if (!chosenType || !chosenType.value) {
          return;
        }
        const id = chosenType.value;
        commitSelection(visualizationsLookup[id].selection);
      }}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
    />
  );
});

const getVisualizationSubtypes = (
  visualization: Visualization,
  state: unknown,
  layerId?: string
) => {
  const typeId = safeFnCall(() => visualization.getVisualizationTypeId(state, layerId), undefined);
  const type = visualization.visualizationTypes.find((t) => t.id === typeId);
  if (type?.subtypes) {
    return type.subtypes;
  }
  return [typeId];
};

const getVisualizationTypeId = (
  activeVisualization: Visualization,
  visualizationState: unknown,
  layerId?: string
) =>
  safeFnCall(
    () => activeVisualization.getVisualizationTypeId(visualizationState, layerId),
    undefined
  );

/**
 * Resolves the subtype-aware visualization type id a layer was saved with, or
 * `undefined` when the visualization was never saved.
 */
export const getPersistedLayerVisualizationTypeId = (
  persistedDoc: LensDocument | undefined,
  visualizationMap: VisualizationMap,
  layerId: string
): string | undefined => {
  const persistedVisualizationId = persistedDoc?.visualizationType;
  const persistedVisualization = persistedVisualizationId
    ? visualizationMap[persistedVisualizationId]
    : undefined;
  if (!persistedDoc || !persistedVisualization) {
    return undefined;
  }
  return getVisualizationTypeId(persistedVisualization, persistedDoc.state.visualization, layerId);
};

const findSubtypeId = (visType: VisualizationType, subtypeId?: string) => {
  if (visType.subtypes) {
    return (
      visType.subtypes.find((subtype) => subtype === subtypeId) ||
      visType.getCompatibleSubtype?.(subtypeId) ||
      visType.subtypes[0]
    );
  }
  return visType.id;
};

function getTopSuggestion(
  visualizationMap: VisualizationMap,
  datasourceMap: DatasourceMap,
  framePublicAPI: FramePublicAPI,
  visualizationId: string,
  datasourceStates: DatasourceStates,
  visualization: VisualizationState,
  newVisualization: Visualization<unknown>,
  subVisualizationId?: string,
  layerId?: string
): Suggestion | undefined {
  const mainPalette =
    visualization.activeId &&
    visualizationMap[visualization.activeId] &&
    visualizationMap[visualization.activeId].getMainPalette
      ? visualizationMap[visualization.activeId].getMainPalette!(visualization.state)
      : undefined;

  const unfilteredSuggestions = getSuggestions({
    datasourceMap,
    datasourceStates,
    visualizationMap: { [visualizationId]: newVisualization },
    activeVisualization: visualization.activeId
      ? visualizationMap[visualization.activeId]
      : undefined,
    visualizationState: visualization.state,
    subVisualizationId,
    activeData: framePublicAPI.activeData,
    mainPalette,
    dataViews: framePublicAPI.dataViews,
  });
  const suggestions = unfilteredSuggestions.filter((suggestion) => {
    // don't use extended versions of current data table on switching between visualizations
    // to avoid confusing the user.

    const subtypes = getVisualizationSubtypes(newVisualization, suggestion.visualizationState);
    return suggestion.changeType !== 'extended' && subtypes.includes(subVisualizationId);
  });

  return (
    suggestions.find((s) => s.changeType === 'unchanged' || s.changeType === 'reduced') ||
    suggestions.find((s) => s.keptLayerIds.some((id) => id === layerId)) ||
    suggestions[0]
  );
}

const getDataLoss = (
  layers: Array<[string, DatasourcePublicAPI | undefined]>,
  topSuggestion: Suggestion<unknown, unknown> | undefined
) => {
  const containsData = layers.some(
    ([_layerId, datasource]) => datasource && datasource.getTableSpec().length > 0
  );
  if (!containsData) {
    return 'nothing';
  } else if (!topSuggestion) {
    return 'everything';
  } else if (layers.length > 1 && layers.length > topSuggestion.keptLayerIds.length) {
    return 'layers';
  } else if (topSuggestion.columns !== layers[0][1]?.getTableSpec().length) {
    return 'columns';
  } else {
    return 'nothing';
  }
};
