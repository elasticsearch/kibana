/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SECURITY_ENTITY_ATTACHMENT_TYPE, type CaseUI } from '@kbn/cases-plugin/common';
import type {
  EntityAttachmentMetadata,
  EntityAttachmentPayload,
} from '../../../../common/cases/attachments/entity';
import type { EntitiesTableConfig } from '../../../entity_analytics/components/home/entities_table';

export type CaseAttachment = CaseUI['comments'][number];

/** Narrows to a `security.entity` attachment, rejecting alert attachments (array ids) and missing metadata. */
export const isEntityAttachment = (
  comment: CaseAttachment
): comment is CaseAttachment & EntityAttachmentPayload => {
  // Cast to a loose shape so we can access fields that only exist on some union members.
  const candidate = comment as {
    type?: string;
    attachmentId?: string | string[]; // alerts batch as string[], entities are always string
    metadata?: object | null;
  };
  return (
    candidate.type === SECURITY_ENTITY_ATTACHMENT_TYPE &&
    typeof candidate.attachmentId === 'string' &&
    candidate.metadata != null
  );
};

/** Case-insensitive match against an entity's name, type, and risk level. */
export const matchesSearchTerm = (metadata: EntityAttachmentMetadata, searchTerm: string) => {
  const searchableText = `${metadata.entityName} ${metadata.entityType} ${
    metadata.riskLevel ?? ''
  }`.toLowerCase();
  return searchableText.includes(searchTerm.toLowerCase());
};

/** Isolated table config so localStorage keys and flyout scope don't collide with the EA home page. */
export const CASE_ATTACHMENT_TABLE_CONFIG: EntitiesTableConfig = {
  tableId: 'entity-analytics-case-attachment-table',
  columnsLocalStorageKey: 'securitySolution.entityAnalytics.cases.attachment.columns',
  columnsSettingsLocalStorageKey:
    'securitySolution.entityAnalytics.cases.attachment.columns:settings',
  groupingLocalStorageKey: 'securitySolution.entityAnalytics.cases.attachment.grouping',
};
