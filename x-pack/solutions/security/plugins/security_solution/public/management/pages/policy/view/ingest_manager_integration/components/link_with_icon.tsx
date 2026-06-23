/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import styled from 'styled-components';
import type { FC } from 'react';
import React, { memo } from 'react';
import { EuiIcon } from '@elastic/eui';
import type { LinkToAppProps } from '../../../../../../common/components/endpoint/link_to_app';
import { LinkToApp } from '../../../../../../common/components/endpoint/link_to_app';

const LinkLabel = styled.span<{
  size?: 'm' | 'l';
}>`
  display: inline-block;
  padding-right: ${(props) => props.theme.eui.euiSizeS};
  font-size: ${({ size, theme }) => (size === 'm' ? theme.eui.euiFontSizeXS : 'innherit')};
`;

type ComponentProps = LinkToAppProps & {
  size?: 'm' | 'l';
};

export const LinkWithIcon: FC<ComponentProps> = memo(({ children, size = 'l', ...props }) => {
  return (
    <LinkToApp {...props}>
      <LinkLabel size={size}>{children}</LinkLabel>
      <EuiIcon type={size === 'm' ? 'chevronSingleRight' : 'external'} aria-hidden={true} />
    </LinkToApp>
  );
});

LinkWithIcon.displayName = 'LinkWithIcon';
