/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback } from 'react';
import type { CaseSeverity, CaseUI } from '../../../../../../common';
import type { OnUpdateFields } from '../../../../case_view/types';
import { PAGE_TITLE } from '../../../../../common/translations';
import { useCasesContext } from '../../../../cases_context/use_cases_context';
import { useCasesFeatures } from '../../../../../common/use_cases_features';
import { ConfirmDeleteCaseModal } from '../../../../confirm_delete_case';
import { CasesAppHeader } from '../../../../app/cases_app_header';
import { CaseSettingsPopover } from './case_settings_popover';
import { useCaseViewHeader } from './hooks/use_case_view_header';
import { useCloseCaseFlow } from './hooks/use_close_case_flow';

interface CaseDetailsAppHeaderProps {
  caseData: CaseUI;
  onUpdateField: (args: OnUpdateFields) => void;
  showMetrics: boolean;
  onShowMetricsChange: (enabled: boolean) => void;
}

export const CaseDetailsAppHeader: FC<CaseDetailsAppHeaderProps> = ({
  caseData,
  onUpdateField,
  showMetrics,
  onShowMetricsChange,
}) => {
  const { permissions } = useCasesContext();
  const { hasCaseSettings } = useCasesFeatures();
  const { onStatusChanged, closeCaseModal } = useCloseCaseFlow({ caseData, onUpdateField });

  const onSeverityChanged = useCallback(
    (severity: CaseSeverity) => onUpdateField({ key: 'severity', value: severity }),
    [onUpdateField]
  );

  const {
    headerTitle,
    metadata,
    backHref,
    badges,
    menu,
    runWorkflowModal,
    isDeleteModalVisible,
    setIsDeleteModalVisible,
    onConfirmDeletion,
    isSettingsOpen,
    setIsSettingsOpen,
    settingsAnchor,
  } = useCaseViewHeader({ caseData, onStatusChanged, onSeverityChanged, onUpdateField });

  const onSyncAlertsChanged = useCallback(
    (checked: boolean) =>
      onUpdateField({
        key: 'settings',
        value: { ...caseData.settings, syncAlerts: checked },
      }),
    [caseData.settings, onUpdateField]
  );

  const onExtractObservablesChanged = useCallback(
    (checked: boolean) =>
      onUpdateField({
        key: 'settings',
        value: { ...caseData.settings, extractObservables: checked },
      }),
    [caseData.settings, onUpdateField]
  );

  return (
    <>
      <CasesAppHeader
        title={headerTitle}
        back={{ href: backHref, label: PAGE_TITLE }}
        badges={badges}
        menu={menu}
        metadata={metadata}
      />
      {closeCaseModal}
      {runWorkflowModal}
      {isDeleteModalVisible && (
        <ConfirmDeleteCaseModal
          totalCasesToBeDeleted={1}
          onCancel={() => setIsDeleteModalVisible(false)}
          onConfirm={onConfirmDeletion}
        />
      )}
      {settingsAnchor && permissions.update && hasCaseSettings && (
        <CaseSettingsPopover
          syncAlerts={caseData.settings.syncAlerts}
          onSyncAlertsChange={onSyncAlertsChanged}
          extractObservables={caseData.settings.extractObservables ?? false}
          onExtractObservablesChange={onExtractObservablesChanged}
          showMetrics={showMetrics}
          onShowMetricsChange={onShowMetricsChange}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          anchorElement={settingsAnchor}
        />
      )}
    </>
  );
};

CaseDetailsAppHeader.displayName = 'CaseDetailsAppHeader';
