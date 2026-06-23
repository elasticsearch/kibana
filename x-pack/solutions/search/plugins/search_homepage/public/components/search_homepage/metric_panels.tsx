/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiImage,
  EuiSpacer,
  EuiSplitPanel,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { SharePublicStart } from '@kbn/share-plugin/public/plugin';
import type { ApplicationStart } from '@kbn/core/public';
import { getWorkflowsCapabilities } from '@kbn/workflows-ui';
import { WORKFLOWS_UI_SETTING_ENABLED_ID } from '../../../common';
import { useAssetBasePath } from '../../hooks/use_asset_base_path';
import { useKibana } from '../../hooks/use_kibana';
import { useGetLicenseInfo } from '../../hooks/use_get_license_info';

const PANEL_TYPES = [
  'discover',
  'dashboards',
  'agentBuilder',
  'workflows',
  'machineLearning',
  'dataManagement',
] as const;

export type MetricPanelType = (typeof PANEL_TYPES)[number];

export interface ComplexMetricPanel {
  getImageUrl: (assetBasePath: string) => string;
  metricDescription: string;
  metricTitle: string;
  type: MetricPanelType;
  dataTestSubj: string;
  onPanelClick?: ({
    share,
    application,
  }: {
    share: SharePublicStart;
    application: ApplicationStart;
  }) => void;
}

export const METRIC_PANEL_ITEMS: Array<ComplexMetricPanel> = [
  {
    getImageUrl: (assetBasePath: string) => `${assetBasePath}/search_lake.svg`,
    metricDescription: i18n.translate('xpack.searchHomepage.metricPanels.empty.discover.desc', {
      defaultMessage:
        'Search and filter documents, analyze fields, visualize patterns, and save findings for later.',
    }),

    metricTitle: i18n.translate('xpack.searchHomepage.metricPanels.empty.discover.title', {
      defaultMessage: 'Discover',
    }),
    type: 'discover',
    onPanelClick: ({ application }) => {
      application.navigateToApp('discover');
    },
    dataTestSubj: 'searchHomepageNavLinks-discover',
  },
  {
    getImageUrl: (assetBasePath: string) => `${assetBasePath}/search_data_vis.svg`,
    metricDescription: i18n.translate('xpack.searchHomepage.metricPanels.empty.dashboards.desc', {
      defaultMessage:
        'Analyze all of your Elastic data in one place by creating a dashboard and adding visualizations.',
    }),

    metricTitle: i18n.translate('xpack.searchHomepage.metricPanels.empty.dashboards.title', {
      defaultMessage: 'Dashboards',
    }),
    type: 'dashboards',
    onPanelClick: ({ application }) => {
      application.navigateToApp('dashboards');
    },
    dataTestSubj: 'searchHomepageNavLinks-dashboards',
  },
  {
    getImageUrl: (assetBasePath: string) => `${assetBasePath}/search_agents.svg`,
    metricDescription: i18n.translate('xpack.searchHomepage.metricPanels.empty.agents.desc', {
      defaultMessage:
        'Utilize AI-powered capabilities to build and interact with agents alongside your Elasticsearch data.',
    }),

    metricTitle: i18n.translate('xpack.searchHomepage.metricPanels.empty.agents.title', {
      defaultMessage: 'Agent Builder',
    }),
    type: 'agentBuilder',
    onPanelClick: ({ application }) => {
      application.navigateToApp('agent_builder');
    },
    dataTestSubj: 'searchHomepageNavLinks-agentBuilder',
  },

  {
    type: 'workflows' as const,
    getImageUrl: (assetBasePath: string) => `${assetBasePath}/search_relevance.svg`,
    metricDescription: i18n.translate('xpack.searchHomepage.metricPanels.empty.workflows.desc', {
      defaultMessage:
        'Create intelligent workflows that turn Elastic insights into automated actions across your entire tech stack.',
    }),
    metricTitle: i18n.translate('xpack.searchHomepage.metricPanels.empty.workflow.title', {
      defaultMessage: 'Workflows',
    }),
    onPanelClick: ({ application }) => {
      application.navigateToApp('workflows');
    },
    dataTestSubj: 'searchHomepageNavLinks-workflows',
  },
  {
    type: 'machineLearning',
    getImageUrl: (assetBasePath: string) => `${assetBasePath}/search_machinelearning.svg`,

    metricDescription: i18n.translate(
      'xpack.searchHomepage.metricPanels.empty.machineLearning.desc',
      {
        defaultMessage:
          'Analyze and visualize your data to generate models for determining patterns of behavior.',
      }
    ),
    metricTitle: i18n.translate('xpack.searchHomepage.metricPanels.empty.machineLearning.title', {
      defaultMessage: 'Machine Learning',
    }),
    onPanelClick: ({ application }) => {
      application.navigateToApp('ml', {
        path: 'overview',
      });
    },
    dataTestSubj: 'searchHomepageNavLinks-machineLearning',
  },
  {
    type: 'dataManagement',
    getImageUrl: (assetBasePath: string) => `${assetBasePath}/search_indexing_folder.svg`,
    metricDescription: i18n.translate(
      'xpack.searchHomepage.metricPanels.empty.dataManagement.desc',
      {
        defaultMessage:
          'Manage your Elasticsearch indices, ingest pipelines and search relevance tooling.',
      }
    ),

    metricTitle: i18n.translate('xpack.searchHomepage.metricPanels.empty.dataManagement.title', {
      defaultMessage: 'Data Management',
    }),
    onPanelClick: async ({ share }) => {
      const indexManagementLocator = share.url.locators.get('SEARCH_INDEX_MANAGEMENT_LOCATOR_ID');
      if (indexManagementLocator) {
        await indexManagementLocator.navigate({ page: 'index_list' });
      }
    },
    dataTestSubj: 'searchHomepageNavLinks-dataManagement',
  },
];

