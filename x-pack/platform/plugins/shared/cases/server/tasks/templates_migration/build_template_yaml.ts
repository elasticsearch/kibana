/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stringify as stringifyYaml } from 'yaml';
import type { Logger } from '@kbn/core/server';
import type { CaseCustomField } from '../../../common/types/domain/custom_field/v1';
import { CustomFieldTypes } from '../../../common/types/domain/custom_field/v1';

interface LegacyCaseFields {
  description?: string;
  severity?: string;
  tags?: string[];
  category?: string | null;
  customFields?: CaseCustomField[];
}

interface LegacyTemplate {
  key: string;
  name: string;
  description?: string;
  tags?: string[];
  caseFields?: LegacyCaseFields | null;
}

/**
 * Builds a YAML string for a ParsedTemplateDefinitionSchema from a legacy template configuration.
 * Custom fields are represented as $ref entries pointing at field-definition names.
 * Any custom field key not found in `refNamesByKey` is omitted with a warning.
 */
export const buildTemplateYaml = (
  legacy: LegacyTemplate,
  refNamesByKey: Map<string, string>,
  logger?: Logger
): string => {
  const { name, description, tags, caseFields } = legacy;

  const templateDef: Record<string, unknown> = { name };

  const resolvedDescription = description ?? caseFields?.description;
  if (resolvedDescription) {
    templateDef.description = resolvedDescription;
  }

  const resolvedTags = tags?.length ? tags : caseFields?.tags?.length ? caseFields.tags : undefined;
  if (resolvedTags) {
    templateDef.tags = resolvedTags;
  }

  if (caseFields?.severity) {
    templateDef.severity = caseFields.severity;
  }

  if (caseFields?.category !== undefined) {
    templateDef.category = caseFields.category;
  }

  const fields: Array<Record<string, unknown>> = (caseFields?.customFields ?? []).flatMap((cf) => {
    const refName = refNamesByKey.get(cf.key);
    if (!refName) {
      logger?.warn(
        `buildTemplateYaml: skipping custom field key "${cf.key}" for template "${name}" — no matching field definition`
      );
      return [];
    }

    const refEntry: Record<string, unknown> = { $ref: refName };

    if (cf.value !== null && cf.value !== undefined) {
      if (cf.type === CustomFieldTypes.TEXT || cf.type === CustomFieldTypes.NUMBER) {
        refEntry.metadata = { default: cf.value };
      } else if (cf.type === CustomFieldTypes.TOGGLE) {
        refEntry.metadata = { default: String(cf.value) };
      }
    }

    return [refEntry];
  });

  templateDef.fields = fields;

  return stringifyYaml(templateDef, { lineWidth: 0 });
};
