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

interface RuleVersionProps {
  version: number;
  'data-test-subj'?: string;
}

export const RuleVersion = memo(function RuleVersion({
  version,
  'data-test-subj': dataTestSubj,
}: RuleVersionProps): JSX.Element {
  return (
    <div data-test-subj={dataTestSubj}>
      <FormattedMessage
        id="xpack.securitySolution.detectionEngine.ruleDetails.version"
        defaultMessage="Elastic version: {version}"
        values={{
          version: (
            <RuleVersionToolTip>
              <EuiBadge>{version}</EuiBadge>
            </RuleVersionToolTip>
          ),
        }}
      />
    </div>
  );
});

interface RuleVersionToolTipProps {
  children: ReactElement;
}

function RuleVersionToolTip({ children }: RuleVersionToolTipProps): JSX.Element {
  const content = (
    <>
      <strong>
        <EuiText size="s">{i18n.RULE_VERSION_TOOLTIP_HEADER}</EuiText>
      </strong>
      <EuiHorizontalRule margin="xs" />
      {i18n.RULE_VERSION_TOOLTIP_CONTENT}
    </>
  );

  return <EuiToolTip content={content}>{children}</EuiToolTip>;
}
