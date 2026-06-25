/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject, SavedObjectsClientContract } from '@kbn/core/server';
import type {
  CaseUserActionWithoutReferenceIds,
  AttachmentAttributesWithoutRefs,
} from '../../../common/types/domain';
import type { AttachmentAttributesV2 } from '../../../common/types/domain/attachment/v2';
import {
  CASE_ATTACHMENT_SAVED_OBJECT,
  CASE_COMMENT_SAVED_OBJECT,
  CASE_SAVED_OBJECT,
  CASE_USER_ACTION_SAVED_OBJECT,
  MAX_DOCS_PER_PAGE,
} from '../../../common/constants';
import { defaultSortField } from '../../common/utils';

export async function getAttachmentsAndUserActionsForCases(
  savedObjectsClient: SavedObjectsClientContract,
  caseIds: string[],
  includeCaseAttachments = false
): Promise<
  Array<
    SavedObject<
      AttachmentAttributesWithoutRefs | AttachmentAttributesV2 | CaseUserActionWithoutReferenceIds
    >
  >
> {
  const attachmentTypes = includeCaseAttachments
    ? [CASE_COMMENT_SAVED_OBJECT, CASE_ATTACHMENT_SAVED_OBJECT]
    : CASE_COMMENT_SAVED_OBJECT;

  const [attachments, userActions] = await Promise.all([
    getAssociatedObjects<AttachmentAttributesWithoutRefs | AttachmentAttributesV2>({
      savedObjectsClient,
      caseIds,
      sortField: defaultSortField,
      type: attachmentTypes,
    }),
    getAssociatedObjects<CaseUserActionWithoutReferenceIds>({
      savedObjectsClient,
      caseIds,
      sortField: defaultSortField,
      type: CASE_USER_ACTION_SAVED_OBJECT,
    }),
  ]);

  return [...attachments, ...userActions];
}

async function getAssociatedObjects<T>({
  savedObjectsClient,
  caseIds,
  sortField,
  type,
}: {
  savedObjectsClient: SavedObjectsClientContract;
  caseIds: string[];
  sortField: string;
  type: string | string[];
}): Promise<Array<SavedObject<T>>> {
  const references = caseIds.map((id) => ({ type: CASE_SAVED_OBJECT, id }));
  const finder = savedObjectsClient.createPointInTimeFinder<T>({
    type,
    hasReferenceOperator: 'OR',
    hasReference: references,
    perPage: MAX_DOCS_PER_PAGE,
    sortField,
    sortOrder: 'asc',
  });

  let result: Array<SavedObject<T>> = [];
  for await (const findResults of finder.find()) {
    result = result.concat(findResults.saved_objects);
  }

  return result;
}
