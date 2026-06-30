/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiTitle,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
} from '@elastic/eui';
import React from 'react';
import {
  ACTION_TYPE_MODAL_TITLE,
  RULE_FLYOUT_FOOTER_BACK_TEXT,
  RULE_FLYOUT_HEADER_BACK_TEXT,
} from '../translations';
import { RuleActionsConnectorsBody } from '../rule_actions/rule_actions_connectors_body';

interface RuleFlyoutSelectConnectorProps {
  onClose: () => void;
}
export const RuleFlyoutSelectConnector = ({ onClose }: RuleFlyoutSelectConnectorProps) => {
  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup>
          <EuiFlexItem grow={false}>
            <EuiToolTip content={RULE_FLYOUT_HEADER_BACK_TEXT} disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="chevronSingleLeft"
                onClick={onClose}
                aria-label={RULE_FLYOUT_HEADER_BACK_TEXT}
                color="text"
              />
            </EuiToolTip>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="xs" data-test-subj="ruleFlyoutSelectConnectorTitle">
              <h4 id="flyoutTitle">{ACTION_TYPE_MODAL_TITLE}</h4>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <RuleActionsConnectorsBody onSelectConnector={onClose} />
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiButtonEmpty
          iconType="chevronSingleLeft"
          onClick={onClose}
          data-test-subj="ruleFlyoutSelectConnectorBackButton"
        >
          {RULE_FLYOUT_FOOTER_BACK_TEXT}
        </EuiButtonEmpty>
      </EuiFlyoutFooter>
    </>
  );
};
