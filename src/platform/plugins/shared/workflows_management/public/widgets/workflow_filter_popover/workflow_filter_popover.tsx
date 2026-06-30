/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiSelectableOption } from '@elastic/eui';
import {
  EuiFilterButton,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelectable,
  useGeneratedHtmlId,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';

const WORKFLOW_POPOVER_WIDTH = 215;

type WorkflowFilterValue = string | number | boolean;

interface WorkflowFilterPopoverProps {
  filter: string;
  title: string;
  selectedValues: WorkflowFilterValue[];
  values: EuiSelectableOption[];
  singleSelection?: boolean;
  onSelectedValuesChanged: (newValues: WorkflowFilterValue[]) => void;
}

const normalizeFilterValue = (value: EuiSelectableOption['key'] | WorkflowFilterValue): string =>
  String(value);

const getSelectableOptions = ({
  values,
  selectedValues,
}: {
  values: EuiSelectableOption[];
  selectedValues: WorkflowFilterValue[];
}): EuiSelectableOption[] => {
  const selectedValuesMap = new Map(
    selectedValues.map((value) => [normalizeFilterValue(value), value])
  );
  const optionKeys = new Set<string>();

  const options = values.map(({ label, key }): EuiSelectableOption => {
    const optionKey = key ?? label;
    const normalizedOptionKey = normalizeFilterValue(optionKey);
    optionKeys.add(normalizedOptionKey);

    return {
      label: label ?? normalizedOptionKey,
      key: normalizedOptionKey,
      checked: selectedValuesMap.has(normalizedOptionKey) ? 'on' : undefined,
    };
  });

  const selectedOptionsMissingFromValues = selectedValues
    .filter((value) => !optionKeys.has(normalizeFilterValue(value)))
    .map((value): EuiSelectableOption => {
      const normalizedValue = normalizeFilterValue(value);
      return {
        label: normalizedValue,
        key: normalizedValue,
        checked: 'on',
      };
    });

  return [...options, ...selectedOptionsMissingFromValues];
};

const WorkflowsFilterPopoverComponent = ({
  filter,
  title,
  values,
  selectedValues,
  singleSelection = false,
  onSelectedValuesChanged,
}: WorkflowFilterPopoverProps) => {
  const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
  const popoverTitleId = useGeneratedHtmlId();
  const [selectableOptions, setSelectableOptions] = useState<EuiSelectableOption[]>(() =>
    getSelectableOptions({ values, selectedValues })
  );

  const handleSelectableOptionsChange = (newOptions: EuiSelectableOption[]) => {
    onSelectedValuesChanged(
      newOptions
        .map(({ key, checked }): WorkflowFilterValue | null => (checked ? key ?? null : null))
        .filter((value): value is WorkflowFilterValue => value !== null)
    );
  };

  useEffect(() => {
    setSelectableOptions(getSelectableOptions({ values, selectedValues }));
  }, [values, selectedValues]);

  const triggerButton = (
    <EuiFilterButton
      grow
      iconType="chevronSingleDown"
      onClick={() => setIsFilterPopoverOpen(!isFilterPopoverOpen)}
      numFilters={values.length}
      isSelected={isFilterPopoverOpen}
      hasActiveFilters={selectedValues.length > 0}
      numActiveFilters={selectedValues.length}
      data-test-subj={`${filter}-filter-popover-button`}
    >
      {title}
    </EuiFilterButton>
  );

  return (
    <EuiPopover
      ownFocus
      aria-labelledby={popoverTitleId}
      button={triggerButton}
      isOpen={isFilterPopoverOpen}
      closePopover={() => setIsFilterPopoverOpen(!isFilterPopoverOpen)}
      panelPaddingSize="none"
      repositionOnScroll
      panelProps={{
        'data-test-subj': `${filter}-filter-popover`,
      }}
    >
      <EuiSelectable
        searchProps={{
          placeholder: 'Search',
        }}
        aria-label="Search"
        options={selectableOptions}
        onChange={handleSelectableOptionsChange}
        singleSelection={singleSelection}
        emptyMessage="No items available"
        noMatchesMessage="No items available"
      >
        {(list, search) => (
          <div css={{ width: WORKFLOW_POPOVER_WIDTH }}>
            <EuiPopoverTitle id={popoverTitleId}>{search}</EuiPopoverTitle>
            {list}
          </div>
        )}
      </EuiSelectable>
    </EuiPopover>
  );
};

WorkflowsFilterPopoverComponent.displayName = 'WorkflowsFilterPopoverComponent';

export const WorkflowsFilterPopover = React.memo(WorkflowsFilterPopoverComponent);

WorkflowsFilterPopover.displayName = 'WorkflowsFilterPopover';
