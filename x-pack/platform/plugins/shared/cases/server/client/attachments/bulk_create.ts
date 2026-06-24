/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SavedObjectsUtils } from '@kbn/core/server';

import type { AttachmentRequestV2 } from '../../../common/types/api';
import { BulkCreateAttachmentsRequestRtV2 } from '../../../common/types/api/attachment/v2';
import type { Case } from '../../../common/types/domain';
import { decodeWithExcessOrThrow } from '../../common/runtime_types';

import { CaseCommentModel } from '../../common/models';
import { createCaseError } from '../../common/error';
import type { CasesClientArgs } from '..';

import { decodeCommentRequestV2 } from '../utils';
import type { OwnerEntity } from '../../authorization';
import { Operations } from '../../authorization';
import type { BulkCreateArgs } from './types';
import { validateRegisteredAttachments } from './validators';
import { validateMaxUserActions } from '../../common/validators';
import { emitAttachmentsAddedEvent } from './trigger_utils';
import { extractAndAddObservables } from './extract_observables';

export const bulkCreate = async (
  args: BulkCreateArgs,
  clientArgs: CasesClientArgs
): Promise<Case> => {
  const { attachments, caseId, mode = 'legacy' } = args;

  const {
    logger,
    authorization,
    externalReferenceAttachmentTypeRegistry,
    persistableStateAttachmentTypeRegistry,
    unifiedAttachmentTypeRegistry,
    services: { userActionService },
  } = clientArgs;

  try {
    decodeWithExcessOrThrow(BulkCreateAttachmentsRequestRtV2)(attachments);
    await validateMaxUserActions({
      caseId,
      userActionService,
      userActionsToAdd: attachments.length,
    });

    attachments.forEach((attachment) => {
      decodeCommentRequestV2(
        attachment,
        externalReferenceAttachmentTypeRegistry,
        unifiedAttachmentTypeRegistry
      );
      validateRegisteredAttachments({
        query: attachment,
        persistableStateAttachmentTypeRegistry,
        externalReferenceAttachmentTypeRegistry,
        unifiedAttachmentTypeRegistry,
      });
    });

    const [attachmentsWithIds, entities]: [
      Array<{ id: string } & AttachmentRequestV2>,
      OwnerEntity[]
    ] = attachments.reduce<[Array<{ id: string } & AttachmentRequestV2>, OwnerEntity[]]>(
      ([a, e], attachment) => {
        const savedObjectID = SavedObjectsUtils.generateId();
        return [
          [...a, { id: savedObjectID, ...attachment }],
          [...e, { owner: attachment.owner, id: savedObjectID }],
        ];
      },
      [[], []]
    );

    await authorization.ensureAuthorized({
      operation: Operations.bulkCreateAttachments,
      entities,
    });

    const model = await CaseCommentModel.create(caseId, clientArgs);
    const updatedModel = await model.bulkCreate({
      attachments: attachmentsWithIds,
    });

    const updatedCase = await updatedModel.encodeWithComments({ mode });

    const idsByType = new Map<string, string[]>();
    for (const attachment of attachmentsWithIds) {
      const ids = idsByType.get(attachment.type) ?? [];
      ids.push(attachment.id);
      idsByType.set(attachment.type, ids);
    }
    for (const [type, ids] of idsByType) {
      emitAttachmentsAddedEvent(clientArgs, updatedCase, ids, type);
    }

    // This call never throws — failures are logged and do not abort the attachment creation.
    await extractAndAddObservables(caseId, attachments, updatedCase, clientArgs);

    return updatedCase;
  } catch (error) {
    throw createCaseError({
      message: `Failed while bulk creating attachment to case id: ${caseId} error: ${error}`,
      error,
      logger,
    });
  }
};
