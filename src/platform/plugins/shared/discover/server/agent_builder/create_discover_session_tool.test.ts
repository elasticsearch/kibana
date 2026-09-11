/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/core/server';
import { platformCoreTools } from '@kbn/agent-builder-common';
import { ATTACHMENT_REF_ACTOR } from '@kbn/agent-builder-common/attachments';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import {
  AS_CODE_DATA_VIEW_REFERENCE_TYPE,
  AS_CODE_ESQL_DATA_SOURCE_TYPE,
} from '@kbn/as-code-data-views-schema';
import { DISCOVER_SESSION_ATTACHMENT_TYPE } from '../../common/agent_builder';
import { MAX_SESSION_TITLE_LENGTH, MAX_TAB_LABEL_LENGTH } from '../api/schema';
import { createDiscoverSessionTool } from './create_discover_session_tool';

const ESQL = 'FROM logs-* | WHERE status >= 500 | LIMIT 100';
const UPDATED_ESQL = 'FROM logs-* | WHERE status >= 400 | LIMIT 50';

const esqlSessionData = {
  title: 'Nginx errors',
  tabs: [
    {
      id: 'main',
      label: 'Nginx errors',
      data_source: {
        type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
        query: ESQL,
      },
      hide_chart: true,
      hide_table: false,
      time_range: { from: 'now-24h', to: 'now' },
      column_order: ['@timestamp', 'message'],
      breakdown_field: 'host.name',
    },
  ],
};

const classicSessionData = {
  title: 'Classic logs',
  tabs: [
    {
      id: 'tab-classic',
      label: 'Logs',
      data_source: {
        type: AS_CODE_DATA_VIEW_REFERENCE_TYPE,
        ref_id: 'logs-data-view',
      },
      filters: [],
      sort: [],
      view_mode: 'documents',
      hide_chart: false,
      hide_table: false,
    },
  ],
};

const createLogger = (): Logger =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger);

const createAttachments = () => ({
  getActive: jest.fn().mockReturnValue([]),
  getAttachmentRecord: jest.fn().mockReturnValue(undefined),
  add: jest.fn().mockResolvedValue({ id: 'att-session', current_version: 1 }),
  update: jest.fn().mockResolvedValue({ id: 'att-session', current_version: 2 }),
});

const existingRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'att-session',
  type: DISCOVER_SESSION_ATTACHMENT_TYPE,
  active: true,
  current_version: 1,
  versions: [{ version: 1, data: esqlSessionData }],
  ...overrides,
});

const runHandler = async (
  params: Record<string, unknown>,
  overrides: { logger?: Logger; attachments?: ReturnType<typeof createAttachments> } = {}
) => {
  const logger = overrides.logger ?? createLogger();
  const attachments = overrides.attachments ?? createAttachments();
  const tool = createDiscoverSessionTool();
  const result = (await tool.handler(
    params as never,
    {
      logger,
      attachments: attachments as never,
    } as never
  )) as { results: Array<{ type: string; data: Record<string, unknown> }> };
  return { result, logger, attachments };
};

const updatedSession = (attachments: ReturnType<typeof createAttachments>) =>
  attachments.update.mock.calls[0][1].data as {
    title: string;
    tabs: Array<Record<string, unknown> & { data_source: { type: string; query?: string } }>;
  };

