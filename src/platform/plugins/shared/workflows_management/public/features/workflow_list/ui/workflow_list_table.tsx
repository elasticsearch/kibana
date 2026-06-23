/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiBadge,
  EuiBadgeGroup,
  EuiBasicTable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPopover,
  EuiPopoverTitle,
  EuiSwitch,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import type { CriteriaWithPagination } from '@elastic/eui/src/components/basic_table/basic_table';
import { css } from '@emotion/react';
import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { WorkflowListItemDto, WorkflowSortField } from '@kbn/workflows';
import { WorkflowTriggersAndSteps } from './workflow_triggers_and_steps';
import {
  getRunTooltipContent,
  ManagedWorkflowBadge,
  StatusBadge,
  WorkflowStatus,
} from '../../../shared/ui';
import { NextExecutionTime } from '../../../shared/ui/next_execution_time';
import { WORKFLOWS_TABLE_PAGE_SIZE_OPTIONS } from '../constants';

const MAX_VISIBLE_TAGS = 2;

export interface WorkflowListTableProps {
  items: WorkflowListItemDto[];
  page: number;
  size: number;
  total: number;
  selectedItems: WorkflowListItemDto[];
  onSelectionChange: (items: WorkflowListItemDto[]) => void;
  onPageChange: (pageIndex: number, pageSize: number) => void;
  onToggleWorkflow: (item: WorkflowListItemDto) => void;
  onDeleteWorkflow: (item: WorkflowListItemDto) => void;
  onCloneWorkflow: (item: WorkflowListItemDto) => void;
  onExportWorkflow: (item: WorkflowListItemDto) => void;
  onRequestRun: (item: WorkflowListItemDto) => void;
  getEditHref: (item: WorkflowListItemDto) => string;
  canCreateWorkflow: boolean;
  canReadWorkflow: boolean;
  canReadWorkflowExecution: boolean;
  canUpdateWorkflow: boolean;
  canDeleteWorkflow: boolean;
  canExecuteWorkflow: boolean;
  sortField?: WorkflowSortField;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (field: WorkflowSortField, order: 'asc' | 'desc') => void;
}

