/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { parse as parseYaml } from 'yaml';
import { useFormContext, useFormData } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import type { ParsedTemplate } from '../../../common/types/domain/template/v1';
import { CASE_EXTENDED_FIELDS } from '../../../common/constants';
import { useGetTemplate } from '../templates_v2/hooks/use_get_template';
import { useParentTemplateDefinition } from '../templates_v2/hooks/use_parent_template_definition';
import { mergeTemplateDefinitions } from '../templates_v2/utils/merge_template_definitions';
import { getFieldSnakeKey } from '../../../common/utils';
import { getYamlDefaultAsString } from '../templates_v2/utils';
import {
  FieldSchema,
  isInlineField,
  isRefField,
} from '../../../common/types/domain/template/fields';
import type { InlineField } from '../../../common/types/domain/template/fields';
import { useGetFieldDefinitions } from '../field_library/hooks/use_get_field_definitions';

interface UseTemplateFormSyncReturn {
  template: ParsedTemplate | undefined;
  isLoading: boolean;
}

/**
 * Syncs the selected template into the create-case form.
 *
 * - Standard case fields (title, description, tags, severity, category) are
 *   written to the parent form (`@kbn/es-ui-shared-plugin` form_lib).
 * - Extended (template-defined) fields are written to the inner react-hook-form
 *   instance owned by `CreateCaseTemplateFields` and mirrored back to the
 *   parent's `extendedFields` field by that component.
 * - `globalFieldKeys` contains the snake_case keys of `isGlobal` field
 *   definitions; their values are preserved across template changes and resets.
 */
export const useTemplateFormSync = (
  innerForm: UseFormReturn,
  globalFieldKeys: ReadonlySet<string>
): UseTemplateFormSyncReturn => {
  const { setFieldValue } = useFormContext();
  const [{ templateId }] = useFormData<{ templateId?: string }>({ watch: ['templateId'] });
  const { data: template, isLoading: isTemplateLoading } = useGetTemplate(templateId || undefined);
  // A disabled query (no templateId) can sit in "loading" state indefinitely in react-query v4;
  // treat it as not-loading so the create form renders global fields without a template selected.
  const isLoading = Boolean(templateId) && isTemplateLoading;
  const { data: fieldDefsData, isLoading: isLoadingFieldDefs } = useGetFieldDefinitions({
    owner: template?.owner,
  });
  const { definition: parentDefinition, isFetched: parentFetched } = useParentTemplateDefinition(
    template?.definition?.extends
  );
  const appliedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!templateId) {
      if (appliedRef.current) {
        appliedRef.current = undefined;
        setFieldValue('description', '');
        setFieldValue('tags', []);
        setFieldValue('severity', 'low');
        setFieldValue('category', null);

        // Clear template-specific extended-field values but preserve global field values.
        const current =
          (innerForm.getValues() as Record<string, Record<string, unknown>>)?.[
            CASE_EXTENDED_FIELDS
          ] ?? {};
        const preserved = Object.fromEntries(
          Object.entries(current).filter(([k]) => globalFieldKeys.has(k))
        );
        innerForm.reset({ [CASE_EXTENDED_FIELDS]: preserved });
      }
      return;
    }

    if (!template || template.templateId !== templateId) {
      return;
    }

    const { definition } = template;
    const parentId = definition.extends;
    // Wait until the parent query settles (success or error) before applying.
    // parentFetched is false only while the query is in-flight; once it resolves
    // (even as a 404/error), we proceed — possibly without parent fields.
    if (parentId && !parentFetched) {
      return;
    }
    const key = `${template.templateId}:${template.templateVersion}:${parentId ?? ''}:${String(
      parentFetched
    )}`;
    if (appliedRef.current === key) {
      return;
    }

    const fieldMappings: Array<[string, unknown]> = [
      ['title', definition.name],
      ['description', definition.description],
      ['tags', definition.tags?.length ? definition.tags : undefined],
      ['severity', definition.severity],
      ['category', definition.category],
    ];

    for (const [fieldName, value] of fieldMappings) {
      if (value !== undefined) {
        setFieldValue(fieldName, value);
      }
    }

    // Wait for field definitions to load before applying extended field defaults.
    // Do NOT set appliedRef.current yet — the effect must re-run once defs are available.
    if (isLoadingFieldDefs) return;

    // Merge parent fields (if `extends` is set) with the template's own fields
    const effectiveDefinition = parentDefinition
      ? mergeTemplateDefinitions(parentDefinition, definition)
      : definition;

    // Resolve all fields — inline fields pass through, ref fields are looked up in the library
    const libraryDefs = fieldDefsData?.fieldDefinitions ?? [];
    const resolvedFields = (effectiveDefinition.fields ?? []).flatMap((field): InlineField[] => {
      if (isInlineField(field)) return [field];
      const fd = libraryDefs.find((d) => d.name === field.$ref);
      if (!fd) return [];
      try {
        const parsed = parseYaml(fd.definition);
        const result = FieldSchema.safeParse(parsed);
        if (!result.success || isRefField(result.data)) return [];
        const inlineField = result.data as InlineField;
        return [
          field.name && field.name !== inlineField.name
            ? { ...inlineField, name: field.name }
            : inlineField,
        ];
      } catch {
        return [];
      }
    });

    const nextExtended: Record<string, string> = {};
    for (const field of resolvedFields) {
      nextExtended[getFieldSnakeKey(field.name, field.type)] = getYamlDefaultAsString(
        field.metadata?.default
      );
    }
    // Preserve current values for global fields when template changes.
    const current =
      (innerForm.getValues() as Record<string, Record<string, unknown>>)?.[CASE_EXTENDED_FIELDS] ??
      {};
    const preserved = Object.fromEntries(
      Object.entries(current).filter(([k]) => globalFieldKeys.has(k))
    );
    innerForm.reset({ [CASE_EXTENDED_FIELDS]: { ...nextExtended, ...preserved } });
    appliedRef.current = key;
  }, [
    templateId,
    template,
    parentDefinition,
    parentFetched,
    setFieldValue,
    innerForm,
    fieldDefsData,
    isLoadingFieldDefs,
    globalFieldKeys,
  ]);

  return { template, isLoading };
};
