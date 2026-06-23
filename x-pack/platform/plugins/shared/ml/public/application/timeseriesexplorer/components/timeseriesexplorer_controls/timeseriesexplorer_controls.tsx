/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useState } from 'react';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiCheckbox,
  EuiContextMenu,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { SaveModalDashboardProps } from '@kbn/presentation-util-plugin/public';
import { SavedObjectSaveModalDashboard } from '@kbn/presentation-util-plugin/public';
import { useTimeRangeUpdates } from '@kbn/ml-date-picker';
import type { MlJobState } from '@elastic/elasticsearch/lib/api/types';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import type { CombinedJobWithStats } from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import { ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/single_metric_viewer';
import { CASES_TOAST_MESSAGES_TITLES } from '../../../../cases/constants';
import { useMlKibana } from '../../../contexts/kibana';
import { useCasesModal } from '../../../contexts/kibana/use_cases_modal';
import { getDefaultSingleMetricViewerPanelTitle } from '../../../../embeddables/single_metric_viewer/get_default_panel_title';
import type { MlEntity } from '../../../../embeddables';
import { ForecastingModal } from '../forecasting_modal/forecasting_modal';
import type { Entity } from '../entity_control/entity_control';

interface Props {
  forecastId?: string;
  selectedDetectorIndex: number;
  selectedEntities?: MlEntity;
  showAnnotationsCheckbox: boolean;
  showAnnotations: boolean;
  showForecastCheckbox: boolean;
  showForecast: boolean;
  showModelBoundsCheckbox: boolean;
  showModelBounds: boolean;
  onShowModelBoundsChange: () => void;
  onShowAnnotationsChange: () => void;
  onShowForecastChange: () => void;
  fullRefresh: boolean;
  loading: boolean;
  hasResults: boolean;
  selectedJob: CombinedJobWithStats;
  selectedJobId: string;
  jobs: CombinedJobWithStats[];
  setForecastId: (forecastId: string) => void;
  entities: Entity[];
  jobState: MlJobState;
  earliestRecordTimestamp: number;
  latestRecordTimestamp: number;
}

export const TimeSeriesExplorerControls: FC<Props> = ({
  forecastId,
  selectedDetectorIndex,
  selectedEntities,
  selectedJobId,
  showAnnotations,
  showAnnotationsCheckbox,
  showForecast,
  showForecastCheckbox,
  showModelBounds,
  showModelBoundsCheckbox,
  onShowAnnotationsChange,
  onShowModelBoundsChange,
  onShowForecastChange,
  fullRefresh,
  loading,
  hasResults,
  setForecastId,
  selectedJob,
  entities,
  jobs,
  jobState,
  earliestRecordTimestamp,
  latestRecordTimestamp,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [createInDashboard, setCreateInDashboard] = useState<boolean>(false);

  const {
    services: {
      application: { capabilities },
      cases,
      embeddable,
    },
  } = useMlKibana();

  const globalTimeRange = useTimeRangeUpdates(true);

  const canEditDashboards = capabilities.dashboard_v2?.createNew ?? false;

  const closePopoverOnAction = useCallback(
    (actionCallback: Function) => {
      return () => {
        setIsMenuOpen(false);
        actionCallback();
      };
    },
    [setIsMenuOpen]
  );

  const openCasesModalCallback = useCasesModal(
    ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE,
    CASES_TOAST_MESSAGES_TITLES.SINGLE_METRIC_VIEWER
  );

  const showControls =
    (fullRefresh === false || loading === false) && hasResults === true && jobs.length > 0;

  const menuPanels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      items: [
        {
          name: (
            <FormattedMessage
              id="xpack.ml.timeseriesExplorer.addToDashboardLabel"
              defaultMessage="Add to dashboard"
            />
          ),
          icon: 'dashboardApp',
          onClick: closePopoverOnAction(() => {
            setCreateInDashboard(true);
          }),
        },
      ],
    },
  ];

  const casesPrivileges = cases?.helpers.canUseCases();

  if (!!casesPrivileges?.create || !!casesPrivileges?.update) {
    menuPanels[0].items!.push({
      name: (
        <FormattedMessage
          id="xpack.ml.timeseriesExplorer.addToCaseLabel"
          defaultMessage="Add to case"
        />
      ),
      icon: 'casesApp',
      onClick: closePopoverOnAction(() => {
        openCasesModalCallback({
          forecast_id: forecastId,
          job_ids: [selectedJobId],
          selected_detector_index: selectedDetectorIndex,
          selected_entities: selectedEntities,
          time_range: globalTimeRange,
        });
      }),
    });
  }

  const onSaveCallback: SaveModalDashboardProps['onSave'] = useCallback(
    async ({ dashboardId, newTitle, newDescription }) => {
      const stateTransfer = embeddable!.getStateTransfer();

      const embeddableInput: Partial<SingleMetricViewerEmbeddableState> = {
        title: newTitle,
        description: newDescription,
        forecast_id: forecastId,
        job_ids: [selectedJobId],
        selected_detector_index: selectedDetectorIndex,
        selected_entities: selectedEntities,
      };

      const state = {
        serializedState: embeddableInput,
        type: ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE,
      };

      const path = dashboardId === 'new' ? '#/create' : `#/view/${dashboardId}`;

      stateTransfer.navigateToWithEmbeddablePackages('dashboards', {
        state: [state],
        path,
      });
    },
    [embeddable, selectedJobId, selectedDetectorIndex, selectedEntities, forecastId]
  );

  return (
    <>
      <EuiFlexGroup
        style={{ float: 'right' }}
        alignItems="center"
        justifyContent="flexEnd"
        gutterSize="s"
      >
        {showModelBoundsCheckbox && showControls && (
          <EuiFlexItem grow={false} css={{ minWidth: '170px' }}>
            <EuiFormRow hasEmptyLabelSpace>
              <EuiCheckbox
                id="toggleModelBoundsCheckbox"
                label={i18n.translate('xpack.ml.timeSeriesExplorer.showModelBoundsLabel', {
                  defaultMessage: 'show model bounds',
                })}
                checked={showModelBounds}
                onChange={onShowModelBoundsChange}
              />
            </EuiFormRow>
          </EuiFlexItem>
        )}

        {showAnnotationsCheckbox && showControls && (
          <EuiFlexItem grow={false}>
            <EuiFormRow hasEmptyLabelSpace>
              <EuiCheckbox
                id="toggleAnnotationsCheckbox"
                label={i18n.translate('xpack.ml.timeSeriesExplorer.annotationsLabel', {
                  defaultMessage: 'annotations',
                })}
                checked={showAnnotations}
                onChange={onShowAnnotationsChange}
              />
            </EuiFormRow>
          </EuiFlexItem>
        )}

        {showForecastCheckbox && showControls && (
          <EuiFlexItem grow={false} css={{ minWidth: '120px' }}>
            <EuiFormRow hasEmptyLabelSpace>
              <EuiCheckbox
                id="toggleShowForecastCheckbox"
                label={
                  <span data-test-subj={'mlForecastCheckbox'}>
                    {i18n.translate('xpack.ml.timeSeriesExplorer.showForecastLabel', {
                      defaultMessage: 'show forecast',
                    })}
                  </span>
                }
                checked={showForecast}
                onChange={onShowForecastChange}
              />
            </EuiFormRow>
          </EuiFlexItem>
        )}

        <EuiFormRow hasEmptyLabelSpace>
          <ForecastingModal
            job={selectedJob}
            jobState={jobState}
            detectorIndex={selectedDetectorIndex}
            entities={entities}
            earliestRecordTimestamp={earliestRecordTimestamp}
            latestRecordTimestamp={latestRecordTimestamp}
            setForecastId={setForecastId}
            className="forecast-controls"
            selectedForecastId={forecastId}
          />
        </EuiFormRow>

        {canEditDashboards && showControls ? (
          <EuiFlexItem grow={false}>
            <EuiFormRow hasEmptyLabelSpace>
              <EuiPopover
                button={
                  <EuiToolTip
                    content={i18n.translate('xpack.ml.timeSeriesExplorer.controlsActionsTooltip', {
                      defaultMessage: 'Actions',
                    })}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      aria-label={i18n.translate(
                        'xpack.ml.timeSeriesExplorer.controlsActionsAriaLabel',
                        {
                          defaultMessage: 'Actions',
                        }
                      )}
                      color="text"
                      display="base"
                      isSelected={isMenuOpen}
                      iconType="boxesVertical"
                      onClick={setIsMenuOpen.bind(null, !isMenuOpen)}
                      data-test-subj="mlTimeSeriesExplorerActionsMenu"
                      size="m"
                    />
                  </EuiToolTip>
                }
                isOpen={isMenuOpen}
                closePopover={setIsMenuOpen.bind(null, false)}
                panelPaddingSize="none"
                anchorPosition="downLeft"
                aria-label={i18n.translate(
                  'xpack.ml.timeSeriesExplorer.controls.popoverAriaLabel',
                  {
                    defaultMessage: 'Single metric viewer actions',
                  }
                )}
              >
                <EuiContextMenu initialPanelId={0} panels={menuPanels} />
              </EuiPopover>
            </EuiFormRow>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
      {createInDashboard ? (
        <SavedObjectSaveModalDashboard
          canSaveByReference={false}
          objectType={i18n.translate('xpack.ml.cases.singleMetricViewer.displayName', {
            defaultMessage: 'Single Metric Viewer',
          })}
          documentInfo={{
            title: getDefaultSingleMetricViewerPanelTitle(selectedJobId),
          }}
          onClose={() => setCreateInDashboard(false)}
          onSave={onSaveCallback}
        />
      ) : null}
    </>
  );
};
