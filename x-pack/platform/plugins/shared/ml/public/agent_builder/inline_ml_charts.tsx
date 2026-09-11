/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BehaviorSubject } from 'rxjs';
import { i18n } from '@kbn/i18n';
import type { IconType } from '@elastic/eui';
import type { ApplicationStart } from '@kbn/core/public';
import { EmbeddableRenderer, type EmbeddableStart } from '@kbn/embeddable-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import {
  ActionButtonType,
  type ActionButton,
  type AttachmentRenderProps,
  type InlineRenderCallbacks,
} from '@kbn/agent-builder-browser/attachments';
import type { UnknownAttachment } from '@kbn/agent-builder-common/attachments';
import { ANOMALY_SWIMLANE_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_swimlane';
import { ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_charts';
import { ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/single_metric_viewer';
import type { AnomalySwimLaneEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import type { AnomalyChartsEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import type { Filter, Query, TimeRange } from '@kbn/es-query';
import type { HasSerializedChildState } from '@kbn/presentation-publishing';
import {
  SavedObjectSaveModalDashboard,
  type SaveModalDashboardProps,
} from '@kbn/presentation-util-plugin/public';
import {
  useVisPreviewUnifiedSearch,
  VisualizationPreviewShell,
} from '@kbn/agent-builder-visualizations';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import type { MlLocator, MlLocatorParams } from '../locator';
import { getDefaultSwimlanePanelTitle } from '../embeddables/anomaly_swimlane/anomaly_swimlane_embeddable';
import { getDefaultExplorerChartsPanelTitle } from '../embeddables/anomaly_charts/utils';
import { getDefaultSingleMetricViewerPanelTitle } from '../embeddables/single_metric_viewer/get_default_panel_title';

const ML_CHART_PREVIEW_HEIGHT = 400;

const saveButtonLabel = i18n.translate('xpack.ml.agentBuilder.visualization.saveToDashboard', {
  defaultMessage: 'Save to dashboard',
});

const dashboardWriteControlsDisabledReason = i18n.translate(
  'xpack.ml.agentBuilder.visualization.dashboardWriteControlsDisabledReason',
  {
    defaultMessage: 'You need dashboard write permissions to save visualizations to a dashboard.',
  }
);

const viewInAnomalyExplorerLabel = i18n.translate(
  'xpack.ml.agentBuilder.visualization.viewInAnomalyExplorer',
  {
    defaultMessage: 'View in Anomaly Explorer',
  }
);

const viewInSingleMetricViewerLabel = i18n.translate(
  'xpack.ml.agentBuilder.visualization.viewInSingleMetricViewer',
  {
    defaultMessage: 'View in Single Metric Viewer',
  }
);

const swimLaneObjectType = i18n.translate('xpack.ml.anomalySwimLane.objectTypeLabel', {
  defaultMessage: 'Anomaly swim lane',
});

const anomalyChartsObjectType = i18n.translate('xpack.ml.cases.anomalyCharts.displayName', {
  defaultMessage: 'Anomaly charts',
});

const singleMetricViewerObjectType = i18n.translate('xpack.ml.singleMetricViewer.objectTypeLabel', {
  defaultMessage: 'Single Metric Viewer',
});

export interface InlineMlChartServices {
  application: ApplicationStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
  embeddable: EmbeddableStart;
  locator?: MlLocator;
}

type MlChartAttachment<TData extends object> = UnknownAttachment & { data: TData };

type InlineMlChartRenderProps<TData extends object> = AttachmentRenderProps<
  MlChartAttachment<TData>
> & {
  services: InlineMlChartServices;
  registerActionButtons?: InlineRenderCallbacks['registerActionButtons'];
};

const omitTimeRange = <T extends { time_range?: TimeRange }>(state: T): Omit<T, 'time_range'> => {
  const { time_range: _timeRange, ...rest } = state;
  return rest;
};

const toLocatorEntities = (
  selectedEntities: SingleMetricViewerEmbeddableState['selected_entities']
): Record<string, string> | undefined => {
  if (!selectedEntities) {
    return undefined;
  }

  const entities = Object.fromEntries(
    Object.entries(selectedEntities)
      .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)])
  );

  return Object.keys(entities).length > 0 ? entities : undefined;
};

const buildParentApi = <T extends object>(
  state: T,
  timeRange?: TimeRange
): HasSerializedChildState<T> & {
  query$: BehaviorSubject<Query | undefined>;
  filters$: BehaviorSubject<Filter[] | undefined>;
  timeRange$: BehaviorSubject<TimeRange | undefined>;
  executionContext: {
    type: 'agent_builder';
    description: string;
    id: string;
  };
} => ({
  getSerializedStateForChild: () => state,
  query$: new BehaviorSubject<Query | undefined>(undefined),
  filters$: new BehaviorSubject<Filter[] | undefined>([]),
  timeRange$: new BehaviorSubject<TimeRange | undefined>(timeRange),
  executionContext: {
    type: 'agent_builder' as const,
    description: 'ML anomaly chart',
    id: 'agent-ml-chart',
  },
});

function InlineMlChart<
  TData extends { job_ids: string[]; time_range?: TimeRange; title?: string }
>({
  attachment,
  screenContext,
  services,
  registerActionButtons,
  embeddableType,
  objectType,
  defaultTitle,
  getViewInLocatorParams,
  viewInLabel,
  viewInIcon,
}: InlineMlChartRenderProps<TData> & {
  embeddableType: string;
  objectType: string;
  defaultTitle: string;
  getViewInLocatorParams: (timeRange: TimeRange) => MlLocatorParams;
  viewInLabel: string;
  viewInIcon: IconType;
}) {
  const { data } = attachment;
  const { application, unifiedSearch, embeddable, locator } = services;
  const initialTimeRange = data.time_range ?? screenContext?.time_range;
  const { searchBarProps, effectiveTimeRange } = useVisPreviewUnifiedSearch({
    timeRange: initialTimeRange,
    dataTestSubj: 'agentBuilderMlChartTimeRangePicker',
  });
  const serializedState = useMemo(() => omitTimeRange(data), [data]);
  // parentApi is created once so EmbeddableRenderer receives a stable reference.
  // timeRange$ is kept in sync via the effect below.
  const parentApi = useMemo(
    () => buildParentApi(serializedState, effectiveTimeRange),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    parentApi.timeRange$.next(effectiveTimeRange);
  }, [parentApi, effectiveTimeRange]);

  useEffect(() => () => parentApi.timeRange$.complete(), [parentApi]);

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const canWriteDashboards = application.capabilities.dashboard_v2?.showWriteControls === true;

  const openSaveModal = useCallback(() => {
    if (canWriteDashboards) {
      setIsSaveModalOpen(true);
    }
  }, [canWriteDashboards]);
  const closeSaveModal = useCallback(() => setIsSaveModalOpen(false), []);

  const onSaveToDashboard = useCallback<SaveModalDashboardProps['onSave']>(
    async ({ dashboardId, newTitle, newDescription }) => {
      setIsSaveModalOpen(false);
      await embeddable.getStateTransfer().navigateToWithEmbeddablePackages('dashboards', {
        state: [
          {
            type: embeddableType,
            serializedState: {
              ...serializedState,
              title: newTitle,
              description: newDescription,
            },
          },
        ],
        path: dashboardId && dashboardId !== 'new' ? `#/view/${dashboardId}` : '#/create',
      });
    },
    [embeddable, embeddableType, serializedState]
  );

  const viewInHref = useMemo(() => {
    if (!locator) {
      return undefined;
    }
    return locator.getRedirectUrl(getViewInLocatorParams(effectiveTimeRange));
  }, [effectiveTimeRange, getViewInLocatorParams, locator]);

  const actionButtons = useMemo<ActionButton[]>(() => {
    const buttons: ActionButton[] = [];

    if (viewInHref) {
      buttons.push({
        label: viewInLabel,
        icon: viewInIcon,
        type: ActionButtonType.SECONDARY,
        href: viewInHref,
        handler: () => undefined,
      });
    }

    buttons.push({
      label: saveButtonLabel,
      icon: 'save',
      type: ActionButtonType.PRIMARY,
      disabled: !canWriteDashboards,
      disabledReason: canWriteDashboards ? undefined : dashboardWriteControlsDisabledReason,
      handler: openSaveModal,
    });

    return buttons;
  }, [canWriteDashboards, openSaveModal, viewInHref, viewInIcon, viewInLabel]);

  return (
    <>
      <VisualizationPreviewShell
        unifiedSearch={unifiedSearch}
        searchBarProps={searchBarProps}
        actionButtons={actionButtons}
        registerActionButtons={registerActionButtons}
        height={ML_CHART_PREVIEW_HEIGHT}
        dataTestSubj="agentBuilderMlVisualization"
      >
        <EmbeddableRenderer type={embeddableType} getParentApi={() => parentApi} hidePanelChrome />
      </VisualizationPreviewShell>
      {isSaveModalOpen && (
        <SavedObjectSaveModalDashboard
          objectType={objectType}
          documentInfo={{ title: data.title || defaultTitle }}
          canSaveByReference={false}
          onClose={closeSaveModal}
          onSave={onSaveToDashboard}
        />
      )}
    </>
  );
}

export const InlineSwimLane = ({
  attachment,
  ...renderProps
}: InlineMlChartRenderProps<AnomalySwimLaneEmbeddableState>) => {
  const { data } = attachment;
  const getViewInLocatorParams = useCallback(
    (timeRange: TimeRange): MlLocatorParams => ({
      page: ML_PAGES.ANOMALY_EXPLORER,
      pageState: {
        jobIds: data.job_ids,
        timeRange,
        ...(data.swimlane_type === 'viewBy'
          ? { mlExplorerSwimlane: { viewByFieldName: data.view_by } }
          : {}),
      },
    }),
    [data]
  );

  return (
    <InlineMlChart
      attachment={attachment}
      {...renderProps}
      embeddableType={ANOMALY_SWIMLANE_EMBEDDABLE_TYPE}
      objectType={swimLaneObjectType}
      defaultTitle={getDefaultSwimlanePanelTitle(data.job_ids)}
      getViewInLocatorParams={getViewInLocatorParams}
      viewInLabel={viewInAnomalyExplorerLabel}
      viewInIcon="table"
    />
  );
};

export const InlineAnomalyCharts = ({
  attachment,
  ...renderProps
}: InlineMlChartRenderProps<AnomalyChartsEmbeddableState>) => {
  const { data } = attachment;
  const getViewInLocatorParams = useCallback(
    (timeRange: TimeRange): MlLocatorParams => ({
      page: ML_PAGES.ANOMALY_EXPLORER,
      pageState: {
        jobIds: data.job_ids,
        timeRange,
      },
    }),
    [data.job_ids]
  );

  return (
    <InlineMlChart
      attachment={attachment}
      {...renderProps}
      embeddableType={ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE}
      objectType={anomalyChartsObjectType}
      defaultTitle={getDefaultExplorerChartsPanelTitle(data.job_ids)}
      getViewInLocatorParams={getViewInLocatorParams}
      viewInLabel={viewInAnomalyExplorerLabel}
      viewInIcon="table"
    />
  );
};

export const InlineSingleMetricViewer = ({
  attachment,
  ...renderProps
}: InlineMlChartRenderProps<SingleMetricViewerEmbeddableState>) => {
  const { data } = attachment;
  const getViewInLocatorParams = useCallback(
    (timeRange: TimeRange): MlLocatorParams => ({
      page: ML_PAGES.SINGLE_METRIC_VIEWER,
      pageState: {
        jobIds: data.job_ids,
        timeRange,
        detectorIndex: data.selected_detector_index,
        forecastId: data.forecast_id,
        entities: toLocatorEntities(data.selected_entities),
        functionDescription: data.function_description,
      },
    }),
    [data]
  );

  return (
    <InlineMlChart
      attachment={attachment}
      {...renderProps}
      embeddableType={ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE}
      objectType={singleMetricViewerObjectType}
      defaultTitle={getDefaultSingleMetricViewerPanelTitle(data.job_ids[0] ?? '')}
      getViewInLocatorParams={getViewInLocatorParams}
      viewInLabel={viewInSingleMetricViewerLabel}
      viewInIcon="singleMetricViewer"
    />
  );
};
