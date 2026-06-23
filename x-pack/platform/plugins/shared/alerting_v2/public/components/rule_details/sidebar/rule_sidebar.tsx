/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { RuleSidebarConditionsTab } from './rule_sidebar_conditions_tab';
import { RuleSidebarPreviewTab } from './rule_sidebar_preview_tab';
import { RuleSidebarRunbookTab } from './rule_sidebar_runbook_tab';

const CONDITIONS_TAB = {
  id: 'conditions',
  label: i18n.translate('xpack.alertingV2.sidebar.conditionsTab', {
    defaultMessage: 'Conditions',
  }),
  'data-test-subj': 'sidebarConditionsTab',
};

const QUERY_PREVIEW_TAB = {
  id: 'queryPreview',
  label: i18n.translate('xpack.alertingV2.sidebar.queryPreviewTab', {
    defaultMessage: 'Query preview',
  }),
  'data-test-subj': 'sidebarQueryPreviewTab',
};

const RUNBOOK_TAB = {
  id: 'runbook',
  label: i18n.translate('xpack.alertingV2.sidebar.runbookTab', {
    defaultMessage: 'Runbook',
  }),
  'data-test-subj': 'sidebarRunbookTab',
};

export interface RuleSidebarProps {
  showQueryPreview?: boolean;
}

export const RuleSidebar: React.FC<RuleSidebarProps> = ({ showQueryPreview = false }) => {
  const [selectedTab, setSelectedTab] = useState('conditions');

  const tabOptions = showQueryPreview
    ? [CONDITIONS_TAB, QUERY_PREVIEW_TAB, RUNBOOK_TAB]
    : [CONDITIONS_TAB, RUNBOOK_TAB];

  return (
    <div>
      <EuiFlexGroup direction="column" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="s">
            <h2>
              {i18n.translate('xpack.alertingV2.sidebar.title', {
                defaultMessage: 'Rule conditions',
              })}
            </h2>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend={i18n.translate('xpack.alertingV2.sidebar.tabSelection', {
              defaultMessage: 'Rule conditions view selection',
            })}
            options={tabOptions}
            idSelected={selectedTab}
            onChange={(id) => setSelectedTab(id)}
            buttonSize="compressed"
            data-test-subj="sidebarTabGroup"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiHorizontalRule margin="m" />

      {selectedTab === 'conditions' && <RuleSidebarConditionsTab />}
      {selectedTab === 'queryPreview' && <RuleSidebarPreviewTab />}
      {selectedTab === 'runbook' && <RuleSidebarRunbookTab />}
    </div>
  );
};
