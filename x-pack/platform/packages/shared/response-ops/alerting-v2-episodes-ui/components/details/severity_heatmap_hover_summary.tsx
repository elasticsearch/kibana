/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import * as i18n from './translations';

export interface SeverityHeatmapHoverSummaryProps {
  severityLabel: string;
  timestamp?: string;
}

export const SeverityHeatmapHoverSummary = ({
  severityLabel,
  timestamp,
}: SeverityHeatmapHoverSummaryProps) => {
  const timeLabel = timestamp && timestamp.length > 0 ? timestamp : '';

  return (
    <EuiPanel
      paddingSize="s"
      hasShadow={false}
      hasBorder={false}
      color="plain"
      data-test-subj="alertingV2EpisodeSeverityHeatmapHoverSummary"
    >
      <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="xs">
            <strong>{severityLabel}</strong>
          </EuiText>
        </EuiFlexItem>
        {timeLabel.length > 0 && (
          <EuiFlexItem grow={false}>
            <EuiText size="xs">{timeLabel}</EuiText>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {i18n.SEVERITY_HEATMAP_CLICK_TO_SEE_DATA}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
