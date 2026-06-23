/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiPageHeader,
  EuiSpacer,
  EuiTab,
  EuiTabs,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { ExperimentalBadge } from '../../components/experimental_badge';
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

  const [selectedTabId, setSelectedTabId] = useState<TabId>(POLICIES_TAB_ID);
  const [policyToViewId, setPolicyToViewId] = useState<string | null>(null);
  const [ruleToViewId, setRuleToViewId] = useState<string | null>(null);
  const { flyout: composeFlyout, openEditFlyout, openCloneFlyout } = useComposeDiscoverFlyout();

  const tabs: Array<{ id: TabId; label: React.ReactNode }> = [
    {
      id: POLICIES_TAB_ID,
      label: (
        <EuiFlexGroup component="span" alignItems="center" gutterSize="xs" responsive={false}>
          <EuiFlexItem grow={false} component="span">
            {i18n.translate('xpack.alertingV2.executionHistory.tabs.policiesLabel', {
              defaultMessage: 'Policies',
            })}
          </EuiFlexItem>
          <EuiFlexItem grow={false} component="span">
            <span data-test-subj="executionHistoryDenormalizationTip">
              <EuiIconTip
                type="info"
                content={i18n.translate(
                  'xpack.alertingV2.executionHistory.denormalizationTooltip',
                  {
                    defaultMessage:
                      'Pagination is by event. A single event may show as multiple rows — one per rule referenced by the event.',
                  }
                )}
              />
            </span>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    // {
    //   id: RULES_TAB_ID,
    //   label: i18n.translate('xpack.alertingV2.executionHistory.tabs.rulesLabel', {
    //     defaultMessage: 'Rules',
    //   }),
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
      <EuiPageHeader
        pageTitle={
          <EuiFlexGroup component="span" alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false} component="span">
              <FormattedMessage
                id="xpack.alertingV2.executionHistory.pageTitle"
                defaultMessage="Execution history"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false} component="span">
              <ExperimentalBadge />
            </EuiFlexItem>
          </EuiFlexGroup>
        }
      />
      <EuiSpacer size="l" />
      <EuiTabs>
        {tabs.map((tab) => (
          <EuiTab
            key={tab.id}
            isSelected={tab.id === selectedTabId}
            onClick={() => setSelectedTabId(tab.id)}
          >
            {tab.label}
          </EuiTab>
        ))}
      </EuiTabs>
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
