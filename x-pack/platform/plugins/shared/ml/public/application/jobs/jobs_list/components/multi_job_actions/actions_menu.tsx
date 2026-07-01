/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useState } from 'react';

import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { MlSummaryJob } from '@kbn/ml-common-types/anomaly_detection_jobs/summary_job';
import { UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER } from '@kbn/ui-actions-plugin/common/trigger_ids';

import { usePermissionCheck } from '../../../../capabilities/check_capabilities';
import { mlNodesAvailable } from '../../../../ml_nodes_check/check_ml_nodes';
import { useMlApi, useMlKibana } from '../../../../contexts/kibana';
import { isManagedJob } from '../../../jobs_utils';
import {
  closeJobs,
  stopDatafeeds,
  isStartable,
  isStoppable,
  isClosable,
  isResettable,
} from '../utils';

interface Props {
  jobs: MlSummaryJob[];
  showStartDatafeedModal: (jobs: MlSummaryJob[]) => void;
  showDeleteJobModal: (jobs: MlSummaryJob[]) => void;
  showCloseJobsConfirmModal: (jobs: MlSummaryJob[]) => void;
  showResetJobModal: (jobs: MlSummaryJob[]) => void;
  showStopDatafeedsConfirmModal: (jobs: MlSummaryJob[]) => void;
  refreshJobs: () => void;
  showCreateAlertFlyout: (jobIds: string[]) => void;
}

