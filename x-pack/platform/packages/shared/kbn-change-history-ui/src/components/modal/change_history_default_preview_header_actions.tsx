/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useChangeHistoryDetail } from '../../hooks/use_change_history_detail';
import { useChangeHistoryConfig } from '../../provider/use_change_history_config';
import type { ChangeHistoryListItem } from '../../types/change_history_list_item';
import { ChangeHistoryRestoreButton } from './change_history_restore_button';

export interface ChangeHistoryDefaultPreviewHeaderActionsProps {
  selectedChangeId?: string;
  currentChange?: ChangeHistoryListItem;
  onRestored?: () => Promise<void> | void;
}

export function ChangeHistoryDefaultPreviewHeaderActions({
  selectedChangeId,
  currentChange,
  onRestored,
}: ChangeHistoryDefaultPreviewHeaderActionsProps): JSX.Element | null {
  const { adapter, objectId, supports } = useChangeHistoryConfig();
  const { change, isLoading } = useChangeHistoryDetail({
    adapter,
    objectId,
    changeId: selectedChangeId,
    enabled: supports.restore && Boolean(selectedChangeId),
  });

  if (!supports.restore || isLoading || !change) {
    return null;
  }

  return (
    <div data-test-subj="changeHistoryDefaultPreviewHeaderActions">
      <ChangeHistoryRestoreButton
        change={change}
        currentChange={currentChange}
        onRestored={onRestored}
      />
    </div>
  );
}
