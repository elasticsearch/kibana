/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React, { memo } from 'react';
import { EuiFlexItem } from '@elastic/eui';
import styled from '@emotion/styled';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';
import { useDataTestSubj } from '../hooks/state_selectors/use_data_test_subj';

const StyledEuiFlexItemHistoryItem = styled(EuiFlexItem)`
  border-bottom: ${({ theme }) => theme.euiTheme.border.width.thin} dashed
    ${({ theme }) => theme.euiTheme.border.color};
  margin-bottom: ${({ theme }) => theme.euiTheme.size.l};
  padding-bottom: ${({ theme }) => theme.euiTheme.size.l};
`;

export type HistoryItemProps = PropsWithChildren<{}>;

export const HistoryItem = memo<HistoryItemProps>(({ children }) => {
  const getTestId = useTestIdGenerator(useDataTestSubj());

  return (
    <StyledEuiFlexItemHistoryItem grow={true} data-test-subj={getTestId('historyItem')}>
      {children}
    </StyledEuiFlexItemHistoryItem>
  );
});

HistoryItem.displayName = 'HistoryItem';
