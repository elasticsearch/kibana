/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useMemo, useState } from 'react';
import type {
  EuiContextMenuPanelDescriptor,
  EuiContextMenuPanelItemDescriptor,
} from '@elastic/eui';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiContextMenu,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiPopover,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import useObservable from 'react-use/lib/useObservable';
import useDebounce from 'react-use/lib/useDebounce';
import { formatHumanReadableDateTime } from '@kbn/ml-date-utils';
import { isDefined } from '@kbn/ml-is-defined';
import { useTimeRangeUpdates } from '@kbn/ml-date-picker';
import type { SaveModalDashboardProps } from '@kbn/presentation-util-plugin/public';
import { SavedObjectSaveModalDashboard } from '@kbn/presentation-util-plugin/public';
import { useTimeBuckets } from '@kbn/ml-time-buckets';
import type { AnomalySwimLaneEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import type { SwimlaneType } from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import { SWIMLANE_TYPE } from '@kbn/ml-common-types/embeddables/swimlane_type';
import { ANOMALY_SWIMLANE_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_swimlane';
import { getDefaultSwimlanePanelTitle } from '../../embeddables/anomaly_swimlane/anomaly_swimlane_embeddable';
import { useCasesModal } from '../contexts/kibana/use_cases_modal';
import { OVERALL_LABEL, VIEW_BY_JOB_LABEL } from './explorer_constants';
import { useMlKibana } from '../contexts/kibana';
import { ExplorerNoInfluencersFound } from './components/explorer_no_influencers_found';
import { SwimlaneContainer } from './swimlane_container';
import {
  type AppStateSelectedCells,
  type OverallSwimlaneData,
  type ViewBySwimLaneData,
} from './explorer_utils';
import { NoOverallData } from './components/no_overall_data';
import { SeverityLegendControl } from './components/severity_legend_control/severity_legend_control';
import { AnomalyTimelineHelpPopover } from './anomaly_timeline_help_popover';
import { MlTooltipComponent } from '../components/chart_tooltip';
import { SwimlaneAnnotationContainer } from './swimlane_annotation_container';
import { AnomalyTimelineService } from '../services/anomaly_timeline_service';
import { useAnomalyExplorerContext } from './anomaly_explorer_context';
import { getTimeBoundsFromSelection } from './hooks/use_selected_cells';
import { SwimLaneWrapper } from './alerts';
import { Y_AXIS_LABEL_WIDTH } from './constants';
import { CASES_TOAST_MESSAGES_TITLES } from '../../cases/constants';
import { useJobSelection } from './hooks/use_job_selection';
import type { SeverityOption } from './hooks/use_severity_options';
import { useSeverityOptions } from './hooks/use_severity_options';
import { useThresholdToSeverity } from './hooks/use_threshold_to_severity';

function mapSwimlaneOptionsToEuiOptions(options: string[]) {
  return options.map((option) => ({
    value: option,
    text: option,
  }));
}

export const AnomalyTimeline: FC = () => {
  const {
    services: {
      application: { capabilities },
      charts: chartsService,
      cases,
      embeddable,
      uiSettings,
    },
  } = useMlKibana();

  const globalTimeRange = useTimeRangeUpdates(true);

  const selectCaseModal = cases?.hooks.useCasesAddToExistingCaseModal();

  const {
    anomalyExplorerCommonStateService,
    anomalyTimelineStateService,
    annotationsStateService,
  } = useAnomalyExplorerContext();

  const setSelectedCells = anomalyTimelineStateService.setSelectedCells.bind(
    anomalyTimelineStateService
  );

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const canEditDashboards = capabilities.dashboard_v2?.createNew ?? false;

  const timeBuckets = useTimeBuckets(uiSettings);

  const overallAnnotations = useObservable(
    annotationsStateService.overallAnnotations$,
    annotationsStateService.overallAnnotations
  );

  const { filterActive } = useObservable(
    anomalyExplorerCommonStateService.filterSettings$,
    anomalyExplorerCommonStateService.filterSettings
  );

  const swimlaneLimit = useObservable(anomalyTimelineStateService.getSwimLaneCardinality$());

  const { selectedJobs, mergedGroupsAndJobsIds } = useJobSelection();

  const loading = useObservable(anomalyTimelineStateService.isOverallSwimLaneLoading$(), true);

  const swimlaneContainerWidth = useObservable(
    anomalyTimelineStateService.getContainerWidth$(),
    anomalyTimelineStateService.getContainerWidth()
  );
  const viewBySwimlaneDataLoading = useObservable(
    anomalyTimelineStateService.isViewBySwimLaneLoading$(),
    true
  );

  const overallSwimlaneData = useObservable(anomalyTimelineStateService.getOverallSwimLaneData$());

  const viewBySwimlaneData = useObservable(anomalyTimelineStateService.getViewBySwimLaneData$());
  const selectedCells = useObservable(
    anomalyTimelineStateService.getSelectedCells$(),
    anomalyTimelineStateService.getSelectedCells()
  );
  const swimLaneSeverity = useObservable(anomalyTimelineStateService.getSwimLaneSeverity$());

  const severityOptions = useSeverityOptions();
  const thresholdToSeverity = useThresholdToSeverity();

  const [localSeverityOptions, setLocalSeverityOptions] = useState<SeverityOption[] | null>(null);

  useDebounce(
    () => {
      if (localSeverityOptions) {
        const thresholds = localSeverityOptions.map((severity) => severity.threshold);
        anomalyTimelineStateService.setSeverity(thresholds);
      }
    },
    500,
    [localSeverityOptions]
  );

  // Use URL state on initial load, then local state for UI updates
  const selectedSeverityOptions = useMemo(() => {
    if (localSeverityOptions) {
      return localSeverityOptions;
    }

    if (!swimLaneSeverity?.length) {
      return severityOptions;
    }

    return thresholdToSeverity(swimLaneSeverity);
  }, [localSeverityOptions, swimLaneSeverity, severityOptions, thresholdToSeverity]);

  const handleSeverityChange = useCallback((newSelectedSeverities: SeverityOption[]) => {
    setLocalSeverityOptions(newSelectedSeverities);
  }, []);

  const viewBySwimlaneFieldName = useObservable(
    anomalyTimelineStateService.getViewBySwimlaneFieldName$()
  );

  const viewBySwimlaneOptions = useObservable(
    anomalyTimelineStateService.getViewBySwimLaneOptions$(),
    anomalyTimelineStateService.getViewBySwimLaneOptions()
  );

  const { viewByPerPage, viewByFromPage } = useObservable(
    anomalyTimelineStateService.getSwimLanePagination$(),
    anomalyTimelineStateService.getSwimLanePagination()
  );

  const [selectedSwimlane, setSelectedSwimlane] = useState<SwimlaneType | undefined>();

  const viewByLabel = i18n.translate('xpack.ml.explorer.viewByLabel', {
    defaultMessage: 'View by',
  });

  const timeRange = getTimeBoundsFromSelection(selectedCells);

  const viewByLoadedForTimeFormatted = timeRange
    ? `${formatHumanReadableDateTime(timeRange.earliestMs)} - ${formatHumanReadableDateTime(
        timeRange.latestMs
      )}`
    : null;

  const openCasesModalCallback = useCasesModal(
    ANOMALY_SWIMLANE_EMBEDDABLE_TYPE,
    CASES_TOAST_MESSAGES_TITLES.ANOMALY_TIMELINE
  );

  const openCasesModal = useCallback(
    (swimLaneType: SwimlaneType) => {
      openCasesModalCallback({
        swimlane_type: swimLaneType,
        ...(swimLaneType === SWIMLANE_TYPE.VIEW_BY
          ? {
              view_by: viewBySwimlaneFieldName,
            }
          : {}),
        // For cases attachment, pass just the job IDs to maintain stale data
        job_ids: selectedJobs?.map((v) => v.id) ?? [],
        time_range: globalTimeRange,
      });
    },
    [openCasesModalCallback, selectedJobs, globalTimeRange, viewBySwimlaneFieldName]
  );

  const annotations = useMemo(() => overallAnnotations.annotationsData, [overallAnnotations]);

  const closePopoverOnAction = useCallback(
    (actionCallback: Function) => {
      return () => {
        setIsMenuOpen(false);
        actionCallback();
      };
    },
    [setIsMenuOpen]
  );

  const menuPanels = useMemo<EuiContextMenuPanelDescriptor[]>(() => {
    const rootItems: EuiContextMenuPanelItemDescriptor[] = [];
    const panels: EuiContextMenuPanelDescriptor[] = [{ id: 0, items: rootItems }];

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
        'data-test-subj': 'mlAnomalyTimelinePanelAddToDashboardButton',
      });

      panels.push({
        id: 'addToDashboardPanel',
        title: i18n.translate('xpack.ml.explorer.addToDashboardLabel', {
          defaultMessage: 'Add to dashboard',
        }),
        items: [
          {
            name: <FormattedMessage id="xpack.ml.explorer.overallLabel" defaultMessage="Overall" />,

            onClick: closePopoverOnAction(setSelectedSwimlane.bind(null, SWIMLANE_TYPE.OVERALL)),
            'data-test-subj': 'mlAnomalyTimelinePanelAddOverallToDashboardButton',
          },
          {
            name: (
              <FormattedMessage
                id="xpack.ml.explorer.viewByFieldLabel"
                defaultMessage="View by {viewByField}"
                values={{ viewByField: viewBySwimlaneFieldName }}
              />
            ),

            onClick: closePopoverOnAction(setSelectedSwimlane.bind(null, SWIMLANE_TYPE.VIEW_BY)),
            'data-test-subj': 'mlAnomalyTimelinePanelAddViewByToDashboardButton',
          },
        ],
      });
    }

    const casesPrivileges = cases?.helpers.canUseCases();

    if ((!!casesPrivileges?.create || !!casesPrivileges?.update) && selectCaseModal) {
      rootItems.push({
        panel: 1,
        name: (
          <FormattedMessage id="xpack.ml.explorer.attachToCaseLabel" defaultMessage="Add to case" />
        ),
        icon: 'casesApp',
        'data-test-subj': 'mlAnomalyTimelinePanelAttachToCaseButton',
      });

      panels.push({
        id: 1,
        initialFocusedItemIndex: 0,
        title: (
          <FormattedMessage id="xpack.ml.explorer.attachToCaseLabel" defaultMessage="Add to case" />
        ),
        items: [
          {
            name: (
              <FormattedMessage
                id="xpack.ml.explorer.attachOverallSwimLane"
                defaultMessage="Overall"
              />
            ),
            onClick: closePopoverOnAction(openCasesModal.bind(null, SWIMLANE_TYPE.OVERALL)),
            'data-test-subj': 'mlAnomalyTimelinePanelAttachOverallButton',
          },
          {
            name: (
              <FormattedMessage
                id="xpack.ml.explorer.attachViewBySwimLane"
                defaultMessage="View by {viewByField}"
                values={{ viewByField: viewBySwimlaneFieldName }}
              />
            ),
            onClick: closePopoverOnAction(openCasesModal.bind(null, SWIMLANE_TYPE.VIEW_BY)),
            'data-test-subj': 'mlAnomalyTimelinePanelAttachViewByButton',
          },
        ],
      });
    }

    return panels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEditDashboards, openCasesModal, viewBySwimlaneFieldName]);

  // If selecting a cell in the 'view by' swimlane, indicate the corresponding time in the Overall swimlane.
  const overallCellSelection: AppStateSelectedCells | undefined = useMemo(() => {
    if (!selectedCells) return;

    if (selectedCells.type === SWIMLANE_TYPE.OVERALL) return selectedCells;

    return {
      type: SWIMLANE_TYPE.OVERALL,
      lanes: [OVERALL_LABEL],
      times: selectedCells.times,
    };
  }, [selectedCells]);

  const annotationXDomain = useMemo(
    () =>
      AnomalyTimelineService.isOverallSwimlaneData(overallSwimlaneData)
        ? {
            min: overallSwimlaneData.earliest * 1000,
            max: overallSwimlaneData.latest * 1000,
            minInterval: overallSwimlaneData.interval * 1000,
          }
        : undefined,
    [overallSwimlaneData]
  );

  const onResize = useCallback((value: number) => {
    anomalyTimelineStateService.setContainerWidth(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSaveCallback: SaveModalDashboardProps['onSave'] = useCallback(
    async ({ dashboardId, newTitle, newDescription }) => {
      if (!selectedJobs) return;

      const stateTransfer = embeddable!.getStateTransfer();

      const embeddableInput: Partial<AnomalySwimLaneEmbeddableState> = {
        title: newTitle,
        description: newDescription,
        job_ids: mergedGroupsAndJobsIds,
        swimlane_type: selectedSwimlane,
        ...(selectedSwimlane === SWIMLANE_TYPE.VIEW_BY
          ? {
              view_by: viewBySwimlaneFieldName,
            }
          : {}),
      };

      const state = {
        serializedState: embeddableInput,
        type: ANOMALY_SWIMLANE_EMBEDDABLE_TYPE,
      };

      const path = dashboardId === 'new' ? '#/create' : `#/view/${dashboardId}`;

      stateTransfer.navigateToWithEmbeddablePackages('dashboards', {
        state: [state],
        path,
      });
    },
    [embeddable, mergedGroupsAndJobsIds, selectedJobs, selectedSwimlane, viewBySwimlaneFieldName]
  );

  return (
    <>
      <EuiPanel paddingSize="m" hasShadow={false} hasBorder>
        <EuiFlexGroup direction="row" gutterSize="xs" responsive={false} alignItems="baseline">
          <EuiFlexItem grow={false}>
            <EuiTitle size={'xs'}>
              <h2>
                <FormattedMessage
                  id="xpack.ml.explorer.anomalyTimelineTitle"
                  defaultMessage="Anomaly timeline"
                />
              </h2>
            </EuiTitle>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <AnomalyTimelineHelpPopover />
          </EuiFlexItem>

          {menuPanels[0].items!.length > 0 ? (
            <EuiFlexItem
              grow={false}
              css={{ marginLeft: 'auto !important', alignSelf: 'baseline' }}
            >
              <EuiPopover
                aria-label={i18n.translate('xpack.ml.explorer.swimlane.actionsPopoverAriaLabel', {
                  defaultMessage: 'Anomaly swim lane actions menu',
                })}
                button={
                  <EuiToolTip
                    content={i18n.translate('xpack.ml.explorer.swimlaneActions', {
                      defaultMessage: 'Actions',
                    })}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      size="s"
                      aria-label={i18n.translate('xpack.ml.explorer.swimlaneActions', {
                        defaultMessage: 'Actions',
                      })}
                      color="text"
                      display="base"
                      isSelected={isMenuOpen}
                      iconType="boxesVertical"
                      onClick={setIsMenuOpen.bind(null, !isMenuOpen)}
                      data-test-subj="mlAnomalyTimelinePanelMenu"
                    />
                  </EuiToolTip>
                }
                isOpen={isMenuOpen}
                closePopover={setIsMenuOpen.bind(null, false)}
                panelPaddingSize="none"
                anchorPosition="downLeft"
              >
                <EuiContextMenu initialPanelId={0} panels={menuPanels} />
              </EuiPopover>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        <EuiFlexGroup direction="row" gutterSize="m" alignItems="baseline" wrap>
          {viewBySwimlaneOptions.length > 0 && (
            <>
              <EuiFlexItem grow={false}>
                <EuiSelect
                  prepend={viewByLabel}
                  aria-label={viewByLabel}
                  compressed
                  id="selectViewBy"
                  options={mapSwimlaneOptionsToEuiOptions(viewBySwimlaneOptions)}
                  value={viewBySwimlaneFieldName}
                  onChange={(e) => {
                    anomalyTimelineStateService.setViewBySwimLaneFieldName(e.target.value);
                  }}
                />
              </EuiFlexItem>
            </>
          )}

          <EuiFlexItem grow={false} css={{ minWidth: '280px' }}>
            <SeverityLegendControl
              allSeverityOptions={severityOptions}
              selectedSeverities={selectedSeverityOptions}
              onChange={handleSeverityChange}
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        <EuiFlexGroup direction="row" gutterSize="m" responsive={false} alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiText size={'xs'} color={'subdued'}>
              {viewByLoadedForTimeFormatted && (
                <FormattedMessage
                  id="xpack.ml.explorer.sortedByMaxAnomalyScoreForTimeFormattedLabel"
                  defaultMessage="(Sorted by max anomaly score for {viewByLoadedForTimeFormatted})"
                  values={{ viewByLoadedForTimeFormatted }}
                />
              )}
              {isDefined(viewByLoadedForTimeFormatted) ? null : (
                <FormattedMessage
                  id="xpack.ml.explorer.sortedByMaxAnomalyScoreLabel"
                  defaultMessage="(Sorted by max anomaly score)"
                />
              )}
              {filterActive === true && viewBySwimlaneFieldName === VIEW_BY_JOB_LABEL && (
                <FormattedMessage
                  id="xpack.ml.explorer.jobScoreAcrossAllInfluencersLabel"
                  defaultMessage="(Job score across all influencers)"
                />
              )}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false} css={{ visibility: selectedCells ? 'visible' : 'hidden' }}>
            <EuiButtonEmpty
              size="xs"
              onClick={setSelectedCells.bind(anomalyTimelineStateService, undefined)}
              data-test-subj="mlAnomalyTimelineClearSelection"
            >
              <FormattedMessage
                id="xpack.ml.explorer.clearSelectionLabel"
                defaultMessage="Clear selection"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {annotationXDomain && Array.isArray(annotations) && annotations.length > 0 ? (
          <>
            <MlTooltipComponent>
              {(tooltipService) => (
                <SwimlaneAnnotationContainer
                  chartWidth={swimlaneContainerWidth!}
                  domain={annotationXDomain}
                  annotationsData={annotations}
                  tooltipService={tooltipService}
                />
              )}
            </MlTooltipComponent>
            <EuiSpacer size="m" />
          </>
        ) : null}

        <SwimLaneWrapper
          selection={overallCellSelection}
          swimlaneContainerWidth={swimlaneContainerWidth}
          swimLaneData={overallSwimlaneData as OverallSwimlaneData}
        >
          <SwimlaneContainer
            id="overall"
            data-test-subj="mlAnomalyExplorerSwimlaneOverall"
            filterActive={filterActive}
            timeBuckets={timeBuckets}
            swimlaneData={overallSwimlaneData as OverallSwimlaneData}
            swimlaneType={SWIMLANE_TYPE.OVERALL}
            selection={overallCellSelection}
            onCellsSelection={setSelectedCells}
            onResize={onResize}
            isLoading={loading}
            noDataWarning={
              <EuiText textAlign={'center'} size="s">
                <strong>
                  <NoOverallData />
                </strong>
              </EuiText>
            }
            showTimeline={false}
            showLegend={false}
            yAxisWidth={Y_AXIS_LABEL_WIDTH}
            chartsService={chartsService}
          />
        </SwimLaneWrapper>

        <EuiSpacer size="m" />
        {viewBySwimlaneOptions.length > 0 && (
          <SwimlaneContainer
            id="view_by"
            data-test-subj="mlAnomalyExplorerSwimlaneViewBy"
            filterActive={filterActive}
            timeBuckets={timeBuckets}
            showLegend={false}
            swimlaneData={viewBySwimlaneData as ViewBySwimLaneData}
            swimlaneType={SWIMLANE_TYPE.VIEW_BY}
            selection={selectedCells}
            onCellsSelection={setSelectedCells}
            onResize={onResize}
            fromPage={viewByFromPage}
            perPage={viewByPerPage}
            swimlaneLimit={swimlaneLimit}
            chartsService={chartsService}
            onPaginationChange={({ perPage: perPageUpdate, fromPage: fromPageUpdate }) => {
              if (perPageUpdate) {
                anomalyTimelineStateService.setSwimLanePagination({
                  viewByPerPage: perPageUpdate,
                });
              }
              if (fromPageUpdate) {
                anomalyTimelineStateService.setSwimLanePagination({
                  viewByFromPage: fromPageUpdate,
                });
              }
            }}
            isLoading={loading || viewBySwimlaneDataLoading}
            yAxisWidth={Y_AXIS_LABEL_WIDTH}
            noDataWarning={
              <EuiText textAlign={'center'} size="s">
                <strong>
                  {typeof viewBySwimlaneFieldName === 'string' ? (
                    viewBySwimlaneFieldName === VIEW_BY_JOB_LABEL ? (
                      <FormattedMessage
                        id="xpack.ml.explorer.noResultForSelectedJobsMessage"
                        defaultMessage="No results found for selected {jobsCount, plural, one {job} other {jobs}}"
                        values={{ jobsCount: selectedJobs?.length ?? 1 }}
                      />
                    ) : (
                      <ExplorerNoInfluencersFound
                        viewBySwimlaneFieldName={viewBySwimlaneFieldName}
                        showFilterMessage={filterActive === true}
                      />
                    )
                  ) : null}
                </strong>
              </EuiText>
            }
          />
        )}
      </EuiPanel>
      {selectedSwimlane && selectedJobs ? (
        <SavedObjectSaveModalDashboard
          canSaveByReference={false}
          objectType={i18n.translate('xpack.ml.anomalySwimLane.objectTypeLabel', {
            defaultMessage: 'Anomaly swim lane',
          })}
          documentInfo={{
            title: getDefaultSwimlanePanelTitle(mergedGroupsAndJobsIds),
          }}
          onClose={() => {
            setSelectedSwimlane(undefined);
          }}
          onSave={onSaveCallback}
        />
      ) : null}
    </>
  );
};