interface MetricPanelEmptyProps {
  panel: ComplexMetricPanel;
}

const MetricPanelEmpty = ({ panel }: MetricPanelEmptyProps) => {
  const {
    services: { share, application },
  } = useKibana();
  const assetBasePath = useAssetBasePath();
  const { euiTheme } = useEuiTheme();

  const { getImageUrl, metricTitle, metricDescription, onPanelClick, dataTestSubj } = panel;
  return (
    <EuiSplitPanel.Outer
      hasBorder
      onClick={() => onPanelClick && onPanelClick({ share, application })}
      data-test-subj={dataTestSubj}
    >
      <EuiSplitPanel.Inner color="subdued" paddingSize="l">
        <EuiFlexGroup direction="column" alignItems="center" justifyContent="center">
          <EuiImage size={euiTheme.size.xxxxl} src={getImageUrl(assetBasePath)} alt="" />
        </EuiFlexGroup>
      </EuiSplitPanel.Inner>
      <EuiSplitPanel.Inner css={css({ height: '100%' })}>
        <EuiFlexGroup direction="column" alignItems="flexStart" gutterSize="s">
          <EuiTitle size="xs">
            <h4>{metricTitle}</h4>
          </EuiTitle>
          <EuiText color="subdued" size="s">
            <p>{metricDescription}</p>
          </EuiText>
          <EuiSpacer size="s" />
        </EuiFlexGroup>
      </EuiSplitPanel.Inner>
    </EuiSplitPanel.Outer>
  );
};

export const MetricPanels = () => {
  const { hasEnterpriseLicense } = useGetLicenseInfo();
  const { services } = useKibana();
  const { application, chrome, uiSettings } = services;

  const isWorkflowsUiEnabled = uiSettings.get<boolean>(WORKFLOWS_UI_SETTING_ENABLED_ID, true);
  const { canReadWorkflow } = getWorkflowsCapabilities(application.capabilities);

  const panels = useMemo(() => {
    const capabilityChecks: Record<MetricPanelType, boolean> = {
      discover: chrome.navLinks.get('discover') !== undefined,
      dashboards: chrome.navLinks.get('dashboards') !== undefined,
      agentBuilder: chrome.navLinks.get('agent_builder') !== undefined && hasEnterpriseLicense,
      workflows:
        isWorkflowsUiEnabled && canReadWorkflow && chrome.navLinks.get('workflows') !== undefined,
      machineLearning:
        chrome.navLinks.get('ml:overview') !== undefined || chrome.navLinks.get('ml') !== undefined,
      dataManagement: chrome.navLinks.get('management:index_management') !== undefined,
    };

    return METRIC_PANEL_ITEMS.filter((panel) => capabilityChecks[panel.type]);
  }, [chrome.navLinks, isWorkflowsUiEnabled, canReadWorkflow, hasEnterpriseLicense]);

  const gridColumns = useMemo(() => {
    const count = panels.length;
    if (count === 1 || count === 2 || count === 4) {
      return 2;
    }
    return 3;
  }, [panels.length]);

  if (panels.length === 0) {
    return null;
  }

  return (
    <EuiFlexItem>
      <EuiSpacer size="l" />
      <EuiFlexGrid
        gutterSize="l"
        columns={gridColumns}
        data-test-subj="searchHomepageNavLinksTabGrid"
      >
        {panels.map((panel, index) => (
          <MetricPanelEmpty panel={panel} key={panel.type + '-' + index} />
        ))}
      </EuiFlexGrid>
    </EuiFlexItem>
  );
};
