/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty } from 'lodash/fp';
import React, { useCallback, useMemo, useState } from 'react';
import { EuiFlexItem } from '@elastic/eui';
import * as i18n from '../case_view/translations';
import * as commonI18n from '../../common/translations';
import { useDeleteCases } from '../../containers/use_delete_cases';
import { ConfirmDeleteCaseModal } from '../confirm_delete_case';
import { PropertyActions } from '../property_actions';
import type { CaseUI } from '../../../common/ui/types';
import { useAllCasesNavigation } from '../../common/navigation';
import { useCasesContext } from '../cases_context/use_cases_context';
import { useCasesToast } from '../../common/use_cases_toast';
import { AttachmentActionType } from '../../client/attachment_framework/types';
import { KibanaServices } from '../../common/lib/kibana';
import { ApplyTemplateModal } from './apply_template_modal';
import { useRunCaseWorkflow } from '../workflows/use_run_case_workflow';
import { RunCaseWorkflowModal } from '../workflows/run_case_workflow_modal';
import * as workflowI18n from '../workflows/translations';

interface CaseViewActions {
  caseData: CaseUI;
  currentExternalIncident: CaseUI['externalService'];
}

const ActionsComponent: React.FC<CaseViewActions> = ({ caseData, currentExternalIncident }) => {
  const { mutate: deleteCases } = useDeleteCases();
  const { navigateToAllCases } = useAllCasesNavigation();
  const { permissions } = useCasesContext();
  const { showSuccessToast } = useCasesToast();
  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
  const [isApplyTemplateModalVisible, setIsApplyTemplateModalVisible] = useState<boolean>(false);
  const buttonRef = React.useRef<HTMLAnchorElement>(null);

  const isTemplatesV2Enabled = KibanaServices.getConfig()?.templates?.enabled ?? false;

  const {
    canRunWorkflow,
    isModalOpen: isRunWorkflowModalOpen,
    openModal: openRunWorkflowModal,
    closeModal: closeRunWorkflowModal,
    inputs: workflowInputs,
    runWorkflow,
    showSuccessToast: showWorkflowSuccessToast,
    filterWorkflow: workflowFilterWorkflow,
    sortWorkflow: workflowSortWorkflow,
  } = useRunCaseWorkflow({ caseData });

  const openModal = useCallback(() => {
    setIsModalVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  const openApplyTemplateModal = useCallback(() => {
    setIsApplyTemplateModalVisible(true);
  }, []);

  const closeApplyTemplateModal = useCallback(() => {
    setIsApplyTemplateModalVisible(false);
  }, []);

  const propertyActions = useMemo(
    () => [
      ...(canRunWorkflow
        ? [
            {
              type: AttachmentActionType.BUTTON as const,
              iconType: 'play',
              label: workflowI18n.RUN_WORKFLOW,
              onClick: openRunWorkflowModal,
            },
          ]
        : []),
      {
        type: AttachmentActionType.BUTTON as const,
        iconType: 'copy',
        label: i18n.COPY_ID_ACTION_LABEL,
        onClick: () => {
          navigator.clipboard.writeText(caseData.id);
          showSuccessToast(i18n.COPY_ID_ACTION_SUCCESS);
        },
      },
      ...(isTemplatesV2Enabled
        ? [
            {
              type: AttachmentActionType.BUTTON as const,
              iconType: 'indexEdit',
              label: commonI18n.APPLY_TEMPLATE_ACTION_LABEL,
              onClick: openApplyTemplateModal,
            },
          ]
        : []),
      ...(currentExternalIncident != null && !isEmpty(currentExternalIncident?.externalUrl)
        ? [
            {
              type: AttachmentActionType.BUTTON as const,
              iconType: 'external',
              label: i18n.VIEW_INCIDENT(currentExternalIncident?.externalTitle ?? ''),
              onClick: () => window.open(currentExternalIncident?.externalUrl, '_blank'),
            },
          ]
        : []),
      ...(permissions.delete
        ? [
            {
              type: AttachmentActionType.BUTTON as const,
              iconType: 'trash',
              label: i18n.DELETE_CASE(),
              color: 'danger' as const,
              onClick: openModal,
            },
          ]
        : []),
    ],
    [
      canRunWorkflow,
      openRunWorkflowModal,
      permissions.delete,
      openModal,
      openApplyTemplateModal,
      isTemplatesV2Enabled,
      currentExternalIncident,
      caseData.id,
      showSuccessToast,
    ]
  );

  const onConfirmDeletion = useCallback(() => {
    setIsModalVisible(false);
    deleteCases(
      { caseIds: [caseData.id], successToasterTitle: i18n.DELETED_CASES(1) },
      { onSuccess: navigateToAllCases }
    );
  }, [caseData.id, deleteCases, navigateToAllCases]);

  if (propertyActions.length === 0) {
    return null;
  }

  return (
    <EuiFlexItem grow={false} data-test-subj="case-view-actions">
      <PropertyActions
        propertyActions={propertyActions}
        customDataTestSubj={'case'}
        buttonRef={buttonRef}
      />
      {isModalVisible ? (
        <ConfirmDeleteCaseModal
          totalCasesToBeDeleted={1}
          onCancel={closeModal}
          onConfirm={onConfirmDeletion}
          focusButtonRef={buttonRef}
        />
      ) : null}
      {isApplyTemplateModalVisible ? (
        <ApplyTemplateModal caseData={caseData} onClose={closeApplyTemplateModal} />
      ) : null}
      {isRunWorkflowModalOpen && (
        <RunCaseWorkflowModal
          inputs={workflowInputs}
          runWorkflow={runWorkflow}
          showSuccessToast={showWorkflowSuccessToast}
          filterWorkflow={workflowFilterWorkflow}
          sortWorkflow={workflowSortWorkflow}
          onClose={closeRunWorkflowModal}
        />
      )}
    </EuiFlexItem>
  );
};
ActionsComponent.displayName = 'Actions';

export const Actions = React.memo(ActionsComponent);
