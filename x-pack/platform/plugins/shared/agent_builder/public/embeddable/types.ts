/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import type { ConversationAttachment } from '@kbn/agent-builder-common/attachments';
import type { EmbeddableConversationProps } from '@kbn/agent-builder-browser';
import type { AgentBuilderInternalService } from '../services';

export type { EmbeddableConversationProps };

export interface EmbeddableConversationDependencies {
  services: AgentBuilderInternalService;
  coreStart: CoreStart;
}

export interface EmbeddableConversationCallbacks {
  updateProps: (props: EmbeddableConversationProps) => void;
  resetBrowserApiTools: () => void;
  addAttachment: (attachment: ConversationAttachment) => void;
}

export interface EmbeddableConversationSidebarProps {
  onClose?: () => void;
  ariaLabelledBy: string;
  /**
   * Callback to register sidebar control methods.
   * Used internally to update sidebar props and clear browser API tools.
   * @internal
   */
  onRegisterCallbacks?: (callbacks: EmbeddableConversationCallbacks) => void;
}

export type EmbeddableConversationInternalProps = EmbeddableConversationDependencies &
  EmbeddableConversationProps &
  EmbeddableConversationSidebarProps;
