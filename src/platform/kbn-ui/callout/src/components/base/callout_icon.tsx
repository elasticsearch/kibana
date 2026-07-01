/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IconType } from '@elastic/eui';
import { EuiIcon, useEuiMemoizedStyles } from '@elastic/eui';
import type { FC } from 'react';
import React from 'react';
import { COLOR_TO_NOTIFICATION_ICON, KbnNotificationIcon } from './icons/notification_icon';
import { calloutStyles } from './styles/callout.styles';
import { notificationIconStyles } from './styles/notification_icon.styles';
import type { KbnCalloutColor, KbnCalloutSize } from './base_callout';
import { useCalloutColors } from './use_callout_colors';

interface CalloutIconProps {
  color: KbnCalloutColor;
  size: KbnCalloutSize;
  /** Overrides the variant's default notification icon. */
  iconType?: IconType;
}

/** The leading icon: a custom `iconType` when given, otherwise the variant's notification icon. */
export const CalloutIcon: FC<CalloutIconProps> = ({ color, size, iconType }) => {
  const styles = useEuiMemoizedStyles(calloutStyles);
  const iconStyles = useEuiMemoizedStyles(notificationIconStyles);
  const { stripeColor } = useCalloutColors(color);

  if (iconType) {
    return (
      <EuiIcon
        css={[styles.icon, size === 'm' && iconStyles.size.l]}
        type={iconType}
        color={stripeColor}
        size={size === 's' ? 'm' : 'l'}
        aria-hidden="true"
      />
    );
  }

  return (
    <KbnNotificationIcon
      css={styles.icon}
      type={COLOR_TO_NOTIFICATION_ICON[color]}
      size={size === 's' ? 'm' : 'l'}
    />
  );
};
