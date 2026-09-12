/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { useDispatch, useSelector } from 'react-redux-v7';
import { EuiMarkdownFormat, EuiSpacer } from '@elastic/eui';
import { KbnWarningCallout } from '@kbn/ui-callout';
import { syntheticsSettingsLocatorID } from '@kbn/observability-plugin/common';
import { useFetcher } from '@kbn/observability-shared-plugin/public';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import { i18n } from '@kbn/i18n';
import { isEmpty } from 'lodash';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ClientPluginsStart } from '../../../../../plugin';
import { selectDynamicSettings } from '../../../state/settings';
import {
  selectSyntheticsAlerts,
  selectSyntheticsAlertsLoaded,
} from '../../../state/alert_rules/selectors';
import { selectMonitorListState } from '../../../state';
import { getDynamicSettingsAction } from '../../../state/settings/actions';
import { useCanManageRules } from '../../../../../hooks/use_capabilities';
import { ConfigKey } from '../../../../../../common/runtime_types';

export const AlertingCallout = ({ isAlertingEnabled }: { isAlertingEnabled?: boolean }) => {
  const dispatch = useDispatch();

  const defaultRules = useSelector(selectSyntheticsAlerts);
  const rulesLoaded = useSelector(selectSyntheticsAlertsLoaded);
  const { settings } = useSelector(selectDynamicSettings);

  const hasDefaultConnector = !settings || !isEmpty(settings?.defaultConnectors);
  const defaultRuleEnabled = settings?.defaultTLSRuleEnabled || settings?.defaultStatusRuleEnabled;

  const canManageRules = useCanManageRules();

  const {
    data: { monitors },
    loaded: monitorsLoaded,
  } = useSelector(selectMonitorListState);

  const syntheticsLocators = useKibana<ClientPluginsStart>().services.share?.url.locators;

  const locator = syntheticsLocators?.get(syntheticsSettingsLocatorID);

  const { data: url } = useFetcher(() => {
    return locator?.getUrl({});
  }, [locator]);

  const hasAlertingConfigured =
    isAlertingEnabled ??
    (monitorsLoaded &&
      monitors.some((monitor) => monitor[ConfigKey.ALERT_CONFIG]?.status?.enabled));

  const showCallout = !hasDefaultConnector && hasAlertingConfigured && defaultRuleEnabled;
  const hasDefaultRules =
    !rulesLoaded || Boolean(defaultRules?.statusRule && defaultRules?.tlsRule);
  const missingRules = !hasDefaultRules && !canManageRules;

  useEffect(() => {
    if (!settings) {
      dispatch(getDynamicSettingsAction.get());
    }
  }, [dispatch, settings]);

  return (
    <>
      <MissingRulesCallout
        url={url}
        missingConfig={Boolean(showCallout)}
        missingRules={missingRules}
      />
      <EuiSpacer size="m" />
    </>
  );
};

const MissingRulesCallout = ({
  url,
  missingRules,
  missingConfig,
}: {
  url?: string;
  missingConfig?: boolean;
  missingRules?: boolean;
}) => {
  const [isHidden, setIsHidden] = useLocalStorage('MissingRulesCalloutHidden', false);

  if ((!missingConfig && !missingRules) || isHidden) {
    return null;
  }
  const point = missingRules === missingConfig ? '* ' : '';

  const configCallout = missingConfig ? (
    <EuiMarkdownFormat>{`${point}${MISSING_CONFIG_LABEL}`}</EuiMarkdownFormat>
  ) : null;

  const rulesCallout = missingRules ? (
    <EuiMarkdownFormat>{`${point}${MISSING_RULES_PRIVILEGES_LABEL}`}</EuiMarkdownFormat>
  ) : null;

  const reminderButtonProps = {
    children: (
      <FormattedMessage
        id="xpack.synthetics.alerting.remindMeLater.button"
        defaultMessage="Remind me later"
      />
    ),
    'data-test-subj': 'syntheticsMissingRulesCalloutRemindMeLaterButton',
    onClick: () => {
      setIsHidden(true);
    },
  };

  return (
    <KbnWarningCallout
      title={
        <FormattedMessage
          id="xpack.synthetics.alerting.noConnectorsCallout.header"
          defaultMessage="Alerts are not being sent"
        />
      }
      actionProps={
        missingConfig
          ? {
              primary: {
                'data-test-subj': 'syntheticsAlertingCalloutLinkButtonButton',
                href: url,
                children: (
                  <FormattedMessage
                    id="xpack.synthetics.alerting.noConnectorsCallout.button"
                    defaultMessage="Configure now"
                  />
                ),
              },
              secondary: reminderButtonProps,
            }
          : { primary: reminderButtonProps }
      }
    >
      {configCallout}
      {rulesCallout}
    </KbnWarningCallout>
  );
};

const MISSING_CONFIG_LABEL = i18n.translate(
  'xpack.synthetics.alerting.noConnectorsCallout.content',
  {
    defaultMessage:
      'You have monitors with alerting enabled, but there is no default connector configured to send those alerts.',
  }
);

export const MISSING_RULES_PRIVILEGES_LABEL = i18n.translate(
  'xpack.synthetics.alerting.missingRules.content',
  {
    defaultMessage:
      'You have monitors with alerting enabled, but there is no rules configured to send those alerts. Default rules are automatically created when user with write privileges opens Synthetics app.',
  }
);
