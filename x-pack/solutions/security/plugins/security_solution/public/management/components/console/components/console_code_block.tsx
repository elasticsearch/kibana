/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { memo } from 'react';
import type { EuiTextProps } from '@elastic/eui';
import { EuiText } from '@elastic/eui';
import styled from '@emotion/styled';

const CodeBlock = styled(EuiText)`
  font-family: ${(props) => props.theme.euiTheme.font.familyCode};
`;

export const ConsoleCodeBlock = memo<{
  children: ReactNode;
  inline?: boolean;
  textColor?: EuiTextProps['color'];
  bold?: boolean;
}>(({ children, inline = false, textColor = 'default', bold = false }) => {
  return (
    <CodeBlock size="relative" color={textColor} className={inline ? 'eui-displayInline' : ''}>
      {bold ? <strong>{children}</strong> : children}
    </CodeBlock>
  );
});
ConsoleCodeBlock.displayName = 'ConsoleCodeBlock';
