/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { EuiButtonIconProps } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiIcon,
  EuiPanel,
  EuiPopover,
  useEuiShadow,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { SLOWithSummaryResponse } from '@kbn/slo-schema';
import type { Rule } from '@kbn/triggers-actions-ui-plugin/public';
import React from 'react';
import { useKibana } from '../../../hooks/use_kibana';
import { usePermissions } from '../../../hooks/use_permissions';
import type { BurnRateRuleParams } from '../../../typings';
import { useSloActions } from '../../slo_details/hooks/use_slo_actions';
import { useActionModal } from '../../../context/action_modal';

interface Props {
  slo: SLOWithSummaryResponse;
  isActionsPopoverOpen: boolean;
  setIsActionsPopoverOpen: (value: boolean) => void;
  setIsAddRuleFlyoutOpen: (value: boolean) => void;
  setIsEditRuleFlyoutOpen: (value: boolean) => void;
  setDashboardAttachmentReady?: (value: boolean) => void;
  btnProps?: Partial<EuiButtonIconProps>;
  rules?: Array<Rule<BurnRateRuleParams>>;
}

function IconPanel({ children }: { children: JSX.Element }) {
  const shadow = useEuiShadow('s');
  return (
    <EuiPanel
      color="plain"
      element="button"
      grow={false}
      paddingSize="none"
      hasShadow={false}
      css={css`
        ${shadow}
      `}
    >
      {children}
    </EuiPanel>
  );
}

