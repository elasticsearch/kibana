/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiButton,
  EuiModal,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSwitch,
  EuiModalBody,
  EuiComboBox,
  EuiFlexGroup,
  EuiIconTip,
  EuiButtonEmpty,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibanaContextForPlugin } from '../../../../../hooks/use_kibana';
import { FETCH_STATUS } from '../../../../../hooks/use_fetcher';
import type {
  DashboardItemWithTitle,
  InfraCustomDashboardAssetType,
} from '../../../../../../common/custom_dashboards';
import { useDashboardFetcher } from '../../../hooks/use_dashboards_fetcher';
import {
  useUpdateCustomDashboard,
  useCreateCustomDashboard,
} from '../../../hooks/use_custom_dashboards';
import { useAssetDetailsUrlState } from '../../../hooks/use_asset_details_url_state';

interface Props {
  onClose: () => void;
  onRefresh: () => void;
  currentDashboard?: DashboardItemWithTitle;
  customDashboards?: DashboardItemWithTitle[];
  assetType: InfraCustomDashboardAssetType;
}

export function SaveDashboardModal({
  onClose,
  onRefresh,
  currentDashboard,
  customDashboards,
  assetType,
}: Props) {
  const {
    services: { notifications },
  } = useKibanaContextForPlugin();
  const { data: allAvailableDashboards, status } = useDashboardFetcher();
  const [, setUrlState] = useAssetDetailsUrlState();
  const { euiTheme } = useEuiTheme();
  const modalTitleId = useGeneratedHtmlId();

  const [assetNameEnabled, setAssetNameFiltersEnabled] = useState(
    currentDashboard?.dashboardFilterAssetIdEnabled ?? true
  );
  const [selectedDashboard, setSelectedDashboard] = useState<
    Array<EuiComboBoxOptionOption<string>>
  >(
    currentDashboard
      ? [{ label: currentDashboard.title, value: currentDashboard.dashboardSavedObjectId }]
      : []
  );

  const { isUpdateLoading, updateCustomDashboard } = useUpdateCustomDashboard();
  const { isCreateLoading, createCustomDashboard } = useCreateCustomDashboard();

  const isEditMode = !!currentDashboard?.id;
  const loading = isUpdateLoading || isCreateLoading;

  const options = useMemo(
    () =>
      allAvailableDashboards?.map((dashboardItem) => ({
        label: dashboardItem.data.title,
        value: dashboardItem.id,
        disabled:
          customDashboards?.some(
            ({ dashboardSavedObjectId }) => dashboardItem.id === dashboardSavedObjectId
          ) ?? false,
      })),
    [allAvailableDashboards, customDashboards]
  );

  const onChange = useCallback(
    () => setAssetNameFiltersEnabled(!assetNameEnabled),
    [assetNameEnabled]
  );
  const onSelect = useCallback((newSelection: any) => setSelectedDashboard(newSelection), []);

  const onClickSave = useCallback(
    async function () {
      const [newDashboard] = selectedDashboard;
      try {
        if (!newDashboard.value) {
          return;
        }

        const dashboardParams = {
          assetType,
          dashboardSavedObjectId: newDashboard.value,
          dashboardFilterAssetIdEnabled: assetNameEnabled,
        };

        const result =
          isEditMode && currentDashboard?.id
            ? await updateCustomDashboard({
                ...dashboardParams,
                id: currentDashboard.id,
              })
            : await createCustomDashboard(dashboardParams);

        const getToastLabels = isEditMode ? getEditSuccessToastLabels : getLinkSuccessToastLabels;

        if (result && !(isEditMode ? isUpdateLoading : isCreateLoading)) {
          notifications.toasts.addSuccess(getToastLabels(newDashboard.label));
        }

        setUrlState({ dashboardId: newDashboard.value });
        onRefresh();
      } catch (error) {
        notifications.toasts.addDanger({
          title: i18n.translate('xpack.infra.customDashboards.addFailure.toast.title', {
            defaultMessage: 'Error while adding "{dashboardName}" dashboard',
            values: { dashboardName: newDashboard.label },
          }),
          text: error.message,
        });
      }
      onClose();
    },
    [
      selectedDashboard,
      onClose,
      isEditMode,
      setUrlState,
      onRefresh,
      updateCustomDashboard,
      assetType,
      currentDashboard?.id,
      assetNameEnabled,
      isUpdateLoading,
      notifications.toasts,
      createCustomDashboard,
      isCreateLoading,
    ]
  );

  return (
    <EuiModal
      onClose={onClose}
      data-test-subj="infraSelectCustomDashboard"
      aria-labelledby={modalTitleId}
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle id={modalTitleId}>
          {isEditMode
            ? i18n.translate('xpack.infra.customDashboards.selectDashboard.modalTitle.edit', {
                defaultMessage: 'Edit dashboard',
              })
            : i18n.translate('xpack.infra.customDashboards.selectDashboard.modalTitle.link', {
                defaultMessage: 'Select dashboard',
              })}
        </EuiModalHeaderTitle>
      </EuiModalHeader>

      <EuiModalBody>
        <EuiFlexGroup direction="column" justifyContent="center">
          <EuiComboBox
            isLoading={status === FETCH_STATUS.LOADING}
            isDisabled={status === FETCH_STATUS.LOADING || isEditMode}
            placeholder={i18n.translate(
              'xpack.infra.customDashboards.selectDashboard.placeholder',
              {
                defaultMessage: 'Select dashboard',
              }
            )}
            singleSelection={{ asPlainText: true }}
            options={options}
            selectedOptions={selectedDashboard}
            onChange={onSelect}
            isClearable
          />

          <EuiSwitch
            css={{ alignItems: 'center' }}
            compressed
            label={
              <p>
                <span css={{ marginRight: euiTheme.size.xs }}>
                  {i18n.translate(
                    'xpack.infra.customDashboard.addDashboard.useContextFilterLabel',
                    {
                      defaultMessage: 'Filter by host name',
                    }
                  )}
                </span>
                <EuiIconTip
                  position="bottom"
                  content={i18n.translate(
                    'xpack.infra.customDashboard.addDashboard.useContextFilterLabel.tooltip',
                    {
                      defaultMessage:
                        'Enabling this option will apply filters to the dashboard based on your chosen host.',
                    }
                  )}
                  type="question"
                />
              </p>
            }
            onChange={onChange}
            checked={assetNameEnabled}
          />
        </EuiFlexGroup>
      </EuiModalBody>

      <EuiModalFooter>
        <EuiButtonEmpty
          data-test-subj="infraSelectDashboardCancelButton"
          onClick={onClose}
          isDisabled={loading}
        >
          {i18n.translate('xpack.infra.customDashboards.selectDashboard.cancel', {
            defaultMessage: 'Cancel',
          })}
        </EuiButtonEmpty>
        <EuiButton
          data-test-subj="infraSelectDashboardButton"
          onClick={onClickSave}
          isLoading={loading}
          fill
        >
          {isEditMode
            ? i18n.translate('xpack.infra.customDashboards.selectDashboard.edit', {
                defaultMessage: 'Save',
              })
            : i18n.translate('xpack.infra.customDashboards.selectDashboard.add', {
                defaultMessage: 'Link dashboard',
              })}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
}

function getLinkSuccessToastLabels(dashboardName: string) {
  return {
    title: i18n.translate('xpack.infra.customDashboards.linkSuccess.toast.title', {
      defaultMessage: 'Added "{dashboardName}" dashboard',
      values: { dashboardName },
    }),
    body: i18n.translate('xpack.infra.customDashboards.linkSuccess.toast.text', {
      defaultMessage: 'Your dashboard is now visible in the asset details page.',
    }),
  };
}

function getEditSuccessToastLabels(dashboardName: string) {
  return {
    title: i18n.translate('xpack.infra.customDashboards.editSuccess.toast.title', {
      defaultMessage: 'Edited "{dashboardName}" dashboard',
      values: { dashboardName },
    }),
    body: i18n.translate('xpack.infra.customDashboards.editSuccess.toast.text', {
      defaultMessage: 'Your dashboard link has been updated',
    }),
  };
}
