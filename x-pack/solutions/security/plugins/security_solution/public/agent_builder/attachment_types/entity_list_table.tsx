/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInMemoryTable,
  EuiText,
  EuiToolTip,
  type EuiBasicTableColumn,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { CriticalityLevelWithUnassigned } from '../../../common/entity_analytics/asset_criticality/types';
import type { EntityType } from '../../../common/entity_analytics/types';
import { RiskSeverity } from '../../../common/search_strategy';
import { FormattedRelativePreferenceDate } from '../../common/components/formatted_date';
import { getEmptyTagValue } from '../../common/components/empty_value';
import { buildEntityRightPanel } from './entity_explore_navigation';
import { useEntityAnalyticsAgentNavigation } from './entity_analytics_agent_navigation_context';
import { formatRiskScore } from '../../entity_analytics/common';
import { CRITICALITY_LEVEL_TITLE } from '../../entity_analytics/components/asset_criticality/translations';
import { RiskScoreLevel } from '../../entity_analytics/components/severity/common';
import { EntityIconByType } from '../../entity_analytics/components/entity_store/helpers';
import { TruncatedBadgeList } from '../../flyout/entity_details/shared/components/entity_source_value';
import { formatEntitySource } from './entity_attachment/entity_table/entity_data_source_utils';

export interface EntityListRow {
  entity_type: 'host' | 'user' | 'service' | 'generic';
  entity_id: string;
  entity_name?: string;
  source?: unknown;
  risk_score_norm?: number;
  risk_level?: string;
  criticality?: string;
  first_seen?: string;
  last_seen?: string;
}

const parseRiskLevel = (raw?: string): RiskSeverity => {
  if (!raw) {
    return RiskSeverity.Unknown;
  }
  const normalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  const allowed = Object.values(RiskSeverity) as string[];
  if (allowed.includes(normalized)) {
    return normalized as RiskSeverity;
  }
  return RiskSeverity.Unknown;
};

const criticalityLabel = (raw?: string): string | undefined => {
  if (!raw) {
    return undefined;
  }
  return CRITICALITY_LEVEL_TITLE[raw as CriticalityLevelWithUnassigned] ?? raw;
};

const LAST_SEEN_TOOLTIP_FIELD_NAME = '@timestamp';

const SOURCE_OVERFLOW_TOOLTIP_TITLE = i18n.translate(
  'xpack.securitySolution.agentBuilder.entityListAttachment.col.sourceOverflowTitle',
  { defaultMessage: 'Additional data sources' }
);
const FIRST_SEEN_TOOLTIP_FIELD_NAME = 'entity.lifecycle.first_seen';

const OPEN_ENTITY_IN_ENTITY_ANALYTICS_ARIA = i18n.translate(
  'xpack.securitySolution.agentBuilder.entityListAttachment.openEntityInEntityAnalyticsAria',
  { defaultMessage: 'Open entity in Entity Analytics' }
);

/**
 * Coerce the `source` column value into the multi-value string array shape of
 * `entity.source`. Rows from the entity store project `entity.source` as
 * either a single string (legacy) or an array of strings. We accept either
 * and drop anything non-string so the badge renderer only has to deal with
 * `string[]`.
 */
