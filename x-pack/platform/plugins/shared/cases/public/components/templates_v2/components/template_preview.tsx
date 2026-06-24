/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useRef } from 'react';
import { EuiHorizontalRule, EuiText, EuiSpacer } from '@elastic/eui';
import { useFormContext, useWatch } from 'react-hook-form';
import { parse as parseYaml } from 'yaml';
import type { z } from '@kbn/zod/v4';
import { ParsedTemplateDefinitionSchema } from '../../../../common/types/domain/template/v1';
import { TemplateFieldRenderer } from '../field_types/field_renderer';
import { TemplateMetadataPreview } from './template_metadata_preview';
import * as i18n from '../translations';

type ParsedTemplateDefinition = z.infer<typeof ParsedTemplateDefinitionSchema>;

interface TemplatePreviewProps {
  onFieldDefaultChange?: (fieldName: string, value: string, control: string) => void;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({ onFieldDefaultChange }) => {
  const { control } = useFormContext();
  const values = useWatch({ control, defaultValue: { definition: '' } });

  // Store the last valid parsed template
  const lastValidTemplateRef = useRef<ParsedTemplateDefinition | null>(null);

  const parsedTemplate = useMemo(() => {
    try {
      if (!values.definition || values.definition.trim() === '') {
        return {
          success: false,
          data: undefined,
          error: {
            message: 'Template definition is empty',
          },
        } as const;
      }

      const parsedDefinition = parseYaml(values.definition);

      if (!parsedDefinition || typeof parsedDefinition !== 'object') {
        return {
          success: false,
          data: undefined,
          error: {
            message: 'Invalid YAML: parsed to null or non-object',
          },
        } as const;
      }

      return ParsedTemplateDefinitionSchema.safeParse(parsedDefinition);
    } catch (error: unknown) {
      if (error instanceof Error) {
        return {
          success: false,
          data: undefined,
          error: {
            message: error?.message,
          },
        } as const;
      }

      return {
        success: false,
        data: undefined,
        error: {
          message: 'Unknown error occurred during template parse phase',
        },
      } as const;
    }
  }, [values.definition]);

  if (parsedTemplate.success && parsedTemplate.data) {
    lastValidTemplateRef.current = parsedTemplate.data;
  }

  // Use last valid template if current parsing failed
  const parsedTemplateData = parsedTemplate.success
    ? parsedTemplate.data
    : lastValidTemplateRef.current;

  if (!parsedTemplateData) {
    return null;
  }

  return (
    <div>
      <TemplateMetadataPreview parsedTemplate={parsedTemplateData} />

      {parsedTemplateData.fields.length > 0 && (
        <>
          <EuiHorizontalRule margin="m" />
          <EuiText size="xs" color="subdued">
            <strong>{i18n.TEMPLATE_FIELDS_LABEL}</strong>
          </EuiText>
          <EuiSpacer size="s" />
          <TemplateFieldRenderer
            parsedTemplate={parsedTemplateData}
            onFieldDefaultChange={onFieldDefaultChange}
          />
        </>
      )}
    </div>
  );
};

TemplatePreview.displayName = 'TemplatePreview';
