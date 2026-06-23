/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { omit } from 'lodash';

import type { CasesColumnSelection } from '../types';

import { LOCAL_STORAGE_KEYS } from '../../../../../common/constants';
import type { CasesColumnsConfiguration } from '../../../all_cases/use_cases_columns_configuration';
import { useCasesColumnsConfiguration } from '../../../all_cases/use_cases_columns_configuration';
import { mergeSelectedColumnsWithConfiguration } from '../../../all_cases/utils/merge_selected_columns_with_configuration';
import { useCasesLocalStorage } from '../../../../common/use_cases_local_storage';
import { LIST_ALWAYS_VISIBLE_FIELDS } from '../constants';

const getListFieldsConfiguration = (
  casesColumnsConfig: CasesColumnsConfiguration
): CasesColumnsConfiguration => omit(casesColumnsConfig, LIST_ALWAYS_VISIBLE_FIELDS);

export function useListFieldsSelection() {
  const casesColumnsConfig = useCasesColumnsConfiguration();
  const listFieldsConfig = useMemo(
    () => getListFieldsConfiguration(casesColumnsConfig),
    [casesColumnsConfig]
  );

  const [selectedFields, setSelectedFields] = useCasesLocalStorage<CasesColumnSelection[]>(
    LOCAL_STORAGE_KEYS.casesListFields,
    []
  );

  const mergedFields = useMemo(() => {
    const fields = selectedFields || [];
    const storedFieldKeys = new Set(fields.map(({ field }) => field));

    const merged = mergeSelectedColumnsWithConfiguration({
      selectedColumns: fields,
      casesColumnsConfig: listFieldsConfig,
    });

    // Fields already in localStorage keep their checked state; newly added fields default to unchecked.
    const withDefaults = merged.map((column) =>
      storedFieldKeys.has(column.field) ? column : { ...column, isChecked: false }
    );

    return withDefaults;
  }, [selectedFields, listFieldsConfig]);

  return {
    selectedFields: mergedFields,
    setSelectedFields,
  };
}
