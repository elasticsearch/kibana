/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { EuiButtonIcon, EuiFieldText, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import chroma from 'chroma-js';
import { i18n } from '@kbn/i18n';

import { ColorDot } from '../color_dot/color_dot';

const strings = {
  getAddAriaLabel: () =>
    i18n.translate('xpack.canvas.colorManager.addAriaLabel', {
      defaultMessage: 'Add Color',
    }),
  getCodePlaceholder: () =>
    i18n.translate('xpack.canvas.colorManager.codePlaceholder', {
      defaultMessage: 'Color code',
    }),
  getRemoveAriaLabel: () =>
    i18n.translate('xpack.canvas.colorManager.removeAriaLabel', {
      defaultMessage: 'Remove Color',
    }),
};

export interface Props {
  /**
   * Determines if the add/remove buttons are displayed.
   * @default false
   */
  hasButtons?: boolean;
  /** The function to call when the Add Color button is clicked. The button will be disabled if there is no handler. */
  onAddColor?: (value: string) => void;
  /** The function to call when the value is changed */
  onChange: (value: string) => void;
  /** The function to call when the Remove Color button is clicked. The button will be disabled if there is no handler. */
  onRemoveColor?: (value: string) => void;
  /**
   * The value of the color manager. Only honors valid CSS values.
   * @default ''
   */
  value?: string;
}

export const ColorManager: FC<Props> = ({
  hasButtons = false,
  onAddColor,
  onChange,
  onRemoveColor,
  value = '',
}) => {
  const validColor = chroma.valid(value);

  let buttons = null;

  if (hasButtons) {
    buttons = (
      <EuiFlexItem grow={false}>
        <EuiToolTip content={strings.getAddAriaLabel()} disableScreenReaderOutput>
          <EuiButtonIcon
            aria-label={strings.getAddAriaLabel()}
            iconType="plusCircle"
            isDisabled={!validColor || !onAddColor}
            onClick={() => onAddColor && onAddColor(value)}
          />
        </EuiToolTip>
        <EuiToolTip content={strings.getRemoveAriaLabel()} disableScreenReaderOutput>
          <EuiButtonIcon
            aria-label={strings.getRemoveAriaLabel()}
            iconType="minusCircle"
            isDisabled={!validColor || !onRemoveColor}
            onClick={() => onRemoveColor && onRemoveColor(value)}
          />
        </EuiToolTip>
      </EuiFlexItem>
    );
  }

  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center">
      <EuiFlexItem grow={false}>
        <ColorDot value={validColor ? value : undefined} />
      </EuiFlexItem>
      <EuiFlexItem css={{ display: 'inline-block' }}>
        {/* While the label indicates only hex values are honored, it can accept CSS values. */}
        <EuiFieldText
          value={value}
          isInvalid={!validColor && value.length > 0}
          placeholder={strings.getCodePlaceholder()}
          onChange={(e) => onChange(e.target.value)}
        />
      </EuiFlexItem>
      {buttons}
    </EuiFlexGroup>
  );
};
