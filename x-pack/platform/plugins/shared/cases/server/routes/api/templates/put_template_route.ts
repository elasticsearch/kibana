/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { parse as yamlParse } from 'yaml';
import {
  UpdateTemplateInputSchema,
  ParsedTemplateDefinitionSchema,
} from '../../../../common/types/domain/template/v1';
import { INTERNAL_TEMPLATE_DETAILS_URL } from '../../../../common/constants';
import { createCaseError } from '../../../common/error';
import { createCasesRoute } from '../create_cases_route';
import { DEFAULT_CASES_ROUTE_SECURITY } from '../constants';
import { parseTemplate } from './parse_template';

/**
 * PUT /internal/cases/templates/{template_id}
 * Full update of a template (creates a new version)
 */
export const putTemplateRoute = createCasesRoute({
  method: 'put',
  path: INTERNAL_TEMPLATE_DETAILS_URL,
  security: DEFAULT_CASES_ROUTE_SECURITY,
  routerOptions: {
    access: 'internal',
    summary: 'Update a case template (full replacement)',
  },
  params: {
    params: schema.object({
      template_id: schema.string(),
    }),
  },
  handler: async ({ context, request, response }) => {
    try {
      const caseContext = await context.cases;
      const casesClient = await caseContext.getCasesClient();

      const { template_id: templateId } = request.params;
      const input = UpdateTemplateInputSchema.parse(request.body);

      const existingTemplate = await casesClient.templates.getTemplate(templateId);

      if (!existingTemplate) {
        return response.notFound({
          body: { message: `Template with id ${templateId} not found` },
        });
      }

      // Validate YAML definition
      let parsedYaml: unknown;
      try {
        parsedYaml = yamlParse(input.definition);
      } catch (yamlError) {
        return response.badRequest({
          body: { message: `Invalid YAML definition: ${yamlError}` },
        });
      }

      // Validate parsed definition against the field schema
      const definitionResult = ParsedTemplateDefinitionSchema.safeParse(parsedYaml);
      if (!definitionResult.success) {
        return response.badRequest({
          body: {
            message: `Invalid template definition: ${JSON.stringify(
              definitionResult.error.issues
            )}`,
          },
        });
      }

      const updatedTemplate = await casesClient.templates.updateTemplate(templateId, input);
      const parsedTemplate = parseTemplate(updatedTemplate.attributes);

      return response.ok({
        body: parsedTemplate,
      });
    } catch (error) {
      throw createCaseError({
        message: `Failed to update template: ${error}`,
        error,
      });
    }
  },
});
