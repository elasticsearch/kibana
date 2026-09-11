/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';
import { platformCoreTools, ToolType } from '@kbn/agent-builder-common';
import { ATTACHMENT_REF_ACTOR, getLatestVersion } from '@kbn/agent-builder-common/attachments';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { createErrorResult, createOtherResult } from '@kbn/agent-builder-server';
import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { AS_CODE_ESQL_DATA_SOURCE_TYPE } from '@kbn/as-code-data-views-schema';
import { getDateRange } from '@kbn/timerange';
import {
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  DISCOVER_SESSION_SKILL_ID,
} from '../../common/agent_builder';
import {
  discoverSessionApiDataSchema,
  MAX_SESSION_TITLE_LENGTH,
  MAX_TAB_LABEL_LENGTH,
  type DiscoverSessionApiData,
} from '../api/schema';

const MAX_ESQL_LENGTH = 4096;
const MAX_TIME_RANGE_BOUND_LENGTH = 128;
const MAX_COLUMN_NAME_LENGTH = 1024;
const MAX_COLUMNS = 100;
const SESSION_TAB_ID = 'main';

const timeRangeSchema = z
  .object({
    from: z.string().min(1).max(MAX_TIME_RANGE_BOUND_LENGTH),
    to: z.string().min(1).max(MAX_TIME_RANGE_BOUND_LENGTH),
  })
  .check((ctx) => {
    try {
      getDateRange(ctx.value);
    } catch (err) {
      ctx.issues.push({
        code: 'custom',
        message: err instanceof Error ? err.message : 'Invalid time_range',
        input: ctx.value,
      });
    }
  });

interface DiscoverSessionToolPatch {
  title?: string;
  esql?: string;
  time_range?: { from: string; to: string } | null;
  columns?: string[] | null;
}

const PLACEHOLDER_ATTACHMENT_IDS = new Set([
  '.',
  '..',
  'id',
  'attachment_id',
  'undefined',
  'null',
  'none',
  'n/a',
  'screen-context',
  'screen_context',
  DISCOVER_SESSION_SKILL_ID,
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  'discover_session',
  'create_discover_session',
  platformCoreTools.createDiscoverSession,
]);

const isPlaceholderAttachmentId = (id: string): boolean => {
  const trimmed = id.trim();
  if (!trimmed) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_ATTACHMENT_IDS.has(lower)) {
    return true;
  }
  return /^\{[^}]*\}$/.test(trimmed) || /^<[^>]*>$/.test(trimmed);
};

const sanitizeEsql = (esql: string): string =>
  esql.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const normalizeAttachmentId = (id: string | undefined): string | undefined => {
  if (typeof id !== 'string') {
    return undefined;
  }
  const trimmed = id.trim();
  if (!trimmed || isPlaceholderAttachmentId(trimmed)) {
    return undefined;
  }
  return trimmed;
};

const createDiscoverSessionSchema = z
  .object({
    attachment_id: z.preprocess(
      (value) => (typeof value === 'string' ? normalizeAttachmentId(value) : value),
      z
        .string()
        .min(1)
        .max(256)
        .optional()
        .describe(
          '(optional) ID of an existing Discover session attachment to update. Use only an id from a previous result of this tool. Never invent one. Never pass the skill name, "discover.session", "screen-context", ".", or placeholders. Omit this field to create, or to update the only Discover session in the conversation.'
        )
    ),
    title: z
      .string()
      .min(1)
      .max(MAX_SESSION_TITLE_LENGTH)
      .optional()
      .describe(
        'Title for the Discover session. Required on create unless you accept the default. On update, omit to keep the existing title.'
      ),
    esql: z.preprocess(
      (value) => (typeof value === 'string' ? sanitizeEsql(value) : value),
      z
        .string()
        .min(1)
        .max(MAX_ESQL_LENGTH)
        .optional()
        .describe(
          'An ES|QL query that returns documents (not aggregations). Only pass queries from generateEsql, executeEsql, or the user — never invent ES|QL.'
        )
    ),
    time_range: timeRangeSchema
      .nullable()
      .optional()
      .describe(
        'Optional time range. On update, omit to keep the existing time range. Pass null to clear the time range.'
      ),
    columns: z
      .array(z.string().min(1).max(MAX_COLUMN_NAME_LENGTH))
      .max(MAX_COLUMNS)
      .nullable()
      .optional()
      .describe(
        'Optional table columns. On update, omit to keep the existing columns. Pass null or [] to reset to default columns.'
      ),
  })
  .check((ctx) => {
    const { attachment_id: attachmentId, title, esql, time_range: timeRange, columns } = ctx.value;
    const issue = (message: string) =>
      ctx.issues.push({ code: 'custom', message, input: ctx.value });

    if (
      title === undefined &&
      esql === undefined &&
      timeRange === undefined &&
      columns === undefined
    ) {
      issue(
        attachmentId
          ? 'When updating, provide at least one of title, esql, time_range, or columns.'
          : 'esql is required when creating a Discover session.'
      );
    }
  });

