/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const ENTITY_PREVIEW_LIMIT = 10;

/**
 * Render an EUID list for a HITL confirmation message body. For lists at or
 * under {@link ENTITY_PREVIEW_LIMIT} entries, all ids are shown. Beyond that
 * the first {@link ENTITY_PREVIEW_LIMIT} are shown with an "...and N more" suffix
 */
export const formatEntityIdsForPrompt = (entityIds: readonly string[]): string => {
  if (entityIds.length <= ENTITY_PREVIEW_LIMIT) {
    return `**Entities:** ${entityIds.join(', ')}`;
  }
  const head = entityIds.slice(0, ENTITY_PREVIEW_LIMIT).join(', ');
  const remaining = entityIds.length - ENTITY_PREVIEW_LIMIT;
  return `**Entities (first ${ENTITY_PREVIEW_LIMIT}):** ${head} … and ${remaining} more`;
};
