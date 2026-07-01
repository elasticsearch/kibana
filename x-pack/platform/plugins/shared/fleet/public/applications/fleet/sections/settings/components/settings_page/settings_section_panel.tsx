/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiPanelProps } from '@elastic/eui';
import { EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';

export interface SettingsSectionPanelProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  color?: EuiPanelProps['color'];
  'data-test-subj'?: string;
  children?: React.ReactNode;
}

export const SettingsSectionPanel: React.FunctionComponent<SettingsSectionPanelProps> = ({
  title,
  description,
  color,
  'data-test-subj': dataTestSubj,
  children,
}) => {
  return (
    <EuiPanel color={color} hasBorder hasShadow={false}>
      <EuiTitle size="xs">
        <h4 data-test-subj={dataTestSubj}>{title}</h4>
      </EuiTitle>
      {description ? (
        <>
          <EuiSpacer size="xs" />
          <EuiText color="subdued" size="s" grow={false}>
            {description}
          </EuiText>
        </>
      ) : null}
      {children ? (
        <>
          <EuiSpacer />
          {children}
        </>
      ) : null}
    </EuiPanel>
  );
};