const DEFAULT_SESSION_TITLE = 'Discover session';

const truncateTabLabel = (title: string): string =>
  title.length > MAX_TAB_LABEL_LENGTH ? title.slice(0, MAX_TAB_LABEL_LENGTH) : title;

const buildDiscoverSessionToolData = ({
  title,
  esql,
  time_range: timeRange,
  columns,
}: {
  title: string;
  esql: string;
  time_range?: { from: string; to: string } | null;
  columns?: string[] | null;
}): DiscoverSessionApiData | { error: string } => {
  const tab: Record<string, unknown> = {
    id: SESSION_TAB_ID,
    label: truncateTabLabel(title),
    data_source: {
      type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
      query: esql,
    },
    hide_chart: true,
    hide_table: false,
  };

  if (timeRange) {
    tab.time_range = timeRange;
  }

  if (columns && columns.length > 0) {
    tab.column_order = columns;
  }

  const parseResult = discoverSessionApiDataSchema.safeParse({
    title,
    tabs: [tab],
  });

  if (!parseResult.success) {
    return { error: parseResult.error.message };
  }

  return parseResult.data;
};

const mergeDiscoverSessionToolData = (
  existing: DiscoverSessionApiData,
  patch: DiscoverSessionToolPatch
): DiscoverSessionApiData | { error: string } => {
  if (existing.tabs.length !== 1) {
    return { error: 'Only one-tab Discover sessions can be updated.' };
  }

  const existingTab = existing.tabs[0];
  if (existingTab.data_source.type !== AS_CODE_ESQL_DATA_SOURCE_TYPE) {
    return { error: 'Only ES|QL Discover sessions can be updated.' };
  }

  const nextTab: Record<string, unknown> = {
    ...existingTab,
    data_source: { ...existingTab.data_source },
  };
  delete nextTab.time_restore;

  if (patch.title !== undefined) {
    nextTab.label = truncateTabLabel(patch.title);
  }

  if (patch.esql !== undefined) {
    nextTab.data_source = {
      ...existingTab.data_source,
      query: patch.esql,
    };
  }

  if (patch.time_range === null) {
    delete nextTab.time_range;
  } else if (patch.time_range) {
    nextTab.time_range = patch.time_range;
  }

  if (patch.columns === null || (Array.isArray(patch.columns) && patch.columns.length === 0)) {
    delete nextTab.column_order;
  } else if (patch.columns) {
    nextTab.column_order = patch.columns;
  }

  const parseResult = discoverSessionApiDataSchema.safeParse({
    ...existing,
    title: patch.title ?? existing.title,
    tabs: [nextTab],
  });

  if (!parseResult.success) {
    return { error: parseResult.error.message };
  }

  return parseResult.data;
};

const stripLegacyTimeRestore = (data: unknown): unknown => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }

  const session = data as Record<string, unknown>;
  if (!Array.isArray(session.tabs)) {
    return data;
  }

  return {
    ...session,
    tabs: session.tabs.map((tab) => {
      if (!tab || typeof tab !== 'object' || Array.isArray(tab)) {
        return tab;
      }
      const nextTab = { ...(tab as Record<string, unknown>) };
      delete nextTab.time_restore;
      return nextTab;
    }),
  };
};

