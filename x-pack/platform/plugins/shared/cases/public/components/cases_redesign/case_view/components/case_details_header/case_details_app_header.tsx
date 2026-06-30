/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback } from 'react';
import { AppHeader } from '@kbn/app-header';
import type { CaseUI } from '../../../../../../common';
import type { OnUpdateFields } from '../../../../case_view/types';
import { PAGE_TITLE } from '../../../../../common/translations';
import { useCasesContext } from '../../../../cases_context/use_cases_context';
import { ConfirmDeleteCaseModal } from '../../../../confirm_delete_case';
import { CaseSettingsPopover } from '../case_settings_popover';
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
  const { onStatusChanged, closeCaseModal } = useCloseCaseFlow({ caseData, onUpdateField });

  const {
    headerTitle,
    metadata,
    backHref,
    badges,
    menu,
    isDeleteModalVisible,
    setIsDeleteModalVisible,
    onConfirmDeletion,
    isSettingsOpen,
    setIsSettingsOpen,
    settingsAnchor,
  } = useCaseViewHeader({ caseData, onStatusChanged, onUpdateField });

  const onSyncAlertsChanged = useCallback(
    (checked: boolean) =>
      onUpdateField({
        key: 'settings',
        value: { ...caseData.settings, syncAlerts: checked },
      }),
    [caseData.settings, onUpdateField]
  );

  return (
    <>
      <AppHeader
        title={headerTitle}
        back={{ href: backHref, label: PAGE_TITLE }}
        badges={badges}
        menu={menu}
        metadata={metadata}
        sticky={false}
      />
      {closeCaseModal}
      {isDeleteModalVisible && (
        <ConfirmDeleteCaseModal
          totalCasesToBeDeleted={1}
          onCancel={() => setIsDeleteModalVisible(false)}
          onConfirm={onConfirmDeletion}
        />
      )}
      {settingsAnchor && permissions.update && (
        <CaseSettingsPopover
          caseData={caseData}
          syncAlerts={caseData.settings.syncAlerts}
          onSyncAlertsChange={onSyncAlertsChanged}
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
