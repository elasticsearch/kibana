/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useContext, useEffect, useMemo, useRef } from 'react';
import { EuiSpacer, EuiTitle } from '@elastic/eui';
import { FormProvider, useForm } from 'react-hook-form';
import {
  UseField,
  useFormContext as useParentFormContext,
  useFormData,
} from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { HiddenField } from '@kbn/es-ui-shared-plugin/static/forms/components';
import { CASE_EXTENDED_FIELDS } from '../../../common/constants';
import { useCasesContext } from '../cases_context/use_cases_context';
import { useTemplateFormSync } from './use_template_form_sync';
import * as i18n from './translations';
import { FieldsRenderer } from '../templates_v2/field_types/field_renderer';
import { useResolvedFields } from '../field_library/hooks/use_resolved_fields';
import { useGetFieldDefinitions } from '../field_library/hooks/use_get_field_definitions';
import {
  buildExtendedFieldsDefaults,
  parseFieldDefinitionsToInlineFields,
  getFieldSnakeKey,
} from '../../../common/utils';
import { isRefField } from '../../../common/types/domain/template/fields';
import { TemplateFieldsValidationContext } from './template_fields_validation_context';

type FormShape = Record<string, Record<string, unknown>>;

export const CreateCaseTemplateFields: React.FC = () => {
  const parentForm = useParentFormContext();
  const [{ templateId }] = useFormData<{ templateId?: string }>({ watch: ['templateId'] });
  const { owner } = useCasesContext();
  // The create form is always rendered inside a single-solution CasesContext, so
  // owner is effectively a single-element array. Taking the first element is safe here.
  const ownerStr = Array.isArray(owner) ? owner[0] : owner;

  // Fetch isGlobal field definitions for this owner.
  // staleTime: Infinity — field definitions don't change during a user session, so we
  // prevent background refetches that would create a new Set object reference, re-run the
  // useTemplateFormSync effect, and unexpectedly reset the form.
  const { data: globalFieldDefsData, isLoading: isLoadingGlobalDefs } = useGetFieldDefinitions({
    owner: ownerStr,
    isGlobal: true,
    staleTime: Infinity,
  });

  // Resolve global field definitions to inline fields and compute their snake keys.
  // globalFieldKeys tracks ALL global fields for form-state preservation in useTemplateFormSync,
  // even those hidden because the active template already renders them via $ref.
  const { globalInlineFields, globalFieldKeys } = useMemo(() => {
    const defs = globalFieldDefsData?.fieldDefinitions ?? [];
    const inlineFields = parseFieldDefinitionsToInlineFields(defs);
    const keys = new Set(inlineFields.map((f) => getFieldSnakeKey(f.name, f.type)));
    return { globalInlineFields: inlineFields, globalFieldKeys: keys };
  }, [globalFieldDefsData]);

  const innerForm = useForm<FormShape>({
    defaultValues: { [CASE_EXTENDED_FIELDS]: {} },
  });

  // Mirror the inner RHF `extendedFields` slice into the parent form_lib field
  // on every change so the parent's submission picks up the latest values.
  // IMPORTANT: this effect must be registered before any effect that calls
  // innerForm.reset(), so that the watch callback is in place when those resets fire.
  useEffect(() => {
    const subscription = innerForm.watch((values) => {
      const slice = values?.[CASE_EXTENDED_FIELDS] ?? {};
      parentForm.setFieldValue(CASE_EXTENDED_FIELDS, slice);
    });
    return () => subscription.unsubscribe();
  }, [innerForm, parentForm]);

  // Apply global field defaults exactly once after definitions load. useTemplateFormSync
  // preserves these values when templates are selected/changed.
  const globalDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (globalDefaultsAppliedRef.current || isLoadingGlobalDefs) return;

    if (!globalInlineFields.length) return;
    globalDefaultsAppliedRef.current = true;

    const defaults = buildExtendedFieldsDefaults(globalInlineFields);

    // Merge with any values already in the form (e.g. from template sync that ran
    // before global defs finished loading) so neither overwrites the other.
    // Filter out empty-string entries: Controller components register with defaultValue=""
    // on mount, which would otherwise shadow the real YAML defaults via the spread.
    const current = (innerForm.getValues()?.[CASE_EXTENDED_FIELDS] ?? {}) as Record<
      string,
      unknown
    >;
    const preservedCurrent = Object.fromEntries(
      Object.entries(current).filter(([, v]) => v !== '' && v !== undefined)
    );
    innerForm.reset({ [CASE_EXTENDED_FIELDS]: { ...defaults, ...preservedCurrent } });
  }, [isLoadingGlobalDefs, globalInlineFields, innerForm]);

  const { template, isLoading } = useTemplateFormSync(innerForm, globalFieldKeys);

  // Fields referenced by the template via $ref are owned by the template section —
  // exclude them from the global section to avoid duplicate inputs.
  const templateRefNames = useMemo<ReadonlySet<string>>(
    () => new Set((template?.definition?.fields ?? []).filter(isRefField).map((f) => f.$ref)),
    [template]
  );

  const visibleGlobalInlineFields = useMemo(
    () => globalInlineFields.filter((f) => !templateRefNames.has(f.name)),
    [globalInlineFields, templateRefNames]
  );

  // Register the inner form's trigger with the validation context so the submit
  // button can run RHF Controller validation (pattern, required_when, etc.) before
  // the parent form-lib submits.
  const triggerRef = useContext(TemplateFieldsValidationContext);
  useEffect(() => {
    triggerRef.current = () => innerForm.trigger();
    return () => {
      triggerRef.current = null;
    };
  }, [innerForm, triggerRef]);

  const { resolvedFields: templateFields, isLoading: isLoadingFieldsRaw } = useResolvedFields(
    template?.definition?.fields ?? [],
    template?.owner
  );
  // A disabled query (no templateId) can sit in "loading" state indefinitely in react-query v4;
  // treat it as not-loading so the form renders global fields without a template selected.
  const isLoadingFields = Boolean(templateId) && isLoadingFieldsRaw;

  const globalFieldsFragment = useMemo(
    () =>
      visibleGlobalInlineFields.length ? (
        <FieldsRenderer resolvedFields={visibleGlobalInlineFields} />
      ) : null,
    [visibleGlobalInlineFields]
  );

  const templateFieldsFragment = useMemo(() => {
    if (!templateId || template?.definition?.fields === undefined) return null;
    if (!templateFields.length) return null;
    return <FieldsRenderer resolvedFields={templateFields} />;
  }, [templateId, template, templateFields]);

  if (isLoading || isLoadingFields || isLoadingGlobalDefs) {
    return <UseField path={CASE_EXTENDED_FIELDS} component={HiddenField} />;
  }

  if (
    !visibleGlobalInlineFields.length &&
    (!templateId || template?.definition?.fields === undefined)
  ) {
    return <UseField path={CASE_EXTENDED_FIELDS} component={HiddenField} />;
  }

  const hasFields = globalFieldsFragment !== null || templateFieldsFragment !== null;

  return (
    <>
      <UseField path={CASE_EXTENDED_FIELDS} component={HiddenField} />
      {hasFields && (
        <>
          <EuiSpacer />
          <EuiTitle size="s">
            <h4>{i18n.EXTENDED_FIELDS_TITLE}</h4>
          </EuiTitle>
          <EuiSpacer />
        </>
      )}
      <FormProvider {...innerForm}>
        {globalFieldsFragment}
        {globalFieldsFragment && templateFieldsFragment && <EuiSpacer />}
        {templateFieldsFragment}
      </FormProvider>
    </>
  );
};

CreateCaseTemplateFields.displayName = 'CreateCaseTemplateFields';
