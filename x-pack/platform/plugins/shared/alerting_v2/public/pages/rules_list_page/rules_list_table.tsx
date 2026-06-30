/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBadgeGroup,
  EuiBasicTable,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCheckbox,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiLink,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  useEuiTheme,
  type Criteria,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { BULK_FILTER_MAX_RULES, getRootEsqlQuery, type RuleKind } from '@kbn/alerting-v2-schemas';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { getIndexPatternFromESQLQuery } from '@kbn/esql-utils';
import { RULE_KIND_ICONS, RULE_KIND_LABELS, RULE_KIND_TOOLTIPS } from '@kbn/alerting-v2-constants';
import type { RuleApiResponse } from '../../services/rules_api';
import { RuleActionsMenu } from './rule_actions_menu';

const labelsContainerStyle = css`
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  overflow: hidden;
`;

const labelBadgeStyle = css`
  min-width: 0;
  flex-shrink: 1;
`;

const overflowTooltipStyle = css`
  flex-shrink: 0;
  line-height: 0;
`;

const descriptionTextStyle = css`
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
`;

export type RulesListTableSortField = 'kind' | 'enabled' | 'metadata';

export interface RulesListTableProps {
  items: RuleApiResponse[];
  totalItemCount: number;
  page: number;
  perPage: number;
  search: string;
  hasActiveFilters: boolean;
  sortField?: RulesListTableSortField;
  sortDirection?: 'asc' | 'desc';
  isLoading: boolean;

  /** Bulk selection state */
  selectedCount: number;
  isAllSelected: boolean;
  isPageSelected: boolean;
  isRowSelected: (id: string) => boolean;
  onSelectRow: (id: string) => void;
  onSelectPage: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;

  /** Bulk action callbacks */
  onBulkEnable: () => void;
  onBulkDisable: () => void;
  onBulkDelete: () => void;

  /** Row action callbacks */
  onNavigateToDetails: (rule: RuleApiResponse) => void;
  onExpand: (rule: RuleApiResponse) => void;
  onQuickEdit: (rule: RuleApiResponse) => void;
  onEdit: (rule: RuleApiResponse) => void;
  onClone: (rule: RuleApiResponse) => void;
  onDelete: (rule: RuleApiResponse) => void;
  onToggleEnabled: (rule: RuleApiResponse) => void;

  /** Pagination callback */
  onTableChange: (criteria: Criteria<RuleApiResponse>) => void;
}

