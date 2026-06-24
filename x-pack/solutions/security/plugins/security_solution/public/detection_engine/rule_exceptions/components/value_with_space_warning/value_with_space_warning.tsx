/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import type { FC } from 'react';
import styled from '@emotion/styled';

import { EuiIconTip } from '@elastic/eui';
import { useValueWithSpaceWarning } from './use_value_with_space_warning';
interface ValueWithSpaceWarningProps {
  value: string[] | string;
  tooltipIconType?: string;
  tooltipIconText?: string;
}
const Container = styled.div`
  display: inline;
  margin-left: ${({ theme }) => `${theme.euiTheme.size.xs}`};
`;
export const ValueWithSpaceWarning: FC<ValueWithSpaceWarningProps> = ({
  value,
  tooltipIconType = 'info',
  tooltipIconText,
}) => {
  const { showSpaceWarningIcon, warningText } = useValueWithSpaceWarning({
    value,
    tooltipIconText,
  });
  if (!showSpaceWarningIcon || !value) return null;
  return (
    <Container>
      <EuiIconTip
        content={warningText}
        position="top"
        iconProps={{
          'data-test-subj': 'value_with_space_warning_tooltip',
        }}
        type={tooltipIconType}
        color="warning"
      />
    </Container>
  );
};
