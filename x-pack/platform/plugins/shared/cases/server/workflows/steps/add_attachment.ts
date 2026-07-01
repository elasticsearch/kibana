/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { createServerStepDefinition } from '@kbn/workflows-extensions/server';
import {
  buildAddAttachmentStepCommonDefinition,
  type AddAttachmentStepInput,
} from '../../../common/workflows/steps/add_attachment';
import type { BulkCreateAttachmentsRequestV2 } from '../../../common/types/api';
import type { UnifiedAttachmentTypeRegistry } from '../../attachment_framework/unified_attachment_registry';
import type { CasesClient } from '../../client';
import { createCasesStepHandler, safeParseCaseForWorkflowOutput, withCaseOwner } from './utils';
import { selectAuthorableAttachmentSchemas } from './unified_attachment_schemas';

export const addAttachmentStepDefinition = (
  unifiedAttachmentTypeRegistry: UnifiedAttachmentTypeRegistry,
  getCasesClient: (request: KibanaRequest) => Promise<CasesClient>
) => {
  const members = selectAuthorableAttachmentSchemas(unifiedAttachmentTypeRegistry);
  const definition = buildAddAttachmentStepCommonDefinition(members);

  return createServerStepDefinition({
    ...definition,
    handler: createCasesStepHandler(
      getCasesClient,
      async (client, input: AddAttachmentStepInput) => {
        return withCaseOwner(client, input.case_id, async (owner) => {
          // The discriminated-union schema enforces the runtime shape; cast to
          // satisfy TS since the registry-driven member list is opaque at compile time.
          const attachments = [
            { ...(input.attachment as Record<string, unknown>), owner },
          ] as BulkCreateAttachmentsRequestV2;

          const updatedCase = await client.attachments.bulkCreate({
            caseId: input.case_id,
            attachments,
          });
          return safeParseCaseForWorkflowOutput(definition.outputSchema.shape.case, updatedCase);
        });
      }
    ),
  });
};
