/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import Boom from '@hapi/boom';

import type {
  SavedObject,
  SavedObjectReference,
  SavedObjectsUpdateOptions,
  SavedObjectsUpdateResponse,
  SavedObjectsFindResponse,
} from '@kbn/core/server';
import {
  isLegacyAttachmentRequest,
  isUnifiedAttachmentRequest,
  isAlertAttachmentType,
  isEventAttachmentType,
} from '../../../common/utils/attachments';
import type {
  AlertAttachmentPayload,
  AttachmentAttributes,
  Case,
  EventAttachmentPayload,
  UserCommentAttachmentPayload,
} from '../../../common/types/domain';
import {
  CaseRt,
  CaseStatuses,
  UserActionActions,
  UserActionTypes,
  AttachmentType,
} from '../../../common/types/domain';

import { CASE_SAVED_OBJECT, MAX_DOCS_PER_PAGE } from '../../../common/constants';
import type { CasesClientArgs } from '../../client';
import type { RefreshSetting } from '../../services/types';
import type { AttachmentSavedObjectType } from '../../services/user_actions/types';
import { createCaseError } from '../error';
import { AttachmentLimitChecker } from '../limiter_checker';
import type { AlertInfo } from '../types';
import type { CaseSavedObjectTransformed } from '../types/case';
import {
  countAlertsForID,
  flattenAttachmentSavedObjects,
  transformNewComment,
  getOrUpdateLensReferences,
  isCommentRequestTypeAlert,
  getAlertInfoFromComments,
  getIDsAndIndicesAsArrays,
  isCommentRequestTypeEvent,
  countEventsForID,
} from '../utils';
import { decodeOrThrow } from '../runtime_types';
import type {
  AttachmentRequest,
  AttachmentPatchRequestV2,
  AttachmentRequestV2,
} from '../../../common/types/api';
import type {
  AttachmentAttributesV2,
  AttachmentMode,
  UnifiedAttachmentPayload,
} from '../../../common/types/domain/attachment/v2';

type CaseCommentModelParams = Omit<CasesClientArgs, 'authorization'>;
type CommentRequestWithId = Array<{ id: string } & (AttachmentRequest | UnifiedAttachmentPayload)>;

/**
 * This class represents a case that can have a comment attached to it.
 */
export class CaseCommentModel {
  private readonly params: CaseCommentModelParams;
  private readonly caseInfo: CaseSavedObjectTransformed;

  private constructor(caseInfo: CaseSavedObjectTransformed, params: CaseCommentModelParams) {
    this.caseInfo = caseInfo;
    this.params = params;
  }

  public static async create(
    id: string,
    options: CaseCommentModelParams
  ): Promise<CaseCommentModel> {
    const savedObject = await options.services.caseService.getCase({
      id,
    });

    return new CaseCommentModel(savedObject, options);
  }

  public get savedObject(): CaseSavedObjectTransformed {
    return this.caseInfo;
  }

