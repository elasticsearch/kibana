/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import { EuiSpacer } from '@elastic/eui';
import { css } from '@emotion/react';
import { AppHeader } from '@kbn/app-header';
import type { AppHeaderTab } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import { experimentalBadge } from '../../components/experimental_badge';
import { ActionPolicyDetailsFlyoutContainer } from '../../components/action_policy/details_flyout/action_policy_details_flyout_container';
import { RuleSummaryFlyoutContainer } from '../../components/rule/flyouts/rule_summary_flyout_container';
import { useBreadcrumbs } from '../../hooks/use_breadcrumbs';
import { useComposeDiscoverFlyout } from '../../hooks/use_compose_discover_flyout';
import { PoliciesTabContent, RulesTabContent } from './components';

const POLICIES_TAB_ID = 'policies';
const RULES_TAB_ID = 'rules';

type TabId = typeof POLICIES_TAB_ID | typeof RULES_TAB_ID;

const EXECUTION_HISTORY_PAGE_TITLE = i18n.translate('xpack.alertingV2.executionHistory.pageTitle', {
  defaultMessage: 'Execution history',
});

// Full-height flex column so the selected tab can grow and own its own scroll (the grid scrolls
// internally) instead of the whole page scrolling.
const pageCss = css`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-block-size: 0;
`;

const getExecutionHistoryTabs = ({
  selectedTabId,
  onSelect,
}: {
  selectedTabId: TabId;
  onSelect: (id: TabId) => void;
}): AppHeaderTab[] => [
  {
    id: RULES_TAB_ID,
    label: i18n.translate('xpack.alertingV2.executionHistory.tabs.rulesLabel', {
      defaultMessage: 'Rules',
    }),
    isSelected: selectedTabId === RULES_TAB_ID,
    onClick: () => onSelect(RULES_TAB_ID),
    'data-test-subj': 'executionHistoryRulesTab',
  },
  {
    id: POLICIES_TAB_ID,
    label: i18n.translate('xpack.alertingV2.executionHistory.tabs.policiesLabel', {
      defaultMessage: 'Policies',
    }),
    isSelected: selectedTabId === POLICIES_TAB_ID,
    onClick: () => onSelect(POLICIES_TAB_ID),
    'data-test-subj': 'executionHistoryPoliciesTab',
  },
];

export const ExecutionHistoryPage = () => {
  useBreadcrumbs('execution_history_list');

  const [selectedTabId, setSelectedTabId] = useState<TabId>(RULES_TAB_ID);
  const [policyToViewId, setPolicyToViewId] = useState<string | null>(null);
  const [ruleToViewId, setRuleToViewId] = useState<string | null>(null);
  const {
    flyout: composeFlyout,
    confirmationModal,
    openEditFlyout,
    openCloneFlyout,
  } = useComposeDiscoverFlyout();

  const handlePolicyClick = (policyId: string) => {
    setRuleToViewId(null);
    setPolicyToViewId(policyId);
  };

  const handleRuleClick = (ruleId: string) => {
    setPolicyToViewId(null);
    setRuleToViewId(ruleId);
  };

  const tabs = useMemo(
    () => getExecutionHistoryTabs({ selectedTabId, onSelect: setSelectedTabId }),
    [selectedTabId]
  );

  return (
    <div data-test-subj="executionHistoryPage" css={pageCss}>
      <AppHeader
        sticky={false}
        title={EXECUTION_HISTORY_PAGE_TITLE}
        badges={[experimentalBadge]}
        spacing="bleed"
        tabs={tabs}
      />
      <EuiSpacer size="m" />
      {selectedTabId === RULES_TAB_ID ? (
        <RulesTabContent onRuleClick={handleRuleClick} />
      ) : (
        <PoliciesTabContent
          onPolicyClick={handlePolicyClick}
          onRuleClick={handleRuleClick}
          activeRuleId={ruleToViewId}
        />
      )}
      {policyToViewId && (
        <ActionPolicyDetailsFlyoutContainer
          policyId={policyToViewId}
          onClose={() => setPolicyToViewId(null)}
        />
      )}
      {ruleToViewId && (
        <RuleSummaryFlyoutContainer
          ruleId={ruleToViewId}
          onClose={() => setRuleToViewId(null)}
          onEdit={(r) => {
            setRuleToViewId(null);
            openEditFlyout(r);
          }}
          onClone={(r) => {
            setRuleToViewId(null);
            openCloneFlyout(r);
          }}
        />
      )}
      {composeFlyout}
      {confirmationModal}
    </div>
  );
};
