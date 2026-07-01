/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { EBT_CLICK_ACTIONS } from '@kbn/ebt-click';
import { i18n } from '@kbn/i18n';
import type { Environment } from '../../../../../common/environment_rt';
import type { ServiceNodeData } from '../../../../../common/service_map';
import { AnomaliesBadge } from '../../../app/service_inventory/service_list/anomalies_badge';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useManageSlosUrl } from '../../../../hooks/use_manage_slos_url';
import { AlertsBadge } from '../../badge/alerts_badge';
import { SloStatusBadge } from '../../slo_status_badge';
import { SERVICE_FLYOUT_EBT_ELEMENTS } from '../ebt_constants';
import { useServiceBadgesData } from '../hooks/use_service_badges_data';
import { useServiceLinks } from '../hooks/use_service_links';

interface ServiceBadgesProps {
  service: ServiceNodeData;
  environment: Environment;
  kuery: string;
  rangeFrom: string;
  rangeTo: string;
}

/**
 * Resolves and renders the status badges (alerts, SLO, anomaly) for the service flyout header.
 *
 * The alerts count and anomaly score are fetched for the flyout's time range and only shown once
 * their request resolves (matching the APM service header and service-map node), while the SLO
 * status is read straight from the node data since SLO summaries are evaluated over the SLO's own
 * window, not the flyout range.
 */
export function ServiceBadges({
  service,
  environment,
  kuery,
  rangeFrom,
  rangeTo,
}: ServiceBadgesProps) {
  const { core } = useApmPluginContext();
  const { capabilities, navigateToUrl } = core.application;
  const canReadSlos = !!capabilities.slo?.read;

  const { alertsHref } = useServiceLinks({
    serviceName: service.id,
    rangeFrom,
    rangeTo,
    environment,
    kuery,
  });

  const slosHref = useManageSlosUrl({ serviceName: service.id, environment });

  const { alertsCount, anomalyScore } = useServiceBadgesData({
    serviceName: service.id,
    environment,
    rangeFrom,
    rangeTo,
  });

  const showAlertsBadge = alertsCount !== undefined;
  const showAnomalyBadge = anomalyScore !== undefined;

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap={false}>
      <EuiFlexItem grow={false}>
        <EuiBadge data-test-subj="serviceFlyoutServiceBadge" color="default" iconType="grid">
          {i18n.translate('xpack.apm.serviceFlyout.serviceBadgeLabel', {
            defaultMessage: 'Service',
          })}
        </EuiBadge>
      </EuiFlexItem>
      {showAlertsBadge && (
        <EuiFlexItem grow={false}>
          <AlertsBadge
            count={alertsCount}
            serviceName={service.id}
            data-test-subj="serviceFlyoutAlertsBadge"
            ebt={{
              action: EBT_CLICK_ACTIONS.VIEW_ALERTS,
              element: SERVICE_FLYOUT_EBT_ELEMENTS.ALERTS_BADGE,
            }}
            onClick={(event) => {
              event.preventDefault();
              navigateToUrl(alertsHref);
            }}
          />
        </EuiFlexItem>
      )}
      {canReadSlos && (
        <EuiFlexItem grow={false}>
          <SloStatusBadge
            sloStatus={service.sloStatus ?? 'noSLOs'}
            sloCount={service.sloCount}
            serviceName={service.id}
            {...(slosHref
              ? {
                  ebt: {
                    action: EBT_CLICK_ACTIONS.VIEW_SLOS,
                    element: SERVICE_FLYOUT_EBT_ELEMENTS.SLO_BADGE,
                  },
                  onClick: (event) => {
                    event.preventDefault();
                    navigateToUrl(slosHref);
                  },
                }
              : {})}
          />
        </EuiFlexItem>
      )}
      {showAnomalyBadge && (
        <EuiFlexItem grow={false} data-test-subj="serviceFlyoutAnomaliesBadge">
          <AnomaliesBadge score={anomalyScore} />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
}
