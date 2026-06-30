/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiIconTip, EuiTab, EuiTabs, useEuiTheme } from '@elastic/eui';
import type { ReactElement, VFC } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { memo } from 'react';
import { css } from '@emotion/react';
import { FlyoutHeader } from '../../../../shared/components/flyout_header';

export type LeftPanelTabsType = Array<{
  id: EntityDetailsLeftPanelTab;
  'data-test-subj': string;
  name: ReactElement;
  content: React.ReactElement;
  isTechnicalPreview?: boolean;
}>;

export enum EntityDetailsLeftPanelTab {
  RISK_INPUTS = 'risk_inputs',
  ANOMALIES = 'anomalies',
  OKTA = 'okta_document',
  ENTRA = 'entra_document',
  CSP_INSIGHTS = 'csp_insights',
  FIELDS_TABLE = 'fields_table',
  GRAPH_VIEW = 'graph_view',
  RESOLUTION_GROUP = 'resolution_group',
}

export enum CspInsightLeftPanelSubTab {
  MISCONFIGURATIONS = 'misconfigurationTabId',
  VULNERABILITIES = 'vulnerabilitiesTabId',
  ALERTS = 'alertsTabId',
}

export enum RiskScoreLeftPanelSubTab {
  ENTITY = 'entity',
  RESOLUTION = 'resolution',
}

export interface EntityDetailsPath {
  tab: EntityDetailsLeftPanelTab;
  subTab?: CspInsightLeftPanelSubTab | RiskScoreLeftPanelSubTab;
}

const TechnicalPreviewBadge = () => (
  <EuiIconTip
    aria-label="Technical Preview"
    type={'beaker'}
    title={
      <FormattedMessage
        id="xpack.securitySolution.flyout.left.visualize.graphVisualizationButton.technicalPreviewLabel"
        defaultMessage="Technical Preview"
      />
    }
    content={
      <FormattedMessage
        id="xpack.securitySolution.flyout.left.visualize.graphVisualizationButton.technicalPreviewTooltip"
        defaultMessage="This functionality is in technical preview and may be changed or removed completely in a future release. Elastic will work to fix any issues, but features in technical preview are not subject to the support SLA of official GA features."
      />
    }
  />
);

export interface PanelHeaderProps {
  /**
   * Id of the tab selected in the parent component to display its content
   */
  selectedTabId: EntityDetailsLeftPanelTab;
  /**
   * Callback to set the selected tab id in the parent component
   */
  setSelectedTabId: (selected: EntityDetailsLeftPanelTab) => void;
  /**
   * List of tabs to display in the header
   */
  tabs: LeftPanelTabsType;
}

/**
 * Header at the top of the left section.
 * Displays the investigation and insights tabs (visualize is hidden for 8.9).
 */
export const LeftPanelHeader: VFC<PanelHeaderProps> = memo(
  ({ selectedTabId, setSelectedTabId, tabs }) => {
    const { euiTheme } = useEuiTheme();
    const onSelectedTabChanged = (id: EntityDetailsLeftPanelTab) => setSelectedTabId(id);
    const renderTabs = tabs.map((tab, index) => (
      <EuiTab
        onClick={() => onSelectedTabChanged(tab.id)}
        isSelected={tab.id === selectedTabId}
        key={index}
        data-test-subj={tab['data-test-subj']}
        append={tab.isTechnicalPreview && <TechnicalPreviewBadge />}
      >
        {tab.name}
      </EuiTab>
    ));

    return (
      <FlyoutHeader
        css={css`
          background-color: ${euiTheme.colors.backgroundBaseSubdued};
          padding-bottom: 0 !important;
          border-block-end: none !important;
        `}
      >
        <EuiTabs size="l">{renderTabs}</EuiTabs>
      </FlyoutHeader>
    );
  }
);

LeftPanelHeader.displayName = 'LeftPanelHeader';
