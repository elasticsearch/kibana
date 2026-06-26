/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';

import { i18n } from '@kbn/i18n';

import { useTimefilter } from '@kbn/ml-date-picker';
import { ML_JOB_ID } from '@kbn/ml-anomaly-utils';
import { useTimeBuckets } from '@kbn/ml-time-buckets';
import type { MlJobWithTimeRange } from '@kbn/ml-common-types/anomaly_detection_jobs/summary_job';
import { useMlKibana } from '../../../contexts/kibana';

import { useRefresh } from '../../use_refresh';
import { Explorer } from '../../../explorer';
import { useJobSelection } from '../../../components/job_selector/use_job_selection';
import { useTableSeverity } from '../../../components/controls/select_severity';
import { MlAppHeader } from '../../../components/ml_app_header';
import { AnomalyDetectionEmptyState } from '../../../jobs/jobs_list/components/anomaly_detection_empty_state';
import { useAnomalyExplorerContext } from '../../../explorer/anomaly_explorer_context';
import { getInfluencers } from '../../../explorer/explorer_utils';
import { useMlJobService } from '../../../services/job_service';

export interface ExplorerUrlStateManagerProps {
  jobsWithTimeRange: MlJobWithTimeRange[];
}

export const ExplorerUrlStateManager: FC<ExplorerUrlStateManagerProps> = ({
  jobsWithTimeRange,
}) => {
  const {
    services: { cases, uiSettings, mlServices },
  } = useMlKibana();
  const { mlApi } = mlServices;

  const [stoppedPartitions, setStoppedPartitions] = useState<string[] | undefined>();

  const timeBuckets = useTimeBuckets(uiSettings);
  const timefilter = useTimefilter({ timeRangeSelector: true, autoRefreshSelector: true });
  const mlJobService = useMlJobService();
  const { selectedIds: jobIds, selectedJobs } = useJobSelection(jobsWithTimeRange);
  const noInfluencersConfigured = getInfluencers(mlJobService, selectedJobs).length === 0;

  const selectedJobsRunning = jobsWithTimeRange.some(
    (job) => jobIds?.includes(job.id) && job.isRunning === true
  );

  const anomalyExplorerContext = useAnomalyExplorerContext();

  const refresh = useRefresh();

  const getJobsWithStoppedPartitions = useCallback(async (selectedJobIds: string[]) => {
    try {
      const fetchedStoppedPartitions = await mlApi.results.getCategoryStoppedPartitions(
        selectedJobIds,
        ML_JOB_ID
      );
      if (
        fetchedStoppedPartitions &&
        Array.isArray(fetchedStoppedPartitions.jobs) &&
        fetchedStoppedPartitions.jobs.length > 0
      ) {
        setStoppedPartitions(fetchedStoppedPartitions.jobs);
      } else {
        setStoppedPartitions(undefined);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (jobIds && jobIds.length > 0) {
      getJobsWithStoppedPartitions(jobIds);
    }
  }, [getJobsWithStoppedPartitions, jobIds]);

  const [tableSeverity] = useTableSeverity();

  const showCharts = useObservable(
    anomalyExplorerContext.chartsStateService.getShowCharts$(),
    anomalyExplorerContext.chartsStateService.getShowCharts()
  );

  const selectedCells = useObservable(
    anomalyExplorerContext.anomalyTimelineStateService.getSelectedCells$(),
    anomalyExplorerContext.anomalyTimelineStateService.getSelectedCells()
  );

  const swimLaneSeverity = useObservable(
    anomalyExplorerContext.anomalyTimelineStateService.getSwimLaneSeverity$(),
    anomalyExplorerContext.anomalyTimelineStateService.getSwimLaneSeverity()
  );

  const overallSwimlaneData = useObservable(
    anomalyExplorerContext.anomalyTimelineStateService.getOverallSwimLaneData$(),
    null
  );

  if (refresh === undefined) {
    return null;
  }

  const CasesContext = cases?.ui.getCasesContext() ?? React.Fragment;

  const casesPermissions = cases?.helpers.canUseCases();

  return (
    <div className="ml-explorer">
      <MlAppHeader
        title={i18n.translate('xpack.ml.explorer.pageTitle', {
          defaultMessage: 'Anomaly Explorer',
        })}
        showDatePicker
      />
      <CasesContext owner={[]} permissions={casesPermissions!}>
        {jobsWithTimeRange.length === 0 ? (
          <AnomalyDetectionEmptyState showDocsLink iconSize="m" />
        ) : (
          <Explorer
            {...{
              noInfluencersConfigured,
              overallSwimlaneData,
              showCharts,
              severity: tableSeverity.val,
              stoppedPartitions,
              selectedJobsRunning,
              timeBuckets,
              timefilter,
              selectedCells,
              swimLaneSeverity,
            }}
          />
        )}
      </CasesContext>
    </div>
  );
};
