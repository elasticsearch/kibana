/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { css } from '@emotion/react';
import { euiFontSize, type UseEuiTheme } from '@elastic/eui';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';

const chartTooltipFooterMessageStyles = {
  root: (euiThemeContext: UseEuiTheme) =>
    css`
      color: ${euiThemeContext.euiTheme.colors.textSubdued};
      ${euiFontSize(euiThemeContext, 'xs', { unit: 'px' })};
      font-weight: ${euiThemeContext.euiTheme.font.weight.regular};
    `,
};

/** Renders a styled message in the footer of a chart tooltip. */
export const ChartTooltipFooterMessage: React.FC<{ message: string }> = ({ message }) => {
  const styles = useMemoCss(chartTooltipFooterMessageStyles);
  return (
    <div css={styles.root} data-test-subj="chartTooltipFooterMessage">
      {message}
    </div>
  );
};
