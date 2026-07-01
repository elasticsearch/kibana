/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ALERT_END, ALERT_START } from '@kbn/rule-data-utils';
import { getPaddedAlertTimeRange } from '@kbn/observability-get-padded-alert-time-range-util';
import {
  SERVICE_ENVIRONMENT,
  SERVICE_NAME,
  TRANSACTION_NAME,
  TRANSACTION_TYPE,
} from '../../../../../common/es_fields/apm';
import { ApmEmbeddableContext } from '../../../../embeddable/embeddable_context';
import { ServiceMapEmbeddable } from '../../../../embeddable/service_map/service_map_embeddable';
import { getServiceMapUrl } from '../../../../embeddable/service_map/get_service_map_url';
import { SERVICE_FLYOUT_SOURCES } from '../../../shared/service_flyout/constants';
import { useApmEmbeddableDeps } from '../../context/apm_embeddable_deps_context';
import type { AlertDetailsAppSectionProps } from '../alert_details_app_section/types';
import { getServiceMapTimeRange } from './get_service_map_time_range';
import { buildKueryFromAlert, buildFiltersFromAlert } from './build_alert_filters';

const SERVICE_MAP_PANEL_TITLE = i18n.translate('xpack.apm.alertDetails.serviceMapPanel.title', {
  defaultMessage: 'Service map preview',
});

const EXPLORE_IN_SERVICE_MAP_LABEL = i18n.translate(
  'xpack.apm.alertDetails.serviceMapPanel.exploreInServiceMap',
  { defaultMessage: 'Explore in Service map' }
);

const EMBEDDABLE_HEIGHT = 400;

export function AlertDetailsServiceMapSection({ alert }: AlertDetailsAppSectionProps) {
  const embeddableDeps = useApmEmbeddableDeps();

  const serviceName =
    alert.fields[SERVICE_NAME] != null ? String(alert.fields[SERVICE_NAME]) : undefined;
  const environmentField = alert.fields[SERVICE_ENVIRONMENT];
  const environment =
    environmentField != null && String(environmentField).trim() !== ''
      ? String(environmentField)
      : undefined;

  const alertStart = alert.fields[ALERT_START];
  const alertEnd = alert.fields[ALERT_END];

  const timeRanges = useMemo(() => {
    if (!alertStart) return null;
    return getServiceMapTimeRange(
      String(alertStart),
      alertEnd != null ? String(alertEnd) : undefined
    );
  }, [alertStart, alertEnd]);

  const kuery = useMemo(() => buildKueryFromAlert(alert), [alert]);
  const filters = useMemo(() => buildFiltersFromAlert(alert), [alert]);

  const filterPills = useMemo(() => {
    const pills: Array<{ field: string; value: string }> = [];
    const transactionType = alert.fields[TRANSACTION_TYPE];
    const transactionName = alert.fields[TRANSACTION_NAME];
    if (transactionType != null) {
      pills.push({ field: 'transaction.type', value: String(transactionType) });
    }
    if (transactionName != null) {
      pills.push({ field: 'transaction.name', value: String(transactionName) });
    }
    return pills;
  }, [alert]);

  const flyoutOptions = useMemo(() => {
    const transactionTypeField = alert.fields[TRANSACTION_TYPE];

    const rawTransactionType = Array.isArray(transactionTypeField)
      ? transactionTypeField[0]
      : transactionTypeField;

    const paddedRange = alertStart
      ? getPaddedAlertTimeRange(String(alertStart), alertEnd != null ? String(alertEnd) : undefined)
      : undefined;

    return {
      kuery: '',
      initialTransactionType: rawTransactionType != null ? String(rawTransactionType) : undefined,
      rangeFrom: paddedRange?.from,
      rangeTo: paddedRange?.to,
      source: SERVICE_FLYOUT_SOURCES.alertDetails,
    };
  }, [alert, alertStart, alertEnd]);

  const [hasNoServices, setHasNoServices] = useState(false);

  if (!embeddableDeps || !serviceName || !timeRanges || hasNoServices) {
    return null;
  }

  const { from: rangeFrom, to: rangeTo } = timeRanges.graph;
  const { from: badgesRangeFrom, to: badgesRangeTo } = timeRanges.badges;

  const fullMapUrl = getServiceMapUrl(embeddableDeps.coreStart, {
    rangeFrom,
    rangeTo,
    environment,
    serviceName,
    filterPills,
  });

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="apmAlertDetailsServiceMapSection">
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
            <EuiFlexItem>
              <EuiTitle size="xs">
                <h3>{SERVICE_MAP_PANEL_TITLE}</h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                color="primary"
                href={fullMapUrl}
                data-test-subj="apmAlertDetailsExploreInServiceMap"
              >
                {EXPLORE_IN_SERVICE_MAP_LABEL}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        {filters.length > 0 && (
          <EuiFlexItem>
            <EuiFlexGroup
              gutterSize="xs"
              wrap
              alignItems="center"
              data-test-subj="apmAlertDetailsServiceMapFilters"
            >
              {filters.map((f) => (
                <EuiFlexItem grow={false} key={f.field}>
                  <EuiBadge color="hollow">{f.label}</EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiFlexItem>
        )}

        <EuiFlexItem>
          <EuiPanel
            hasBorder
            paddingSize="none"
            css={{ overflow: 'hidden', height: EMBEDDABLE_HEIGHT }}
            data-test-subj="apmAlertDetailsServiceMapEmbeddableContainer"
          >
            <ApmEmbeddableContext
              deps={embeddableDeps}
              rangeFrom={rangeFrom}
              rangeTo={rangeTo}
              kuery={kuery}
              environment={environment}
            >
              <ServiceMapEmbeddable
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                badgesRangeFrom={badgesRangeFrom}
                badgesRangeTo={badgesRangeTo}
                environment={environment}
                kuery={kuery}
                badgesKuery=""
                showFocusMapInPopover
                clearKueryOnPopoverNavigation
                alwaysNavigateOnPopoverFocus
                strictEnvironmentScope
                serviceName={serviceName}
                core={embeddableDeps.coreStart}
                onEmptyStateChange={setHasNoServices}
                filterPills={filterPills}
                flyoutOptions={flyoutOptions}
              />
            </ApmEmbeddableContext>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}

// eslint-disable-next-line import/no-default-export
export default AlertDetailsServiceMapSection;
