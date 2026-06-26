/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { selectWorkflowAttachmentSchemas } from './workflow_attachment_schemas';

describe('selectWorkflowAttachmentSchemas', () => {
  const runtimeSchema = z.object({ type: z.literal('runtime') });
  const workflowSchema = z.object({ type: z.literal('workflow') });

  it('falls back to the runtime schema when workflowSchema is unset', () => {
    expect(selectWorkflowAttachmentSchemas([{ id: 'a', schema: runtimeSchema }])).toEqual([
      runtimeSchema,
    ]);
  });

  it('uses workflowSchema when provided', () => {
    expect(
      selectWorkflowAttachmentSchemas([{ id: 'a', schema: runtimeSchema, workflowSchema }])
    ).toEqual([workflowSchema]);
  });

  it('excludes attachments when workflowSchema is false', () => {
    expect(
      selectWorkflowAttachmentSchemas([{ id: 'a', schema: runtimeSchema, workflowSchema: false }])
    ).toEqual([]);
  });

  it('excludes schemas that are not Zod objects', () => {
    expect(selectWorkflowAttachmentSchemas([{ id: 'a', schema: z.string() }])).toEqual([]);
  });

  it('sorts selected schemas by attachment id', () => {
    const aSchema = z.object({ type: z.literal('a') });
    const bSchema = z.object({ type: z.literal('b') });

    expect(
      selectWorkflowAttachmentSchemas([
        { id: 'b', schema: bSchema },
        { id: 'a', schema: aSchema },
      ])
    ).toEqual([aSchema, bSchema]);
  });
});
