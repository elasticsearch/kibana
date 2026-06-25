/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  type CriteriaWithPagination,
  EuiBasicTable,
  type EuiBasicTableColumn,
  EuiButtonIcon,
  EuiHorizontalRule,
  EuiI18nNumber,
  EuiScreenReaderOnly,
  EuiSkeletonText,
  EuiText,
  EuiToolTip,
  CENTER_ALIGNMENT,
  type HorizontalAlignment,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { ActionCreatedBy } from './action_created_by';
import { canUserCancelCommand } from '../../../../../common/endpoint/service/authz/cancel_authz_utils';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { CancelActionModal } from './cancel_action_modal';
import { isResponseActionCancelable } from '../../../../../common/endpoint/service/response_actions/is_response_action_cancelable';
import { RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP } from '../../../../../common/endpoint/service/response_actions/constants';
import type { ActionDetails, ActionListApiResponse } from '../../../../../common/endpoint/types';
import type { EndpointActionListRequestQuery } from '../../../../../common/api/endpoint';
import { FormattedDate } from '../../../../common/components/formatted_date';
import { ARIA_LABELS, TABLE_COLUMN_NAMES, UX_MESSAGES } from '../translations';
import { getEmptyValue } from '../../../../common/components/empty_value';
import { ResponseActionStatusBadge } from './response_action_status_badge';
import { ActionsLogExpandedTray } from './action_log_expanded_tray';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';
import { MANAGEMENT_PAGE_SIZE_OPTIONS } from '../../../common/constants';
import { useUrlPagination } from '../../../hooks/use_url_pagination';

const emptyValue = getEmptyValue();

interface ExpandedRowMapType {
  [k: string]: React.ReactNode;
}

interface ActionsLogTableProps {
  error?: string;
  'data-test-subj'?: string;
  items: ActionListApiResponse['data'];
  isFlyout: boolean;
  loading: boolean;
  onChange: ({
    // @ts-expect-error upgrade typescript v4.9.5
    page: _page,
  }: CriteriaWithPagination<ActionListApiResponse['data'][number]>) => void;
  onShowActionDetails: (actionIds: string[]) => void;
  /** Callback for when table actions may have changed the `items` and thus they should be refreshed */
  onDataNeedsRefresh: () => void;
  queryParams: EndpointActionListRequestQuery;
  showHostNames: boolean;
  totalItemCount: number;
}

