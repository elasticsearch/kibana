/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { Criteria, EuiBasicTableColumn, EuiTableSortingType } from '@elastic/eui';
import {
  EuiAccordion,
  EuiBasicTable,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EntityType } from '@kbn/entity-store/common';
import type { TableSortDirection, TableSortField } from './table/constants';
import {
  PAGE_SIZE_OPTIONS,
  SORT_FIELD_TO_API,
  SORT_FIELD_TO_TABLE,
  truncatedAnchorCss,
} from './table/constants';
import type { AnomalySummaryEntry } from '../../../../common/api/entity_analytics';
import { useGetInstalledJob } from '../../../common/components/ml/hooks/use_get_jobs';
import {
  ENTITY_ANOMALY_TABLE_ANOMALY_COLUMN,
  ENTITY_ANOMALY_TABLE_BASELINE_COLUMN,
  ENTITY_ANOMALY_TABLE_CAPTION,
  ENTITY_ANOMALY_TABLE_COLLAPSE_ROW_TOOLTIP,
  ENTITY_ANOMALY_TABLE_EXPAND_ROW_TOOLTIP,
  ENTITY_ANOMALY_TABLE_JOB_COLUMN,
  ENTITY_ANOMALY_TABLE_SCORE_COLUMN,
  ENTITY_ANOMALY_TABLE_SCORE_COLUMN_TOOLTIP,
  ENTITY_ANOMALY_TABLE_TACTIC_COLUMN,
  ENTITY_ANOMALY_TABLE_TIMESTAMP_COLUMN,
  ENTITY_ANOMALY_TABLE_TITLE,
} from './translations';
import type { TableRow } from './table/types';
import { AnomalyJobName } from './table/anomaly_job_name';
import { AnomalyTacticBadges } from './table/anomaly_tactic_badges';
import { mapSummaryToRow } from './table/map_summary_to_row';
import { AnomalyTimestamp } from './table/anomaly_timestamp';
import { AnomalyExpandedRow } from './table/anomaly_expanded_row';
import { AnomalyScoreBadge } from './table/anomaly_score_badge';

export interface TableChangeEvent {
  page?: { index: number; size: number };
  sort?: { field: TableSortField; direction: TableSortDirection };
}

interface AnomalyTabTableSectionProps {
  anomalies: AnomalySummaryEntry[];
  entityType: EntityType;
  onTableChange: (event: TableChangeEvent) => void;
  page: number;
  pageSize: number;
  sortField: TableSortField;
  sortDirection: TableSortDirection;
  timeRange: { from: string; to: string };
  total: number;
}

