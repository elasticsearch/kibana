/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiSpacer } from '@elastic/eui';
import { AppHeader } from '@kbn/app-header';
import type { AppHeaderTab } from '@kbn/app-header';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { i18n } from '@kbn/i18n';
import { EXPERIMENTAL_APP_HEADER_BADGE } from '../../lib/app_header';
import { ActionPolicyDetailsFlyoutContainer } from '../../components/action_policy/details_flyout/action_policy_details_flyout_container';
import { RuleSummaryFlyoutContainer } from '../../components/rule/flyouts/rule_summary_flyout_container';
import { useBreadcrumbs } from '../../hooks/use_breadcrumbs';
import { useComposeDiscoverFlyout } from '../../hooks/use_compose_discover_flyout';
import { PoliciesTabContent, RulesPlaceholder } from './components';

const POLICIES_TAB_ID = 'policies';
const RULES_TAB_ID = 'rules';

type TabId = typeof POLICIES_TAB_ID | typeof RULES_TAB_ID;

export const ExecutionHistoryPage = () => {
  useBreadcrumbs('execution_history_list');
  const docLinks = useService(CoreStart('docLinks'));

  const [selectedTabId, setSelectedTabId] = useState<TabId>(POLICIES_TAB_ID);
  const [policyToViewId, setPolicyToViewId] = useState<string | null>(null);
  const [ruleToViewId, setRuleToViewId] = useState<string | null>(null);
  const { flyout: composeFlyout, openEditFlyout, openCloneFlyout } = useComposeDiscoverFlyout();

  const tabs: AppHeaderTab[] = [
    {
      id: POLICIES_TAB_ID,
      label: i18n.translate('xpack.alertingV2.executionHistory.tabs.policiesLabel', {
        defaultMessage: 'Policies',
      }),
      toolTipContent: i18n.translate('xpack.alertingV2.executionHistory.denormalizationTooltip', {
        defaultMessage:
          'Pagination is by event. A single event may show as multiple rows — one per rule referenced by the event.',
      }),
      isSelected: selectedTabId === POLICIES_TAB_ID,
      onClick: () => setSelectedTabId(POLICIES_TAB_ID),
      'data-test-subj': 'executionHistoryPoliciesTab',
    },
    // {
    //   id: RULES_TAB_ID,
    //   label: i18n.translate('xpack.alertingV2.executionHistory.tabs.rulesLabel', {
    //     defaultMessage: 'Rules',
    //   }),
    //   isSelected: selectedTabId === RULES_TAB_ID,
    //   onClick: () => setSelectedTabId(RULES_TAB_ID),
    //   'data-test-subj': 'executionHistoryRulesTab',
    // },
  ];

  const handlePolicyClick = (policyId: string) => {
    setRuleToViewId(null);
    setPolicyToViewId(policyId);
  };

  const handleRuleClick = (ruleId: string) => {
    setPolicyToViewId(null);
    setRuleToViewId(ruleId);
  };

  return (
    <>
      <AppHeader
        title={i18n.translate('xpack.alertingV2.executionHistory.pageTitle', {
          defaultMessage: 'Execution history',
        })}
        badges={[EXPERIMENTAL_APP_HEADER_BADGE]}
        docLink={docLinks.links.alerting.guide}
        tabs={tabs}
        padding="none"
      />
      <EuiSpacer size="m" />
      {selectedTabId === POLICIES_TAB_ID ? (
        <PoliciesTabContent onPolicyClick={handlePolicyClick} onRuleClick={handleRuleClick} />
      ) : (
        <RulesPlaceholder />
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
    </>
  );
};
