/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as yamlParse } from 'yaml';
import { CreateFieldDefinitionInputSchema } from '../../../../common/types/domain/field_definition/v1';
import { INTERNAL_FIELD_DEFINITIONS_URL } from '../../../../common/constants';
import { createCaseError } from '../../../common/error';
import { createCasesRoute } from '../create_cases_route';
import { DEFAULT_CASES_ROUTE_SECURITY } from '../constants';

/**
 * POST /internal/cases/field-definitions
 * Create a new reusable field definition
 */
export const postFieldDefinitionRoute = createCasesRoute({
  method: 'post',
  path: INTERNAL_FIELD_DEFINITIONS_URL,
  security: DEFAULT_CASES_ROUTE_SECURITY,
  routerOptions: {
    access: 'internal',
    summary: 'Create a new reusable field definition',
  },
  handler: async ({ context, request, response }) => {
    try {
      const caseContext = await context.cases;
      const casesClient = await caseContext.getCasesClient();

      const input = CreateFieldDefinitionInputSchema.parse(request.body);

      // Validate that the definition YAML is valid
      try {
        yamlParse(input.definition);
      } catch (yamlError) {
        return response.badRequest({
          body: { message: `Invalid YAML definition: ${yamlError}` },
        });
      }

      const fieldDef = await casesClient.fieldDefinitions.createFieldDefinition(input);

      return response.ok({ body: fieldDef.attributes });
    } catch (error) {
      throw createCaseError({
        message: `Failed to create field definition: ${error}`,
        error,
      });
    }
  },
});
