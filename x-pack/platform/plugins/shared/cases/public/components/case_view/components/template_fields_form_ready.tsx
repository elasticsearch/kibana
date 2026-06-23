/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FieldValues } from 'react-hook-form';
import { FormProvider, useForm } from 'react-hook-form';
import type { InlineField } from '../../../../common/types/domain/template/fields';
import { CASE_EXTENDED_FIELDS } from '../../../../common/constants';
import { getFieldCamelKey, getFieldSnakeKey } from '../../../../common/utils';
import { FieldsRenderer } from '../../templates_v2/field_types/field_renderer';
import type { OnUpdateFields } from '../types';

export const EMPTY_EXTENDED_FIELDS: Record<string, unknown> = {};

export const TemplateFieldsFormReady: FC<{
  resolvedFields: InlineField[];
  extendedFields: Record<string, unknown>;
  onUpdateField: (args: OnUpdateFields) => void;
}> = ({ resolvedFields, extendedFields, onUpdateField }) => {
  const initialDefaultValues = useMemo<FieldValues>(() => {
    const inner: Record<string, unknown> = {};
    for (const field of resolvedFields) {
      const snakeKey = getFieldSnakeKey(field.name, field.type);
      const camelKey = getFieldCamelKey(field.name, field.type);
      inner[snakeKey] = extendedFields[camelKey] ?? '';
    }
    return { [CASE_EXTENDED_FIELDS]: inner };
  }, [resolvedFields, extendedFields]);

  const form = useForm<FieldValues>({
    defaultValues: initialDefaultValues,
    mode: 'onBlur',
  });

  // Reset to fresh defaults whenever the underlying case data changes — e.g.
  // after a successful save the parent re-renders with new extendedFields.
  useEffect(() => {
    form.reset(initialDefaultValues);
  }, [initialDefaultValues, form]);

  const inflightRef = useRef(false);

  const releaseLock = useCallback(() => {
    inflightRef.current = false;
  }, []);

  const persist = useCallback(async () => {
    if (inflightRef.current) return;
    // Claim the lock synchronously before awaiting so a second invocation
    // can't race past the guard above.
    inflightRef.current = true;
    const isValid = await form.trigger().catch(() => false);
    if (!isValid) {
      releaseLock();
      return;
    }
    const values =
      (form.getValues() as Record<string, Record<string, unknown>>)?.[CASE_EXTENDED_FIELDS] ?? {};
    onUpdateField({
      key: CASE_EXTENDED_FIELDS,
      value: values,
      onSuccess: releaseLock,
      onError: releaseLock,
    });
  }, [form, onUpdateField, releaseLock]);

  return (
    <FormProvider {...form}>
      <div data-test-subj="template-fields-form">
        <FieldsRenderer resolvedFields={resolvedFields} onFieldConfirm={persist} />
      </div>
    </FormProvider>
  );
};

TemplateFieldsFormReady.displayName = 'TemplateFieldsFormReady';
