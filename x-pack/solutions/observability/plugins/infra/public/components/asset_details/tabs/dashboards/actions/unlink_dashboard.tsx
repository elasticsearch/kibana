/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { EuiButtonEmpty, EuiConfirmModal, EuiToolTip, useGeneratedHtmlId } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useCallback, useState } from 'react';
import { useKibanaContextForPlugin } from '../../../../../hooks/use_kibana';
import type {
  DashboardItemWithTitle,
  InfraCustomDashboardAssetType,
} from '../../../../../../common/custom_dashboards';
import { useDeleteCustomDashboard } from '../../../hooks/use_custom_dashboards';
import { useFetchCustomDashboards } from '../../../hooks/use_fetch_custom_dashboards';
import { useAssetDetailsUrlState } from '../../../hooks/use_asset_details_url_state';
import { useSavedObjectUserPermissions } from '../../../hooks/use_saved_objects_permissions';

export function UnlinkDashboard({
  currentDashboard,
  onRefresh,
  assetType,
}: {
  currentDashboard: DashboardItemWithTitle;
  onRefresh: () => void;
  assetType: InfraCustomDashboardAssetType;
}) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const confirmModalTitleId = useGeneratedHtmlId();
  const {
    services: { notifications },
  } = useKibanaContextForPlugin();

  const [, setUrlState] = useAssetDetailsUrlState();
  const { deleteCustomDashboard, isDeleteLoading } = useDeleteCustomDashboard();
  const { dashboards, loading } = useFetchCustomDashboards({ assetType });
  const { canDelete } = useSavedObjectUserPermissions();

  const onClick = useCallback(() => setIsModalVisible(true), []);
  const onCancel = useCallback(() => setIsModalVisible(false), []);
  const onError = useCallback(() => setIsModalVisible(!isModalVisible), [isModalVisible]);

  const onConfirm = useCallback(
    async function () {
      try {
        const linkedDashboards = (dashboards ?? []).filter(
          ({ dashboardSavedObjectId }) =>
            dashboardSavedObjectId !== currentDashboard.dashboardSavedObjectId
        );
        const result = await deleteCustomDashboard({
          assetType,
          id: currentDashboard.id,
        });
        setUrlState({ dashboardId: linkedDashboards[0]?.dashboardSavedObjectId });

        if (result) {
          notifications.toasts.addSuccess({
            title: i18n.translate('xpack.infra.customDashboards.unlinkSuccess.toast.title', {
              defaultMessage: 'Unlinked "{dashboardName}" dashboard',
              values: { dashboardName: currentDashboard?.title },
            }),
          });
          onRefresh();
        }
      } catch (error) {
        notifications.toasts.addDanger({
          title: i18n.translate('xpack.infra.customDashboards.unlinkFailure.toast.title', {
            defaultMessage: 'Error while unlinking "{dashboardName}" dashboard',
            values: { dashboardName: currentDashboard?.title },
          }),
          text: error.body.message,
        });
      }
      onError();
    },
    [
      onError,
      dashboards,
      deleteCustomDashboard,
      assetType,
      currentDashboard.id,
      currentDashboard.dashboardSavedObjectId,
      currentDashboard?.title,
      setUrlState,
      notifications.toasts,
      onRefresh,
    ]
  );

  return (
    <>
      <EuiToolTip
        position="top"
        content={
          !canDelete
            ? i18n.translate(
                'xpack.infra.linkDashboard.tooltip.youDoNotHavePermissionToUseThisFeature',
                {
                  defaultMessage:
                    'You do not have permission to use this feature. Please ask your administrator for access.',
                }
              )
            : undefined
        }
      >
        <EuiButtonEmpty
          color="danger"
          size="s"
          iconType="linkSlash"
          data-test-subj="infraUnLinkDashboardMenu"
          onClick={onClick}
          disabled={!canDelete}
        >
          {i18n.translate('xpack.infra.customDashboards.unlinkEmptyButtonLabel', {
            defaultMessage: 'Unlink dashboard',
          })}
        </EuiButtonEmpty>
      </EuiToolTip>
      {isModalVisible && (
        <EuiConfirmModal
          aria-labelledby={confirmModalTitleId}
          title={i18n.translate(
            'xpack.infra.customDashboards.unlinkEmptyButtonLabel.confirm.title',
            {
              defaultMessage: 'Unlink Dashboard',
            }
          )}
          titleProps={{ id: confirmModalTitleId }}
          onCancel={onCancel}
          onConfirm={onConfirm}
          confirmButtonText={i18n.translate(
            'xpack.infra.customDashboards.unlinkEmptyButtonLabel.confirm.button',
            {
              defaultMessage: 'Unlink dashboard',
            }
          )}
          buttonColor="danger"
          defaultFocusedButton="confirm"
          isLoading={loading || isDeleteLoading}
        >
          <p>
            {i18n.translate('xpack.infra.customDashboards.unlinkEmptyButtonLabel.confirm.body', {
              defaultMessage: `You are about to unlink the dashboard from the {assetType} context`,
              values: { assetType },
            })}
          </p>
        </EuiConfirmModal>
      )}
    </>
  );
}
