/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, ReactNode } from 'react';
import React, { useCallback, useEffect, useMemo } from 'react';
import { sortBy } from 'lodash';
import moment from 'moment';

import { TIME_FORMAT } from '@kbn/ml-date-utils';
import type { ListingPageUrlState } from '@kbn/ml-url-state';
import type { CombinedJobWithStats } from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import type { MlSummaryJob } from '@kbn/ml-common-types/anomaly_detection_jobs/summary_job';
import { ANOMALY_DETECTOR_SAVED_OBJECT_TYPE } from '@kbn/ml-common-types/saved_objects';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import {
  EuiBasicTable,
  EuiButtonIcon,
  EuiScreenReaderOnly,
  EuiToolTip,
  type Direction,
  type EuiBasicTableColumn,
  type EuiBasicTableProps,
  type EuiTableSelectionType,
} from '@elastic/eui';

import { toLocaleString } from '../../../../util/string_utils';
import { useMlApi, useMlKibana } from '../../../../contexts/kibana';
import { ResultLinks, useActionsMenuContent } from '../job_actions';
import { JobDetails } from './job_details';
import { ProjectScope } from './project_scope';
import { MLSavedObjectsSpacesList } from '../../../../components/ml_saved_objects_spaces_list';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

export type MlSummaryJobWithSpaces = MlSummaryJob & {
  spaces?: string[];
};

interface TableChangeCriteria {
  page?: {
    index: number;
    size: number;
  };
  sort?: {
    field: keyof MlSummaryJobWithSpaces;
    direction: Direction;
  };
}

export interface JobsListProps {
  jobsSummaryList: MlSummaryJobWithSpaces[];
  fullJobsList: Record<string, CombinedJobWithStats>;
  isMlEnabledInSpace?: boolean;
  itemIdToExpandedRowMap: Record<string, ReactNode>;
  toggleRow: (jobId: string) => void;
  selectJobChange: EuiTableSelectionType<MlSummaryJobWithSpaces>['onSelectionChange'];
  showEditJobFlyout?: (job: MlSummaryJobWithSpaces) => void;
  showDatafeedChartFlyout?: (job: MlSummaryJobWithSpaces) => void;
  showDeleteJobModal?: (jobs: MlSummaryJobWithSpaces[]) => void;
  showStartDatafeedModal?: (jobs: MlSummaryJobWithSpaces[]) => void;
  showCloseJobsConfirmModal?: (jobs: MlSummaryJobWithSpaces[]) => void;
  showCreateAlertFlyout?: (jobIds: string[]) => void;
  showStopDatafeedsConfirmModal?: (jobs: MlSummaryJobWithSpaces[]) => void;
  showResetJobModal?: (jobs: MlSummaryJobWithSpaces[]) => void;
  refreshJobs?: () => void;
  selectedJobsCount: number;
  loading?: boolean;
  jobsViewState: ListingPageUrlState;
  onJobsViewStateUpdate: (update: Partial<ListingPageUrlState>) => void;
}

