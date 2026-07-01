/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import { z } from '@kbn/zod/v4';
import { FieldSchema } from '../../../../common/types/domain/template/fields';
import { TemplateSettingsSchema } from '../../../../common/types/domain/template/v1';
import { CaseConnectorWithoutNameSchema } from '../../../../common/types/domain_zod/connector/v1';
import { MAX_TEMPLATES_PER_FILE, MAX_TOTAL_IMPORT_TEMPLATES } from '../constants';
import { checkTemplateExists } from '../utils';
import type { ValidatedFile } from './use_validate_yaml';
import * as i18n from '../translations';

const ImportedDefinitionSchema = z.object({
  fields: z.array(FieldSchema).refine(
    (fields) => {
      const fieldNames = new Set(fields.map((field) => field.name));
      return fieldNames.size === fields.length;
    },
    { message: 'Field names must be unique.' }
  ),
});

const ImportedTemplateSchema = z.object({
  templateId: z.string().optional(),
  name: z.string().min(1),
  owner: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).nullable().optional(),
  severity: z.string().optional(),
  category: z.string().nullable().optional(),
  connector: CaseConnectorWithoutNameSchema.optional(),
  settings: TemplateSettingsSchema.optional(),
  author: z.string().optional(),
  templateVersion: z.number().optional(),
  isDefault: z.boolean().optional(),
  definition: ImportedDefinitionSchema.optional(),
});

type ImportedTemplate = z.infer<typeof ImportedTemplateSchema>;

export interface ParsedTemplateEntry {
  templateId?: string;
  name: string;
  owner?: string;
  description?: string;
  tags?: string[];
  severity?: string;
  category?: string | null;
  connector?: ImportedTemplate['connector'];
  settings?: ImportedTemplate['settings'];
  author?: string;
  definition?: ImportedTemplate['definition'];
  sourceFileName: string;
  documentIndex: number;
  existsOnServer: boolean;
}

export interface ParseYamlError {
  fileName: string;
  documentIndex: number;
  message: string;
}

export interface ParseYamlResult {
  templates: ParsedTemplateEntry[];
  errors: ParseYamlError[];
}

export const useParseYaml = () => {
  const parseFiles = useCallback(
    async (validatedFiles: ValidatedFile[]): Promise<ParseYamlResult> => {
      const templates: ParsedTemplateEntry[] = [];
      const errors: ParseYamlError[] = [];

      for (const { file, documents } of validatedFiles) {
        if (documents.length > MAX_TEMPLATES_PER_FILE) {
          errors.push({
            fileName: file.name,
            documentIndex: -1,
            message: i18n.TOO_MANY_TEMPLATES_IN_FILE(file.name, MAX_TEMPLATES_PER_FILE),
          });
        }

        const docsToProcess = documents.slice(0, MAX_TEMPLATES_PER_FILE);

        for (let idx = 0; idx < docsToProcess.length; idx++) {
          const doc = docsToProcess[idx];
          const result = ImportedTemplateSchema.safeParse(doc);

          if (result.success) {
            templates.push({
              templateId: result.data.templateId,
              name: result.data.name,
              owner: result.data.owner,
              description: result.data.description,
              tags: result.data.tags ?? undefined,
              severity: result.data.severity,
              category: result.data.category,
              connector: result.data.connector,
              settings: result.data.settings,
              author: result.data.author,
              definition: result.data.definition,
              sourceFileName: file.name,
              documentIndex: idx,
              existsOnServer: false,
            });
          } else {
            const issues = result.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ');

            errors.push({
              fileName: file.name,
              documentIndex: idx,
              message: i18n.TEMPLATE_VALIDATION_ERROR(file.name, idx + 1, issues),
            });
          }
        }
      }

      if (templates.length > MAX_TOTAL_IMPORT_TEMPLATES) {
        errors.push({
          fileName: '',
          documentIndex: -1,
          message: i18n.TOO_MANY_TEMPLATES_TOTAL(MAX_TOTAL_IMPORT_TEMPLATES),
        });
        templates.length = MAX_TOTAL_IMPORT_TEMPLATES;
      }

      const templatesWithIds = templates.filter(
        (t): t is ParsedTemplateEntry & { templateId: string } => t.templateId != null
      );

      if (templatesWithIds.length > 0) {
        const existenceChecks = await Promise.allSettled(
          templatesWithIds.map((t) => checkTemplateExists(t.templateId))
        );

        for (let idx = 0; idx < templatesWithIds.length; idx++) {
          const check = existenceChecks[idx];
          templatesWithIds[idx].existsOnServer =
            check.status === 'fulfilled' && check.value === true;
        }
      }

      return { templates, errors };
    },
    []
  );

  return { parseFiles };
};
