/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { EuiFlyout, EuiFlyoutBody } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import type { Props as FrameInformationWindowProps } from '.';
import { FrameInformationWindow } from '.';

interface Props extends FrameInformationWindowProps {
  onClose: () => void;
}

export function FrameInformationTooltip({ onClose, ...props }: Props) {
  return (
    <EuiFlyout
      onClose={onClose}
      size="m"
      aria-label={i18n.translate('xpack.profiling.frameInformationTooltip.flyoutAriaLabel', {
        defaultMessage: 'Frame information',
      })}
    >
      <EuiFlyoutBody>
        <FrameInformationWindow {...props} />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
}
