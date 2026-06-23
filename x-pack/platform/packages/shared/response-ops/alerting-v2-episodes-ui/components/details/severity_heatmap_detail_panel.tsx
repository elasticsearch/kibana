/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiThemeComputed } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { SeverityHeatmapEventDataTable } from './severity_heatmap_event_data_table';
import * as i18n from './translations';

export interface SeverityHeatmapDetailPanelProps {
  severityLabel: string;
  timestamp: string;
  eventData: Record<string, unknown> | null;
  euiTheme: EuiThemeComputed;
  onClose: () => void;
}

export const SeverityHeatmapDetailPanel = ({
  severityLabel,
  timestamp,
  eventData,
  euiTheme,
  onClose,
}: SeverityHeatmapDetailPanelProps) => (
  <EuiPanel hasBorder paddingSize="s" data-test-subj="alertingV2EpisodeSeverityHeatmapDetailPanel">
    <EuiFlexGroup
      alignItems="center"
      justifyContent="spaceBetween"
      responsive={false}
      gutterSize="s"
    >
      <EuiFlexItem grow={false}>
        <EuiText size="xs">
          <strong>{severityLabel}</strong>
          {timestamp.length > 0 && (
            <>
              {' · '}
              {timestamp}
            </>
          )}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiToolTip
          content={i18n.SEVERITY_HEATMAP_DETAIL_PANEL_CLOSE_ARIA_LABEL}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            iconType="cross"
            aria-label={i18n.SEVERITY_HEATMAP_DETAIL_PANEL_CLOSE_ARIA_LABEL}
            onClick={onClose}
            data-test-subj="alertingV2EpisodeSeverityHeatmapDetailPanelClose"
          />
        </EuiToolTip>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="s" />
    {eventData ? (
      <SeverityHeatmapEventDataTable
        eventData={eventData}
        euiTheme={euiTheme}
        fullWidth
        dataTestSubj="alertingV2EpisodeSeverityHeatmapDetailTable"
      />
    ) : (
      <EuiText
        size="s"
        color="subdued"
        data-test-subj="alertingV2EpisodeSeverityHeatmapDetailEmpty"
      >
        {i18n.SEVERITY_HEATMAP_DETAIL_PANEL_EMPTY}
      </EuiText>
    )}
  </EuiPanel>
);
