/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { INTERNAL_BULK_CREATE_ATTACHMENTS_URL } from '../../../../common/constants';
import { isUnifiedOnlyAttachmentType } from '../../../../common/utils/attachments';
import { createCaseError } from '../../../common/error';
import { createCasesRoute } from '../create_cases_route';
import { escapeHatch } from '../utils';
import type { attachmentApiV2 } from '../../../../common/types/api';
import type { caseDomainV1 } from '../../../../common/types/domain';
import { DEFAULT_CASES_ROUTE_SECURITY } from '../constants';

export const bulkCreateAttachmentsRoute = createCasesRoute({
  method: 'post',
  path: INTERNAL_BULK_CREATE_ATTACHMENTS_URL,
  security: DEFAULT_CASES_ROUTE_SECURITY,
  params: {
    params: schema.object({
      case_id: schema.string(),
    }),
    body: schema.arrayOf(escapeHatch),
  },
  routerOptions: {
    access: 'internal',
  },
  handler: async ({ context, request, response }) => {
    try {
      const casesContext = await context.cases;
      const casesClient = await casesContext.getCasesClient();
      const caseId = request.params.case_id;
      const attachments = request.body as attachmentApiV2.BulkCreateAttachmentsRequestV2;
      // Encode the response in `unified` mode only when the batch contains a
      // unified-only attachment type (dashboard, map, discoverSession) that
      // has no V1 form to downgrade to. Legacy types (alerts, user comments,
      // file, …) keep the legacy-shaped response so existing public consumers
      // of this route aren't affected by the new SO attachment types.
      const hasUnifiedOnlyAttachment = attachments.some((attachment) =>
        isUnifiedOnlyAttachmentType(attachment.type)
      );
      const res: caseDomainV1.Case = await casesClient.attachments.bulkCreate({
        caseId,
        attachments,
        mode: hasUnifiedOnlyAttachment ? 'unified' : 'legacy',
      });

      return response.ok({
        body: res,
      });
    } catch (error) {
      throw createCaseError({
        message: `Failed to bulk create attachments in route case id: ${request.params.case_id}: ${error}`,
        error,
      });
    }
  },
});