describe('createDiscoverSessionTool schema', () => {
  const schema = createDiscoverSessionTool().schema;

  it('accepts title and esql', () => {
    expect(schema.safeParse({ title: 'Nginx errors', esql: ESQL }).success).toBe(true);
  });

  it('accepts a create with only esql', () => {
    expect(schema.safeParse({ esql: ESQL }).success).toBe(true);
  });

  it('accepts omitted attachment_id with only columns (implicit update of a sole session)', () => {
    expect(schema.safeParse({ columns: ['response'] }).success).toBe(true);
  });

  it('rejects an empty create', () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('rejects an over-long title', () => {
    expect(
      schema.safeParse({
        title: 'a'.repeat(MAX_SESSION_TITLE_LENGTH + 1),
        esql: ESQL,
      }).success
    ).toBe(false);
  });

  it('treats a placeholder attachment_id as omitted', () => {
    for (const attachmentId of ['.', '{attachment_id}', 'discover-session', 'discover.session']) {
      const parsed = schema.safeParse({ attachment_id: attachmentId, esql: ESQL });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.attachment_id).toBeUndefined();
      }
    }
  });

  it('strips control characters from esql', () => {
    const parsed = schema.safeParse({
      esql: 'FROM logs-*\n| WHERE @timestamp \u0000>= "now-1h"',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.esql).toBe('FROM logs-*\n| WHERE @timestamp >= "now-1h"');
    }
  });

  it('rejects an over-long attachment_id', () => {
    expect(
      schema.safeParse({
        attachment_id: 'a'.repeat(257),
        esql: ESQL,
      }).success
    ).toBe(false);
  });

  it('accepts an update with only esql', () => {
    expect(schema.safeParse({ attachment_id: 'att-session', esql: UPDATED_ESQL }).success).toBe(
      true
    );
  });

  it('accepts an update that clears time_range or columns', () => {
    expect(schema.safeParse({ attachment_id: 'att-session', time_range: null }).success).toBe(true);
    expect(schema.safeParse({ attachment_id: 'att-session', columns: null }).success).toBe(true);
    expect(schema.safeParse({ attachment_id: 'att-session', columns: [] }).success).toBe(true);
  });

  it('rejects an update with no mutable fields', () => {
    expect(schema.safeParse({ attachment_id: 'att-session' }).success).toBe(false);
  });

  it('rejects an invalid time_range', () => {
    expect(
      schema.safeParse({
        esql: ESQL,
        time_range: { from: 'now', to: 'now-24h' },
      }).success
    ).toBe(false);
  });
});

describe('createDiscoverSessionTool', () => {
  it('uses the platform.core.create_discover_session id', () => {
    expect(createDiscoverSessionTool().id).toBe(platformCoreTools.createDiscoverSession);
  });

  it('uses a create-or-update annotation title', () => {
    expect(createDiscoverSessionTool().annotations?.title).toBe(
      'Create or update Discover session'
    );
    expect(createDiscoverSessionTool().annotations?.idempotentHint).toBe(false);
  });

  it('persists a one-tab ES|QL session with the chart hidden', async () => {
    const { result, attachments } = await runHandler({
      title: 'Nginx errors',
      esql: ESQL,
      time_range: { from: 'now-24h', to: 'now' },
      columns: ['@timestamp', 'message'],
    });

    expect(attachments.add).toHaveBeenCalledWith(
      {
        type: DISCOVER_SESSION_ATTACHMENT_TYPE,
        description: 'Discover session: Nginx errors',
        data: expect.objectContaining({
          title: 'Nginx errors',
          tabs: [
            expect.objectContaining({
              id: 'main',
              hide_chart: true,
              time_range: { from: 'now-24h', to: 'now' },
              column_order: ['@timestamp', 'message'],
              data_source: {
                type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
                query: ESQL,
              },
            }),
          ],
        }),
      },
      ATTACHMENT_REF_ACTOR.agent
    );
    expect(attachments.update).not.toHaveBeenCalled();

    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe(ToolResultType.other);
    expect(result.results[0].data).toEqual({
      attachment_id: 'att-session',
      version: 1,
      esql: ESQL,
      render: '<render_attachment id="att-session" version="1" />',
      next_action: 'stop',
    });
    expect(result.results[0].data).not.toHaveProperty('tabs');
  });

  it('defaults the title when creating with only esql', async () => {
    const { attachments } = await runHandler({ esql: ESQL });

    expect(attachments.add).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Discover session: Discover session',
        data: expect.objectContaining({ title: 'Discover session' }),
      }),
      ATTACHMENT_REF_ACTOR.agent
    );
  });

  it('creates a session when a placeholder attachment_id is passed and none exists', async () => {
    const { result, attachments } = await runHandler({ attachment_id: '.', esql: ESQL });

    expect(attachments.update).not.toHaveBeenCalled();
    expect(attachments.add).toHaveBeenCalled();
    expect(result.results[0].type).toBe(ToolResultType.other);
    expect(result.results[0].data.attachment_id).toBe('att-session');
  });

  it('returns an error when attachment persistence fails', async () => {
    const attachments = createAttachments();
    attachments.add.mockRejectedValue(new Error('quota exceeded'));

    const { result } = await runHandler({ title: 'Nginx errors', esql: ESQL }, { attachments });

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('quota exceeded');
  });
});

