/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlexGroup,
  EuiFlexItem,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { IlmPolicySummaryTab } from './ilm_policy_summary_tab';
import { IlmPolicyJsonTab } from './ilm_policy_json_tab';
import { inspectIlmPolicyFlyoutStrings as strings } from './strings';
import type { InspectIlmPolicyFlyoutProps } from './types';
import { FlyoutWithTabs, type NonEmptyFlyoutTabs } from '../flyout_with_tabs';

type TabId = 'summary' | 'json';

const TABS: NonEmptyFlyoutTabs<TabId> = [
  {
    id: 'summary',
    label: strings.summaryTabLabel,
  },
  {
    id: 'json',
    label: strings.jsonTabLabel,
  },
];

export const InspectIlmPolicyFlyout = ({
  policyName,
  policy,
  onBack,
  onEditPolicy,
  primaryAction,
  type,
  container,
  ownFocus,
}: InspectIlmPolicyFlyoutProps) => {
  const { euiTheme } = useEuiTheme();
  const footerStyles = css`
    padding: ${euiTheme.size.m} ${euiTheme.size.l};
  `;

  const primaryActionTestSubj =
    primaryAction['data-test-subj'] ?? 'inspectIlmPolicyFlyoutSelectAndApplyButton';

  return (
    <FlyoutWithTabs
      title={strings.title(policyName)}
      showBackButton
      tabsAriaLabel={strings.tabsAriaLabel}
      tabs={TABS}
      initialTabId="summary"
      onClose={onBack}
      onBack={onBack}
      type={type}
      container={container}
      ownFocus={ownFocus}
    >
      {(selectedTab) => (
        <>
          <EuiFlyoutBody>
            {selectedTab === 'summary' && <IlmPolicySummaryTab phases={policy.phases} />}
            {selectedTab === 'json' && <IlmPolicyJsonTab policyName={policyName} policy={policy} />}
          </EuiFlyoutBody>

          <EuiFlyoutFooter>
            <EuiFlexGroup
              justifyContent="spaceBetween"
              alignItems="center"
              gutterSize="s"
              responsive={false}
              wrap
              css={footerStyles}
            >
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  onClick={onBack}
                  flush="left"
                  data-test-subj="inspectIlmPolicyFlyoutBackButton"
                >
                  {strings.backButton}
                </EuiButtonEmpty>
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      onClick={() => onEditPolicy(policyName)}
                      data-test-subj="inspectIlmPolicyFlyoutEditPolicyButton"
                    >
                      {strings.editPolicyButton}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      fill
                      onClick={() => primaryAction.onClick(policyName)}
                      data-test-subj={primaryActionTestSubj}
                      disabled={primaryAction.isDisabled}
                    >
                      {primaryAction.label}
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </>
      )}
    </FlyoutWithTabs>
  );
};
