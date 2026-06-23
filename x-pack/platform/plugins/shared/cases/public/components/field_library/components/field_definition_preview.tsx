/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useMemo } from 'react';
import { EuiText } from '@elastic/eui';
import { parse as parseYaml } from 'yaml';
import { FormProvider, useForm } from 'react-hook-form';
import type { InlineField } from '../../../../common/types/domain/template/fields';
import { FieldSchema, isInlineField } from '../../../../common/types/domain/template/fields';
import { CASE_EXTENDED_FIELDS } from '../../../../common/constants';
import { getFieldSnakeKey } from '../../../../common/utils';
import { getYamlDefaultAsString } from '../../templates_v2/utils';
import { FieldsRenderer } from '../../templates_v2/field_types/field_renderer';
import { useYamlFormSync } from '../../templates_v2/field_types/hooks/use_yaml_form_sync';
import * as i18n from '../translations';

interface FieldDefinitionPreviewInnerProps {
  parsedField: InlineField;
  onDefaultChange: (fieldName: string, value: string, control: string) => void;
}

const FieldDefinitionPreviewInner: FC<FieldDefinitionPreviewInnerProps> = ({
  parsedField,
  onDefaultChange,
}) => {
  const fields = useMemo(() => [parsedField], [parsedField]);

  const initialDefaultValues = useMemo(() => {
    const yamlDefault = getYamlDefaultAsString(parsedField.metadata?.default);
    const fieldKey = getFieldSnakeKey(parsedField.name, parsedField.type);
    return { [CASE_EXTENDED_FIELDS]: { [fieldKey]: yamlDefault } };
  }, [parsedField]);

  const form = useForm<{}>({
    defaultValues: initialDefaultValues,
  });

  useYamlFormSync(form, fields, onDefaultChange);

  return (
    <FormProvider {...form}>
      <FieldsRenderer resolvedFields={fields} />
    </FormProvider>
  );
};

FieldDefinitionPreviewInner.displayName = 'FieldDefinitionPreviewInner';

interface FieldDefinitionPreviewProps {
  definition: string;
  onDefaultChange: (fieldName: string, value: string, control: string) => void;
}

export const FieldDefinitionPreview: FC<FieldDefinitionPreviewProps> = ({
  definition,
  onDefaultChange,
}) => {
  const parsedField = useMemo<InlineField | null>(() => {
    if (!definition.trim()) return null;
    try {
      const parsed = parseYaml(definition) as unknown;
      const result = FieldSchema.safeParse(parsed);
      if (result.success && isInlineField(result.data)) return result.data;
    } catch {
      // fall through to return null
    }
    return null;
  }, [definition]);

  if (!parsedField) {
    return (
      <EuiText color="subdued" size="s">
        <p>{i18n.FIELD_DEFINITION_PREVIEW_PLACEHOLDER}</p>
      </EuiText>
    );
  }

  return (
    <FieldDefinitionPreviewInner
      key={`${parsedField.name}:${parsedField.type}:${parsedField.control}`}
      parsedField={parsedField}
      onDefaultChange={onDefaultChange}
    />
  );
};

FieldDefinitionPreview.displayName = 'FieldDefinitionPreview';
