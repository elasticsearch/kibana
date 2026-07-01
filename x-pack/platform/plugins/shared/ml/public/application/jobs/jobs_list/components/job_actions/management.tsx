/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';

import type { EuiTableActionsColumnType } from '@elastic/eui';
import type { ToastsStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import type { MlSummaryJob } from '@kbn/ml-common-types/anomaly_detection_jobs/summary_job';
import type { SharePluginStart } from '@kbn/share-plugin/public';

import { usePermissionCheck } from '../../../../capabilities/check_capabilities';
import { mlNodesAvailable } from '../../../../ml_nodes_check/check_ml_nodes';
import type { MlApi } from '../../../../services/ml_api_service';
import { JOB_ACTION } from '../../../../../../common/constants/job_actions';
import { isManagedJob } from '../../../jobs_utils';
import {
  stopDatafeeds,
  cloneJob,
  closeJobs,
  isStartable,
  isStoppable,
  isClosable,
  isResettable,
} from '../utils';

export interface UseActionsMenuContentArgs {
  toastNotifications: ToastsStart;
  share: SharePluginStart;
  mlApi: MlApi;
  showEditJobFlyout: (job: MlSummaryJob) => void;
  showDatafeedChartFlyout: (job: MlSummaryJob) => void;
  showDeleteJobModal: (jobs: MlSummaryJob[]) => void;
  showResetJobModal: (jobs: MlSummaryJob[]) => void;
  showStartDatafeedModal: (jobs: MlSummaryJob[]) => void;
  showCloseJobsConfirmModal: (jobs: MlSummaryJob[]) => void;
  showStopDatafeedsConfirmModal: (jobs: MlSummaryJob[]) => void;
  refreshJobs: () => void;
  showCreateAlertFlyout: (jobIds: string[]) => void;
}

const isResetEnabled = (item: MlSummaryJob): boolean => {
  if (item.blocked === undefined || item.blocked.reason === JOB_ACTION.RESET) {
    return true;
  }
  return false;
};

const isJobBlocked = (item: MlSummaryJob): boolean => {
  return item.blocked !== undefined;
};

export const useActionsMenuContent = ({
  toastNotifications,
  share,
  mlApi,
  showEditJobFlyout,
  showDatafeedChartFlyout,
  showDeleteJobModal,
  showResetJobModal,
  showStartDatafeedModal,
  showCloseJobsConfirmModal,
  showStopDatafeedsConfirmModal,
  refreshJobs,
  showCreateAlertFlyout,
}: UseActionsMenuContentArgs): EuiTableActionsColumnType<MlSummaryJob>['actions'] => {
  const [
    canCreateJobCap,
    canUpdateJob,
    canDeleteJob,
    canGetDatafeeds,
    canUpdateDatafeed,
    canStartStopDatafeedCap,
    canCloseJobCap,
    canResetJobCap,
    canCreateMlAlerts,
  ] = usePermissionCheck([
    'canCreateJob',
    'canUpdateJob',
    'canDeleteJob',
    'canGetDatafeeds',
    'canUpdateDatafeed',
    'canStartStopDatafeed',
    'canCloseJob',
    'canResetJob',
    'canCreateMlAlerts',
  ]);

  const canCreateJob = canCreateJobCap && mlNodesAvailable();
  const canStartStopDatafeed = canStartStopDatafeedCap && mlNodesAvailable();
  const canCloseJob = canCloseJobCap && mlNodesAvailable();
  const canResetJob = canResetJobCap && mlNodesAvailable();

  return useMemo(
    () => [
      {
        name: i18n.translate('xpack.ml.jobsList.managementActions.startDatafeedLabel', {
          defaultMessage: 'Start datafeed',
        }),
        description: i18n.translate(
          'xpack.ml.jobsList.managementActions.startDatafeedDescription',
          {
            defaultMessage: 'Start datafeed',
          }
        ),
        type: 'icon',
        icon: 'play',
        enabled: (item) => isJobBlocked(item) === false && canStartStopDatafeed,
        available: (item) => isStartable([item]),
        onClick: (item) => {
          showStartDatafeedModal([item]);
        },
        'data-test-subj': 'mlActionButtonStartDatafeed',
      },
      {
        name: i18n.translate('xpack.ml.jobsList.managementActions.stopDatafeedLabel', {
          defaultMessage: 'Stop datafeed',
        }),
        description: i18n.translate('xpack.ml.jobsList.managementActions.stopDatafeedDescription', {
          defaultMessage: 'Stop datafeed',
        }),
        type: 'icon',
        icon: 'stop',
        enabled: (item) => isJobBlocked(item) === false && canStartStopDatafeed,
        available: (item) => isStoppable([item]),
        onClick: (item) => {
          if (isManagedJob(item)) {
            showStopDatafeedsConfirmModal([item]);
          } else {
            stopDatafeeds(toastNotifications, mlApi, [item], refreshJobs);
          }
        },
        'data-test-subj': 'mlActionButtonStopDatafeed',
      },
      {
        name: i18n.translate('xpack.ml.jobsList.managementActions.createAlertLabel', {
          defaultMessage: 'Create alert rule',
        }),
        description: i18n.translate('xpack.ml.jobsList.managementActions.createAlertLabel', {
          defaultMessage: 'Create alert rule',
        }),
        type: 'icon',
        icon: 'bell',
        enabled: (item) => isJobBlocked(item) === false,
        available: () => canCreateMlAlerts,
        onClick: (item) => {
          showCreateAlertFlyout([item.id]);
        },
        'data-test-subj': 'mlActionButtonCreateAlert',
      },
      {
        name: i18n.translate('xpack.ml.jobsList.managementActions.closeJobLabel', {
          defaultMessage: 'Close job',
        }),
        description: i18n.translate('xpack.ml.jobsList.managementActions.closeJobDescription', {
          defaultMessage: 'Close job',
        }),
        type: 'icon',
        icon: 'cross',
        enabled: (item) => isJobBlocked(item) === false && canCloseJob,
        available: (item) => isClosable([item]),
        onClick: (item) => {
          if (isManagedJob(item)) {
            showCloseJobsConfirmModal([item]);
          } else {
            closeJobs(toastNotifications, mlApi, [item], refreshJobs);
          }
        },
        'data-test-subj': 'mlActionButtonCloseJob',
      },
      {
        name: i18n.translate('xpack.ml.jobsList.managementActions.resetJobLabel', {
          defaultMessage: 'Reset job',
        }),
        description: i18n.translate('xpack.ml.jobsList.managementActions.resetJobDescription', {
          defaultMessage: 'Reset job',
        }),
        type: 'icon',
        icon: 'refresh',
        enabled: (item) => isResetEnabled(item) && canResetJob,
        available: (item) => isResettable([item]),
        onClick: (item) => {
          showResetJobModal([item]);
        },
        'data-test-subj': 'mlActionButtonResetJob',
      },
      {
        name: i18n.translate('xpack.ml.jobsList.managementActions.cloneJobLabel', {
          defaultMessage: 'Clone job',
        }),
        description: i18n.translate('xpack.ml.jobsList.managementActions.cloneJobDescription', {
          defaultMessage: 'Clone job',
        }),
        type: 'icon',
        icon: 'copy',
        enabled: (item) => {
          return isJobBlocked(item) === false && canCreateJob;
        },
        onClick: (item) => {
          cloneJob(toastNotifications, share, mlApi, item.id);
        },
        'data-test-subj': 'mlActionButtonCloneJob',
      },
      {
        name: i18n.translate('xpack.ml.jobsList.managementActions.viewDatafeedCountsLabel', {
          defaultMessage: 'View datafeed counts',
        }),
        description: i18n.translate(
          'xpack.ml.jobsList.managementActions.viewDatafeedCountsDescription',
          {
            defaultMessage: 'View datafeed counts',
          }
        ),
        type: 'icon',
        icon: 'chartAreaStack',
        enabled: () => canGetDatafeeds,
        available: () => canGetDatafeeds,
        onClick: (item) => {
          showDatafeedChartFlyout(item);
        },
        'data-test-subj': 'mlActionButtonViewDatafeedChart',
      },
      {
        name: i18n.translate('xpack.ml.jobsList.managementActions.editJobLabel', {
          defaultMessage: 'Edit job',
        }),
        description: i18n.translate('xpack.ml.jobsList.managementActions.editJobDescription', {
          defaultMessage: 'Edit job',
        }),
        type: 'icon',
        icon: 'pencil',
        enabled: (item) => isJobBlocked(item) === false && canUpdateJob && canUpdateDatafeed,
        onClick: (item) => {
          showEditJobFlyout(item);
        },
        'data-test-subj': 'mlActionButtonEditJob',
      },
      {
        name: i18n.translate('xpack.ml.jobsList.managementActions.deleteJobLabel', {
          defaultMessage: 'Delete job',
        }),
        description: i18n.translate('xpack.ml.jobsList.managementActions.deleteJobDescription', {
          defaultMessage: 'Delete job',
        }),
        icon: 'trash',
        type: 'icon',
        color: 'danger',
        enabled: () => canDeleteJob,
        onClick: (item) => {
          showDeleteJobModal([item]);
        },
        'data-test-subj': 'mlActionButtonDeleteJob',
      },
    ],
    [
      canCloseJob,
      canCreateJob,
      canCreateMlAlerts,
      canDeleteJob,
      canGetDatafeeds,
      canResetJob,
      canStartStopDatafeed,
      canUpdateDatafeed,
      canUpdateJob,
      mlApi,
      refreshJobs,
      share,
      showCloseJobsConfirmModal,
      showCreateAlertFlyout,
      showDatafeedChartFlyout,
      showDeleteJobModal,
      showEditJobFlyout,
      showResetJobModal,
      showStartDatafeedModal,
      showStopDatafeedsConfirmModal,
      toastNotifications,
    ]
  );
};