export const MultiJobActionsMenu: FC<Props> = ({
  jobs,
  showStartDatafeedModal,
  showDeleteJobModal,
  showCloseJobsConfirmModal,
  showResetJobModal,
  showStopDatafeedsConfirmModal,
  refreshJobs,
  showCreateAlertFlyout,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const {
    services: {
      notifications: { toasts: toastNotifications },
      uiActions,
      cps,
    },
  } = useMlKibana();
  const mlApi = useMlApi();

  const [
    canUpdateDatafeed,
    canDeleteJob,
    canStartStopDatafeedCap,
    canCloseJobCap,
    canCreateMlAlerts,
  ] = usePermissionCheck([
    'canUpdateDatafeed',
    'canDeleteJob',
    'canStartStopDatafeed',
    'canCloseJob',
    'canCreateMlAlerts',
  ]);

  const canStartStopDatafeed = canStartStopDatafeedCap && mlNodesAvailable();
  const canCloseJob = canCloseJobCap && mlNodesAvailable();
  const canUpdateProjectRouting = cps?.cpsManager && canUpdateDatafeed;

  const onButtonClick = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const closePopover = useCallback(() => {
    setIsOpen(false);
  }, []);

  const anyJobsBlocked = jobs.some((j) => j.blocked !== undefined);

  const button = (
    <EuiToolTip
      content={i18n.translate('xpack.ml.jobsList.multiJobActionsMenu.managementActionsAriaLabel', {
        defaultMessage: 'Management actions',
      })}
    >
      <EuiButtonIcon
        size="s"
        onClick={onButtonClick}
        iconType="gear"
        aria-label={i18n.translate(
          'xpack.ml.jobsList.multiJobActionsMenu.managementActionsAriaLabel',
          {
            defaultMessage: 'Management actions',
          }
        )}
        color="text"
        disabled={
          anyJobsBlocked ||
          (canDeleteJob === false && canStartStopDatafeed === false && canUpdateDatafeed === false)
        }
        data-test-subj="mlADJobListMultiSelectManagementActionsButton"
      />
    </EuiToolTip>
  );

  const items: React.ReactElement[] = [
    <EuiContextMenuItem
      key="delete"
      icon="trash"
      disabled={canDeleteJob === false}
      onClick={() => {
        showDeleteJobModal(jobs);
        closePopover();
      }}
      data-test-subj="mlADJobListMultiSelectDeleteJobActionButton"
    >
      <FormattedMessage
        id="xpack.ml.jobsList.multiJobsActions.deleteJobsLabel"
        defaultMessage="Delete {jobsCount, plural, one {job} other {jobs}}"
        values={{ jobsCount: jobs.length }}
      />
    </EuiContextMenuItem>,
  ];

  if (canUpdateProjectRouting) {
    items.push(
      <EuiContextMenuItem
        key="update project routing"
        icon="crossProjectSearch"
        disabled={false}
        onClick={() => {
          void uiActions.executeTriggerActions(UPDATE_AD_JOBS_PROJECT_ROUTING_TRIGGER, {
            initialJobIds: jobs.map((j) => j.id),
            allowScopeSelection: true,
            onClose: () => {
              refreshJobs();
            },
          });
          closePopover();
        }}
        data-test-subj="mlADJobListMultiSelectUpdateProjectRoutingActionButton"
      >
        <FormattedMessage
          id="xpack.ml.jobsList.multiJobsActions.updateProjectRoutingLabel"
          defaultMessage="Change project routing"
        />
      </EuiContextMenuItem>
    );
  }

  if (isClosable(jobs)) {
    items.push(
      <EuiContextMenuItem
        key="close job"
        icon="cross"
        disabled={canCloseJob === false}
        onClick={() => {
          if (jobs.some((j) => isManagedJob(j))) {
            showCloseJobsConfirmModal(jobs);
          } else {
            void closeJobs(toastNotifications, mlApi, jobs);
          }

          closePopover();
        }}
        data-test-subj="mlADJobListMultiSelectCloseJobActionButton"
      >
        <FormattedMessage
          id="xpack.ml.jobsList.multiJobsActions.closeJobsLabel"
          defaultMessage="Close {jobsCount, plural, one {job} other {jobs}}"
          values={{ jobsCount: jobs.length }}
        />
      </EuiContextMenuItem>
    );
  }

  if (isResettable(jobs)) {
    items.push(
      <EuiContextMenuItem
        key="reset job"
        icon="refresh"
        disabled={canCloseJob === false}
        onClick={() => {
          showResetJobModal(jobs);
          closePopover();
        }}
        data-test-subj="mlADJobListMultiSelectResetJobActionButton"
      >
        <FormattedMessage
          id="xpack.ml.jobsList.multiJobsActions.resetJobsLabel"
          defaultMessage="Reset {jobsCount, plural, one {job} other {jobs}}"
          values={{ jobsCount: jobs.length }}
        />
      </EuiContextMenuItem>
    );
  }

  if (isStoppable(jobs)) {
    items.push(
      <EuiContextMenuItem
        key="stop datafeed"
        icon="stop"
        disabled={canStartStopDatafeed === false}
        onClick={() => {
          if (jobs.some((j) => isManagedJob(j))) {
            showStopDatafeedsConfirmModal(jobs);
          } else {
            void stopDatafeeds(toastNotifications, mlApi, jobs, refreshJobs);
          }
          closePopover();
        }}
        data-test-subj="mlADJobListMultiSelectStopDatafeedActionButton"
      >
        <FormattedMessage
          id="xpack.ml.jobsList.multiJobsActions.stopDatafeedsLabel"
          defaultMessage="Stop {jobsCount, plural, one {datafeed} other {datafeeds}}"
          values={{ jobsCount: jobs.length }}
        />
      </EuiContextMenuItem>
    );
  }

  if (isStartable(jobs)) {
    items.push(
      <EuiContextMenuItem
        key="start datafeed"
        icon="play"
        disabled={canStartStopDatafeed === false}
        onClick={() => {
          showStartDatafeedModal(jobs);
          closePopover();
        }}
        data-test-subj="mlADJobListMultiSelectStartDatafeedActionButton"
      >
        <FormattedMessage
          id="xpack.ml.jobsList.multiJobsActions.startDatafeedsLabel"
          defaultMessage="Start {jobsCount, plural, one {datafeed} other {datafeeds}}"
          values={{ jobsCount: jobs.length }}
        />
      </EuiContextMenuItem>
    );
  }

  if (canCreateMlAlerts && jobs.length === 1) {
    items.push(
      <EuiContextMenuItem
        key="create alert"
        icon="bell"
        disabled={false}
        onClick={() => {
          showCreateAlertFlyout(jobs.map(({ id }) => id));
          closePopover();
        }}
        data-test-subj="mlADJobListMultiSelectCreateAlertActionButton"
      >
        <FormattedMessage
          id="xpack.ml.jobsList.multiJobsActions.createAlertsLabel"
          defaultMessage="Create alert rule"
        />
      </EuiContextMenuItem>
    );
  }

  return (
    <EuiPopover
      button={button}
      isOpen={isOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downCenter"
      aria-label={i18n.translate('xpack.ml.jobsList.multiJobActionsMenu.actionsPopoverAriaLabel', {
        defaultMessage: 'Multi-job actions menu',
      })}
    >
      <EuiContextMenuPanel items={items.reverse()} />
    </EuiPopover>
  );
};