  /**
   * Update a comment and update the corresponding case's update_at and updated_by fields.
   */
  public async updateComment({
    updateRequest,
    updatedAt,
    owner,
    mode = 'legacy',
  }: {
    updateRequest: AttachmentPatchRequestV2;
    updatedAt: string;
    owner: string;
    mode?: AttachmentMode;
  }): Promise<CaseCommentModel> {
    try {
      const { id, version, ...queryRestAttributes } = updateRequest;
      const options: SavedObjectsUpdateOptions<AttachmentAttributes> = {
        version,
        /**
         * This is to handle a scenario where an update occurs for an attachment framework style comment.
         * The code that extracts the reference information from the attributes doesn't know about the reference to the case
         * and therefore will accidentally remove that reference and we'll lose the connection between the comment and the
         * case.
         */
        references: [...this.buildRefsToCase()],
        refresh: false,
      };

      if (
        queryRestAttributes.type === AttachmentType.user &&
        'comment' in queryRestAttributes &&
        queryRestAttributes.comment
      ) {
        const currentComment = (await this.params.services.attachmentService.getter.get({
          savedObjectId: id,
          mode,
        })) as SavedObject<UserCommentAttachmentPayload>;

        const updatedReferences = getOrUpdateLensReferences(
          this.params.lensEmbeddableFactory,
          queryRestAttributes.comment,
          currentComment
        );

        /**
         * The call to getOrUpdateLensReferences already handles retrieving the reference to the case and ensuring that is
         * also included here so it's ok to overwrite what was set before.
         */
        options.references = updatedReferences;
      }

      const [comment, commentableCase] = await Promise.all([
        this.params.services.attachmentService.update({
          savedObjectId: id,
          updatedAttributes: {
            ...queryRestAttributes,
            updated_at: updatedAt,
            updated_by: this.params.user,
          },
          options,
        }),
        this.partialUpdateCaseWithAttachmentDataSkipRefresh({ date: updatedAt }),
      ]);

      await commentableCase.createUpdateCommentUserAction(comment, updateRequest, owner);

      return commentableCase;
    } catch (error) {
      throw createCaseError({
        message: `Failed to update comment in commentable case, case id: ${this.caseInfo.id}: ${error}`,
        error,
        logger: this.params.logger,
      });
    }
  }

  private async partialUpdateCaseWithAttachmentDataSkipRefresh({
    date,
  }: {
    date: string;
  }): Promise<CaseCommentModel> {
    return this.partialUpdateCaseWithAttachmentData({
      date,
      refresh: false,
    });
  }

  private async partialUpdateCaseWithAttachmentData({
    date,
    refresh,
  }: {
    date: string;
    refresh: RefreshSetting;
  }): Promise<CaseCommentModel> {
    try {
      const { totalComments, totalAlerts, totalEvents } = await this.getAttachmentStats();

      const updatedCase = await this.params.services.caseService.patchCase({
        originalCase: this.caseInfo,
        caseId: this.caseInfo.id,
        updatedAttributes: {
          updated_at: date,
          updated_by: { ...this.params.user },
          total_comments: totalComments,
          total_alerts: totalAlerts,
          total_events: totalEvents,
        },
        refresh,
      });

      return this.newObjectWithInfo({
        ...this.caseInfo,
        attributes: {
          ...this.caseInfo.attributes,
          ...updatedCase.attributes,
        },
        version: updatedCase.version ?? this.caseInfo.version,
      });
    } catch (error) {
      throw createCaseError({
        message: `Failed to update commentable case, case id: ${this.caseInfo.id}: ${error}`,
        error,
        logger: this.params.logger,
      });
    }
  }

  private async getAttachmentStats() {
    const attachmentStats =
      await this.params.services.attachmentService.getter.getCaseAttatchmentStats({
        caseIds: [this.caseInfo.id],
      });

    const totalComments = attachmentStats.get(this.caseInfo.id)?.userComments ?? 0;
    const totalAlerts = attachmentStats.get(this.caseInfo.id)?.alerts ?? 0;
    const totalEvents = attachmentStats.get(this.caseInfo.id)?.events ?? 0;

    return {
      totalComments,
      totalAlerts,
      totalEvents,
    };
  }

  private newObjectWithInfo(caseInfo: CaseSavedObjectTransformed): CaseCommentModel {
    return new CaseCommentModel(caseInfo, this.params);
  }

  private async createUpdateCommentUserAction(
    comment: SavedObjectsUpdateResponse<AttachmentAttributesV2>,
    updateRequest: AttachmentPatchRequestV2,
    owner: string
  ) {
    const { id, version, ...queryRestAttributes } = updateRequest;

    await this.params.services.userActionService.creator.createUserAction({
      userAction: {
        type: UserActionTypes.comment,
        action: UserActionActions.update,
        caseId: this.caseInfo.id,
        savedObjectId: comment.id,
        savedObjectType: comment.type as AttachmentSavedObjectType,
        payload: { attachment: queryRestAttributes },
        user: this.params.user,
        owner,
      },
    });
  }

