/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiButtonIcon, EuiToolTip, type EuiButtonIconProps } from '@elastic/eui';
import React from 'react';
import { SHOW_MORE_ACTIONS } from './translations';

interface ExtraActionsButtonProps {
  onClick: () => void;
  showTooltip: boolean;
  extraActionsIconType?: EuiButtonIconProps['iconType'];
  extraActionsColor?: EuiButtonIconProps['color'];
}

export const ExtraActionsButton: React.FC<ExtraActionsButtonProps> = ({
  onClick,
  showTooltip,
  extraActionsIconType,
  extraActionsColor,
}) => {
  return showTooltip ? (
    <EuiToolTip content={SHOW_MORE_ACTIONS} disableScreenReaderOutput>
      <EuiButtonIcon
        data-test-subj="showExtraActionsButton"
        aria-label={SHOW_MORE_ACTIONS}
        iconType={extraActionsIconType ?? 'boxesVertical'}
        color={extraActionsColor}
        onClick={onClick}
      />
    </EuiToolTip>
  ) : (
    <EuiToolTip content={SHOW_MORE_ACTIONS} disableScreenReaderOutput>
      <EuiButtonIcon
        data-test-subj="showExtraActionsButton"
        aria-label={SHOW_MORE_ACTIONS}
        iconType={extraActionsIconType ?? 'boxesVertical'}
        color={extraActionsColor}
        onClick={onClick}
      />
    </EuiToolTip>
  );
};
