/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type UseEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';

/**
 * `line-height: 1` keeps the intrinsic content height at the 16px icon so the box still
 * measures 24px, and `min-block-size` lets a longer translation or a larger font grow the
 * background instead of spilling the links outside it.
 */
export const CloudLinksPillStyle = ({ euiTheme }: UseEuiTheme) => css`
  background: ${euiTheme.colors.backgroundBasePrimary};
  border-radius: ${euiTheme.size.m};
  min-block-size: 24px;
  padding: ${euiTheme.size.xs} ${euiTheme.size.s};
  line-height: 1;
  white-space: nowrap;
`;
