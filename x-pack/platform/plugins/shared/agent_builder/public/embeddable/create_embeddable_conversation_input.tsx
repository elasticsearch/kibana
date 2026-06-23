/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { forwardRef } from 'react';
import type {
  EmbeddableConversationInputRef,
  PublicEmbeddableConversationInputProps,
} from '@kbn/agent-builder-browser';
import { EmbeddableConversationInputInternal } from './embeddable_conversation_input';
import type { EmbeddableConversationDependencies } from './types';

/**
 * The returned component is a `forwardRef` so consumers can imperatively push
 * attachments after mount via `EmbeddableConversationInputRef`.
 */
export const createEmbeddableConversationInput = ({
  services,
  coreStart,
}: EmbeddableConversationDependencies) => {
  return forwardRef<EmbeddableConversationInputRef, PublicEmbeddableConversationInputProps>(
    (props, ref) => (
      <EmbeddableConversationInputInternal
        {...props}
        services={services}
        coreStart={coreStart}
        ref={ref}
      />
    )
  );
};
