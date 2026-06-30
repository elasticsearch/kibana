/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryRulesQueryRule } from '@elastic/elasticsearch/lib/api/types';
import { EuiFlexGroup, EuiFlexItem, EuiBadge, EuiIcon, useEuiTheme } from '@elastic/eui';
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import {
  DocsColumnContainer,
  ActionTypeIconBadgeContainer,
  DocumentCountLabelContainer,
  DocumentCountLabelStyle,
} from '../styles';

export const QueryRuleDraggableListItemActionTypeBadge: React.FC<{
  queryRule: QueryRulesQueryRule;
}> = ({ queryRule }) => {
  const { euiTheme } = useEuiTheme();
  return (
    <EuiFlexGroup
      responsive={false}
      alignItems="center"
      gutterSize="m"
      justifyContent="center"
      css={DocsColumnContainer(euiTheme)}
    >
      <EuiFlexItem grow={false}>
        <div css={ActionTypeIconBadgeContainer(euiTheme)}>
          <EuiBadge iconType={queryRule.type === 'exclude' ? 'eyeSlash' : 'pinFill'}>
            {queryRule.type === 'exclude' ? (
              <FormattedMessage
                id="xpack.search.queryRulesetDetail.draggableList.excludeLabel"
                defaultMessage="Exclude"
              />
            ) : (
              <FormattedMessage
                id="xpack.search.queryRulesetDetail.draggableList.pinLabel"
                defaultMessage="Pin"
              />
            )}
          </EuiBadge>
        </div>
      </EuiFlexItem>
      <EuiFlexItem grow={false} css={DocumentCountLabelContainer(euiTheme)}>
        <EuiFlexGroup responsive={false} alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiIcon
              type="documents"
              aria-label={i18n.translate(
                'xpack.search.queryRulesetDetail.queryRuleDraggableList.documentsIconAriaLabel',
                { defaultMessage: 'Documents' }
              )}
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false} css={DocumentCountLabelStyle(euiTheme)}>
            {queryRule.actions.docs?.length ?? 0}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
