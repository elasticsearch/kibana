/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { RuleGroupSection, type SectionStat } from '../rule_group_section/rule_group_section';
import { useRulesTableContextOptional } from '../rules_table/rules_table/rules_table_context';

const SECTION_TITLE = i18n.translate(
  'xpack.securitySolution.ruleManagement.groupedSections.v1.title',
  { defaultMessage: 'SIEM rules' }
);

const RULES_LABEL = i18n.translate(
  'xpack.securitySolution.ruleManagement.groupedSections.v1.rulesLabel',
  { defaultMessage: 'Rules' }
);

const ENABLED_LABEL = i18n.translate(
  'xpack.securitySolution.ruleManagement.groupedSections.v1.enabledLabel',
  { defaultMessage: 'Enabled' }
);

export const V1RulesGroupSection = React.memo<{ children: React.ReactNode }>(({ children }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const rulesTableContext = useRulesTableContextOptional();

  const total = rulesTableContext?.state.pagination.total ?? 0;
  const enabledCount = useMemo(
    () => rulesTableContext?.state.rules.filter((r) => r.enabled).length ?? 0,
    [rulesTableContext?.state.rules]
  );
  const isLoading = rulesTableContext?.state.isLoading ?? false;

  const stats = useMemo<SectionStat[]>(
    () => [
      { label: RULES_LABEL, value: total },
      { label: ENABLED_LABEL, value: enabledCount },
    ],
    [total, enabledCount]
  );

  return (
    <RuleGroupSection
      title={SECTION_TITLE}
      titleIcon="logoSecurity"
      stats={stats}
      isLoading={isLoading}
      onToggle={setIsExpanded}
      data-test-subj="v1RulesGroupSection"
    >
      {isExpanded ? children : null}
    </RuleGroupSection>
  );
});

V1RulesGroupSection.displayName = 'V1RulesGroupSection';
