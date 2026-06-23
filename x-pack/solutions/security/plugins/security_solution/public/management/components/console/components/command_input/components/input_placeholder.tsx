/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import styled from '@emotion/styled';
import { EuiText } from '@elastic/eui';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import { useWithInputTextEntered } from '../../../hooks/state_selectors/use_with_input_text_entered';
import { useWithInputPlaceholder } from '../../../hooks/state_selectors/use_with_input_placeholder';
import { useDataTestSubj } from '../../../hooks/state_selectors/use_data_test_subj';

const InputPlaceholderContainer = styled(EuiText)`
  position: absolute;
  pointer-events: none;
  padding-left: 0.5em;
  width: 96%;
  color: ${({ theme }) => theme.euiTheme.colors.textSubdued};
  user-select: none;
`;

export const InputPlaceholder = memo(() => {
  const { fullTextEntered } = useWithInputTextEntered();
  const placeholder = useWithInputPlaceholder();
  const getTestId = useTestIdGenerator(useDataTestSubj());

  if (fullTextEntered.length > 0) {
    return null;
  }

  return (
    <InputPlaceholderContainer
      size="s"
      className="eui-textTruncate"
      data-test-subj={getTestId('inputPlaceholder')}
    >
      <div className="eui-textTruncate">{placeholder}</div>
    </InputPlaceholderContainer>
  );
});
InputPlaceholder.displayName = 'InputPlaceholder';
