/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  type CriteriaWithPagination,
  EuiBadge,
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
import { type Streams, QUERY_TYPE_STATS } from '@kbn/streams-schema';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { css } from '@emotion/react';
import { useStreamKnowledgeIndicatorsBulkDelete } from '../hooks/use_stream_knowledge_indicators_bulk_delete';
import { KnowledgeIndicatorActionsCell } from '../knowledge_indicator_actions_cell';
import { DeleteTableItemsModal } from '../delete_table_items_modal';
import { SparkPlot } from '../../../spark_plot';
import { TableTitle } from '../../stream_detail_systems/table_title';
import { getKnowledgeIndicatorItemId } from '../utils/get_knowledge_indicator_item_id';
import { getKnowledgeIndicatorType } from '../utils/get_knowledge_indicator_type';

interface KnowledgeIndicatorsTableProps {
  definition: Streams.all.Definition;
  knowledgeIndicators: KnowledgeIndicator[];
  occurrencesByQueryId: Record<string, Array<{ x: number; y: number }>>;
  searchTerm: string;
  selectedTypes: string[];
  statusFilter: 'active' | 'excluded';
  selectedKnowledgeIndicatorId?: string;
  onViewDetails: (knowledgeIndicator: KnowledgeIndicator) => void;
}

export function KnowledgeIndicatorsTable({
  definition,
  knowledgeIndicators,
  occurrencesByQueryId,
  searchTerm,
  selectedTypes,
  statusFilter,
  selectedKnowledgeIndicatorId,
  onViewDetails,
}: KnowledgeIndicatorsTableProps) {
  const [selectedKnowledgeIndicators, setSelectedKnowledgeIndicators] = useState<
    KnowledgeIndicator[]
  >([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });
  const [knowledgeIndicatorsToDelete, setKnowledgeIndicatorsToDelete] = useState<
    KnowledgeIndicator[]
  >([]);
  const { deleteKnowledgeIndicatorsInBulk, isDeleting } = useStreamKnowledgeIndicatorsBulkDelete({
    streamName: definition.name,
    onSuccess: () => {
      setSelectedKnowledgeIndicators([]);
      setKnowledgeIndicatorsToDelete([]);
    },
  });

  const filteredKnowledgeIndicators = useMemo(() => {
    return knowledgeIndicators.filter((knowledgeIndicator) => {
      const matchesStatusFilter =
        statusFilter === 'active'
          ? knowledgeIndicator.kind === 'query' || !knowledgeIndicator.feature.excluded
          : knowledgeIndicator.kind === 'feature' && Boolean(knowledgeIndicator.feature.excluded);

      if (!matchesStatusFilter) {
        return false;
      }

      const type = getKnowledgeIndicatorType(knowledgeIndicator);
      const matchesType = selectedTypes.length === 0 || selectedTypes.includes(type);

      if (!matchesType) {
        return false;
      }

      if (!searchTerm) {
        return true;
      }

      if (knowledgeIndicator.kind === 'feature') {
        return (knowledgeIndicator.feature.title ?? '').toLowerCase().includes(searchTerm);
      }

      return (knowledgeIndicator.query.title ?? '').toLowerCase().includes(searchTerm);
    });
  }, [knowledgeIndicators, searchTerm, selectedTypes, statusFilter]);

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
  }, [searchTerm, selectedTypes, statusFilter]);

  const isSelectionActionsDisabled = selectedKnowledgeIndicators.length === 0;

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
        name: SIGNIFICANT_EVENTS_TABLE_TITLE_COLUMN_LABEL,
        render: (knowledgeIndicator: KnowledgeIndicator) => {
          const title =
            knowledgeIndicator.kind === 'feature'
              ? knowledgeIndicator.feature.title ?? knowledgeIndicator.feature.id
              : knowledgeIndicator.query.title ?? knowledgeIndicator.query.id;

          const isExpanded =
            selectedKnowledgeIndicatorId === getKnowledgeIndicatorItemId(knowledgeIndicator);

          return (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={isExpanded ? MINIMIZE_DETAILS_ARIA_LABEL : VIEW_DETAILS_ARIA_LABEL}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType={isExpanded ? 'minimize' : 'expand'}
                    aria-label={isExpanded ? MINIMIZE_DETAILS_ARIA_LABEL : VIEW_DETAILS_ARIA_LABEL}
                    onClick={() => onViewDetails(knowledgeIndicator)}
                  />
                </EuiToolTip>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiLink onClick={() => onViewDetails(knowledgeIndicator)}>{title}</EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        name: SIGNIFICANT_EVENTS_TABLE_EVENTS_COLUMN_LABEL,
        width: '160px',
        render: (knowledgeIndicator: KnowledgeIndicator) => {
          if (knowledgeIndicator.kind !== 'query' || !knowledgeIndicator.rule.backed) {
            return null;
          }

          const occurrences = occurrencesByQueryId[knowledgeIndicator.query.id];

          if (!occurrences) {
            return null;
          }

          return (
            <SparkPlot
              id={`ki-events-${knowledgeIndicator.query.id}`}
              name={SIGNIFICANT_EVENTS_TABLE_OCCURRENCES_TOOLTIP_NAME}
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
        name: SIGNIFICANT_EVENTS_TABLE_TYPE_COLUMN_LABEL,
        width: '200px',
        render: (knowledgeIndicator: KnowledgeIndicator) => {
          if (knowledgeIndicator.kind === 'feature') {
            return (
              <EuiBadge
                color="hollow"
                css={css`
                  text-transform: capitalize;
                `}
              >
                {knowledgeIndicator.feature.type}
              </EuiBadge>
            );
          }

          return (
            <EuiBadge color="hollow">
              {knowledgeIndicator.query.type === QUERY_TYPE_STATS
                ? SIGNIFICANT_EVENTS_TABLE_STATS_QUERY_TYPE_LABEL
                : SIGNIFICANT_EVENTS_TABLE_MATCH_QUERY_TYPE_LABEL}
            </EuiBadge>
          );
        },
      },
      {
        name: SIGNIFICANT_EVENTS_TABLE_ACTIONS_COLUMN_LABEL,
        width: '80px',
        align: 'right',
        render: (knowledgeIndicator: KnowledgeIndicator) => (
          <KnowledgeIndicatorActionsCell
            streamName={definition.name}
            knowledgeIndicator={knowledgeIndicator}
            onDeleteRequest={(item) => setKnowledgeIndicatorsToDelete([item])}
          />
        ),
      },
    ],
    [definition, occurrencesByQueryId, onViewDetails, selectedKnowledgeIndicatorId]
  );

  return (
    <>
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem grow={false}>
          <TableTitle
            pageIndex={pagination.pageIndex}
            pageSize={pagination.pageSize}
            total={filteredKnowledgeIndicators.length}
            label={SIGNIFICANT_EVENTS_TABLE_LABEL}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            iconType="cross"
            size="xs"
            aria-label={SIGNIFICANT_EVENTS_TABLE_CLEAR_SELECTION_LABEL}
            isDisabled={isSelectionActionsDisabled}
            onClick={() => setSelectedKnowledgeIndicators([])}
          >
            {SIGNIFICANT_EVENTS_TABLE_CLEAR_SELECTION_LABEL}
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            iconType="trash"
            color="danger"
            size="xs"
            aria-label={SIGNIFICANT_EVENTS_TABLE_DELETE_BULK_ACTION_LABEL}
            isLoading={isDeleting}
            isDisabled={isSelectionActionsDisabled || isDeleting}
            onClick={() => {
              setKnowledgeIndicatorsToDelete(selectedKnowledgeIndicators);
            }}
          >
            {SIGNIFICANT_EVENTS_TABLE_DELETE_BULK_ACTION_LABEL}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiHorizontalRule margin="none" style={{ height: 2 }} />
      <EuiInMemoryTable<KnowledgeIndicator>
        items={filteredKnowledgeIndicators}
        itemId={getKnowledgeIndicatorItemId}
        columns={columns}
        selection={{
          selected: selectedKnowledgeIndicators,
          onSelectionChange: setSelectedKnowledgeIndicators,
        }}
        pagination={{
          pageIndex: pagination.pageIndex,
          pageSize: pagination.pageSize,
          pageSizeOptions: [25, 50, 100],
        }}
        onTableChange={handleTableChange}
        tableCaption={SIGNIFICANT_EVENTS_TABLE_CAPTION}
      />
      {knowledgeIndicatorsToDelete.length > 0 ? (
        <DeleteTableItemsModal
          title={DELETE_KNOWLEDGE_INDICATORS_MODAL_TITLE(knowledgeIndicatorsToDelete.length)}
          items={knowledgeIndicatorsToDelete}
          onCancel={() => setKnowledgeIndicatorsToDelete([])}
          onConfirm={() => {
            void deleteKnowledgeIndicatorsInBulk(knowledgeIndicatorsToDelete);
          }}
          isLoading={isDeleting}
        />
      ) : null}
    </>
  );
}

