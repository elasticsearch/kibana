/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useContext, useState } from 'react';

export type ConversationRenderMode = 'rounds' | 'events';

interface ConversationRenderModeContextValue {
  renderMode: ConversationRenderMode;
  setRenderMode: (mode: ConversationRenderMode) => void;
}

const ConversationRenderModeContext = createContext<ConversationRenderModeContextValue>({
  renderMode: 'events',
  setRenderMode: () => {},
});

export const ConversationRenderModeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [renderMode, setRenderMode] = useState<ConversationRenderMode>('events');

  return (
    <ConversationRenderModeContext.Provider value={{ renderMode, setRenderMode }}>
      {children}
    </ConversationRenderModeContext.Provider>
  );
};

export const useConversationRenderMode = () => useContext(ConversationRenderModeContext);
