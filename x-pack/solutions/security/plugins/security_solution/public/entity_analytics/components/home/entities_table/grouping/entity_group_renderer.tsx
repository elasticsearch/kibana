/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import {
  EuiBadge,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { GroupStatsItem, RawBucket } from '@kbn/grouping';
import { capitalize } from 'lodash';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import {
  EntityPanelKeyByType,
  EntityPanelParamByType,
} from '../../../../../flyout/entity_details/shared/constants';
import { ENTITY_ANALYTICS_TABLE_ID } from '../../constants';
import { RISK_SCORE_NOT_AVAILABLE } from '../../../entity_resolution/translations';
import { getRiskLevel } from '../../../../../../common/entity_analytics/risk_engine';
import { formatRiskScore } from '../../../../common/utils';
import { getRiskScoreColors } from '../risk_score_cell';
import type { EntitiesGroupingAggregation, TargetMetadataMap } from './use_fetch_grouped_data';
import { ENTITY_GROUPING_OPTIONS, TEST_SUBJ_RESOLUTION_GROUP_OPEN_FLYOUT } from '../constants';

const entitiesStatLabel = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entitiesTable.group.stat.entities',
  { defaultMessage: 'Entities:' }
);

const riskScoreLabel = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entitiesTable.group.stat.riskScore',
  { defaultMessage: 'Risk score:' }
);

const openEntityFlyoutLabel = i18n.translate(
  'xpack.securitySolution.entityAnalytics.entitiesTable.group.openEntityFlyout',
  { defaultMessage: 'Open entity details' }
);

const ResolutionGroupPanel = ({
  bucket,
  targetMetadata,
  tableId,
}: {
  bucket: RawBucket<EntitiesGroupingAggregation>;
  targetMetadata: TargetMetadataMap;
  tableId: string;
}) => {
  const { openFlyout } = useExpandableFlyoutApi();

  const entityId = String(bucket.key_as_string ?? bucket.key);
  const metadata = targetMetadata.get(entityId);
  const targetEntityName = metadata?.name;
  const displayName = targetEntityName ?? entityId;

  const entityType = metadata?.type;

  const canOpenFlyout = Boolean(targetEntityName && entityType);

  const handleOpenFlyout = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!targetEntityName || !entityType) return;

      const panelKey = EntityPanelKeyByType[entityType];
      const panelParam = EntityPanelParamByType[entityType];
      if (!panelKey || !panelParam) return;

      openFlyout({
        right: {
          id: panelKey,
          params: {
            [panelParam]: targetEntityName,
            entityId,
            contextID: tableId,
            scopeId: tableId,
          },
        },
      });
    },
    [openFlyout, targetEntityName, entityType, entityId, tableId]
  );

  return (
    <EuiFlexGroup alignItems="center" gutterSize="s">
      {canOpenFlyout && (
        <EuiFlexItem grow={false}>
          <EuiToolTip content={openEntityFlyoutLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              aria-label={openEntityFlyoutLabel}
              data-test-subj={TEST_SUBJ_RESOLUTION_GROUP_OPEN_FLYOUT}
              iconType="expand"
              size="xs"
              onClick={handleOpenFlyout}
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <EuiText size="s">{displayName}</EuiText>
        {targetEntityName && (
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.securitySolution.entityAnalytics.entitiesTable.group.entityId', {
              defaultMessage: 'Entity ID: {entityId}',
              values: { entityId },
            })}
          </EuiText>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const createGroupPanelRenderer = (
  targetMetadata: TargetMetadataMap,
  tableId: string = ENTITY_ANALYTICS_TABLE_ID
) => {
  const GroupPanelRenderer = (
    selectedGroup: string,
    bucket: RawBucket<EntitiesGroupingAggregation>,
    _nullGroupMessage?: string
  ) => {
    if (selectedGroup === ENTITY_GROUPING_OPTIONS.RESOLUTION) {
      return (
        <ResolutionGroupPanel bucket={bucket} targetMetadata={targetMetadata} tableId={tableId} />
      );
    }

    if (selectedGroup === ENTITY_GROUPING_OPTIONS.ENTITY_TYPE) {
      const entityType = capitalize(bucket.key_as_string ?? bucket.key.toString());
      return (
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiText size="s">{entityType}</EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      );
    }

    return undefined;
  };

  return GroupPanelRenderer;
};

const GroupRiskScoreBadge = ({ riskScore }: { riskScore: number | null | undefined }) => {
  const { euiTheme } = useEuiTheme();

  const badgeCss = css`
    margin-left: ${euiTheme.size.s};
    width: 55px;
  `;

  if (riskScore == null) {
    return (
      <EuiBadge css={badgeCss}>
        <EuiText size="xs">{RISK_SCORE_NOT_AVAILABLE}</EuiText>
      </EuiBadge>
    );
  }

  const riskLevel = getRiskLevel(riskScore);
  const colors = getRiskScoreColors(euiTheme, riskLevel);

  return (
    <EuiBadge css={badgeCss} color={colors.background}>
      <EuiText
        css={css`
          font-weight: ${euiTheme.font.weight.semiBold};
        `}
        size="xs"
        color={colors.text}
      >
        {formatRiskScore(riskScore)}
      </EuiText>
    </EuiBadge>
  );
};

export const createGroupStatsRenderer = (targetMetadata: TargetMetadataMap) => {
  const GroupStatsRenderer = (
    selectedGroup: string,
    bucket: RawBucket<EntitiesGroupingAggregation>
  ): GroupStatsItem[] => {
    const stats: GroupStatsItem[] = [];

    if (bucket.doc_count) {
      stats.push({
        title: entitiesStatLabel,
        badge: {
          value: bucket.doc_count,
          width: 50,
        },
      });
    }

    if (selectedGroup === ENTITY_GROUPING_OPTIONS.RESOLUTION) {
      const entityId = String(bucket.key_as_string ?? bucket.key);
      const metadata = targetMetadata.get(entityId);
      const groupScore = metadata?.riskScore ?? bucket.resolutionRiskScore?.value;
      const isSoloGroup = bucket.doc_count === 1;
      const individualScore = isSoloGroup ? metadata?.individualRiskScore : undefined;
      const riskScore = groupScore ?? individualScore ?? null;

      stats.push({
        title: riskScoreLabel,
        component: <GroupRiskScoreBadge riskScore={riskScore} />,
      });
    }

    return stats;
  };

  return GroupStatsRenderer;
};
