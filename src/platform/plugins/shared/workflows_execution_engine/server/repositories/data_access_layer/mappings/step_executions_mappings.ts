/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mappings } from '@kbn/es-mappings';
import { STEP_USAGE_MAPPING, TOKEN_USAGE_MAPPING } from './common';

export const WORKFLOWS_STEP_EXECUTIONS_INDEX_MAPPINGS = {
  dynamic: false,
  properties: {
    spaceId: mappings.keyword(),
    id: mappings.keyword(),
    stepId: mappings.keyword(),
    // Indexed so callers can filter step executions by their YAML step
    // type — e.g. listing every `wait_for_input` step across a space.
    // The field is always present in `_source`; the mapping just
    // promotes it to a queryable keyword.
    stepType: mappings.keyword(),
    workflowRunId: mappings.keyword(),
    workflowId: mappings.keyword(),
    managed: mappings.boolean(),
    status: mappings.keyword(),
    // Optional Human-In-The-Loop audit envelope, populated only by
    // HITL-aware steps (today: `wait_for_input`). Nested under `hitl`
    // to keep the top-level step schema generic — the engine itself
    // remains field-agnostic and readers MUST treat the wrapper and
    // every property inside it as optional.
    //
    // The audit is written synchronously when a responder submits a
    // response, before the engine resumes the step, so every channel
    // (Kibana Inbox UI, Slack, Agent Builder, raw API/MCP) lands the same
    // audit row and the "responded but not yet resumed" state is
    // observable from the step doc alone.
    //
    // Lives on the step doc rather than the workflow execution
    // context so workflows with multiple HITL steps keep a distinct
    // audit per step, and so cross-workflow listings can filter and
    // sort on these fields directly. See [security-team#16706].
    //
    // [security-team#16706]: https://github.com/elastic/security-team/issues/16706
    hitl: mappings.object({
      dynamic: false,
      properties: {
        respondedBy: mappings.keyword(),
        respondedAt: mappings.date(),
        channel: mappings.keyword(),
      },
    }),
    isTestRun: mappings.boolean(),
    startedAt: mappings.date(),
    finishedAt: mappings.date(),
    duration: mappings.long(),
    // Per-step token usage, extracted from `output.metadata.usage`.
    usage: TOKEN_USAGE_MAPPING,
    stepUsage: STEP_USAGE_MAPPING,
  },
};
