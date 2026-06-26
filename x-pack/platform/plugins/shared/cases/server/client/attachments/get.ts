/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject } from '@kbn/core/server';

import type {
  AttachmentsV2,
  AttachmentV2,
  DocumentAttachmentAttributesV2,
} from '../../../common/types/domain';
import { AttachmentType } from '../../../common';
import type { DocumentResponse, AttachmentsFindResponse } from '../../../common/types/api';
import {
  DocumentResponseRt,
  FindAttachmentsQueryParamsRt,
  AttachmentsFindResponseRt,
} from '../../../common/types/api';
import type { CasesClient } from '../client';
import type { CasesClientArgs } from '../types';

import type { FindCommentsArgs, GetAllDocumentsAttachedToCase, GetAllArgs, GetArgs } from './types';

import { CASE_COMMENT_SAVED_OBJECT, CASE_SAVED_OBJECT } from '../../../common/constants';
import { getAttachmentAuthorizationFilter } from '../../authorization/utils';
import { decodeOrThrow, decodeWithExcessOrThrow } from '../../common/runtime_types';
import {
  defaultSortField,
  transformComments,
  flattenAttachmentSavedObject,
  flattenAttachmentSavedObjects,
  getIDsAndIndicesAsArrays,
} from '../../common/utils';
import { createCaseError } from '../../common/error';
import { DEFAULT_PAGE, DEFAULT_PER_PAGE } from '../../routes/api';
import { buildFilter, combineFilters } from '../utils';
import { Operations } from '../../authorization';
import { AttachmentRtV2, AttachmentsRtV2 } from '../../../common/types/domain';

const normalizeDocumentResponse = (
  documents: Array<SavedObject<DocumentAttachmentAttributesV2>>
): DocumentResponse =>
  documents.reduce((acc: DocumentResponse, document) => {
    const { ids, indices } = getIDsAndIndicesAsArrays(document.attributes);

    if (ids.length !== indices.length) {
      return acc;
    }

    acc.push(
      ...ids.map((id, index) => ({
        id,
        index: indices[index],
        attached_at: document.attributes.created_at,
      }))
    );
    return acc;
  }, []);

/**
 * Retrieves all documents attached to a specific case.
 */
export const getAllDocumentsAttachedToCase = async (
  { caseId, filter, attachmentTypes }: GetAllDocumentsAttachedToCase,
  clientArgs: CasesClientArgs,
  casesClient: CasesClient
): Promise<DocumentResponse> => {
  const {
    authorization,
    services: { attachmentService },
    logger,
  } = clientArgs;

  try {
    // This will perform an authorization check to ensure the user has access to the parent case
    const theCase = await casesClient.cases.get({
      id: caseId,
      includeComments: false,
    });

    const { filter: authorizationFilter, ensureSavedObjectsAreAuthorized } =
      await getAttachmentAuthorizationFilter(authorization, Operations.getAlertsAttachedToCase);

    const filterArray = authorizationFilter ? [authorizationFilter] : [];
    if (filter) filterArray.push(filter);

    const documents = await attachmentService.getter.getAllDocumentsAttachedToCase({
      attachmentTypes,
      caseId: theCase.id,
      filter: combineFilters(filterArray),
      owner: theCase.owner,
    });

    ensureSavedObjectsAreAuthorized(
      documents.map((document) => ({
        owner: document.attributes.owner,
        id: document.id,
      }))
    );

    const res = normalizeDocumentResponse(documents);

    return decodeOrThrow(DocumentResponseRt)(res);
  } catch (error) {
    throw createCaseError({
      message: `Failed to get documents attached to case id: ${caseId}: ${error}`,
      error,
      logger,
    });
  }
};

/**
 * Retrieves the attachments for a case entity. This support pagination.
 */
export async function find(
  { caseID, findQueryParams, mode = 'legacy' }: FindCommentsArgs,
  clientArgs: CasesClientArgs
): Promise<AttachmentsFindResponse> {
  const {
    services: { attachmentService },
    logger,
    authorization,
  } = clientArgs;

  try {
    const queryParams = decodeWithExcessOrThrow(FindAttachmentsQueryParamsRt)(findQueryParams);

    const { filter: authorizationFilter, ensureSavedObjectsAreAuthorized } =
      await getAttachmentAuthorizationFilter(authorization, Operations.findComments);

    // TODO https://github.com/elastic/security-team/issues/17089
    // include `cases-attachments.attributes.type === 'comment'`
    const filter = combineFilters([
      buildFilter({
        filters: [AttachmentType.user],
        field: 'type',
        operator: 'or',
        type: CASE_COMMENT_SAVED_OBJECT,
      }),
      authorizationFilter,
    ]);

    const theComments = await attachmentService.find({
      options: {
        page: queryParams?.page ?? DEFAULT_PAGE,
        perPage: queryParams?.perPage ?? DEFAULT_PER_PAGE,
        ...(queryParams?.sortOrder && { sortOrder: queryParams?.sortOrder }),
        sortField: 'created_at',
        hasReference: { type: CASE_SAVED_OBJECT, id: caseID },
        filter,
      },
      mode,
    });

    ensureSavedObjectsAreAuthorized(
      theComments.saved_objects.map((comment) => ({
        owner: comment.attributes.owner,
        id: comment.id,
      }))
    );

    const res = transformComments(theComments);

    return decodeOrThrow(AttachmentsFindResponseRt)(res);
  } catch (error) {
    throw createCaseError({
      message: `Failed to find comments case id: ${caseID}: ${error}`,
      error,
      logger,
    });
  }
}

/**
 * Retrieves a single attachment by its saved object id.
 */
export async function get(
  { savedObjectId, caseID, mode = 'legacy' }: GetArgs,
  clientArgs: CasesClientArgs
): Promise<AttachmentV2> {
  const {
    services: { attachmentService },
    logger,
    authorization,
  } = clientArgs;

  try {
    const comment = await attachmentService.getter.get({
      savedObjectId,
      mode,
    });

    await authorization.ensureAuthorized({
      entities: [{ owner: comment.attributes.owner, id: comment.id }],
      operation: Operations.getComment,
    });

    const res = flattenAttachmentSavedObject(comment);

    return decodeOrThrow(AttachmentRtV2)(res);
  } catch (error) {
    throw createCaseError({
      message: `Failed to get comment case id: ${caseID} attachment id: ${savedObjectId}: ${error}`,
      error,
      logger,
    });
  }
}

/**
 * Retrieves all the attachments for a case.
 */
export async function getAll(
  { caseID, mode = 'legacy' }: GetAllArgs,
  clientArgs: CasesClientArgs
): Promise<AttachmentsV2> {
  const {
    services: { caseService },
    logger,
    authorization,
  } = clientArgs;

  try {
    const { filter, ensureSavedObjectsAreAuthorized } = await getAttachmentAuthorizationFilter(
      authorization,
      Operations.getAllComments
    );

    const comments = await caseService.getAllCaseComments({
      id: caseID,
      options: {
        filter,
        sortField: defaultSortField,
      },
      mode,
    });

    ensureSavedObjectsAreAuthorized(
      comments.saved_objects.map((comment) => ({ id: comment.id, owner: comment.attributes.owner }))
    );

    const res = flattenAttachmentSavedObjects(comments.saved_objects);

    return decodeOrThrow(AttachmentsRtV2)(res);
  } catch (error) {
    throw createCaseError({
      message: `Failed to get all comments case id: ${caseID}: ${error}`,
      error,
      logger,
    });
  }
}
