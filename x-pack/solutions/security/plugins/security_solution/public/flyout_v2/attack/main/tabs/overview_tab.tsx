/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { AISummarySection } from '../components/ai_summary_section';

export interface OverviewTabProps {
  /**
   * The raw attack document hit.
   */
  hit: DataTableRecord;
}

/**
 * Overview tab content for the attack flyout.
 * Renders the AI summary section. Additional sections (visualizations, insights)
 * will be added in subsequent tasks.
 */
export const OverviewTab = memo(({ hit }: OverviewTabProps) => (
  <div data-test-subj="attack-flyout-overview-tab">
    <AISummarySection hit={hit} />
  </div>
));

OverviewTab.displayName = 'OverviewTab';
