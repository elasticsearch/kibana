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
  EuiText,
  EuiTitle,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';
import React, { useState } from 'react';
import {
  SHOW_REQUEST_MODAL_SUBTITLE,
  SHOW_REQUEST_MODAL_TITLE,
  RULE_FLYOUT_FOOTER_BACK_TEXT,
  RULE_FLYOUT_HEADER_BACK_TEXT,
} from '../translations';
import { RequestCodeBlock, ShowRequestTabs } from '../components';
import type { ShowRequestActivePage } from '../types';
import { useRuleFormState } from '../hooks';

interface RuleFlyoutShowRequestProps {
  onClose: () => void;
}

export const RuleFlyoutShowRequest = ({ onClose }: RuleFlyoutShowRequestProps) => {
  const [activeTab, setActiveTab] = useState<ShowRequestActivePage>('create');
  const { id } = useRuleFormState();

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
            <EuiTitle size="xs" data-test-subj="ruleFlyoutShowRequestTitle">
              <h4 id="flyoutTitle">{SHOW_REQUEST_MODAL_TITLE(activeTab)}</h4>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <p>
          <EuiText color="subdued">{SHOW_REQUEST_MODAL_SUBTITLE(activeTab)}</EuiText>
        </p>
        <EuiSpacer />

        {id && <ShowRequestTabs activeTab={activeTab} onTabChange={setActiveTab} />}

        <RequestCodeBlock data-test-subj="flyoutRequestCodeBlock" activeTab={activeTab} />
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiButtonEmpty
          iconType="chevronSingleLeft"
          onClick={onClose}
          data-test-subj="ruleFlyoutShowRequestBackButton"
        >
          {RULE_FLYOUT_FOOTER_BACK_TEXT}
        </EuiButtonEmpty>
      </EuiFlyoutFooter>
    </>
  );
};
