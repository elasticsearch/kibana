/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiHeaderLink, EuiHeaderLinks, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import type { ObservabilityOnboardingLocatorParams } from '@kbn/deeplinks-observability';
import { OBSERVABILITY_ONBOARDING_LOCATOR } from '@kbn/deeplinks-observability';
import { getAlertingCapabilities } from '../../../alerting/utils/get_alerting_capabilities';
import { getLegacyApmHref } from '../../../shared/links/apm/apm_link_hooks';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { AlertingPopoverAndFlyout } from './alerting_popover_flyout';
import { SloPopoverAndFlyout } from './slo_popover_flyout';
import { InspectorHeaderLink } from './inspector_header_link';
import { AnomalyDetectionSetupLink } from './anomaly_detection_setup_link';

export function ApmHeaderActionMenu() {
  const { core, plugins, config, share } = useApmPluginContext();
  const { search } = window.location;
  const { application, http } = core;
  const { basePath } = http;
  const { capabilities } = application;
  const { featureFlags } = config;
  const canReadMlJobs = !!capabilities.ml?.canGetJobs;
  const canCreateMlJobs = !!capabilities.ml?.canCreateJob;
  const { isAlertingAvailable, canReadAlerts, canSaveAlerts } = getAlertingCapabilities(
    plugins,
    capabilities
  );
  const canSaveApmAlerts = capabilities.apm.save && canSaveAlerts;
  const canReadSlos = !!capabilities.slo?.read;
  const canWriteSlos = !!capabilities.slo?.write;
  const isSloAvailable = canReadSlos || canWriteSlos;
  const onboardingLocator = share?.url.locators.get<ObservabilityOnboardingLocatorParams>(
    OBSERVABILITY_ONBOARDING_LOCATOR
  );
  const addDataUrl = onboardingLocator?.useUrl({ category: 'application' }) ?? '';

  function apmHref(path: string) {
    return getLegacyApmHref({ basePath, path, search });
  }

  return (
    <EuiHeaderLinks gutterSize="xs">
      {canCreateMlJobs && <AnomalyDetectionSetupLink />}

      {featureFlags.storageExplorerAvailable && (
        <EuiHeaderLink
          color="primary"
          href={apmHref('/storage-explorer')}
          data-test-subj="apmStorageExplorerHeaderLink"
        >
          <EuiFlexGroup gutterSize="s" alignItems="center">
            <EuiFlexItem grow={false}>
              {i18n.translate('xpack.apm.storageExplorerLinkLabel', {
                defaultMessage: 'Storage explorer',
              })}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiHeaderLink>
      )}

      {isAlertingAvailable && (
        <AlertingPopoverAndFlyout
          canReadAlerts={canReadAlerts}
          canSaveAlerts={canSaveApmAlerts}
          canReadMlJobs={canReadMlJobs}
        />
      )}

      {isSloAvailable && (
        <SloPopoverAndFlyout canReadSlos={canReadSlos} canWriteSlos={canWriteSlos} />
      )}

      <EuiHeaderLink
        color="primary"
        href={apmHref('/settings')}
        data-test-subj="apmSettingsHeaderLink"
      >
        {i18n.translate('xpack.apm.settingsLinkLabel', {
          defaultMessage: 'Settings',
        })}
      </EuiHeaderLink>

      <InspectorHeaderLink />

      <EuiHeaderLink color="primary" href={addDataUrl} data-test-subj="apmAddDataHeaderLink">
        {i18n.translate('xpack.apm.addDataButtonLabel', {
          defaultMessage: 'Add data',
        })}
      </EuiHeaderLink>
    </EuiHeaderLinks>
  );
}
