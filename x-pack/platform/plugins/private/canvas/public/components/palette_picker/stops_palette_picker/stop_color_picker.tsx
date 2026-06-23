/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonIcon,
  EuiColorPicker,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { FC } from 'react';
import React, { useEffect, useState } from 'react';
import useDebounce from 'react-use/lib/useDebounce';
import type { ColorStop } from '../types';

interface Props {
  removable?: boolean;
  stop?: number;
  color?: string;
  onDelete: () => void;
  onChange: (colorStop: ColorStop) => void;
}

interface ValidationResult {
  color: boolean;
  stop: boolean;
}

const strings = {
  getDeleteStopColorLabel: () =>
    i18n.translate('xpack.canvas.stopsColorPicker.deleteColorStopLabel', {
      defaultMessage: 'Delete',
    }),
};

const isValidColorStop = (colorStop: ColorStop): ValidationResult & { valid: boolean } => {
  const valid = !isNaN(colorStop.stop);
  return {
    valid,
    stop: valid,
    color: true,
  };
};

export const StopColorPicker: FC<Props> = (props) => {
  const { stop, color, onDelete, onChange, removable = true } = props;

  const [colorStop, setColorStop] = useState<ColorStop>({ stop: stop ?? 0, color: color ?? '' });
  const [areValidFields, setAreValidFields] = useState<ValidationResult>({
    stop: true,
    color: true,
  });

  const onChangeInput = (updatedColorStop: ColorStop) => {
    setColorStop(updatedColorStop);
  };

  const [, cancel] = useDebounce(
    () => {
      if (color === colorStop.color && stop === colorStop.stop) {
        return;
      }

      const { valid, ...validationResult } = isValidColorStop(colorStop);
      if (!valid) {
        setAreValidFields(validationResult);
        return;
      }

      onChange(colorStop);
    },
    150,
    [colorStop]
  );

  useEffect(() => {
    const newColorStop = { stop: stop ?? 0, color: color ?? '' };
    setColorStop(newColorStop);

    const { valid, ...validationResult } = isValidColorStop(newColorStop);
    setAreValidFields(validationResult);
  }, [color, stop]);

  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return (
    <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
      <EuiFlexItem>
        <EuiFieldNumber
          compressed
          value={colorStop.stop}
          min={-Infinity}
          onChange={({ target: { valueAsNumber } }) =>
            onChangeInput({ ...colorStop, stop: valueAsNumber })
          }
          isInvalid={!areValidFields.stop}
        />
      </EuiFlexItem>

      <EuiFlexItem>
        <EuiColorPicker
          secondaryInputDisplay="top"
          color={colorStop.color}
          showAlpha
          compressed
          onChange={(newColor) => {
            onChangeInput({ ...colorStop, color: newColor });
          }}
          isInvalid={!areValidFields.color}
        />
      </EuiFlexItem>

      <EuiFlexItem grow={false}>
        <EuiToolTip content={strings.getDeleteStopColorLabel()} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="trash"
            color="danger"
            onClick={onDelete}
            isDisabled={!removable}
            aria-label={strings.getDeleteStopColorLabel()}
          />
        </EuiToolTip>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
