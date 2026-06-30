/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiSelectableOption } from '@elastic/eui';
import { EuiFilterButton, EuiPanel, EuiPopover, EuiSelectable } from '@elastic/eui';
import { css } from '@emotion/react';
import { useBoolean } from '@kbn/react-hooks';

const selectableListCss = css`
  width: 200px;
`;

interface FilterPopoverProps {
  label: string;
  ariaLabel: string;
  options: EuiSelectableOption[];
  numFilters: number;
  numActiveFilters: number;
  onChange: (options: EuiSelectableOption[]) => void;
}

export const FilterPopover = ({
  label,
  ariaLabel,
  options,
  numFilters,
  numActiveFilters,
  onChange,
}: FilterPopoverProps) => {
  const [isOpen, { off: close, toggle }] = useBoolean(false);

  return (
    <EuiPopover
      aria-label={ariaLabel}
      button={
        <EuiFilterButton
          iconType="arrowDown"
          onClick={toggle}
          isSelected={isOpen}
          numFilters={numFilters}
          hasActiveFilters={numActiveFilters > 0}
          numActiveFilters={numActiveFilters}
        >
          {label}
        </EuiFilterButton>
      }
      isOpen={isOpen}
      closePopover={close}
      panelPaddingSize="none"
    >
      <EuiSelectable options={options} onChange={onChange}>
        {(list) => (
          <EuiPanel paddingSize="none" css={selectableListCss}>
            {list}
          </EuiPanel>
        )}
      </EuiSelectable>
    </EuiPopover>
  );
};
