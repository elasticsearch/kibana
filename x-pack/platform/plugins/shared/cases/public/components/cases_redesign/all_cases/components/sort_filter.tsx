/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiSelect } from '@elastic/eui';
import * as i18n from '../translations';

type SortOrder = 'asc' | 'desc';

interface SortFilterProps {
  sortOrder: SortOrder;
  onChange: (sortOrder: SortOrder) => void;
}

const options = [
  { value: 'desc', text: i18n.SORT_NEWEST_FIRST },
  { value: 'asc', text: i18n.SORT_OLDEST_FIRST },
];

export const SortFilter: React.FC<SortFilterProps> = ({ sortOrder, onChange }) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChange(e.target.value as SortOrder);
    },
    [onChange]
  );

  return (
    <EuiSelect
      data-test-subj="cases-list-sort-select"
      options={options}
      value={sortOrder}
      onChange={handleChange}
    />
  );
};

SortFilter.displayName = 'SortFilter';
