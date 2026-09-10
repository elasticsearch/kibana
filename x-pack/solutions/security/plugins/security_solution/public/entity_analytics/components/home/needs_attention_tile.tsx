/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../../common/lib/kibana';
import { useHighCriticalCount } from './hooks/use_high_critical_count';

const HIGH_CRITICAL_SCORE_THRESHOLD = 70;
const SCORE_FIELD = 'entity.risk.calculated_score_norm';

const countStyle = css`
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
`;

interface NeedsAttentionTileProps {
  spaceId: string;
  watchlistId?: string;
}

export const NeedsAttentionTile: React.FC<NeedsAttentionTileProps> = ({ spaceId, watchlistId }) => {
  const { filterManager } = useKibana().services.data.query;
  const { count, isLoading } = useHighCriticalCount({ spaceId, watchlistId });

  const handleClick = useCallback(() => {
    filterManager.addFilters([
      {
        meta: {
          alias: i18n.translate(
            'xpack.securitySolution.entityAnalytics.needsAttentionTile.filterAlias',
            { defaultMessage: 'Risk score: High / Critical (≥ 70)' }
          ),
          disabled: false,
          negate: false,
        },
        query: {
          range: {
            [SCORE_FIELD]: { gte: HIGH_CRITICAL_SCORE_THRESHOLD },
          },
        },
      },
    ]);
  }, [filterManager]);

  return (
    <EuiPanel hasBorder paddingSize="l">
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h3>
              {i18n.translate('xpack.securitySolution.entityAnalytics.needsAttentionTile.title', {
                defaultMessage: 'Needs attention',
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {isLoading ? (
            <EuiLoadingSpinner size="l" />
          ) : (
            <EuiText
              css={countStyle}
              color="danger"
              onClick={handleClick}
              data-test-subj="needsAttentionCount"
              title={i18n.translate(
                'xpack.securitySolution.entityAnalytics.needsAttentionTile.countTooltip',
                { defaultMessage: 'Click to filter entities table to High / Critical risk' }
              )}
            >
              {count}
            </EuiText>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued">
            {i18n.translate('xpack.securitySolution.entityAnalytics.needsAttentionTile.subtitle', {
              defaultMessage: 'High / Critical risk entities (score ≥ 70)',
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
