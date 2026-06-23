/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiIcon,
  EuiPopover,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { sloFeatureId } from '@kbn/observability-plugin/common';
import { RuleFormFlyout } from '@kbn/response-ops-rule-form/flyout';
import { SLO_BURN_RATE_RULE_TYPE_ID } from '@kbn/rule-data-utils';
import type { SLOWithSummaryResponse } from '@kbn/slo-schema';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import React, { useCallback, useEffect, useState } from 'react';
import { useActionModal } from '../../../context/action_modal';
import { useFetchRulesForSlo } from '../../../hooks/use_fetch_rules_for_slo';
import { useKibana } from '../../../hooks/use_kibana';
import { usePermissions } from '../../../hooks/use_permissions';
import { convertSliApmParamsToApmAppDeeplinkUrl } from '../../../utils/slo/convert_sli_apm_params_to_apm_app_deeplink_url';
import { isApmIndicatorType } from '../../../utils/slo/indicator';
import { EditBurnRateRuleFlyout } from '../../slos/components/common/edit_burn_rate_rule_flyout';
import { useGetQueryParams } from '../hooks/use_get_query_params';
import { useSloActions } from '../hooks/use_slo_actions';

export interface Props {
  slo: SLOWithSummaryResponse;
}

export function HeaderControl({ slo }: Props) {
  const { services } = useKibana();
  const {
    application: { navigateToUrl, capabilities },
    http: { basePath },
    triggersActionsUi: { ruleTypeRegistry, actionTypeRegistry },
  } = services;

  const hasApmReadCapabilities = capabilities.apm.show;
  const { data: permissions } = usePermissions();
  const { triggerAction } = useActionModal();

  const {
    isDeletingSlo,
    isResettingSlo,
    isEnablingSlo,
    isDisablingSlo,
    removeDeleteQueryParam,
    removeResetQueryParam,
    removeEnableQueryParam,
    removeDisableQueryParam,
  } = useGetQueryParams();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isRuleFlyoutVisible, setRuleFlyoutVisibility] = useState<boolean>(false);
  const [isEditRuleFlyoutOpen, setIsEditRuleFlyoutOpen] = useState(false);

  const { data: rulesBySlo, refetchRules } = useFetchRulesForSlo({
    sloIds: [slo.id],
  });

  const rules = rulesBySlo?.[slo.id] ?? [];

  const handleActionsClick = () => setIsPopoverOpen((value) => !value);
  const closePopover = () => setIsPopoverOpen(false);

  const navigate = useCallback(
    (url: string) => setTimeout(() => navigateToUrl(url)),
    [navigateToUrl]
  );

  useEffect(() => {
    if (isDeletingSlo) {
      triggerAction({
        type: 'delete',
        item: slo,
        onConfirm: () => {
          navigate(basePath.prepend(paths.slos));
        },
      });
      removeDeleteQueryParam();
    }
    if (isResettingSlo) {
      triggerAction({ type: 'reset', item: slo });
      removeResetQueryParam();
    }
    if (isEnablingSlo) {
      triggerAction({ type: 'enable', item: slo });
      removeEnableQueryParam();
    }
    if (isDisablingSlo) {
      triggerAction({ type: 'disable', item: slo });
      removeDisableQueryParam();
    }
  });

  const onCloseRuleFlyout = () => {
    setRuleFlyoutVisibility(false);
  };

  const handleOpenRuleFlyout = () => {
    closePopover();
    setRuleFlyoutVisibility(true);
  };

  const {
    handleNavigateToRules,
    sloEditUrl,
    remoteDeleteUrl,
    remoteResetUrl,
    remoteEnableUrl,
    remoteDisableUrl,
  } = useSloActions({
    slo,
    rules,
    setIsEditRuleFlyoutOpen,
    setIsActionsPopoverOpen: setIsPopoverOpen,
  });

  const handleNavigateToApm = () => {
    const url = convertSliApmParamsToApmAppDeeplinkUrl(slo);
    if (url) {
      navigateToUrl(basePath.prepend(url));
    }
  };

  const handleClone = () => {
    triggerAction({ type: 'clone', item: slo });
  };

  const handleDelete = () => {
    if (!!remoteDeleteUrl) {
      window.open(remoteDeleteUrl, '_blank');
    } else {
      triggerAction({
        type: 'delete',
        item: slo,
        onConfirm: () => {
          navigate(basePath.prepend(paths.slos));
          setIsPopoverOpen(false);
        },
      });
      removeDeleteQueryParam();
    }
  };

  const handleReset = () => {
    if (!!remoteResetUrl) {
      window.open(remoteResetUrl, '_blank');
    } else {
      triggerAction({
        type: 'reset',
        item: slo,
        onConfirm: () => {
          setIsPopoverOpen(false);
        },
      });
      removeResetQueryParam();
    }
  };

  const handleEnable = () => {
    if (!!remoteEnableUrl) {
      window.open(remoteEnableUrl, '_blank');
    } else {
      triggerAction({
        type: 'enable',
        item: slo,
        onConfirm: () => {
          setIsPopoverOpen(false);
        },
      });
      removeEnableQueryParam();
    }
  };

  const handleDisable = () => {
    if (!!remoteDisableUrl) {
      window.open(remoteDisableUrl, '_blank');
    } else {
      triggerAction({
        type: 'disable',
        item: slo,
        onConfirm: () => {
          setIsPopoverOpen(false);
        },
      });
      removeDisableQueryParam();
    }
  };

  const isRemote = !!slo?.remote;
  const hasUndefinedRemoteKibanaUrl = !!slo?.remote && slo?.remote?.kibanaUrl === '';

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
    <>
      <EuiPopover
        aria-label={i18n.translate('xpack.slo.sloDetailsHeaderControl.popoverAriaLabel', {
          defaultMessage: 'SLO details actions',
        })}
        data-test-subj="sloDetailsHeaderControlPopover"
        button={
          <EuiButton
            data-test-subj="o11yHeaderControlActionsButton"
            fill
            iconSide="right"
            iconType="chevronSingleDown"
            iconSize="s"
            onClick={handleActionsClick}
          >
            {i18n.translate('xpack.slo.sloDetails.headerControl.actions', {
              defaultMessage: 'Actions',
            })}
          </EuiButton>
        }
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
      >
        <EuiContextMenuPanel
          items={[
            <EuiContextMenuItem
              key="edit"
              disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
              icon="pencil"
              href={sloEditUrl}
              target={isRemote ? '_blank' : undefined}
              toolTipContent={
                hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
              }
              data-test-subj="sloDetailsHeaderControlPopoverEdit"
            >
              {i18n.translate('xpack.slo.sloDetails.headerControl.edit', {
                defaultMessage: 'Edit',
              })}
              {showRemoteLinkIcon}
            </EuiContextMenuItem>,
            <EuiContextMenuItem
              key="createBurnRateRule"
              disabled={!permissions?.hasAllWriteRequested || isRemote}
              icon="bell"
              onClick={handleOpenRuleFlyout}
              data-test-subj="sloDetailsHeaderControlPopoverCreateRule"
              toolTipContent={isRemote ? NOT_AVAILABLE_FOR_REMOTE : ''}
            >
              {i18n.translate('xpack.slo.sloDetails.headerControl.createBurnRateRule', {
                defaultMessage: 'Create new alert rule',
              })}
            </EuiContextMenuItem>,
            <EuiContextMenuItem
              key="manageRules"
              disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
              icon="gear"
              onClick={handleNavigateToRules}
              data-test-subj="sloDetailsHeaderControlPopoverManageRules"
              toolTipContent={
                hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
              }
            >
              {i18n.translate('xpack.slo.sloDetails.headerControl.manageRules', {
                defaultMessage: 'Manage burn rate {count, plural, one {rule} other {rules}}',
                values: { count: rules.length },
              })}
              {showRemoteLinkIcon}
            </EuiContextMenuItem>,
          ]
            .concat(
              !!slo && isApmIndicatorType(slo.indicator) ? (
                <EuiContextMenuItem
                  key="exploreInApm"
                  icon="bullseye"
                  disabled={!hasApmReadCapabilities || isRemote}
                  onClick={handleNavigateToApm}
                  data-test-subj="sloDetailsHeaderControlPopoverExploreInApm"
                  toolTipContent={isRemote ? NOT_AVAILABLE_FOR_REMOTE : ''}
                >
                  {i18n.translate('xpack.slo.sloDetails.headerControl.exploreInApm', {
                    defaultMessage: 'Service details',
                  })}
                </EuiContextMenuItem>
              ) : (
                []
              )
            )
            .concat(
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
                data-test-subj="sloDetailsHeaderControlPopoverClone"
                toolTipContent={
                  hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
                }
              >
                {i18n.translate('xpack.slo.slo.item.actions.clone', {
                  defaultMessage: 'Clone',
                })}
                {showRemoteLinkIcon}
              </EuiContextMenuItem>,
              <EuiContextMenuItem
                key="delete"
                icon="trash"
                disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
                onClick={handleDelete}
                data-test-subj="sloDetailsHeaderControlPopoverDelete"
                toolTipContent={
                  hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
                }
              >
                {i18n.translate('xpack.slo.slo.item.actions.delete', {
                  defaultMessage: 'Delete',
                })}
                {showRemoteLinkIcon}
              </EuiContextMenuItem>,
              <EuiContextMenuItem
                key="reset"
                icon="refresh"
                disabled={!permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl}
                onClick={handleReset}
                data-test-subj="sloDetailsHeaderControlPopoverReset"
                toolTipContent={
                  hasUndefinedRemoteKibanaUrl ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL : ''
                }
              >
                {i18n.translate('xpack.slo.slo.item.actions.reset', {
                  defaultMessage: 'Reset',
                })}
                {showRemoteLinkIcon}
              </EuiContextMenuItem>
            )}
        />
      </EuiPopover>
      <EditBurnRateRuleFlyout
        rule={rules?.[0]}
        isEditRuleFlyoutOpen={isEditRuleFlyoutOpen}
        setIsEditRuleFlyoutOpen={setIsEditRuleFlyoutOpen}
        refetchRules={refetchRules}
      />

      {isRuleFlyoutVisible ? (
        <RuleFormFlyout
          plugins={{ ...services, actionTypeRegistry, ruleTypeRegistry }}
          consumer={sloFeatureId}
          ruleTypeId={SLO_BURN_RATE_RULE_TYPE_ID}
          onCancel={onCloseRuleFlyout}
          onSubmit={onCloseRuleFlyout}
          initialValues={{ name: `${slo.name} burn rate`, params: { sloId: slo.id } }}
          shouldUseRuleProducer
        />
      ) : null}
    </>
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
