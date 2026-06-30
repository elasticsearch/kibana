/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiButton, EuiButtonEmpty, EuiButtonIcon, EuiToolTip } from '@elastic/eui';

interface Props {
  fill?: boolean;
  label?: string;
  disabled?: boolean;
  iconType?: string;
}

export const ButtonRegular = ({
  fill = false,
  label = 'Button',
  disabled = false,
  iconType,
}: Props) => {
  return (
    <EuiButton fill={fill} disabled={disabled} iconType={iconType}>
      {label}
    </EuiButton>
  );
};

export const ButtonFill = () => <ButtonRegular fill />;

export const ButtonDisabled = () => <ButtonRegular disabled />;

export const ButtonWithIcon = () => (
  <ButtonRegular iconType="discoverApp" label="Open in Discover" />
);

export const ButtonEmptyRegular = ({
  label = 'Button',
  disabled = false,
  iconType,
}: Omit<Props, 'fill'>) => (
  <EuiButtonEmpty disabled={disabled} iconType={iconType}>
    {label}
  </EuiButtonEmpty>
);

export const ButtonEmptyDisabled = () => <ButtonEmptyRegular label="Button" disabled />;

export const ButtonEmptyWithIcon = () => (
  <ButtonEmptyRegular iconType="discoverApp" label="Open in Discover" />
);

export const ButtonIconRegular = () => (
  <EuiToolTip content="Open in Discover" disableScreenReaderOutput>
    <EuiButtonIcon iconType="discoverApp" aria-label="Open in Discover" />
  </EuiToolTip>
);
