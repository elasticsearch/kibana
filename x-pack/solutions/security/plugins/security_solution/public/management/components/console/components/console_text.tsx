/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React, { memo } from 'react';
import type { EuiTextColorProps, EuiTextProps } from '@elastic/eui';
import { EuiText, EuiTextColor, useEuiTheme } from '@elastic/eui';
export type ConsoleTextProps = PropsWithChildren<{
  size?: EuiTextProps['size'];
  color?: EuiTextColorProps['color'];
  className?: string;
  'data-test-subj'?: string;
}>;

export const ConsoleText = memo<ConsoleTextProps>(
  ({ size = 's', color, children, 'data-test-subj': dataTestSubj, className }) => {
    const { euiTheme } = useEuiTheme();

    return (
      // className of `font-family-code` below is defined globally in `Console` styles
      <EuiText
        size={size}
        data-test-subj={dataTestSubj}
        className={`font-family-code ${className ?? ''}`}
      >
        <EuiTextColor color={color ?? euiTheme.colors.text}>{children}</EuiTextColor>
      </EuiText>
    );
  }
);
ConsoleText.displayName = 'ConsoleText';