  /**
   * Create a new comment on the appropriate case. This updates the case's updated_at and updated_by fields.
   */
  public async createComment({
    createdDate,
    commentReq,
    id,
  }: {
    createdDate: string;
    commentReq: AttachmentRequestV2;
    id: string;
  }): Promise<CaseCommentModel> {
    try {
      await this.validateCreateCommentRequest([commentReq]);
      const attachmentsWithoutDuplicates = await this.filterDuplicatedAttachments([
        { ...commentReq, id },
      ]);

      if (attachmentsWithoutDuplicates.length === 0) {
        return this;
      }

      const { id: commentId, ...attachment } = attachmentsWithoutDuplicates[0];

      const references = [...this.buildRefsToCase(), ...this.getCommentReferences(attachment)];

      const comment = await this.params.services.attachmentService.create({
        attributes: transformNewComment({
          createdDate,
          ...attachment,
          ...this.params.user,
        }),
        references,
        id,
        refresh: true,
      });

      const commentableCase = await this.partialUpdateCaseWithAttachmentDataSkipRefresh({
        date: createdDate,
      });

      await Promise.all([
        commentableCase.handleAlertComments([attachment]),
        this.createCommentUserAction(comment, attachment),
      ]);

      return commentableCase;
    } catch (error) {
      throw createCaseError({
        message: `Failed creating a comment on a commentable case, case id: ${this.caseInfo.id}: ${error}`,
        error,
        logger: this.params.logger,
      });
    }
  }

