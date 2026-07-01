/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IconType, UseEuiTheme } from '@elastic/eui';
import { EuiIcon, useEuiMemoizedStyles, useEuiTheme } from '@elastic/eui';
import type { FC } from 'react';
import React from 'react';
import type { KbnCalloutColor } from '../base_callout';
import { notificationIconStyles } from '../styles/notification_icon.styles';
import { InfoFillIcon } from './info_fill';
import { WarningStaticIcon } from './warning_static';

export type KbnNotificationIconType = 'info' | 'success' | 'warning' | 'error';

/** Maps each variant color to its preset notification icon. */
export const COLOR_TO_NOTIFICATION_ICON: Record<KbnCalloutColor, KbnNotificationIconType> = {
  primary: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
};

type EuiColors = UseEuiTheme['euiTheme']['colors'];
type StringColorToken = {
  [K in keyof EuiColors]: EuiColors[K] extends string ? K : never;
}[keyof EuiColors];

const NOTIFICATION_ICONS: Record<
  KbnNotificationIconType,
  { icon: IconType; color: StringColorToken }
> = {
  info: { icon: InfoFillIcon, color: 'backgroundFilledPrimary' },
  success: { icon: 'checkCircleFill', color: 'backgroundFilledSuccess' },
  warning: { icon: WarningStaticIcon, color: 'backgroundFilledWarning' },
  error: { icon: 'errorFill', color: 'backgroundFilledDanger' },
};

interface KbnNotificationIconProps {
  type: KbnNotificationIconType;
  /** @default 'm' */
  size?: 'm' | 'l';
  className?: string;
}

/**
 * Preset filled icon for a callout variant. Bespoke replica of EUI's
 * internal-only `EuiNotificationIcon` ({@link https://github.com/elastic/eui/pull/9642}).
 */
export const KbnNotificationIcon: FC<KbnNotificationIconProps> = ({
  type,
  size = 'm',
  className,
}) => {
  const { euiTheme } = useEuiTheme();
  const styles = useEuiMemoizedStyles(notificationIconStyles);
  const { icon, color } = NOTIFICATION_ICONS[type];

  return (
    <EuiIcon
      className={className}
      css={size === 'l' && styles.size.l}
      type={icon}
      color={euiTheme.colors[color]}
      size={size}
      aria-hidden="true"
    />
  );
};