export function SloItemActions({
  slo,
  rules,
  isActionsPopoverOpen,
  setIsActionsPopoverOpen,
  setIsAddRuleFlyoutOpen,
  setIsEditRuleFlyoutOpen,
  setDashboardAttachmentReady,
  btnProps,
}: Props) {
  const {
    application: { navigateToUrl },
    executionContext,
  } = useKibana().services;
  const executionContextName = executionContext.get().name;
  const isDashboardContext = executionContextName === 'dashboards';
  const { data: permissions } = usePermissions();
  const { triggerAction } = useActionModal();

  const {
    handleNavigateToRules,
    sloEditUrl,
    remoteDeleteUrl,
    remoteResetUrl,
    remoteEnableUrl,
    remoteDisableUrl,
    sloDetailsUrl,
  } = useSloActions({
    slo,
    rules,
    setIsEditRuleFlyoutOpen,
    setIsActionsPopoverOpen,
  });

  const handleClickActions = () => {
    setIsActionsPopoverOpen(!isActionsPopoverOpen);
  };

  const handleViewDetails = () => {
    navigateToUrl(sloDetailsUrl);
  };

  const handleClone = () => {
    triggerAction({ type: 'clone', item: slo, onConfirm: () => setIsActionsPopoverOpen(false) });
  };

  const handleDelete = () => {
    if (!!remoteDeleteUrl) {
      window.open(remoteDeleteUrl, '_blank');
    } else {
      triggerAction({ type: 'delete', item: slo, onConfirm: () => setIsActionsPopoverOpen(false) });
    }
  };

  const handleReset = () => {
    if (!!remoteResetUrl) {
      window.open(remoteResetUrl, '_blank');
    } else {
      triggerAction({ type: 'reset', item: slo, onConfirm: () => setIsActionsPopoverOpen(false) });
    }
  };

  const handleEnable = () => {
    if (!!remoteEnableUrl) {
      window.open(remoteEnableUrl, '_blank');
    } else {
      triggerAction({ type: 'enable', item: slo, onConfirm: () => setIsActionsPopoverOpen(false) });
    }
  };

  const handleDisable = () => {
    if (!!remoteDisableUrl) {
      window.open(remoteDisableUrl, '_blank');
    } else {
      triggerAction({
        type: 'disable',
        item: slo,
        onConfirm: () => setIsActionsPopoverOpen(false),
      });
    }
  };

  const handleCreateRule = () => {
    setIsActionsPopoverOpen(false);
    setIsAddRuleFlyoutOpen(true);
  };

  const handleAddToDashboard = () => {
    setIsActionsPopoverOpen(false);
    if (setDashboardAttachmentReady) {
      setDashboardAttachmentReady(true);
    }
  };

  const btn = (
    <EuiButtonIcon
      data-test-subj="o11ySloListItemButton"
      aria-label={i18n.translate('xpack.slo.item.actions.button', {
        defaultMessage: 'Actions',
      })}
      color="text"
      disabled={!slo.summary}
      display="empty"
      iconType="boxesVertical"
      size="s"
      onClick={handleClickActions}
      {...btnProps}
    />
  );

  const isRemote = !!slo.remote;
  const hasUndefinedRemoteKibanaUrl = !!slo.remote && slo.remote.kibanaUrl === '';

  const showRemoteLinkIcon = isRemote ? (
    <EuiIcon
      type="external"
      size="s"
      aria-hidden={true}
      css={{
        marginLeft: '10px',
      }}
    />
  ) : null;

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.slo.sloItemActions.popoverAriaLabel', {
        defaultMessage: 'SLO item actions',
      })}
      anchorPosition="downLeft"
      button={btnProps ? <IconPanel>{btn}</IconPanel> : btn}
      panelPaddingSize="m"
      closePopover={handleClickActions}
      isOpen={isActionsPopoverOpen}
    >
      <EuiContextMenuPanel
        items={[
          <EuiContextMenuItem
            key="view"
            icon="inspect"
            onClick={handleViewDetails}
            data-test-subj="sloActionsView"
          >
            {i18n.translate('xpack.slo.item.actions.details', {
              defaultMessage: 'Details',
            })}
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="edit"
            icon="pencil"
            disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
            href={sloEditUrl}
            target={isRemote ? '_blank' : undefined}
            toolTipContent={
              hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
            }
            data-test-subj="sloActionsEdit"
          >
            {i18n.translate('xpack.slo.item.actions.edit', {
              defaultMessage: 'Edit',
            })}
            {showRemoteLinkIcon}
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="createRule"
            icon="bell"
            disabled={!permissions?.hasAllWriteRequested || isRemote}
            onClick={handleCreateRule}
            data-test-subj="sloActionsCreateRule"
            toolTipContent={isRemote ? NOT_AVAILABLE_FOR_REMOTE : ''}
          >
            {i18n.translate('xpack.slo.item.actions.createRule', {
              defaultMessage: 'Create new alert rule',
            })}
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="manageRules"
            icon="gear"
            disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
            onClick={handleNavigateToRules}
            data-test-subj="sloActionsManageRules"
            toolTipContent={
              hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
            }
          >
            {i18n.translate('xpack.slo.item.actions.manageBurnRateRules', {
              defaultMessage: 'Manage burn rate {count, plural, one {rule} other {rules}}',
              values: { count: rules?.length ?? 0 },
            })}
            {showRemoteLinkIcon}
          </EuiContextMenuItem>,
          slo.enabled ? (
            <EuiContextMenuItem
              key="disable"
              icon="stop"
              disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
              onClick={handleDisable}
              toolTipContent={
                hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
              }
              data-test-subj="sloActionsDisable"
            >
              {i18n.translate('xpack.slo.item.actions.disable', { defaultMessage: 'Disable' })}
              {showRemoteLinkIcon}
            </EuiContextMenuItem>
          ) : (
            <EuiContextMenuItem
              key="enable"
              icon="play"
              disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
              onClick={handleEnable}
              toolTipContent={
                hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
              }
              data-test-subj="sloActionsEnable"
            >
              {i18n.translate('xpack.slo.item.actions.enable', { defaultMessage: 'Enable' })}
              {showRemoteLinkIcon}
            </EuiContextMenuItem>
          ),
          <EuiContextMenuItem
            key="clone"
            disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
            icon="copy"
            onClick={handleClone}
            data-test-subj="sloActionsClone"
            toolTipContent={
              hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
            }
          >
            {i18n.translate('xpack.slo.item.actions.clone', { defaultMessage: 'Clone' })}
            {showRemoteLinkIcon}
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="delete"
            icon="trash"
            disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
            onClick={handleDelete}
            toolTipContent={
              hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
            }
            data-test-subj="sloActionsDelete"
          >
            {i18n.translate('xpack.slo.item.actions.delete', { defaultMessage: 'Delete' })}
            {showRemoteLinkIcon}
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            key="reset"
            icon="refresh"
            disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
            onClick={handleReset}
            toolTipContent={
              hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
            }
            data-test-subj="sloActionsReset"
          >
            {i18n.translate('xpack.slo.item.actions.reset', { defaultMessage: 'Reset' })}
            {showRemoteLinkIcon}
          </EuiContextMenuItem>,
        ].concat(
          !isDashboardContext && !!setDashboardAttachmentReady ? (
            <EuiContextMenuItem
              icon="dashboardApp"
              key="addToDashboard"
              onClick={handleAddToDashboard}
              data-test-subj="sloActionsAddToDashboard"
            >
              {i18n.translate('xpack.slo.item.actions.addToDashboard', {
                defaultMessage: 'Add to Dashboard',
              })}
            </EuiContextMenuItem>
          ) : (
            []
          )
        )}
      />
    </EuiPopover>
  );
}

const NOT_AVAILABLE_FOR_REMOTE = i18n.translate('xpack.slo.item.actions.notAvailable', {
  defaultMessage: 'This action is not available for remote SLOs',
});

const NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL = i18n.translate(
  'xpack.slo.item.actions.remoteKibanaUrlUndefined',
  {
    defaultMessage: 'This action is not available for remote SLOs with undefined kibanaUrl',
  }
);
