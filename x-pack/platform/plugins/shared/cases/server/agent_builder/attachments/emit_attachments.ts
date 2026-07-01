/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools';
import type { Case } from '../../../common/types/domain';
import {
  CASE_ATTACHMENT_TYPE,
  CASES_ATTACHMENT_TYPE,
  CASES_ATTACHMENT_MAX,
  type CaseAttachmentData,
  type CasesAttachmentData,
} from '../../../common/types/agent_builder/attachment_schemas';

export const toCaseAttachmentData = (theCase: Case, url?: string | null): CaseAttachmentData => ({
  id: theCase.id,
  incremental_id: theCase.incremental_id ?? null,
  title: theCase.title,
  description: theCase.description,
  status: theCase.status,
  severity: theCase.severity,
  totalAlerts: theCase.totalAlerts,
  totalComment: theCase.totalComment,
  tags: theCase.tags,
  owner: theCase.owner as CaseAttachmentData['owner'],
  assignees: theCase.assignees ?? [],
  category: theCase.category ?? null,
  created_at: theCase.created_at,
  updated_at: theCase.updated_at ?? null,
  total_observables: theCase.total_observables ?? null,
  url: url ?? null,
  connector_name: theCase.connector?.name ?? null,
});

/**
 * Augments a tool result with the IDs of attachments emitted during the call.
 * The agent uses these IDs to render the attachments inline with
 * `<render_attachment id="..." />`. Without this on the result, the LLM has
 * no way to reference the attachment and the UI falls back to a text label.
 */
export const injectAttachmentIds = <T extends { results: Array<{ data?: unknown }> }>(
  toolResult: T,
  attachmentIds: string[]
): T => {
  if (attachmentIds.length === 0 || !toolResult.results?.[0]) {
    return toolResult;
  }
  const [first, ...rest] = toolResult.results;
  const existingData = (first.data ?? {}) as Record<string, unknown>;
  return {
    ...toolResult,
    results: [
      {
        ...first,
        data: {
          ...existingData,
          attachment_ids: attachmentIds,
        },
      },
      ...rest,
    ],
  };
};

export const emitCaseAttachment = async (
  attachments: ToolHandlerContext['attachments'],
  data: CaseAttachmentData,
  description?: string
): Promise<string> => {
  const added = await attachments.add({
    type: CASE_ATTACHMENT_TYPE,
    data,
    description: description ?? `Case: ${data.title}`,
  });
  return added.id;
};

export const emitCasesAttachment = async (
  attachments: ToolHandlerContext['attachments'],
  cases: CaseAttachmentData[],
  total: number,
  url?: string | null,
  description?: string
): Promise<string> => {
  const data: CasesAttachmentData = {
    cases: cases.slice(0, CASES_ATTACHMENT_MAX),
    total,
    url: url ?? null,
  };
  const added = await attachments.add({
    type: CASES_ATTACHMENT_TYPE,
    data,
    description: description ?? `${total} case(s)`,
  });
  return added.id;
};

/**
 * Emits the appropriate case attachment(s) from a step handler's tool result.
 * Many cases workflow steps return either `{ case: Case }` (single) or
 * `{ cases: Case[] }` (bulk). This helper picks the right emitter so write
 * tools (manage, attachments, observables) surface the affected case(s) to
 * the user as structured attachments rather than relying on text output.
 *
 * Returns the IDs of the emitted attachment(s). The caller should surface
 * these to the LLM via the tool result so the agent can render them inline
 * with `<render_attachment id="..." />`.
 */
export const emitFromStepResult = async (
  attachments: ToolHandlerContext['attachments'],
  toolResult: { results: Array<{ data?: unknown }> }
): Promise<string[]> => {
  const data = toolResult.results?.[0]?.data as { case?: Case; cases?: Case[] } | undefined;
  if (!data) return [];
  if (data.case) {
    const id = await emitCaseAttachment(attachments, toCaseAttachmentData(data.case));
    return [id];
  }
  if (Array.isArray(data.cases) && data.cases.length > 0) {
    // If only a single case was returned, treat it like a singular case attachment
    if (data.cases.length === 1) {
      const id = await emitCaseAttachment(attachments, toCaseAttachmentData(data.cases[0]));
      return [id];
    }
    const id = await emitCasesAttachment(
      attachments,
      data.cases.map((c) => toCaseAttachmentData(c)),
      data.cases.length
    );
    return [id];
  }
  return [];
};
