/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { css } from '@emotion/react';
import { BehaviorSubject } from 'rxjs';
import { i18n } from '@kbn/i18n';
import type { TimeRange } from '@kbn/es-query';
import { EmbeddableRenderer } from '@kbn/embeddable-plugin/public';
import { VISUALIZE_EMBEDDABLE_TYPE } from '@kbn/visualizations-common';
import {
  ActionButtonType,
  type ActionButton,
  type InlineRenderCallbacks,
} from '@kbn/agent-builder-browser/attachments';
import {
  SavedObjectSaveModalDashboard,
  type SaveModalDashboardProps,
} from '@kbn/presentation-util-plugin/public';
import type { VegaVisualizationServices } from '../services';
import {
  visualizationWrapperStyles,
  visualizationEmbeddableStyles,
  visualizationHeaderStyles,
  visualizationTimePickerContainerClassName,
} from '../shared/styles';
import { DEFAULT_VISUALIZATION_HEIGHT } from '../shared/get_visualization_dimensions';
import { FallbackVisualizationActions } from '../shared/visualization_actions';
import { useVisPreviewUnifiedSearch } from '../shared/use_vis_preview_unified_search';

/** `savedVis.type` Kibana uses to render a Vega/Vega-Lite spec. */
const VEGA_VIS_TYPE = 'vega';

const saveButtonLabel = i18n.translate(
  'xpack.agentBuilder.conversation.vegaVisualization.saveToDashboard',
  { defaultMessage: 'Save to dashboard' }
);

const dashboardWriteControlsDisabledReason = i18n.translate(
  'xpack.agentBuilder.conversation.vegaVisualization.dashboardWriteControlsDisabledReason',
  {
    defaultMessage: 'You need dashboard write permissions to save visualizations to a dashboard.',
  }
);

const saveModalObjectType = i18n.translate(
  'xpack.agentBuilder.conversation.vegaVisualization.objectType',
  { defaultMessage: 'Visualization' }
);

/**
 * Render a custom Vega/Vega-Lite spec inline as a by-value visualize
 * embeddable — the same renderer Kibana uses for Vega panels on dashboards.
 * The spec is passed by value, so nothing is persisted as a saved object until
 * the user explicitly saves it to a dashboard.
 *
 * The time range is published from the parent API (rather than baked into the
 * child's serialized `time_range`) so the unified SearchBar date picker can
 * re-drive the embeddable's fetch — a local child time range would otherwise
 * take precedence over the picker.
 */
export function VisualizeVega({
  services,
  visualization,
  timeRange,
  registerActionButtons,
}: {
  services: VegaVisualizationServices;
  visualization: Record<string, unknown>;
  timeRange?: TimeRange;
  registerActionButtons?: InlineRenderCallbacks['registerActionButtons'];
}) {
  const spec =
    'spec' in visualization && typeof visualization.spec === 'string' ? visualization.spec : '';
  const { application, unifiedSearch, embeddable } = services;
  const SearchBar = unifiedSearch.ui.SearchBar;
  const canWriteDashboards = application?.capabilities.dashboard_v2?.showWriteControls === true;

  const { searchBarProps, effectiveTimeRange } = useVisPreviewUnifiedSearch({ timeRange });

  const timeRange$ = useMemo(
    () => new BehaviorSubject<TimeRange | undefined>(effectiveTimeRange),
    // Created once; subsequent picker changes are pushed via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  useEffect(() => {
    timeRange$.next(effectiveTimeRange);
  }, [effectiveTimeRange, timeRange$]);

  const buildSavedVis = useCallback(
    (title: string) => ({
      title,
      type: VEGA_VIS_TYPE,
      params: { spec },
      uiState: {},
      data: { aggs: [], searchSource: {} },
    }),
    [spec]
  );

  const getParentApi = useCallback(
    () => ({
      timeRange$,
      getSerializedStateForChild: () => ({ savedVis: buildSavedVis('') }),
    }),
    [buildSavedVis, timeRange$]
  );

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const openSaveModal = useCallback(() => {
    if (canWriteDashboards) {
      setIsSaveModalOpen(true);
    }
  }, [canWriteDashboards]);
  const closeSaveModal = useCallback(() => setIsSaveModalOpen(false), []);

  const onSaveToDashboard = useCallback<SaveModalDashboardProps['onSave']>(
    async ({ dashboardId, newTitle, newDescription }) => {
      setIsSaveModalOpen(false);
      // Intentionally omit `time_range`: the saved panel should follow the
      // dashboard's global time range, not the preview range from the local
      // date picker. A per-panel time range would pin the panel and ignore the
      // dashboard picker.
      const serializedState = {
        savedVis: buildSavedVis(newTitle),
        title: newTitle,
        description: newDescription,
      };

      await embeddable.getStateTransfer().navigateToWithEmbeddablePackages('dashboards', {
        state: [{ type: VISUALIZE_EMBEDDABLE_TYPE, serializedState }],
        path: dashboardId && dashboardId !== 'new' ? `#/view/${dashboardId}` : '#/create',
      });
    },
    [buildSavedVis, embeddable]
  );

  // The tool-result / markdown surface has no attachment header to host buttons,
  // so fall back to rendering them locally (matching the Lens renderer).
  const [localActionButtons, setLocalActionButtons] = useState<ActionButton[]>([]);
  const registerLocalActionButtons = useCallback(
    (buttons: ActionButton[]) => setLocalActionButtons(buttons),
    []
  );
  const register = registerActionButtons ?? registerLocalActionButtons;
  const shouldRenderLocalActionButtons = !registerActionButtons && localActionButtons.length > 0;

  const actionButtons = useMemo<ActionButton[]>(
    () => [
      {
        label: saveButtonLabel,
        icon: 'save',
        type: ActionButtonType.PRIMARY,
        disabled: !canWriteDashboards,
        disabledReason: canWriteDashboards ? undefined : dashboardWriteControlsDisabledReason,
        handler: openSaveModal,
      },
    ],
    [canWriteDashboards, openSaveModal]
  );

  useEffect(() => {
    register(actionButtons);
    return () => register([]);
  }, [actionButtons, register]);

  return (
    <div data-test-subj="agentBuilderVegaVisualization" css={visualizationWrapperStyles}>
      {shouldRenderLocalActionButtons && (
        <FallbackVisualizationActions buttons={localActionButtons} />
      )}
      <div css={visualizationHeaderStyles} className={visualizationTimePickerContainerClassName}>
        <SearchBar {...searchBarProps} />
      </div>

      <div
        css={[visualizationEmbeddableStyles(DEFAULT_VISUALIZATION_HEIGHT), css({ width: '100%' })]}
      >
        <EmbeddableRenderer
          type={VISUALIZE_EMBEDDABLE_TYPE}
          getParentApi={getParentApi}
          hidePanelChrome
        />
      </div>

      {isSaveModalOpen && (
        <SavedObjectSaveModalDashboard
          objectType={saveModalObjectType}
          documentInfo={{ title: '' }}
          canSaveByReference={false}
          onClose={closeSaveModal}
          onSave={onSaveToDashboard}
        />
      )}
    </div>
  );
}