export const WorkflowListTable = ({
  items,
  page,
  size,
  total,
  selectedItems,
  onSelectionChange,
  onPageChange,
  onToggleWorkflow,
  onDeleteWorkflow,
  onCloneWorkflow,
  onExportWorkflow,
  onRequestRun,
  getEditHref,
  canCreateWorkflow,
  canReadWorkflow,
  canReadWorkflowExecution,
  canUpdateWorkflow,
  canDeleteWorkflow,
  canExecuteWorkflow,
  sortField,
  sortOrder,
  onSortChange,
}: WorkflowListTableProps) => {
  const allowRowSelection = canUpdateWorkflow || canDeleteWorkflow || canReadWorkflow;

  const columns = useMemo<Array<EuiBasicTableColumn<WorkflowListItemDto>>>(
    () => [
      {
        field: 'name',
        name: i18n.translate('workflows.workflowList.column.name', { defaultMessage: 'Name' }),
        dataType: 'string',
        sortable: true,
        render: (name: string, item) => (
          <div
            css={css`
              max-width: 100%;
              overflow: hidden;
            `}
          >
            <EuiFlexGroup direction="column" gutterSize="xs">
              <EuiFlexItem>
                <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false} wrap={false}>
                  <EuiFlexItem
                    grow={false}
                    css={css`
                      min-width: 0;
                    `}
                  >
                    {canReadWorkflow ? (
                      <EuiLink>
                        <Link
                          to={`/${item.id}`}
                          css={css`
                            white-space: nowrap;
                            overflow: hidden;
                            text-overflow: ellipsis;
                            display: block;
                            max-width: 100%;
                          `}
                          title={name}
                          data-test-subj="workflowNameLink"
                        >
                          {name}
                        </Link>
                      </EuiLink>
                    ) : (
                      <EuiText
                        size="s"
                        css={css`
                          white-space: nowrap;
                          overflow: hidden;
                          text-overflow: ellipsis;
                          display: block;
                          max-width: 100%;
                        `}
                        title={name}
                        data-test-subj="workflowNameText"
                      >
                        {name}
                      </EuiText>
                    )}
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText
                  size="xs"
                  color="subdued"
                  title={item.description}
                  css={css`
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 100%;
                    display: block;
                    width: 100%;
                  `}
                >
                  {item.description || (
                    <FormattedMessage
                      id="workflows.workflowList.noDescription"
                      defaultMessage="No description"
                    />
                  )}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </div>
        ),
      },
      {
        field: 'tags',
        name: i18n.translate('workflows.workflowList.column.tags', {
          defaultMessage: 'Tags',
        }),
        width: '18%',
        render: (value: unknown, item: WorkflowListItemDto) => (
          <WorkflowTagsCell tags={item.definition?.tags} isManaged={item.managed === true} />
        ),
      },
      {
        field: 'triggers',
        name: i18n.translate('workflows.workflowList.column.triggersAndSteps', {
          defaultMessage: 'Triggers and Steps',
        }),
        width: '24%',
        render: (value: unknown, item: WorkflowListItemDto) => {
          const triggers = item.definition?.triggers ?? [];
          const steps = item.definition?.steps ?? [];
          const history = item.history ?? [];

          const cell = <WorkflowTriggersAndSteps triggers={triggers} steps={steps} />;

          if (history.length > 0 && triggers.length > 0) {
            return (
              <NextExecutionTime triggers={triggers} history={history}>
                {cell}
              </NextExecutionTime>
            );
          }
          return cell;
        },
      },
      {
        name: i18n.translate('workflows.workflowList.column.lastRun', {
          defaultMessage: 'Last run',
        }),
        field: 'runHistory',
        width: '10%',
        render: (value: unknown, item: WorkflowListItemDto) => {
          if (!canReadWorkflowExecution) {
            return (
              <EuiText size="xs" color="subdued" data-test-subj="workflowLastRunRestricted">
                {i18n.translate('workflows.workflowList.lastRun.restricted', {
                  defaultMessage: '—',
                })}
              </EuiText>
            );
          }
          if (!item.history || item.history.length === 0) return null;
          const lastRun = item.history[0];
          return (
            <StatusBadge status={lastRun.status} date={lastRun.finishedAt || lastRun.startedAt} />
          );
        },
      },
      {
        name: i18n.translate('workflows.workflowList.column.enabled', {
          defaultMessage: 'Enabled',
        }),
        field: 'enabled',
        width: '90px',
        sortable: true,
        render: (value: unknown, item: WorkflowListItemDto) => {
          return (
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={
                    !item.valid
                      ? i18n.translate('workflows.workflowList.invalid', {
                          defaultMessage: 'Fix errors to enable workflow',
                        })
                      : undefined
                  }
                >
                  <EuiSwitch
                    data-test-subj={`workflowToggleSwitch-${item.id}`}
                    disabled={!canUpdateWorkflow || !item.valid}
                    checked={item.enabled}
                    onChange={() => onToggleWorkflow(item)}
                    label={
                      item.enabled
                        ? i18n.translate('workflows.workflowList.enabled', {
                            defaultMessage: 'Enabled',
                          })
                        : i18n.translate('workflows.workflowList.disabled', {
                            defaultMessage: 'Disabled',
                          })
                    }
                    showLabel={false}
                  />
                </EuiToolTip>
              </EuiFlexItem>
              {!item.valid && (
                <EuiFlexItem grow={false}>
                  <WorkflowStatus valid={item.valid} />
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          );
        },
      },
      {
        name: '',
        width: '120px',
        actions: [
          {
            isPrimary: true,
            enabled: (item) => canExecuteWorkflow && item.enabled && item.valid,
            type: 'icon',
            color: 'text',
            name: i18n.translate('workflows.workflowList.run', { defaultMessage: 'Run' }),
            'data-test-subj': 'runWorkflowAction',
            icon: 'play',
            description: (item: WorkflowListItemDto) =>
              getRunTooltipContent({
                isValid: item.valid,
                canRunWorkflow: canExecuteWorkflow,
                isEnabled: item.enabled,
              }) ?? i18n.translate('workflows.workflowList.run', { defaultMessage: 'Run' }),
            onClick: (item: WorkflowListItemDto) => onRequestRun(item),
          },
          {
            enabled: () => canUpdateWorkflow,
            type: 'icon',
            color: 'text',
            isPrimary: true,
            name: i18n.translate('workflows.workflowList.edit', { defaultMessage: 'Edit' }),
            'data-test-subj': 'editWorkflowAction',
            icon: 'pencil',
            description: i18n.translate('workflows.workflowList.edit', {
              defaultMessage: 'Edit workflow',
            }),
            href: (item: WorkflowListItemDto) => getEditHref(item),
          },
          {
            enabled: () => canCreateWorkflow && canReadWorkflow,
            type: 'icon',
            color: 'primary',
            name: i18n.translate('workflows.workflowList.clone', { defaultMessage: 'Clone' }),
            'data-test-subj': 'cloneWorkflowAction',
            icon: 'copy',
            description: i18n.translate('workflows.workflowList.clone', {
              defaultMessage: 'Clone workflow',
            }),
            onClick: (item: WorkflowListItemDto) => onCloneWorkflow(item),
          },
          {
            enabled: (item) => item.definition !== null && canReadWorkflow,
            type: 'icon',
            color: 'primary',
            name: i18n.translate('workflows.workflowList.export', { defaultMessage: 'Export' }),
            'data-test-subj': 'exportWorkflowAction',
            icon: 'export',
            description: i18n.translate('workflows.workflowList.export', {
              defaultMessage: 'Export workflow',
            }),
            onClick: (item: WorkflowListItemDto) => onExportWorkflow(item),
          },
          {
            enabled: (item) => canDeleteWorkflow && item.managed !== true,
            type: 'icon',
            color: 'danger',
            name: i18n.translate('workflows.workflowList.delete', { defaultMessage: 'Delete' }),
            'data-test-subj': 'deleteWorkflowAction',
            icon: 'trash',
            description: (item: WorkflowListItemDto) =>
              item.managed === true
                ? i18n.translate('workflows.workflowList.deleteManagedDisabled', {
                    defaultMessage: 'Managed workflows cannot be deleted',
                  })
                : i18n.translate('workflows.workflowList.deleteDescription', {
                    defaultMessage: 'Delete workflow',
                  }),
            onClick: (item: WorkflowListItemDto) => onDeleteWorkflow(item),
          },
        ],
      },
    ],
    [
      canReadWorkflow,
      canReadWorkflowExecution,
      canUpdateWorkflow,
      canExecuteWorkflow,
      canCreateWorkflow,
      canDeleteWorkflow,
      getEditHref,
      onToggleWorkflow,
      onCloneWorkflow,
      onExportWorkflow,
      onDeleteWorkflow,
      onRequestRun,
    ]
  );

  return (
    <EuiBasicTable
      tableCaption={i18n.translate('workflows.workflowList.tableCaption', {
        defaultMessage: 'Workflows',
      })}
      data-test-subj="workflowListTable"
      css={css`
        container-type: inline-size;

        .euiBasicTableAction-showOnHover {
          opacity: 1 !important;
        }
      `}
      rowProps={() => ({
        style: { height: '68px' },
      })}
      columns={columns}
      items={items}
      itemId="id"
      responsiveBreakpoint="xs"
      tableLayout="fixed"
      sorting={
        sortField && sortOrder
          ? { sort: { field: sortField, direction: sortOrder } }
          : { sort: undefined }
      }
      onChange={({
        page: { index: pageIndex, size: pageSize },
        sort,
      }: CriteriaWithPagination<WorkflowListItemDto>) => {
        // EUI can emit `sort` as `undefined` on page-only changes — guard
        // against that so we don't fire `onSortChange` on pagination.
        const incoming =
          sort?.field === 'name' || sort?.field === 'enabled'
            ? { field: sort.field as WorkflowSortField, order: sort.direction }
            : undefined;
        const sortChanged = incoming?.field !== sortField || incoming?.order !== sortOrder;
        if (sortChanged && incoming) {
          onSortChange?.(incoming.field, incoming.order);
          return;
        }
        onPageChange(pageIndex, pageSize);
      }}
      {...(allowRowSelection
        ? {
            selection: {
              onSelectionChange,
              selectable: () => true,
              selected: selectedItems,
            },
          }
        : {})}
      pagination={{
        pageSize: size,
        pageSizeOptions: WORKFLOWS_TABLE_PAGE_SIZE_OPTIONS,
        totalItemCount: total,
        pageIndex: page - 1,
      }}
    />
  );
};

const tagsRowStyle = css`
  flex-wrap: nowrap;
  min-width: 0;
`;

const visibleTagStyle = css`
  min-width: 0;

  .euiBadge {
    max-width: 100%;
  }
`;

const overflowPopoverStyle = css`
  max-height: 200px;
  max-width: 320px;
  overflow: auto;
`;

const WorkflowTagsCell = ({
  tags,
  isManaged,
}: {
  tags: readonly string[] | undefined;
  isManaged: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);
  const close = useCallback(() => setIsOpen(false), []);

  if (!isManaged && (!tags || tags.length === 0)) return null;

  const workflowTags = tags ?? [];
  const visibleWorkflowTags = workflowTags.slice(
    0,
    isManaged ? MAX_VISIBLE_TAGS - 1 : MAX_VISIBLE_TAGS
  );
  const hidden = workflowTags.slice(visibleWorkflowTags.length);

  return (
    <EuiFlexGroup
      alignItems="center"
      gutterSize="xs"
      responsive={false}
      css={tagsRowStyle}
      data-test-subj="workflowTags"
    >
      {isManaged ? (
        <EuiFlexItem grow={false} css={visibleTagStyle}>
          <ManagedWorkflowBadge />
        </EuiFlexItem>
      ) : null}
      {visibleWorkflowTags.map((tag) => (
        <EuiFlexItem key={tag} grow={false} css={visibleTagStyle}>
          <EuiBadge color="hollow" title={tag}>
            {tag}
          </EuiBadge>
        </EuiFlexItem>
      ))}
      {hidden.length > 0 && (
        <EuiFlexItem grow={false}>
          <EuiPopover
            ownFocus
            isOpen={isOpen}
            closePopover={close}
            aria-label={i18n.translate('workflows.workflowList.tags.popoverTitle', {
              defaultMessage: 'Tags',
            })}
            button={
              <EuiBadge
                color="hollow"
                onClick={toggle}
                onClickAriaLabel={i18n.translate('workflows.workflowList.tags.moreAriaLabel', {
                  defaultMessage: 'View more tags',
                })}
                data-test-subj="workflowTagsOverflowBadge"
              >
                {`+${hidden.length}`}
              </EuiBadge>
            }
          >
            <EuiPopoverTitle>
              {i18n.translate('workflows.workflowList.tags.popoverTitle', {
                defaultMessage: 'Tags',
              })}
            </EuiPopoverTitle>
            <EuiBadgeGroup gutterSize="xs" css={overflowPopoverStyle}>
              {hidden.map((tag) => (
                <EuiBadge key={tag} color="hollow">
                  {tag}
                </EuiBadge>
              ))}
            </EuiBadgeGroup>
          </EuiPopover>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
