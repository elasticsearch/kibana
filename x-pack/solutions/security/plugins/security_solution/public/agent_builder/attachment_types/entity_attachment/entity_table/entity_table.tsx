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
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSkeletonText,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import type { Criteria, EuiBasicTableColumn } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { EntityType } from '../../../../../common/entity_analytics/types';
import { AssetCriticalityBadge } from '../../../../entity_analytics/components/asset_criticality/asset_criticality_badge';
import { RiskScoreCell } from '../../../../entity_analytics/components/home/entities_table/risk_score_cell';
import { EntitySourceBadge } from '../../../../flyout/entity_details/shared/components/entity_source_badge';
import { TruncatedBadgeList } from '../../../../flyout/entity_details/shared/components/entity_source_value';
import { FormattedRelativePreferenceDate } from '../../../../common/components/formatted_date';
import { EntityIconByType } from '../../../../entity_analytics/components/entity_store/helpers';
import { useEntityForAttachment } from '../use_entity_for_attachment';
import type { EntityForAttachment } from '../use_entity_for_attachment';
import type { EntityAttachmentIdentifier } from '../types';
import { formatEntitySource } from './entity_data_source_utils';
import { buildEntityRightPanel } from '../../entity_explore_navigation';
import { useEntityAnalyticsAgentNavigation } from '../../entity_analytics_agent_navigation_context';

export interface EntityTableProps {
  entities: EntityAttachmentIdentifier[];
}

interface EntityRow {
  identifier: EntityAttachmentIdentifier;
  data?: EntityForAttachment;
  isLoading: boolean;
}

const PAGE_SIZE = 10;

/**
 * Horizontal scroll wrapper for the table. The agent chat panel can be
 * narrower than the sum of the table's columns, so we keep the table at a
 * readable minimum width and let it overflow with a scrollbar instead of
 * squeezing the Name column into character-by-character wrapping.
 *
 * Pagination overrides: when the attachment is rendered inside a chat round,
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
 * attachment table's pagination.
 */
