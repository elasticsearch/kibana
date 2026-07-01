/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { css } from '@emotion/react';

import { EuiFlexGroup, EuiFlexItem, EuiTitle } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { MlSummaryJob } from '@kbn/ml-common-types/anomaly_detection_jobs/summary_job';

import { ResultLinks } from '../job_actions';
import { MultiJobActionsMenu } from './actions_menu';
import { GroupSelector } from './group_selector';

const cssOverride = css({
  height: '20px',
  width: '1px',
  display: 'inline-block',
  verticalAlign: 'middle',
  margin: '0 5px',
});

interface Props {
  selectedJobs: MlSummaryJob[];
  allJobIds: string[];
  showStartDatafeedModal: (jobs: MlSummaryJob[]) => void;
  showCloseJobsConfirmModal: (jobs: MlSummaryJob[]) => void;
  showDeleteJobModal: (jobs: MlSummaryJob[]) => void;
  showResetJobModal: (jobs: MlSummaryJob[]) => void;
  showStopDatafeedsConfirmModal: (jobs: MlSummaryJob[]) => void;
  refreshJobs: () => void;
  showCreateAlertFlyout: (jobIds: string[]) => void;
}

export const MultiJobActions: FC<Props> = ({
  selectedJobs,
  allJobIds,
  showCloseJobsConfirmModal,
  showStartDatafeedModal,
  showDeleteJobModal,
  showResetJobModal,
  showStopDatafeedsConfirmModal,
  refreshJobs,
  showCreateAlertFlyout,
}) => {
  const jobsSelected = selectedJobs.length > 0;

  return (
    <div
      data-test-subj={`mlADJobListMultiSelectActionsArea ${jobsSelected ? 'active' : 'inactive'}`}
    >
      {jobsSelected ? (
        <EuiFlexGroup
          gutterSize="xs"
          alignItems="center"
          wrap={false}
          direction="row"
          responsive={false}
        >
          <EuiFlexItem grow={false}>
            <EuiTitle size="s">
              <h3>
                <FormattedMessage
                  id="xpack.ml.jobsList.multiJobsActions.jobsSelectedLabel"
                  defaultMessage="{selectedJobsCount, plural, one {# job} other {# jobs}}   selected"
                  values={{ selectedJobsCount: selectedJobs.length }}
                />
              </h3>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <div css={cssOverride} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <ResultLinks jobs={selectedJobs} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <GroupSelector jobs={selectedJobs} allJobIds={allJobIds} refreshJobs={refreshJobs} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <MultiJobActionsMenu
              jobs={selectedJobs}
              showCloseJobsConfirmModal={showCloseJobsConfirmModal}
              showStartDatafeedModal={showStartDatafeedModal}
              showDeleteJobModal={showDeleteJobModal}
              showResetJobModal={showResetJobModal}
              showStopDatafeedsConfirmModal={showStopDatafeedsConfirmModal}
              refreshJobs={refreshJobs}
              showCreateAlertFlyout={showCreateAlertFlyout}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : null}
    </div>
  );
};