export const AnomalyTabTableSection: React.FC<AnomalyTabTableSectionProps> = ({
  anomalies,
  entityType,
  onTableChange,
  page,
  pageSize,
  sortField,
  sortDirection,
  timeRange,
  total,
}) => {
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(() => new Set());

  const jobIds = useMemo(() => [...new Set(anomalies.map((a) => a.jobId))], [anomalies]);
  const { jobs } = useGetInstalledJob(jobIds);

  const detectorDescriptionsByJob = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const job of jobs) {
      map[job.job_id] = (job.analysis_config.detectors ?? []).map(
        (d) => d.detector_description ?? ''
      );
    }
    return map;
  }, [jobs]);

  const rows = useMemo(
    () =>
      anomalies.map((entry, i) => {
        const detectorDescription =
          detectorDescriptionsByJob[entry.jobId]?.[entry.detectorIndex] || undefined;
        return mapSummaryToRow(entityType, entry, i, detectorDescription);
      }),
    [anomalies, entityType, detectorDescriptionsByJob]
  );

  const toggleRowExpanded = useCallback((id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const columns: Array<EuiBasicTableColumn<TableRow>> = useMemo(
    () => [
      // Expander column
      {
        align: 'center' as const,
        width: '32px',
        isExpander: true,
        name: '',
        render: (item: TableRow) => {
          const isExpanded = expandedRowIds.has(item.id);
          const label = isExpanded
            ? ENTITY_ANOMALY_TABLE_COLLAPSE_ROW_TOOLTIP
            : ENTITY_ANOMALY_TABLE_EXPAND_ROW_TOOLTIP;
          return (
            <EuiToolTip content={label} disableScreenReaderOutput>
              <EuiButtonIcon
                aria-label={label}
                aria-expanded={isExpanded}
                iconType={isExpanded ? 'arrowDown' : 'arrowRight'}
                color="text"
                onClick={() => toggleRowExpanded(item.id)}
              />
            </EuiToolTip>
          );
        },
      },
      // ML job column
      {
        name: ENTITY_ANOMALY_TABLE_JOB_COLUMN,
        field: 'jobDisplayName',
        sortable: true,
        render: (_: string, item: TableRow) => (
          <AnomalyJobName jobId={item.jobId} jobName={item.jobDisplayName} timeRange={timeRange} />
        ),
      },
      // Tactic column
      {
        name: ENTITY_ANOMALY_TABLE_TACTIC_COLUMN,
        field: 'mitreTactics',
        render: (tactics: string[]) => <AnomalyTacticBadges tactics={tactics} />,
      },
      // Timestamp column
      {
        name: ENTITY_ANOMALY_TABLE_TIMESTAMP_COLUMN,
        field: 'timestamp',
        sortable: true,
        render: (timestamp: number) => <AnomalyTimestamp timestamp={timestamp} />,
      },
      // Baseline column
      {
        name: ENTITY_ANOMALY_TABLE_BASELINE_COLUMN,
        render: (item: TableRow) => (
          <EuiToolTip content={item.baseline} anchorProps={{ css: truncatedAnchorCss }}>
            <EuiText size="xs" component="span" tabIndex={0}>
              {item.baseline}
            </EuiText>
          </EuiToolTip>
        ),
      },
      // Anomaly column
      {
        name: ENTITY_ANOMALY_TABLE_ANOMALY_COLUMN,
        render: (item: TableRow) => (
          <EuiToolTip content={item.anomaly} anchorProps={{ css: truncatedAnchorCss }}>
            <EuiText size="xs" component="span" tabIndex={0}>
              {item.anomaly}
            </EuiText>
          </EuiToolTip>
        ),
      },
      // Anomaly score column
      {
        name: (
          <EuiFlexGroup
            gutterSize="xs"
            alignItems="center"
            responsive={false}
            css={css`
              flex-wrap: nowrap;
            `}
          >
            <EuiFlexItem grow={false}>{ENTITY_ANOMALY_TABLE_SCORE_COLUMN}</EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiIconTip
                type="question"
                content={ENTITY_ANOMALY_TABLE_SCORE_COLUMN_TOOLTIP}
                position="top"
                data-test-subj="entity-anomalies-table-score-column-tooltip"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        ),
        field: 'anomalyScore',
        sortable: true,
        width: '136px',
        render: (anomalyScore: number) => <AnomalyScoreBadge score={anomalyScore} />,
      },
    ],
    [expandedRowIds, timeRange, toggleRowExpanded]
  );

  const itemIdToExpandedRowMap = useMemo(() => {
    const map: Record<string, React.ReactNode> = {};
    for (const row of rows.filter((r) => expandedRowIds.has(r.id))) {
      map[row.id] = <AnomalyExpandedRow row={row} />;
    }
    return map;
  }, [expandedRowIds, rows]);

  const pagination = useMemo(
    () => ({
      pageIndex: page - 1,
      pageSize,
      totalItemCount: total,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
    }),
    [page, pageSize, total]
  );

  const sorting = useMemo<EuiTableSortingType<TableRow>>(
    () => ({
      sort: { field: SORT_FIELD_TO_TABLE[sortField], direction: sortDirection },
    }),
    [sortField, sortDirection]
  );

  const handleChange = useCallback(
    ({ page: pageChange, sort }: Criteria<TableRow>) => {
      const event: TableChangeEvent = {};
      if (pageChange) event.page = { index: pageChange.index, size: pageChange.size };
      if (sort) {
        const apiField = SORT_FIELD_TO_API[sort.field as keyof TableRow];
        if (apiField) event.sort = { field: apiField, direction: sort.direction };
      }
      onTableChange(event);
    },
    [onTableChange]
  );

  const from = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);

  return (
    <div>
      <EuiAccordion
        id="entity-anomalies-tab-table-accordion"
        initialIsOpen
        buttonContent={
          <EuiTitle size="xs">
            <h3>{ENTITY_ANOMALY_TABLE_TITLE}</h3>
          </EuiTitle>
        }
      >
        <EuiSpacer size="m" />
        <EuiText size="xs">
          <FormattedMessage
            id="xpack.securitySolution.entityAnalytics.entityAnomalies.tab.page"
            defaultMessage="Showing {from}-{to} of {total} anomalies"
            values={{
              from: <strong>{from}</strong>,
              to: <strong>{to}</strong>,
              total: <strong>{total}</strong>,
            }}
          />
        </EuiText>
        <EuiSpacer size="s" />
        <EuiBasicTable
          tableCaption={ENTITY_ANOMALY_TABLE_CAPTION}
          items={rows}
          itemId="id"
          columns={columns}
          sorting={sorting}
          pagination={pagination}
          onChange={handleChange}
          compressed
          itemIdToExpandedRowMap={itemIdToExpandedRowMap}
        />
      </EuiAccordion>
    </div>
  );
};
