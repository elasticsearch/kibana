/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useMemo } from 'react';

import { EuiButtonIcon, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { MlSummaryJob } from '@kbn/ml-common-types/anomaly_detection_jobs/summary_job';

import { useCreateADLinks } from '../../../../components/custom_hooks/use_create_ad_links';

interface Props {
  jobs: MlSummaryJob[];
}

export const ResultLinks: FC<Props> = ({ jobs }) => {
  const openJobsInSingleMetricViewerText = i18n.translate(
    'xpack.ml.jobsList.resultActions.openJobsInSingleMetricViewerText',
    {
      defaultMessage:
        'Open {jobsCount, plural, one {{jobId}} other {# jobs}} in Single Metric Viewer',
      values: {
        jobsCount: jobs.length,
        jobId: jobs[0].id,
      },
    }
  );
  const openJobsInAnomalyExplorerText = i18n.translate(
    'xpack.ml.jobsList.resultActions.openJobsInAnomalyExplorerText',
    {
      defaultMessage: 'Open {jobsCount, plural, one {{jobId}} other {# jobs}} in Anomaly Explorer',
      values: {
        jobsCount: jobs.length,
        jobId: jobs[0].id,
      },
    }
  );
  const singleMetricVisible = jobs.length < 2;
  const singleMetricEnabled = jobs.length === 1 && jobs[0].isSingleMetricViewerJob;
  const singleMetricDisabledMessage =
    jobs.length === 1 ? jobs[0].isNotSingleMetricViewerJobMessage : undefined;

  const singleMetricDisabledMessageText =
    singleMetricDisabledMessage !== undefined
      ? i18n.translate('xpack.ml.jobsList.resultActions.singleMetricDisabledMessageText', {
          defaultMessage: 'Disabled because {reason}.',
          values: {
            reason: singleMetricDisabledMessage,
          },
        })
      : undefined;
  const jobActionsDisabled = jobs.length === 1 && jobs[0].blocked !== undefined;
  const { createLinkWithUserDefaults } = useCreateADLinks();
  const timeSeriesExplorerLink = useMemo(
    () => createLinkWithUserDefaults('timeseriesexplorer', jobs),
    [createLinkWithUserDefaults, jobs]
  );
  const anomalyExplorerLink = useMemo(
    () => createLinkWithUserDefaults('explorer', jobs),
    [createLinkWithUserDefaults, jobs]
  );

  return (
    <EuiFlexGroup
      gutterSize="xs"
      justifyContent="flexEnd"
      alignItems="center"
      wrap={false}
      direction="row"
      responsive={false}
    >
      {singleMetricVisible && (
        <EuiFlexItem grow={false}>
          <EuiToolTip
            position="bottom"
            content={singleMetricDisabledMessageText ?? openJobsInSingleMetricViewerText}
          >
            <EuiButtonIcon
              href={timeSeriesExplorerLink}
              iconType="singleMetricViewer"
              aria-label={openJobsInSingleMetricViewerText}
              isDisabled={singleMetricEnabled === false || jobActionsDisabled === true}
              data-test-subj="mlOpenJobsInSingleMetricViewerButton"
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <EuiToolTip
          position="bottom"
          content={openJobsInAnomalyExplorerText}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            href={anomalyExplorerLink}
            iconType="table"
            aria-label={openJobsInAnomalyExplorerText}
            isDisabled={jobActionsDisabled === true}
            data-test-subj="mlOpenJobsInAnomalyExplorerButton"
          />
        </EuiToolTip>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
