/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiCallOut, EuiIcon, EuiLink, EuiSpacer } from '@elastic/eui';

interface RulesListClearRuleFilterProps {
  onClickClearFilter: () => void;
}

export const RulesListClearRuleFilterBanner = ({
  onClickClearFilter,
}: RulesListClearRuleFilterProps) => {
  return (
    <>
      <EuiCallOut color="primary" size="s" data-test-subj="rulesListClearRuleFilterBanner">
        <p>
          <EuiIcon color="primary" type="info" aria-hidden={true} />{' '}
          <FormattedMessage
            id="xpack.triggersActionsUI.sections.rulesList.ruleParamBannerTitle"
            defaultMessage="Rule list filtered by url parameters."
          />{' '}
          <EuiLink color="primary" onClick={onClickClearFilter}>
            <FormattedMessage
              id="xpack.triggersActionsUI.sections.rulesList.ruleParamBannerButton"
              defaultMessage="Show all"
            />
          </EuiLink>
        </p>
      </EuiCallOut>
      <EuiSpacer size="s" />
    </>
  );
};
