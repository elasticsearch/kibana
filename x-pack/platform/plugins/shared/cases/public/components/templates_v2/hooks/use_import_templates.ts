/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useState } from 'react';
import { stringify as yamlDump } from 'yaml';
import { useQueryClient } from '@kbn/react-query';
import { postTemplate, patchTemplate } from '../api/api';
import { casesQueriesKeys } from '../../../containers/constants';
import { MAX_TOTAL_IMPORT_TEMPLATES } from '../constants';
import { useCasesToast } from '../../../common/use_cases_toast';
import * as i18n from '../translations';
import type { ParsedTemplateEntry } from './use_parse_yaml';

interface ImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ templateName: string; error: string }>;
}

const buildDefinitionYaml = (template: ParsedTemplateEntry): string => {
  const definition: Record<string, unknown> = {
    name: template.name,
  };

  if (template.description) {
    definition.description = template.description;
  }
  if (template.tags && template.tags.length > 0) {
    definition.tags = template.tags;
  }
  if (template.severity) {
    definition.severity = template.severity;
  }
  if (template.category != null) {
    definition.category = template.category;
  }
  if (template.definition?.fields) {
    definition.fields = template.definition.fields;
  }

  return yamlDump(definition, { lineWidth: 0 });
};

export const useImportTemplates = () => {
  const queryClient = useQueryClient();
  const { showErrorToast, showSuccessToast } = useCasesToast();
  const [isImporting, setIsImporting] = useState(false);

  const importTemplates = useCallback(
    async (templates: ParsedTemplateEntry[]): Promise<ImportResult> => {
      setIsImporting(true);
      const result: ImportResult = { created: 0, updated: 0, failed: 0, errors: [] };

      try {
        const toImport = templates.slice(0, MAX_TOTAL_IMPORT_TEMPLATES);

        const promises = toImport.map(async (template) => {
          const definitionYaml = buildDefinitionYaml(template);

          if (template.existsOnServer && template.templateId) {
            return patchTemplate({
              templateId: template.templateId,
              template: {
                definition: definitionYaml,
                owner: template.owner,
                description: template.description,
                tags: template.tags ?? undefined,
                author: template.author,
              },
            });
          }

          return postTemplate({
            template: {
              definition: definitionYaml,
              owner: template.owner ?? 'securitySolution',
              description: template.description,
              tags: template.tags ?? undefined,
              author: template.author,
            },
          });
        });

        const outcomes = await Promise.allSettled(promises);

        for (let idx = 0; idx < outcomes.length; idx++) {
          const outcome = outcomes[idx];
          const template = toImport[idx];

          if (outcome.status === 'fulfilled') {
            if (template.existsOnServer) {
              result.updated++;
            } else {
              result.created++;
            }
          } else {
            result.failed++;
            result.errors.push({
              templateName: template.name,
              error: outcome.reason?.body?.message ?? outcome.reason?.message ?? 'Unknown error',
            });
          }
        }

        queryClient.invalidateQueries(casesQueriesKeys.templates);

        if (result.failed === 0) {
          showSuccessToast(i18n.SUCCESS_IMPORTING_TEMPLATES(result.created, result.updated));
        } else if (result.created + result.updated > 0) {
          showSuccessToast(
            i18n.IMPORT_PARTIAL_FAILURE(result.created + result.updated, result.failed)
          );
        } else {
          showErrorToast(new Error(i18n.ERROR_IMPORTING_TEMPLATES), {
            title: i18n.ERROR_IMPORTING_TEMPLATES,
          });
        }
      } finally {
        setIsImporting(false);
      }

      return result;
    },
    [queryClient, showErrorToast, showSuccessToast]
  );

  return { importTemplates, isImporting };
};
