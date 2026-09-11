/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KueryNode } from '@kbn/es-query';
import type { Readable } from 'stream';
import type { ReplaySubject } from 'rxjs';
import type { AttachmentType } from '../../../common';
import type {
  BulkCreateAttachmentsRequestV2,
  FindAttachmentsQueryParams,
} from '../../../common/types/api';
import type { UnifiedAttachmentPayload } from '../../../common/types/domain/attachment/v2';

/**
 * The arguments needed for creating a new attachment to a case.
 */
export interface AddArgs {
  /**
   * The case ID that this attachment will be associated with
   */
  caseId: string;
  /**
   * Unified payload. Public POST /comments converts first via
   * toUnifiedAttachmentRequest.
   */
  comment: UnifiedAttachmentPayload;
}

export interface BulkCreateArgs {
  caseId: string;
  /**
   * Mixed v1/unified. Internal bulk_create and connectors still send v1;
   * convert inside bulkCreate until those callers go unified-only.
   */
  attachments: BulkCreateAttachmentsRequestV2;
}

/**
 * Parameters for deleting all comments of a case.
 */
export interface DeleteAllArgs {
  /**
   * The case ID to delete all attachments for
   */
  caseID: string;
}

/**
 * Parameters for deleting a file attachment.
 */
export interface BulkDeleteFileArgs {
  /**
   * The id of the case
   */
  caseId: string;
  /**
   * The ids of the file saved objects
   */
  fileIds: string[];
}

/**
 * Parameters for deleting multiple attachments of a case.
 */
export interface BulkDeleteArgs {
  /**
   * The id of the case
   */
  caseId: string;
  /**
   * The saved object ids of the attachments to delete
   */
  attachmentIds: string[];
}

/**
 * Parameters for deleting a single attachment of a case.
 */
export interface DeleteArgs {
  /**
   * The case ID to delete an attachment from
   */
  caseID: string;
  /**
   * The attachment saved object id to delete
   */
  savedObjectId: string;
}

/**
 * Parameters for finding attachments of a case
 */
export interface FindCommentsArgs {
  /**
   * The case ID for finding associated attachments
   */
  caseID: string;
  /**
   * Optional parameters for filtering the returned attachments
   */
  findQueryParams?: FindAttachmentsQueryParams;
}

/**
 * Parameters for retrieving all attachments of a case
 */
export interface GetAllArgs {
  /**
   * The case ID to retrieve all attachments for
   */
  caseID: string;
}

export interface GetArgs {
  /**
   * The ID of the case to retrieve an attachment from
   */
  caseID: string;
  /**
   * The ID of the attachment to retrieve
   */
  savedObjectId: string;
}

export interface BulkGetArgs {
  caseID: string;
  /**
   * The saved object ids of the attachments
   */
  savedObjectIds: string[];
}

export interface GetAllDocumentsAttachedToCase {
  /**
   * The ID of the case to retrieve the alerts from
   */
  caseId: string;
  filter?: KueryNode;
  attachmentTypes?: AttachmentType[];
  /**
   * Extra unified attachment `type` values (e.g. `security.entity`) to include alongside
   * the alert/event types, so non-alert unified attachments participate in the query.
   */
  unifiedAttachmentTypes?: string[];
}

/**
 * Parameters for updating a single attachment
 */
export interface UpdateArgs {
  /**
   * The ID of the case that is associated with this attachment
   */
  caseID: string;
  /**
   * Unified payload. Public PATCH /comments converts first via
   * toUnifiedAttachmentPatchRequest.
   */
  updateRequest: UnifiedAttachmentPayload & { id: string; version: string };
}

export interface HapiReadableStream extends Readable {
  hapi: {
    filename: string;
    headers: Record<string, string>;
  };
}

/**
 * The arguments needed for attaching a file to a case.
 */
export interface AddFileArgs {
  /**
   * The case ID that this attachment will be associated with
   */
  caseId: string;
  /**
   * The file to upload
   */
  file: Readable;
  /**
   * The name of the file to upload
   */
  filename: string;
  /**
   * The mime type of the file to upload
   */
  mimeType?: string;
  /**
   * An observable that can be used to abort the upload at any time.
   */
  $abort?: ReplaySubject<unknown>;
}
