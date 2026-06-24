/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectReference } from '@kbn/core-saved-objects-common/src/server_types';
import type { SavedObjectAttachmentType, SupportedSavedObjectType } from './helpers';
import type { AttachmentUIV2 } from '../../../../../common/ui/types';

export interface SavedObjectMeta {
  icon?: string;
  title?: string;
  inAppUrl?: { path: string; uiCapabilitiesPath: string };
}

export interface FoundSavedObject {
  id: string;
  /**
   * Narrowed to the SO types the attach modal can search for; `useFindSavedObjects`
   * always passes a subset of `SUPPORTED_SO_TYPES`, so consumers don't need to cast.
   */
  type: SupportedSavedObjectType;
  meta: SavedObjectMeta;
  references?: SavedObjectReference[];
  updated_at?: string;
}

export interface SavedObjectFindResponse {
  saved_objects: FoundSavedObject[];
  total: number;
  page: number;
  per_page: number;
}

export interface SavedObjectAttachmentAttributes {
  /** Foreign SO id (matches the `attachmentId` field on the SO attachment payload). */
  attachmentId: string;
  soType: SupportedSavedObjectType;
  title?: string;
}

export type SavedObjectAttachmentUI = AttachmentUIV2 & {
  type: SavedObjectAttachmentType;
  attachmentId: string;
  metadata: {
    soType: SupportedSavedObjectType;
    title?: string;
  };
};