export const ActionsLogTable = memo<ActionsLogTableProps>(
  ({
    'data-test-subj': dataTestSubj,
    error,
    items,
    isFlyout,
    loading,
    onChange,
    onDataNeedsRefresh,
    onShowActionDetails,
    queryParams,
    showHostNames,
    totalItemCount,
  }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const { pagination: paginationFromUrlParams } = useUrlPagination();
    const authz = useUserPrivileges().endpointPrivileges;
    const isEndpointCancelActionEnabled = useIsExperimentalFeatureEnabled(
      'responseActionsEndpointCancel'
    );

    const [expandedRowMap, setExpandedRowMap] = useState<ExpandedRowMapType>({});
    const [actionToCancel, setActionToCancel] = useState<ActionDetails | null>(null);

    const actionIdsWithOpenTrays = useMemo(
      (): string[] =>
        // get the list of action ids from the query params for flyout view
        queryParams.withOutputs
          ? typeof queryParams.withOutputs === 'string'
            ? [queryParams.withOutputs]
            : queryParams.withOutputs
          : [],
      [queryParams.withOutputs]
    );

    const redoOpenTrays = useCallback(() => {
      if (actionIdsWithOpenTrays.length && items.length) {
        const openDetails = actionIdsWithOpenTrays.reduce<ExpandedRowMapType>(
          (idToRowMap, actionId) => {
            const actionItem = items.find((item) => item.id === actionId);
            if (!actionItem) {
              idToRowMap[actionId] = <EuiSkeletonText size="relative" lines={8} />;
            } else {
              idToRowMap[actionId] = (
                <ActionsLogExpandedTray action={actionItem} data-test-subj={dataTestSubj} />
              );
            }
            return idToRowMap;
          },
          {}
        );
        setExpandedRowMap(openDetails);
      }
    }, [actionIdsWithOpenTrays, dataTestSubj, items]);

    // open trays that were open using URL params/ query params
    useEffect(() => {
      redoOpenTrays();
    }, [redoOpenTrays]);

    const toggleDetails = useCallback(
      (action: ActionListApiResponse['data'][number]) => {
        const expandedRowMapCopy = { ...expandedRowMap };
        if (expandedRowMapCopy[action.id]) {
          // close tray
          delete expandedRowMapCopy[action.id];
        } else {
          // assign the expanded tray content to the map
          // with action details
          expandedRowMapCopy[action.id] = (
            <ActionsLogExpandedTray action={action} data-test-subj={dataTestSubj} />
          );
        }
        onShowActionDetails(Object.keys(expandedRowMapCopy));
        setExpandedRowMap(expandedRowMapCopy);
      },
      [expandedRowMap, onShowActionDetails, dataTestSubj]
    );

    const onCloseCancelModalHandler = useCallback(() => {
      setActionToCancel(null);
      onDataNeedsRefresh();
    }, [onDataNeedsRefresh]);

    // memoized callback for toggleDetails
    const onClickCallback = useCallback(
      (actionListDataItem: ActionListApiResponse['data'][number]) => () =>
        toggleDetails(actionListDataItem),
      [toggleDetails]
    );

    // table pagination
    const tablePagination = useMemo(() => {
      return {
        pageIndex: isFlyout ? (queryParams.page || 1) - 1 : paginationFromUrlParams.page - 1,
        pageSize: isFlyout ? queryParams.pageSize || 10 : paginationFromUrlParams.pageSize,
        totalItemCount,
        pageSizeOptions: MANAGEMENT_PAGE_SIZE_OPTIONS as number[],
      };
    }, [
      isFlyout,
      paginationFromUrlParams.page,
      paginationFromUrlParams.pageSize,
      queryParams.page,
      queryParams.pageSize,
      totalItemCount,
    ]);

    // compute record ranges
    const pagedResultsCount = useMemo(() => {
      const page = queryParams.page ?? 1;
      const perPage = queryParams?.pageSize ?? 10;

      const totalPages = Math.ceil(totalItemCount / perPage);
      const fromCount = perPage * page - perPage + 1;
      const toCount =
        page === totalPages || totalPages === 1 ? totalItemCount : fromCount + perPage - 1;
      return { fromCount, toCount };
    }, [queryParams.page, queryParams.pageSize, totalItemCount]);

    // create range label to display
    const recordRangeLabel = useMemo(
      () => (
        <EuiText color="default" size="xs" data-test-subj={getTestId('endpointListTableTotal')}>
          <FormattedMessage
            id="xpack.securitySolution.responseActionsList.list.recordRange"
            defaultMessage="Showing {range} of {total} {recordsLabel}"
            values={{
              range: (
                <strong>
                  <EuiI18nNumber value={pagedResultsCount.fromCount} />
                  {'-'}
                  <EuiI18nNumber value={pagedResultsCount.toCount} />
                </strong>
              ),
              total: <EuiI18nNumber value={totalItemCount} />,
              recordsLabel: <strong>{UX_MESSAGES.recordsLabel(totalItemCount)}</strong>,
            }}
          />
        </EuiText>
      ),
      [getTestId, pagedResultsCount.fromCount, pagedResultsCount.toCount, totalItemCount]
    );

    const columns = useMemo(() => {
      let columnDef: EuiBasicTableColumn<ActionDetails>[] = [
        {
          field: '',
          align: CENTER_ALIGNMENT as HorizontalAlignment,
          width: '30px',
          isExpander: true,
          name: (
            <EuiScreenReaderOnly>
              <span>{UX_MESSAGES.screenReaderExpand}</span>
            </EuiScreenReaderOnly>
          ),
          render: (actionListDataItem: ActionListApiResponse['data'][number]) => {
            const actionId = actionListDataItem.id;
            return (
              <EuiToolTip
                content={expandedRowMap[actionId] ? ARIA_LABELS.collapse : ARIA_LABELS.expand}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  data-test-subj={getTestId('expand-button')}
                  onClick={onClickCallback(actionListDataItem)}
                  aria-label={expandedRowMap[actionId] ? ARIA_LABELS.collapse : ARIA_LABELS.expand}
                  iconType={expandedRowMap[actionId] ? 'chevronSingleUp' : 'chevronSingleDown'}
                />
              </EuiToolTip>
            );
          },
        },
        {
          field: 'startedAt',
          name: TABLE_COLUMN_NAMES.time,
          width: !showHostNames ? '21%' : '15%',
          truncateText: true,
          render: (startedAt: ActionListApiResponse['data'][number]['startedAt']) => {
            return (
              <FormattedDate
                fieldName={TABLE_COLUMN_NAMES.time}
                value={startedAt}
                className="eui-textTruncate"
              />
            );
          },
        },
        {
          field: 'command',
          name: TABLE_COLUMN_NAMES.command,
          width: !showHostNames ? '21%' : '10%',
          truncateText: true,
          render: (_command: ActionListApiResponse['data'][number]['command']) => {
            const command = RESPONSE_ACTION_API_COMMAND_TO_CONSOLE_COMMAND_MAP[_command];
            return (
              <EuiToolTip content={command} anchorClassName="eui-textTruncate">
                <EuiText
                  size="s"
                  className="eui-textTruncate eui-fullWidth"
                  data-test-subj={getTestId('column-command')}
                  tabIndex={0}
                >
                  {command}
                </EuiText>
              </EuiToolTip>
            );
          },
        },
        {
          field: 'createdBy',
          name: TABLE_COLUMN_NAMES.user,
          width: !showHostNames ? '21%' : '14%',
          truncateText: true,
          render: (_, action: ActionListApiResponse['data'][number]) => {
            return <ActionCreatedBy action={action} data-test-subj={getTestId('column')} />;
          },
        },
        // conditional hostnames column
        {
          field: 'hosts',
          name: TABLE_COLUMN_NAMES.hosts,
          width: '20%',
          truncateText: true,
          render: (_hosts: ActionListApiResponse['data'][number]['hosts']) => {
            const hostnames = Object.entries(_hosts)
              .reduce<string[]>((acc, [agentId, { name: hostName }]) => {
                acc.push(hostName || `${agentId} (${UX_MESSAGES.unenrolled.host})`);
                return acc;
              }, [])
              .join(', ');

            return (
              <EuiToolTip content={hostnames} anchorClassName="eui-textTruncate">
                <EuiText
                  size="s"
                  className="eui-textTruncate eui-fullWidth"
                  data-test-subj={getTestId('column-hostname')}
                  tabIndex={0}
                >
                  {hostnames}
                </EuiText>
              </EuiToolTip>
            );
          },
        },
        {
          field: 'comment',
          name: TABLE_COLUMN_NAMES.comments,
          width: !showHostNames ? '21%' : '30%',
          truncateText: true,
          render: (comment: ActionListApiResponse['data'][number]['comment']) => {
            return (
              <EuiToolTip content={comment} anchorClassName="eui-textTruncate">
                <EuiText
                  size="s"
                  className="eui-textTruncate eui-fullWidth"
                  data-test-subj={getTestId('column-comments')}
                  tabIndex={0}
                >
                  {comment ?? emptyValue}
                </EuiText>
              </EuiToolTip>
            );
          },
        },
        {
          field: 'status',
          name: TABLE_COLUMN_NAMES.status,
          width: !showHostNames ? '15%' : '10%',
          render: (status: ActionListApiResponse['data'][number]['status']) => {
            return (
              <EuiToolTip content={status} anchorClassName="eui-textTruncate">
                <ResponseActionStatusBadge
                  data-test-subj={getTestId('column-status')}
                  status={status}
                  tabIndex={0}
                />
              </EuiToolTip>
            );
          },
        },
        {
          field: '',
          width: '65px',
          name: TABLE_COLUMN_NAMES.actions,
          actions: [
            {
              render: (actionDetailsItem: ActionDetails) => {
                if (actionDetailsItem.isCompleted) {
                  return <></>;
                }

                let tooltipText: React.ReactNode = UX_MESSAGES.cancelAction;
                const buttonProps: React.ComponentProps<typeof EuiButtonIcon> = {
                  iconType: 'stop',
                  'data-test-subj': 'responseActionRowActions',
                  'aria-label': UX_MESSAGES.cancelAction,
                  isDisabled: !!actionToCancel,
                };

                if (
                  !isResponseActionCancelable(
                    actionDetailsItem.command,
                    actionDetailsItem.agentType
                  )
                ) {
                  buttonProps.isDisabled = true;
                  tooltipText = UX_MESSAGES.cancelActionNotSupportedTooltip;
                } else if (!canUserCancelCommand(authz, actionDetailsItem.command)) {
                  buttonProps.isDisabled = true;
                  tooltipText = UX_MESSAGES.cancelActionNotPermittedTooltip;
                } else {
                  buttonProps.onClick = () => {
                    setActionToCancel(actionDetailsItem);
                  };
                }

                return (
                  <EuiToolTip content={tooltipText}>
                    <EuiButtonIcon {...buttonProps} />
                  </EuiToolTip>
                );
              },
            },
          ],
        },
      ];

      // filter out the `hosts` column
      // if showHostNames is FALSE
      if (!showHostNames) {
        columnDef = columnDef.filter((column) => 'field' in column && column.field !== 'hosts');
      }

      // Remove actions if cancel feature flag is disabled
      if (!isEndpointCancelActionEnabled) {
        columnDef = columnDef.filter((column) => !('actions' in column));
      }

      return columnDef;
    }, [
      actionToCancel,
      authz,
      expandedRowMap,
      getTestId,
      isEndpointCancelActionEnabled,
      onClickCallback,
      showHostNames,
    ]);

    return (
      <>
        {recordRangeLabel}
        <EuiHorizontalRule margin="xs" />
        <EuiBasicTable
          data-test-subj={dataTestSubj}
          tableCaption={i18n.translate(
            'xpack.securitySolution.responseActionsList.table.tableCaption',
            {
              defaultMessage: 'Response action log entries',
            }
          )}
          items={items}
          columns={columns}
          itemId="id"
          itemIdToExpandedRowMap={expandedRowMap}
          pagination={tablePagination}
          onChange={onChange}
          loading={loading}
          error={error}
        />

        {actionToCancel && (
          <CancelActionModal
            action={actionToCancel}
            onClose={onCloseCancelModalHandler}
            data-test-subj={getTestId('cancelActionModal')}
          />
        )}
      </>
    );
  }
);

ActionsLogTable.displayName = 'ActionsLogTable';
