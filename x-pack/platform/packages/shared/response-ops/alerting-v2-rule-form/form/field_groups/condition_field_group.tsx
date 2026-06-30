/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiSpacer, EuiFormRow, EuiCodeBlock } from '@elastic/eui';
import { useFormContext, useWatch } from 'react-hook-form';
import type { FormValues } from '../types';
import { getBreachQuery } from '../utils/query_helpers';
import { FieldGroup } from './field_group';
import { EvaluationQueryField } from '../fields/evaluation_query_field';
import { GroupFieldSelect } from '../fields/group_field_select';
import { TimeFieldSelect } from '../fields/time_field_select';

interface ConditionFieldGroupProps {
  /**
   * Whether to include the editable base query field.
   * When true, shows an editable ES|QL editor for the base query.
   * When false, shows the base query as read-only (if available).
   */
  includeBase?: boolean;
  /** Override the default "Group Fields" label on the group-by selector. */
  groupFieldLabel?: string;
}

/**
 * Condition field group for configuring alert trigger conditions.
 *
 * This component displays:
 * - An editable ES|QL query editor (when includeBase is true) OR a read-only view of the base query
 *
 * The full ES|QL query defines what data is being evaluated, including any
 * trigger condition (e.g. a trailing WHERE clause).
 */
export const ConditionFieldGroup = ({
  includeBase = false,
  groupFieldLabel,
}: ConditionFieldGroupProps) => {
  const { control } = useFormContext<FormValues>();

  // Read the breach query from form state (initialized via useFormDefaults)
  const query = useWatch({ control, name: 'query' });
  const baseQuery = getBreachQuery(query);

  return (
    <FieldGroup
      title={i18n.translate('xpack.alertingV2.ruleForm.condition', {
        defaultMessage: 'Rule evaluation',
      })}
    >
      {includeBase ? (
        // Editable base query
        <>
          <EvaluationQueryField />
          <EuiSpacer size="m" />
        </>
      ) : (
        // Read-only base query (only show if there's a query to display)
        baseQuery && (
          <>
            <EuiFormRow
              label={i18n.translate('xpack.alertingV2.ruleForm.baseQueryLabel', {
                defaultMessage: 'Base query',
              })}
              fullWidth
            >
              <EuiCodeBlock language="esql" fontSize="m" paddingSize="m" isCopyable>
                {baseQuery}
              </EuiCodeBlock>
            </EuiFormRow>
            <EuiSpacer size="m" />
          </>
        )
      )}

      <GroupFieldSelect label={groupFieldLabel} />
      <TimeFieldSelect />
    </FieldGroup>
  );
};
