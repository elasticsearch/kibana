/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SavedObjectsUtils } from '@kbn/core/server';

import { AttachmentRequestRtV2 } from '../../../common/types/api/attachment/v2';
import type { Case } from '../../../common/types/domain';
import { decodeWithExcessOrThrow } from '../../common/runtime_types';
import { CaseCommentModel } from '../../common/models';
import { createCaseError } from '../../common/error';
import type { CasesClientArgs } from '..';
import { decodeCommentRequestV2 } from '../utils';
import { Operations } from '../../authorization';
import type { AddArgs } from './types';
import { validateRegisteredAttachments } from './validators';
import { validateMaxUserActions } from '../../common/validators';
import { extractAndAddObservables } from './extract_observables';
import { emitAttachmentsAddedEvent } from './trigger_utils';

/**
 * Create an attachment to a case.
 *
 * @ignore
 */
export const addComment = async (addArgs: AddArgs, clientArgs: CasesClientArgs): Promise<Case> => {
  const { comment, caseId, mode = 'legacy' } = addArgs;

  const {
    logger,
    authorization,
    persistableStateAttachmentTypeRegistry,
    externalReferenceAttachmentTypeRegistry,
    unifiedAttachmentTypeRegistry,
    services: { userActionService },
  } = clientArgs;

  try {
    const query = decodeWithExcessOrThrow(AttachmentRequestRtV2)(comment);

    await validateMaxUserActions({ caseId, userActionService, userActionsToAdd: 1 });
    decodeCommentRequestV2(
      comment,
      externalReferenceAttachmentTypeRegistry,
      unifiedAttachmentTypeRegistry
    );

    const savedObjectID = SavedObjectsUtils.generateId();
    await authorization.ensureAuthorized({
      operation: Operations.createComment,
      entities: [
        {
          id: savedObjectID,
          owner: comment.owner,
        },
      ],
    });

    validateRegisteredAttachments({
      query,
      persistableStateAttachmentTypeRegistry,
      externalReferenceAttachmentTypeRegistry,
      unifiedAttachmentTypeRegistry,
    });

    const createdDate = new Date().toISOString();

    const model = await CaseCommentModel.create(caseId, clientArgs);
    const updatedModel = await model.createComment({
      createdDate,
      commentReq: query,
      id: savedObjectID,
    });

    const updatedCase = await updatedModel.encodeWithComments({ mode });

    emitAttachmentsAddedEvent(clientArgs, updatedCase, [savedObjectID], query.type);

    // This call never throws — failures are logged and do not abort the attachment creation.
    await extractAndAddObservables(caseId, [comment], updatedCase, clientArgs);

    return updatedCase;
  } catch (error) {
    throw createCaseError({
      message: `Failed while adding a comment to case id: ${caseId} error: ${error}`,
      error,
      logger,
    });
  }
};
