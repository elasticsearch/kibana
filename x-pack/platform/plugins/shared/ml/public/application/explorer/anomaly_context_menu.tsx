/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, ReactEventHandler } from 'react';
import React, { useCallback, useMemo, useState } from 'react';
import type {
  EuiContextMenuPanelDescriptor,
  EuiContextMenuPanelItemDescriptor,
} from '@elastic/eui';
import {
  EuiButton,
  EuiButtonIcon,
  EuiContextMenu,
  EuiFieldNumber,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiPanel,
  EuiPopover,
  EuiSpacer,
  EuiToolTip,
  formatDate,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import useObservable from 'react-use/lib/useObservable';
import type { Query, TimeRange } from '@kbn/es-query';
import { isDefined } from '@kbn/ml-is-defined';
import { useTimeRangeUpdates } from '@kbn/ml-date-picker';
import { SEARCH_QUERY_LANGUAGE } from '@kbn/ml-query-utils';
import type { EuiContextMenuProps } from '@elastic/eui/src/components/context_menu/context_menu';
import type { SaveModalDashboardProps } from '@kbn/presentation-util-plugin/public';
import { SavedObjectSaveModalDashboard } from '@kbn/presentation-util-plugin/public';
import type { TimeRangeBounds } from '@kbn/ml-time-buckets';
import type { JobId } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import { ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_charts';
import type { AnomalyChartsEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type { AnomalyChartsAttachmentState } from '../../embeddables';
import { useTableSeverity } from '../components/controls/select_severity';
import { MAX_ANOMALY_CHARTS_ALLOWED } from '../../embeddables/anomaly_charts/anomaly_charts_initializer';
import { useAnomalyExplorerContext } from './anomaly_explorer_context';
import { escapeKueryForEmbeddableFieldValuePair } from '../util/string_utils';
import { useCasesModal } from '../contexts/kibana/use_cases_modal';
import { DEFAULT_MAX_SERIES_TO_PLOT } from '../services/anomaly_explorer_charts_service';
import { useMlKibana } from '../contexts/kibana';
import type { AppStateSelectedCells, ExplorerJob } from './explorer_utils';
import { getSelectionInfluencers, getSelectionTimeRange } from './explorer_utils';
import { getDefaultExplorerChartsPanelTitle } from '../../embeddables/anomaly_charts/utils';
import { CASES_TOAST_MESSAGES_TITLES } from '../../cases/constants';

interface AnomalyContextMenuProps {
  selectedJobs: ExplorerJob[];
  selectedCells?: AppStateSelectedCells | null;
  bounds?: TimeRangeBounds;
  interval?: number;
  chartsCount: number;
  mergedGroupsAndJobsIds: string[];
}

function getDefaultEmbeddablePanelConfig(jobIds: JobId[], queryString?: string) {
  return {
    title: getDefaultExplorerChartsPanelTitle(jobIds).concat(queryString ? `- ${queryString}` : ''),
  };
}

export const AnomalyContextMenu: FC<AnomalyContextMenuProps> = ({
  selectedJobs,
  selectedCells,
  bounds,
  interval,
  chartsCount,
  mergedGroupsAndJobsIds,
}) => {
  const {
    services: {
      application: { capabilities },
      cases,
      embeddable,
    },
  } = useMlKibana();
  const globalTimeRange = useTimeRangeUpdates(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAddDashboardsActive, setIsAddDashboardActive] = useState(false);
  const [severity] = useTableSeverity();
  const [maxSeriesToPlot, setMaxSeriesToPlot] = useState(DEFAULT_MAX_SERIES_TO_PLOT);
  const closePopoverOnAction = useCallback(
    (actionCallback: Function) => {
      setIsMenuOpen(false);
      actionCallback();
    },
    [setIsMenuOpen]
  );

  const openCasesModal = useCasesModal(
    ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE,
    CASES_TOAST_MESSAGES_TITLES.ANOMALY_CHARTS(maxSeriesToPlot)
  );

  const canEditDashboards = capabilities.dashboard_v2?.createNew ?? false;
  const casesPrivileges = cases?.helpers.canUseCases();

  const { anomalyExplorerCommonStateService, chartsStateService } = useAnomalyExplorerContext();
  const { queryString } = useObservable(
    anomalyExplorerCommonStateService.filterSettings$,
    anomalyExplorerCommonStateService.filterSettings
  );

  const chartsData = useObservable(
    chartsStateService.getChartsData$(),
    chartsStateService.getChartsData()
  );

  const timeRangeToPlot: TimeRange = useMemo(() => {
    if (chartsData.seriesToPlot.length > 0) {
      return {
        from: formatDate(chartsData.seriesToPlot[0].plotEarliest, 'MMM D, YYYY @ HH:mm:ss.SSS'),
        to: formatDate(chartsData.seriesToPlot[0].plotLatest, 'MMM D, YYYY @ HH:mm:ss.SSS'),
      } as TimeRange;
    }
    if (!!selectedCells && interval !== undefined && bounds !== undefined) {
      const { earliestMs, latestMs } = getSelectionTimeRange(selectedCells, bounds);
      return {
        from: formatDate(earliestMs, 'MMM D, YYYY @ HH:mm:ss.SSS'),
        to: formatDate(latestMs, 'MMM D, YYYY @ HH:mm:ss.SSS'),
        mode: 'absolute',
      };
    }

    return globalTimeRange;
  }, [chartsData.seriesToPlot, globalTimeRange, selectedCells, bounds, interval]);

  const isMaxSeriesToPlotValid =
    typeof maxSeriesToPlot === 'number' &&
    maxSeriesToPlot >= 1 &&
    maxSeriesToPlot <= MAX_ANOMALY_CHARTS_ALLOWED;

  const getEmbeddableInput = useCallback(
    (timeRange?: TimeRange): Partial<AnomalyChartsEmbeddableState> => {
      const config = getDefaultEmbeddablePanelConfig(mergedGroupsAndJobsIds, queryString);

      return {
        ...config,
        ...(timeRange ? { time_range: timeRange } : {}),
        job_ids: mergedGroupsAndJobsIds,
        max_series_to_plot: maxSeriesToPlot ?? DEFAULT_MAX_SERIES_TO_PLOT,
        severity_threshold: severity.val,
      };
    },
    [mergedGroupsAndJobsIds, queryString, maxSeriesToPlot, severity.val]
  );

  const getCaseAttachmentInput = useCallback(
    (timeRange?: TimeRange): Partial<AnomalyChartsAttachmentState> => {
      // Cases preserve the originating query as wrapper state; dashboard panels rely on parent search.
      const selectionInfluencers = getSelectionInfluencers(
        selectedCells,
        selectedCells?.viewByFieldName!
      );
      const queryFromSelectedCells = (selectionInfluencers ?? [])
        .map((s) => escapeKueryForEmbeddableFieldValuePair(s.fieldName, s.fieldValue))
        .join(' or ');

      return {
        ...getEmbeddableInput(timeRange),
        ...((isDefined(queryString) && queryString !== '') || queryFromSelectedCells !== ''
          ? {
              query: {
                query: queryString === '' ? queryFromSelectedCells : queryString,
                language: SEARCH_QUERY_LANGUAGE.KUERY,
              } as Query,
            }
          : {}),
      };
    },
    [getEmbeddableInput, queryString, selectedCells]
  );

  const onSaveCallback: SaveModalDashboardProps['onSave'] = useCallback(
    async ({ dashboardId, newTitle, newDescription }) => {
      const stateTransfer = embeddable!.getStateTransfer();

      const embeddableInput: Partial<AnomalyChartsEmbeddableState> = {
        // Dashboard panels should inherit the dashboard time range, so do not serialize time_range.
        ...getEmbeddableInput(),
        title: newTitle,
        description: newDescription,
      };

      const state = {
        serializedState: embeddableInput,
        type: ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE,
      };

      const path = dashboardId === 'new' ? '#/create' : `#/view/${dashboardId}`;

      stateTransfer.navigateToWithEmbeddablePackages('dashboards', {
        state: [state],
        path,
      });
    },
    [embeddable, getEmbeddableInput]
  );

  const panels = useMemo<Exclude<EuiContextMenuProps['panels'], undefined>>(() => {
    const rootItems: EuiContextMenuPanelItemDescriptor[] = [];
    const menuPanels: EuiContextMenuPanelDescriptor[] = [{ id: 'panelActions', items: rootItems }];

    const getContent = (callback: ReactEventHandler<HTMLButtonElement>) => (
      <EuiPanel paddingSize={'s'}>
        <EuiSpacer size={'s'} />
        <EuiForm>
          <EuiFormRow
            isInvalid={!isMaxSeriesToPlotValid}
            error={
              !isMaxSeriesToPlotValid ? (
                <FormattedMessage
                  id="xpack.ml.anomalyChartsEmbeddable.maxSeriesToPlotError"
                  defaultMessage="Maximum number of series to plot must be between 1 and 50."
                />
              ) : undefined
            }
            label={
              <FormattedMessage
                id="xpack.ml.explorer.addToDashboard.anomalyCharts.maxSeriesToPlotLabel"
                defaultMessage="Maximum number of series to plot"
              />
            }
          >
            <EuiFieldNumber
              isInvalid={!isMaxSeriesToPlotValid}
              data-test-subj="mlAnomalyChartsInitializerMaxSeries"
              id="selectMaxSeriesToPlot"
              name="selectMaxSeriesToPlot"
              value={maxSeriesToPlot}
              onChange={(e) => setMaxSeriesToPlot(parseInt(e.target.value, 10))}
              min={1}
              max={MAX_ANOMALY_CHARTS_ALLOWED}
            />
          </EuiFormRow>

          <EuiButton
            fill
            type={'submit'}
            fullWidth
            onClick={callback}
            disabled={!isMaxSeriesToPlotValid}
            data-test-subj={'mlAnomalyChartsSubmitAttachment'}
          >
            <FormattedMessage
              id="xpack.ml.explorer.anomalies.submitAttachLabel"
              defaultMessage="Attach"
            />
          </EuiButton>
        </EuiForm>
      </EuiPanel>
    );

    if (canEditDashboards) {
      rootItems.push({
        name: (
          <FormattedMessage
            id="xpack.ml.explorer.addToDashboardLabel"
            defaultMessage="Add to dashboard"
          />
        ),
        panel: 'addToDashboardPanel',
        icon: 'dashboardApp',
        'data-test-subj': 'mlAnomalyAddChartsToDashboardButton',
      });

      menuPanels.push({
        id: 'addToDashboardPanel',
        title: i18n.translate('xpack.ml.explorer.anomalies.addToDashboardLabel', {
          defaultMessage: 'Add to dashboard',
        }),
        content: getContent(
          closePopoverOnAction.bind(null, setIsAddDashboardActive.bind(null, true))
        ),
      });
    }

    if (!!casesPrivileges?.create || !!casesPrivileges?.update) {
      rootItems.push({
        name: (
          <FormattedMessage id="xpack.ml.explorer.attachToCaseLabel" defaultMessage="Add to case" />
        ),
        icon: 'casesApp',
        panel: 'addToCasePanel',
        'data-test-subj': 'mlAnomalyAttachChartsToCasesButton',
      });

      menuPanels.push({
        id: 'addToCasePanel',
        title: i18n.translate('xpack.ml.explorer.attachToCaseLabel', {
          defaultMessage: 'Add to case',
        }),
        content: getContent(
          closePopoverOnAction.bind(
            null,
            openCasesModal.bind(null, getCaseAttachmentInput(timeRangeToPlot))
          )
        ),
      });
    }

    return menuPanels;
  }, [
    getCaseAttachmentInput,
    canEditDashboards,
    casesPrivileges,
    maxSeriesToPlot,
    isMaxSeriesToPlotValid,
    closePopoverOnAction,
    openCasesModal,
    timeRangeToPlot,
  ]);

  return (
    <>
      {!!panels[0]?.items?.length && chartsCount > 0 ? (
        <EuiFlexItem grow={false} css={{ marginLeft: 'auto', alignSelf: 'baseline' }}>
          <EuiPopover
            button={
              <EuiToolTip
                content={i18n.translate('xpack.ml.explorer.anomalies.actionsAriaLabel', {
                  defaultMessage: 'Actions',
                })}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  size="s"
                  aria-label={i18n.translate('xpack.ml.explorer.anomalies.actionsAriaLabel', {
                    defaultMessage: 'Actions',
                  })}
                  color="text"
                  display="base"
                  iconType="boxesVertical"
                  onClick={setIsMenuOpen.bind(null, !isMenuOpen)}
                  data-test-subj="mlExplorerAnomalyPanelMenu"
                  disabled={chartsCount < 1}
                />
              </EuiToolTip>
            }
            isOpen={isMenuOpen}
            closePopover={setIsMenuOpen.bind(null, false)}
            panelPaddingSize="none"
            anchorPosition="downLeft"
            aria-label={i18n.translate('xpack.ml.explorer.anomalies.actionsPopoverAriaLabel', {
              defaultMessage: 'Anomaly actions menu',
            })}
          >
            <EuiContextMenu panels={panels} initialPanelId={'panelActions'} />
          </EuiPopover>
        </EuiFlexItem>
      ) : null}
      {isAddDashboardsActive && selectedJobs ? (
        <SavedObjectSaveModalDashboard
          canSaveByReference={false}
          objectType={i18n.translate('xpack.ml.cases.anomalyCharts.displayName', {
            defaultMessage: 'Anomaly charts',
          })}
          documentInfo={{
            title: getDefaultExplorerChartsPanelTitle(mergedGroupsAndJobsIds),
          }}
          onClose={setIsAddDashboardActive.bind(null, false)}
          onSave={onSaveCallback}
        />
      ) : null}
    </>
  );
};
