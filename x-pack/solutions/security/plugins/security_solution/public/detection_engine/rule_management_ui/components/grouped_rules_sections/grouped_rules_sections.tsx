/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText } from '@elastic/eui';
import { css } from '@emotion/react';
import { useQuery } from '@kbn/react-query';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { FindRulesResponse } from '@kbn/alerting-v2-schemas';
import { i18n } from '@kbn/i18n';
import { AllRules } from '../rules_table';
import { V1RulesGroupSection } from './v1_rules_group_section';
import { V2RulesGroupSection } from './v2_rules_group_section';
import { useRulesTableContextOptional } from '../rules_table/rules_table/rules_table_context';
import { useKibana } from '../../../../common/lib/kibana';

const SIEM_OWNER_FILTER = 'metadata.owner: siem';
const V2_COUNT_QUERY_KEY = 'v2RulesTotalCount';

const TOTAL_RULES_LABEL = (count: number) =>
  i18n.translate('xpack.securitySolution.ruleManagement.groupedSections.totalRules', {
    defaultMessage: '{count} {count, plural, one {Rule} other {Rules}}',
    values: { count },
  });

const LIBRARIES_LABEL = (count: number) =>
  i18n.translate('xpack.securitySolution.ruleManagement.groupedSections.libraries', {
    defaultMessage: '{count} {count, plural, one {Library} other {Libraries}}',
    values: { count },
  });

interface GroupedRulesSectionsProps {
  isAlertingV2Enabled: boolean;
}

const useV2RulesTotalCount = (enabled: boolean): { total: number; hasAccess: boolean } => {
  const { http } = useKibana().services;

  const { data, isError, error } = useQuery(
    [V2_COUNT_QUERY_KEY],
    () =>
      http.get<FindRulesResponse>(ALERTING_V2_RULE_API_PATH, {
        query: { page: 1, perPage: 1, filter: SIEM_OWNER_FILTER },
      }),
    { enabled, retry: false }
  );

  const isUnauthorized =
    isError && error instanceof Object && 'statusCode' in error && error.statusCode === 403;

  return { total: data?.total ?? 0, hasAccess: !isUnauthorized };
};

const SummaryToolbar = ({
  totalRules,
  libraryCount,
}: {
  totalRules: number;
  libraryCount: number;
}) => (
  <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
    <EuiFlexItem grow={false}>
      <EuiText size="s">
        <strong>{TOTAL_RULES_LABEL(totalRules)}</strong>
      </EuiText>
    </EuiFlexItem>
    <EuiFlexItem
      grow={false}
      role="separator"
      css={css`
        align-self: center;
        height: 16px;
        border-right: 1px solid currentColor;
        opacity: 0.3;
      `}
    />
    <EuiFlexItem grow={false}>
      <EuiText size="s">{LIBRARIES_LABEL(libraryCount)}</EuiText>
    </EuiFlexItem>
  </EuiFlexGroup>
);

export const GroupedRulesSections = React.memo<GroupedRulesSectionsProps>(
  ({ isAlertingV2Enabled }) => {
    const rulesTableContext = useRulesTableContextOptional();
    const v1Total = rulesTableContext?.state.pagination.total ?? 0;
    const { total: v2Total, hasAccess: hasV2Access } = useV2RulesTotalCount(isAlertingV2Enabled);

    const showV2Section = isAlertingV2Enabled && hasV2Access;
    const libraryCount = showV2Section ? 2 : 1;
    const totalRules = v1Total + v2Total;

    return (
      <>
        <SummaryToolbar totalRules={totalRules} libraryCount={libraryCount} />
        <EuiSpacer size="m" />

        {showV2Section && (
          <>
            <V2RulesGroupSection />
            <EuiSpacer size="m" />
          </>
        )}
        <V1RulesGroupSection>
          <AllRules data-test-subj="all-rules" />
        </V1RulesGroupSection>
      </>
    );
  }
);

GroupedRulesSections.displayName = 'GroupedRulesSections';
