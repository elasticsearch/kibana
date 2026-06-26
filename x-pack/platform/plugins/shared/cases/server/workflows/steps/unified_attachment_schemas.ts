/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { selectWorkflowAttachmentSchemas } from '../../../common/workflows/steps/workflow_attachment_schemas';
import type { UnifiedAttachmentTypeRegistry } from '../../attachment_framework/unified_attachment_registry';

/**
 * Returns the attachment payload schemas eligible for inclusion in the
 * generic `cases.addAttachment(s)` step's discriminated union:
 *
 *   - registered with a full-payload `schema` (not `schemaValidator` only)
 *   - workflow schema (or fallback runtime schema) is a `ZodObject`
 *   - `workflowSchema` is not `false`
 *
 * Sorted by registered id ASC for deterministic snapshot output.
 */
export const selectAuthorableAttachmentSchemas = (
  registry: UnifiedAttachmentTypeRegistry
): ReturnType<typeof selectWorkflowAttachmentSchemas> =>
  selectWorkflowAttachmentSchemas(registry.list());