  private async filterDuplicatedAttachments(
    attachments: CommentRequestWithId
  ): Promise<CommentRequestWithId> {
    /**
     * This function removes the elements in items that exist at the passed in positions.
     */
    const removeItemsByPosition = (items: string[], positionsToRemove: number[]): string[] =>
      items.filter((_, itemIndex) => !positionsToRemove.some((position) => position === itemIndex));

    const assertIdsAndIndicesHaveMatchingLengths = (ids: string[], indices: string[]): void => {
      if (ids.length !== indices.length) {
        throw Boom.badRequest(
          `attachmentId and metadata.index must have matching lengths. Received attachmentId.length=${ids.length} and metadata.index.length=${indices.length}.`
        );
      }
    };

    const dedupedAttachments: CommentRequestWithId = [];
    const idsAlreadySeen = new Set();

    // Dedup helper for unified (v2) alert/event attachments. The unified contract for
    // metadata.index is "scalar broadcast OR 1-to-1 array of matching length"; an array
    // whose length does not match attachmentId has no sensible interpretation and is
    // rejected, mirroring the legacy paired-array strictness.
    const dedupeUnifiedAttachment = <
      T extends { attachmentId: string | string[]; metadata?: unknown }
    >(
      attachment: T,
      idsAlreadyInCase: Set<string>
    ): T | undefined => {
      const { ids } = getIDsAndIndicesAsArrays(attachment as unknown as AttachmentRequestV2);
      const existingMetadata =
        attachment.metadata && typeof attachment.metadata === 'object'
          ? (attachment.metadata as Record<string, unknown>)
          : {};
      const rawMetadataIndex = existingMetadata.index as string | string[] | undefined;

      if (Array.isArray(rawMetadataIndex) && rawMetadataIndex.length !== ids.length) {
        throw Boom.badRequest(
          `attachmentId and metadata.index must have matching lengths when metadata.index is an array. Received attachmentId.length=${ids.length} and metadata.index.length=${rawMetadataIndex.length}.`
        );
      }

      const idPositionsThatAlreadyExistInCase: number[] = [];

      ids.forEach((id, index) => {
        if (idsAlreadyInCase.has(id) || idsAlreadySeen.has(id)) {
          idPositionsThatAlreadyExistInCase.push(index);
        }

        idsAlreadySeen.add(id);
      });

      const newIds = removeItemsByPosition(ids, idPositionsThatAlreadyExistInCase);
      const newMetadataIndex = Array.isArray(rawMetadataIndex)
        ? removeItemsByPosition(rawMetadataIndex, idPositionsThatAlreadyExistInCase)
        : rawMetadataIndex;

      if (newIds.length === 0) {
        return undefined;
      }

      return {
        ...attachment,
        attachmentId: newIds,
        metadata: {
          ...existingMetadata,
          index: newMetadataIndex,
        },
      };
    };
    const alertsAttachedToCase = await this.params.services.attachmentService.getter.getAllAlertIds(
      {
        caseId: this.caseInfo.id,
      }
    );

    const eventsAttachedToCase = await this.params.services.attachmentService.getter.getAllEventIds(
      {
        caseId: this.caseInfo.id,
        owner: this.caseInfo.attributes.owner,
      }
    );

    attachments.forEach((attachment) => {
      if (isAlertAttachmentType(attachment.type)) {
        if (isLegacyAttachmentRequest(attachment) && isCommentRequestTypeAlert(attachment)) {
          const { ids, indices } = getIDsAndIndicesAsArrays(attachment);
          const idPositionsThatAlreadyExistInCase: number[] = [];

          ids.forEach((id, index) => {
            if (alertsAttachedToCase.has(id) || idsAlreadySeen.has(id)) {
              idPositionsThatAlreadyExistInCase.push(index);
            }

            idsAlreadySeen.add(id);
          });

          assertIdsAndIndicesHaveMatchingLengths(ids, indices);

          const alertIdsNotAlreadyAttachedToCase = removeItemsByPosition(
            ids,
            idPositionsThatAlreadyExistInCase
          );
          const alertIndicesNotAlreadyAttachedToCase = removeItemsByPosition(
            indices,
            idPositionsThatAlreadyExistInCase
          );

          if (alertIdsNotAlreadyAttachedToCase.length > 0) {
            dedupedAttachments.push({
              ...attachment,
              alertId: alertIdsNotAlreadyAttachedToCase,
              index: alertIndicesNotAlreadyAttachedToCase,
            });
          }
        } else if ('attachmentId' in attachment) {
          const deduped = dedupeUnifiedAttachment(attachment, alertsAttachedToCase);
          if (deduped) {
            dedupedAttachments.push(deduped);
          }
        }
        return;
      }

      if (isEventAttachmentType(attachment.type)) {
        if (isLegacyAttachmentRequest(attachment) && isCommentRequestTypeEvent(attachment)) {
          const { ids, indices } = getIDsAndIndicesAsArrays(attachment);
          const idPositionsThatAlreadyExistInCase: number[] = [];

          ids.forEach((id, index) => {
            if (eventsAttachedToCase.has(id) || idsAlreadySeen.has(id)) {
              idPositionsThatAlreadyExistInCase.push(index);
            }

            idsAlreadySeen.add(id);
          });

          assertIdsAndIndicesHaveMatchingLengths(ids, indices);

          const newIds = removeItemsByPosition(ids, idPositionsThatAlreadyExistInCase);
          const newIndices = removeItemsByPosition(indices, idPositionsThatAlreadyExistInCase);

          if (newIds.length > 0) {
            dedupedAttachments.push({
              ...attachment,
              eventId: newIds,
              index: newIndices,
            });
          }
        } else if ('attachmentId' in attachment) {
          const deduped = dedupeUnifiedAttachment(attachment, eventsAttachedToCase);
          if (deduped) {
            dedupedAttachments.push(deduped);
          }
        }

        return;
      }

      dedupedAttachments.push(attachment);
    });

    return dedupedAttachments;
  }

