/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiHorizontalRule } from '@elastic/eui';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { CellActionRenderer } from '../../../shared/components/cell_actions';
import { AboutSection } from '../components/about_section';
import { AISummarySection } from '../components/ai_summary_section';
import { InsightsSection } from '../components/insights_section';
import { InvestigationSection } from '../components/investigation_section';
import { ResponseSection } from '../components/response_section';
import { VisualizationsSection } from '../components/visualizations_section';

export interface OverviewTabProps {
  /**
   * Document to display in the overview tab
   */
  hit: DataTableRecord;
  /**
   * Pass cell action renderer to the analyzer graph in the visualizations section of the overview tab.
   */
  renderCellActions: CellActionRenderer;
  /**
   * Callback invoked after alert mutations to refresh parent flyout content.
   */
  onAlertUpdated: () => void;
}

/**
 * Overview view displayed in the document details expandable flyout right section
 */
export const OverviewTab = memo(({ hit, renderCellActions, onAlertUpdated }: OverviewTabProps) => (
  <>
    <AISummarySection hit={hit} />
    <EuiHorizontalRule margin="m" />
    <AboutSection hit={hit} />
    <EuiHorizontalRule margin="m" />
    <InvestigationSection hit={hit} renderCellActions={renderCellActions} />
    <EuiHorizontalRule margin="m" />
    <VisualizationsSection
      hit={hit}
      renderCellActions={renderCellActions}
      onAlertUpdated={onAlertUpdated}
    />
    <EuiHorizontalRule margin="m" />
    <InsightsSection
      hit={hit}
      renderCellActions={renderCellActions}
      onAlertUpdated={onAlertUpdated}
    />
    <EuiHorizontalRule margin="m" />
    <ResponseSection hit={hit} />
  </>
));

OverviewTab.displayName = 'OverviewTab';
