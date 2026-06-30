/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsFindOptions } from '@kbn/core-saved-objects-api-server';
import type { DecoratedError, SavedObject } from '@kbn/core-saved-objects-server';
import type { SavedObjectError } from '@kbn/core/types';
import type { KueryNode } from '@kbn/es-query';
import type {
  AttachmentAttributes,
  ExternalReferenceSOAttachmentPayload,
  FileAttachmentMetadata,
} from '../../common/types/domain';

/**
 * This structure holds the alert ID and index from an alert comment
 */
export interface AlertInfo {
  id: string;
  index: string;
}

export type FindOptions = Pick<
  SavedObjectsFindOptions,
  | 'defaultSearchOperator'
  | 'hasReferenceOperator'
  | 'perPage'
  | 'hasReference'
  | 'fields'
  | 'page'
  | 'search'
  | 'searchFields'
  | 'sortField'
  | 'sortOrder'
  | 'rootSearchFields'
>;

export type SavedObjectFindOptionsKueryNode = FindOptions & {
  filter?: KueryNode;
};

export type FileAttachmentRequest = Omit<
  ExternalReferenceSOAttachmentPayload,
  'externalReferenceMetadata'
> & {
  externalReferenceMetadata: FileAttachmentMetadata;
};

export type AttachmentSavedObject = SavedObject<AttachmentAttributes>;

export type SOWithErrors<T> = Partial<
  Omit<SavedObject<T>, 'attributes' | 'error' | 'id' | 'type'>
> & {
  id: string;
  type: string;
  error: SavedObjectError | DecoratedError;
};

export interface SavedObjectsBulkResponseWithErrors<T> {
  saved_objects: Array<SavedObject<T> | SOWithErrors<T>>;
}

export interface CaseErrorResponse {
  error: string;
  message: string;
  status: number;
}
