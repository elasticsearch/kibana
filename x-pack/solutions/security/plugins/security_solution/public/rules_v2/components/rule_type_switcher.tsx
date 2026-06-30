/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { EuiCard, EuiFlexGrid, EuiFlexItem, EuiFormRow, EuiIcon } from '@elastic/eui';
import type { SecurityRuleType } from '../constants';
import * as i18n from '../translations';

interface RuleTypeSwitcherProps {
  ruleType: SecurityRuleType;
  onChange: (ruleType: SecurityRuleType) => void;
  /** When true (edit mode), only the selected type is shown and cards are not clickable. */
  isUpdateView?: boolean;
}

export const RuleTypeSwitcher = ({
  ruleType,
  onChange,
  isUpdateView = false,
}: RuleTypeSwitcherProps) => {
  const setEsql = useCallback(() => onChange('esql'), [onChange]);
  const setThreshold = useCallback(() => onChange('threshold'), [onChange]);

  const esqlSelectable = useMemo(
    () => ({
      onClick: setEsql,
      isSelected: ruleType === 'esql',
    }),
    [ruleType, setEsql]
  );

  const thresholdSelectable = useMemo(
    () => ({
      onClick: setThreshold,
      isSelected: ruleType === 'threshold',
    }),
    [ruleType, setThreshold]
  );

  return (
    <EuiFormRow fullWidth label={i18n.RULE_TYPE_LABEL} data-test-subj="rulesV2RuleTypeSwitcher">
      <EuiFlexGrid columns={3}>
        {(!isUpdateView || esqlSelectable.isSelected) && (
          <EuiFlexItem>
            <EuiCard
              data-test-subj="rulesV2EsqlRuleType"
              title={i18n.RULE_TYPE_ESQL}
              titleSize="xs"
              description={i18n.RULE_TYPE_ESQL_DESCRIPTION}
              icon={<EuiIcon size="xl" type="logoElasticsearch" />}
              selectable={esqlSelectable}
              layout="horizontal"
            />
          </EuiFlexItem>
        )}
        {(!isUpdateView || thresholdSelectable.isSelected) && (
          <EuiFlexItem>
            <EuiCard
              data-test-subj="rulesV2ThresholdRuleType"
              title={i18n.RULE_TYPE_THRESHOLD}
              titleSize="xs"
              description={i18n.RULE_TYPE_THRESHOLD_DESCRIPTION}
              icon={<EuiIcon size="xl" type="chartThreshold" />}
              selectable={thresholdSelectable}
              layout="horizontal"
            />
          </EuiFlexItem>
        )}
      </EuiFlexGrid>
    </EuiFormRow>
  );
};
