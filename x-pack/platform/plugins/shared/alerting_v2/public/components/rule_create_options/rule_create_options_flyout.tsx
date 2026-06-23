/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { RuleCreateOptionsPanel, type LegacyRuleTypeItem } from './rule_create_options_panel';

const FLYOUT_TITLE_ID = 'ruleCreateOptionsFlyoutTitle';

export interface RuleCreateOptionsFlyoutProps {
  onClose: () => void;
  onCreateEsqlRule: () => void;
  onCreateWithAgent?: () => void;
  onCreateThresholdAlert?: () => void;
  legacyRuleTypes?: LegacyRuleTypeItem[];
}

export const RuleCreateOptionsFlyout = ({
  onClose,
  onCreateEsqlRule,
  onCreateWithAgent,
  onCreateThresholdAlert,
  legacyRuleTypes,
}: RuleCreateOptionsFlyoutProps) => {
  return (
    <EuiFlyout
      type="push"
      size="s"
      ownFocus
      hideCloseButton
      onClose={onClose}
      aria-labelledby={FLYOUT_TITLE_ID}
      data-test-subj="ruleCreateOptionsFlyout"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="s" id={FLYOUT_TITLE_ID}>
              <h2>
                <FormattedMessage
                  id="xpack.alertingV2.ruleCreateOptionsFlyout.title"
                  defaultMessage="Create rule"
                />
              </h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiToolTip
              content={i18n.translate('xpack.alertingV2.ruleCreateOptionsFlyout.close', {
                defaultMessage: 'Close',
              })}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                iconType="cross"
                color="text"
                onClick={onClose}
                aria-label={i18n.translate('xpack.alertingV2.ruleCreateOptionsFlyout.close', {
                  defaultMessage: 'Close',
                })}
                data-test-subj="ruleCreateOptionsFlyoutCloseButton"
              />
            </EuiToolTip>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <RuleCreateOptionsPanel
          layout="vertical"
          onCreateEsqlRule={onCreateEsqlRule}
          onCreateWithAgent={onCreateWithAgent}
          onCreateThresholdAlert={onCreateThresholdAlert}
          legacyRuleTypes={legacyRuleTypes}
        />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
