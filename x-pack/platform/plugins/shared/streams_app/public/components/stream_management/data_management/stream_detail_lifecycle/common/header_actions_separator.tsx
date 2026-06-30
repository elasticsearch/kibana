/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { useEuiTheme } from '@elastic/eui';

export const HeaderActionsSeparator = () => {
  const { euiTheme } = useEuiTheme();

  return (
    <span
      aria-hidden="true"
      css={css({
        display: 'block',
        width: euiTheme.border.width.thin,
        height: euiTheme.size.l,
        backgroundColor: euiTheme.border.color,
        marginBlock: 'auto',
      })}
    />
  );
};
