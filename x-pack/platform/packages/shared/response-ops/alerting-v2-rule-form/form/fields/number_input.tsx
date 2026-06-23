/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { EuiFieldNumber } from '@elastic/eui';
import { POSITIVE_INTEGER_REGEX, INVALID_NUMBER_KEYS } from '../utils';

export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Return false to reject the parsed value before it reaches onChange. */
  validate?: (value: number) => boolean;
  isInvalid?: boolean;
  fullWidth?: boolean;
  min?: number;
  max?: number;
  step?: number;
  prepend?: string | React.ReactElement | Array<string | React.ReactElement>;
  compressed?: boolean;
  'data-test-subj'?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
}

/**
 * A positive-integer number input with local display state.
 *
 * Manages a local string value so the user can freely clear and retype.
 * The parent onChange is only called when the input is a valid positive integer
 * (and passes the optional validate check).
 * On blur, an empty or invalid value restores the last valid value.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, validate, compressed, ...rest }, ref) => {
    const [localValue, setLocalValue] = useState<string>(String(value));

    useEffect(() => {
      setLocalValue(String(value));
    }, [value]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.trim();
        setLocalValue(val);
        if (POSITIVE_INTEGER_REGEX.test(val)) {
          const parsed = parseInt(val, 10);
          if (!validate || validate(parsed)) {
            onChange(parsed);
          }
        }
      },
      [onChange, validate]
    );

    const handleBlur = useCallback(() => {
      if (!POSITIVE_INTEGER_REGEX.test(localValue)) {
        setLocalValue(String(value));
      }
    }, [localValue, value]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (INVALID_NUMBER_KEYS.includes(e.key)) {
        e.preventDefault();
      }
    }, []);

    return (
      <EuiFieldNumber
        {...rest}
        compressed={compressed}
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        inputRef={ref}
      />
    );
  }
);
