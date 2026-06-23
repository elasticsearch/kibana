/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { parse as yamlParse } from 'yaml';
import {
  PatchTemplateInputSchema,
  ParsedTemplateDefinitionSchema,
} from '../../../../common/types/domain/template/v1';
import { INTERNAL_TEMPLATE_DETAILS_URL } from '../../../../common/constants';
import { createCaseError } from '../../../common/error';
import { createCasesRoute } from '../create_cases_route';
import { DEFAULT_CASES_ROUTE_SECURITY } from '../constants';
import { parseTemplate } from './parse_template';

/**
 * PATCH /internal/cases/templates/{template_id}
 * Partial update of a template (creates a new version)
 */
export const patchTemplateRoute = createCasesRoute({
  method: 'patch',
  path: INTERNAL_TEMPLATE_DETAILS_URL,
  security: DEFAULT_CASES_ROUTE_SECURITY,
  routerOptions: {
    access: 'internal',
    summary: 'Partially update a case template',
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
      const input = PatchTemplateInputSchema.parse(request.body);

      const existingTemplate = await casesClient.templates.getTemplate(templateId);

      if (!existingTemplate) {
        return response.notFound({
          body: { message: `Template with id ${templateId} not found` },
        });
      }

      // Validate YAML definition if provided
      if (input.definition) {
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
      }

      const updatedTemplate = await casesClient.templates.updateTemplate(templateId, {
        owner: input.owner ?? existingTemplate.attributes.owner,
        definition: input.definition ?? existingTemplate.attributes.definition,
        isEnabled: input.isEnabled ?? existingTemplate.attributes.isEnabled,
      });

      const parsedTemplate = parseTemplate(updatedTemplate.attributes);

      return response.ok({
        body: parsedTemplate,
      });
    } catch (error) {
      throw createCaseError({
        message: `Failed to patch template: ${error}`,
        error,
      });
    }
  },
});
