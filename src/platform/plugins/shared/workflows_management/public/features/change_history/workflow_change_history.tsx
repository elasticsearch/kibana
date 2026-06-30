/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import {
  ChangeHistoryListGroupItem,
  ChangeHistoryModal,
  ChangeHistoryProvider,
} from '@kbn/change-history-ui';

import { BACK_TO_WORKFLOW } from './translations';
import {
  useWorkflowChangeHistoryAdapter,
  useWorkflowChangeHistoryEnabled,
  useWorkflowChangeHistoryRestoreEligibility,
} from './use_workflow_change_history';
import { renderWorkflowChangeHistoryBadge } from './workflow_change_history_badge';
import { renderWorkflowChangeHistoryPreview } from './workflow_change_history_preview';
import {
  WORKFLOW_CHANGE_HISTORY_DATASET,
  WORKFLOW_CHANGE_HISTORY_MODULE,
  WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
} from '../../../common/lib/workflow_change_history/constants';
import { useKibana } from '../../hooks/use_kibana';

export interface WorkflowChangeHistoryProviderProps {
  workflowId: string;
  workflowName?: string;
  children: React.ReactNode;
}

export const WorkflowChangeHistoryProvider = ({
  workflowId,
  workflowName,
  children,
}: WorkflowChangeHistoryProviderProps): JSX.Element => {
  const { analytics: coreAnalytics } = useKibana().services;
  const isEnabled = useWorkflowChangeHistoryEnabled();
  const adapter = useWorkflowChangeHistoryAdapter(workflowId);
  const canRestore = useWorkflowChangeHistoryRestoreEligibility();
  const scope = useMemo(
    () => ({
      module: WORKFLOW_CHANGE_HISTORY_MODULE,
      dataset: WORKFLOW_CHANGE_HISTORY_DATASET,
      objectType: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
    }),
    []
  );

  if (!isEnabled) {
    return <>{children}</>;
  }

  return (
    <ChangeHistoryProvider
      objectId={workflowId}
      adapter={adapter}
      renderPreview={renderWorkflowChangeHistoryPreview}
      renderBadge={renderWorkflowChangeHistoryBadge}
      labels={{
        previewBackLabel: BACK_TO_WORKFLOW,
        previewTitle: workflowName ?? workflowId,
      }}
      features={{ restore: true }}
      permissions={{ canRestore }}
      scope={scope}
      analytics={coreAnalytics}
    >
      {children}
      <ChangeHistoryModal />
    </ChangeHistoryProvider>
  );
};

export const WorkflowChangeHistoryListItem = (): JSX.Element | null => {
  const isEnabled = useWorkflowChangeHistoryEnabled();

  if (!isEnabled) {
    return null;
  }

  return <ChangeHistoryListGroupItem />;
};
