/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { EuiFlexGroup, EuiFlexItem, EuiPanel, useEuiTheme } from '@elastic/eui';
import React from 'react';

interface SectionPanelProps {
  topCard: React.ReactNode;
  bottomCard: React.ReactNode;
  children: React.ReactNode;
  isHighlighted?: boolean;
}

export const SectionPanel = ({
  topCard,
  bottomCard,
  children,
  isHighlighted = false,
}: SectionPanelProps) => {
  const { euiTheme } = useEuiTheme();

  const highlightCss = isHighlighted
    ? { boxShadow: `0 0 0 ${euiTheme.border.width.thick} ${euiTheme.colors.text}` }
    : undefined;

  return (
    <EuiPanel hasShadow={false} hasBorder grow={false} paddingSize="none" css={highlightCss}>
      <EuiFlexGroup gutterSize="none">
        <EuiFlexItem grow={2}>
          <EuiFlexGroup gutterSize="none" direction="column" css={{ height: '100%' }}>
            <EuiFlexItem grow={1}>{topCard}</EuiFlexItem>
            <EuiFlexItem grow={1} css={{ borderTop: euiTheme.border.thin }}>
              {bottomCard}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={5}>
          <EuiFlexGroup direction="column" gutterSize="none" css={{ height: '100%' }}>
            <EuiFlexItem grow>{children}</EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
