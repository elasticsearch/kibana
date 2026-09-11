/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import type { Action, Trigger } from '@kbn/ui-actions-plugin/public';

import { createAction } from '@kbn/ui-actions-plugin/public';
import type { ActionDefinition } from '@kbn/ui-actions-plugin/public/actions';
import type { LensProps } from '@kbn/cases-plugin/public/types';
import { ADD_TO_CASE } from '@kbn/response-ops-alerts-table/translations';
import { useKibana } from '../../lib/kibana/kibana_react';
import { useAddToExistingCase } from './use_add_to_existing_case';
import { useSaveToLibrary } from './use_save_to_library';

import { VisualizationContextMenuActions } from './types';
import type { LensAttributes } from './types';
import { ADDED_TO_LIBRARY, INSPECT, OPEN_IN_LENS } from './translations';

export const DEFAULT_ACTIONS: VisualizationContextMenuActions[] = [
  VisualizationContextMenuActions.inspect,
  VisualizationContextMenuActions.addToCase,
  VisualizationContextMenuActions.saveToLibrary,
  VisualizationContextMenuActions.openInLens,
];

export const INSPECT_ACTION: VisualizationContextMenuActions[] = [
  VisualizationContextMenuActions.inspect,
];

export const VISUALIZATION_CONTEXT_MENU_TRIGGER: Trigger = {
  id: 'VISUALIZATION_CONTEXT_MENU_TRIGGER',
};

const ACTION_DEFINITION: Record<
  VisualizationContextMenuActions,
  Omit<ActionDefinition, 'execute'>
> = {
  [VisualizationContextMenuActions.inspect]: {
    id: VisualizationContextMenuActions.inspect,
    getDisplayName: () => INSPECT,
    getIconType: () => 'inspect',
    type: 'actionButton',
    order: 4,
  },
  [VisualizationContextMenuActions.addToCase]: {
    id: VisualizationContextMenuActions.addToCase,
    getDisplayName: () => ADD_TO_CASE,
    getIconType: () => 'casesApp',
    type: 'actionButton',
    order: 2,
  },
  [VisualizationContextMenuActions.saveToLibrary]: {
    id: VisualizationContextMenuActions.saveToLibrary,
    getDisplayName: () => ADDED_TO_LIBRARY,
    getIconType: () => 'save',
    type: 'actionButton',
    order: 1,
  },
  [VisualizationContextMenuActions.openInLens]: {
    id: VisualizationContextMenuActions.openInLens,
    getDisplayName: () => OPEN_IN_LENS,
    getIconType: () => 'chartArea',
    type: 'actionButton',
    order: 0,
  },
};

export const useActions = ({
  attributes,
  lensMetadata,
  extraActions,
  inspectActionProps,
  timeRange,
  withActions = DEFAULT_ACTIONS,
}: {
  attributes: LensAttributes | null;
  lensMetadata?: LensProps['metadata'];
  extraActions?: Action[];
  inspectActionProps: {
    handleInspectClick: () => void;
    isInspectButtonDisabled: boolean;
  };
  timeRange: { from: string; to: string };
  withActions?: VisualizationContextMenuActions[];
}) => {
  const { services } = useKibana();
  const {
    lens: { navigateToPrefilledEditor, canUseEditor },
    topValuesPopover,
  } = services;

  const onOpenInLens = useCallback(() => {
    if (!timeRange || !attributes) {
      return;
    }
    navigateToPrefilledEditor(
      {
        id: '',
        time_range: timeRange,
        attributes,
      },
      {
        openInNewTab: true,
      }
    );
  }, [attributes, navigateToPrefilledEditor, timeRange]);

  const { disabled: isAddToCaseDisabled, onAddToExistingCaseClicked: onAddToCaseClicked } =
    useAddToExistingCase({
      lensAttributes: attributes,
      timeRange,
      lensMetadata,
    });

  const { openSaveVisualizationFlyout, disableVisualizations } = useSaveToLibrary({ attributes });

  const allActions: Action[] = useMemo(
    () =>
      [
        createAction({
          ...ACTION_DEFINITION[VisualizationContextMenuActions.inspect],
          execute: async () => {
            inspectActionProps.handleInspectClick();
          },
          isDisabled: () => inspectActionProps.isInspectButtonDisabled,
          isCompatible: async () => withActions.includes(VisualizationContextMenuActions.inspect),
        }),
        createAction({
          ...ACTION_DEFINITION[VisualizationContextMenuActions.addToCase],
          execute: async () => {
            onAddToCaseClicked();
            topValuesPopover.closePopover();
          },
          isDisabled: () => isAddToCaseDisabled,
          isCompatible: async () => withActions.includes(VisualizationContextMenuActions.addToCase),
          order: 2,
        }),
        createAction({
          ...ACTION_DEFINITION[VisualizationContextMenuActions.saveToLibrary],
          execute: async () => {
            openSaveVisualizationFlyout();
          },
          isDisabled: () => disableVisualizations,
          isCompatible: async () =>
            withActions.includes(VisualizationContextMenuActions.saveToLibrary),
          order: 1,
        }),
        createAction({
          ...ACTION_DEFINITION[VisualizationContextMenuActions.openInLens],
          execute: async () => {
            onOpenInLens();
          },
          isCompatible: async () =>
            canUseEditor() && withActions.includes(VisualizationContextMenuActions.openInLens),
          order: 0,
        }),
        ...(extraActions ?? []),
      ].map((a, i, totalActions) => {
        const order = Math.max(totalActions.length - (1 + i), 0);
        return {
          ...a,
          order,
        };
      }),
    [
      canUseEditor,
      disableVisualizations,
      extraActions,
      inspectActionProps,
      isAddToCaseDisabled,
      onAddToCaseClicked,
      onOpenInLens,
      openSaveVisualizationFlyout,
      withActions,
      topValuesPopover,
    ]
  );

  return allActions;
};