describe('createDiscoverSessionTool updates', () => {
  const runUpdate = async (
    params: Record<string, unknown>,
    record: Record<string, unknown> = existingRecord()
  ) => {
    const attachments = createAttachments();
    attachments.getAttachmentRecord.mockReturnValue(record);
    return runHandler({ attachment_id: 'att-session', ...params }, { attachments });
  };

  it('updates esql without changing unrelated fields', async () => {
    const { result, attachments } = await runUpdate({ esql: UPDATED_ESQL });

    expect(attachments.add).not.toHaveBeenCalled();
    expect(attachments.update).toHaveBeenCalledWith(
      'att-session',
      expect.objectContaining({
        description: 'Discover session: Nginx errors',
      }),
      ATTACHMENT_REF_ACTOR.agent
    );

    const session = updatedSession(attachments);
    expect(session.title).toBe('Nginx errors');
    expect(session.tabs[0].data_source.query).toBe(UPDATED_ESQL);
    expect(session.tabs[0].column_order).toEqual(['@timestamp', 'message']);
    expect(session.tabs[0].time_range).toEqual({ from: 'now-24h', to: 'now' });
    expect(session.tabs[0].hide_chart).toBe(true);
    expect(session.tabs[0].breakdown_field).toBe('host.name');

    expect(result.results[0].type).toBe(ToolResultType.other);
    expect(result.results[0].data).toEqual({
      attachment_id: 'att-session',
      version: 2,
      esql: UPDATED_ESQL,
      render: '<render_attachment id="att-session" version="2" />',
      next_action: 'stop',
    });
  });

  it('updates title and truncates the tab label', async () => {
    const title = 'T'.repeat(MAX_TAB_LABEL_LENGTH + 20);
    const { attachments } = await runUpdate({ title });

    const session = updatedSession(attachments);
    expect(session.title).toBe(title);
    expect(session.tabs[0].label).toBe('T'.repeat(MAX_TAB_LABEL_LENGTH));
    expect(session.tabs[0].data_source.query).toBe(ESQL);
  });

  it('updates time_range', async () => {
    const { attachments } = await runUpdate({
      time_range: { from: 'now-7d', to: 'now' },
    });

    const tab = updatedSession(attachments).tabs[0];
    expect(tab.time_range).toEqual({ from: 'now-7d', to: 'now' });
  });

  it('clears time_range when null is passed', async () => {
    const { attachments } = await runUpdate({ time_range: null });

    const tab = updatedSession(attachments).tabs[0];
    expect(tab.time_range).toBeUndefined();
  });

  it('replaces columns and clears them when null or empty', async () => {
    const replaced = await runUpdate({ columns: ['status'] });
    expect(updatedSession(replaced.attachments).tabs[0].column_order).toEqual(['status']);

    const cleared = await runUpdate({ columns: null });
    expect(updatedSession(cleared.attachments).tabs[0].column_order).toBeUndefined();

    const emptied = await runUpdate({ columns: [] });
    expect(updatedSession(emptied.attachments).tabs[0].column_order).toBeUndefined();
  });

  it('returns the existing version when the mocked update is a no-op', async () => {
    const attachments = createAttachments();
    attachments.getAttachmentRecord.mockReturnValue(existingRecord());
    attachments.update.mockResolvedValue({ id: 'att-session', current_version: 1 });

    const { result } = await runHandler(
      { attachment_id: 'att-session', esql: ESQL },
      { attachments }
    );

    expect(attachments.update).toHaveBeenCalled();
    expect(result.results[0].data).toEqual({
      attachment_id: 'att-session',
      version: 1,
      esql: ESQL,
      render: '<render_attachment id="att-session" version="1" />',
      next_action: 'stop',
    });
  });

  it('updates the sole active Discover session when attachment_id is omitted', async () => {
    const attachments = createAttachments();
    attachments.getActive.mockReturnValue([
      { id: 'att-session', type: DISCOVER_SESSION_ATTACHMENT_TYPE },
    ]);
    attachments.getAttachmentRecord.mockReturnValue(existingRecord());

    const { result } = await runHandler({ esql: UPDATED_ESQL }, { attachments });

    expect(attachments.add).not.toHaveBeenCalled();
    expect(attachments.update).toHaveBeenCalledWith(
      'att-session',
      expect.objectContaining({
        data: expect.objectContaining({
          tabs: [
            expect.objectContaining({
              data_source: expect.objectContaining({ query: UPDATED_ESQL }),
            }),
          ],
        }),
      }),
      ATTACHMENT_REF_ACTOR.agent
    );
    expect(result.results[0].data.attachment_id).toBe('att-session');
    expect(result.results[0].data.version).toBe(2);
  });

  it('updates columns on the sole session when attachment_id and esql are omitted', async () => {
    const attachments = createAttachments();
    attachments.getActive.mockReturnValue([
      { id: 'att-session', type: DISCOVER_SESSION_ATTACHMENT_TYPE },
    ]);
    attachments.getAttachmentRecord.mockReturnValue(existingRecord());

    const { result } = await runHandler({ columns: ['status'] }, { attachments });

    expect(attachments.add).not.toHaveBeenCalled();
    expect(updatedSession(attachments).tabs[0].column_order).toEqual(['status']);
    expect(updatedSession(attachments).tabs[0].data_source.query).toBe(ESQL);
    expect(result.results[0].type).toBe(ToolResultType.other);
  });

  it('updates the sole session when a placeholder attachment_id is passed', async () => {
    const attachments = createAttachments();
    attachments.getActive.mockReturnValue([
      { id: 'att-session', type: DISCOVER_SESSION_ATTACHMENT_TYPE },
    ]);
    attachments.getAttachmentRecord.mockImplementation((id: string) =>
      id === 'att-session' ? existingRecord() : undefined
    );

    const { result } = await runHandler(
      { attachment_id: '.', esql: UPDATED_ESQL },
      { attachments }
    );

    expect(attachments.add).not.toHaveBeenCalled();
    expect(attachments.update).toHaveBeenCalledWith(
      'att-session',
      expect.anything(),
      ATTACHMENT_REF_ACTOR.agent
    );
    expect(result.results[0].data.attachment_id).toBe('att-session');
    expect(result.results[0].data.version).toBe(2);
  });

  it('creates a session when attachment_id is omitted and more than one session is active', async () => {
    const attachments = createAttachments();
    attachments.getActive.mockReturnValue([
      { id: 'att-a', type: DISCOVER_SESSION_ATTACHMENT_TYPE },
      { id: 'att-b', type: DISCOVER_SESSION_ATTACHMENT_TYPE },
    ]);

    const { result } = await runHandler({ esql: UPDATED_ESQL }, { attachments });

    expect(attachments.update).not.toHaveBeenCalled();
    expect(attachments.add).toHaveBeenCalled();
    expect(result.results[0].data.attachment_id).toBe('att-session');
    expect(result.results[0].data.version).toBe(1);
  });

  it('creates a session when a skill-name attachment_id is passed and none exists', async () => {
    const attachments = createAttachments();
    attachments.getAttachmentRecord.mockReturnValue(undefined);

    const { result } = await runHandler(
      { attachment_id: 'discover-session', esql: UPDATED_ESQL },
      { attachments }
    );

    expect(attachments.update).not.toHaveBeenCalled();
    expect(attachments.add).toHaveBeenCalled();
    expect(result.results[0].type).toBe(ToolResultType.other);
    expect(result.results[0].data.attachment_id).toBe('att-session');
  });

  it('updates the sole session when a skill-name attachment_id is passed', async () => {
    const attachments = createAttachments();
    attachments.getActive.mockReturnValue([
      { id: 'att-session', type: DISCOVER_SESSION_ATTACHMENT_TYPE },
    ]);
    attachments.getAttachmentRecord.mockImplementation((id: string) =>
      id === 'att-session' ? existingRecord() : undefined
    );

    const { result } = await runHandler(
      { attachment_id: 'discover-session', esql: UPDATED_ESQL },
      { attachments }
    );

    expect(attachments.add).not.toHaveBeenCalled();
    expect(attachments.update).toHaveBeenCalledWith(
      'att-session',
      expect.anything(),
      ATTACHMENT_REF_ACTOR.agent
    );
    expect(result.results[0].data.attachment_id).toBe('att-session');
  });

  it('returns an error when a supplied attachment_id is unknown and none exists', async () => {
    const attachments = createAttachments();
    attachments.getAttachmentRecord.mockReturnValue(undefined);

    const { result } = await runHandler(
      { attachment_id: 'invented-id', esql: UPDATED_ESQL },
      { attachments }
    );

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('invented-id');
    expect(attachments.update).not.toHaveBeenCalled();
    expect(attachments.add).not.toHaveBeenCalled();
  });

  it('returns an error when a supplied attachment_id is unknown and one session exists', async () => {
    const attachments = createAttachments();
    attachments.getActive.mockReturnValue([
      { id: 'att-session', type: DISCOVER_SESSION_ATTACHMENT_TYPE },
    ]);
    attachments.getAttachmentRecord.mockImplementation((id: string) =>
      id === 'att-session' ? existingRecord() : undefined
    );

    const { result } = await runHandler(
      { attachment_id: 'invented-id', esql: UPDATED_ESQL },
      { attachments }
    );

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('invented-id');
    expect(result.results[0].data.message).toContain('att-session');
    expect(attachments.update).not.toHaveBeenCalled();
    expect(attachments.add).not.toHaveBeenCalled();
  });

  it('returns an error when the attachment is deleted', async () => {
    const { result, attachments } = await runUpdate(
      { esql: UPDATED_ESQL },
      existingRecord({ active: false })
    );

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('deleted');
    expect(attachments.update).not.toHaveBeenCalled();
  });

  it('returns an error when the attachment is read-only', async () => {
    const { result, attachments } = await runUpdate(
      { esql: UPDATED_ESQL },
      existingRecord({ readonly: true })
    );

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('read-only');
    expect(attachments.update).not.toHaveBeenCalled();
  });

  it('creates a session when attachment_id is a non-session attachment such as screen-context', async () => {
    const attachments = createAttachments();
    attachments.getAttachmentRecord.mockImplementation((id: string) =>
      id === 'screen-context'
        ? {
            id: 'screen-context',
            type: 'screen_context',
            active: true,
            readonly: true,
            current_version: 1,
            versions: [{ version: 1, data: {} }],
          }
        : undefined
    );

    const { result } = await runHandler(
      {
        attachment_id: 'screen-context',
        title: 'Most recent errors',
        esql: ESQL,
      },
      { attachments }
    );

    expect(attachments.update).not.toHaveBeenCalled();
    expect(attachments.add).toHaveBeenCalled();
    expect(result.results[0].type).toBe(ToolResultType.other);
    expect(result.results[0].data.attachment_id).toBe('att-session');
  });

  it('updates the sole session when attachment_id is a non-session attachment', async () => {
    const attachments = createAttachments();
    attachments.getActive.mockReturnValue([
      { id: 'att-session', type: DISCOVER_SESSION_ATTACHMENT_TYPE },
    ]);
    attachments.getAttachmentRecord.mockImplementation((id: string) => {
      if (id === 'att-session') {
        return existingRecord();
      }
      if (id === 'screen-context') {
        return {
          id: 'screen-context',
          type: 'screen_context',
          active: true,
          readonly: true,
          current_version: 1,
          versions: [{ version: 1, data: {} }],
        };
      }
      return undefined;
    });

    const { result } = await runHandler(
      { attachment_id: 'screen-context', esql: UPDATED_ESQL },
      { attachments }
    );

    expect(attachments.add).not.toHaveBeenCalled();
    expect(attachments.update).toHaveBeenCalledWith(
      'att-session',
      expect.anything(),
      ATTACHMENT_REF_ACTOR.agent
    );
    expect(result.results[0].data.attachment_id).toBe('att-session');
  });

  it('returns an error when attachment_id is a visualization attachment', async () => {
    const { result, attachments } = await runUpdate(
      { esql: UPDATED_ESQL },
      existingRecord({ type: 'visualization' })
    );

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('att-session');
    expect(attachments.update).not.toHaveBeenCalled();
    expect(attachments.add).not.toHaveBeenCalled();
  });

  it('updates a session whose stored tab still has time_restore', async () => {
    const { result, attachments } = await runUpdate(
      { esql: UPDATED_ESQL },
      existingRecord({
        versions: [
          {
            version: 1,
            data: {
              ...esqlSessionData,
              tabs: [{ ...esqlSessionData.tabs[0], time_restore: true }],
            },
          },
        ],
      })
    );

    expect(result.results[0].type).toBe(ToolResultType.other);
    expect(updatedSession(attachments).tabs[0].data_source.query).toBe(UPDATED_ESQL);
    expect(updatedSession(attachments).tabs[0]).not.toHaveProperty('time_restore');
  });

  it('rejects classic Discover sessions', async () => {
    const { result, attachments } = await runUpdate(
      { esql: UPDATED_ESQL },
      existingRecord({
        versions: [{ version: 1, data: classicSessionData }],
      })
    );

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('ES|QL');
    expect(attachments.update).not.toHaveBeenCalled();
  });

  it('rejects multi-tab Discover sessions', async () => {
    const { result, attachments } = await runUpdate(
      { esql: UPDATED_ESQL },
      existingRecord({
        versions: [
          {
            version: 1,
            data: {
              title: 'Two tabs',
              tabs: [
                esqlSessionData.tabs[0],
                {
                  ...esqlSessionData.tabs[0],
                  id: 'second',
                  label: 'Other',
                },
              ],
            },
          },
        ],
      })
    );

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('one-tab');
    expect(attachments.update).not.toHaveBeenCalled();
  });

  it('returns an error when stored session data is invalid', async () => {
    const { result, attachments } = await runUpdate(
      { esql: UPDATED_ESQL },
      existingRecord({
        versions: [{ version: 1, data: { title: 'broken' } }],
      })
    );

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('invalid');
    expect(attachments.update).not.toHaveBeenCalled();
  });

  it('returns an error when update persistence fails', async () => {
    const attachments = createAttachments();
    attachments.getAttachmentRecord.mockReturnValue(existingRecord());
    attachments.update.mockRejectedValue(new Error('quota exceeded'));

    const { result } = await runHandler(
      { attachment_id: 'att-session', esql: UPDATED_ESQL },
      { attachments }
    );

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect(result.results[0].data.message).toContain('quota exceeded');
  });
});
