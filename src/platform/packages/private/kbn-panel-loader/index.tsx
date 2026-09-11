/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiLoadingChart, EuiPanel } from '@elastic/eui';
import { css } from '@emotion/react';

export const PanelLoader = (props: {
  showShadow?: boolean;
  showBorder?: boolean;
  dataTestSubj?: string;
}) => {
  return (
    <EuiPanel
      css={css`
        z-index: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: $euiSizeL + 2px;
        position: relative;
        justify-content: center;
        align-items: center;
      `}
      role="figure"
      paddingSize="none"
      hasShadow={props.showShadow}
      hasBorder={props.showBorder}
      data-test-subj={props.dataTestSubj}
    >
      <EuiLoadingChart size="l" className="kbnLoadingIndicator" />
    </EuiPanel>
  );
};