export const RulesListTable: React.FC<RulesListTableProps> = ({
  items,
  totalItemCount,
  page,
  perPage,
  search,
  hasActiveFilters,
  sortField,
  sortDirection,
  isLoading,
  selectedCount,
  isAllSelected,
  isPageSelected,
  isRowSelected,
  onSelectRow,
  onSelectPage,
  onSelectAll,
  onClearSelection,
  onBulkEnable,
  onBulkDisable,
  onBulkDelete,
  onNavigateToDetails,
  onExpand,
  onQuickEdit,
  onEdit,
  onClone,
  onDelete,
  onToggleEnabled,
  onTableChange,
}) => {
  const { euiTheme } = useEuiTheme();

  const hideMobileSortMenuOnWideScreensStyle = useMemo(
    () => css`
      @media (min-width: ${euiTheme.breakpoint.m}px) {
        .euiTableSortMobile {
          display: none;
        }
      }
    `,
    [euiTheme.breakpoint.m]
  );

  const [isBulkActionsOpen, setIsBulkActionsOpen] = useState(false);

  const handleBulkEnable = () => {
    setIsBulkActionsOpen(false);
    onBulkEnable();
  };

  const handleBulkDisable = () => {
    setIsBulkActionsOpen(false);
    onBulkDisable();
  };

  const handleBulkDelete = () => {
    setIsBulkActionsOpen(false);
    onBulkDelete();
  };

  const pagination = {
    pageIndex: page - 1,
    pageSize: perPage,
    totalItemCount,
    pageSizeOptions: [10, 20, 50],
  };

  const columns: Array<EuiBasicTableColumn<RuleApiResponse>> = useMemo(
    () => [
      {
        field: 'id',
        name: (
          <EuiCheckbox
            id="selectAllPage"
            checked={isPageSelected}
            onChange={onSelectPage}
            aria-label={i18n.translate('xpack.alertingV2.rulesList.selectAllPage', {
              defaultMessage: 'Select all rules on this page',
            })}
            data-test-subj="selectAllRulesOnPage"
          />
        ),
        width: '32px',
        render: (id: string) => (
          <EuiCheckbox
            id={`select-rule-${id}`}
            checked={isRowSelected(id)}
            onChange={() => onSelectRow(id)}
            aria-label={i18n.translate('xpack.alertingV2.rulesList.selectRule', {
              defaultMessage: 'Select rule',
            })}
            data-test-subj={`checkboxSelectRow-${id}`}
          />
        ),
      },
      {
        name: '',
        width: '32px',
        render: (rule: RuleApiResponse) => (
          <EuiToolTip
            content={i18n.translate('xpack.alertingV2.rulesList.action.expand', {
              defaultMessage: 'Open rule summary',
            })}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              iconType="expand"
              color="text"
              onClick={() => onExpand(rule)}
              aria-label={i18n.translate('xpack.alertingV2.rulesList.action.expand', {
                defaultMessage: 'Open rule summary',
              })}
              data-test-subj={`expandRule-${rule.id}`}
            />
          </EuiToolTip>
        ),
      },
      {
        field: 'metadata',
        name: (
          <FormattedMessage id="xpack.alertingV2.rulesList.column.name" defaultMessage="Name" />
        ),
        truncateText: true,
        sortable: true,
        render: (metadata: RuleApiResponse['metadata'], rule: RuleApiResponse) => (
          <div>
            <EuiLink
              onClick={() => onNavigateToDetails(rule)}
              data-test-subj={`ruleNameLink-${rule.id}`}
            >
              {metadata?.name ?? rule.id}
            </EuiLink>
            {metadata?.description && (
              <EuiText size="xs" color="subdued" css={descriptionTextStyle}>
                {metadata.description}
              </EuiText>
            )}
          </div>
        ),
      },
      {
        field: 'query',
        name: (
          <FormattedMessage id="xpack.alertingV2.rulesList.column.source" defaultMessage="Source" />
        ),
        width: '18%',
        truncateText: true,
        render: (query: RuleApiResponse['query']) => {
          const source = query
            ? getIndexPatternFromESQLQuery(getRootEsqlQuery(query)) || undefined
            : undefined;
          return source ? (
            <EuiBadge color="hollow">{source}</EuiBadge>
          ) : (
            <FormattedMessage id="xpack.alertingV2.rulesList.emptyValue" defaultMessage="-" />
          );
        },
      },
      {
        field: 'metadata',
        name: (
          <FormattedMessage id="xpack.alertingV2.rulesList.column.tags" defaultMessage="Tags" />
        ),
        width: '20%',
        render: (_metadata: RuleApiResponse['metadata']) => {
          const tags = _metadata?.tags;
          if (!tags || tags.length === 0) {
            return (
              <FormattedMessage id="xpack.alertingV2.rulesList.emptyValue" defaultMessage="-" />
            );
          }
          const overflowCount = tags.length - 1;
          return (
            <EuiBadgeGroup
              gutterSize="xs"
              css={labelsContainerStyle}
              data-test-subj="tagsContainer"
            >
              <EuiBadge color="hollow" css={overflowCount > 0 ? labelBadgeStyle : undefined}>
                {tags[0]}
              </EuiBadge>
              {overflowCount > 0 && (
                <span css={overflowTooltipStyle}>
                  <EuiToolTip content={tags.slice(1).join(', ')}>
                    <EuiBadge
                      tabIndex={0}
                      color="hollow"
                      data-test-subj="overflowTagsBadge"
                      iconType="tag"
                      title=""
                    >
                      {i18n.translate('xpack.alertingV2.rulesList.tags.overflow', {
                        defaultMessage: '+{count}',
                        values: { count: overflowCount },
                      })}
                    </EuiBadge>
                  </EuiToolTip>
                </span>
              )}
            </EuiBadgeGroup>
          );
        },
      },
      {
        field: 'kind',
        name: (
          <FormattedMessage id="xpack.alertingV2.rulesList.column.mode" defaultMessage="Mode" />
        ),
        width: '10%',
        sortable: true,
        render: (kind: RuleKind) => (
          <EuiToolTip content={RULE_KIND_TOOLTIPS[kind]}>
            <EuiBadge color="hollow" iconType={RULE_KIND_ICONS[kind]} iconSide="left" tabIndex={0}>
              {RULE_KIND_LABELS[kind]}
            </EuiBadge>
          </EuiToolTip>
        ),
      },
      {
        field: 'enabled',
        name: (
          <FormattedMessage id="xpack.alertingV2.rulesList.column.status" defaultMessage="Status" />
        ),
        width: '8%',
        sortable: true,
        render: (enabled: boolean) =>
          enabled ? (
            <EuiBadge color="success" data-test-subj="ruleStatusEnabled">
              {i18n.translate('xpack.alertingV2.rulesList.statusEnabled', {
                defaultMessage: 'Enabled',
              })}
            </EuiBadge>
          ) : (
            <EuiBadge color="default" data-test-subj="ruleStatusDisabled">
              {i18n.translate('xpack.alertingV2.rulesList.statusDisabled', {
                defaultMessage: 'Disabled',
              })}
            </EuiBadge>
          ),
      },
      {
        name: (
          <FormattedMessage
            id="xpack.alertingV2.rulesList.column.actions"
            defaultMessage="Actions"
          />
        ),
        width: '8%',
        align: 'right',
        render: (rule: RuleApiResponse) => (
          <EuiFlexGroup
            gutterSize="xs"
            alignItems="center"
            responsive={false}
            justifyContent="flexEnd"
          >
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={i18n.translate('xpack.alertingV2.rulesList.action.quickEdit', {
                  defaultMessage: 'Quick edit rule',
                })}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  iconType="pencil"
                  color="text"
                  onClick={() => onQuickEdit(rule)}
                  aria-label={i18n.translate('xpack.alertingV2.rulesList.action.quickEdit', {
                    defaultMessage: 'Quick edit rule',
                  })}
                  data-test-subj={`quickEditRule-${rule.id}`}
                />
              </EuiToolTip>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <RuleActionsMenu
                rule={rule}
                onEdit={onEdit}
                onClone={onClone}
                onDelete={onDelete}
                onToggleEnabled={onToggleEnabled}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
      },
    ],
    [
      isPageSelected,
      isRowSelected,
      onSelectPage,
      onSelectRow,
      onNavigateToDetails,
      onExpand,
      onQuickEdit,
      onEdit,
      onClone,
      onDelete,
      onToggleEnabled,
    ]
  );

  const noItemsMessage =
    search || hasActiveFilters
      ? i18n.translate('xpack.alertingV2.rulesList.noSearchResults', {
          defaultMessage: 'No rules match your search or filters.',
        })
      : i18n.translate('xpack.alertingV2.rulesList.noRules', {
          defaultMessage: 'No rules found.',
        });

  return (
    <>
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" data-test-subj="rulesListShowingLabel">
            <FormattedMessage
              id="xpack.alertingV2.rulesList.showingLabel"
              defaultMessage="Showing {rangeBold} of {totalBold}"
              values={{
                rangeBold: (
                  <strong>
                    {Math.min((page - 1) * perPage + 1, totalItemCount)}-
                    {Math.min(page * perPage, totalItemCount)}
                  </strong>
                ),
                totalBold: (
                  <strong>
                    <FormattedMessage
                      id="xpack.alertingV2.rulesList.showingLabelTotal"
                      defaultMessage="{total} {total, plural, one {Rule} other {Rules}}"
                      values={{ total: totalItemCount }}
                    />
                  </strong>
                ),
              }}
            />
          </EuiText>
        </EuiFlexItem>
        {selectedCount > 0 ? (
          <>
            <EuiFlexItem grow={false}>
              <EuiPopover
                button={
                  <EuiButtonEmpty
                    size="xs"
                    iconType="arrowDown"
                    iconSide="right"
                    onClick={() => setIsBulkActionsOpen((open) => !open)}
                    data-test-subj="bulkActionsButton"
                  >
                    <FormattedMessage
                      id="xpack.alertingV2.rulesList.selectedCount"
                      defaultMessage="{count} Selected"
                      values={{ count: selectedCount }}
                    />
                  </EuiButtonEmpty>
                }
                isOpen={isBulkActionsOpen}
                closePopover={() => setIsBulkActionsOpen(false)}
                panelPaddingSize="none"
                anchorPosition="downLeft"
                aria-label={i18n.translate('xpack.alertingV2.rulesList.bulkAction.menu', {
                  defaultMessage: 'Bulk actions',
                })}
              >
                <EuiContextMenuPanel
                  items={[
                    <EuiContextMenuItem
                      key="enable"
                      icon={<EuiIcon type="checkCircle" size="m" aria-hidden={true} />}
                      onClick={handleBulkEnable}
                      data-test-subj="bulkEnableRules"
                    >
                      {i18n.translate('xpack.alertingV2.rulesList.bulkAction.enable', {
                        defaultMessage: 'Enable',
                      })}
                    </EuiContextMenuItem>,
                    <EuiContextMenuItem
                      key="disable"
                      icon={<EuiIcon type="crossInCircle" size="m" aria-hidden={true} />}
                      onClick={handleBulkDisable}
                      data-test-subj="bulkDisableRules"
                    >
                      {i18n.translate('xpack.alertingV2.rulesList.bulkAction.disable', {
                        defaultMessage: 'Disable',
                      })}
                    </EuiContextMenuItem>,
                    <EuiContextMenuItem
                      key="delete"
                      icon={<EuiIcon type="trash" size="m" color="danger" aria-hidden={true} />}
                      onClick={handleBulkDelete}
                      data-test-subj="bulkDeleteRules"
                    >
                      {i18n.translate('xpack.alertingV2.rulesList.bulkAction.delete', {
                        defaultMessage: 'Delete',
                      })}
                    </EuiContextMenuItem>,
                  ]}
                />
              </EuiPopover>
            </EuiFlexItem>
            {isAllSelected && totalItemCount > BULK_FILTER_MAX_RULES ? (
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued" data-test-subj="bulkSelectAllLimitDisclosure">
                  <FormattedMessage
                    id="xpack.alertingV2.rulesList.bulkSelectAllLimitDisclosure"
                    defaultMessage="Only the first {maxRules, number} rules can be selected for bulk actions."
                    values={{ maxRules: BULK_FILTER_MAX_RULES }}
                  />
                </EuiText>
              </EuiFlexItem>
            ) : null}
            {!isAllSelected ? (
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="xs"
                  iconType="pagesSelect"
                  onClick={onSelectAll}
                  data-test-subj="selectAllRulesButton"
                >
                  {totalItemCount > BULK_FILTER_MAX_RULES ? (
                    <FormattedMessage
                      id="xpack.alertingV2.rulesList.selectFirstMaxRules"
                      defaultMessage="Select first {maxRules, number} rules"
                      values={{ maxRules: BULK_FILTER_MAX_RULES }}
                    />
                  ) : (
                    <FormattedMessage
                      id="xpack.alertingV2.rulesList.selectAll"
                      defaultMessage="Select all {total} {total, plural, one {rule} other {rules}}"
                      values={{ total: totalItemCount }}
                    />
                  )}
                </EuiButtonEmpty>
              </EuiFlexItem>
            ) : null}
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="xs"
                iconType="cross"
                color="danger"
                onClick={onClearSelection}
                data-test-subj="clearSelectionButton"
              >
                <FormattedMessage
                  id="xpack.alertingV2.rulesList.clearSelection"
                  defaultMessage="Clear selection"
                />
              </EuiButtonEmpty>
            </EuiFlexItem>
          </>
        ) : null}
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiHorizontalRule margin="none" style={{ height: 2 }} />
      <EuiBasicTable
        css={hideMobileSortMenuOnWideScreensStyle}
        items={items}
        itemId="id"
        columns={columns}
        loading={isLoading}
        pagination={pagination}
        sorting={
          sortField && sortDirection
            ? { sort: { field: sortField, direction: sortDirection } }
            : undefined
        }
        noItemsMessage={noItemsMessage}
        onChange={onTableChange}
        responsiveBreakpoint={false}
        tableCaption={i18n.translate('xpack.alertingV2.rulesList.tableCaption', {
          defaultMessage: 'Rules',
        })}
        data-test-subj="rulesListTable"
      />
    </>
  );
};
