/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { euiShadow } from '@elastic/eui';
import type { UseEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { borderRadiusXlStyles } from '../../../../../common.styles';

export const promptContainerStyles = (euiThemeContext: UseEuiTheme) => {
  const { euiTheme } = euiThemeContext;
  return css`
    background-color: ${euiTheme.colors.backgroundBasePlain};
    ${borderRadiusXlStyles}
    border: ${euiTheme.border.width.thin} solid ${euiTheme.colors.borderBasePlain};
    padding: ${euiTheme.size.base};
    ${euiShadow(euiThemeContext, 's')};
  `;
};
