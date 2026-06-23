/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';

import { EuiFilterButton, EuiPopover } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { SeriesConfig, SeriesUrl } from '../../types';
import { useFilterValues } from '../use_filter_values';
import { FilterValuesList } from '../components/filter_values_list';

export interface FilterProps {
  seriesId: number;
  series: SeriesUrl;
  label: string;
  field: string;
  isNegated?: boolean;
  nestedField?: string;
  baseFilters: SeriesConfig['baseFilters'];
}

export interface NestedFilterOpen {
  value: string;
  negate: boolean;
}

export function FilterExpanded(props: FilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [query, setQuery] = useState('');

  const { values, loading } = useFilterValues(props, query);

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.exploratoryView.filterExpanded.popoverAriaLabel', {
        defaultMessage: 'Filter options',
      })}
      button={
        <EuiFilterButton
          onClick={() => setIsOpen((prevState) => !prevState)}
          iconType="chevronSingleDown"
          isSelected={isOpen}
        >
          {props.label}
        </EuiFilterButton>
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
    >
      <FilterValuesList
        {...props}
        setQuery={setQuery}
        query={query}
        values={values}
        loading={loading}
      />
    </EuiPopover>
  );
}
