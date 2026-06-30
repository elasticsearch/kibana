/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useRef, useState } from 'react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { FormattedRelative } from '@kbn/i18n-react';
import {
  EuiBadge,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import type { ThreatReportFeedItem } from './types';
import { SEVERITY_HEX } from './constants';
import { getSeverityColor, getSeverityLabel } from './severity_labels';
import { ThreatCategoryBadge } from './threat_category_badge';
import { getSourceFaviconUrl, isBrowsableReportUrl } from './utils';

const metaDividerCss = css({
  opacity: 0.4,
  margin: '0 2px',
});

const MetaDivider: React.FC = () => (
  <span css={metaDividerCss} aria-hidden>
    {'|'}
  </span>
);

export const ReportFeedCard: React.FC<{
  item: ThreatReportFeedItem;
  isHighlighted?: boolean;
}> = ({ item, isHighlighted = false }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const articleUrl = isBrowsableReportUrl(item.sourceUrl) ? item.sourceUrl : undefined;
  const faviconUrl = getSourceFaviconUrl(item.sourceUrl);
  const displayTitle = item.title || item.reportId;
  const publishedDate = item.publishedAt ? new Date(item.publishedAt) : undefined;
  const hasExpandableDetails =
    (item.techniques?.length ?? 0) > 0 ||
    (item.iocCount ?? 0) > 0 ||
    (item.relatedReportCount ?? 0) > 0;
  const severityColor = getSeverityColor(item.severity);

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  return (
    <EuiPanel
      panelRef={cardRef}
      hasBorder
      paddingSize="m"
      data-test-subj={`threatIntelReportCard-${item.reportId}`}
      style={{
        borderLeft: `4px solid ${SEVERITY_HEX[item.severity]}`,
        position: 'relative',
        ...(isHighlighted
          ? {
              boxShadow: '0 0 0 2px var(--euiColorPrimary)',
              backgroundColor: 'var(--euiColorHighlight)',
            }
          : {}),
      }}
    >
      <EuiText size="s">
        {articleUrl ? (
          <EuiLink
            href={articleUrl}
            target="_blank"
            external
            data-test-subj={`threatIntelArticleLink-${item.reportId}`}
          >
            <strong>{displayTitle}</strong>
          </EuiLink>
        ) : (
          <strong>{displayTitle}</strong>
        )}
      </EuiText>
      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap>
        {faviconUrl ? (
          <EuiFlexItem grow={false}>
            <img
              src={faviconUrl}
              alt=""
              width={14}
              height={14}
              style={{ borderRadius: 2 }}
              aria-hidden
            />
          </EuiFlexItem>
        ) : null}
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued" style={{ fontWeight: 500 }}>
            {item.sourceName}
          </EuiText>
        </EuiFlexItem>
        {publishedDate && !Number.isNaN(publishedDate.getTime()) ? (
          <>
            <EuiFlexItem grow={false}>
              <MetaDivider />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon type="clock" size="s" color="subdued" aria-hidden />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    <FormattedRelative value={publishedDate} />
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </>
        ) : null}
        <EuiFlexItem grow={false}>
          <MetaDivider />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" style={{ color: severityColor, fontWeight: 500 }}>
            {getSeverityLabel(item.severity)}
          </EuiText>
        </EuiFlexItem>
        {(item.environmentHitsTotal ?? 0) > 0 ? (
          <>
            <EuiFlexItem grow={false}>
              <MetaDivider />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color="danger" iconType="dot">
                {i18n.translate(
                  'xpack.securitySolution.threatIntelligence.reportFeed.envHitsBadge',
                  {
                    defaultMessage: '{count} env hits',
                    values: { count: item.environmentHitsTotal },
                  }
                )}
              </EuiBadge>
            </EuiFlexItem>
          </>
        ) : null}
      </EuiFlexGroup>
      {item.categories.length > 0 ? (
        <>
          <EuiSpacer size="xs" />
          <EuiFlexGroup gutterSize="xs" alignItems="center" wrap responsive={false}>
            {item.categories.slice(0, 3).map((category) => (
              <EuiFlexItem key={`${item.reportId}-cat-${category}`} grow={false}>
                <ThreatCategoryBadge category={category} size="sm" />
              </EuiFlexItem>
            ))}
            {item.categories.length > 3 ? (
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {i18n.translate(
                    'xpack.securitySolution.threatIntelligence.reportFeed.moreCategories',
                    {
                      defaultMessage: '+{count}',
                      values: { count: item.categories.length - 3 },
                    }
                  )}
                </EuiText>
              </EuiFlexItem>
            ) : null}
            {hasExpandableDetails ? (
              <EuiFlexItem grow style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <EuiButtonIcon
                  iconType={isExpanded ? 'arrowUp' : 'arrowDown'}
                  aria-label={
                    isExpanded
                      ? i18n.translate(
                          'xpack.securitySolution.threatIntelligence.reportFeed.collapseCard',
                          { defaultMessage: 'Collapse report details' }
                        )
                      : i18n.translate(
                          'xpack.securitySolution.threatIntelligence.reportFeed.expandCard',
                          { defaultMessage: 'Expand report details' }
                        )
                  }
                  onClick={() => setIsExpanded((prev) => !prev)}
                  data-test-subj={`threatIntelReportCardExpand-${item.reportId}`}
                />
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        </>
      ) : null}
      {isExpanded && hasExpandableDetails ? (
        <>
          <EuiSpacer size="s" />
          {(item.techniques?.length ?? 0) > 0 ? (
            <EuiText size="xs" color="subdued">
              {i18n.translate(
                'xpack.securitySolution.threatIntelligence.reportFeed.techniquesLabel',
                {
                  defaultMessage: 'Techniques: {techniques}',
                  values: { techniques: (item.techniques ?? []).slice(0, 6).join(', ') },
                }
              )}
            </EuiText>
          ) : null}
          {(item.iocCount ?? 0) > 0 ? (
            <EuiText size="xs" color="subdued">
              {i18n.translate('xpack.securitySolution.threatIntelligence.reportFeed.iocLabel', {
                defaultMessage: '{count, plural, one {# IOC} other {# IOCs}}',
                values: { count: item.iocCount },
              })}
            </EuiText>
          ) : null}
          {(item.relatedReportCount ?? 0) > 0 ? (
            <EuiText size="xs" color="subdued">
              {i18n.translate('xpack.securitySolution.threatIntelligence.reportFeed.relatedLabel', {
                defaultMessage: 'Related reports: {count}',
                values: { count: item.relatedReportCount },
              })}
            </EuiText>
          ) : null}
        </>
      ) : null}
    </EuiPanel>
  );
};
