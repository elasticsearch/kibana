/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FunctionComponent } from 'react';
import React, { useState } from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';

interface Props {
  label: string;
  confirmationText: string;
  onConfirm: () => void;
  disabled: boolean;
}

export const ConfirmButtonIcon: FunctionComponent<Props> = ({
  label,
  confirmationText,
  onConfirm,
  disabled,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  return showConfirm ? (
    <EuiToolTip content={confirmationText} disableScreenReaderOutput>
      <EuiButtonIcon
        disabled={disabled}
        aria-label={confirmationText}
        color="warning"
        iconType="warning"
        onClick={onConfirm}
      />
    </EuiToolTip>
  ) : (
    <EuiToolTip content={label} disableScreenReaderOutput>
      <EuiButtonIcon
        aria-label={label}
        disabled={disabled}
        color="danger"
        iconType="trash"
        onClick={(e: { stopPropagation: () => void }) => {
          e.stopPropagation();
          setShowConfirm(true);
          setTimeout(() => setShowConfirm(false), 3000);
        }}
      />
    </EuiToolTip>
  );
};
