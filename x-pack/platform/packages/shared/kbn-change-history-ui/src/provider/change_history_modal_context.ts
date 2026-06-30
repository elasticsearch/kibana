/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createContext } from 'react';

/**
 * Modal open-state shared across host-placed components (trigger, modal, and host
 * affordances). This is the genuinely cross-cutting state that belongs in context;
 * volatile modal-internal state (selection, list) lives inside `ChangeHistoryModal`.
 */
export interface ChangeHistoryModalContextValue {
  isOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

export const ChangeHistoryModalContext = createContext<ChangeHistoryModalContextValue | undefined>(
  undefined
);
