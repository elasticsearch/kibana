/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { NEVER } from 'rxjs';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import type { ConversationAttachment } from '@kbn/agent-builder-common/attachments';
import { AgentBuilderServicesContext } from '../context/agent_builder_services_context';
import { StreamingProvider } from '../context/streaming/streaming_context';
import { ConversationStreamService } from '../../services';
import { FakeConversationProvider } from './fake_conversation_provider';
import { createStorybookKibanaServices } from './kibana_services';
import { createStorybookAgentBuilderServices } from './agent_builder_services';
import type { AgentBuilderInternalService } from '../../services/types';

const defaultKibanaServices = createStorybookKibanaServices();
const defaultAgentBuilderServices = createStorybookAgentBuilderServices();
const defaultQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
// Stories drive the reducer via `DevSseEmitter`, not real events, so a no-emit source is enough.
const storybookStreamService = new ConversationStreamService({ getChatEvents$: () => NEVER });

export interface AgentBuilderStorybookProviderProps {
  children: React.ReactNode;
  conversationId?: string;
  agentId?: string;
  initialAttachments?: ConversationAttachment[];
  services?: Partial<AgentBuilderInternalService>;
}

export const AgentBuilderStorybookProvider: React.FC<AgentBuilderStorybookProviderProps> = ({
  children,
  conversationId,
  agentId,
  initialAttachments,
  services,
}) => {
  const mergedServices = services
    ? createStorybookAgentBuilderServices(services)
    : defaultAgentBuilderServices;

  return (
    <QueryClientProvider client={defaultQueryClient}>
      <KibanaContextProvider services={defaultKibanaServices}>
        <AgentBuilderServicesContext.Provider value={mergedServices}>
          <StreamingProvider conversationStreamService={storybookStreamService}>
            <FakeConversationProvider
              conversationId={conversationId}
              agentId={agentId}
              initialAttachments={initialAttachments}
            >
              {children}
            </FakeConversationProvider>
          </StreamingProvider>
        </AgentBuilderServicesContext.Provider>
      </KibanaContextProvider>
    </QueryClientProvider>
  );
};
