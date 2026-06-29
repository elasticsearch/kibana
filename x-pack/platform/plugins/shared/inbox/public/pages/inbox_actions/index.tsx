/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonIcon,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPageSection,
  EuiPanel,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
  type CriteriaWithPagination,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import type { InboxAction, InboxActionStatus } from '@kbn/inbox-common';
import { DEFAULT_INBOX_ACTIONS_PER_PAGE } from '@kbn/inbox-common';
import { useInboxActions } from '../../hooks/use_inbox_api';
import { InboxHistoryFeed } from './components/inbox_history_feed';
import { InboxReasoning } from './components/inbox_reasoning';
import { RespondFlyout } from './components/respond_flyout';
import { TimeoutChip } from './components/timeout_chip';
import * as i18n from './translations';

const STATUS_COLOR: Record<InboxActionStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_LABEL: Record<InboxActionStatus, string> = {
  pending: i18n.STATUS_PENDING,
  approved: i18n.STATUS_APPROVED,
  rejected: i18n.STATUS_REJECTED,
};

export const InboxActionsPage: React.FC = () => {
  const { euiTheme } = useEuiTheme();
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_INBOX_ACTIONS_PER_PAGE);
  const [activeAction, setActiveAction] = useState<InboxAction | null>(null);
  // Inline reasoning expansion, mirroring the Respond flyout: rows whose
  // backing step carried a soft-interface `reasoning` blob can expand it
  // in place so analysts can triage without opening the flyout.
  const [expandedRows, setExpandedRows] = useState<Record<string, React.ReactNode>>({});

  const { data, isLoading, error, refetch } = useInboxActions({
    page: pageIndex + 1,
    perPage: pageSize,
  });

  const toggleReasoning = useCallback((item: InboxAction) => {
    setExpandedRows((prev) => {
      if (prev[item.id]) {
        const { [item.id]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [item.id]: (
          <EuiPanel color="subdued" hasShadow={false} paddingSize="m">
            <EuiFlexGroup direction="column" gutterSize="s">
              <InboxReasoning reasoning={item.reasoning} />
            </EuiFlexGroup>
          </EuiPanel>
        ),
      };
    });
  }, []);

  const columns: Array<EuiBasicTableColumn<InboxAction>> = useMemo(
    () => [
      {
        align: 'left',
        width: '40px',
        isExpander: true,
        name: (
          <EuiScreenReaderOnly>
            <span>{i18n.REASONING_COLUMN_SR_LABEL}</span>
          </EuiScreenReaderOnly>
        ),
        render: (item: InboxAction) =>
          item.reasoning ? (
            <EuiToolTip
              content={
                expandedRows[item.id] ? i18n.REASONING_COLLAPSE_LABEL : i18n.REASONING_EXPAND_LABEL
              }
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                data-test-subj="inboxReasoningToggle"
                onClick={() => toggleReasoning(item)}
                aria-label={
                  expandedRows[item.id]
                    ? i18n.REASONING_COLLAPSE_LABEL
                    : i18n.REASONING_EXPAND_LABEL
                }
                iconType={expandedRows[item.id] ? 'arrowDown' : 'arrowRight'}
              />
            </EuiToolTip>
          ) : null,
      },
      {
        field: 'title',
        name: i18n.COLUMN_TITLE,
        render: (title: string, item: InboxAction) => (
          <div>
            <strong>{title}</strong>
            {item.description ? (
              <>
                <EuiSpacer size="xs" />
                <EuiText size="s" color="subdued">
                  {item.description}
                </EuiText>
              </>
            ) : null}
          </div>
        ),
      },
      {
        field: 'status',
        name: i18n.COLUMN_STATUS,
        width: '160px',
        render: (status: InboxActionStatus, item: InboxAction) => (
          <EuiFlexGroup gutterSize="xs" wrap responsive={false} alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiBadge color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</EuiBadge>
            </EuiFlexItem>
            {(item.timeout_at || item.response_mode === 'timed_out') && (
              <EuiFlexItem grow={false}>
                <TimeoutChip
                  timeoutAt={item.timeout_at}
                  expired={item.response_mode === 'timed_out'}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        ),
      },
      {
        field: 'source_app',
        name: i18n.COLUMN_SOURCE,
        width: '180px',
      },
      {
        field: 'requested_by',
        name: i18n.COLUMN_REQUESTED_BY,
        width: '180px',
        render: (requestedBy: string | null | undefined) => requestedBy ?? '-',
      },
      {
        field: 'created_at',
        name: i18n.COLUMN_CREATED_AT,
        width: '200px',
        render: (createdAt: string) => (createdAt ? new Date(createdAt).toLocaleString() : '-'),
      },
      {
        name: i18n.COLUMN_ACTIONS,
        width: '120px',
        actions: [
          {
            name: i18n.RESPOND_ACTION_LABEL,
            description: i18n.RESPOND_ACTION_DESCRIPTION,
            icon: 'pencil',
            type: 'icon',
            'data-test-subj': 'inboxActionRespondButton',
            enabled: (item: InboxAction) => item.status === 'pending',
            onClick: (item: InboxAction) => setActiveAction(item),
          },
        ],
      },
    ],
    [expandedRows, toggleReasoning]
  );

  const pagination = {
    pageIndex,
    pageSize,
    totalItemCount: data?.total ?? 0,
    pageSizeOptions: [10, 25, 50],
  };

  const onTableChange = ({ page }: CriteriaWithPagination<InboxAction>) => {
    if (page) {
      setPageIndex(page.index);
      setPageSize(page.size);
    }
  };

  const items = data?.actions ?? [];

  return (
    <EuiPageSection paddingSize="l" css={{ paddingTop: euiTheme.size.l }}>
      <EuiTitle size="l">
        <h1>{i18n.PAGE_TITLE}</h1>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiText color="subdued">
        <p>{i18n.PAGE_DESCRIPTION}</p>
      </EuiText>
      <EuiSpacer size="l" />
      <EuiPanel hasBorder paddingSize="l" data-test-subj="inboxPendingSection">
        <EuiTitle size="m">
          <h2>{i18n.PENDING_SECTION_TITLE}</h2>
        </EuiTitle>
        <EuiSpacer size="m" />
        {error ? (
          <EuiEmptyPrompt
            color="danger"
            iconType="warning"
            title={<h3>{i18n.LOAD_ERROR_TITLE}</h3>}
            body={<p>{i18n.getLoadErrorBody(String(error))}</p>}
            actions={[
              <EuiButton key="retry" onClick={() => refetch()} iconType="refresh">
                {i18n.RETRY_BUTTON}
              </EuiButton>,
            ]}
          />
        ) : !isLoading && items.length === 0 ? (
          <EuiEmptyPrompt
            iconType="email"
            title={<h3>{i18n.EMPTY_TITLE}</h3>}
            body={<p>{i18n.EMPTY_BODY}</p>}
          />
        ) : (
          <EuiBasicTable<InboxAction>
            tableCaption={i18n.TABLE_CAPTION}
            items={items}
            itemId="id"
            itemIdToExpandedRowMap={expandedRows}
            columns={columns}
            loading={isLoading}
            pagination={pagination}
            onChange={onTableChange}
          />
        )}
      </EuiPanel>
      <EuiSpacer size="l" />
      <InboxHistoryFeed />
      {activeAction ? (
        <RespondFlyout
          action={activeAction}
          onClose={() => setActiveAction(null)}
          // The respond mutation already invalidates the inbox actions
          // query, which v4 refetches automatically — this `onSuccess` is
          // a belt-and-suspenders signal that also covers the (rare) case
          // where the mutation cache is bypassed (e.g. via a different
          // QueryClient in tests).
          onSuccess={refetch}
        />
      ) : null}
    </EuiPageSection>
  );
};