const listDiscoverSessionIds = (attachments: Pick<AttachmentStateManager, 'getActive'>): string[] =>
  attachments
    .getActive()
    .filter((attachment) => attachment.type === DISCOVER_SESSION_ATTACHMENT_TYPE)
    .map((attachment) => attachment.id);

const resolveDiscoverSessionTargetId = ({
  attachmentId,
  attachments,
}: {
  attachmentId: string | undefined;
  attachments: Pick<AttachmentStateManager, 'getActive' | 'getAttachmentRecord'>;
}): { targetId?: string; unknownId?: string; existingIds: string[] } => {
  const requestedId = normalizeAttachmentId(attachmentId);
  const existingIds = listDiscoverSessionIds(attachments);

  if (requestedId) {
    const record = attachments.getAttachmentRecord(requestedId);
    if (record?.type === DISCOVER_SESSION_ATTACHMENT_TYPE) {
      return { targetId: requestedId, existingIds };
    }
    // Real unknown or wrong-type ids fail closed. Known placeholders are
    // stripped in normalizeAttachmentId and fall through as omitted.
    return { unknownId: requestedId, existingIds };
  }

  if (existingIds.length === 1) {
    return { targetId: existingIds[0], existingIds };
  }

  return { existingIds };
};

const getEsqlQuery = (session: DiscoverSessionApiData): string => {
  const [tab] = session.tabs;
  return tab.data_source.type === AS_CODE_ESQL_DATA_SOURCE_TYPE ? tab.data_source.query : '';
};

const createSessionToolResult = ({
  attachmentId,
  version,
  esql,
}: {
  attachmentId: string;
  version: number;
  esql: string;
}) =>
  createOtherResult({
    attachment_id: attachmentId,
    version,
    esql,
    render: `<render_attachment id="${attachmentId}" version="${version}" />`,
    next_action: 'stop',
  });

