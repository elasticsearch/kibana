/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { parse as parseYaml } from 'yaml';
import type { Field, InlineField } from '../../../../common/types/domain/template/fields';
import {
  FieldSchema,
  isInlineField,
  isRefField,
} from '../../../../common/types/domain/template/fields';
import { useGetFieldDefinitions } from './use_get_field_definitions';

/**
 * Resolves a list of template fields, substituting each `{ $ref }` entry with the
 * current definition from the field library. Inline fields are passed through unchanged.
 * Refs that cannot be resolved (unknown name, bad YAML, or not an inline field) are silently
 * dropped so the rest of the form still renders.
 */
export const useResolvedFields = (
  fields: Field[],
  owner?: string | string[]
): { resolvedFields: InlineField[]; isLoading: boolean } => {
  const { data, isLoading } = useGetFieldDefinitions({ owner });

  const resolvedFields = useMemo<InlineField[]>(() => {
    const fieldDefs = data?.fieldDefinitions ?? [];
    return fields.flatMap((field): InlineField[] => {
      if (isInlineField(field)) return [field];

      const fd = fieldDefs.find((d) => d.name === field.$ref);
      if (!fd) return [];

      try {
        const parsed = parseYaml(fd.definition);
        const result = FieldSchema.safeParse(parsed);
        if (!result.success || isRefField(result.data)) return [];

        let resolved = result.data as InlineField;

        if (field.name && field.name !== resolved.name) {
          resolved = { ...resolved, name: field.name };
        }

        const overrideDefault = field.metadata?.default;
        if (overrideDefault !== undefined) {
          resolved = {
            ...resolved,
            metadata: { ...(resolved.metadata ?? {}), default: overrideDefault },
          } as InlineField;
        }

        return [resolved];
      } catch {
        return [];
      }
    });
  }, [fields, data]);

  return { resolvedFields, isLoading };
};
