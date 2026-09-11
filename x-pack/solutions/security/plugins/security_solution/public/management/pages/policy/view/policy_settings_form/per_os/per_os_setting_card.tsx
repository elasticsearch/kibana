/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, ReactNode } from 'react';
import React, { memo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';

export type PerOsSettingCardProps = React.PropsWithChildren<{
  title: string;
  description: string;
  dataTestSubj?: string;
  rightCorner?: ReactNode;
  mode?: 'edit' | 'view';
  selected?: boolean;
}>;

export const PerOsSettingCard: FC<PerOsSettingCardProps> = memo(
  ({ title, description, dataTestSubj, rightCorner, children, selected = true, mode = 'edit' }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);

    return (
      <EuiPanel data-test-subj={getTestId()} hasBorder={true} hasShadow={false} paddingSize="none">
        <EuiFlexGroup
          alignItems="flexStart"
          gutterSize="m"
          responsive={false}
          css={({ euiTheme }) => ({ padding: euiTheme.size.base })}
        >
          <EuiFlexItem>
            <EuiTitle size="xs">
              <h4 data-test-subj={getTestId('title')}>{title}</h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="s" color="subdued" data-test-subj={getTestId('description')}>
              <p>{description}</p>
            </EuiText>
          </EuiFlexItem>
          {rightCorner && (
            <EuiFlexItem grow={false} data-test-subj={getTestId('rightCornerContainer')}>
              {rightCorner}
            </EuiFlexItem>
          )}
        </EuiFlexGroup>

        {mode === 'edit' || selected ? (
          <>
            <EuiHorizontalRule margin="none" />
            <div css={({ euiTheme }) => ({ padding: euiTheme.size.base })}>{children}</div>
          </>
        ) : (
          <EuiSpacer size="m" />
        )}
      </EuiPanel>
    );
  }
);
PerOsSettingCard.displayName = 'PerOsSettingCard';
