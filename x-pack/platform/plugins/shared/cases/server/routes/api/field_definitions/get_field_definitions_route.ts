/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { castArray } from 'lodash';
import { INTERNAL_FIELD_DEFINITIONS_URL } from '../../../../common/constants';
import { createCaseError } from '../../../common/error';
import { createCasesRoute } from '../create_cases_route';
import { DEFAULT_CASES_ROUTE_SECURITY } from '../constants';
import type { FieldDefinitionsFindRequest } from '../../../../common/types/api/field_definition/v1';

/**
 * GET /internal/cases/field-definitions
 * List all field definitions for the given owner(s)
 */
export const getFieldDefinitionsRoute = createCasesRoute<{}, FieldDefinitionsFindRequest, {}>({
  method: 'get',
  path: INTERNAL_FIELD_DEFINITIONS_URL,
  security: DEFAULT_CASES_ROUTE_SECURITY,
  routerOptions: {
    access: 'internal',
    summary: 'Get all reusable field definitions',
  },
  handler: async ({ context, request, response }) => {
    try {
      const caseContext = await context.cases;
      const casesClient = await caseContext.getCasesClient();

      const { owner, isGlobal: rawApplyToAllCases } = request.query;
      // HTTP query params arrive as strings; use String() comparison to handle
      // both the string form ("true"/"false") and the already-coerced boolean.
      const isGlobal =
        rawApplyToAllCases === undefined ? undefined : String(rawApplyToAllCases) === 'true';
      const owners = owner ? castArray(owner) : [];

      const result = await casesClient.fieldDefinitions.getFieldDefinitions({
        owner: owners,
        isGlobal,
      });

      return response.ok({ body: result });
    } catch (error) {
      throw createCaseError({
        message: `Failed to get field definitions: ${error}`,
        error,
      });
    }
  },
});
