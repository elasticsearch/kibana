/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiSpacer,
  EuiSwitch,
  EuiText,
} from '@elastic/eui';

export interface ToggleableRowProps {
  title: string;
  description?: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
  /** data-test-subj for the toggle switch (the row uses `${dataTestSubj}-row`). */
  dataTestSubj: string;
  /** Body rendered below the row when {@link enabled} is true. */
  children?: React.ReactNode;
}

export const ToggleableRow = ({
  title,
  description,
  enabled,
  onToggle,
  disabled,
  dataTestSubj,
  children,
}: ToggleableRowProps) => {
  const handleSwitchChange = useCallback(
    (event: React.BaseSyntheticEvent) => {
      onToggle((event.target as HTMLInputElement).checked);
    },
    [onToggle]
  );

  return (
    <>
      <EuiHorizontalRule margin="m" />
      <EuiFlexGroup
        gutterSize="m"
        alignItems="center"
        responsive={false}
        data-test-subj={`${dataTestSubj}-row`}
      >
        <EuiFlexItem>
          <EuiText size="s">
            <strong>{title}</strong>
          </EuiText>
          {description ? (
            <EuiText size="s" color="subdued">
              {description}
            </EuiText>
          ) : null}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSwitch
            showLabel={false}
            label={title}
            checked={enabled}
            onChange={handleSwitchChange}
            disabled={disabled}
            data-test-subj={dataTestSubj}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      {children ? (
        <>
          <EuiSpacer size="l" />
          {children}
        </>
      ) : null}
    </>
  );
};
