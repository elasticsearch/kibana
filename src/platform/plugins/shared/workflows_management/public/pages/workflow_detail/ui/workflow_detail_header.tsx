/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiButtonGroupOptionProps, UseEuiTheme } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiButtonIcon,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPageHeaderSection,
  EuiPageTemplate,
  EuiSkeletonLoading,
  EuiSkeletonRectangle,
  EuiSkeletonTitle,
  EuiSwitch,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useParams } from 'react-router-dom';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useWorkflowsCapabilities } from '@kbn/workflows-ui';
import { WorkflowDetailActionsMenu } from './workflow_detail_actions_menu';
import { PLUGIN_ID } from '../../../../common';
import { useSaveYaml } from '../../../entities/workflows/model/use_save_yaml';
import { useUpdateWorkflow } from '../../../entities/workflows/model/use_update_workflow';
import {
  selectHasChanges,
  selectHasYamlSchemaValidationErrors,
  selectIsExecutionsTab,
  selectIsSavingYaml,
  selectIsYamlSynced,
  selectIsYamlSyntaxValid,
  selectWorkflow,
} from '../../../entities/workflows/store/workflow_detail/selectors';
import { setIsTestModalOpen } from '../../../entities/workflows/store/workflow_detail/slice';
import { useKibana } from '../../../hooks/use_kibana';
import {
  useWorkflowUrlState,
  type WorkflowUrlStateTabType,
} from '../../../hooks/use_workflow_url_state';
import {
  getSaveWorkflowTooltipContent,
  getTestRunTooltipContent,
  ManagedWorkflowBadge,
} from '../../../shared/ui';
import { WorkflowUnsavedChangesBadge } from '../../../widgets/workflow_yaml_editor/ui/workflow_unsaved_changes_badge';

const executionsTabReadExecutionDisabledTooltip = i18n.translate(
  'workflows.workflowDetailHeader.executionsTabReadExecutionDisabledTooltip',
  {
    defaultMessage:
      'You need the Workflows "Read Workflow Execution" privilege to view workflow executions.',
  }
);

const executionsTabReadManagedExecutionDisabledTooltip = i18n.translate(
  'workflows.workflowDetailHeader.executionsTabReadManagedExecutionDisabledTooltip',
  {
    defaultMessage:
      'You need the Workflows "Read workflow executions" and "Read managed workflow executions" privileges to view managed workflow executions.',
  }
);

export const SkipUnsavedRunConfirmationStorageKey = 'workflows:skipUnsavedRunConfirmation';

const Translations = {
  runWorkflow: i18n.translate('workflows.workflowDetailHeader.runWorkflow', {
    defaultMessage: 'Run workflow',
  }),
  runWithUnsavedChangesQuestion: i18n.translate(
    'workflows.workflowDetailHeader.runWithUnsavedChangesQuestion',
    { defaultMessage: 'Run workflow with unsaved changes?' }
  ),
  runWorkflowCancel: i18n.translate('workflows.workflowDetailHeader.runWorkflowCancel', {
    defaultMessage: 'Cancel',
  }),
  dontAskAgain: i18n.translate('workflows.workflowDetailHeader.dontAskAgain', {
    defaultMessage: "Don't ask again",
  }),
  backLink: i18n.translate('workflows.workflowDetailHeader.backLink', {
    defaultMessage: 'Back to Workflows',
  }),
};

const ButtonGroupOptions: EuiButtonGroupOptionProps[] = [
  {
    id: 'workflow',
    label: i18n.translate('workflows.workflowDetailHeader.workflow', {
      defaultMessage: 'Workflow',
    }),
    iconType: 'grid',
  },
  {
    id: 'executions',
    label: i18n.translate('workflows.workflowDetailHeader.executions', {
      defaultMessage: 'Executions',
    }),
    iconType: 'play',
  },
];

export interface WorkflowDetailHeaderProps {
  isLoading: boolean;
  // TODO: manage it in a workflow state context
  highlightDiff: boolean;
  setHighlightDiff: React.Dispatch<React.SetStateAction<boolean>>;
}

interface GetSaveWorkflowButtonDisabledParams {
  isExecutionsTab: boolean;
  canSaveWorkflow: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isManagedWorkflow: boolean;
  isYamlSynced: boolean;
  hasUnsavedChanges: boolean;
}

const getSaveWorkflowButtonDisabled = ({
  isExecutionsTab,
  canSaveWorkflow,
  isLoading,
  isSaving,
  isManagedWorkflow,
  isYamlSynced,
  hasUnsavedChanges,
}: GetSaveWorkflowButtonDisabledParams) =>
  isExecutionsTab ||
  !canSaveWorkflow ||
  isLoading ||
  isSaving ||
  isManagedWorkflow ||
  !isYamlSynced ||
  !hasUnsavedChanges;

