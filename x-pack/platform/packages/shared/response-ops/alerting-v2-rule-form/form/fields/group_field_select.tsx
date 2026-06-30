/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { EuiComboBox, EuiFormRow } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { FormValues } from '../types';
import { getBreachQuery } from '../utils/query_helpers';
import { useQueryColumns, type QueryColumn } from '../hooks/use_query_columns';
import { getGroupByColumnsFromQuery } from '../hooks/use_default_group_by';
import { useRuleFormServices, useRuleFormMeta } from '../contexts';

interface GroupFieldSelectProps {
  /** Override the default "Group Fields" label. */
  label?: string;
}

export const GroupFieldSelect = ({ label: labelOverride }: GroupFieldSelectProps = {}) => {
  const { data } = useRuleFormServices();
  const { layout } = useRuleFormMeta();
  const { control, setValue, getValues } = useFormContext<FormValues>();
  const ruleQuery = useWatch({ name: 'query', control });
  const query = getBreachQuery(ruleQuery);
  const groupByRowId = 'ruleV2FormGroupByField';

  // Auto-populate group fields from the STATS ... BY clause whenever the
  // parsed BY columns change. Watches `query` directly
  // Skips the initial mount — useFormDefaults handles that.
  const prevByColumnsRef = useRef<string[] | null>(null);
  useEffect(() => {
    const byColumns = getGroupByColumnsFromQuery(query);
    if (prevByColumnsRef.current === null) {
      prevByColumnsRef.current = byColumns;
      return;
    }
    if (JSON.stringify(byColumns) !== JSON.stringify(prevByColumnsRef.current)) {
      prevByColumnsRef.current = byColumns;
      setValue('grouping.fields', byColumns);
    }
  }, [query, setValue]);

  // Validates existing group field selections against actual columns returned
  // by the query. Strips any fields that no longer exist in the column list.
  const handleColumnsSuccess = useCallback(
    (cols: QueryColumn[]) => {
      const validNames = new Set(cols.map((c) => c.name));
      const currentFields = getValues('grouping.fields') ?? [];
      if (currentFields.length > 0 && validNames.size > 0) {
        const validFields = currentFields.filter((val) => validNames.has(val));
        if (validFields.length !== currentFields.length) {
          setValue('grouping.fields', validFields);
        }
      }
    },
    [getValues, setValue]
  );

  const { data: columns, isLoading } = useQueryColumns({
    query,
    search: data.search.search,
    onSuccess: handleColumnsSuccess,
  });

  const options = useMemo(
    () => columns.map((col) => ({ label: col.name, value: col.name })),
    [columns]
  );

  return (
    <Controller
      name="grouping.fields"
      control={control}
      render={({ field, fieldState: { error } }) => {
        const selectedOptions = (field.value ?? []).map((val) => ({ label: val }));

        return (
          <EuiFormRow
            id={groupByRowId}
            label={
              labelOverride ??
              i18n.translate('xpack.alertingV2.ruleForm.groupingKeyLabel', {
                defaultMessage: 'Group Fields',
              })
            }
            labelAppend={i18n.translate('xpack.alertingV2.ruleForm.groupingKeyOptional', {
              defaultMessage: 'optional',
            })}
            isInvalid={!!error}
            error={error?.message}
            fullWidth
          >
            <EuiComboBox
              id={groupByRowId}
              options={options}
              selectedOptions={selectedOptions}
              onChange={(selected) => field.onChange(selected.map(({ label }) => label))}
              onCreateOption={(searchValue) => {
                field.onChange([...(field.value ?? []), searchValue]);
              }}
              isClearable={true}
              isInvalid={!!error}
              isLoading={isLoading}
              fullWidth
              compressed={layout === 'flyout'}
            />
          </EuiFormRow>
        );
      }}
    />
  );
};
