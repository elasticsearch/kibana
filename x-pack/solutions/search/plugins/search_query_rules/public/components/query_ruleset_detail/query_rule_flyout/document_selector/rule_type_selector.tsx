/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { EuiButtonGroup, EuiIcon } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

interface QueryRuleTypeSelectorProps {
  onChange: (value: string) => void;
  selectedId: string;
}
export const QueryRuleTypeSelector: React.FC<QueryRuleTypeSelectorProps> = ({
  onChange,
  selectedId,
}) => (
  <EuiButtonGroup
    legend="Action Type"
    className="eui-displayInlineBlock"
    options={[
      {
        'data-test-subj': 'searchQueryRulesQueryRuleActionTypePinned',
        id: 'pinned',
        label: (
          <>
            <EuiIcon type="pin" size="m" aria-hidden={true} />
            &nbsp;
            <FormattedMessage
              id="xpack.search.queryRulesetDetail.queryRuleFlyout.actionType.pinned"
              defaultMessage="Pinned"
            />
          </>
        ),
      },
      {
        'data-test-subj': 'searchQueryRulesQueryRuleActionTypeExclude',
        id: 'exclude',
        label: (
          <>
            <EuiIcon type="eyeSlash" size="m" aria-hidden={true} />
            &nbsp;
            <FormattedMessage
              id="xpack.search.queryRulesetDetail.queryRuleFlyout.actionType.exclude"
              defaultMessage="Exclude"
            />
          </>
        ),
      },
    ]}
    onChange={(id) => {
      onChange(id);
    }}
    buttonSize="compressed"
    type="single"
    idSelected={selectedId}
  />
);
