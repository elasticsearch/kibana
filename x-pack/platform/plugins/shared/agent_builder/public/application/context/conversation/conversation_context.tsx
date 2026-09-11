/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createContext, useContext } from 'react';
import type { BrowserApiToolDefinition } from '@kbn/agent-builder-browser/tools/browser_api_tool';
import type { ConversationAttachment } from '@kbn/agent-builder-common/attachments';
import type { ConversationActions } from './use_conversation_actions';

interface ConversationContextValue {
  conversationId?: string;
  isEmbeddedContext: boolean;
  sessionTag?: string;
  agentId?: string;
  initialMessage?: string;
  autoSendInitialMessage?: boolean;
  greetingMessage?: string;
  onSubmit?: () => void;
  resetInitialMessage?: () => void;
  attachments?: ConversationAttachment[];
  upsertAttachments?: (attachments: ConversationAttachment[]) => void;
  resetAttachments?: () => void;
  removeAttachment?: (attachmentIndex: number) => void;
  browserApiTools?: Array<BrowserApiToolDefinition<any>>;
  setConversationId?: (conversationId?: string) => void;
  setAgentId?: (agentId: string) => void;
  conversationActions: ConversationActions;
}

const ConversationContext = createContext<ConversationContextValue | undefined>(undefined);

export const useConversationContext = () => {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversationContext must be used within a ConversationContext.Provider');
  }
  return context;
};

export { ConversationContext };
