/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButtonIcon, EuiToolTip, useEuiMemoizedStyles } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { FC } from 'react';
import React from 'react';
import type { KbnCalloutColor } from './base_callout';
import { calloutStyles } from './styles/callout.styles';

interface CalloutDismissProps {
  color: KbnCalloutColor;
  onDismiss?: () => void;
}

/** Absolutely-positioned dismiss (X) button. Renders nothing without `onDismiss`. */
export const CalloutDismiss: FC<CalloutDismissProps> = ({ color, onDismiss }) => {
  const styles = useEuiMemoizedStyles(calloutStyles);

  if (!onDismiss) {
    return null;
  }

  const dismissAriaLabel = i18n.translate('kbnUI.callout.dismissButtonAriaLabel', {
    defaultMessage: 'Dismiss this callout',
  });

  return (
    <EuiToolTip
      content={dismissAriaLabel}
      disableScreenReaderOutput
      anchorProps={{ css: styles.dismissButton }}
    >
      <EuiButtonIcon
        data-test-subj="kbnCalloutDismissButton"
        aria-label={dismissAriaLabel}
        iconType="cross"
        color={color}
        size="xs"
        onClick={onDismiss}
      />
    </EuiToolTip>
  );
};
