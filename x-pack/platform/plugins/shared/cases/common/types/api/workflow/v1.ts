/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import {
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  CASES_WORKFLOW_EXECUTION_METADATA_SCHEMA_VERSION,
  CASES_WORKFLOW_EXECUTION_SOURCE,
  CASE_WORKFLOW_ORIGIN_TYPE,
  MAX_ATTACHMENTS_PER_WORKFLOW_RUN,
  MAX_ATTACHMENT_ID_LENGTH,
  MAX_ATTACHMENT_TYPE_LENGTH,
  MAX_CASES_PER_WORKFLOW_RUN,
  MAX_CASE_WORKFLOW_RUN_ID_LENGTH,
  MAX_OBSERVABLES_PER_CASE,
  MAX_WORKFLOW_INPUT_KEY_LENGTH,
  MAX_WORKFLOW_INPUTS_BYTES,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
} from '../../../constants';

const idField = z.string().min(1).max(MAX_CASE_WORKFLOW_RUN_ID_LENGTH);
const attachmentIdField = z.string().min(1).max(MAX_ATTACHMENT_ID_LENGTH);
const attachmentTypeField = z.string().min(1).max(MAX_ATTACHMENT_TYPE_LENGTH);

/**
 * Identifies where the user was when they triggered the workflow run.
 * Each variant is a discriminated union member and carries only the identifiers
 * relevant to that surface — no overloaded `id` field.
 *
 * - `cases.case`        — triggered from the case detail page.
 * - `cases.observable`  — triggered from the observables table for a specific observable.
 * - `cases.observables` — triggered from the observables table with a multi-observable selection.
 * - `cases.attachment`  — triggered from a registered attachment's row action.
 * - `cases.attachments` — triggered from a registered attachment's bulk action.
 *
 * `origin` is **optional** on the request. When absent the run is treated as a
 * list-surface (bulk) run: the caller was not looking at any specific sub-entity,
 * the full case set is described by `caseIds`, and alert inputs are not permitted.
 *
 * The API schema carries identifiers only. Display enrichment (alert index, observable
 * typeKey/value) is derived server-side from the case at activity-write time so that
 * client-supplied label text cannot spoof the activity log.
 *
 * Registered attachment types use the generic attachment variants. Their server registration
 * validates and enriches the origin, while their public registration supplies activity UI.
 */
export const CaseWorkflowRunOriginSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal(CASE_WORKFLOW_ORIGIN_TYPE),
      caseId: idField,
    })
    .strict(),
  z
    .object({
      type: z.literal(OBSERVABLE_WORKFLOW_ORIGIN_TYPE),
      caseId: idField,
      observableId: idField,
    })
    .strict(),
  z
    .object({
      type: z.literal(OBSERVABLES_WORKFLOW_ORIGIN_TYPE),
      caseId: idField,
      observableIds: z.array(idField).min(1).max(MAX_OBSERVABLES_PER_CASE),
    })
    .strict(),
  z
    .object({
      type: z.literal(ATTACHMENT_WORKFLOW_ORIGIN_TYPE),
      caseId: idField,
      attachmentType: attachmentTypeField,
      attachmentId: attachmentIdField,
    })
    .strict(),
  z
    .object({
      type: z.literal(ATTACHMENTS_WORKFLOW_ORIGIN_TYPE),
      caseId: idField,
      attachmentType: attachmentTypeField,
      attachmentIds: z.array(attachmentIdField).min(1).max(MAX_ATTACHMENTS_PER_WORKFLOW_RUN),
    })
    .strict(),
]);

export type CaseWorkflowRunOrigin = z.infer<typeof CaseWorkflowRunOriginSchema>;

export const CasesWorkflowExecutionMetadataSchema = z
  .object({
    schemaVersion: z.literal(CASES_WORKFLOW_EXECUTION_METADATA_SCHEMA_VERSION),
    source: z.literal(CASES_WORKFLOW_EXECUTION_SOURCE),
    caseIds: z
      .array(z.string().min(1).max(MAX_CASE_WORKFLOW_RUN_ID_LENGTH))
      .min(1)
      .max(MAX_CASES_PER_WORKFLOW_RUN),
    origin: CaseWorkflowRunOriginSchema.optional(),
  })
  .strict();

export type CasesWorkflowExecutionMetadata = z.infer<typeof CasesWorkflowExecutionMetadataSchema>;

export const RunCaseWorkflowRequestSchema = z
  .object({
    caseIds: z
      .array(idField)
      .min(1)
      .max(MAX_CASES_PER_WORKFLOW_RUN)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'caseIds must not contain duplicates.',
      }),
    inputs: z
      .record(z.string().max(MAX_WORKFLOW_INPUT_KEY_LENGTH), z.unknown())
      .refine(
        (inputs) =>
          new TextEncoder().encode(JSON.stringify(inputs)).length <= MAX_WORKFLOW_INPUTS_BYTES,
        { message: `Workflow inputs cannot exceed ${MAX_WORKFLOW_INPUTS_BYTES} bytes.` }
      ),
    origin: CaseWorkflowRunOriginSchema.optional(),
  })
  .strict();

export type RunCaseWorkflowRequest = z.infer<typeof RunCaseWorkflowRequestSchema>;

export const RunCaseWorkflowResponseSchema = z
  .object({
    workflowExecutionId: z.string(),
    activityStatus: z.enum(['succeeded', 'failed']),
  })
  .strict();

export type RunCaseWorkflowResponse = z.infer<typeof RunCaseWorkflowResponseSchema>;
