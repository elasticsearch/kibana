/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Conversation } from '@kbn/agent-builder-common';
import {
  ConversationAccessControlMode,
  ConversationRoundStatus,
  ToolOrigin,
} from '@kbn/agent-builder-common';
import {
  isToolCallStep,
  ConversationRoundStepType,
  ToolResultType,
} from '@kbn/agent-builder-common';
import { AgentPromptType } from '@kbn/agent-builder-common/agents/prompts';
import { getToolResultId } from '@kbn/agent-builder-server/tools/utils';
import {
  fromEs,
  toEs,
  createRequestToEs,
  type Document as ConversationDocument,
} from './converters';
import { expect } from '@kbn/scout/ui';

jest.mock('@kbn/agent-builder-server/tools/utils');

const getToolResultIdMock = getToolResultId as jest.MockedFn<typeof getToolResultId>;

const createTestState = () => ({
  prompt: {
    responses: {
      'tools.my-tool.confirmation': {
        type: AgentPromptType.confirmation as const,
        response: { allow: true },
      },
    },
  },
  dynamic_tool_ids: [
    'security.security_labs_search',
    'platform.core.cases',
    'security.alert-analysis.get-related-alerts',
    'security.alerts',
  ],
});

describe('conversation model converters', () => {
  const creationDate = '2024-09-04T06:44:17.944Z';
  const updateDate = '2025-08-04T06:44:19.123Z';
  const roundCreationDate = '2025-08-04T07:42:20.789Z';

  beforeEach(() => {
    getToolResultIdMock.mockReturnValue('some-result-id');
  });

  describe('fromEs', () => {
    const documentBase = (): ConversationDocument => {
      return {
        _id: 'conv_id',
        _source: {
          agent_id: 'agent_id',
          title: 'conv_title',
          user_id: 'user_id',
          user_name: 'user_name',
          space: 'space',
          conversation_rounds: [
            {
              id: 'round-1',
              status: ConversationRoundStatus.completed,
              input: {
                message: 'some message',
              },
              response: {
                message: 'some response',
              },
              steps: [],
              started_at: roundCreationDate,
              time_to_first_token: 42,
              time_to_last_token: 100,
              model_usage: {
                connector_id: 'unknown',
                llm_calls: 1,
                input_tokens: 12,
                output_tokens: 42,
              },
            },
          ],
          created_at: creationDate,
          updated_at: updateDate,
        },
      };
    };

    it('deserializes the conversation with new conversation_rounds field', () => {
      const serialized = documentBase();

      const deserialized = fromEs(serialized);

      expect(deserialized).toEqual({
        id: 'conv_id',
        title: 'conv_title',
        agent_id: 'agent_id',
        user: {
          id: 'user_id',
          username: 'user_name',
        },
        access_control: {
          access_mode: ConversationAccessControlMode.Private,
        },
        created_at: '2024-09-04T06:44:17.944Z',
        updated_at: '2025-08-04T06:44:19.123Z',
        rounds: [
          {
            id: 'round-1',
            status: ConversationRoundStatus.completed,
            input: {
              message: 'some message',
            },
            response: {
              message: 'some response',
            },
            steps: [],
            started_at: roundCreationDate,
            time_to_first_token: 42,
            time_to_last_token: 100,
            model_usage: {
              connector_id: 'unknown',
              llm_calls: 1,
              input_tokens: 12,
              output_tokens: 42,
            },
          },
        ],
      });
    });

    it('deserializes the conversation with legacy rounds field', () => {
      const serialized = documentBase();
      // @ts-ignore simulating legacy document
      delete serialized._source.conversation_rounds;
      serialized._source!.rounds = [
        {
          id: 'round-legacy',
          status: ConversationRoundStatus.completed,
          input: {
            message: 'legacy message',
          },
          response: {
            message: 'legacy response',
          },
          steps: [],
          started_at: roundCreationDate,
          time_to_first_token: 0,
          time_to_last_token: 0,
          model_usage: {
            connector_id: 'unknown',
            llm_calls: 1,
            input_tokens: 12,
            output_tokens: 42,
          },
        },
      ];
      serialized._source!.state = createTestState();

      const deserialized = fromEs(serialized);

      expect(deserialized).toEqual({
        id: 'conv_id',
        title: 'conv_title',
        agent_id: 'agent_id',
        user: {
          id: 'user_id',
          username: 'user_name',
        },
        access_control: {
          access_mode: ConversationAccessControlMode.Private,
        },
        created_at: '2024-09-04T06:44:17.944Z',
        updated_at: '2025-08-04T06:44:19.123Z',
        rounds: [
          {
            id: 'round-legacy',
            status: ConversationRoundStatus.completed,
            input: {
              message: 'legacy message',
            },
            response: {
              message: 'legacy response',
            },
            steps: [],
            started_at: roundCreationDate,
            time_to_first_token: 0,
            time_to_last_token: 0,
            model_usage: {
              connector_id: 'unknown',
              llm_calls: 1,
              input_tokens: 12,
              output_tokens: 42,
            },
          },
        ],
        state: createTestState(),
      });
    });

    it('deserializes the steps', () => {
      const serialized = documentBase();
      serialized._source!.conversation_rounds[0].steps = [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'tool_call_id',
          tool_id: 'tool_id',
          params: {
            param1: 'value1',
          },
          results: '[{"type":"other","data":{"someData":"someValue"}}]',
        },
        {
          type: ConversationRoundStepType.reasoning,
          reasoning: 'reasoning',
        },
      ];

      const deserialized = fromEs(serialized);

      expect(deserialized.rounds[0].steps).toEqual([
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'tool_call_id',
          tool_id: 'tool_id',
          params: {
            param1: 'value1',
          },
          progression: [],
          results: [
            {
              tool_result_id: 'some-result-id',
              type: ToolResultType.other,
              data: { someData: 'someValue' },
            },
          ],
          tool_origin: undefined,
        },
        {
          type: ConversationRoundStepType.reasoning,
          reasoning: 'reasoning',
        },
      ]);
    });

    it('adds tool_call_id for results without it', () => {
      const serialized = documentBase();
      serialized._source!.conversation_rounds[0].steps = [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'tool_call_id',
          tool_id: 'tool_id',
          params: {
            param1: 'value1',
          },
          results:
            '[{"tool_result_id": "foo", "type":"other","data":{"someData":"someValue"}}, {"type":"other","data":{"someData":"someValue"}}]',
        },
        {
          type: ConversationRoundStepType.reasoning,
          reasoning: 'reasoning',
        },
      ];

      const deserialized = fromEs(serialized);

      const results = deserialized.rounds[0].steps
        .filter(isToolCallStep)
        .flatMap((step) => step.results);

      expect(results.map((result) => result.tool_result_id)).toEqual(['foo', 'some-result-id']);
    });

    it('migrates legacy tabular_data type to esqlResults', () => {
      const serialized = documentBase();
      serialized._source!.conversation_rounds[0].steps = [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'tool_call_id',
          tool_id: 'tool_id',
          params: {},
          results: JSON.stringify([
            {
              tool_result_id: 'result-1',
              type: 'tabular_data',
              data: {
                source: 'esql',
                query: 'FROM logs | LIMIT 10',
                columns: [{ name: 'message', type: 'keyword' }],
                values: [['test message']],
              },
            },
            {
              tool_result_id: 'result-2',
              type: 'query',
              data: { esql: 'FROM logs | LIMIT 10' },
            },
          ]),
        },
      ];

      const deserialized = fromEs(serialized);

      const results = deserialized.rounds[0].steps
        .filter(isToolCallStep)
        .flatMap((step) => step.results);

      expect(results).toHaveLength(2);
      // tabular_data should be migrated to esqlResults
      expect(results[0].type).toBe(ToolResultType.esqlResults);
      expect(results[0].data).toEqual({
        source: 'esql',
        query: 'FROM logs | LIMIT 10',
        columns: [{ name: 'message', type: 'keyword' }],
        values: [['test message']],
      });
      // other types should remain unchanged
      expect(results[1].type).toBe(ToolResultType.query);
    });

    it('infers tool_origin as internal for attachment tools missing the field', () => {
      const serialized = documentBase();
      serialized._source!.conversation_rounds[0].steps = [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'call-1',
          tool_id: 'attachments.read',
          params: {},
          results: '[]',
        },
      ];

      const deserialized = fromEs(serialized);

      const step = deserialized.rounds[0].steps.filter(isToolCallStep)[0];
      expect(step.tool_origin).toBe(ToolOrigin.internal);
    });

    it('infers tool_origin as internal for filestore tools missing the field', () => {
      const serialized = documentBase();
      serialized._source!.conversation_rounds[0].steps = [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'call-1',
          tool_id: 'filestore.read',
          params: {},
          results: '[]',
        },
      ];

      const deserialized = fromEs(serialized);

      const step = deserialized.rounds[0].steps.filter(isToolCallStep)[0];
      expect(step.tool_origin).toBe(ToolOrigin.internal);
    });

    it('leaves tool_origin undefined for unknown tools missing the field', () => {
      const serialized = documentBase();
      serialized._source!.conversation_rounds[0].steps = [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'call-1',
          tool_id: 'some.custom.tool',
          params: {},
          results: '[]',
        },
      ];

      const deserialized = fromEs(serialized);

      const step = deserialized.rounds[0].steps.filter(isToolCallStep)[0];
      expect(step.tool_origin).toBeUndefined();
    });

    it('preserves existing tool_origin when already set', () => {
      const serialized = documentBase();
      serialized._source!.conversation_rounds[0].steps = [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'call-1',
          tool_id: 'my.registry.tool',
          params: {},
          results: '[]',
          tool_origin: ToolOrigin.registry,
        },
      ];

      const deserialized = fromEs(serialized);

      const step = deserialized.rounds[0].steps.filter(isToolCallStep)[0];
      expect(step.tool_origin).toBe(ToolOrigin.registry);
    });

    it('deserializes conversation with attachments', () => {
      const serialized = documentBase();
      serialized._source!.attachments = [
        {
          id: 'att-1',
          type: 'text',
          versions: [
            {
              version: 1,
              data: { content: 'Hello' },
              created_at: creationDate,
              content_hash: 'abc123',
              estimated_tokens: 5,
            },
          ],
          current_version: 1,
        },
      ];
      serialized._source!.state = createTestState();

      const deserialized = fromEs(serialized);

      expect(deserialized.attachments).toEqual([
        {
          id: 'att-1',
          type: 'text',
          versions: [
            {
              version: 1,
              data: { content: 'Hello' },
              created_at: creationDate,
              content_hash: 'abc123',
              estimated_tokens: 5,
            },
          ],
          current_version: 1,
        },
      ]);
      expect(deserialized.state).toEqual(createTestState());
    });

    it('deserializes conversation without attachments (old format)', () => {
      const serialized = documentBase();
      // No attachments field - old format

      const deserialized = fromEs(serialized);

      expect(deserialized.attachments).toBeUndefined();
    });

    it('deserializes conversation with state', () => {
      const serialized = documentBase();
      serialized._source!.state = createTestState();

      const deserialized = fromEs(serialized);

      expect(deserialized.state).toEqual(serialized._source!.state);
    });

    it('deserializes conversation without state (old format)', () => {
      const serialized = documentBase();
      // No state field - old format

      const deserialized = fromEs(serialized);

      expect(deserialized.state).toBeUndefined();
    });

    it('defaults access control to private for legacy conversations', () => {
      const serialized = documentBase();

      const deserialized = fromEs(serialized);

      expect(deserialized.access_control).toEqual({
        access_mode: ConversationAccessControlMode.Private,
      });
    });

    it('deserializes conversation access control', () => {
      const serialized = documentBase();
      serialized._source!.access_control = {
        access_mode: ConversationAccessControlMode.Public,
      };

      const deserialized = fromEs(serialized);

      expect(deserialized.access_control).toEqual({
        access_mode: ConversationAccessControlMode.Public,
      });
    });
  });

  describe('toEs', () => {
    const conversationBase = (): Conversation => {
      return {
        id: 'conv_id',
        agent_id: 'agent_id',
        user: { id: 'user_id', username: 'user_name' },
        title: 'conv_title',
        created_at: creationDate,
        updated_at: updateDate,
        rounds: [
          {
            id: 'round-1',
            status: ConversationRoundStatus.completed,
            input: {
              message: 'some message',
            },
            steps: [],
            response: {
              message: 'some response',
            },
            started_at: roundCreationDate,
            time_to_first_token: 42,
            time_to_last_token: 100,
            model_usage: {
              connector_id: 'unknown',
              llm_calls: 1,
              input_tokens: 12,
              output_tokens: 42,
            },
          },
        ],
      };
    };

    it('serializes the conversation using new conversation_rounds field', () => {
      const conversation = conversationBase();
      const serialized = toEs(conversation, 'another-space');

      expect(serialized).toEqual({
        agent_id: 'agent_id',
        title: 'conv_title',
        user_id: 'user_id',
        user_name: 'user_name',
        space: 'another-space',
        conversation_rounds: [
          {
            id: 'round-1',
            status: ConversationRoundStatus.completed,
            input: {
              message: 'some message',
            },
            response: {
              message: 'some response',
            },
            steps: [],
            started_at: roundCreationDate,
            time_to_first_token: 42,
            time_to_last_token: 100,
            model_usage: {
              connector_id: 'unknown',
              llm_calls: 1,
              input_tokens: 12,
              output_tokens: 42,
            },
          },
        ],
        created_at: creationDate,
        updated_at: updateDate,
        // NEW: attachments defaults to empty array
        attachments: [],
        // Legacy field explicitly set to undefined
        rounds: undefined,
        access_control: {
          access_mode: ConversationAccessControlMode.Private,
        },
      });
      // Verify rounds is not present
      expect(serialized.rounds).toBeUndefined();
    });

    it('serializes conversation with attachments', () => {
      const conversation = conversationBase();
      conversation.attachments = [
        {
          id: 'att-1',
          type: 'text',
          versions: [
            {
              version: 1,
              data: { content: 'Hello' },
              created_at: creationDate,
              content_hash: 'abc123',
              estimated_tokens: 5,
            },
          ],
          current_version: 1,
        },
      ];
      const serialized = toEs(conversation, 'space');

      expect(serialized.attachments).toEqual([
        {
          id: 'att-1',
          type: 'text',
          versions: [
            {
              version: 1,
              data: { content: 'Hello' },
              created_at: creationDate,
              content_hash: 'abc123',
              estimated_tokens: 5,
            },
          ],
          current_version: 1,
        },
      ]);
    });

    it('serializes the steps', () => {
      const conversation = conversationBase();
      conversation.rounds[0].steps = [
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'tool_call_id',
          tool_id: 'tool_id',
          params: { param1: 'value1' },
          results: [
            { tool_result_id: 'foo', type: ToolResultType.other, data: { someData: 'someValue' } },
          ],
        },
        {
          type: ConversationRoundStepType.reasoning,
          reasoning: 'reasoning',
        },
      ];
      const serialized = toEs(conversation, 'space');

      expect(serialized.conversation_rounds[0].steps).toEqual([
        {
          type: ConversationRoundStepType.toolCall,
          tool_call_id: 'tool_call_id',
          tool_id: 'tool_id',
          params: {
            param1: 'value1',
          },
          results: '[{"tool_result_id":"foo","type":"other","data":{"someData":"someValue"}}]',
        },
        {
          type: ConversationRoundStepType.reasoning,
          reasoning: 'reasoning',
        },
      ]);
    });

    it('serializes conversation with state', () => {
      const conversation = conversationBase();
      conversation.state = createTestState();

      const serialized = toEs(conversation, 'space');

      expect(serialized.state).toEqual(createTestState());
    });

    it('serializes conversation without state', () => {
      const conversation = conversationBase();
      // No state field

      const serialized = toEs(conversation, 'space');

      expect(serialized.state).toBeUndefined();
    });

    it('serializes conversation access control', () => {
      const conversation = conversationBase();
      conversation.access_control = {
        access_mode: ConversationAccessControlMode.Public,
      };

      const serialized = toEs(conversation, 'space');

      expect(serialized.access_control).toEqual({
        access_mode: ConversationAccessControlMode.Public,
      });
    });
  });

  describe('createRequestToEs', () => {
    it('includes state property when creating new conversation', () => {
      const conversation = {
        agent_id: 'agent_id',
        title: 'conv_title',
        rounds: [],
        state: createTestState(),
      };

      const serialized = createRequestToEs({
        conversation,
        space: 'space',
        currentUser: { id: 'user_id', username: 'user_name' },
        creationDate: new Date(creationDate),
      });

      expect(serialized.state).toEqual(conversation.state);
    });

    it('sets state to undefined when creating conversation without state', () => {
      const conversation = {
        agent_id: 'agent_id',
        title: 'conv_title',
        rounds: [],
      };

      const serialized = createRequestToEs({
        conversation,
        space: 'space',
        currentUser: { id: 'user_id', username: 'user_name' },
        creationDate: new Date(creationDate),
      });

      expect(serialized.state).toBeUndefined();
    });

    it('defaults access control to private when creating a conversation', () => {
      const conversation = {
        agent_id: 'agent_id',
        title: 'conv_title',
        rounds: [],
      };

      const serialized = createRequestToEs({
        conversation,
        space: 'space',
        currentUser: { id: 'user_id', username: 'user_name' },
        creationDate: new Date(creationDate),
      });

      expect(serialized.access_control).toEqual({
        access_mode: ConversationAccessControlMode.Private,
      });
    });

    it('serializes explicit access control when creating a conversation', () => {
      const conversation = {
        agent_id: 'agent_id',
        title: 'conv_title',
        rounds: [],
        access_control: {
          access_mode: ConversationAccessControlMode.Public,
        },
      };

      const serialized = createRequestToEs({
        conversation,
        space: 'space',
        currentUser: { id: 'user_id', username: 'user_name' },
        creationDate: new Date(creationDate),
      });

      expect(serialized.access_control).toEqual({
        access_mode: ConversationAccessControlMode.Public,
      });
    });
  });
});
