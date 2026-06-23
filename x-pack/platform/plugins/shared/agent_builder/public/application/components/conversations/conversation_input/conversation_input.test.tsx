/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationInput } from './conversation_input';
import { useConversationStream } from '../../../hooks/use_conversation_stream';
import { useAgentBuilderAgents } from '../../../hooks/agents/use_agents';
import { useValidateAgentId } from '../../../hooks/agents/use_validate_agent_id';
import {
  useAgentId,
  useConversationTitle,
  useHasActiveConversation,
  useIsAwaitingPrompt,
} from '../../../hooks/use_conversation';
import { useConversationId } from '../../../context/conversation/use_conversation_id';
import { useConversationContext } from '../../../context/conversation/conversation_context';
import { useSubmitMessage } from '../../../hooks/use_submit_message';
import { useToasts } from '../../../hooks/use_toasts';
import { useMessageEditor } from './message_editor';

jest.mock('../../../hooks/use_conversation_stream', () => ({
  useConversationStream: jest.fn(),
}));
jest.mock('../../../hooks/agents/use_agents', () => ({
  useAgentBuilderAgents: jest.fn(),
}));
jest.mock('../../../hooks/agents/use_validate_agent_id', () => ({
  useValidateAgentId: jest.fn(),
}));
jest.mock('../../../hooks/use_conversation', () => ({
  useAgentId: jest.fn(),
  useConversationTitle: jest.fn(),
  useHasActiveConversation: jest.fn(),
  useIsAwaitingPrompt: jest.fn(),
}));
jest.mock('../../../context/conversation/use_conversation_id', () => ({
  useConversationId: jest.fn(),
}));
jest.mock('../../../context/conversation/conversation_context', () => ({
  useConversationContext: jest.fn(),
}));
jest.mock('../../../hooks/use_submit_message', () => ({
  useSubmitMessage: jest.fn(),
}));
jest.mock('../../../hooks/use_toasts', () => ({
  useToasts: jest.fn(),
}));
jest.mock('./message_editor', () => ({
  useMessageEditor: jest.fn(),
  MessageEditor: ({ onSubmit }: { onSubmit: () => void }) => (
    <button data-test-subj="mock-message-editor-submit" type="button" onClick={onSubmit}>
      submit
    </button>
  ),
  CommandBadgeSerializationError: class extends Error {},
}));
jest.mock('./input_actions', () => ({
  InputActions: () => null,
}));
jest.mock('./attachment_pills_row', () => ({
  AttachmentPillsRow: () => null,
}));
jest.mock('@kbn/agent-builder-browser', () => ({
  ConversationInputShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockedUseConversationStream = jest.mocked(useConversationStream);
const mockedUseAgentBuilderAgents = jest.mocked(useAgentBuilderAgents);
const mockedUseValidateAgentId = jest.mocked(useValidateAgentId);
const mockedUseAgentId = jest.mocked(useAgentId);
const mockedUseConversationTitle = jest.mocked(useConversationTitle);
const mockedUseHasActiveConversation = jest.mocked(useHasActiveConversation);
const mockedUseIsAwaitingPrompt = jest.mocked(useIsAwaitingPrompt);
const mockedUseConversationId = jest.mocked(useConversationId);
const mockedUseConversationContext = jest.mocked(useConversationContext);
const mockedUseSubmitMessage = jest.mocked(useSubmitMessage);
const mockedUseToasts = jest.mocked(useToasts);
const mockedUseMessageEditor = jest.mocked(useMessageEditor);

const submitMessage = jest.fn();
const editorController = {
  focus: jest.fn(),
  getContent: jest.fn().mockReturnValue('hello agent'),
  setContent: jest.fn(),
  clear: jest.fn(),
  isEmpty: false,
};

describe('ConversationInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    editorController.getContent.mockReturnValue('hello agent');
    editorController.isEmpty = false;

    mockedUseConversationStream.mockReturnValue({
      pendingMessage: undefined,
      error: undefined,
      isResuming: false,
      isResponseLoading: false,
    } as never);
    mockedUseAgentBuilderAgents.mockReturnValue({ isFetched: true } as never);
    mockedUseValidateAgentId.mockReturnValue(((agentId?: string): agentId is string =>
      Boolean(agentId)) as never);
    mockedUseAgentId.mockReturnValue('elastic-ai-agent');
    mockedUseConversationTitle.mockReturnValue({ title: '', isLoading: false } as never);
    mockedUseHasActiveConversation.mockReturnValue(false);
    mockedUseIsAwaitingPrompt.mockReturnValue(false);
    mockedUseConversationId.mockReturnValue(undefined);
    mockedUseConversationContext.mockReturnValue({
      attachments: [],
      isEmbeddedContext: false,
      conversationActions: {} as never,
    });
    mockedUseSubmitMessage.mockReturnValue(submitMessage);
    mockedUseToasts.mockReturnValue({
      addErrorToast: jest.fn(),
      addSuccessToast: jest.fn(),
    } as never);
    mockedUseMessageEditor.mockReturnValue({
      messageEditor: {} as never,
      controller: editorController,
    } as never);
  });

  it('calls onSubmitOverride with editor content and skips submitMessage when override is provided', () => {
    const onSubmitOverride = jest.fn();

    render(<ConversationInput onSubmitOverride={onSubmitOverride} />);

    fireEvent.click(screen.getByTestId('mock-message-editor-submit'));

    expect(onSubmitOverride).toHaveBeenCalledTimes(1);
    expect(onSubmitOverride).toHaveBeenCalledWith('hello agent');
    expect(submitMessage).not.toHaveBeenCalled();
    expect(editorController.clear).toHaveBeenCalledTimes(1);
  });

  it('routes to submitMessage when no override is provided', () => {
    render(<ConversationInput />);

    fireEvent.click(screen.getByTestId('mock-message-editor-submit'));

    expect(submitMessage).toHaveBeenCalledTimes(1);
    expect(submitMessage).toHaveBeenCalledWith('hello agent');
    expect(editorController.clear).toHaveBeenCalledTimes(1);
  });
});
