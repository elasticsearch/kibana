/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiTitle, useEuiMemoizedStyles } from '@elastic/eui';
import type { FC, ReactNode } from 'react';
import React from 'react';
import { calloutStyles } from './styles/callout.styles';
import type { KbnCalloutSize } from './base_callout';

interface CalloutHeaderProps {
  title?: ReactNode;
  size: KbnCalloutSize;
}

export const CalloutHeader: FC<CalloutHeaderProps> = ({ title, size }) => {
  const styles = useEuiMemoizedStyles(calloutStyles);

  if (!title) {
    return null;
  }

  return (
    <EuiTitle size={size === 's' ? 'xxs' : 'xs'} css={styles.header}>
      <p className="kbnCallout__header">{title}</p>
    </EuiTitle>
  );
};
