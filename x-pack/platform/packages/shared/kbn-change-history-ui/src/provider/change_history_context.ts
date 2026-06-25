/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createContext } from 'react';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import type { ChangeHistoryBadgeRenderFn } from '../types/change_history_badge';
import type { ChangeHistoryLabels } from '../types/change_history_labels';
import type { ChangeHistoryPreviewFooterRenderFn } from '../types/change_history_preview_footer';
import type { ChangeHistoryPreviewRenderFn } from '../types/change_history_preview';

export interface ChangeHistoryResolvedLabels {
  previewBackLabel: string;
  previewTitle: string;
  timelinePanelTitle: string;
}

export interface ChangeHistoryContextValue {
  objectId: string;
  adapter: ChangeHistoryAdapter;
  renderPreview: ChangeHistoryPreviewRenderFn;
  renderPreviewFooter?: ChangeHistoryPreviewFooterRenderFn;
  renderBadge?: ChangeHistoryBadgeRenderFn;
  labels: ChangeHistoryResolvedLabels;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  selectedChangeId?: string;
  setSelectedChangeId: (changeId: string | undefined) => void;
}

export type { ChangeHistoryLabels };

export const ChangeHistoryContext = createContext<ChangeHistoryContextValue | undefined>(undefined);
