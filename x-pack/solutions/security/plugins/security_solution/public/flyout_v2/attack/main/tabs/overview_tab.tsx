/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiHorizontalRule } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import { AISummarySection } from '../components/ai_summary_section';
import { VisualizationsSection } from '../components/visualizations_section';
import { InsightsSection } from '../components/insights_section';

export interface OverviewTabProps {
  /**
   * The raw attack document hit.
   */
  hit: DataTableRecord;
}

/**
 * Overview tab content for the attack flyout v2.
 * Renders summary, visualizations, and insights sections separated by
 * horizontal rules to match the legacy attack details flyout.
 */
export const OverviewTab = memo(({ hit }: OverviewTabProps) => (
  <div data-test-subj="attack-flyout-overview-tab">
    <AISummarySection hit={hit} />
    <EuiHorizontalRule margin="m" />
    <VisualizationsSection hit={hit} />
    <EuiHorizontalRule margin="m" />
    <InsightsSection hit={hit} />
  </div>
));

OverviewTab.displayName = 'OverviewTab';
