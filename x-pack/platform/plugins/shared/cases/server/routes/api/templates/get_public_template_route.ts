/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { TemplateV2Response } from '../../../../common/bundled-types.gen';
import { CASE_TEMPLATE_DETAILS_URL } from '../../../../common/constants';
import { createCaseError } from '../../../common/error';
import { createCasesRoute } from '../create_cases_route';
import { DEFAULT_CASES_ROUTE_SECURITY } from '../constants';
import { parseTemplate } from './parse_template';

/**
 * GET /api/cases/templates/{template_id}
 * Public readonly route — get a single template by ID
 */
export const getPublicTemplateRoute = createCasesRoute({
  method: 'get',
  path: CASE_TEMPLATE_DETAILS_URL,
  security: DEFAULT_CASES_ROUTE_SECURITY,
  routerOptions: {
    access: 'public',
    summary: 'Get a case template by ID',
    tags: ['oas-tag:cases'],
  },
  params: {
    params: schema.object({
      template_id: schema.string({ maxLength: 36 }),
    }),
    query: schema.object({
      version: schema.maybe(schema.number()),
    }),
  },
  handler: async ({ context, request, response }) => {
    try {
      const caseContext = await context.cases;
      const casesClient = await caseContext.getCasesClient();

      const { template_id: templateId } = request.params;
      const { version } = request.query;

      const template = await casesClient.templates.getTemplate(
        templateId,
        version !== undefined ? String(version) : undefined
      );

      if (!template) {
        return response.notFound({
          body: { message: `Template with id ${templateId} not found` },
        });
      }

      const body: TemplateV2Response = parseTemplate(template.attributes);

      return response.ok({ body });
    } catch (error) {
      throw createCaseError({
        message: `Failed to get template: ${error}`,
        error,
      });
    }
  },
});
