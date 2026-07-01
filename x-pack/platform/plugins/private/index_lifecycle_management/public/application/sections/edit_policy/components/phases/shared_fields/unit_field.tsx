/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React, { useState } from 'react';
import { EuiPopover, EuiButtonEmpty, EuiSelectable, type EuiButtonEmptyProps } from '@elastic/eui';
import { UseField } from '../../../form';

interface Props {
  path: string;
  buttonColor?: EuiButtonEmptyProps['color'];
  euiFieldProps?: Record<string, any>;
  options: Array<{
    value: string;
    text: string;
  }>;
}

export const UnitField: FunctionComponent<Props> = ({
  path,
  buttonColor = 'text',
  options,
  euiFieldProps,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <UseField key={path} path={path}>
      {(field) => {
        const onSelect = (option: string) => {
          field.setValue(option);
          setOpen(false);
        };

        return (
          <EuiPopover
            button={
              <EuiButtonEmpty
                size="xs"
                color={buttonColor}
                iconSide="right"
                iconType="chevronSingleDown"
                onClick={() => setOpen((x) => !x)}
                data-test-subj="show-filters-button"
              >
                {options.find((x) => x.value === field.value)?.text ?? `${field.value}`}
              </EuiButtonEmpty>
            }
            ownFocus
            panelPaddingSize="s"
            isOpen={open}
            closePopover={() => setOpen(false)}
            {...euiFieldProps}
          >
            <EuiSelectable
              singleSelection="always"
              listProps={{
                onFocusBadge: false,
                style: {
                  minWidth: 130,
                },
              }}
              options={options.map((item) => ({
                key: item.value,
                label: item.text,
                checked: field.value === item.value ? 'on' : undefined,
                'data-test-subj': `filter-option-${item.value}`,
              }))}
              onChange={(newOptions, event, changedOption) => {
                if (changedOption) {
                  onSelect(changedOption.key);
                }
              }}
            >
              {(list) => list}
            </EuiSelectable>
          </EuiPopover>
        );
      }}
    </UseField>
  );
};
