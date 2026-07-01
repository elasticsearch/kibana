/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButton, EuiButtonEmpty } from '@elastic/eui';
import type { FC, MouseEventHandler, ReactNode } from 'react';
import React from 'react';
import type { KbnCalloutColor } from './base_callout';

/**
 * A callout action. Deliberately minimal — the variant owns the button's color,
 * size, and emphasis so callouts stay visually consistent.
 */
export interface KbnCalloutAction {
  /** Button label. */
  label: ReactNode;
  /** (optional) Click handler. */
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  /** (optional) Renders the action as a link to this href. */
  href?: string;
  /** (optional) Disables the action. */
  isDisabled?: boolean;
  /** (optional) `data-test-subj` attribute. */
  'data-test-subj'?: string;
}

interface CalloutActionButtonProps {
  action: KbnCalloutAction;
  emphasis: 'primary' | 'secondary';
  color: KbnCalloutColor;
}

/** Renders a {@link KbnCalloutAction}. Primary uses a filled button, secondary an empty one. */
export const CalloutActionButton: FC<CalloutActionButtonProps> = ({ action, emphasis, color }) => {
  const { label, onClick, href, isDisabled, 'data-test-subj': dataTestSubj } = action;
  const linkProps = href ? { href } : { onClick };

  if (emphasis === 'primary') {
    return (
      <EuiButton
        size="s"
        color={color}
        isDisabled={isDisabled}
        data-test-subj={dataTestSubj}
        {...linkProps}
      >
        {label}
      </EuiButton>
    );
  }

  return (
    <EuiButtonEmpty
      size="s"
      color={color}
      isDisabled={isDisabled}
      data-test-subj={dataTestSubj}
      {...linkProps}
    >
      {label}
    </EuiButtonEmpty>
  );
};
