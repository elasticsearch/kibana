/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { css } from '@emotion/react';
import { useEuiTheme } from '@elastic/eui';
import { consoleEditorPanelStyles } from '../styles';

export const useStyles = () => {
  const { euiTheme } = useEuiTheme();

  return {
    consoleEditorPanel: consoleEditorPanelStyles,

    requestProgressBarContainer: css`
      position: relative;
      z-index: ${euiTheme.levels.menu};
    `,

    // Consolidated styles for editor panels with positioning
    editorPanelPositioned: css`
      top: 0;
      height: calc(100% - 40px);
    `,

    outputPanelCentered: css`
      align-content: center;
      top: 0;
      height: calc(100% - 40px);
    `,

    outputPanelContent: css`
      display: flex;
      flex: 1 1 0;
      min-height: 0;
      overflow: hidden;
      align-content: center;
    `,

    actionsPanelWithBackground: css`
      background-color: ${euiTheme.colors.backgroundBasePlain};
    `,

    fullHeightPanel: css`
      height: 100%;
    `,
  };
};
