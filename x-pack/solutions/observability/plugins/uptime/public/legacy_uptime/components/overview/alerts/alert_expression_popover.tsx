/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { EuiExpression, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

interface AlertExpressionPopoverProps {
  'aria-label': string;
  content: React.ReactElement;
  description: string;
  'data-test-subj': string;
  isEnabled?: boolean;
  id: string;
  value: string | JSX.Element;
  isInvalid?: boolean;
}

const getColor = (
  isOpen: boolean,
  isEnabled?: boolean,
  isInvalid?: boolean
): 'primary' | 'success' | 'subdued' | 'danger' => {
  if (isInvalid === true) return 'danger';
  if (isEnabled === false) return 'subdued';
  return isOpen ? 'primary' : 'success';
};

export const AlertExpressionPopover: React.FC<AlertExpressionPopoverProps> = ({
  'aria-label': ariaLabel,
  content,
  'data-test-subj': dataTestSubj,
  description,
  isEnabled,
  isInvalid,
  id,
  value,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.uptime.alertExpressionPopover.popoverAriaLabel', {
        defaultMessage: 'Alert expression details',
      })}
      id={id}
      anchorPosition="downLeft"
      button={
        <EuiExpression
          aria-label={ariaLabel}
          color={getColor(isOpen, isEnabled, isInvalid)}
          data-test-subj={dataTestSubj}
          description={description}
          isActive={isOpen}
          onClick={isEnabled ? () => setIsOpen(!isOpen) : undefined}
          value={value}
        />
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
    >
      {content}
    </EuiPopover>
  );
};