const normalizeEntitySources = (source: unknown): string[] => {
  if (typeof source === 'string') {
    return source ? [source] : [];
  }
  if (Array.isArray(source)) {
    return source.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  return [];
};

const NAME_COLUMN_WIDTH = '260px';

/**
 * Horizontal scroll wrapper for the entity list table. The canvas preview panel
 * can be narrower than the sum of the table's 8 columns (Name, Source,
 * Criticality, Risk score, Risk level, First seen, Last seen, Entity ID),
 * especially on laptop-width screens. We keep the table at a readable minimum
 * width and let it overflow with a scrollbar instead of squeezing columns into
 * character-by-character wrapping. The wrapper establishes its own horizontal
 * scroll container so the outer dashboard panel (title, risk breakdown,
 * highlights, by-type stats) continues to fit the visible width.
 *
 * The min-width (1000px) is tuned to fit the explicit Name and Source column
 * widths plus enough room for the remaining six columns without forcing the
 * Name cell to wrap common email-style entity names.
 *
 * We also pin the first header + body cells to NAME_COLUMN_WIDTH. Under
 * tableLayout="auto" the column's `width` prop is only a hint and the browser
 * can reallocate space between pages (noticeable when pagination swaps in
 * rows whose other-column content has different widths). Forcing
 * width/min-width/max-width on the cells themselves makes the Name column
 * stable across pages.
 *
 * Pagination overrides: when this attachment is rendered inside a chat round,
 * the message content sits inside an `EuiText` + `EuiMarkdownFormat` scope
 * that forces `ul { list-style: disc; margin-inline-start: 1.7143rem; }` onto
 * every nested list. EuiPagination renders its buttons inside a
 * `<ul class="euiPagination__list">`, so the inherited rules turn each
 * `<li>` into a visible bullet — the stray dark dot that shows up between
 * the "previous" chevron and the first page button — and push the whole
 * list to the right with a markdown-list indent. We also zero out any
 * background/outline on the active-page `EuiPaginationButton` so that
 * chat-scope styles (e.g. disabled-button tints inherited from ancestor
 * themes) do not render as a circular "disc" behind the active page
 * number. Scoped to this wrapper so the overrides only affect the entity
 * list attachment table's pagination. Mirrors the sibling override in
 * `entity_attachment/entity_table/entity_table.tsx`.
 */
const tableScrollStyles = css`
  overflow-x: auto;

  .euiTable {
    min-width: 1000px;
  }

  .euiTable .euiTableHeaderCell:first-of-type,
  .euiTable .euiTableRowCell:first-child {
    width: ${NAME_COLUMN_WIDTH};
    min-width: ${NAME_COLUMN_WIDTH};
    max-width: ${NAME_COLUMN_WIDTH};
  }

  .euiPagination__list,
  .euiPagination__list .euiPagination__item {
    list-style: none;
    margin: 0;
    margin-inline-start: 0;
    padding-inline-start: 0;
  }

  .euiPagination__list .euiPagination__item::marker,
  .euiPagination__list .euiPagination__item::before {
    content: none;
  }

  .euiPaginationButton[aria-current='page'],
  .euiPaginationButton[aria-current='page']::before,
  .euiPaginationButton[aria-current='page']::after {
    background: transparent;
    background-color: transparent;
    box-shadow: none;
    outline: none;
  }
`;

export const EntityListTable: React.FC<{
  entities: EntityListRow[];
  /**
   * Dismisses the Agent Builder canvas flyout. When present, the Name-column
   * "open entity" button closes the canvas before navigating to Entity
   * Analytics so the just-opened URL-backed expandable flyout isn't hidden
   * underneath the canvas overlay.
   */
  closeCanvas?: () => void;
}> = ({ entities, closeCanvas }) => {
  const { euiTheme } = useEuiTheme();
  const { navigateWithFlyout, navigateToHome } = useEntityAnalyticsAgentNavigation();

  const columns: Array<EuiBasicTableColumn<EntityListRow>> = useMemo(
    () => [
      {
        field: 'entity_name',
        name: i18n.translate('xpack.securitySolution.agentBuilder.entityListAttachment.col.name', {
          defaultMessage: 'Name',
        }),
        width: NAME_COLUMN_WIDTH,
        render: (_: string, row: EntityListRow) => {
          const icon = EntityIconByType[row.entity_type as EntityType] ?? 'globe';
          const label = row.entity_name ?? row.entity_id;
          return (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={OPEN_ENTITY_IN_ENTITY_ANALYTICS_ARIA}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType={icon}
                    display="empty"
                    aria-label={OPEN_ENTITY_IN_ENTITY_ANALYTICS_ARIA}
                    onClick={() => {
                      const displayName = row.entity_name ?? row.entity_id;
                      const rightPanel = buildEntityRightPanel({
                        identifierType: row.entity_type,
                        identifier: displayName,
                        entityStoreId: row.entity_id,
                      });
                      // Close the canvas first: both navigation helpers only
                      // update the URL (and, when wired, the Agent Builder
                      // sidebar). Leaving the canvas open would overlay the
                      // expandable flyout that the URL change is about to open.
                      closeCanvas?.();
                      if (rightPanel) {
                        navigateWithFlyout({ preview: [], right: rightPanel });
                      } else {
                        navigateToHome();
                      }
                    }}
                  />
                </EuiToolTip>
              </EuiFlexItem>
              <EuiFlexItem grow={true} style={{ minWidth: 0 }}>
                <EuiText
                  size="s"
                  css={{
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {label}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        field: 'source',
        name: i18n.translate(
          'xpack.securitySolution.agentBuilder.entityListAttachment.col.source',
          {
            defaultMessage: 'Source',
          }
        ),
        width: '140px',
        render: (source: unknown) => {
          const list = normalizeEntitySources(source);
          if (list.length === 0) {
            return getEmptyTagValue();
          }
          return (
            <TruncatedBadgeList
              values={list}
              formatValue={formatEntitySource}
              overflowTooltipTitle={SOURCE_OVERFLOW_TOOLTIP_TITLE}
              data-test-subj="entityListAttachmentTableSources"
            />
          );
        },
      },
      {
        field: 'criticality',
        name: i18n.translate(
          'xpack.securitySolution.agentBuilder.entityListAttachment.col.criticality',
          {
            defaultMessage: 'Criticality',
          }
        ),
        render: (c: string | undefined) => {
          const title = criticalityLabel(c);
          return title ? <EuiText size="s">{title}</EuiText> : getEmptyTagValue();
        },
      },
      {
        field: 'risk_score_norm',
        name: i18n.translate(
          'xpack.securitySolution.agentBuilder.entityListAttachment.col.riskScore',
          {
            defaultMessage: 'Risk score',
          }
        ),
        dataType: 'number',
        render: (score: number | undefined) =>
          score != null ? (
            <EuiText size="s" data-test-subj="entity-list-risk-score">
              {formatRiskScore(score)}
            </EuiText>
          ) : (
            getEmptyTagValue()
          ),
      },
      {
        field: 'risk_level',
        name: i18n.translate(
          'xpack.securitySolution.agentBuilder.entityListAttachment.col.riskLevel',
          {
            defaultMessage: 'Risk level',
          }
        ),
        render: (_: string | undefined, row: EntityListRow) => (
          <RiskScoreLevel severity={parseRiskLevel(row.risk_level)} />
        ),
      },
      {
        field: 'first_seen',
        name: i18n.translate(
          'xpack.securitySolution.agentBuilder.entityListAttachment.col.firstSeen',
          {
            defaultMessage: 'First seen',
          }
        ),
        render: (value: string | undefined) =>
          value ? (
            <FormattedRelativePreferenceDate
              value={value}
              relativeThresholdInHrs={Number.MAX_SAFE_INTEGER}
              tooltipFieldName={FIRST_SEEN_TOOLTIP_FIELD_NAME}
            />
          ) : (
            getEmptyTagValue()
          ),
      },
      {
        field: 'last_seen',
        name: i18n.translate(
          'xpack.securitySolution.agentBuilder.entityListAttachment.col.lastSeen',
          {
            defaultMessage: 'Last seen',
          }
        ),
        render: (value: string | undefined) =>
          value ? (
            <FormattedRelativePreferenceDate
              value={value}
              relativeThresholdInHrs={Number.MAX_SAFE_INTEGER}
              tooltipFieldName={LAST_SEEN_TOOLTIP_FIELD_NAME}
            />
          ) : (
            getEmptyTagValue()
          ),
      },
      {
        field: 'entity_id',
        name: i18n.translate('xpack.securitySolution.agentBuilder.entityListAttachment.col.euid', {
          defaultMessage: 'Entity ID (EUID)',
        }),
        truncateText: true,
        render: (id: string) => (
          <EuiText size="xs" css={{ fontFamily: euiTheme.font.familyCode }}>
            {id}
          </EuiText>
        ),
      },
    ],
    [navigateWithFlyout, navigateToHome, closeCanvas, euiTheme.font.familyCode]
  );

  return (
    <div css={tableScrollStyles}>
      <EuiInMemoryTable<EntityListRow>
        tableCaption={i18n.translate(
          'xpack.securitySolution.agentBuilder.entityListAttachment.tableCaption',
          {
            defaultMessage: 'Security entities referenced in this conversation',
          }
        )}
        items={entities}
        columns={columns}
        pagination={entities.length > 10 ? { pageSizeOptions: [10, 25, 50] } : false}
        sorting={true}
        tableLayout="auto"
        responsiveBreakpoint={false}
      />
    </div>
  );
};
