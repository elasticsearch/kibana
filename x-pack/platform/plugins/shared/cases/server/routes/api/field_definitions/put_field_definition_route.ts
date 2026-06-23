/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as yamlParse } from 'yaml';
import { UpdateFieldDefinitionInputSchema } from '../../../../common/types/domain/field_definition/v1';
import { INTERNAL_FIELD_DEFINITION_DETAILS_URL } from '../../../../common/constants';
import { createCaseError } from '../../../common/error';
import { createCasesRoute } from '../create_cases_route';
import { DEFAULT_CASES_ROUTE_SECURITY } from '../constants';

/**
 * PUT /internal/cases/field-definitions/{field_definition_id}
 * Update an existing reusable field definition
 */
export const putFieldDefinitionRoute = createCasesRoute({
  method: 'put',
  path: INTERNAL_FIELD_DEFINITION_DETAILS_URL,
  security: DEFAULT_CASES_ROUTE_SECURITY,
  routerOptions: {
    access: 'internal',
    summary: 'Update a reusable field definition',
  },
  handler: async ({ context, request, response }) => {
    try {
      const caseContext = await context.cases;
      const casesClient = await caseContext.getCasesClient();

      const { field_definition_id: fieldDefinitionId } = request.params as {
        field_definition_id: string;
      };

      const parseResult = UpdateFieldDefinitionInputSchema.safeParse(request.body);
      if (!parseResult.success) {
        return response.badRequest({ body: { message: parseResult.error.message } });
      }
      const input = parseResult.data;

      // Validate that the definition YAML is valid
      try {
        yamlParse(input.definition);
      } catch (yamlError) {
        return response.badRequest({
          body: { message: `Invalid YAML definition: ${yamlError}` },
        });
      }

      const updated = await casesClient.fieldDefinitions.updateFieldDefinition(
        fieldDefinitionId,
        input
      );

      return response.ok({ body: updated.attributes });
    } catch (error) {
      throw createCaseError({
        message: `Failed to update field definition: ${error}`,
        error,
      });
    }
  },
});
