/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as rt from 'io-ts';
import {
  MAX_BULK_CREATE_ATTACHMENTS,
  MAX_BULK_GET_ATTACHMENTS,
  MAX_COMMENTS_PER_PAGE,
  MAX_COMMENT_LENGTH,
  MAX_BULK_DELETE_ATTACHMENTS,
  MAX_DELETE_FILES,
  MAX_FILENAME_LENGTH,
} from '../../../constants';
import {
  limitedArraySchema,
  limitedStringSchema,
  NonEmptyString,
  paginationSchema,
} from '../../../schema';
import {
  UserCommentAttachmentPayloadRt,
  AlertAttachmentPayloadRt,
  ActionsAttachmentPayloadRt,
  ExternalReferenceNoSOAttachmentPayloadRt,
  ExternalReferenceSOAttachmentPayloadRt,
  ExternalReferenceSOWithoutRefsAttachmentPayloadRt,
  PersistableStateAttachmentPayloadRt,
  AttachmentType,
  AttachmentRt,
  AttachmentsRt,
  EventAttachmentPayloadRt,
} from '../../domain/attachment/v1';

/**
 * Files
 */

const MIN_DELETE_IDS = 1;

export const BulkDeleteFileAttachmentsRequestRt = rt.strict({
  ids: limitedArraySchema({
    codec: NonEmptyString,
    min: MIN_DELETE_IDS,
    max: MAX_DELETE_FILES,
    fieldName: 'ids',
  }),
});

export const PostFileAttachmentRequestRt = rt.intersection([
  rt.strict({
    file: rt.unknown,
  }),
  rt.exact(
    rt.partial({
      filename: limitedStringSchema({ fieldName: 'filename', min: 1, max: MAX_FILENAME_LENGTH }),
    })
  ),
]);

/**
 * Attachments bulk delete
 */

export const BulkDeleteAttachmentsRequestRt = rt.strict({
  ids: limitedArraySchema({
    codec: NonEmptyString,
    min: MIN_DELETE_IDS,
    max: MAX_BULK_DELETE_ATTACHMENTS,
    fieldName: 'ids',
  }),
});

export type BulkDeleteAttachmentsRequest = rt.TypeOf<typeof BulkDeleteAttachmentsRequestRt>;
export type BulkDeleteFileAttachmentsRequest = rt.TypeOf<typeof BulkDeleteFileAttachmentsRequestRt>;
export type PostFileAttachmentRequest = rt.TypeOf<typeof PostFileAttachmentRequestRt>;

/**
 * Attachments
 */

const BasicAttachmentRequestRt = rt.union([
  UserCommentAttachmentPayloadRt,
  AlertAttachmentPayloadRt,
  ActionsAttachmentPayloadRt,
  ExternalReferenceNoSOAttachmentPayloadRt,
  PersistableStateAttachmentPayloadRt,
  EventAttachmentPayloadRt,
]);

export const AttachmentRequestRt = rt.union([
  rt.strict({
    comment: limitedStringSchema({ fieldName: 'comment', min: 1, max: MAX_COMMENT_LENGTH }),
    type: rt.literal(AttachmentType.user),
    owner: rt.string,
  }),
  EventAttachmentPayloadRt,
  AlertAttachmentPayloadRt,
  rt.strict({
    type: rt.literal(AttachmentType.actions),
    comment: limitedStringSchema({ fieldName: 'comment', min: 1, max: MAX_COMMENT_LENGTH }),
    actions: rt.strict({
      targets: rt.array(
        rt.strict({
          hostname: rt.string,
          endpointId: rt.string,
        })
      ),
      type: rt.string,
    }),
    owner: rt.string,
  }),
  ExternalReferenceNoSOAttachmentPayloadRt,
  ExternalReferenceSOAttachmentPayloadRt,
  PersistableStateAttachmentPayloadRt,
]);

export const AttachmentRequestWithoutRefsRt = rt.union([
  BasicAttachmentRequestRt,
  ExternalReferenceSOWithoutRefsAttachmentPayloadRt,
]);

export const AttachmentPatchRequestRt = rt.intersection([
  /**
   * Partial updates are not allowed.
   * We want to prevent the user for changing the type without removing invalid fields.
   *
   * injectAttachmentSOAttributesFromRefsForPatch is dependent on this assumption.
   * The consumers of the persistable attachment service should always get the
   * persistableStateAttachmentState on a patch.
   */
  AttachmentRequestRt,
  rt.strict({ id: rt.string, version: rt.string }),
]);

export const AttachmentsFindResponseRt = rt.strict({
  comments: rt.array(AttachmentRt),
  page: rt.number,
  per_page: rt.number,
  total: rt.number,
});

export const FindAttachmentsQueryParamsRt = rt.intersection([
  rt.exact(
    rt.partial({
      /**
       * Order to sort the response
       */
      sortOrder: rt.union([rt.literal('desc'), rt.literal('asc')]),
    })
  ),
  paginationSchema({ maxPerPage: MAX_COMMENTS_PER_PAGE }),
]);

export const BulkCreateAttachmentsRequestRt = limitedArraySchema({
  codec: AttachmentRequestRt,
  min: 0,
  max: MAX_BULK_CREATE_ATTACHMENTS,
  fieldName: 'attachments',
});

export const BulkGetAttachmentsRequestRt = rt.strict({
  ids: limitedArraySchema({
    codec: rt.string,
    min: 1,
    max: MAX_BULK_GET_ATTACHMENTS,
    fieldName: 'ids',
  }),
});

export const BulkGetAttachmentsResponseRt = rt.strict({
  attachments: AttachmentsRt,
  errors: rt.array(
    rt.strict({
      error: rt.string,
      message: rt.string,
      status: rt.union([rt.undefined, rt.number]),
      savedObjectId: rt.string,
    })
  ),
});

export type FindAttachmentsQueryParams = rt.TypeOf<typeof FindAttachmentsQueryParamsRt>;
export type AttachmentsFindResponse = rt.TypeOf<typeof AttachmentsFindResponseRt>;
export type AttachmentRequest = rt.TypeOf<typeof AttachmentRequestRt>;
export type AttachmentPatchRequest = rt.TypeOf<typeof AttachmentPatchRequestRt>;
export type BulkCreateAttachmentsRequest = rt.TypeOf<typeof BulkCreateAttachmentsRequestRt>;
export type BulkGetAttachmentsResponse = rt.TypeOf<typeof BulkGetAttachmentsResponseRt>;
export type BulkGetAttachmentsRequest = rt.TypeOf<typeof BulkGetAttachmentsRequestRt>;
