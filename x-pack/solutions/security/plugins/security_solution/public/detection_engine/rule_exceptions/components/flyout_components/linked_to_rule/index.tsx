/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiTitle, EuiSpacer, EuiInMemoryTable } from '@elastic/eui';
import styled from '@emotion/styled';

import * as i18n from './translations';
import type { Rule } from '../../../../rule_management/logic/types';
import { getRulesTableColumn } from '../utils';

interface ExceptionsLinkedToRuleComponentProps {
  rule: Rule;
}

const SectionHeader = styled(EuiTitle)`
  font-weight: ${({ theme }) => theme.euiTheme.font.weight.semiBold};
`;

const ExceptionsLinkedToRuleComponent: React.FC<ExceptionsLinkedToRuleComponentProps> = ({
  rule,
}): JSX.Element => {
  return (
    <>
      <SectionHeader size="xs" data-test-subj="exceptionItemLinkedToRuleSection">
        <h3>{i18n.LINKED_TO_RULE_TITLE}</h3>
      </SectionHeader>
      <EuiSpacer size="s" />
      <EuiInMemoryTable<Rule>
        tableCaption="Rules table"
        itemId="id"
        items={[rule]}
        columns={getRulesTableColumn()}
        sorting
        data-test-subj="addExceptionToRulesTable"
      />
    </>
  );
};

export const ExceptionsLinkedToRule = React.memo(ExceptionsLinkedToRuleComponent);

ExceptionsLinkedToRule.displayName = 'ExceptionsLinkedToRule';
