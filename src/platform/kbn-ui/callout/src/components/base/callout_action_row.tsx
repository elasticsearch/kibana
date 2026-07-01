/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEuiMemoizedStyles } from '@elastic/eui';
import type { FC } from 'react';
import React from 'react';
import { calloutStyles } from './styles/callout.styles';
import type { KbnCalloutColor, KbnCalloutProps } from './base_callout';
import { CalloutActionButton } from './callout_action';

interface CalloutActionRowProps {
  color: KbnCalloutColor;
  actions: KbnCalloutProps['actions'];
}

/** The action row. A secondary action only renders alongside a primary one. */
export const CalloutActionRow: FC<CalloutActionRowProps> = ({ color, actions }) => {
  const styles = useEuiMemoizedStyles(calloutStyles);

  if (!actions?.primary) {
    return null;
  }

  return (
    <div css={styles.actions}>
      <CalloutActionButton action={actions.primary} emphasis="primary" color={color} />
      {actions.secondary && (
        <CalloutActionButton action={actions.secondary} emphasis="secondary" color={color} />
      )}
    </div>
  );
};
