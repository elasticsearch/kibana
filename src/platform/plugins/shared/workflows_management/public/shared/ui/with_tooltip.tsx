/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiToolTip } from '@elastic/eui';
import { css } from '@emotion/react';
import React from 'react';

/*
 * EuiToolTip clones its child to attach hover handlers, so anchor it to a plain
 * span — works uniformly for EuiIcon, EuiToken, Suspense, and the masked-span glyph.
 */
const tooltipAnchorStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  lineHeight: 0,
});

export const withTooltip = (
  content: React.ReactElement,
  tooltip?: string | React.ReactNode
): React.ReactElement => {
  return tooltip ? (
    <EuiToolTip
      content={tooltip}
      anchorProps={{
        css: css`
          display: inline-flex;
        `,
      }}
    >
      <span tabIndex={0} css={tooltipAnchorStyle}>
        {content}
      </span>
    </EuiToolTip>
  ) : (
    content
  );
};
