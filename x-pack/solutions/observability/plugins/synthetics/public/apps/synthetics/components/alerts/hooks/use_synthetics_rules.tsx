/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useDispatch, useSelector } from 'react-redux-v7';
import React, { useCallback, useEffect, useMemo } from 'react';
import type { CoreStart } from '@kbn/core/public';
import { RuleFormFlyout } from '@kbn/response-ops-rule-form/flyout';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { i18n } from '@kbn/i18n';
import { selectDynamicSettings } from '../../../state/settings/selectors';
import { useCanManageRules } from '../../../../../hooks/use_capabilities';
import {
  selectSyntheticsAlerts,
  selectSyntheticsAlertsLoading,
  selectSyntheticsAlertsLoaded,
} from '../../../state/alert_rules/selectors';
import {
  enableDefaultAlertingSilentlyAction,
  getDefaultAlertingAction,
} from '../../../state/alert_rules';
import { SYNTHETICS_TLS_RULE } from '../../../../../../common/constants/synthetics_alerts';
import {
  selectAlertFlyoutVisibility,
  selectIsNewRule,
  setAlertFlyoutVisible,
} from '../../../state';
import { selectMonitorListState } from '../../../state/monitor_list/selectors';
import type { ClientPluginsStart } from '../../../../../plugin';

export const useSyntheticsRules = (isOpen: boolean) => {
  const dispatch = useDispatch();

  const defaultRules = useSelector(selectSyntheticsAlerts);
  const loading = useSelector(selectSyntheticsAlertsLoading);
  const rulesLoaded = useSelector(selectSyntheticsAlertsLoaded);
  const alertFlyoutVisible = useSelector(selectAlertFlyoutVisibility);
  const isNewRule = useSelector(selectIsNewRule);
  const { settings } = useSelector(selectDynamicSettings);
  const canManageRules = useCanManageRules();
  const { loaded, data: monitors } = useSelector(selectMonitorListState);

  const hasMonitors = loaded && monitors.absoluteTotal && monitors.absoluteTotal > 0;
  const defaultRulesEnabled =
    settings && (settings?.defaultStatusRuleEnabled || settings?.defaultTLSRuleEnabled);

  const getOrCreateAlerts = useCallback(() => {
    if (canManageRules) {
      dispatch(enableDefaultAlertingSilentlyAction.get());
    } else {
      dispatch(getDefaultAlertingAction.get());
    }
  }, [canManageRules, dispatch]);

  // Fetch or create default rules when popover opens
  useEffect(() => {
    const shouldGetOrCreateAlerts =
      isOpen && hasMonitors && defaultRulesEnabled && !loading && rulesLoaded === null;
    if (shouldGetOrCreateAlerts) {
      getOrCreateAlerts();
    }
  }, [isOpen, hasMonitors, defaultRulesEnabled, loading, rulesLoaded, getOrCreateAlerts]);

  const {
    triggersActionsUi: { ruleTypeRegistry, actionTypeRegistry },
    ...plugins
  } = useKibana<CoreStart & ClientPluginsStart>().services;

  const onClose = useCallback(() => dispatch(setAlertFlyoutVisible(null)), [dispatch]);

  const EditAlertFlyout = useMemo(() => {
    // Don't render if this is a new rule flyout
    if (isNewRule || !alertFlyoutVisible) {
      return null;
    }

    const initialRule =
      alertFlyoutVisible === SYNTHETICS_TLS_RULE ? defaultRules?.tlsRule : defaultRules?.statusRule;

    // If the rule doesn't exist yet, return null (the useEffect will try to fetch/create it)
    if (!initialRule) {
      return null;
    }

    return (
      <RuleFormFlyout
        plugins={{ ...plugins, ruleTypeRegistry, actionTypeRegistry }}
        onCancel={onClose}
        onSubmit={onClose}
        id={initialRule.id}
      />
    );
  }, [
    alertFlyoutVisible,
    defaultRules?.tlsRule,
    defaultRules?.statusRule,
    isNewRule,
    plugins,
    ruleTypeRegistry,
    actionTypeRegistry,
    onClose,
  ]);

  const NewRuleFlyout = useMemo(() => {
    if (!isNewRule || !alertFlyoutVisible) {
      return null;
    }
    return (
      <RuleFormFlyout
        plugins={{ ...plugins, ruleTypeRegistry, actionTypeRegistry }}
        onCancel={onClose}
        onSubmit={onClose}
        ruleTypeId={alertFlyoutVisible}
        initialValues={{
          name:
            alertFlyoutVisible === SYNTHETICS_TLS_RULE
              ? i18n.translate('xpack.synthetics.alerting.defaultRuleName.tls', {
                  defaultMessage: 'Synthetics monitor TLS rule',
                })
              : i18n.translate('xpack.synthetics.alerting.defaultRuleName', {
                  defaultMessage: 'Synthetics monitor status rule',
                }),
        }}
      />
    );
  }, [isNewRule, alertFlyoutVisible, plugins, ruleTypeRegistry, actionTypeRegistry, onClose]);

  return useMemo(
    () => ({ loading, EditAlertFlyout, NewRuleFlyout, defaultRules }),
    [EditAlertFlyout, loading, NewRuleFlyout, defaultRules]
  );
};