const SIGNIFICANT_EVENTS_TABLE_TITLE_COLUMN_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.columns.titleLabel',
  {
    defaultMessage: 'Knowledge Indicator',
  }
);

const SIGNIFICANT_EVENTS_TABLE_TYPE_COLUMN_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.columns.typeLabel',
  {
    defaultMessage: 'Type',
  }
);

const SIGNIFICANT_EVENTS_TABLE_MATCH_QUERY_TYPE_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.columns.matchQueryTypeLabel',
  {
    defaultMessage: 'Match query',
  }
);

const SIGNIFICANT_EVENTS_TABLE_STATS_QUERY_TYPE_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.columns.statsQueryTypeLabel',
  {
    defaultMessage: 'Stats query',
  }
);

const SIGNIFICANT_EVENTS_TABLE_ACTIONS_COLUMN_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.columns.actionsLabel',
  {
    defaultMessage: 'Actions',
  }
);

const SIGNIFICANT_EVENTS_TABLE_EVENTS_COLUMN_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.columns.eventsLabel',
  {
    defaultMessage: 'Events',
  }
);

const SIGNIFICANT_EVENTS_TABLE_CAPTION = i18n.translate(
  'xpack.streams.significantEventsTable.tableCaption',
  {
    defaultMessage: 'Significant events',
  }
);

