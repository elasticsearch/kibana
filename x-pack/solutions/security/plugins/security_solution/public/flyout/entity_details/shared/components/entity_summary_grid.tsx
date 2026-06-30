/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo, useState } from 'react';
import {
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { Entity } from '../../../../../common/api/entity_analytics';
import { AssetCriticalityBadge } from '../../../../entity_analytics/components/asset_criticality/asset_criticality_badge';
import { AssetCriticalityModal } from '../../../../entity_analytics/components/asset_criticality/asset_criticality_selector';
import type { CriticalityLevelWithUnassigned } from '../../../../../common/entity_analytics/asset_criticality/types';
import { useGetWatchlists } from '../../../../entity_analytics/api/hooks/use_get_watchlists';
import { getWatchlistName } from '../../../../../common/entity_analytics/watchlists/constants';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import { EntitySourceValue, TruncatedBadgeList, toEntitySourceArray } from './entity_source_value';

const WATCHLISTS_OVERFLOW_TOOLTIP_TITLE = i18n.translate(
  'xpack.securitySolution.flyout.entityDetails.grid.watchlistsOverflowTitle',
  { defaultMessage: 'Additional watchlists' }
);

interface EntitySummaryGridProps {
  entityRecord: Entity;
  criticalityLevel?: CriticalityLevelWithUnassigned | null;
  onCriticalitySave?: (value: CriticalityLevelWithUnassigned) => void;
}

export const EntitySummaryGrid = memo(
  ({ entityRecord, criticalityLevel, onCriticalitySave }: EntitySummaryGridProps) => {
    const [modalVisible, setModalVisible] = useState(false);

    const entityId = entityRecord.entity?.id;

    const watchlistIds = useMemo(() => {
      const attrs = (entityRecord.entity as Record<string, unknown>)?.attributes as
        | Record<string, unknown>
        | undefined;
      const watchlists = attrs?.watchlists;
      return Array.isArray(watchlists) ? (watchlists as string[]) : [];
    }, [entityRecord]);

    return (
      <>
        <EuiSpacer size="s" />
        <EuiFlexGrid columns={2} gutterSize="s">
          <SummaryPanel
            label={i18n.translate(
              'xpack.securitySolution.flyout.entityDetails.grid.entityIdLabel',
              { defaultMessage: 'Entity ID' }
            )}
          >
            <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap={false}>
              <EuiFlexItem className="eui-textTruncate">
                <EuiToolTip content={entityId}>
                  <EuiText size="xs" className="eui-textTruncate" tabIndex={0}>
                    {entityId ?? getEmptyTagValue()}
                  </EuiText>
                </EuiToolTip>
              </EuiFlexItem>
              {entityId && (
                <EuiFlexItem
                  grow={false}
                  // setting height to 0 and overflow to visible to avoid the button from pushing the text down
                  // translateY(-50%) is used on EuiCopy to center the button vertically
                  css={css`
                    height: 0;
                    overflow: visible;
                    align-self: center;
                  `}
                >
                  <EuiToolTip
                    content={i18n.translate(
                      'xpack.securitySolution.flyout.entityDetails.grid.copyToClipboard',
                      { defaultMessage: 'Copy to clipboard' }
                    )}
                    disableScreenReaderOutput
                  >
                    <EuiCopy textToCopy={entityId}>
                      {(copy) => (
                        <EuiToolTip
                          content={i18n.translate(
                            'xpack.securitySolution.flyout.entityDetails.grid.copyToClipboard',
                            { defaultMessage: 'Copy to clipboard' }
                          )}
                          disableScreenReaderOutput
                        >
                          <EuiButtonIcon
                            iconType="copy"
                            aria-label={i18n.translate(
                              'xpack.securitySolution.flyout.entityDetails.grid.copyToClipboard',
                              { defaultMessage: 'Copy to clipboard' }
                            )}
                            onClick={copy}
                            iconSize="s"
                            color="text"
                            css={css`
                              transform: translateY(-50%);
                            `}
                          />
                        </EuiToolTip>
                      )}
                    </EuiCopy>
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </SummaryPanel>
          <SummaryPanel
            label={i18n.translate(
              'xpack.securitySolution.flyout.entityDetails.grid.dataSourceLabel',
              { defaultMessage: 'Data source' }
            )}
          >
            <EntitySourceValue
              values={toEntitySourceArray(entityRecord.entity?.source)}
              textSize="xs"
            />
          </SummaryPanel>
          <SummaryPanel
            label={i18n.translate(
              'xpack.securitySolution.flyout.entityDetails.grid.assetCriticalityLabel',
              { defaultMessage: 'Asset criticality' }
            )}
          >
            <AssetCriticalityCell
              criticalityLevel={criticalityLevel}
              canEdit={!!onCriticalitySave}
              onOpenModal={() => setModalVisible(true)}
            />
          </SummaryPanel>
          <SummaryPanel
            label={i18n.translate(
              'xpack.securitySolution.flyout.entityDetails.grid.watchlistsLabel',
              { defaultMessage: 'Watchlists' }
            )}
          >
            <WatchlistsCell watchlistIds={watchlistIds} />
          </SummaryPanel>
        </EuiFlexGrid>
        <EuiSpacer size="s" />
        {modalVisible && onCriticalitySave && (
          <AssetCriticalityModal
            initialCriticalityLevel={
              criticalityLevel === 'unassigned' ? undefined : criticalityLevel
            }
            onSave={(value) => {
              onCriticalitySave(value);
              setModalVisible(false);
            }}
            toggle={setModalVisible}
          />
        )}
      </>
    );
  }
);
EntitySummaryGrid.displayName = 'EntitySummaryGrid';

const SummaryPanel = memo(({ label, children }: { label: string; children: React.ReactNode }) => (
  <EuiPanel
    hasBorder
    paddingSize="s"
    css={css`
      min-width: 0;
      padding: 8px 12px 10px;
    `}
  >
    <EuiText size="xs">
      <strong>{label}</strong>
    </EuiText>
    <EuiSpacer size="xs" />
    {children}
  </EuiPanel>
));
SummaryPanel.displayName = 'SummaryPanel';

const AssetCriticalityCell = memo(
  ({
    criticalityLevel,
    canEdit,
    onOpenModal,
  }: {
    criticalityLevel?: CriticalityLevelWithUnassigned | null;
    canEdit: boolean;
    onOpenModal: () => void;
  }) => (
    <EuiFlexGroup
      gutterSize="xs"
      alignItems="center"
      responsive={false}
      css={
        canEdit
          ? css`
              cursor: pointer;
            `
          : undefined
      }
      onClick={canEdit ? onOpenModal : undefined}
    >
      <EuiFlexItem grow={false}>
        <AssetCriticalityBadge criticalityLevel={criticalityLevel ?? 'unassigned'} textSize="xs" />
      </EuiFlexItem>
      {canEdit && (
        <EuiFlexItem grow={false}>
          <EuiIcon type="arrowDown" size="s" aria-hidden={true} />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  )
);
AssetCriticalityCell.displayName = 'AssetCriticalityCell';

const WatchlistsCell = memo(({ watchlistIds }: { watchlistIds: string[] }) => {
  const { data: watchlistsData } = useGetWatchlists();

  const watchlistNamesById = useMemo(() => {
    const map = new Map<string, string>();
    (watchlistsData ?? []).forEach((watchlist: { id?: string; name: string }) => {
      if (watchlist.id) {
        map.set(watchlist.id, watchlist.name);
      }
    });
    return map;
  }, [watchlistsData]);

  const resolvedNames = useMemo<string[]>(() => {
    if (watchlistIds.length === 0) return [];
    return watchlistIds
      .map((id) => {
        const watchlistName = watchlistNamesById.get(id) ?? getWatchlistName(id);
        // If all we have is the ID, the watchlist has likely been deleted
        return watchlistName !== id ? watchlistName : undefined;
      })
      .filter((name): name is string => name !== undefined);
  }, [watchlistIds, watchlistNamesById]);

  return (
    <TruncatedBadgeList
      values={resolvedNames}
      overflowTooltipTitle={WATCHLISTS_OVERFLOW_TOOLTIP_TITLE}
      data-test-subj="entityWatchlistsCell"
      textSize="xs"
    />
  );
});
WatchlistsCell.displayName = 'WatchlistsCell';
