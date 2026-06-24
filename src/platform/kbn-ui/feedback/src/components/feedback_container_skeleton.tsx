/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { Fragment } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiSkeletonText,
  EuiSkeletonRectangle,
  EuiSkeletonTitle,
  useEuiTheme,
  EuiSpacer,
} from '@elastic/eui';
import { css } from '@emotion/react';

export const FeedbackContainerSkeleton = () => {
  const { euiTheme } = useEuiTheme();

  const containerCss = css`
    height: 720px;
    padding: ${euiTheme.size.l};
    width: 576px;
  `;

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="s"
      css={containerCss}
      data-test-subj="feedbackContainerLoading"
    >
      <EuiFlexItem grow={false}>
        <EuiSkeletonTitle size="l" />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiSkeletonRectangle width="100%" height={52} borderRadius="s" />
      </EuiFlexItem>
      <EuiSpacer size="m" />
      {Array.from({ length: 2 }, (_, i) => (
        <Fragment key={i}>
          <EuiFlexItem grow={false}>
            <EuiSkeletonText lines={1} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiSkeletonRectangle width="100%" height={108} borderRadius="s" />
          </EuiFlexItem>
        </Fragment>
      ))}
      <EuiSpacer size="l" />
      <EuiFlexItem grow={false}>
        <EuiSkeletonRectangle width="100%" height={72} borderRadius="s" />
      </EuiFlexItem>
      <EuiSpacer size="l" />
      <EuiFlexItem grow={false}>
        <EuiSkeletonRectangle width="100%" height={68} borderRadius="s" />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiSkeletonRectangle width={112} height={40} borderRadius="s" />
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