  private getAttachmentsByType<
    T extends AttachmentType,
    R = T extends AttachmentType.event ? AlertAttachmentPayload[] : EventAttachmentPayload[]
  >(attachments: AttachmentRequestV2[], attachmentType: T): R {
    return attachments.filter((attachment) => attachment.type === attachmentType) as R;
  }

  private async validateCreateCommentRequest(req: Array<AttachmentRequestV2>) {
    if (this.caseInfo.attributes.status === CaseStatuses.closed) {
      const hasAlertsInRequest = req.some((a) => isAlertAttachmentType(a.type));

      if (hasAlertsInRequest) {
        throw Boom.badRequest('Alert cannot be attached to a closed case');
      }

      const eventAttachments = this.getAttachmentsByType(req, AttachmentType.event);
      const hasEventsInRequest = eventAttachments.length > 0;

      if (hasEventsInRequest) {
        throw Boom.badRequest('Event cannot be attached to a closed case');
      }
    }

    if (req.some((attachment) => attachment.owner !== this.caseInfo.attributes.owner)) {
      throw Boom.badRequest('The owner field of the comment must match the case');
    }

    const limitChecker = new AttachmentLimitChecker(
      this.params.services.attachmentService,
      this.params.fileService,
      this.caseInfo.id
    );

    await limitChecker.validate(req);
  }

  private buildRefsToCase(): SavedObjectReference[] {
    return [
      {
        type: CASE_SAVED_OBJECT,
        name: `associated-${CASE_SAVED_OBJECT}`,
        id: this.caseInfo.id,
      },
    ];
  }

  private getCommentReferences(commentReq: AttachmentRequestV2) {
    let references: SavedObjectReference[] = [];

    if (
      isLegacyAttachmentRequest(commentReq) &&
      commentReq.type === AttachmentType.user &&
      commentReq?.comment
    ) {
      const commentStringReferences = getOrUpdateLensReferences(
        this.params.lensEmbeddableFactory,
        commentReq.comment
      );
      references = [...references, ...commentStringReferences];
    } else if (
      isUnifiedAttachmentRequest(commentReq) &&
      commentReq.type === 'comment' &&
      commentReq.data?.content
    ) {
      const commentStringReferences = getOrUpdateLensReferences(
        this.params.lensEmbeddableFactory,
        commentReq.data?.content as string
      );
      references = [...references, ...commentStringReferences];
    }

    return references;
  }

  private async handleAlertComments(attachments: AttachmentRequestV2[]) {
    const alertAttachments = attachments.filter((a) => isAlertAttachmentType(a.type));

    const alerts = getAlertInfoFromComments(alertAttachments);

    if (alerts.length > 0) {
      await this.params.services.alertsService.ensureAlertsAuthorized({ alerts });
      await this.updateAlertsSchemaWithCaseInfo(alerts);

      if (this.caseInfo.attributes.settings.syncAlerts) {
        await this.updateAlertsStatus(alerts);
      }
    }
  }

  private async updateAlertsStatus(alerts: AlertInfo[]) {
    const alertsToUpdate = alerts.map((alert) => ({
      ...alert,
      status: this.caseInfo.attributes.status,
    }));

    await this.params.services.alertsService.updateAlertsStatus(alertsToUpdate);
  }

  private async updateAlertsSchemaWithCaseInfo(alerts: AlertInfo[]) {
    await this.params.services.alertsService.bulkUpdateCases({
      alerts,
      caseIds: [this.caseInfo.id],
    });
  }

  private async createCommentUserAction(
    comment: SavedObject<AttachmentAttributesV2>,
    req: AttachmentRequestV2
  ) {
    await this.params.services.userActionService.creator.createUserAction({
      userAction: {
        type: UserActionTypes.comment,
        action: UserActionActions.create,
        caseId: this.caseInfo.id,
        savedObjectId: comment.id,
        savedObjectType: comment.type as AttachmentSavedObjectType,
        payload: {
          attachment: req,
        },
        user: this.params.user,
        owner: req.owner,
      },
    });
  }

