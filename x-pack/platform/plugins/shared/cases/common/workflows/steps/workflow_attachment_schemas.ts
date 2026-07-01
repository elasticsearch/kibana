/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export interface WorkflowAttachmentSchemaEntry {
  id: string;
  schema?: z.ZodType;
  workflowSchema?: z.ZodObject | false;
}

export const selectWorkflowAttachmentSchemas = (
  attachments: WorkflowAttachmentSchemaEntry[]
): z.ZodObject[] =>
  attachments
    .flatMap((attachment) => {
      const schema = attachment.workflowSchema ?? attachment.schema;
      return schema instanceof z.ZodObject ? [{ id: attachment.id, schema }] : [];
    })
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ schema }) => schema);