export const JobsList: FC<JobsListProps> = ({
  jobsSummaryList,
  itemIdToExpandedRowMap,
  toggleRow,
  selectJobChange,
  showEditJobFlyout,
  showDatafeedChartFlyout,
  showDeleteJobModal,
  showResetJobModal,
  showStartDatafeedModal,
  showCloseJobsConfirmModal,
  showStopDatafeedsConfirmModal,
  refreshJobs,
  showCreateAlertFlyout,
  selectedJobsCount,
  loading = false,
  jobsViewState,
  onJobsViewStateUpdate,
}) => {
  const {
    services: { spaces, application, notifications, share, cps },
  } = useMlKibana();
  const mlApi = useMlApi();
  const cpsManager = cps?.cpsManager;

  const jobActions = useActionsMenuContent({
    toastNotifications: notifications.toasts,
    share,
    mlApi,
    showEditJobFlyout: showEditJobFlyout!,
    showDatafeedChartFlyout: showDatafeedChartFlyout!,
    showDeleteJobModal: showDeleteJobModal!,
    showResetJobModal: showResetJobModal!,
    showStartDatafeedModal: showStartDatafeedModal!,
    showCloseJobsConfirmModal: showCloseJobsConfirmModal!,
    showStopDatafeedsConfirmModal: showStopDatafeedsConfirmModal!,
    refreshJobs: refreshJobs ?? (() => undefined),
    showCreateAlertFlyout: showCreateAlertFlyout!,
  });

  const { pageIndex, pageSize, sortField, sortDirection } = jobsViewState;

  const { pageOfItems, totalItemCount, correctedPageIndex } = useMemo(() => {
    const sortedList =
      sortDirection === 'asc'
        ? sortBy(jobsSummaryList, (item) => item[sortField as keyof MlSummaryJobWithSpaces])
        : sortBy(
            jobsSummaryList,
            (item) => item[sortField as keyof MlSummaryJobWithSpaces]
          ).reverse();
    const listLength = sortedList.length;

    let pageStart = pageIndex * pageSize;
    let nextPageIndex = pageIndex;
    if (pageStart >= listLength && listLength !== 0) {
      pageStart = Math.floor((listLength - 1) / pageSize) * pageSize;
      nextPageIndex = pageStart / pageSize;
    }

    return {
      pageOfItems: sortedList.slice(pageStart, pageStart + pageSize),
      totalItemCount: listLength,
      correctedPageIndex: nextPageIndex,
    };
  }, [jobsSummaryList, pageIndex, pageSize, sortDirection, sortField]);

  useEffect(() => {
    if (correctedPageIndex !== pageIndex) {
      onJobsViewStateUpdate({ pageIndex: correctedPageIndex });
    }
  }, [correctedPageIndex, pageIndex, onJobsViewStateUpdate]);

  const onTableChange = useCallback(
    (criteria: TableChangeCriteria) => {
      const { page, sort } = criteria;

      onJobsViewStateUpdate({
        pageIndex: page?.index ?? pageIndex,
        pageSize: page?.size ?? pageSize,
        sortField: (sort?.field as string) ?? sortField,
        sortDirection: sort?.direction ?? sortDirection,
      });
    },
    [onJobsViewStateUpdate, pageIndex, pageSize, sortDirection, sortField]
  );

  const onToggleRow = useCallback(
    (item: MlSummaryJobWithSpaces) => {
      toggleRow(item.id);
    },
    [toggleRow]
  );

  const columns = useMemo((): Array<EuiBasicTableColumn<MlSummaryJobWithSpaces>> => {
    const tableColumns: Array<EuiBasicTableColumn<MlSummaryJobWithSpaces>> = [
      {
        name: (
          <EuiScreenReaderOnly>
            <p>
              <FormattedMessage
                id="xpack.ml.jobsList.showDetailsColumn.screenReaderDescription"
                defaultMessage="This column contains clickable controls for showing more details on each job"
              />
            </p>
          </EuiScreenReaderOnly>
        ),
        'data-test-subj': 'mlJobListColumnExpand',
        render: (item: MlSummaryJobWithSpaces) => (
          <EuiToolTip
            content={
              itemIdToExpandedRowMap[item.id]
                ? i18n.translate('xpack.ml.jobsList.collapseJobDetailsAriaLabel', {
                    defaultMessage: 'Hide details for {itemId}',
                    values: { itemId: item.id },
                  })
                : i18n.translate('xpack.ml.jobsList.expandJobDetailsAriaLabel', {
                    defaultMessage: 'Show details for {itemId}',
                    values: { itemId: item.id },
                  })
            }
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              onClick={() => onToggleRow(item)}
              iconType={
                itemIdToExpandedRowMap[item.id] ? 'chevronSingleDown' : 'chevronSingleRight'
              }
              aria-label={
                itemIdToExpandedRowMap[item.id]
                  ? i18n.translate('xpack.ml.jobsList.collapseJobDetailsAriaLabel', {
                      defaultMessage: 'Hide details for {itemId}',
                      values: { itemId: item.id },
                    })
                  : i18n.translate('xpack.ml.jobsList.expandJobDetailsAriaLabel', {
                      defaultMessage: 'Show details for {itemId}',
                      values: { itemId: item.id },
                    })
              }
              data-row-id={item.id}
              data-test-subj="mlJobListRowDetailsToggle"
            />
          </EuiToolTip>
        ),
        width: '36px',
      },
      {
        field: 'id',
        'data-test-subj': 'mlJobListColumnId',
        name: i18n.translate('xpack.ml.jobsList.idLabel', {
          defaultMessage: 'ID',
        }),
        sortable: true,
        truncateText: false,
        render: (id: string, job: MlSummaryJobWithSpaces) => <JobDetails id={id} job={job} />,
      },

      ...(cpsManager
        ? [
            {
              field: 'projectRouting',
              'data-test-subj': 'mlJobListColumnCpsScope',
              name: i18n.translate('xpack.ml.jobsList.projectScopeLabel', {
                defaultMessage: 'Project scope',
              }),
              sortable: false,
              truncateText: false,
              width: '100px',
              render: (projectRouting: string | null) => (
                <ProjectScope projectRouting={projectRouting} />
              ),
            },
          ]
        : []),

      {
        field: 'processed_record_count',
        'data-test-subj': 'mlJobListColumnRecordCount',
        name: i18n.translate('xpack.ml.jobsList.processedRecordsLabel', {
          defaultMessage: 'Processed records',
        }),
        sortable: false,
        truncateText: false,
        dataType: 'number',
        render: (count: MlSummaryJobWithSpaces['processed_record_count']) => toLocaleString(count),
        width: '130px',
      },
      {
        field: 'memory_status',
        'data-test-subj': 'mlJobListColumnMemoryStatus',
        name: i18n.translate('xpack.ml.jobsList.memoryStatusLabel', {
          defaultMessage: 'Memory status',
        }),
        sortable: false,
        truncateText: false,
        width: '105px',
      },
      {
        // TODO: change to be a combined job and datafeed state !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        field: 'datafeedState',
        'data-test-subj': 'mlJobListColumnDatafeedState',
        name: i18n.translate('xpack.ml.jobsList.datafeedStateLabel', {
          defaultMessage: 'State',
        }),
        sortable: false,
        truncateText: false,
        width: '80px',
      },
      {
        name: i18n.translate('xpack.ml.jobsList.latestTimestampLabel', {
          defaultMessage: 'Latest timestamp',
        }),
        truncateText: false,
        field: 'latestTimestampSortValue',
        'data-test-subj': 'mlJobListColumnLatestTimestamp',
        sortable: true,
        render: (_time, item) =>
          item.latestTimestampMs === undefined
            ? ''
            : moment(item.latestTimestampMs).format(TIME_FORMAT),
        textOnly: true,
        width: '140px',
      },
    ];

    if (spaces) {
      tableColumns.push({
        name: i18n.translate('xpack.ml.jobsList.jobActionsColumn.spaces', {
          defaultMessage: 'Spaces',
        }),
        'data-test-subj': 'mlTableColumnSpaces',
        truncateText: true,
        align: 'right',
        width: '70px',
        render: (item: MlSummaryJobWithSpaces) => (
          <MLSavedObjectsSpacesList
            disabled={!application?.capabilities?.savedObjectsManagement?.shareIntoSpace}
            spacesApi={spaces}
            spaceIds={item.spaces}
            id={item.id}
            mlSavedObjectType={ANOMALY_DETECTOR_SAVED_OBJECT_TYPE}
            refresh={refreshJobs ?? (() => undefined)}
          />
        ),
      });
    }

    tableColumns.push(
      {
        name: (
          <EuiScreenReaderOnly>
            <p>
              <FormattedMessage
                id="xpack.ml.jobsList.jobActionsColumn.screenReaderDescription"
                defaultMessage="This column contains extra actions in a menu that can be performed on each job"
              />
            </p>
          </EuiScreenReaderOnly>
        ),
        render: (item: MlSummaryJobWithSpaces) => <ResultLinks jobs={[item]} />,
        width: '70px',
      },
      {
        name: (
          <EuiScreenReaderOnly>
            <p>
              <FormattedMessage
                id="xpack.ml.jobsList.jobActionsColumn.actionsLabel"
                defaultMessage="Actions"
              />
            </p>
          </EuiScreenReaderOnly>
        ),
        actions: jobActions,
        width: '40px',
      }
    );

    return tableColumns;
  }, [
    application?.capabilities?.savedObjectsManagement?.shareIntoSpace,
    cpsManager,
    itemIdToExpandedRowMap,
    jobActions,
    onToggleRow,
    refreshJobs,
    spaces,
  ]);

  const selectionControls = useMemo(
    (): EuiTableSelectionType<MlSummaryJobWithSpaces> => ({
      selectable: (job) => job.blocked === undefined,
      selectableMessage: (selectable, rowItem) =>
        selectable === false
          ? i18n.translate('xpack.ml.jobsList.cannotSelectRowForJobMessage', {
              defaultMessage: 'Cannot select job ID {jobId}',
              values: {
                jobId: rowItem.id,
              },
            })
          : i18n.translate('xpack.ml.jobsList.selectRowForJobMessage', {
              defaultMessage: 'Select the row for job ID {jobId}',
              values: {
                jobId: rowItem.id,
              },
            }),
      onSelectionChange: selectJobChange,
    }),
    [selectJobChange]
  );

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
      totalItemCount,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
    }),
    [pageIndex, pageSize, totalItemCount]
  );

  const sorting = useMemo(
    (): EuiBasicTableProps<MlSummaryJobWithSpaces>['sorting'] => ({
      sort: {
        field: sortField as keyof MlSummaryJobWithSpaces,
        direction: sortDirection as Direction,
      },
    }),
    [sortDirection, sortField]
  );

  const selectedJobsClass = selectedJobsCount ? 'jobs-selected' : '';

  return (
    <EuiBasicTable<MlSummaryJobWithSpaces>
      data-test-subj={loading ? 'mlJobListTable loading' : 'mlJobListTable loaded'}
      tableCaption={i18n.translate('xpack.ml.jobsList.tableCaption', {
        defaultMessage: 'List of anomaly detection jobs',
      })}
      loading={loading === true}
      noItemsMessage={
        loading
          ? i18n.translate('xpack.ml.jobsList.loadingJobsLabel', {
              defaultMessage: 'Loading jobs…',
            })
          : i18n.translate('xpack.ml.jobsList.noJobsFoundLabel', {
              defaultMessage: 'No jobs found',
            })
      }
      itemId="id"
      className={`jobs-list-table ${selectedJobsClass}`}
      items={pageOfItems}
      columns={columns}
      pagination={pagination}
      onChange={
        onTableChange as NonNullable<EuiBasicTableProps<MlSummaryJobWithSpaces>['onChange']>
      }
      selection={selectionControls}
      itemIdToExpandedRowMap={itemIdToExpandedRowMap}
      sorting={sorting}
      rowProps={(item) => ({
        'data-test-subj': `mlJobListRow row-${item.id}`,
      })}
      css={{ '.euiTableRow-isExpandedRow .euiTableCellContent': { animation: 'none' } }}
      rowHeader="id"
    />
  );
};
