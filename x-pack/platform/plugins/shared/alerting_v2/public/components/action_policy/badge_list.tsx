/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import React from 'react';

interface Props {
  items: string[];
}

export const BadgeList = ({ items }: Props) => (
  <EuiFlexGroup gutterSize="xs" wrap responsive={false} css={{ maxWidth: '100%' }}>
    {items.map((item) => (
      <EuiFlexItem grow={false} key={item} css={{ maxWidth: '100%' }}>
        <EuiToolTip content={item} position="top">
          <EuiBadge color="hollow" title="">
            {item}
          </EuiBadge>
        </EuiToolTip>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);
