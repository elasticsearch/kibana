/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { memo, useCallback } from 'react';
import type { FramePublicAPI } from '@kbn/lens-common';
import {
  useLensDispatch,
  updateVisualizationState,
  useLensSelector,
  selectVisualizationState,
  selectVisualization,
} from '../../state_management';
import { useEditorFrameService } from '../editor_frame_service_context';
import { FlyoutToolbar } from '../../shared_components/flyout_toolbar';
import { usePanelSettingsToolbarAction } from '../../shared_components/panel_settings_toolbar_context';

export const VisualizationToolbarWrapper = memo(function VisualizationToolbar({
  framePublicAPI,
  isInlineEditing = false,
}: {
  framePublicAPI: FramePublicAPI;
  isInlineEditing?: boolean;
}) {
  const dispatchLens = useLensDispatch();
  const lensVisualization = useLensSelector(selectVisualization);
  const visualizationState = useLensSelector(selectVisualizationState);

  const { visualizationMap } = useEditorFrameService();
  const panelSettingsAction = usePanelSettingsToolbarAction();

  const activeVisualization = lensVisualization.activeId
    ? visualizationMap[lensVisualization.activeId]
    : null;

  const setVisualizationState = useCallback(
    (newState: unknown) => {
      if (!activeVisualization) {
        return;
      }
      dispatchLens(
        updateVisualizationState({
          visualizationId: activeVisualization.id,
          newState,
        })
      );
    },
    [dispatchLens, activeVisualization]
  );

  if (!activeVisualization || !visualizationState) {
    if (!panelSettingsAction) {
      return null;
    }
    return (
      <FlyoutToolbar
        frame={framePublicAPI}
        state={undefined}
        setState={() => {}}
        contentMap={{}}
        isInlineEditing={isInlineEditing}
      />
    );
  }

  const { FlyoutToolbarComponent } = activeVisualization;

  if (!FlyoutToolbarComponent) {
    if (!panelSettingsAction) {
      return null;
    }
    return (
      <FlyoutToolbar
        frame={framePublicAPI}
        state={visualizationState.state}
        setState={setVisualizationState}
        contentMap={{}}
        isInlineEditing={isInlineEditing}
      />
    );
  }

  return FlyoutToolbarComponent({
    frame: framePublicAPI,
    state: visualizationState.state,
    setState: setVisualizationState,
    isInlineEditing,
  });
});
