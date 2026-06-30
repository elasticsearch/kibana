/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { DeeplyMockedKeys } from '@kbn/utility-types-jest';
import { renderHook, act, type RenderHookResult } from '@testing-library/react';
import { merge } from 'lodash';
import type { PropsWithChildren } from 'react';
import React from 'react';
import { BehaviorSubject, Observable, of, Subject } from 'rxjs';
import type { StreamingChatResponseEventWithoutError } from '@kbn/observability-ai-assistant-plugin/common';
import {
  MessageRole,
  StreamingChatResponseEventType,
} from '@kbn/observability-ai-assistant-plugin/common';
import { EMPTY_CONVERSATION_TITLE } from '../i18n';
import type { AIAssistantAppService } from '../service/create_app_service';
import {
  useConversation,
  type UseConversationProps,
  type UseConversationResult,
} from './use_conversation';
import { ChatState } from '@kbn/observability-ai-assistant-plugin/public';
import { createMockChatService } from '../utils/create_mock_chat_service';
import { createUseChat } from '@kbn/observability-ai-assistant-plugin/public/hooks/use_chat';
import type { NotificationsStart } from '@kbn/core/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { AssistantScope } from '@kbn/ai-assistant-common';

let hookResult: RenderHookResult<UseConversationResult, UseConversationProps>;

type MockedService = DeeplyMockedKeys<Omit<AIAssistantAppService, 'conversations'>> & {
  conversations: DeeplyMockedKeys<
    Omit<AIAssistantAppService['conversations'], 'predefinedConversation$'>
  > & {
    predefinedConversation$: Observable<any>;
  };
};

const mockService: MockedService = {
  callApi: jest.fn(),
  isEnabled: jest.fn(),
  start: jest.fn(),
  register: jest.fn(),
  setScreenContext: jest.fn(),
  getScreenContexts: jest.fn(),
  conversations: {
    openNewConversation: jest.fn(),
    predefinedConversation$: new Observable(),
  },
  navigate: jest.fn().mockReturnValue(of()),
  scope$: new BehaviorSubject<AssistantScope[]>(['all']) as MockedService['scope$'],
  setScopes: jest.fn(),
  getScopes: jest.fn(),
};

const mockChatService = createMockChatService();

const addErrorMock = jest.fn();

const useKibanaMockServices = {
  uiSettings: {
    get: jest.fn(),
  },
  observabilityAIAssistant: {
    useChat: createUseChat({
      notifications: {
        toasts: {
          addError: addErrorMock,
        },
      } as unknown as NotificationsStart,
    }),
    service: mockService,
  },
};

