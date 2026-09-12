/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiText } from '@elastic/eui';
import React from 'react';
import * as i18n from './translations';

export interface RulesConflictStats {
  numOfRulesWithoutConflicts: number;
  numOfRulesWithSolvableConflicts: number;
  numOfRulesWithNonSolvableConflicts: number;
  /**
   * Number of rules with solvable conflicts whose rule type changes in the target version.
   * Such rules are non-customized, so the type change auto-resolves to the target type.
   */
  numOfRulesWithRuleTypeChange: number;
}

export function ConflictsDescription({
  numOfRulesWithoutConflicts,
  numOfRulesWithSolvableConflicts,
  numOfRulesWithNonSolvableConflicts,
  numOfRulesWithRuleTypeChange,
}: RulesConflictStats): JSX.Element {
  return (
    <EuiText>
      <p>
        {numOfRulesWithNonSolvableConflicts > 0 && (
          <>
            {i18n.RULES_WITH_NON_SOLVABLE_CONFLICTS_TOTAL(numOfRulesWithNonSolvableConflicts)}
            <br />
          </>
        )}
        {numOfRulesWithSolvableConflicts > 0 && (
          <>
            {i18n.RULES_WITH_SOLVABLE_CONFLICTS_TOTAL({
              numOfRulesWithSolvableConflicts,
              numOfRulesWithRuleTypeChange,
            })}
            <br />
          </>
        )}
        {numOfRulesWithoutConflicts > 0 && (
          <>
            {i18n.RULES_WITHOUT_CONFLICTS_TOTAL(numOfRulesWithoutConflicts)}
            <br />
          </>
        )}
      </p>
      {numOfRulesWithNonSolvableConflicts > 0 && (
        <p>{i18n.RULES_WITH_NON_SOLVABLE_CONFLICTS_GUIDANCE(numOfRulesWithNonSolvableConflicts)}</p>
      )}
      {numOfRulesWithSolvableConflicts > 0 &&
        i18n.RULES_WITH_AUTO_RESOLVED_CONFLICTS_GUIDANCE({
          numOfRulesWithSolvableConflicts,
          numOfRulesWithoutConflicts,
          numOfRulesWithRuleTypeChange,
        })}
      {numOfRulesWithoutConflicts > 0 && (
        <p>{i18n.RULES_WITHOUT_CONFLICTS_GUIDANCE(numOfRulesWithoutConflicts)}</p>
      )}
    </EuiText>
  );
}
