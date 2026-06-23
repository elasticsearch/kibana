/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { HTMLAttributes } from 'react';
import React, { useEffect } from 'react';
import { css } from '@emotion/react';
import { css as cssString } from '@emotion/css';
import { useEuiTheme } from '@elastic/eui';
import type { TabsServices } from '../../types';

const globalCss = cssString`
  // Disables the overscroll behavior to prevent the page from bouncing when scrolling
  overscroll-behavior: none;

  // Removes the shadow from the global header
  .header__secondBar,
  [data-test-subj='kibanaProjectHeaderActionMenu'] {
    box-shadow: none;
  }
`;

export interface TabsBarWithBackgroundProps extends HTMLAttributes<HTMLElement> {
  services: TabsServices;
  children: React.ReactNode;
}

export const TabsBarWithBackground: React.FC<TabsBarWithBackgroundProps> = ({
  services,
  children,
  ...otherProps
}) => {
  const euiThemeContext = useEuiTheme();
  const { euiTheme } = euiThemeContext;

  useEffect(() => {
    document.body.classList.add(globalCss);

    return () => {
      document.body.classList.remove(globalCss);
    };
  }, []);

  return (
    <div
      {...otherProps}
      css={css`
        // tabs bar background
        background: ${euiTheme.colors.backgroundBasePlain};
      `}
    >
      {children}
    </div>
  );
};
