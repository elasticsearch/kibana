/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiCallOut, EuiIcon, EuiLink, EuiSpacer } from '@elastic/eui';
import { getIsExperimentalFeatureEnabled } from '../../../../common/get_experimental_features';

interface RulesListErrorBannerProps {
  rulesLastRunOutcomes: Record<string, number>;
  setRuleExecutionStatusesFilter: (statuses: string[]) => void;
  setRuleLastRunOutcomesFilter: (outcomes: string[]) => void;
}

export const RulesListErrorBanner = (props: RulesListErrorBannerProps) => {
  const { rulesLastRunOutcomes, setRuleExecutionStatusesFilter, setRuleLastRunOutcomesFilter } =
    props;

  const onClick = () => {
    const isRuleUsingExecutionStatus = getIsExperimentalFeatureEnabled('ruleUseExecutionStatus');
    if (isRuleUsingExecutionStatus) {
      setRuleExecutionStatusesFilter(['error']);
    } else {
      setRuleLastRunOutcomesFilter(['failed']);
    }
  };

  if (rulesLastRunOutcomes.failed === 0) {
    return null;
  }

  return (
    <>
      <EuiCallOut color="danger" size="s" data-test-subj="rulesErrorBanner">
        <p>
          <EuiIcon color="danger" type="warning" aria-hidden={true} />
          &nbsp;
          <FormattedMessage
            id="xpack.triggersActionsUI.sections.rulesList.attentionBannerTitle"
            defaultMessage="Error found in {totalStatusesError, plural, one {# rule} other {# rules}}."
            values={{
              totalStatusesError: rulesLastRunOutcomes.failed,
            }}
          />
          &nbsp;
          <EuiLink color="primary" onClick={onClick}>
            <FormattedMessage
              id="xpack.triggersActionsUI.sections.rulesList.viewBannerButtonLabel"
              defaultMessage="Show {totalStatusesError, plural, one {rule} other {rules}} with error"
              values={{
                totalStatusesError: rulesLastRunOutcomes.failed,
              }}
            />
          </EuiLink>
        </p>
      </EuiCallOut>
      <EuiSpacer size="s" />
    </>
  );
};
