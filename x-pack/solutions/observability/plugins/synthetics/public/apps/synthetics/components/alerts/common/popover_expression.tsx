/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { useState } from 'react';
import type { EuiExpressionProps } from '@elastic/eui';
import { EuiExpression, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

interface Props {
  title?: ReactNode;
  value: ReactNode;
  children?: ReactNode;
  color?: EuiExpressionProps['color'];
  disabled?: boolean;
}

export function PopoverExpression(props: Props) {
  const { title, value, children, color, disabled } = props;
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <EuiPopover
      isOpen={!disabled && popoverOpen}
      anchorPosition="downLeft"
      closePopover={() => setPopoverOpen(false)}
      button={
        <EuiExpression
          description={title}
          value={value}
          isActive={!disabled && popoverOpen}
          color={disabled ? 'subdued' : color}
          {...(disabled ? {} : { onClick: () => setPopoverOpen((state) => !state) })}
        />
      }
      repositionOnScroll
      aria-label={i18n.translate('xpack.synthetics.popoverExpression.popoverAriaLabel', {
        defaultMessage: 'Popover expression options',
      })}
    >
      {children}
    </EuiPopover>
  );
}
