/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import type {
  AttachmentInput,
  ConversationAttachment,
} from '@kbn/agent-builder-common/attachments';
import type { CoreStart } from '@kbn/core/public';
import type { AgentBuilderInternalService } from '../../../services';
import type { AgentBuilderStartDependencies } from '../../../types';
import { EmbeddableConversationsProvider } from './embeddable_conversations_provider';
import { useConversationContext } from './conversation_context';

jest.mock('@kbn/react-query', () => ({
  QueryClient: jest.fn().mockImplementation(() => ({})),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  KibanaContextProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@kbn/i18n-react', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../streaming/streaming_context', () => ({
  StreamingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('./conversation_change_notifier', () => ({
  ConversationChangeNotifier: () => null,
}));

jest.mock('../../hooks/use_persisted_conversation_id', () => ({
  usePersistedConversationId: jest.fn(() => ({
    persistedConversationId: undefined,
    updatePersistedConversationId: jest.fn(),
  })),
}));

jest.mock('./use_conversation_actions', () => ({
  useConversationActions: jest.fn(() => ({
    invalidateConversation: jest.fn(),
    addOptimisticRound: jest.fn().mockResolvedValue(undefined),
    removeOptimisticRound: jest.fn(),
    clearLastRoundResponse: jest.fn(),
    addReasoningStep: jest.fn(),
    addToolCall: jest.fn(),
    setToolCallProgress: jest.fn(),
    setToolCallResult: jest.fn(),
    setAssistantMessage: jest.fn(),
    addAssistantMessageChunk: jest.fn(),
    clearAssistantMessage: jest.fn(),
    setTimeToFirstToken: jest.fn(),
    addPendingPrompt: jest.fn(),
    clearPendingPrompts: jest.fn(),
    setAskUserQuestionAnswers: jest.fn(),
    onConversationCreated: jest.fn(),
    addBackgroundExecutionCompleteStep: jest.fn(),
    addOrUpdateTodosStep: jest.fn(),
    setAttachments: jest.fn(),
    addCompactionStep: jest.fn(),
    setCompactionStepComplete: jest.fn(),
    deleteConversation: jest.fn().mockResolvedValue(undefined),
    renameConversation: jest.fn().mockResolvedValue(undefined),
    onRoundComplete: jest.fn(),
  })),
}));

const createMockCoreStart = (): CoreStart =>
  ({
    application: { currentAppId$: new BehaviorSubject<string | null>(null) },
    analytics: { reportEvent: jest.fn() },
  } as unknown as CoreStart);

const createMockServices = (): AgentBuilderInternalService =>
  ({
    agentService: { list: jest.fn().mockResolvedValue([]) },
    conversationsService: { get: jest.fn().mockRejectedValue(new Error('not found')) },
    startDependencies: {} as AgentBuilderStartDependencies,
  } as unknown as AgentBuilderInternalService);

const createMockAttachment = (overrides: Partial<AttachmentInput> = {}): AttachmentInput => ({
  type: 'test.attachment',
  data: { content: 'test content' },
  ...overrides,
});

interface ContextCapture {
  attachments: ConversationAttachment[] | undefined;
  resetAttachments: (() => void) | undefined;
}

const AttachmentsReader: React.FC<{
  storeRef: React.MutableRefObject<ConversationAttachment[] | undefined>;
}> = ({ storeRef }) => {
  const { attachments } = useConversationContext();
  storeRef.current = attachments;
  return null;
};

const ContextReader: React.FC<{ capture: ContextCapture }> = ({ capture }) => {
  const ctx = useConversationContext();
  capture.attachments = ctx.attachments;
  capture.resetAttachments = ctx.resetAttachments;
  return null;
};

describe('EmbeddableConversationsProvider', () => {
  it('should preserve initial attachments when newConversation is true and setConversationId is called during initialization', async () => {
    // Given
    const mockAttachment = createMockAttachment();
    const capturedRef: React.MutableRefObject<ConversationAttachment[] | undefined> = {
      current: undefined,
    };

    // When
    render(
      <EmbeddableConversationsProvider
        coreStart={createMockCoreStart()}
        services={createMockServices()}
        ariaLabelledBy="test-aria"
        newConversation={true}
        attachments={[mockAttachment]}
      >
        <AttachmentsReader storeRef={capturedRef} />
      </EmbeddableConversationsProvider>
    );

    // Flush async effects (analytics reporting)
    await act(async () => {});

    // Then — setConversationId(undefined) called by the init effect must NOT clear attachments
    expect(capturedRef.current).toEqual([mockAttachment]);
  });

  it('should clear attachments when resetAttachments is called', async () => {
    // Given — sidebar opens with a pre-staged attachment
    const mockAttachment = createMockAttachment();
    const capture: ContextCapture = { attachments: undefined, resetAttachments: undefined };

    render(
      <EmbeddableConversationsProvider
        coreStart={createMockCoreStart()}
        services={createMockServices()}
        ariaLabelledBy="test-aria"
        attachments={[mockAttachment]}
      >
        <ContextReader capture={capture} />
      </EmbeddableConversationsProvider>
    );

    await act(async () => {});

    expect(capture.attachments).toEqual([mockAttachment]);

    // When — user starts a new conversation or sends the round (both call resetAttachments)
    act(() => {
      capture.resetAttachments?.();
    });

    // Then — staged attachments are gone
    expect(capture.attachments).toBeUndefined();
  });
});
