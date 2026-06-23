/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiCallOut,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { WorkflowListItemDto, WorkflowsSearchParams } from '@kbn/workflows';
import { isTriggerType } from '@kbn/workflows';
import { useWorkflows, useWorkflowsCapabilities } from '@kbn/workflows-ui';
import { ExportReferencesModal } from './export_references_modal';
import { useEventDrivenExecutionStatus } from './use_event_driven_execution_status';
import { useExportWithReferences } from './use_export_with_references';
import { WorkflowListTable } from './workflow_list_table';
import { WorkflowsUtilityBar } from './workflows_utility_bar';
import { WorkflowsEmptyState } from '../../../components';
import { WorkflowsEmptyStateReadOnly } from '../../../components/workflows_empty_state/workflows_empty_state';
import { useWorkflowActions } from '../../../entities/workflows/model/use_workflow_actions';
import { useKibana } from '../../../hooks/use_kibana';
import { useTelemetry } from '../../../hooks/use_telemetry';
import { shouldShowWorkflowsEmptyState } from '../../../shared/utils/workflow_utils';
import type { WorkflowTriggerTab } from '../../run_workflow/ui/types';
import { WorkflowExecuteModal } from '../../run_workflow/ui/workflow_execute_modal';
import { hasCustomEventTrigger } from '../../run_workflow/ui/workflow_execute_modal_helpers';
import { WORKFLOWS_TABLE_INITIAL_PAGE_SIZE } from '../constants';

interface WorkflowListProps {
  search: WorkflowsSearchParams;
  setSearch: (search: WorkflowsSearchParams) => void;
  onCreateWorkflow?: () => void;
}

