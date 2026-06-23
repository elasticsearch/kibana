/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { useParams } from 'react-router-dom';
import { useEuiTheme } from '@elastic/eui';
import { SecuritySolutionPageWrapper } from '../../../../common/components/page_wrapper';
import { SpyRoute } from '../../../../common/utils/route/spy_routes';
import { SecurityPageName } from '../../../../app/types';
import { useRuleWithFallback } from '../../../rule_management/logic/use_rule_with_fallback';
import { RuleChangesHistory } from '../../components/changes_history';
import { RuleChangesHistoryPageHeader } from './rule_change_history_page_header';

export const RuleChangesHistoryPage = memo(function RuleChangesHistoryPage(): JSX.Element {
  const { ruleId } = useParams<{ ruleId: string }>();
  const { rule } = useRuleWithFallback(ruleId);
  const { euiTheme } = useEuiTheme();

  return (
    <>
      <SecuritySolutionPageWrapper
        style={{
          height: `calc(var(--kbn-application--content-height) - ${euiTheme.size.l} - ${euiTheme.size.l})`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <RuleChangesHistory ruleId={ruleId} header={<RuleChangesHistoryPageHeader rule={rule} />} />
      </SecuritySolutionPageWrapper>
      {/* We can't use SecurityPageName.rulesChangesHistory here for
          deepLinkId as deep linking doesn't support path parameters. */}
      <SpyRoute
        pageName={SecurityPageName.rules}
        state={{ ruleName: rule?.name }}
        detailName={ruleId}
      />
    </>
  );
});