const SIGNIFICANT_EVENTS_TABLE_OCCURRENCES_TOOLTIP_NAME = i18n.translate(
  'xpack.streams.significantEventsTable.occurrencesTooltipName',
  {
    defaultMessage: 'Detected event occurrences',
  }
);

const SIGNIFICANT_EVENTS_TABLE_CLEAR_SELECTION_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.clearSelectionLabel',
  {
    defaultMessage: 'Clear selection',
  }
);

const SIGNIFICANT_EVENTS_TABLE_DELETE_BULK_ACTION_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.deleteBulkActionLabel',
  {
    defaultMessage: 'Delete selected',
  }
);

const SIGNIFICANT_EVENTS_TABLE_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.label',
  {
    defaultMessage: 'Knowledge indicators',
  }
);

const VIEW_DETAILS_ARIA_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorsTable.viewDetailsAriaLabel',
  {
    defaultMessage: 'View details',
  }
);

const MINIMIZE_DETAILS_ARIA_LABEL = i18n.translate(
  'xpack.streams.knowledgeIndicatorsTable.minimizeDetailsAriaLabel',
  {
    defaultMessage: 'Collapse details',
  }
);

const DELETE_KNOWLEDGE_INDICATORS_MODAL_TITLE = (count: number) =>
  i18n.translate('xpack.streams.deleteKnowledgeIndicatorsModal.title', {
    defaultMessage:
      'Are you sure you want to delete {count, plural, one {this knowledge indicator} other {these knowledge indicators}}?',
    values: { count },
  });
