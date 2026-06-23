/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import type { EuiSelectableOption } from '@elastic/eui';
import {
  EuiPopoverTitle,
  EuiFilterButton,
  EuiPopover,
  EuiIcon,
  EuiButtonEmpty,
  useGeneratedHtmlId,
} from '@elastic/eui';

import { EuiSelectable } from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import type { FilterProps } from '../columns/filter_expanded';
import { useAppDataViewContext } from '../../hooks/use_app_data_view';
import { FilterValuesList } from './filter_values_list';
import { useFilterValues } from '../use_filter_values';

export function LabelsFieldFilter(props: FilterProps) {
  const { series } = props;
  const labelsFilterPopoverTitleId = useGeneratedHtmlId();

  const [query, setQuery] = useState('');

  const { dataView } = useAppDataViewContext(series.dataType);

  const labelFields = dataView?.fields.filter((field) => field.name.startsWith('labels.'));

  const [isPopoverOpen, setPopover] = useState(false);

  const onButtonClick = () => {
    setPopover(!isPopoverOpen);
  };

  const button = (
    <EuiFilterButton
      iconType="chevronSingleDown"
      iconSide="right"
      isSelected={isPopoverOpen}
      onClick={onButtonClick}
    >
      {LABELS_LABEL}
    </EuiFilterButton>
  );

  const [selectedLabel, setSelectedLabel] = useState('');

  const { values, loading } = useFilterValues({ ...props, field: selectedLabel }, query);

  const labelFieldOptions: EuiSelectableOption[] = (labelFields ?? []).map((field) => {
    return {
      label: field.name,
      searchableLabel: field.name,
      append: <EuiIcon type="chevronSingleRight" aria-hidden={true} />,
      showIcons: false,
    };
  });

  labelFieldOptions.unshift({
    label: LABELS_FIELDS_LABEL,
    isGroupLabel: true,
  });

  const closePopover = () => {
    setPopover(false);
    setSelectedLabel('');
  };

  return (
    <EuiPopover
      aria-label={
        selectedLabel
          ? undefined
          : i18n.translate('xpack.exploratoryView.labelsFieldFilter.popoverAriaLabel', {
              defaultMessage: 'Select label field',
            })
      }
      aria-labelledby={selectedLabel ? labelsFilterPopoverTitleId : undefined}
      button={button}
      closePopover={closePopover}
      isOpen={isPopoverOpen}
    >
      {selectedLabel ? (
        <>
          <EuiPopoverTitle id={labelsFilterPopoverTitleId}>
            <EuiButtonEmpty
              data-test-subj="o11yLabelsFieldFilterButton"
              iconType="chevronSingleLeft"
              iconSide="left"
              onClick={() => setSelectedLabel('')}
            >
              {BACK_TO_LABEL}
            </EuiButtonEmpty>
          </EuiPopoverTitle>
          <FilterValuesList
            {...props}
            label={selectedLabel}
            values={values}
            query={query}
            setQuery={setQuery}
            loading={loading}
            field={selectedLabel}
          />
        </>
      ) : (
        <EuiSelectable
          searchable
          options={labelFieldOptions}
          onChange={(optionsChange) => {
            const checked = optionsChange.find((option) => option.checked === 'on');
            setSelectedLabel(checked?.label ?? '');
          }}
          listProps={{
            onFocusBadge: false,
          }}
          height={450}
        >
          {(list, search) => (
            <div style={{ width: 400 }}>
              {search}
              {list}
            </div>
          )}
        </EuiSelectable>
      )}
    </EuiPopover>
  );
}

const LABELS_LABEL = i18n.translate('xpack.exploratoryView.filters.expanded.labels.label', {
  defaultMessage: 'Labels',
});

const LABELS_FIELDS_LABEL = i18n.translate('xpack.exploratoryView.filters.expanded.labels.fields', {
  defaultMessage: 'Label fields',
});

const BACK_TO_LABEL = i18n.translate('xpack.exploratoryView.filters.expanded.labels.backTo', {
  defaultMessage: 'Back to labels',
});