export function WorkflowList({ search, setSearch, onCreateWorkflow }: WorkflowListProps) {
  const { page = 1, size = WORKFLOWS_TABLE_INITIAL_PAGE_SIZE } = search;
  const { application, notifications } = useKibana().services;
  const {
    canCreateWorkflow,
    canReadWorkflow,
    canReadWorkflowExecution,
    canExecuteWorkflow,
    canUpdateWorkflow,
    canDeleteWorkflow,
  } = useWorkflowsCapabilities();

  const searchParams = useMemo(() => {
    if (search.enabled != null) {
      return {
        ...search,
        enabled: search.enabled.map((enabled) => {
          if (typeof enabled === 'string') {
            return (enabled as string).trim().toLowerCase() === 'true';
          }
          if (typeof enabled === 'number') {
            return enabled === 1;
          }
          return Boolean(enabled);
        }),
      };
    }
    return search;
  }, [search]);

  const {
    data: workflows,
    isLoading: isLoadingWorkflows,
    error,
    refetch,
  } = useWorkflows(searchParams);
  const {
    eventDrivenExecutionEnabled,
    isLoading: isLoadingEventDrivenStatus,
    error: eventDrivenStatusError,
  } = useEventDrivenExecutionStatus();
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowListItemDto | null>(null);
  const modalTitleId = useGeneratedHtmlId();
  const telemetry = useTelemetry();
  const { deleteWorkflows, runWorkflow, cloneWorkflow, updateWorkflow } = useWorkflowActions();

  const allWorkflowsMap = useMemo(
    () => new Map((workflows?.results ?? []).map((w) => [w.id, w])),
    [workflows?.results]
  );

  const {
    exportModalState: singleExportModal,
    startExport: startSingleExport,
    handleIgnore: handleSingleExportIgnore,
    handleAddDirect: handleSingleExportAddDirect,
    handleAddAll: handleSingleExportAddAll,
    handleCancel: handleSingleExportCancel,
  } = useExportWithReferences({ allWorkflowsMap });

  // Report list viewed telemetry when workflows are loaded
  React.useEffect(() => {
    if (!isLoadingWorkflows && workflows) {
      telemetry.reportWorkflowListViewed({
        workflowCount: workflows.results.length,
        pageNumber: page || 1,
        search: { ...search },
      });
    }
  }, [isLoadingWorkflows, workflows, page, search, telemetry]);

  const [selectedItems, setSelectedItems] = useState<WorkflowListItemDto[]>([]);
  const [executeWorkflow, setExecuteWorkflow] = useState<WorkflowListItemDto | null>(null);

  // Use a ref here to avoid re-rendering when the selected items change
  const selectedItemsRef = useRef(selectedItems);
  selectedItemsRef.current = selectedItems;

  const hasEventDrivenWorkflowsInList = useMemo(
    () =>
      workflows?.results?.some((w) =>
        w.definition?.triggers?.some((t) => !isTriggerType(t.type))
      ) ?? false,
    [workflows?.results]
  );

  const deselectWorkflows = useCallback(() => {
    setSelectedItems([]);
  }, []);

  const onRefresh = useCallback(async () => {
    const result = await refetch();

    const currentSelectedItems = selectedItemsRef.current;
    if (result.data?.results && currentSelectedItems.length > 0) {
      const selectedIds = new Set(currentSelectedItems.map((item) => item.id));
      const updatedSelectedItems = result.data.results.filter((workflow) =>
        selectedIds.has(workflow.id)
      );
      setSelectedItems(updatedSelectedItems);
    }
  }, [refetch]);

  const handleRunWorkflow = useCallback(
    (
      id: string,
      event: Record<string, unknown>,
      triggerTab?: WorkflowTriggerTab,
      workflowHasCustomEventTrigger?: boolean
    ) => {
      runWorkflow.mutate(
        { id, inputs: event, triggerTab, hasCustomEventTrigger: workflowHasCustomEventTrigger },
        {
          onSuccess: ({ workflowExecutionId }) => {
            notifications?.toasts.addSuccess('Workflow run started', {
              toastLifeTimeMs: 3000,
            });
            application.navigateToUrl(
              application.getUrlForApp('workflows', {
                path: `/${id}?tab=executions&executionId=${workflowExecutionId}`,
              })
            );
          },
          onError: (err: unknown) => {
            notifications?.toasts.addError(err as Error, {
              toastLifeTimeMs: 3000,
              title: 'Failed to run workflow',
            });
          },
        }
      );
    },
    [application, notifications, runWorkflow]
  );

  const handleCloseExecuteModal = useCallback(() => {
    setExecuteWorkflow(null);
  }, []);

  const handleExecuteModalSubmit = useCallback(
    (data: Record<string, unknown>, triggerTab: WorkflowTriggerTab) => {
      if (!executeWorkflow) {
        return;
      }
      handleRunWorkflow(
        executeWorkflow.id,
        data,
        triggerTab,
        hasCustomEventTrigger(executeWorkflow.definition)
      );
    },
    [executeWorkflow, handleRunWorkflow]
  );

  const handleDeleteWorkflow = useCallback(
    (item: WorkflowListItemDto) => setWorkflowToDelete(item),
    []
  );

  const handleConfirmDelete = useCallback(() => {
    if (workflowToDelete) {
      deleteWorkflows.mutate({ ids: [workflowToDelete.id] });
      setWorkflowToDelete(null);
    }
  }, [deleteWorkflows, workflowToDelete]);

  const handleCloneWorkflow = useCallback(
    (item: WorkflowListItemDto) => {
      cloneWorkflow.mutate(
        { id: item.id },
        {
          onError: (err: unknown) => {
            notifications?.toasts.addError(err as Error, {
              toastLifeTimeMs: 3000,
              title: 'Failed to clone workflow',
            });
          },
        }
      );
    },
    [cloneWorkflow, notifications?.toasts]
  );

  const handleExportWorkflow = useCallback(
    (item: WorkflowListItemDto) => {
      if (!item.definition) return;
      startSingleExport([item]);
    },
    [startSingleExport]
  );

  const handleToggleWorkflow = useCallback(
    (item: WorkflowListItemDto) => {
      updateWorkflow.mutate(
        {
          id: item.id,
          workflow: {
            enabled: !item.enabled,
          },
          workflowDefinition: item.definition ?? undefined,
          skipRefetch: true,
        },
        {
          onError: (err: unknown) => {
            notifications?.toasts.addError(err as Error, {
              toastLifeTimeMs: 3000,
              title: 'Failed to update workflow',
            });
          },
        }
      );
    },
    [notifications?.toasts, updateWorkflow]
  );

  const getEditHref = useCallback(
    (item: WorkflowListItemDto) => application.getUrlForApp('workflows', { path: `/${item.id}` }),
    [application]
  );

  const showStart = useMemo(() => (page - 1) * size + 1, [page, size]);
  const showEnd = useMemo(() => {
    const end = page * size;
    if (workflows && end > (workflows.total || 0)) {
      return workflows.total;
    }
    return end;
  }, [page, size, workflows]);

  if (isLoadingWorkflows) {
    return (
      <EuiFlexGroup justifyContent={'center'} alignItems={'center'}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText>
            <FormattedMessage
              id="workflows.workflowList.loading"
              defaultMessage="Loading workflows..."
            />
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (error) {
    return (
      <EuiText>
        <FormattedMessage
          id="workflows.workflowList.error"
          defaultMessage="Error loading workflows"
        />
      </EuiText>
    );
  }

  // Show empty state if no workflows exist and no filters are applied
  if (shouldShowWorkflowsEmptyState(workflows, search)) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: '60vh' }}>
        <EuiFlexItem grow={false}>
          {canCreateWorkflow ? (
            <WorkflowsEmptyState onCreateWorkflow={onCreateWorkflow} />
          ) : (
            <WorkflowsEmptyStateReadOnly />
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <>
      {!isLoadingEventDrivenStatus &&
        !eventDrivenStatusError &&
        !eventDrivenExecutionEnabled &&
        hasEventDrivenWorkflowsInList && (
          <>
            <EuiSpacer size="m" />
            <EuiCallOut
              announceOnMount
              title={i18n.translate('workflows.workflowList.eventDrivenDisabled.title', {
                defaultMessage: 'Event-driven triggers are disabled',
              })}
              color="warning"
              iconType="alert"
              data-test-subj="workflows-event-driven-disabled-banner"
            >
              <p>
                {i18n.translate('workflows.workflowList.eventDrivenDisabled.description', {
                  defaultMessage:
                    'Event-driven triggers are disabled. Workflows that use event-driven triggers will not run automatically until the feature is enabled again. Manual and Scheduled runs are not affected.',
                })}
              </p>
            </EuiCallOut>
          </>
        )}
      <WorkflowsUtilityBar
        totalWorkflows={workflows?.total || 0}
        selectedWorkflows={selectedItems}
        allWorkflows={workflows?.results ?? []}
        deselectWorkflows={deselectWorkflows}
        onRefresh={onRefresh}
        showStart={showStart}
        showEnd={showEnd}
      />
      <WorkflowListTable
        items={workflows?.results ?? []}
        page={page}
        size={size}
        total={workflows?.total ?? 0}
        selectedItems={selectedItems}
        onSelectionChange={setSelectedItems}
        onPageChange={(pageIndex, pageSize) =>
          setSearch({ ...search, page: pageIndex + 1, size: pageSize })
        }
        onSortChange={(field, order) =>
          setSearch({ ...search, sortField: field, sortOrder: order, page: 1 })
        }
        sortField={search.sortField}
        sortOrder={search.sortOrder}
        onToggleWorkflow={handleToggleWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
        onCloneWorkflow={handleCloneWorkflow}
        onExportWorkflow={handleExportWorkflow}
        onRequestRun={setExecuteWorkflow}
        getEditHref={getEditHref}
        canCreateWorkflow={!!canCreateWorkflow}
        canReadWorkflow={!!canReadWorkflow}
        canReadWorkflowExecution={!!canReadWorkflowExecution}
        canUpdateWorkflow={!!canUpdateWorkflow}
        canDeleteWorkflow={!!canDeleteWorkflow}
        canExecuteWorkflow={!!canExecuteWorkflow}
      />
      {executeWorkflow?.definition && (
        <WorkflowExecuteModal
          isTestRun={false}
          definition={executeWorkflow.definition}
          workflowId={executeWorkflow.id}
          onClose={handleCloseExecuteModal}
          onSubmit={handleExecuteModalSubmit}
        />
      )}
      {singleExportModal && (
        <ExportReferencesModal
          missingWorkflows={singleExportModal.missingWorkflows}
          onIgnore={handleSingleExportIgnore}
          onAddDirect={handleSingleExportAddDirect}
          onAddAll={handleSingleExportAddAll}
          onCancel={handleSingleExportCancel}
        />
      )}
      {workflowToDelete && (
        <EuiConfirmModal
          title={i18n.translate('workflows.workflowList.deleteModal.title', {
            defaultMessage: 'Delete "{name}"?',
            values: { name: workflowToDelete.name },
          })}
          titleProps={{ id: modalTitleId }}
          aria-labelledby={modalTitleId}
          onCancel={() => setWorkflowToDelete(null)}
          onConfirm={handleConfirmDelete}
          cancelButtonText={i18n.translate('workflows.workflowList.deleteModal.cancel', {
            defaultMessage: 'Cancel',
          })}
          confirmButtonText={i18n.translate('workflows.workflowList.deleteModal.confirm', {
            defaultMessage: 'Delete',
          })}
          buttonColor="danger"
          defaultFocusedButton="cancel"
          data-test-subj="workflows-delete-confirmation-modal"
        >
          <p>
            {i18n.translate('workflows.workflowList.deleteModal.message', {
              defaultMessage: 'Delete the "{name}" workflow? This action cannot be undone.',
              values: { name: workflowToDelete.name },
            })}
          </p>
        </EuiConfirmModal>
      )}
    </>
  );
}