const updateDiscoverSessionAttachment = async ({
  attachmentId,
  patch,
  attachments,
  logger,
}: {
  attachmentId: string;
  patch: DiscoverSessionToolPatch;
  attachments: Pick<AttachmentStateManager, 'getAttachmentRecord' | 'update'>;
  logger: { error: (message: string) => void };
}) => {
  const record = attachments.getAttachmentRecord(attachmentId);
  if (!record) {
    return {
      results: [createErrorResult(`Discover session attachment "${attachmentId}" not found.`)],
    };
  }

  if (record.active === false) {
    return {
      results: [
        createErrorResult(`Cannot update deleted Discover session attachment "${attachmentId}".`),
      ],
    };
  }

  if (record.type !== DISCOVER_SESSION_ATTACHMENT_TYPE) {
    return {
      results: [
        createErrorResult(
          `Attachment "${attachmentId}" is type "${record.type}", not a Discover session. Omit attachment_id and call this tool again to create a session. Never pass screen-context or other non-session ids.`
        ),
      ],
    };
  }

  if (record.readonly === true) {
    return {
      results: [
        createErrorResult(
          `Discover session attachment "${attachmentId}" is read-only. Omit attachment_id and call this tool again to create a new session. Do not retry this id.`
        ),
      ],
    };
  }

  const latestVersion = getLatestVersion(record);
  if (!latestVersion?.data) {
    return {
      results: [
        createErrorResult(
          `Discover session attachment "${attachmentId}" has no readable session data.`
        ),
      ],
    };
  }

  const existingParse = discoverSessionApiDataSchema.safeParse(
    stripLegacyTimeRestore(latestVersion.data)
  );
  if (!existingParse.success) {
    return {
      results: [
        createErrorResult(
          `Discover session attachment "${attachmentId}" has invalid session data.`
        ),
      ],
    };
  }

  const sessionData = mergeDiscoverSessionToolData(existingParse.data, patch);

  if ('error' in sessionData) {
    logger.error(`Invalid Discover session update: ${sessionData.error}`);
    return {
      results: [createErrorResult(`Failed to update Discover session: ${sessionData.error}`)],
    };
  }

  try {
    const updated = await attachments.update(
      attachmentId,
      {
        data: sessionData,
        description: `Discover session: ${sessionData.title}`,
      },
      ATTACHMENT_REF_ACTOR.agent
    );

    if (!updated) {
      return {
        results: [createErrorResult(`Discover session attachment "${attachmentId}" not found.`)],
      };
    }

    return {
      results: [
        createSessionToolResult({
          attachmentId,
          version: updated.current_version,
          esql: getEsqlQuery(sessionData),
        }),
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to persist Discover session attachment: ${message}`);
    return {
      results: [createErrorResult(`Failed to save Discover session: ${message}`)],
    };
  }
};

export const createDiscoverSessionTool = (): BuiltinToolDefinition<
  typeof createDiscoverSessionSchema
> => {
  return {
    id: platformCoreTools.createDiscoverSession,
    type: ToolType.builtin,
    description: `Create or update a Discover session attachment that shows a live document table in chat. Use this when the user should see raw documents or rows, not a chart.

Pass an ES|QL query that returns documents (FROM or TS with WHERE/LIMIT as needed). Copy the "esql" string from generateEsql into the "esql" parameter — do not wrap it in an object and do not invent ES|QL. Do not use this for aggregations (STATS) or charts; use ${platformCoreTools.createVisualization} instead.

Do not pass attachment_id unless a previous result of this same tool returned that exact id. Never invent an id. Never pass the skill name, "discover.session", "screen-context", ".", or "{attachment_id}". Omit attachment_id to create when none exists, or to update the conversation's only Discover session. On update, omit fields you want to keep; pass null for time_range or columns to clear them. esql is required only when creating.

Call this tool once per user request. After a successful result, stop calling tools. Paste the returned "render" string into your reply verbatim — do not build the tag yourself. Do not create a second session unless the user asked for another table.

This tool does not execute the query. It stores a by-value Discover session (one tab, chart hidden). Do not paste rows, tab JSON, or vis_context into the conversation.`,
    schema: createDiscoverSessionSchema,
    tags: [],
    annotations: {
      title: 'Create or update Discover session',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    handler: async (
      { attachment_id: attachmentId, title, esql, time_range: timeRange, columns },
      { attachments, logger }
    ) => {
      const { targetId, unknownId, existingIds } = resolveDiscoverSessionTargetId({
        attachmentId,
        attachments,
      });

      if (targetId) {
        return updateDiscoverSessionAttachment({
          attachmentId: targetId,
          patch: { title, esql, time_range: timeRange, columns },
          attachments,
          logger,
        });
      }

      if (unknownId) {
        const existingHint = existingIds.length
          ? ` Existing Discover session ids: ${existingIds.join(', ')}.`
          : '';
        return {
          results: [
            createErrorResult(
              `Discover session attachment "${unknownId}" not found.${existingHint}`
            ),
          ],
        };
      }

      if (!esql) {
        return {
          results: [createErrorResult('esql is required when creating a Discover session.')],
        };
      }

      const sessionTitle = title ?? DEFAULT_SESSION_TITLE;
      const sessionData = buildDiscoverSessionToolData({
        title: sessionTitle,
        esql,
        time_range: timeRange,
        columns,
      });

      if ('error' in sessionData) {
        logger.error(`Invalid Discover session data: ${sessionData.error}`);
        return {
          results: [createErrorResult(`Failed to create Discover session: ${sessionData.error}`)],
        };
      }

      try {
        const attachment = await attachments.add(
          {
            type: DISCOVER_SESSION_ATTACHMENT_TYPE,
            data: sessionData,
            description: `Discover session: ${sessionTitle}`,
          },
          ATTACHMENT_REF_ACTOR.agent
        );

        return {
          results: [
            createSessionToolResult({
              attachmentId: attachment.id,
              version: attachment.current_version,
              esql,
            }),
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to persist Discover session attachment: ${message}`);
        return {
          results: [createErrorResult(`Failed to save Discover session: ${message}`)],
        };
      }
    },
  };
};
