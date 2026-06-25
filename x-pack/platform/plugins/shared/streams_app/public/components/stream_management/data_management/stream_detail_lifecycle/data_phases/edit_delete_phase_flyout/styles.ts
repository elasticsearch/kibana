/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { css } from '@emotion/react';
import { useEuiTheme } from '@elastic/eui';

export const useEditDeletePhaseFlyoutStyles = () => {
  const { euiTheme } = useEuiTheme();

  return useMemo(
    () => ({
      headerStyles: css`
        padding: ${euiTheme.size.xl};
      `,
      sectionStyles: css`
        padding: ${euiTheme.size.base} ${euiTheme.size.xl};
      `,
      footerStyles: css`
        padding: ${euiTheme.size.base} ${euiTheme.size.xl};
      `,
    }),
    [euiTheme.size.base, euiTheme.size.xl]
  );
};
