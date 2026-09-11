/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import {
  CASE_COMMENTS_BULK_DELETE_URL,
  MAX_BULK_DELETE_ATTACHMENTS,
  MAX_CASE_ID_LENGTH,
} from '../../../../common/constants';
import { createCasesRoute } from '../create_cases_route';
import { createCaseError } from '../../../common/error';
import { DEFAULT_CASES_ROUTE_SECURITY } from '../constants';

/**
 * POST /api/cases/{case_id}/comments/_bulk_delete
 * Public route — deletes several attachments of a case in one request.
 */
export const bulkDeleteCommentsRoute = createCasesRoute({
  method: 'post',
  path: CASE_COMMENTS_BULK_DELETE_URL,
  security: DEFAULT_CASES_ROUTE_SECURITY,
  params: {
    params: schema.object({
      case_id: schema.string({ maxLength: MAX_CASE_ID_LENGTH }),
    }),
    body: schema.object({
      ids: schema.arrayOf(schema.string({ minLength: 1, maxLength: MAX_CASE_ID_LENGTH }), {
        minSize: 1,
        maxSize: MAX_BULK_DELETE_ATTACHMENTS,
      }),
    }),
  },
  routerOptions: {
    access: 'public',
    summary: `Delete multiple case comments or alerts`,
    tags: ['oas-tag:cases'],
    description: `Deletes the attachments identified by \`ids\` from a case. Accepts any attachment type, including comments, alerts and files. A maximum of ${MAX_BULK_DELETE_ATTACHMENTS} attachments can be deleted per request. The request fails without deleting anything if any of the identifiers is not an attachment of the case.`,
    // You must have `all` privileges for the **Cases** feature in the **Management**, **Observability**, or **Security** section of the Kibana feature privileges, depending on the owner of the cases you're deleting.
  },
  handler: async ({ context, request, response }) => {
    try {
      const caseContext = await context.cases;
      const client = await caseContext.getCasesClient();

      await client.attachments.bulkDelete({
        caseId: request.params.case_id,
        attachmentIds: request.body.ids,
      });

      return response.noContent();
    } catch (error) {
      throw createCaseError({
        message: `Failed to bulk delete comments in route case id: ${request.params.case_id}: ${error}`,
        error,
      });
    }
  },
});