describe('useConversation', () => {
  const wrapper = ({ children }: PropsWithChildren) => (
    <KibanaContextProvider services={useKibanaMockServices}>{children}</KibanaContextProvider>
  );

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('with initial messages and a conversation id', () => {
    it('throws an error', () => {
      expect(() =>
        renderHook(useConversation, {
          initialProps: {
            chatService: mockChatService,
            connectorId: 'my-connector',
            initialMessages: [
              {
                '@timestamp': new Date().toISOString(),
                message: { content: '', role: MessageRole.User },
              },
            ],
            initialConversationId: 'foo',
            onConversationDuplicate: jest.fn(),
          },
          wrapper,
        })
      ).toThrow(/Cannot set initialMessages if initialConversationId is set/);
    });
  });

  describe('without initial messages and a conversation id', () => {
    beforeEach(() => {
      // @ts-expect-error upgrade typescript v5.9.3
      hookResult = renderHook(useConversation, {
        initialProps: {
          chatService: mockChatService,
          connectorId: 'my-connector',
          onConversationDuplicate: jest.fn(),
        },
        wrapper,
      });
    });

    it('returns empty messages', () => {
      expect(hookResult.result.current.messages).toEqual([]);
    });

    it('returns a ready state', () => {
      expect(hookResult.result.current.state).toBe(ChatState.Ready);
    });

    it('does not call the fetch api', () => {
      expect(mockService.callApi).not.toHaveBeenCalled();
    });
  });

  describe('with initial messages', () => {
    beforeEach(() => {
      // @ts-expect-error upgrade typescript v5.9.3
      hookResult = renderHook(useConversation, {
        initialProps: {
          chatService: mockChatService,
          connectorId: 'my-connector',
          initialMessages: [
            {
              '@timestamp': new Date().toISOString(),
              message: {
                content: 'Test',
                role: MessageRole.User,
              },
            },
          ],
          onConversationDuplicate: jest.fn(),
        },
        wrapper,
      });
    });

    it('returns the initial messages', () => {
      expect(hookResult.result.current.messages).toEqual([
        {
          '@timestamp': expect.any(String),
          message: {
            content: 'Test',
            role: MessageRole.User,
          },
        },
      ]);
    });
  });

  describe('with a conversation id that successfully loads', () => {
    beforeEach(async () => {
      mockService.callApi.mockResolvedValueOnce({
        conversation: {
          id: 'my-conversation-id',
        },
        systemMessage: 'System',
        messages: [
          {
            '@timestamp': new Date().toISOString(),
            message: {
              role: MessageRole.User,
              content: 'User',
            },
          },
        ],
      } as never);

      // @ts-expect-error upgrade typescript v5.9.3
      hookResult = renderHook(useConversation, {
        initialProps: {
          chatService: mockChatService,
          connectorId: 'my-connector',
          initialConversationId: 'my-conversation-id',
          onConversationDuplicate: jest.fn(),
        },
        wrapper,
      });

      await act(async () => {});
    });

    it('returns the loaded conversation', () => {
      expect(hookResult.result.current.conversation.value).toEqual({
        conversation: {
          id: 'my-conversation-id',
        },
        systemMessage: 'System',
        messages: [
          {
            '@timestamp': expect.any(String),
            message: {
              content: 'User',
              role: MessageRole.User,
            },
          },
        ],
      });
    });

    it('sets messages to the messages of the conversation', () => {
      expect(hookResult.result.current.messages).toEqual([
        {
          '@timestamp': expect.any(String),
          message: {
            content: 'User',
            role: MessageRole.User,
          },
        },
      ]);
    });
  });

  describe('with a conversation id that fails to load', () => {
    beforeEach(async () => {
      mockService.callApi.mockRejectedValueOnce(new Error('failed to load'));

      // @ts-expect-error upgrade typescript v5.9.3
      hookResult = renderHook(useConversation, {
        initialProps: {
          chatService: mockChatService,
          connectorId: 'my-connector',
          initialConversationId: 'my-conversation-id',
          onConversationDuplicate: jest.fn(),
        },
        wrapper,
      });

      await act(async () => {});
    });

    it('returns an error', () => {
      expect(hookResult.result.current.conversation.error).toBeTruthy();
    });

    it('resets the messages', () => {
      expect(hookResult.result.current.messages.length).toBe(0);
    });
  });

  describe('when chat completes', () => {
    const subject: Subject<StreamingChatResponseEventWithoutError> = new Subject();
    let onConversationUpdate: jest.Mock;
    const expectedMessages = [
      {
        '@timestamp': expect.any(String),
        message: {
          role: MessageRole.User,
          content: 'Hello',
        },
      },
      {
        '@timestamp': expect.any(String),
        message: {
          role: MessageRole.Assistant,
          content: 'Goodbye',
        },
      },
      {
        '@timestamp': expect.any(String),
        message: {
          role: MessageRole.User,
          content: 'Hello again',
        },
      },
      {
        '@timestamp': expect.any(String),
        message: {
          role: MessageRole.Assistant,
          content: 'Goodbye again',
        },
      },
    ];
    beforeEach(() => {
      mockService.callApi.mockImplementation(async (endpoint, request) =>
        merge(
          {
            conversation: {
              id: 'my-conversation-id',
            },
            systemMessage: '',
            messages: expectedMessages,
          },
          (request as any).params.body
        )
      );

      onConversationUpdate = jest.fn();

      // @ts-expect-error upgrade typescript v5.9.3
      hookResult = renderHook(useConversation, {
        initialProps: {
          chatService: mockChatService,
          connectorId: 'my-connector',
          initialMessages: [
            {
              '@timestamp': new Date().toISOString(),
              message: {
                role: MessageRole.User,
                content: 'Hello',
              },
            },
            {
              '@timestamp': new Date().toISOString(),
              message: {
                role: MessageRole.Assistant,
                content: 'Goodbye',
              },
            },
          ],
          onConversationUpdate,
          onConversationDuplicate: jest.fn(),
        },
        wrapper,
      });

      mockChatService.complete.mockImplementationOnce(() => {
        return subject;
      });
    });

    describe('and the conversation is created or updated', () => {
      beforeEach(async () => {
        await act(async () => {
          hookResult.result.current.next(
            hookResult.result.current.messages.concat({
              '@timestamp': new Date().toISOString(),
              message: {
                content: 'Hello again',
                role: MessageRole.User,
              },
            })
          );
          subject.next({
            type: StreamingChatResponseEventType.ChatCompletionChunk,
            id: 'my-message',
            message: {
              content: 'Goodbye',
            },
          });
          subject.next({
            type: StreamingChatResponseEventType.MessageAdd,
            id: 'my-message',
            message: {
              '@timestamp': new Date().toISOString(),
              message: {
                content: 'Goodbye',
                role: MessageRole.Assistant,
              },
            },
          });
          subject.next({
            type: StreamingChatResponseEventType.ConversationUpdate,
            conversation: {
              id: 'my-conversation-id',
              title: 'My title',
              last_updated: new Date().toISOString(),
            },
          });
          subject.complete();
        });
      });

      it('calls the onConversationUpdate hook', () => {
        expect(onConversationUpdate).toHaveBeenCalledWith({
          conversation: {
            id: 'my-conversation-id',
            last_updated: expect.any(String),
            title: 'My title',
          },
        });
      });
    });
  });

  describe('when the title is updated', () => {
    describe('without a stored conversation', () => {
      it('throws an error', (done) => {
        try {
          const { result } = renderHook(useConversation, {
            initialProps: {
              chatService: mockChatService,
              connectorId: 'my-connector',
              initialMessages: [
                {
                  '@timestamp': new Date().toISOString(),
                  message: { content: '', role: MessageRole.User },
                },
              ],
              initialConversationId: 'foo',
              onConversationDuplicate: jest.fn(),
            },
            wrapper,
          });

          result.current.saveTitle('my-new-title');
        } catch (e) {
          expect(e).toBeInstanceOf(Error);
          expect(e.message).toBe('Cannot set initialMessages if initialConversationId is set');
          done();
        }
      });
    });

    describe('with a stored conversation', () => {
      let resolve: (value: unknown) => void;
      beforeEach(async () => {
        mockService.callApi.mockImplementation((async (endpoint: string) => {
          if (
            endpoint === 'PUT /internal/observability_ai_assistant/conversation/{conversationId}'
          ) {
            return new Promise((_resolve) => {
              resolve = _resolve;
            });
          }
          return {
            '@timestamp': new Date().toISOString(),
            conversation: {
              id: 'my-conversation-id',
              title: EMPTY_CONVERSATION_TITLE,
            },
            labels: {},
            numeric_labels: {},
            public: false,
            messages: [],
          };
        }) as unknown as Parameters<typeof mockService.callApi.mockImplementation>[0]);

        await act(async () => {
          // @ts-expect-error upgrade typescript v5.9.3
          hookResult = renderHook(useConversation, {
            initialProps: {
              chatService: mockChatService,
              connectorId: 'my-connector',
              initialConversationId: 'my-conversation-id',
              onConversationDuplicate: jest.fn(),
            },
            wrapper,
          });
        });
      });

      it('does not throw an error', () => {
        expect(() => hookResult.result.current.saveTitle('my-new-title')).not.toThrow();
      });

      it('calls the update API', async () => {
        act(() => {
          hookResult.result.current.saveTitle('my-new-title');
        });

        expect(resolve).not.toBeUndefined();

        expect(mockService.callApi.mock.calls[1]).toEqual([
          'PUT /internal/observability_ai_assistant/conversation/{conversationId}',
          {
            signal: null,
            params: {
              path: {
                conversationId: 'my-conversation-id',
              },
              body: {
                conversation: {
                  '@timestamp': expect.any(String),
                  conversation: {
                    title: 'my-new-title',
                    id: 'my-conversation-id',
                  },
                  labels: expect.anything(),
                  messages: expect.anything(),
                  numeric_labels: expect.anything(),
                  public: expect.anything(),
                },
              },
            },
          },
        ]);

        mockService.callApi.mockImplementation((async (endpoint: string) => {
          return {
            '@timestamp': new Date().toISOString(),
            conversation: {
              id: 'my-conversation-id',
              title: 'my-new-title',
            },
            labels: {},
            numeric_labels: {},
            public: false,
            messages: [],
          };
        }) as unknown as Parameters<typeof mockService.callApi.mockImplementation>[0]);

        await act(async () => {
          resolve({
            conversation: {
              title: 'my-new-title',
            },
          });
        });

        expect(mockService.callApi.mock.calls[2]).toEqual([
          'GET /internal/observability_ai_assistant/conversation/{conversationId}',
          {
            signal: expect.anything(),
            params: {
              path: {
                conversationId: 'my-conversation-id',
              },
            },
          },
        ]);

        expect(hookResult.result.current.conversation.value?.conversation.title).toBe(
          'my-new-title'
        );
      });
    });
  });
});
