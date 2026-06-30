/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiPanel, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';

interface Props {
  message: string;
}

/**
 * A drop zone shown when a drag-and-drop list is empty, so users can still
 * drop an item into the list and to communicate that the list accepts drops.
 */
export const EmptyDropPlaceholder = ({ message }: Props) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiPanel
      color="subdued"
      hasShadow={false}
      paddingSize="m"
      data-test-subj="customizeNavigationEmptyDropPlaceholder"
      css={css`
        display: flex;
        align-items: center;
        justify-content: center;
        min-block-size: 48px;
        border: ${euiTheme.border.width.thin} dashed ${euiTheme.border.color};
      `}
    >
      <EuiText size="s" color="subdued">
        {message}
      </EuiText>
    </EuiPanel>
  );
};
