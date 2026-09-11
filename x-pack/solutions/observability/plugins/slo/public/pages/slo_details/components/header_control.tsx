/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AppHeaderMenu } from '@kbn/app-header';
import { i18n } from '@kbn/i18n';
import { sloFeatureId } from '@kbn/observability-plugin/common';
import { RuleFormFlyout } from '@kbn/response-ops-rule-form/flyout';
import { SLO_BURN_RATE_RULE_TYPE_ID } from '@kbn/rule-data-utils';
import type { SLOWithSummaryResponse } from '@kbn/slo-schema';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

export function useSloDetailsActionsPrimary({ slo }: Props): {
  primaryActionItem: NonNullable<AppHeaderMenu['primaryActionItem']>;
  flyouts: React.ReactNode;
} {
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

  const [isRuleFlyoutVisible, setRuleFlyoutVisibility] = useState<boolean>(false);
  const [isEditRuleFlyoutOpen, setIsEditRuleFlyoutOpen] = useState(false);

  const { data: rulesBySlo, refetchRules } = useFetchRulesForSlo({
    sloIds: [slo.id],
  });

  const rules = rulesBySlo?.[slo.id] ?? [];

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

  const handleOpenRuleFlyout = useCallback(() => {
    setRuleFlyoutVisibility(true);
  }, []);

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
    setIsActionsPopoverOpen: () => {},
  });

  const handleNavigateToApm = useCallback(() => {
    const url = convertSliApmParamsToApmAppDeeplinkUrl(slo);
    if (url) {
      navigateToUrl(basePath.prepend(url));
    }
  }, [basePath, navigateToUrl, slo]);

  const handleClone = useCallback(() => {
    triggerAction({ type: 'clone', item: slo });
  }, [slo, triggerAction]);

  const handleDelete = useCallback(() => {
    if (!!remoteDeleteUrl) {
      window.open(remoteDeleteUrl, '_blank');
    } else {
      triggerAction({
        type: 'delete',
        item: slo,
        onConfirm: () => {
          navigate(basePath.prepend(paths.slos));
        },
      });
      removeDeleteQueryParam();
    }
  }, [basePath, navigate, remoteDeleteUrl, removeDeleteQueryParam, slo, triggerAction]);

  const handleReset = useCallback(() => {
    if (!!remoteResetUrl) {
      window.open(remoteResetUrl, '_blank');
    } else {
      triggerAction({
        type: 'reset',
        item: slo,
        onConfirm: () => {},
      });
      removeResetQueryParam();
    }
  }, [remoteResetUrl, removeResetQueryParam, slo, triggerAction]);

  const handleEnable = useCallback(() => {
    if (!!remoteEnableUrl) {
      window.open(remoteEnableUrl, '_blank');
    } else {
      triggerAction({
        type: 'enable',
        item: slo,
        onConfirm: () => {},
      });
      removeEnableQueryParam();
    }
  }, [remoteEnableUrl, removeEnableQueryParam, slo, triggerAction]);

  const handleDisable = useCallback(() => {
    if (!!remoteDisableUrl) {
      window.open(remoteDisableUrl, '_blank');
    } else {
      triggerAction({
        type: 'disable',
        item: slo,
        onConfirm: () => {},
      });
      removeDisableQueryParam();
    }
  }, [remoteDisableUrl, removeDisableQueryParam, slo, triggerAction]);

  const isRemote = !!slo?.remote;
  const hasUndefinedRemoteKibanaUrl = !!slo?.remote && slo?.remote?.kibanaUrl === '';
  const writeDisabled = !permissions?.hasAllWriteRequested || hasUndefinedRemoteKibanaUrl;
  const remoteUnavailableTooltip = hasUndefinedRemoteKibanaUrl
    ? NOT_AVAILABLE_FOR_UNDEFINED_REMOTE_KIBANA_URL
    : undefined;

  const primaryActionItem = useMemo<NonNullable<AppHeaderMenu['primaryActionItem']>>(() => {
    const items: NonNullable<NonNullable<AppHeaderMenu['primaryActionItem']>['items']> = [
      {
        id: 'edit',
        label: i18n.translate('xpack.slo.sloDetails.headerControl.edit', {
          defaultMessage: 'Edit',
        }),
        iconType: 'pencil',
        href: sloEditUrl,
        target: isRemote ? '_blank' : undefined,
        disableButton: writeDisabled,
        tooltipContent: remoteUnavailableTooltip,
        testId: 'sloDetailsHeaderControlPopoverEdit',
      },
      {
        id: 'createBurnRateRule',
        label: i18n.translate('xpack.slo.sloDetails.headerControl.createBurnRateRule', {
          defaultMessage: 'Create new alert rule',
        }),
        iconType: 'bell',
        disableButton: !permissions?.hasAllWriteRequested || isRemote,
        tooltipContent: isRemote ? NOT_AVAILABLE_FOR_REMOTE : undefined,
        testId: 'sloDetailsHeaderControlPopoverCreateRule',
        run: handleOpenRuleFlyout,
      },
      {
        id: 'manageRules',
        label: i18n.translate('xpack.slo.sloDetails.headerControl.manageRules', {
          defaultMessage: 'Manage burn rate {count, plural, one {rule} other {rules}}',
          values: { count: rules.length },
        }),
        iconType: 'gear',
        disableButton: writeDisabled,
        tooltipContent: remoteUnavailableTooltip,
        testId: 'sloDetailsHeaderControlPopoverManageRules',
        run: () => {
          void handleNavigateToRules();
        },
      },
    ];

    if (isApmIndicatorType(slo.indicator)) {
      items.push({
        id: 'exploreInApm',
        label: i18n.translate('xpack.slo.sloDetails.headerControl.exploreInApm', {
          defaultMessage: 'Service details',
        }),
        iconType: 'bullseye',
        disableButton: !hasApmReadCapabilities || isRemote,
        tooltipContent: isRemote ? NOT_AVAILABLE_FOR_REMOTE : undefined,
        testId: 'sloDetailsHeaderControlPopoverExploreInApm',
        run: handleNavigateToApm,
      });
    }

    if (slo.enabled) {
      items.push({
        id: 'disable',
        label: i18n.translate('xpack.slo.item.actions.disable', { defaultMessage: 'Disable' }),
        iconType: 'stop',
        disableButton: writeDisabled,
        tooltipContent: remoteUnavailableTooltip,
        testId: 'sloActionsDisable',
        run: handleDisable,
      });
    } else {
      items.push({
        id: 'enable',
        label: i18n.translate('xpack.slo.item.actions.enable', { defaultMessage: 'Enable' }),
        iconType: 'play',
        disableButton: writeDisabled,
        tooltipContent: remoteUnavailableTooltip,
        testId: 'sloActionsEnable',
        run: handleEnable,
      });
    }

    items.push(
      {
        id: 'clone',
        label: i18n.translate('xpack.slo.slo.item.actions.clone', {
          defaultMessage: 'Clone',
        }),
        iconType: 'copy',
        disableButton: writeDisabled,
        tooltipContent: remoteUnavailableTooltip,
        testId: 'sloDetailsHeaderControlPopoverClone',
        run: handleClone,
      },
      {
        id: 'delete',
        label: i18n.translate('xpack.slo.slo.item.actions.delete', {
          defaultMessage: 'Delete',
        }),
        iconType: 'trash',
        disableButton: writeDisabled,
        tooltipContent: remoteUnavailableTooltip,
        testId: 'sloDetailsHeaderControlPopoverDelete',
        run: handleDelete,
      },
      {
        id: 'reset',
        label: i18n.translate('xpack.slo.slo.item.actions.reset', {
          defaultMessage: 'Reset',
        }),
        iconType: 'refresh',
        disableButton: writeDisabled,
        tooltipContent: remoteUnavailableTooltip,
        testId: 'sloDetailsHeaderControlPopoverReset',
        run: handleReset,
      }
    );

    return {
      id: 'actions',
      label: i18n.translate('xpack.slo.sloDetails.headerControl.actions', {
        defaultMessage: 'Actions',
      }),
      iconType: 'plusCircle',
      testId: 'o11yHeaderControlActionsButton',
      popoverWidth: 210,
      items,
    };
  }, [
    handleClone,
    handleDelete,
    handleDisable,
    handleEnable,
    handleNavigateToApm,
    handleNavigateToRules,
    handleOpenRuleFlyout,
    handleReset,
    hasApmReadCapabilities,
    isRemote,
    permissions?.hasAllWriteRequested,
    remoteUnavailableTooltip,
    rules.length,
    slo.enabled,
    slo.indicator,
    sloEditUrl,
    writeDisabled,
  ]);

  const flyouts = (
    <>
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

  return { primaryActionItem, flyouts };
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