export const WorkflowDetailHeader = React.memo(
  ({ isLoading, highlightDiff, setHighlightDiff }: WorkflowDetailHeaderProps) => {
    const { id: workflowId } = useParams<{ id?: string }>();
    const { application } = useKibana().services;
    const styles = useMemoCss(componentStyles);
    const dispatch = useDispatch();
    const {
      canCreateWorkflow,
      canUpdateWorkflow,
      canExecuteWorkflow,
      canReadWorkflowExecution,
      canReadManagedWorkflowExecution,
    } = useWorkflowsCapabilities();

    const { activeTab, setActiveTab } = useWorkflowUrlState();

    const workflow = useSelector(selectWorkflow);
    const isManagedWorkflow = workflow?.managed === true;
    const canReadVisibleWorkflowExecution =
      canReadWorkflowExecution && (!isManagedWorkflow || canReadManagedWorkflowExecution);
    const executionsTabDisabledTooltip = isManagedWorkflow
      ? executionsTabReadManagedExecutionDisabledTooltip
      : executionsTabReadExecutionDisabledTooltip;
    const workflowDetailTabButtonOptions = useMemo(
      () =>
        ButtonGroupOptions.map((option) =>
          option.id === 'executions' && !canReadVisibleWorkflowExecution
            ? {
                ...option,
                isDisabled: true,
                title: '',
                toolTipContent: executionsTabDisabledTooltip,
              }
            : option
        ),
      [canReadVisibleWorkflowExecution, executionsTabDisabledTooltip]
    );
    const isSyntaxValid = useSelector(selectIsYamlSyntaxValid);
    const hasYamlSchemaValidationErrors = useSelector(selectHasYamlSchemaValidationErrors);
    const hasUnsavedChanges = useSelector(selectHasChanges);
    const isExecutionsTab = useSelector(selectIsExecutionsTab);
    const isYamlSynced = useSelector(selectIsYamlSynced);

    const { name, isEnabled, lastUpdatedAt } = useMemo(
      () => ({
        name: workflow?.name ?? 'New workflow',
        isEnabled: workflow?.enabled ?? false,
        lastUpdatedAt: workflow ? new Date(workflow.lastUpdatedAt) : null,
      }),
      [workflow]
    );

    const saveYaml = useSaveYaml();
    const isSaving = useSelector(selectIsSavingYaml);
    const handleSaveWorkflow = useCallback(() => {
      saveYaml();
    }, [saveYaml]);

    const updateWorkflow = useUpdateWorkflow();
    const handleToggleWorkflow = useCallback(() => {
      updateWorkflow({ workflow: { enabled: !isEnabled } });
    }, [updateWorkflow, isEnabled]);

    const openTestModal = useCallback(() => {
      dispatch(setIsTestModalOpen(true));
    }, [dispatch]);

    const [showRunConfirmation, setShowRunConfirmation] = useState(false);
    const [dontAskAgain, setDontAskAgain] = useState(false);

    // Combined validity: syntax must parse AND no strict validation errors AND server considers it valid.
    // workflow?.valid !== false covers the initial page load before Monaco validates.
    const isSchemaValid =
      isSyntaxValid && !hasYamlSchemaValidationErrors && workflow?.valid !== false;

    const runWorkflowTooltipContent = useMemo(() => {
      return getTestRunTooltipContent({
        isExecutionsTab,
        isValid: isSyntaxValid,
        canRunWorkflow: canExecuteWorkflow,
        isSaving,
      });
    }, [isSyntaxValid, canExecuteWorkflow, isExecutionsTab, isSaving]);

    const saveWorkflowTooltipContent = useMemo(() => {
      const isCreate = !workflowId;
      return getSaveWorkflowTooltipContent({
        isExecutionsTab,
        canSaveWorkflow: isCreate ? canCreateWorkflow : canUpdateWorkflow,
        isCreate,
        hasUnsavedChanges,
        isManagedWorkflow,
      });
    }, [
      isExecutionsTab,
      workflowId,
      canCreateWorkflow,
      canUpdateWorkflow,
      hasUnsavedChanges,
      isManagedWorkflow,
    ]);

    const canSaveWorkflow = useMemo(() => {
      return workflowId ? canUpdateWorkflow : canCreateWorkflow;
    }, [canUpdateWorkflow, canCreateWorkflow, workflowId]);
    const saveWorkflowButtonDisabled = getSaveWorkflowButtonDisabled({
      isExecutionsTab,
      canSaveWorkflow,
      isLoading,
      isSaving,
      isManagedWorkflow,
      isYamlSynced,
      hasUnsavedChanges,
    });

    const handleRunClickWithUnsavedCheck = useCallback(() => {
      const shouldSkipUnsavedRunConfirmation =
        localStorage.getItem(SkipUnsavedRunConfirmationStorageKey) === 'true';
      if (hasUnsavedChanges && !shouldSkipUnsavedRunConfirmation) {
        setDontAskAgain(false);
        setShowRunConfirmation(true);
      } else {
        openTestModal();
      }
    }, [hasUnsavedChanges, openTestModal]);

    const handleConfirmRun = useCallback(() => {
      if (dontAskAgain) {
        localStorage.setItem(SkipUnsavedRunConfirmationStorageKey, 'true');
      }
      setShowRunConfirmation(false);
      openTestModal();
    }, [dontAskAgain, openTestModal]);

    const handleCancelRun = useCallback(() => {
      setDontAskAgain(false);
      setShowRunConfirmation(false);
    }, []);

    return (
      <>
        <EuiPageTemplate offset={0} minHeight={0} grow={false} css={styles.pageTemplate}>
          <EuiPageTemplate.Header
            css={styles.header}
            restrictWidth={false}
            bottomBorder={false}
            paddingSize="m"
            alignItems="bottom"
          >
            <EuiPageHeaderSection css={styles.headerSection} data-test-subj="workflowDetailHeader">
              <EuiButtonEmpty
                iconType="sortLeft"
                size="xs"
                flush="left"
                onClick={() => {
                  application.navigateToApp(PLUGIN_ID);
                }}
                aria-label={Translations.backLink}
              >
                {Translations.backLink}
              </EuiButtonEmpty>
              <EuiFlexGroup
                alignItems="center"
                responsive={false}
                gutterSize="m"
                css={styles.titleGroup}
              >
                <EuiFlexItem grow={false} css={styles.titleItem}>
                  <EuiSkeletonTitle
                    size="m"
                    isLoading={isLoading}
                    contentAriaLabel={name}
                    css={styles.skeletonTitle}
                  >
                    <EuiTitle size="m" css={styles.title}>
                      <h2>{name}</h2>
                    </EuiTitle>
                  </EuiSkeletonTitle>
                </EuiFlexItem>
                {isManagedWorkflow ? (
                  <EuiFlexItem grow={false}>
                    <ManagedWorkflowBadge dataTestSubj="workflowDetailManagedBadge" />
                  </EuiFlexItem>
                ) : null}
                <EuiFlexItem grow={false}>
                  <EuiSkeletonLoading
                    isLoading={isLoading}
                    loadingContent={<EuiSkeletonRectangle width="80px" height="20px" />}
                    loadedContent={
                      <WorkflowUnsavedChangesBadge
                        hasChanges={hasUnsavedChanges}
                        highlightDiff={highlightDiff}
                        setHighlightDiff={setHighlightDiff}
                        lastUpdatedAt={lastUpdatedAt}
                      />
                    }
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPageHeaderSection>
            {workflowId && (
              <EuiPageHeaderSection
                css={{
                  flexBasis: '15%',
                }}
              >
                <EuiFlexGroup justifyContent="center">
                  <EuiFlexItem grow={false}>
                    <EuiButtonGroup
                      buttonSize="compressed"
                      color="primary"
                      options={workflowDetailTabButtonOptions}
                      idSelected={activeTab}
                      legend="Switch between workflow and executions"
                      type="single"
                      hasAriaDisabled={!canReadVisibleWorkflowExecution}
                      onChange={(id) => setActiveTab(id as WorkflowUrlStateTabType)}
                    />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPageHeaderSection>
            )}
            <EuiPageHeaderSection
              css={{
                flexBasis: '40%',
              }}
            >
              <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="m">
                <EuiToolTip
                  content={
                    hasUnsavedChanges
                      ? i18n.translate('workflows.workflowDetailHeader.unsaved', {
                          defaultMessage: 'Save changes to enable/disable workflow',
                        })
                      : !isSchemaValid
                      ? i18n.translate('workflows.workflowDetailHeader.invalid', {
                          defaultMessage: 'Fix validation errors to enable workflow',
                        })
                      : undefined
                  }
                >
                  <EuiSwitch
                    disabled={
                      !workflowId ||
                      isLoading ||
                      !canUpdateWorkflow ||
                      !isSchemaValid ||
                      hasUnsavedChanges
                    }
                    checked={isEnabled}
                    onChange={handleToggleWorkflow}
                    label={i18n.translate('workflows.workflowDetailHeader.enabled', {
                      defaultMessage: 'Enabled',
                    })}
                  />
                </EuiToolTip>
                <EuiToolTip content={runWorkflowTooltipContent}>
                  <EuiButtonIcon
                    color="success"
                    display="base"
                    iconType="play"
                    size="s"
                    onClick={handleRunClickWithUnsavedCheck}
                    disabled={
                      isExecutionsTab ||
                      !canExecuteWorkflow ||
                      isLoading ||
                      isSaving ||
                      !isSyntaxValid
                    }
                    aria-label={Translations.runWorkflow}
                    data-test-subj="runWorkflowHeaderButton"
                  />
                </EuiToolTip>
                <EuiToolTip content={saveWorkflowTooltipContent}>
                  <EuiButton
                    fill
                    color="primary"
                    size="s"
                    onClick={handleSaveWorkflow}
                    disabled={saveWorkflowButtonDisabled}
                    isLoading={isSaving}
                    data-test-subj="saveWorkflowHeaderButton"
                  >
                    <FormattedMessage
                      id="keepWorkflows.buttonText"
                      defaultMessage="Save"
                      ignoreTag
                    />
                  </EuiButton>
                </EuiToolTip>
                {workflowId && !isExecutionsTab ? (
                  <EuiFlexItem grow={false}>
                    <WorkflowDetailActionsMenu />
                  </EuiFlexItem>
                ) : null}
              </EuiFlexGroup>
            </EuiPageHeaderSection>
          </EuiPageTemplate.Header>
        </EuiPageTemplate>
        {showRunConfirmation && (
          <EuiModal
            className="euiModal--confirmation"
            data-test-subj="runWorkflowWithUnsavedChangesConfirmationModal"
            onClose={handleCancelRun}
            role="alertdialog"
            initialFocus="[data-test-subj='confirmModalConfirmButton']"
            aria-label={Translations.runWithUnsavedChangesQuestion}
          >
            <EuiModalHeader>
              <EuiModalHeaderTitle data-test-subj="confirmModalTitleText">
                {Translations.runWithUnsavedChangesQuestion}
              </EuiModalHeaderTitle>
            </EuiModalHeader>
            <EuiModalBody>
              <EuiText data-test-subj="confirmModalBodyText">
                <p>
                  <FormattedMessage
                    id="workflows.workflowDetailHeader.runWithUnsavedChanges.message"
                    defaultMessage="You have unsaved changes. Running the workflow will not save your changes. Are you sure you want to continue?"
                  />
                </p>
              </EuiText>
            </EuiModalBody>
            <EuiModalFooter css={styles.runConfirmationFooter}>
              <EuiCheckbox
                id="workflowsRunWithUnsavedChangesDontAskAgain"
                data-test-subj="runWorkflowWithUnsavedChangesDontAskAgain"
                label={Translations.dontAskAgain}
                checked={dontAskAgain}
                onChange={(event) => setDontAskAgain(event.target.checked)}
              />
              <EuiFlexGroup gutterSize="m" justifyContent="flexEnd" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    data-test-subj="confirmModalCancelButton"
                    onClick={handleCancelRun}
                  >
                    {Translations.runWorkflowCancel}
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    data-test-subj="confirmModalConfirmButton"
                    onClick={handleConfirmRun}
                    fill
                    color="success"
                  >
                    {Translations.runWorkflow}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiModalFooter>
          </EuiModal>
        )}
      </>
    );
  }
);
WorkflowDetailHeader.displayName = 'WorkflowDetailHeader';

const componentStyles = {
  pageTemplate: css({
    flexGrow: 0,
  }),
  header: ({ euiTheme }: UseEuiTheme) =>
    css({
      backgroundColor: euiTheme.colors.backgroundBasePlain,
      overflow: 'hidden',
      borderBottom: `1px solid ${euiTheme.colors.borderBasePlain}`,
      '@media (max-width: 1024px)': {
        flexDirection: 'column',
      },
      '& > div > div': {
        gap: '24px', // increase gap between title+badge and the "workflow/executions" toggle
      },
    }),
  headerSection: css({
    flexBasis: '40%',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    width: '100%',
  }),
  runConfirmationFooter: css({
    alignItems: 'center',
    justifyContent: 'space-between',
  }),
  skeletonTitle: css({
    minWidth: '250px',
    width: '100%',
    display: 'inline-block',
  }),
  title: css({
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'inline-block',
  }),
  titleGroup: css({
    overflow: 'hidden',
  }),
  titleItem: css({
    minWidth: 0,
    overflow: 'hidden',
  }),
};
