/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  type CriteriaWithPagination,
  EuiButtonIcon,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiInMemoryTable,
  EuiLink,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRulesDemote } from '../hooks/use_queries_bulk_delete';
import { RuleActionsCell } from './rule_actions_cell';
import { DeleteTableItemsModal } from '../delete_table_items_modal';
import { SeverityBadge } from '../../significant_events_discovery/components/severity_badge/severity_badge';
import { SparkPlot } from '../../../spark_plot';
import { formatLastOccurredAt } from '../../significant_events_discovery/components/queries_table/utils';
import { TableTitle } from '../../stream_detail_systems/table_title';

interface RulesTableProps {
  rules: KnowledgeIndicator[];
  occurrencesByQueryId: Record<string, Array<{ x: number; y: number }>>;
  searchTerm: string;
  selectedKnowledgeIndicatorId?: string;
  onViewDetails: (knowledgeIndicator: KnowledgeIndicator) => void;
}

export function RulesTable({
  rules,
  occurrencesByQueryId,
  searchTerm,
  selectedKnowledgeIndicatorId,
  onViewDetails,
}: RulesTableProps) {
  const [selectedRules, setSelectedRules] = useState<KnowledgeIndicator[]>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [rulesToDelete, setRulesToDelete] = useState<KnowledgeIndicator[]>([]);
  const { demoteRules, isPending } = useRulesDemote({
    onSuccess: () => {
      setSelectedRules([]);
      setRulesToDelete([]);
    },
  });

  const filteredRules = useMemo(() => {
    if (!searchTerm) {
      return rules;
    }

    return rules.filter((rule) => {
      if (rule.kind !== 'query') {
        return false;
      }

      const title = (rule.query.title ?? '').toLowerCase();
      return title.includes(searchTerm);
    });
  }, [rules, searchTerm]);

  useEffect(() => {
    setPagination((currentPagination) => {
      if (currentPagination.pageIndex === 0) {
        return currentPagination;
      }

      return {
        ...currentPagination,
        pageIndex: 0,
      };
    });
  }, [searchTerm]);

  const isSelectionActionsDisabled = selectedRules.length === 0;

  const handleTableChange = useCallback(({ page }: CriteriaWithPagination<KnowledgeIndicator>) => {
    if (!page) {
      return;
    }

    setPagination({
      pageIndex: page.index,
      pageSize: page.size,
    });
  }, []);

  const columns = useMemo<Array<EuiBasicTableColumn<KnowledgeIndicator>>>(
    () => [
      {
        name: RULES_TABLE_RULES_COLUMN_LABEL,
        render: (item: KnowledgeIndicator) => {
          if (item.kind !== 'query') {
            return null;
          }

          return (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={
                    selectedKnowledgeIndicatorId === item.query.id
                      ? MINIMIZE_DETAILS_ARIA_LABEL
                      : VIEW_DETAILS_ARIA_LABEL
                  }
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType={
                      selectedKnowledgeIndicatorId === item.query.id ? 'minimize' : 'expand'
                    }
                    aria-label={
                      selectedKnowledgeIndicatorId === item.query.id
                        ? MINIMIZE_DETAILS_ARIA_LABEL
                        : VIEW_DETAILS_ARIA_LABEL
                    }
                    onClick={() => onViewDetails(item)}
                  />
                </EuiToolTip>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiLink onClick={() => onViewDetails(item)}>
                  {item.query.title || item.query.id}
                </EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        name: RULES_TABLE_SEVERITY_COLUMN_LABEL,
        align: 'left',
        width: '120px',
        render: (item: KnowledgeIndicator) =>
          item.kind === 'query' ? <SeverityBadge score={item.query.severity_score} /> : null,
      },
      {
        name: RULES_TABLE_LAST_OCCURRED_COLUMN_LABEL,
        align: 'left',
        width: '220px',
        render: (item: KnowledgeIndicator) => {
          if (item.kind !== 'query') {
            return null;
          }

          const occurrences = occurrencesByQueryId[item.query.id];
          if (!occurrences) {
            return null;
          }

          return formatLastOccurredAt(occurrences);
        },
      },
      {
        name: RULES_TABLE_EVENTS_COLUMN_LABEL,
        width: '160px',
        align: 'center',
        render: (item: KnowledgeIndicator) => {
          if (item.kind !== 'query') {
            return null;
          }

          const occurrences = occurrencesByQueryId[item.query.id];
          if (!occurrences) {
            return null;
          }

          return (
            <SparkPlot
              id={`rules-events-${item.query.id}`}
              name={RULES_TABLE_OCCURRENCES_TOOLTIP_NAME}
              type="bar"
              timeseries={occurrences}
              annotations={[]}
              compressed
              hideAxis
              height={32}
            />
          );
        },
      },
      {
        name: RULES_TABLE_ACTIONS_COLUMN_LABEL,
        width: '80px',
        align: 'right',
        render: (item: KnowledgeIndicator) => (
          <RuleActionsCell
            rule={item}
            isDisabled={isPending}
            onDeleteRequest={(rule) => setRulesToDelete([rule])}
          />
        ),
      },
    ],
    [isPending, occurrencesByQueryId, onViewDetails, selectedKnowledgeIndicatorId]
  );

  return (
    <>
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem grow={false}>
          <TableTitle
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            total={filteredRules.length}
            label={RULES_TABLE_LABEL}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            iconType="cross"
            size="xs"
            aria-label={RULES_TABLE_CLEAR_SELECTION_LABEL}
            isDisabled={isSelectionActionsDisabled}
            onClick={() => setSelectedRules([])}
          >
            {RULES_TABLE_CLEAR_SELECTION_LABEL}
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            iconType="trash"
            color="danger"
            size="xs"
            aria-label={RULES_TABLE_DELETE_BULK_ACTION_LABEL}
            isLoading={isPending}
            isDisabled={isSelectionActionsDisabled || isPending}
            onClick={() => {
              setRulesToDelete(selectedRules);
            }}
          >
            {RULES_TABLE_DELETE_BULK_ACTION_LABEL}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiHorizontalRule margin="none" style={{ height: 2 }} />
      <EuiInMemoryTable<KnowledgeIndicator>
        items={filteredRules}
        itemId={(item) => (item.kind === 'query' ? item.query.id : item.feature.id)}
        columns={columns}
        selection={{
          selected: selectedRules,
          onSelectionChange: setSelectedRules,
        }}
        pagination={{
          pageIndex: pagination.pageIndex,
          pageSize: pagination.pageSize,
          pageSizeOptions: [10, 25, 50],
        }}
        onTableChange={handleTableChange}
        tableCaption={i18n.translate('xpack.streams.rulesTable.tableCaption', {
          defaultMessage: 'Rules',
        })}
      />
      {rulesToDelete.length > 0 ? (
        <DeleteTableItemsModal
          title={DELETE_RULES_MODAL_TITLE(rulesToDelete.length)}
          items={rulesToDelete}
          onCancel={() => setRulesToDelete([])}
          onConfirm={() => {
            void demoteRules(
              rulesToDelete
                .filter(
                  (item): item is Extract<KnowledgeIndicator, { kind: 'query' }> =>
                    item.kind === 'query'
                )
                .map((item) => item.query.id)
            );
          }}
          isLoading={isPending}
        />
      ) : null}
    </>
  );
}

const RULES_TABLE_RULES_COLUMN_LABEL = i18n.translate(
  'xpack.streams.rulesTable.columns.rulesLabel',
  {
    defaultMessage: 'Rules',
  }
);

const RULES_TABLE_SEVERITY_COLUMN_LABEL = i18n.translate(
  'xpack.streams.rulesTable.columns.severityLabel',
  {
    defaultMessage: 'Severity',
  }
);

const RULES_TABLE_LAST_OCCURRED_COLUMN_LABEL = i18n.translate(
  'xpack.streams.rulesTable.columns.lastOccurredLabel',
  {
    defaultMessage: 'Last occurred',
  }
);

const RULES_TABLE_EVENTS_COLUMN_LABEL = i18n.translate(
  'xpack.streams.rulesTable.columns.eventsLabel',
  {
    defaultMessage: 'Events',
  }
);

const RULES_TABLE_ACTIONS_COLUMN_LABEL = i18n.translate(
  'xpack.streams.rulesTable.columns.actionsLabel',
  {
    defaultMessage: 'Actions',
  }
);

const RULES_TABLE_OCCURRENCES_TOOLTIP_NAME = i18n.translate(
  'xpack.streams.rulesTable.occurrencesTooltipName',
  {
    defaultMessage: 'Detected event occurrences',
  }
);

const RULES_TABLE_CLEAR_SELECTION_LABEL = i18n.translate(
  'xpack.streams.rulesTable.clearSelectionLabel',
  {
    defaultMessage: 'Clear selection',
  }
);

const RULES_TABLE_DELETE_BULK_ACTION_LABEL = i18n.translate(
  'xpack.streams.rulesTable.deleteBulkActionLabel',
  {
    defaultMessage: 'Delete selected',
  }
);

const RULES_TABLE_LABEL = i18n.translate('xpack.streams.rulesTable.label', {
  defaultMessage: 'Rules',
});

const DELETE_RULES_MODAL_TITLE = (count: number) =>
  i18n.translate('xpack.streams.deleteRulesModal.title', {
    defaultMessage:
      'Are you sure you want to delete {count, plural, one {this rule} other {these rules}}?',
    values: { count },
  });

const VIEW_DETAILS_ARIA_LABEL = i18n.translate('xpack.streams.rulesTable.viewDetailsAriaLabel', {
  defaultMessage: 'View details',
});

const MINIMIZE_DETAILS_ARIA_LABEL = i18n.translate(
  'xpack.streams.rulesTable.minimizeDetailsAriaLabel',
  {
    defaultMessage: 'Collapse details',
  }
);
