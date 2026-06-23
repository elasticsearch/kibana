/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiAvatar, EuiIcon, useEuiTheme } from '@elastic/eui';
import React, { memo } from 'react';
import styled from 'styled-components';

import type { RuleStatusType } from '../../../common/types';

export interface RuleStatusIconProps {
  name: string;
  type: RuleStatusType;
}

const RuleStatusIconStyled = styled.div`
  position: relative;
  svg {
    position: absolute;
    top: 8px;
    left: 9px;
  }
`;

const RuleStatusIconComponent: React.FC<RuleStatusIconProps> = ({ name, type }) => {
  const { euiTheme } = useEuiTheme();

  const color =
    type === 'passive' ? euiTheme.colors.backgroundBaseDisabled : euiTheme.colors.primary;
  return (
    <RuleStatusIconStyled>
      <EuiAvatar color={color} name={type === 'valid' ? '' : name} size="l" aria-label={name} />
      {type === 'valid' ? (
        <EuiIcon
          type="check"
          color={euiTheme.colors.backgroundBasePlain}
          size="l"
          aria-hidden={true}
        />
      ) : null}
    </RuleStatusIconStyled>
  );
};

export const RuleStatusIcon = memo(RuleStatusIconComponent);