const tableScrollStyles = css`
  overflow-x: auto;

  .euiTable {
    min-width: 800px;
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

const COLUMN_LABELS = {
  name: i18n.translate('xpack.securitySolution.agentBuilder.entityAttachment.table.name', {
    defaultMessage: 'Name',
  }),
  type: i18n.translate('xpack.securitySolution.agentBuilder.entityAttachment.table.type', {
    defaultMessage: 'Type',
  }),
  riskScore: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.table.riskScore',
    { defaultMessage: 'Risk score' }
  ),
  criticality: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.table.criticality',
    { defaultMessage: 'Criticality' }
  ),
  dataSource: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.table.dataSource',
    { defaultMessage: 'Data source' }
  ),
  lastSeen: i18n.translate('xpack.securitySolution.agentBuilder.entityAttachment.table.lastSeen', {
    defaultMessage: 'Last seen',
  }),
};

const NAME_TOOLTIP_NO_ENTITY_ID = i18n.translate(
  'xpack.securitySolution.agentBuilder.entityAttachment.table.nameTooltipNoEntityId',
  { defaultMessage: 'Entity id not available' }
);

const SOURCES_OVERFLOW_TOOLTIP_TITLE = i18n.translate(
  'xpack.securitySolution.agentBuilder.entityAttachment.table.dataSourceOverflowTitle',
  { defaultMessage: 'Additional data sources' }
);

const LAST_SEEN_TOOLTIP_FIELD_NAME = '@timestamp';

const OPEN_ENTITY_ANALYTICS_LABEL = i18n.translate(
  'xpack.securitySolution.agentBuilder.entityAttachment.table.openEntityAnalytics',
  { defaultMessage: 'Open Entity Analytics' }
);

const OPEN_ENTITY_IN_ENTITY_ANALYTICS_ARIA = i18n.translate(
  'xpack.securitySolution.agentBuilder.entityAttachment.table.openEntityInEntityAnalyticsAria',
  { defaultMessage: 'Open entity in Entity Analytics' }
);

const identifierTypeToEntityType = (
  type: EntityAttachmentIdentifier['identifierType']
): EntityType => {
  switch (type) {
    case 'host':
      return EntityType.host;
    case 'user':
      return EntityType.user;
    case 'service':
      return EntityType.service;
    case 'generic':
    default:
      return EntityType.generic;
  }
};

const entityTypeLabels: Record<EntityType, string> = {
  [EntityType.host]: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.entityType.host',
    { defaultMessage: 'Host' }
  ),
  [EntityType.user]: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.entityType.user',
    { defaultMessage: 'User' }
  ),
  [EntityType.service]: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.entityType.service',
    { defaultMessage: 'Service' }
  ),
  [EntityType.generic]: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.entityType.generic',
    { defaultMessage: 'Entity' }
  ),
};

/**
 * Per-row loader. Keeps `useEntityForAttachment` one-per-component-instance
 * (Rules of Hooks) while letting the table re-render progressively as each
 * entity resolves. The parent owns the row map and merges results.
 */
const EntityRowLoader: React.FC<{
  identifier: EntityAttachmentIdentifier;
  onLoaded: (identifier: EntityAttachmentIdentifier, result: EntityRow) => void;
}> = ({ identifier, onLoaded }) => {
  const { data, isLoading } = useEntityForAttachment(identifier);

  React.useEffect(() => {
    onLoaded(identifier, { identifier, data: data ?? undefined, isLoading });
  }, [identifier, data, isLoading, onLoaded]);

  return null;
};

/**
 * Renders the resolved data sources for an entity row. Shows the first
 * formatted source as a hollow badge and collapses any overflow into a single
 * `+N more` badge whose tooltip lists the remaining sources. When no sources
 * are available we fall back to the legacy `EntitySourceBadge` so the column
 * still surfaces an "Entity Store" / "Observed" hint for older records.
 *
 * The inline value count matches the Entity Analytics flyout + entities table
 * (`TruncatedBadgeList` default) so the same `entity.source` renders
 * identically everywhere it appears in the Security Solution.
 */
const EntityDataSourceBadges: React.FC<{
  sources: string[] | undefined;
  isEntityInStore: boolean;
  hasLastSeenDate: boolean;
}> = ({ sources, isEntityInStore, hasLastSeenDate }) => {
  const list = sources ?? [];

  if (list.length === 0) {
    return (
      <EntitySourceBadge
        isEntityInStore={isEntityInStore}
        hasLastSeenDate={hasLastSeenDate}
        data-test-subj="entityAttachmentTableSource"
      />
    );
  }

  return (
    <TruncatedBadgeList
      values={list}
      formatValue={formatEntitySource}
      overflowTooltipTitle={SOURCES_OVERFLOW_TOOLTIP_TITLE}
      data-test-subj="entityAttachmentTableSources"
    />
  );
};

export const EntityTable: React.FC<EntityTableProps> = ({ entities }) => {
  const { canNavigate, navigateWithFlyout, navigateToHome } = useEntityAnalyticsAgentNavigation();
  const [pageIndex, setPageIndex] = useState(0);
  const [rowsByKey, setRowsByKey] = useState<Record<string, EntityRow>>({});

  /**
   * Stable per-row key for React reconciliation, `rowsByKey` lookups, and the
   * EuiBasicTable `itemId`. When the attachment carries a canonical
   * `entityStoreId` (always present for modern attachments emitted by the
   * security tools) we key off it so rows whose `entity.name` collides — e.g.
   * 19 local `okta` service accounts across different EC2 hosts — do not
   * clobber each other in `rowsByKey` / share a React key. Legacy attachments
   * that pre-date `entityStoreId` fall back to the non-unique name-based key.
   */
  const keyFor = useCallback(
    (identifier: EntityAttachmentIdentifier) =>
      identifier.entityStoreId
        ? `${identifier.identifierType}:id:${identifier.entityStoreId}`
        : `${identifier.identifierType}:name:${identifier.identifier}`,
    []
  );

  const handleLoaded = useCallback(
    (identifier: EntityAttachmentIdentifier, result: EntityRow) => {
      setRowsByKey((prev) => {
        const existing = prev[keyFor(identifier)];
        if (existing && existing.isLoading === result.isLoading && existing.data === result.data) {
          return prev;
        }
        return { ...prev, [keyFor(identifier)]: result };
      });
    },
    [keyFor]
  );

  const items = useMemo<EntityRow[]>(
    () =>
      entities.map(
        (identifier) =>
          rowsByKey[keyFor(identifier)] ?? {
            identifier,
            isLoading: true,
          }
      ),
    [entities, rowsByKey, keyFor]
  );

  const pagedItems = useMemo(
    () => items.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE),
    [items, pageIndex]
  );

  const handleOpenEntityAnalytics = useCallback(() => {
    navigateToHome();
  }, [navigateToHome]);

  const handleOpenEntity = useCallback(
    (row: EntityRow) => {
      if (!canNavigate) {
        return;
      }

      const entityStoreId = row.data?.entityId ?? row.identifier.entityStoreId;
      const displayName = row.data?.displayName ?? row.identifier.identifier;
      const rightPanel = buildEntityRightPanel({
        identifierType: row.identifier.identifierType,
        identifier: displayName,
        entityStoreId,
      });
      if (rightPanel) {
        navigateWithFlyout({ preview: [], right: rightPanel });
      } else {
        navigateToHome();
      }
    },
    [canNavigate, navigateWithFlyout, navigateToHome]
  );

  const columns = useMemo<Array<EuiBasicTableColumn<EntityRow>>>(
    () => [
      {
        field: 'identifier.identifier',
        name: COLUMN_LABELS.name,
        render: (_value: unknown, row: EntityRow) => {
          const label = row.data?.displayName ?? row.identifier.identifier;
          const tooltipContent = row.data?.entityId ?? NAME_TOOLTIP_NO_ENTITY_ID;
          const icon =
            EntityIconByType[
              row.data?.entityType ?? identifierTypeToEntityType(row.identifier.identifierType)
            ] ?? 'globe';
          return (
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              {canNavigate && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={OPEN_ENTITY_IN_ENTITY_ANALYTICS_ARIA}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      iconType={icon}
                      display="empty"
                      size="xs"
                      aria-label={OPEN_ENTITY_IN_ENTITY_ANALYTICS_ARIA}
                      data-test-subj="entityAttachmentTableOpenEntity"
                      onClick={() => handleOpenEntity(row)}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              )}
              <EuiFlexItem grow={false}>
                <EuiToolTip position="top" content={tooltipContent}>
                  <EuiText size="xs" data-test-subj="entityAttachmentTableName">
                    <strong>{label}</strong>
                  </EuiText>
                </EuiToolTip>
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
        width: '240px',
      },
      {
        field: 'data.sources',
        name: COLUMN_LABELS.dataSource,
        render: (_value: unknown, row: EntityRow) => (
          <EntityDataSourceBadges
            sources={row.data?.sources}
            isEntityInStore={row.data?.isEntityInStore ?? false}
            hasLastSeenDate={Boolean(row.data?.lastSeen)}
          />
        ),
        width: '140px',
      },
      {
        field: 'identifier.identifierType',
        name: COLUMN_LABELS.type,
        render: (_value: unknown, row: EntityRow) => (
          <EuiBadge color="hollow">
            {
              entityTypeLabels[
                row.data?.entityType ?? identifierTypeToEntityType(row.identifier.identifierType)
              ]
            }
          </EuiBadge>
        ),
        width: '110px',
      },
      {
        field: 'data.riskScore',
        name: COLUMN_LABELS.riskScore,
        render: (_value: unknown, row: EntityRow) =>
          row.isLoading ? (
            <EuiSkeletonText lines={1} />
          ) : (
            <RiskScoreCell riskScore={row.data?.riskScore} />
          ),
        width: '110px',
      },
      {
        field: 'data.assetCriticality',
        name: COLUMN_LABELS.criticality,
        render: (_value: unknown, row: EntityRow) => (
          <AssetCriticalityBadge
            criticalityLevel={row.data?.assetCriticality ?? 'unassigned'}
            dataTestSubj="entityAttachmentTableCriticality"
          />
        ),
        width: '150px',
      },
      {
        field: 'data.timestamp',
        name: COLUMN_LABELS.lastSeen,
        render: (_value: unknown, row: EntityRow) =>
          row.data?.timestamp ? (
            <FormattedRelativePreferenceDate
              value={row.data.timestamp}
              relativeThresholdInHrs={Number.MAX_SAFE_INTEGER}
              tooltipFieldName={LAST_SEEN_TOOLTIP_FIELD_NAME}
            />
          ) : (
            '—'
          ),
        width: '140px',
      },
    ],
    [canNavigate, handleOpenEntity]
  );

  /**
   * EuiBasicTable's prop signature is split: passing `pagination` makes
   * `onChange` mandatory, and the inverse variant rejects an `undefined`
   * `pagination`. Conditionally spreading both keeps a single render path
   * while satisfying the discriminated union.
   */
  const paginationProps = useMemo(
    () =>
      items.length > PAGE_SIZE
        ? {
            pagination: {
              pageIndex,
              pageSize: PAGE_SIZE,
              totalItemCount: items.length,
              showPerPageOptions: false,
            },
            onChange: ({ page }: Criteria<EntityRow>) => {
              if (page) setPageIndex(page.index);
            },
          }
        : {},
    [items.length, pageIndex]
  );

  return (
    <EuiPanel
      hasShadow={false}
      hasBorder={false}
      paddingSize="m"
      data-test-subj="entityAttachmentTable"
    >
      {pagedItems.map((row) => (
        <EntityRowLoader
          key={keyFor(row.identifier)}
          identifier={row.identifier}
          onLoaded={handleLoaded}
        />
      ))}
      <div css={tableScrollStyles}>
        <EuiBasicTable
          aria-label={i18n.translate(
            'xpack.securitySolution.agentBuilder.entityAttachment.table.caption',
            { defaultMessage: 'Entities referenced in this message' }
          )}
          items={pagedItems}
          columns={columns}
          itemId={(row) => keyFor(row.identifier)}
          tableLayout="auto"
          responsiveBreakpoint={false}
          {...paginationProps}
        />
      </div>
      <EuiFlexGroup gutterSize="s" wrap responsive={false} style={{ marginTop: 8 }}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="xs"
            iconType="popout"
            onClick={handleOpenEntityAnalytics}
            data-test-subj="entityAttachmentTableOpenEntityAnalytics"
            aria-label={OPEN_ENTITY_ANALYTICS_LABEL}
          >
            {OPEN_ENTITY_ANALYTICS_LABEL}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
