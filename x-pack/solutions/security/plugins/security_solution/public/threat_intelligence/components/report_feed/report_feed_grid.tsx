/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiPanel, EuiText } from '@elastic/eui';
import type { ThreatReportFeedItem } from './types';
import { ReportFeedCard } from './report_feed_card';

export const ReportFeedGrid: React.FC<{
  items: ThreatReportFeedItem[];
  highlightReportId?: string;
  emptyMessage?: string;
}> = ({ items, highlightReportId, emptyMessage }) => {
  if (items.length === 0) {
    return (
      <EuiPanel hasBorder paddingSize="m" data-test-subj="threatIntelReportFeedEmpty">
        <EuiText size="s" color="subdued">
          {emptyMessage ??
            i18n.translate('xpack.securitySolution.threatIntelligence.reportFeed.gridEmpty', {
              defaultMessage: 'No reports match the current filter set.',
            })}
        </EuiText>
      </EuiPanel>
    );
  }

  return (
    <div
      data-test-subj="threatIntelReportFeedGrid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: 12,
      }}
    >
      {items.map((item) => (
        <ReportFeedCard
          key={item.reportId}
          item={item}
          isHighlighted={highlightReportId === item.reportId}
        />
      ))}
    </div>
  );
};
