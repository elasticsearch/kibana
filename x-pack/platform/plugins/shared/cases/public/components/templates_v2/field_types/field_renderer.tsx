/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useMemo, useRef } from 'react';
import type { z } from '@kbn/zod/v4';
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { useEuiTheme } from '@elastic/eui';
import type { ParsedTemplateDefinitionSchema } from '../../../../common/types/domain/template/latest';
import type { InlineField } from '../../../../common/types/domain/template/fields';
import { CASE_EXTENDED_FIELDS } from '../../../../common/constants';
import { controlRegistry } from './field_types_registry';
import { evaluateCondition } from '../../../../common/types/domain/template/evaluate_conditions';
import { useYamlFormSync } from './hooks/use_yaml_form_sync';
import { getFieldSnakeKey } from '../../../../common/utils';
import { getYamlDefaultAsString } from '../utils';
import { useResolvedFields } from '../../field_library/hooks/use_resolved_fields';
import { useCasesContext } from '../../cases_context/use_cases_context';

type ParsedTemplateDefinition = z.infer<typeof ParsedTemplateDefinitionSchema>;

export interface TemplateFieldRendererProps {
  parsedTemplate: ParsedTemplateDefinition;
  owner?: string;
  onFieldDefaultChange?: (fieldName: string, value: string, control: string) => void;
}

export const FieldsRenderer: FC<{
  resolvedFields: InlineField[];
  onFieldConfirm?: () => void;
}> = ({ resolvedFields, onFieldConfirm }) => {
  const { euiTheme } = useEuiTheme();
  const { control } = useFormContext();

  const fieldTypeMap = useMemo(
    () => Object.fromEntries(resolvedFields.map((f) => [f.name, f.type])),
    [resolvedFields]
  );

  const fieldControlMap = useMemo(
    () => Object.fromEntries(resolvedFields.map((f) => [f.name, f.control])),
    [resolvedFields]
  );

  const allFieldPaths = useMemo(
    () => resolvedFields.map((f) => `${CASE_EXTENDED_FIELDS}.${getFieldSnakeKey(f.name, f.type)}`),
    [resolvedFields]
  );

  const watchedValues = useWatch({ control, name: allFieldPaths });

  const fieldValues = useMemo(() => {
    return Object.fromEntries(resolvedFields.map((f, i) => [f.name, watchedValues?.[i]]));
  }, [watchedValues, resolvedFields]);

  return (
    <>
      {resolvedFields.map((field) => {
        if (field.display?.show_when) {
          const shouldShow = evaluateCondition(
            field.display.show_when,
            fieldValues,
            fieldTypeMap,
            fieldControlMap
          );
          if (!shouldShow) return null;
        }

        const isRequired =
          field.validation?.required === true ||
          (field.validation?.required_when
            ? evaluateCondition(
                field.validation.required_when,
                fieldValues,
                fieldTypeMap,
                fieldControlMap
              )
            : false);

        const Control = controlRegistry[field.control] as unknown as FC<Record<string, unknown>>;
        if (!Control) return null;

        const controlProps = {
          ...field,
          label: field.label ?? field.name,
          value: fieldValues[field.name],
          isRequired,
          patternValidation: field.validation?.pattern,
          min: field.validation?.min,
          max: field.validation?.max,
          minLength: field.validation?.min_length,
          maxLength: field.validation?.max_length,
          onConfirm: onFieldConfirm,
        };

        return (
          <div
            key={field.name}
            data-test-subj={`template-field-${field.name}`}
            css={{ marginBottom: euiTheme.size.m }}
          >
            <Control {...controlProps} />
          </div>
        );
      })}
    </>
  );
};

FieldsRenderer.displayName = 'FieldsRenderer';

const TemplateFieldRendererInner: FC<{
  resolvedFields: InlineField[];
  parsedTemplate: ParsedTemplateDefinition;
  onFieldDefaultChange?: (fieldName: string, value: string, control: string) => void;
}> = ({ resolvedFields, parsedTemplate, onFieldDefaultChange }) => {
  const initialDefaultValues = React.useMemo(() => {
    const defaults: Record<string, Record<string, string>> = {
      [CASE_EXTENDED_FIELDS]: {},
    };
    for (const field of resolvedFields) {
      const yamlDefault = getYamlDefaultAsString(field.metadata?.default);
      const fieldKey = getFieldSnakeKey(field.name, field.type);
      defaults[CASE_EXTENDED_FIELDS][fieldKey] = yamlDefault;
    }
    return defaults;
  }, [resolvedFields]);

  const form = useForm({
    defaultValues: initialDefaultValues,
  });

  useYamlFormSync(form, resolvedFields, onFieldDefaultChange);

  return (
    <FormProvider key={parsedTemplate.name} {...form}>
      <FieldsRenderer resolvedFields={resolvedFields} />
    </FormProvider>
  );
};

TemplateFieldRendererInner.displayName = 'TemplateFieldRendererInner';

/**
 * Renders extended fields inside the template YAML editor preview. Owns its
 * own RHF form and bidirectionally syncs with the YAML defaults via
 * useYamlFormSync.
 */
export const TemplateFieldRenderer: FC<TemplateFieldRendererProps> = ({
  parsedTemplate,
  owner,
  onFieldDefaultChange,
}) => {
  const { owner: contextOwner } = useCasesContext();
  const resolvedOwner = owner ?? contextOwner[0];
  const { resolvedFields, isLoading } = useResolvedFields(parsedTemplate.fields, resolvedOwner);

  // Content-based key to detect real field definition changes (vs same-content re-parses).
  const fieldsKey = useMemo(
    () => resolvedFields.map((f) => JSON.stringify(f)).join('|'),
    [resolvedFields]
  );

  // Stabilize the resolvedFields reference — only update when content actually changes.
  // This prevents useYamlFormSync effects from re-running when identical YAML is re-parsed
  // into a new object reference (e.g. on every keystroke in the YAML editor).
  const stableResolvedFieldsRef = useRef(resolvedFields);
  const prevFieldsKeyRef = useRef(fieldsKey);
  if (prevFieldsKeyRef.current !== fieldsKey) {
    prevFieldsKeyRef.current = fieldsKey;
    stableResolvedFieldsRef.current = resolvedFields;
  }

  if (isLoading) return null;

  return (
    <TemplateFieldRendererInner
      key={fieldsKey}
      resolvedFields={stableResolvedFieldsRef.current}
      parsedTemplate={parsedTemplate}
      onFieldDefaultChange={onFieldDefaultChange}
    />
  );
};

TemplateFieldRenderer.displayName = 'TemplateFieldRenderer';
