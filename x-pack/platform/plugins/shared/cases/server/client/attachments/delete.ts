/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';

import { UserActionActions, UserActionTypes } from '../../../common/types/domain';
import { decodeOrThrow } from '../../common/runtime_types';
import { CASE_SAVED_OBJECT } from '../../../common/constants';
import { getAlertInfoFromComments } from '../../common/utils';
import type { CasesClientArgs } from '../types';
import { createCaseError } from '../../common/error';
import { Operations } from '../../authorization';
import type { DeleteAllArgs, DeleteArgs } from './types';
import type { AttachmentRequestV2 } from '../../../common/types/api';
import { AttachmentRequestRtV2 } from '../../../common/types/api';
import type { AttachmentSavedObjectType } from '../../services/user_actions/types';

/**
 * Delete all comments for a case.
 */
export async function deleteAll(
  { caseID }: DeleteAllArgs,
  clientArgs: CasesClientArgs
): Promise<void> {
  const {
    user,
    services: { caseService, attachmentService, userActionService, alertsService },
    logger,
    authorization,
  } = clientArgs;

  try {
    const comments = await caseService.getAllCaseComments({
      id: caseID,
      mode: 'legacy',
    });

    if (comments.total <= 0) {
      throw Boom.notFound(`No comments found for ${caseID}.`);
    }

    await authorization.ensureAuthorized({
      operation: Operations.deleteAllComments,
      entities: comments.saved_objects.map((comment) => ({
        owner: comment.attributes.owner,
        id: comment.id,
      })),
    });

    await attachmentService.bulkDelete({
      savedObjectIds: comments.saved_objects.map((so) => so.id),
      refresh: true,
    });

    await updateCaseAttachmentStats({
      caseService: clientArgs.services.caseService,
      attachmentService: clientArgs.services.attachmentService,
      caseId: caseID,
      user,
    });

    await userActionService.creator.bulkCreateAttachmentDeletion({
      caseId: caseID,
      attachments: comments.saved_objects.map((comment) => ({
        id: comment.id,
        owner: comment.attributes.owner,
        attachment: comment.attributes,
        savedObjectType: comment.type as AttachmentSavedObjectType,
      })),
      user,
    });

    const attachments = comments.saved_objects.map((comment) => comment.attributes);

    await handleAlerts({ alertsService, attachments, caseId: caseID });
  } catch (error) {
    throw createCaseError({
      message: `Failed to delete all comments case id: ${caseID}: ${error}`,
      error,
      logger,
    });
  }
}

/**
 * Deletes an attachment
 */
export async function deleteComment(
  { caseID, savedObjectId }: DeleteArgs,
  clientArgs: CasesClientArgs
) {
  const {
    user,
    services: { attachmentService, userActionService, alertsService },
    logger,
    authorization,
  } = clientArgs;

  try {
    const attachment = await attachmentService.getter.get({
      savedObjectId,
      mode: 'legacy',
    });

    if (attachment == null) {
      throw Boom.notFound(`This comment ${savedObjectId} does not exist anymore.`);
    }

    await authorization.ensureAuthorized({
      entities: [{ owner: attachment.attributes.owner, id: attachment.id }],
      operation: Operations.deleteComment,
    });

    const type = CASE_SAVED_OBJECT;
    const id = caseID;

    const caseRef = attachment.references.find((c) => c.type === type);
    if (caseRef == null || (caseRef != null && caseRef.id !== id)) {
      throw Boom.notFound(`This comment ${savedObjectId} does not exist in ${id}.`);
    }

    await attachmentService.bulkDelete({
      savedObjectIds: [savedObjectId],
      refresh: true,
    });

    await updateCaseAttachmentStats({
      caseService: clientArgs.services.caseService,
      attachmentService: clientArgs.services.attachmentService,
      caseId: caseID,
      user,
    });

    // we only want to store the fields related to the original request of the attachment, not fields like
    // created_at etc. So we'll use the decode to strip off the other fields. This is necessary because we don't know
    // what type of attachment this is. Depending on the type it could have various fields.
    const attachmentRequestAttributes = decodeOrThrow(AttachmentRequestRtV2)(attachment.attributes);

    await userActionService.creator.createUserAction({
      userAction: {
        type: UserActionTypes.comment,
        action: UserActionActions.delete,
        caseId: id,
        savedObjectId,
        savedObjectType: attachment.type as AttachmentSavedObjectType,
        payload: { attachment: attachmentRequestAttributes },
        user,
        owner: attachment.attributes.owner,
      },
    });

    await handleAlerts({ alertsService, attachments: [attachment.attributes], caseId: id });
  } catch (error) {
    throw createCaseError({
      message: `Failed to delete comment: ${caseID} comment id: ${savedObjectId}: ${error}`,
      error,
      logger,
    });
  }
}

interface HandleAlertsArgs {
  alertsService: CasesClientArgs['services']['alertsService'];
  attachments: AttachmentRequestV2[];
  caseId: string;
}

const handleAlerts = async ({ alertsService, attachments, caseId }: HandleAlertsArgs) => {
  const alerts = getAlertInfoFromComments(attachments);

  if (alerts.length === 0) {
    return;
  }

  await alertsService.removeCaseIdFromAlerts({ alerts, caseId });
};

interface UpdateCaseAttachmentStats {
  caseService: CasesClientArgs['services']['caseService'];
  attachmentService: CasesClientArgs['services']['attachmentService'];
  caseId: string;
  user: CasesClientArgs['user'];
}

const updateCaseAttachmentStats = async ({
  caseService,
  attachmentService,
  caseId,
  user,
}: UpdateCaseAttachmentStats) => {
  const originalCase = await caseService.getCase({
    id: caseId,
  });

  const date = new Date().toISOString();

  const attachmentStats = await attachmentService.getter.getCaseAttatchmentStats({
    caseIds: [caseId],
  });

  const totalComments = attachmentStats.get(caseId)?.userComments ?? 0;
  const totalAlerts = attachmentStats.get(caseId)?.alerts ?? 0;
  const totalEvents = attachmentStats.get(caseId)?.events ?? 0;

  await caseService.patchCase({
    originalCase,
    caseId,
    updatedAttributes: {
      updated_at: date,
      updated_by: user,
      total_comments: totalComments,
      total_alerts: totalAlerts,
      total_events: totalEvents,
    },
    refresh: false,
  });
};