  private async bulkCreateCommentUserAction(
    attachments: Array<
      { id: string; savedObjectType: AttachmentSavedObjectType } & AttachmentRequestV2
    >
  ) {
    await this.params.services.userActionService.creator.bulkCreateAttachmentCreation({
      caseId: this.caseInfo.id,
      attachments: attachments.map(({ id, savedObjectType, ...attachment }) => ({
        id,
        owner: attachment.owner,
        attachment,
        savedObjectType,
      })),
      user: this.params.user,
    });
  }

  private formatForEncoding(totalComment: number) {
    return {
      id: this.caseInfo.id,
      version: this.caseInfo.version ?? '0',
      totalComment,
      ...this.caseInfo.attributes,
    };
  }

  public async encodeWithComments({ mode }: { mode: AttachmentMode }): Promise<Case> {
    try {
      const comments = await this.params.services.caseService.getAllCaseComments({
        id: this.caseInfo.id,
        options: {
          fields: [],
          page: 1,
          perPage: MAX_DOCS_PER_PAGE,
        },
        mode,
      });
      const totalAlerts =
        countAlertsForID({
          comments: comments as SavedObjectsFindResponse<AttachmentAttributes>,
          id: this.caseInfo.id,
        }) ?? 0;
      const totalEvents =
        countEventsForID({
          comments: comments as SavedObjectsFindResponse<AttachmentAttributes>,
        }) ?? 0;

      const caseResponse = {
        comments: flattenAttachmentSavedObjects(comments.saved_objects),
        totalAlerts,
        totalEvents,
        ...this.formatForEncoding(comments.total),
      };

      return decodeOrThrow(CaseRt)(caseResponse);
    } catch (error) {
      throw createCaseError({
        message: `Failed encoding the commentable case, case id: ${this.caseInfo.id}: ${error}`,
        error,
        logger: this.params.logger,
      });
    }
  }

  public async bulkCreate({
    attachments,
  }: {
    attachments: CommentRequestWithId;
  }): Promise<CaseCommentModel> {
    try {
      await this.validateCreateCommentRequest(attachments);

      const attachmentWithoutDuplicateAlerts = await this.filterDuplicatedAttachments(attachments);

      if (attachmentWithoutDuplicateAlerts.length === 0) {
        return this;
      }

      const caseReference = this.buildRefsToCase();

      const newlyCreatedAttachments = await this.params.services.attachmentService.bulkCreate({
        attachments: attachmentWithoutDuplicateAlerts.map(({ id, ...attachment }) => {
          return {
            attributes: transformNewComment({
              createdDate: new Date().toISOString(),
              ...attachment,
              ...this.params.user,
            }),
            references: [...caseReference, ...this.getCommentReferences(attachment)],
            id,
          };
        }),
        refresh: true,
      });

      const commentableCase = await this.partialUpdateCaseWithAttachmentDataSkipRefresh({
        date: new Date().toISOString(),
      });

      const savedObjectsWithoutErrors = newlyCreatedAttachments.saved_objects.filter(
        (attachment) => attachment.error == null
      );

      const attachmentsWithoutErrors = attachments.flatMap((attachment) => {
        const savedObject = savedObjectsWithoutErrors.find((so) => so.id === attachment.id);

        return savedObject
          ? [
              {
                ...attachment,
                savedObjectType: savedObject.type as AttachmentSavedObjectType,
              },
            ]
          : [];
      });

      await Promise.all([
        commentableCase.handleAlertComments(attachmentsWithoutErrors),
        this.bulkCreateCommentUserAction(attachmentsWithoutErrors),
      ]);

      return commentableCase;
    } catch (error) {
      throw createCaseError({
        message: `Failed bulk creating attachments on a commentable case, case id: ${this.caseInfo.id}: ${error}`,
        error,
        logger: this.params.logger,
      });
    }
  }
}
