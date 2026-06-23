/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useQuery } from '@kbn/react-query';
import type { HttpStart } from '@kbn/core-http-browser';
import { AssetCriticalityBadge } from '../../../../entity_analytics/components/asset_criticality/asset_criticality_badge';
import { getWatchlistName } from '../../../../../common/entity_analytics/watchlists/constants';
import { API_VERSIONS, WATCHLISTS_URL } from '../../../../../common/entity_analytics/constants';
import { TruncatedBadgeList } from '../../../../flyout/entity_details/shared/components/entity_source_value';
import type { CriticalityLevelWithUnassigned } from '../../../../../common/entity_analytics/asset_criticality/types';

interface EntitySummaryGridProps {
  entityId?: string;
  source?: string;
  assetCriticality?: CriticalityLevelWithUnassigned;
  watchlistIds: string[];
  watchlistsEnabled: boolean;
}

interface WatchlistListItem {
  id?: string;
  name: string;
}

const LABELS = {
  entityId: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.grid.entityIdLabel',
    { defaultMessage: 'Entity ID' }
  ),
  dataSource: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.grid.dataSourceLabel',
    { defaultMessage: 'Data source' }
  ),
  assetCriticality: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.grid.assetCriticalityLabel',
    { defaultMessage: 'Asset criticality' }
  ),
  watchlists: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.grid.watchlistsLabel',
    { defaultMessage: 'Watchlists' }
  ),
  copy: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.grid.copyToClipboard',
    { defaultMessage: 'Copy to clipboard' }
  ),
  empty: i18n.translate('xpack.securitySolution.agentBuilder.entityAttachment.grid.empty', {
    defaultMessage: '—',
  }),
  watchlistsOverflowTooltipTitle: i18n.translate(
    'xpack.securitySolution.agentBuilder.entityAttachment.grid.watchlistsOverflowTitle',
    { defaultMessage: 'Additional watchlists' }
  ),
};

const WATCHLISTS_QUERY_KEY = 'AGENT_BUILDER_ENTITY_ATTACHMENT_WATCHLISTS';

/**
 * Minimal, provider-independent watchlist fetcher. Mirrors
 * `useEntityForAttachment`'s approach (core `http`, no Redux) so the chat
 * card can resolve watchlist names without the Security Solution Kibana
 * context that `useGetWatchlists` requires.
 */
const useAttachmentWatchlists = (enabled: boolean) => {
  const { services } = useKibana<{ http: HttpStart }>();
  const http = services.http;

  return useQuery<WatchlistListItem[]>({
    queryKey: [WATCHLISTS_QUERY_KEY],
    queryFn: async ({ signal }) => {
      if (!http) {
        throw new Error('Core http service is not available');
      }
      return http.fetch<WatchlistListItem[]>(`${WATCHLISTS_URL}/list`, {
        version: API_VERSIONS.public.v1,
        method: 'GET',
        signal,
      });
    },
    enabled: Boolean(http) && enabled,
  });
};

const SummaryPanel: React.FC<{ label: string; children: React.ReactNode; testSubj: string }> = ({
  label,
  children,
  testSubj,
}) => (
  <EuiPanel hasBorder paddingSize="s" style={{ minWidth: 0 }} data-test-subj={testSubj}>
    <EuiText size="xs">
      <strong>{label}</strong>
    </EuiText>
    <EuiSpacer size="xs" />
    {children}
  </EuiPanel>
);

const EntityIdCell: React.FC<{ entityId?: string }> = ({ entityId }) => {
  if (!entityId) {
    return <EuiText size="s">{LABELS.empty}</EuiText>;
  }
  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap={false}>
      <EuiFlexItem className="eui-textTruncate">
        <EuiToolTip content={entityId}>
          <EuiText size="s" className="eui-textTruncate">
            {entityId}
          </EuiText>
        </EuiToolTip>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiToolTip content={LABELS.copy}>
          <EuiCopy textToCopy={entityId}>
            {(copy) => (
              <EuiToolTip content={LABELS.copy} disableScreenReaderOutput>
                <EuiButtonIcon
                  iconType="copy"
                  aria-label={LABELS.copy}
                  onClick={copy}
                  iconSize="s"
                  color="text"
                  data-test-subj="entityAttachmentGridEntityIdCopy"
                />
              </EuiToolTip>
            )}
          </EuiCopy>
        </EuiToolTip>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const WatchlistsCell: React.FC<{
  watchlistIds: string[];
  watchlistsEnabled: boolean;
}> = ({ watchlistIds, watchlistsEnabled }) => {
  const { data: watchlistData } = useAttachmentWatchlists(
    watchlistsEnabled && watchlistIds.length > 0
  );

  const names = useMemo(() => {
    if (!watchlistIds.length) return [] as string[];
    const byId = new Map<string, string>();
    (watchlistData ?? []).forEach((w) => {
      if (w.id) byId.set(w.id, w.name);
    });
    return watchlistIds.map((id) => byId.get(id) ?? getWatchlistName(id));
  }, [watchlistIds, watchlistData]);

  if (!watchlistsEnabled || names.length === 0) {
    return <EuiText size="s">{LABELS.empty}</EuiText>;
  }

  return (
    <TruncatedBadgeList
      values={names}
      overflowTooltipTitle={LABELS.watchlistsOverflowTooltipTitle}
      data-test-subj="entityAttachmentGridWatchlists"
    />
  );
};

/**
 * Chat-scale recreation of the flyout's `EntitySummaryGrid` (Entity ID,
 * Data source, Asset criticality, Watchlists). Asset criticality is shown
 * as a badge only - editing is driven by a follow-up chip rather than an
 * inline modal to keep the card decoupled from the Security Solution
 * provider tree.
 */
export const EntitySummaryGridMini: React.FC<EntitySummaryGridProps> = ({
  entityId,
  source,
  assetCriticality,
  watchlistIds,
  watchlistsEnabled,
}) => {
  return (
    <EuiFlexGrid columns={2} gutterSize="s" data-test-subj="entityAttachmentSummaryGrid">
      <SummaryPanel label={LABELS.entityId} testSubj="entityAttachmentSummaryEntityId">
        <EntityIdCell entityId={entityId} />
      </SummaryPanel>
      <SummaryPanel label={LABELS.dataSource} testSubj="entityAttachmentSummaryDataSource">
        <EuiText size="s">{source ?? LABELS.empty}</EuiText>
      </SummaryPanel>
      <SummaryPanel
        label={LABELS.assetCriticality}
        testSubj="entityAttachmentSummaryAssetCriticality"
      >
        <AssetCriticalityBadge
          criticalityLevel={assetCriticality ?? 'unassigned'}
          dataTestSubj="entityAttachmentGridCriticalityBadge"
        />
      </SummaryPanel>
      <SummaryPanel label={LABELS.watchlists} testSubj="entityAttachmentSummaryWatchlists">
        <WatchlistsCell watchlistIds={watchlistIds} watchlistsEnabled={watchlistsEnabled} />
      </SummaryPanel>
    </EuiFlexGrid>
  );
};
