/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiText } from '@elastic/eui';
import type { FC, ReactNode } from 'react';
import React from 'react';
import type { KbnCalloutSize } from './base_callout';

interface CalloutBodyProps {
  content?: ReactNode;
  size: KbnCalloutSize;
}

export const CalloutBody: FC<CalloutBodyProps> = ({ content, size }) => {
  if (!content) {
    return null;
  }

  return (
    <EuiText className="kbnCallout__content" size={size === 's' ? 'xs' : 's'} color="default">
      {content}
    </EuiText>
  );
};
