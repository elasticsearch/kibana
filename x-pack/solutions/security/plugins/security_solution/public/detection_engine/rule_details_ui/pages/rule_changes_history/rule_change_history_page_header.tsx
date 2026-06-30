/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { HeaderPage } from '../../../../common/components/header_page';
import { SecurityPageName } from '../../../../app/types';
import { getRuleDetailsTabUrl } from '../../../../common/components/link_to/redirect_to_detection_engine';
import type { RuleResponse } from '../../../../../common/api/detection_engine/model/rule_schema';
import { RuleDetailTabs } from '../rule_details/use_rule_details_tabs';
import { CreatedBy, UpdatedBy } from '../../../../detections/components/rules/rule_info';
import { RuleStatus, ruleStatusI18n } from '../../../common/components/rule_execution_status';

interface RuleChangesHistoryPageHeaderProps {
  ruleId: string;
  rule: RuleResponse | null;
}

export const RuleChangesHistoryPageHeader = memo(function RuleChangesHistoryPageHeader({
  ruleId,
  rule,
}: RuleChangesHistoryPageHeaderProps): JSX.Element {
  const subTitle = rule
    ? [
        <CreatedBy createdBy={rule.created_by} createdAt={rule.created_at} />,
        rule.updated_by != null ? (
          <UpdatedBy updatedBy={rule.updated_by} updatedAt={rule.updated_at} />
        ) : (
          ''
        ),
      ].filter(Boolean)
    : [];

  const lastExecution = rule?.execution_summary?.last_execution;
  const lastExecutionStatus = lastExecution?.status;
  const lastExecutionDate = lastExecution?.date ?? '';
  const statusInfo = (
    <EuiFlexGroup alignItems="center" gutterSize="xs">
      <EuiFlexItem grow={false}>
        {ruleStatusI18n.STATUS}
        {':'}
      </EuiFlexItem>
      <RuleStatus status={lastExecutionStatus} date={lastExecutionDate}>
        {null}
      </RuleStatus>
    </EuiFlexGroup>
  );

  return (
    <HeaderPage
      title={rule?.name ?? ''}
      subtitle={subTitle}
      subtitle2={statusInfo}
      backOptions={{
        pageId: SecurityPageName.rules,
        path: getRuleDetailsTabUrl(rule?.id ?? ruleId, RuleDetailTabs.overview),
        dataTestSubj: 'ruleChangesHistoryBack',
      }}
      backInlined
    />
  );
});
