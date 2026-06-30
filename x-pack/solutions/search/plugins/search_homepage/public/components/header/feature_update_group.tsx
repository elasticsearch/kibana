/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiIcon } from '@elastic/eui';

export interface FeatureUpdateGroupProps {
  updates: React.ReactNode[];
}

export const FeatureUpdateGroup: React.FC<FeatureUpdateGroupProps> = ({ updates }) => {
  return (
    <EuiFlexGroup gutterSize="xl">
      {updates.map((update, index) => (
        <EuiFlexItem grow={false} key={index}>
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiIcon type="checkCircleFill" color="primary" aria-hidden={true} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>{update}</EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );
};
