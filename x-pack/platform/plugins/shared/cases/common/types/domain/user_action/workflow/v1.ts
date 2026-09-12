/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as rt from 'io-ts';
import { UserActionTypes } from '../action/v1';
import {
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  CASE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
} from './constants';

/** Identifies the workflow plus the specific execution to link to. */
export const WorkflowPayloadRt = rt.strict({
  id: rt.string,
  name: rt.string,
  executionId: rt.string,
});

/**
 * The activity origin: what the user was looking at when they triggered the workflow run.
 *
 * This is a discriminated union so each variant carries only the enrichment fields that
 * `buildActivityOrigin` actually writes for that type. A `cases.case` origin never carries
 * `index`, `typeKey`, or `value`; a `cases.observable` origin never carries `index`.
 *
 * - `cases.case`        — triggered from the case detail page.
 * - `cases.observable`  — triggered from the observables table for a specific observable;
 *                         carries optional `typeKey` + `value` for display.
 * - `cases.observables` — triggered from the observables table with a multi-observable selection;
 *                         carries optional `count` for display in the activity feed.
 * - `cases.attachment`  — triggered from one registered attachment target; carries its
 *                         normalized attachment type and optional index.
 * - `cases.attachments` — triggered from a registered attachment bulk surface; carries its
 *                         normalized attachment type and optional count.
 */
export const WorkflowOriginRt = rt.union([
  rt.strict({
    type: rt.literal(CASE_WORKFLOW_ORIGIN_TYPE),
    /** The primary identifier: caseId. */
    id: rt.string,
  }),
  rt.exact(
    rt.intersection([
      rt.type({
        type: rt.literal(OBSERVABLE_WORKFLOW_ORIGIN_TYPE),
        /** The primary identifier: observableId. */
        id: rt.string,
      }),
      rt.partial({
        /** The observable type key (e.g. 'ip', 'url'). */
        typeKey: rt.string,
        /** The observable value for display. */
        value: rt.string,
      }),
    ])
  ),
  rt.exact(
    rt.intersection([
      rt.type({
        type: rt.literal(OBSERVABLES_WORKFLOW_ORIGIN_TYPE),
        /** The primary identifier: caseId. */
        id: rt.string,
      }),
      rt.partial({
        /** Number of observables in the selection, for display in the activity feed. */
        count: rt.number,
      }),
    ])
  ),
  rt.exact(
    rt.intersection([
      rt.type({
        type: rt.literal(ATTACHMENT_WORKFLOW_ORIGIN_TYPE),
        /** The primary identifier: attachmentId. */
        id: rt.string,
        /** The normalized registered attachment type. */
        attachmentType: rt.string,
      }),
      rt.partial({
        /** Optional ES index used by document-backed attachment actions. */
        index: rt.string,
      }),
    ])
  ),
  rt.exact(
    rt.intersection([
      rt.type({
        type: rt.literal(ATTACHMENTS_WORKFLOW_ORIGIN_TYPE),
        /** The primary identifier: caseId. */
        id: rt.string,
        /** The normalized registered attachment type. */
        attachmentType: rt.string,
      }),
      rt.partial({
        /** Number of selected attachment targets. */
        count: rt.number,
      }),
    ])
  ),
]);

export const WorkflowUserActionPayloadRt = rt.exact(
  rt.intersection([
    rt.type({ workflow: WorkflowPayloadRt }),
    rt.partial({ origin: WorkflowOriginRt }),
  ])
);

export const WorkflowUserActionRt = rt.strict({
  type: rt.literal(UserActionTypes.workflow),
  payload: WorkflowUserActionPayloadRt,
});

export type WorkflowPayload = rt.TypeOf<typeof WorkflowPayloadRt>;
export type WorkflowOrigin = rt.TypeOf<typeof WorkflowOriginRt>;
export type WorkflowUserActionPayload = rt.TypeOf<typeof WorkflowUserActionPayloadRt>;
