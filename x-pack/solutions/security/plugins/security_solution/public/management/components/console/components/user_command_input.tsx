/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import { EuiCode, EuiTextColor } from '@elastic/eui';
import styled from '@emotion/styled';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';
import { useDataTestSubj } from '../hooks/state_selectors/use_data_test_subj';

const StyledEuiCode = styled(EuiCode)`
  padding-left: 0;
`;

export interface UserCommandInputProps {
  input: string;
  isValid?: boolean;
}

export const UserCommandInput = memo<UserCommandInputProps>(({ input, isValid = true }) => {
  const getTestId = useTestIdGenerator(useDataTestSubj());

  const displayInputValue = useMemo(() => {
    return isValid ? input : <EuiTextColor>{input}</EuiTextColor>;
  }, [input, isValid]);

  return (
    <StyledEuiCode transparentBackground={true} data-test-subj={getTestId('userCommandText')}>
      {displayInputValue}
    </StyledEuiCode>
  );
});
UserCommandInput.displayName = 'UserCommandInput';
