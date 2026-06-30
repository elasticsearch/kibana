/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiTitle, EuiIcon, EuiText } from '@elastic/eui';

interface Props {
  title: string;
  icon: string;
  description?: string;
}

export const SearchGettingStartedSectionHeading = ({ title, icon, description }: Props) => {
  return (
    <EuiFlexGroup gutterSize="xs" direction={'column'} justifyContent="spaceBetween">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiPanel color="subdued" paddingSize="s" grow={false}>
              <EuiIcon type={icon} size="m" color="subdued" aria-hidden={true} />
            </EuiPanel>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h2>{title}</h2>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      {description && (
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued" grow={false}>
            <p>{description}</p>
          </EuiText>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
