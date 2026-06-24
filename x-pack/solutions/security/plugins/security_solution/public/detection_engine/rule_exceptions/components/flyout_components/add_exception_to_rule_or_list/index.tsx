/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiTitle, EuiSpacer, EuiPanel } from '@elastic/eui';
import styled from '@emotion/styled';
import type { ExceptionListSchema } from '@kbn/securitysolution-io-ts-list-types';
import { ExceptionListTypeEnum } from '@kbn/securitysolution-io-ts-list-types';

import * as i18n from './translations';
import type { Rule } from '../../../../rule_management/logic/types';
import { ExceptionsAddToRulesOptions } from '../add_to_rules_options';
import { ExceptionsAddToListsOptions } from '../add_to_lists_options';

interface ExceptionsAddToRulesOrListsComponentProps {
  /* Rules that exception item will be added to, or whose shared lists will be used to populate add to lists option. If none passed in, user is prompted to select what rules to add exception to. */
  rules: Rule[] | null;
  selectedRadioOption: string;
  /* Is user adding an exception item from the rules bulk actions */
  isBulkAction: boolean;
  onListSelectionChange: (lists: ExceptionListSchema[]) => void;
  onRuleSelectionChange: (rulesSelectedToAdd: Rule[]) => void;
  onRadioChange: (radioId: string) => void;
}

const SectionHeader = styled(EuiTitle)`
  font-weight: ${({ theme }) => theme.euiTheme.font.weight.semiBold};
`;

const ExceptionsAddToRulesOrListsComponent: React.FC<ExceptionsAddToRulesOrListsComponentProps> = ({
  rules,
  isBulkAction,
  selectedRadioOption,
  onListSelectionChange,
  onRuleSelectionChange,
  onRadioChange,
}): JSX.Element => {
  const isSingleRule = useMemo(() => rules != null && rules.length === 1, [rules]);

  /*
   * Determine what shared lists to display as selectable options for adding the exception item to:
   * - if dealing with a single rule - show any shared exception lists it has attached
   * - if dealing with multiple rules - show only shared exception lists that are common
   * across all of the rules
   */
  const sharedLists = useMemo(() => {
    if (rules == null) return [];

    if (rules.length === 1)
      return (
        rules[0].exceptions_list?.filter((list) => list.type === ExceptionListTypeEnum.DETECTION) ??
        []
      );

    const lists =
      rules?.map((rule) => (rule.exceptions_list != null ? rule.exceptions_list : [])) ?? [];

    lists.sort((a, b) => {
      return a.length - b.length;
    });

    const shortestArrOfLists = lists.shift();

    if (shortestArrOfLists == null || !shortestArrOfLists.length) return [];

    return shortestArrOfLists
      .filter((exceptionListInfo) =>
        lists.every((l) => l.some(({ id }) => exceptionListInfo.id === id))
      )
      .filter((list) => list.type === ExceptionListTypeEnum.DETECTION);
  }, [rules]);
  const rulesCount = useMemo(() => (rules != null ? rules.length : 0), [rules]);

  return (
    <EuiPanel
      paddingSize="none"
      hasShadow={false}
      data-test-subj="exceptionItemAddToRuleOrListSection"
    >
      <SectionHeader size="xs">
        <h3>{i18n.ADD_TO_LISTS_SECTION_TITLE}</h3>
      </SectionHeader>
      <EuiSpacer size="s" />
      <ExceptionsAddToRulesOptions
        possibleRules={rules}
        isSingleRule={isSingleRule}
        isBulkAction={isBulkAction}
        selectedRadioOption={selectedRadioOption}
        onRuleSelectionChange={onRuleSelectionChange}
        onRadioChange={onRadioChange}
      />
      <ExceptionsAddToListsOptions
        rulesCount={rulesCount}
        selectedRadioOption={selectedRadioOption}
        sharedLists={sharedLists}
        onListsSelectionChange={onListSelectionChange}
        onRadioChange={onRadioChange}
      />
    </EuiPanel>
  );
};

export const ExceptionsAddToRulesOrLists = React.memo(ExceptionsAddToRulesOrListsComponent);

ExceptionsAddToRulesOrLists.displayName = 'ExceptionsAddToRulesOrLists';
