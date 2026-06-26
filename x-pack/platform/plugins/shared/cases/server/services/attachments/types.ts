/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type {
  Logger,
  SavedObject,
  SavedObjectReference,
  SavedObjectsBulkResponse,
  SavedObjectsClientContract,
  SavedObjectsUpdateOptions,
} from '@kbn/core/server';
import type { KueryNode } from '@kbn/es-query';
import type { AttachmentType } from '../../../common';
import type {
  AttachmentMode,
  AttachmentAttributesV2,
  AttachmentPatchAttributesV2,
} from '../../../common/types/domain';
import type { AttachmentPersistedAttributes } from '../../common/types/attachments_v1';
import type { UnifiedAttachmentAttributes } from '../../common/types/attachments_v2';
import type { PartialField } from '../../types';
import type { IndexRefresh } from '../types';
import type { ConfigType } from '../../config';

export type MixSavedObjectResponse =
  | SavedObject<AttachmentPersistedAttributes>
  | SavedObject<UnifiedAttachmentAttributes>
  | { id: string; error: unknown };

export interface ServiceContext {
  log: Logger;
  unsecuredSavedObjectsClient: SavedObjectsClientContract;
  config: ConfigType;
}

export interface AttachedToCaseArgs {
  caseId: string;
  filter?: KueryNode;
  attachmentTypes?: AttachmentType[];
}

export interface GetAttachmentArgs {
  savedObjectId: string;
  mode: AttachmentMode;
}

export type OptionalAttributes<T> = PartialField<SavedObject<T>, 'attributes'>;

export interface BulkOptionalAttributes<T>
  extends Omit<SavedObjectsBulkResponse<T>, 'saved_objects'> {
  saved_objects: Array<OptionalAttributes<T>>;
}

export type GetAllAlertsAttachToCaseArgs = AttachedToCaseArgs & {
  owner: string;
};

export interface AlertIdsAggsResult {
  alertIds: {
    buckets: Array<{
      key: string;
    }>;
  };
}

export interface EventIdsAggsResult {
  legacyEventIds: {
    buckets: Array<{
      key: string;
    }>;
  };
  unifiedEventIds: {
    buckets: Array<{
      key: string;
    }>;
  };
}

export type AlertsAttachedToCaseArgs = AttachedToCaseArgs;

export interface AttachmentsAttachedToCaseArgs extends AttachedToCaseArgs {
  attachmentType: AttachmentType;
  aggregations: Record<string, estypes.AggregationsAggregationContainer>;
}

export interface DeleteAttachmentArgs extends IndexRefresh {
  savedObjectIds: string[];
}

export interface CreateAttachmentArgs extends IndexRefresh {
  attributes: AttachmentAttributesV2;
  references: SavedObjectReference[];
  id: string;
}

export interface BulkCreateAttachments extends IndexRefresh {
  attachments: Array<{
    attributes: AttachmentAttributesV2;
    references: SavedObjectReference[];
    id: string;
  }>;
}

export interface UpdateArgs {
  savedObjectId: string;
  updatedAttributes: AttachmentPatchAttributesV2;
  options?: Omit<SavedObjectsUpdateOptions<AttachmentAttributesV2>, 'upsert'>;
}

export type UpdateAttachmentArgs = UpdateArgs;

export interface BulkUpdateAttachmentArgs extends IndexRefresh {
  comments: UpdateArgs[];
  requestWithoutType?: boolean;
}
