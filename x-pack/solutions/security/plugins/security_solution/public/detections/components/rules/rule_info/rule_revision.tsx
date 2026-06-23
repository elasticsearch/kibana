/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, type ReactElement } from 'react';
import { EuiBadge, EuiHorizontalRule, EuiText, EuiToolTip } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import * as i18n from './translations';

interface RuleRevisionProps {
  revision: number;
  'data-test-subj'?: string;
}

export const RuleRevision = memo(function RuleRevision({
  revision,
  'data-test-subj': dataTestSubj,
}: RuleRevisionProps): JSX.Element {
  return (
    <div data-test-subj={dataTestSubj}>
      <FormattedMessage
        id="xpack.securitySolution.detectionEngine.ruleDetails.revision"
        defaultMessage="Revision: {revision}"
        values={{
          revision: (
            <RuleRevisionToolTip>
              <EuiBadge>{revision}</EuiBadge>
            </RuleRevisionToolTip>
          ),
        }}
      />
    </div>
  );
});

interface RuleRevisionToolTipProps {
  children: ReactElement;
}

function RuleRevisionToolTip({ children }: RuleRevisionToolTipProps): JSX.Element {
  const content = (
    <>
      <strong>
        <EuiText size="s">{i18n.RULE_REVISION_TOOLTIP_HEADER}</EuiText>
      </strong>
      <EuiHorizontalRule margin="xs" />
      {i18n.RULE_REVISION_TOOLTIP_CONTENT}
    </>
  );

  return <EuiToolTip content={content}>{children}</EuiToolTip>;
}
