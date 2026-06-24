/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer } from '@elastic/eui';
import { AlertEpisodeOverviewListSection } from './overview_list_section';
import { AlertEpisodeLifecycleHeatmapSection } from './lifecycle_heatmap_section';
import { AlertEpisodeSeverityHeatmapSection } from './severity_heatmap_section';
import { AlertEpisodeRuleOverviewPanelSection } from './rule_overview_panel_section';
import type { AlertEpisodeDetailsServices } from './types';

export interface AlertEpisodeOverviewSectionProps {
  episodeId: string;
  groupHash: string | undefined;
  services: Pick<
    AlertEpisodeDetailsServices,
    'data' | 'http' | 'expressions' | 'spaces' | 'uiSettings' | 'userProfile'
  >;
}

export const AlertEpisodeOverviewSection = ({
  episodeId,
  groupHash,
  services,
}: AlertEpisodeOverviewSectionProps) => (
  <>
    <AlertEpisodeOverviewListSection
      episodeId={episodeId}
      groupHash={groupHash}
      services={services}
    />
    <EuiSpacer size="l" />
    <AlertEpisodeLifecycleHeatmapSection episodeId={episodeId} services={services} />
    <EuiSpacer size="l" />
    <AlertEpisodeSeverityHeatmapSection episodeId={episodeId} services={services} />
    <EuiSpacer size="l" />
    <AlertEpisodeRuleOverviewPanelSection episodeId={episodeId} services={services} />
  </>
);
