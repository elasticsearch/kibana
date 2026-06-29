/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiBadge,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { QUERY_TYPE_STATS } from '@kbn/streams-schema';
import React, { useMemo } from 'react';
import { SparkPlot } from '../../../../spark_plot';
import { KnowledgeIndicatorActionsCell } from '../../../stream_detail_significant_events_view/knowledge_indicator_actions_cell';
import { getKnowledgeIndicatorItemId } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_item_id';
import { getKnowledgeIndicatorStreamName } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_stream_name';
import { getKnowledgeIndicatorTitle } from './use_knowledge_indicators_table';
import {
  TITLE_COLUMN_LABEL,
  EVENTS_COLUMN_LABEL,
  TYPE_COLUMN_LABEL,
  MATCH_QUERY_TYPE_LABEL,
  STATS_QUERY_TYPE_LABEL,
  STREAM_COLUMN_LABEL,
  ACTIONS_COLUMN_LABEL,
  VIEW_DETAILS_ARIA_LABEL,
  MINIMIZE_DETAILS_ARIA_LABEL,
  OCCURRENCES_TOOLTIP_NAME,
} from './translations';

const EMPTY_ANNOTATIONS: never[] = [];
const capitalizeStyle = css`
  text-transform: capitalize;
`;

interface UseKnowledgeIndicatorsColumnsParams {
  occurrencesByQueryId: Record<string, Array<{ x: number; y: number }>>;
  selectedKnowledgeIndicatorId: string | undefined;
  toggleSelectedKnowledgeIndicator: (ki: KnowledgeIndicator) => void;
  setKnowledgeIndicatorsToDelete: (items: KnowledgeIndicator[]) => void;
}

export const useKnowledgeIndicatorsColumns = ({
  occurrencesByQueryId,
  selectedKnowledgeIndicatorId,
  toggleSelectedKnowledgeIndicator,
  setKnowledgeIndicatorsToDelete,
}: UseKnowledgeIndicatorsColumnsParams) =>
  useMemo<Array<EuiBasicTableColumn<KnowledgeIndicator>>>(
    () => [
      {
        name: TITLE_COLUMN_LABEL,
        render: (ki: KnowledgeIndicator) => {
          const title = getKnowledgeIndicatorTitle(ki);
          const isExpanded = selectedKnowledgeIndicatorId === getKnowledgeIndicatorItemId(ki);

          return (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={isExpanded ? MINIMIZE_DETAILS_ARIA_LABEL : VIEW_DETAILS_ARIA_LABEL}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    data-test-subj="knowledgeIndicatorsDetailsButton"
                    iconType={isExpanded ? 'minimize' : 'expand'}
                    aria-label={isExpanded ? MINIMIZE_DETAILS_ARIA_LABEL : VIEW_DETAILS_ARIA_LABEL}
                    onClick={() => toggleSelectedKnowledgeIndicator(ki)}
                  />
                </EuiToolTip>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiLink onClick={() => toggleSelectedKnowledgeIndicator(ki)}>{title}</EuiLink>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        name: EVENTS_COLUMN_LABEL,
        width: '160px',
        align: 'center',
        render: (ki: KnowledgeIndicator) => {
          if (ki.kind !== 'query' || !ki.rule.backed) {
            return null;
          }

          const occurrences = occurrencesByQueryId[ki.query.id];
          if (!occurrences) return null;

          return (
            <SparkPlot
              id={`ki-events-${ki.query.id}`}
              name={OCCURRENCES_TOOLTIP_NAME}
              type="bar"
              timeseries={occurrences}
              annotations={EMPTY_ANNOTATIONS}
              compressed
              hideAxis
              height={32}
            />
          );
        },
      },
      {
        name: TYPE_COLUMN_LABEL,
        width: '192px',
        render: (ki: KnowledgeIndicator) => {
          if (ki.kind === 'feature') {
            return (
              <EuiBadge color="hollow" css={capitalizeStyle}>
                {ki.feature.type}
              </EuiBadge>
            );
          }
          return (
            <EuiBadge color="hollow">
              {ki.query.type === QUERY_TYPE_STATS ? STATS_QUERY_TYPE_LABEL : MATCH_QUERY_TYPE_LABEL}
            </EuiBadge>
          );
        },
      },
      {
        name: STREAM_COLUMN_LABEL,
        width: '192px',
        render: (ki: KnowledgeIndicator) => {
          return <EuiBadge color="hollow">{getKnowledgeIndicatorStreamName(ki)}</EuiBadge>;
        },
      },
      {
        name: ACTIONS_COLUMN_LABEL,
        width: '96px',
        align: 'right',
        render: (ki: KnowledgeIndicator) => (
          <KnowledgeIndicatorActionsCell
            streamName={getKnowledgeIndicatorStreamName(ki)}
            knowledgeIndicator={ki}
            onDeleteRequest={(item) => setKnowledgeIndicatorsToDelete([item])}
          />
        ),
      },
    ],
    [
      occurrencesByQueryId,
      selectedKnowledgeIndicatorId,
      toggleSelectedKnowledgeIndicator,
      setKnowledgeIndicatorsToDelete,
    ]
  );
