/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import moment from 'moment';
import { isRight } from 'fp-ts/Either';
import Mustache from 'mustache';
import type { IBasePath } from '@kbn/core/server';
import type {
  ActionGroupIdsOf,
  AlertInstanceContext as AlertContext,
  AlertInstanceState as AlertState,
  IRuleTypeAlerts,
} from '@kbn/alerting-plugin/server';
import { getAlertDetailsUrl } from '@kbn/observability-plugin/common';
import { addSpaceIdToPath } from '@kbn/core-spaces-common';
import { i18n } from '@kbn/i18n';
import { fromKueryExpression, toElasticsearchQuery } from '@kbn/es-query';
import { legacyExperimentalFieldMap } from '@kbn/alerts-as-data-utils';
import type {
  PublicAlertsClient,
  RecoveredAlertData,
} from '@kbn/alerting-plugin/server/alerts_client/types';
import type {
  SyntheticsMonitorStatusRuleParams as StatusRuleParams,
  TimeWindow,
} from '@kbn/response-ops-rule-params/synthetics_monitor_status';
import type { MappingDynamicTemplate } from '@elastic/elasticsearch/lib/api/types';
import { ALERT_GROUPING } from '@kbn/rule-data-utils';
import { syntheticsRuleFieldMap } from '../../common/rules/synthetics_rule_field_map';
import { combineFiltersAndUserSearch, stringifyKueries } from '../../common/lib';
import type { MonitorStatusActionGroup } from '../../common/constants/synthetics_alerts';
import { SYNTHETICS_RULE_TYPES_ALERT_CONTEXT } from '../../common/constants/synthetics_alerts';
import type { IndexPatternTitleAndFields } from '../queries/get_index_pattern';
import { getUptimeIndexPattern } from '../queries/get_index_pattern';
import type { OverviewPing, StatusCheckFilters } from '../../common/runtime_types';
import type { SyntheticsEsClient } from '../lib';
import { getMonitorSummary } from './status_rule/message_utils';
import type {
  AlertOverviewStatus,
  SyntheticsCommonState,
  SyntheticsMonitorStatusAlertState,
} from '../../common/runtime_types/alert_rules/common';
import { SyntheticsCommonStateCodec } from '../../common/runtime_types/alert_rules/common';
import {
  getSyntheticsErrorRouteFromMonitorId,
  getSyntheticsCertificatesRoute,
} from '../../common/utils/get_synthetics_monitor_url';
import { ALERT_DETAILS_URL, RECOVERY_REASON } from './action_variables';
import type { MonitorStatusAlertDocument, MonitorSummaryStatusRule } from './status_rule/types';

export const updateState = (
  state: SyntheticsCommonState,
  isTriggeredNow: boolean,
  meta?: SyntheticsCommonState['meta']
): SyntheticsCommonState => {
  const now = new Date().toISOString();
  const decoded = SyntheticsCommonStateCodec.decode(state);
  if (!isRight(decoded)) {
    const triggerVal = isTriggeredNow ? now : undefined;
    return {
      firstCheckedAt: now,
      firstTriggeredAt: triggerVal,
      isTriggered: isTriggeredNow,
      lastTriggeredAt: triggerVal,
      lastCheckedAt: now,
      lastResolvedAt: undefined,
      // Keep caller meta on the first run; `pendingCount` lives here and must
      // survive so consecutive pending evaluations can cross pendingThreshold.
      meta: meta ?? {},
    };
  }
  const {
    firstCheckedAt,
    firstTriggeredAt,
    lastTriggeredAt,
    // this is the stale trigger status, we're naming it `wasTriggered`
    // to differentiate it from the `isTriggeredNow` param
    isTriggered: wasTriggered,
    lastResolvedAt,
  } = decoded.right;

  return {
    meta,
    firstCheckedAt: firstCheckedAt ?? now,
    firstTriggeredAt: isTriggeredNow && !firstTriggeredAt ? now : firstTriggeredAt,
    lastCheckedAt: now,
    lastTriggeredAt: isTriggeredNow ? now : lastTriggeredAt,
    lastResolvedAt: !isTriggeredNow && wasTriggered ? now : lastResolvedAt,
    isTriggered: isTriggeredNow,
  };
};

export const generateAlertMessage = (messageTemplate: string, fields: Record<string, any>) => {
  return Mustache.render(messageTemplate, { context: { ...fields }, state: { ...fields } });
};

export const getFullViewInAppMessage = (
  basePath: IBasePath,
  spaceId: string,
  relativeViewInAppUrl: string
) => {
  const relativeLinkLabel = i18n.translate(
    'xpack.synthetics.alerts.monitorStatus.relativeLink.label',
    {
      defaultMessage: `- Relative link`,
    }
  );
  const absoluteLinkLabel = i18n.translate(
    'xpack.synthetics.alerts.monitorStatus.absoluteLink.label',
    {
      defaultMessage: `- Link`,
    }
  );
  if (basePath.publicBaseUrl) {
    return `${absoluteLinkLabel}: ${getViewInAppUrl(basePath, spaceId, relativeViewInAppUrl)}`;
  } else {
    return `${relativeLinkLabel}: ${getViewInAppUrl(basePath, spaceId, relativeViewInAppUrl)}`;
  }
};

export const getViewInAppUrl = (
  basePath: IBasePath,
  spaceId: string,
  relativeViewInAppUrl: string
) => addSpaceIdToPath(basePath.publicBaseUrl, spaceId, relativeViewInAppUrl);

export const getRelativeViewInAppUrl = ({
  configId,
  stateId,
  locationId,
}: {
  configId: string;
  stateId: string;
  locationId: string;
}) => {
  return getSyntheticsErrorRouteFromMonitorId({
    configId,
    stateId,
    locationId,
  });
};

export const getRelativeCertificatesViewInAppUrl = ({
  commonName,
  issuer,
}: {
  commonName?: string;
  issuer?: string;
}) => getSyntheticsCertificatesRoute({ commonName, issuer });

/**
 * For ungrouped alerts, the alert ID is just the configId (no location suffix),
 * but config maps are keyed by `${configId}-${locationId}`. This helper tries
 * an exact match first, then falls back to a prefix match.
 */
function findConfigKeyByAlertId<T>(
  configs: Record<string, T>,
  alertId: string
): string | undefined {
  if (configs[alertId]) return alertId;
  return Object.keys(configs).find((key) => key.startsWith(`${alertId}-`));
}

export const setRecoveredAlertsContext = ({
  alertsClient,
  basePath,
  spaceId,
  staleDownConfigs = {},
  stalePendingConfigs = {},
  upConfigs,
  dateFormat,
  tz,
  params,
  groupByLocation,
}: {
  alertsClient: PublicAlertsClient<
    MonitorStatusAlertDocument,
    SyntheticsMonitorStatusAlertState,
    AlertContext,
    ActionGroupIdsOf<MonitorStatusActionGroup>
  >;
  basePath?: IBasePath;
  spaceId?: string;
  params?: StatusRuleParams;
  staleDownConfigs: AlertOverviewStatus['staleDownConfigs'];
  stalePendingConfigs: AlertOverviewStatus['stalePendingConfigs'];
  upConfigs: AlertOverviewStatus['upConfigs'];
  dateFormat: string;
  tz: string;
  groupByLocation: boolean;
}) => {
  const recoveredAlerts = alertsClient.getRecoveredAlerts() ?? [];
  for (const recoveredAlert of recoveredAlerts) {
    const recoveredAlertId = recoveredAlert.alert.getId();
    const alertUuid = recoveredAlert.alert.getUuid();
    const alertHit = recoveredAlert.hit;
    const alertState = recoveredAlert.alert.getState();
    const configId = alertHit?.configId;
    const locationIds = alertHit?.['location.id'] ? [alertHit?.['location.id']].flat() : [];
    const locationName = alertHit?.['observer.geo.name']
      ? [alertHit?.['observer.geo.name']].flat()
      : [];
    let syntheticsStateId = alertHit?.['monitor.state.id'];

    let recoveryReason = i18n.translate(
      'xpack.synthetics.alerts.monitorStatus.defaultRecovery.reason',
      {
        defaultMessage: `the alert condition is no longer met`,
      }
    );
    let recoveryStatus = i18n.translate(
      'xpack.synthetics.alerts.monitorStatus.defaultRecovery.status',
      {
        defaultMessage: `has recovered`,
      }
    );
    let isUp = false;
    let linkMessage = getDefaultLinkMessage({
      basePath,
      spaceId,
      syntheticsStateId,
      configId,
      locationId: locationIds[0],
    });
    let monitorSummary: MonitorSummaryStatusRule | undefined = getDefaultRecoveredSummary({
      recoveredAlert,
      tz,
      dateFormat,
      params,
    });
    let lastErrorMessage = alertHit?.['error.message'];

    if (!groupByLocation && monitorSummary) {
      const formattedLocationNames = locationName.join(` ${AND_LABEL} `);
      const formattedLocationIds = locationIds.join(` ${AND_LABEL} `);
      monitorSummary.locationNames = formattedLocationNames;
      monitorSummary.locationName = formattedLocationNames;
      monitorSummary.locationId = formattedLocationIds;
    }

    const staleDownKey = findConfigKeyByAlertId(staleDownConfigs, recoveredAlertId);
    const stalePendingKey = findConfigKeyByAlertId(stalePendingConfigs, recoveredAlertId);

    if (recoveredAlertId && locationIds && (staleDownKey || stalePendingKey)) {
      const effectiveKey = (staleDownKey || stalePendingKey)!;
      const summary = getDeletedMonitorOrLocationSummary({
        staleConfigs: staleDownKey ? staleDownConfigs : stalePendingConfigs,
        recoveredAlertId: effectiveKey,
        locationIds,
        dateFormat,
        tz,
        params,
      });
      if (summary) {
        monitorSummary = {
          ...monitorSummary,
          ...summary.monitorSummary,
        };
        recoveryStatus = summary.recoveryStatus;
        recoveryReason = summary.recoveryReason;
        lastErrorMessage = summary.lastErrorMessage;
        syntheticsStateId = summary.stateId ? summary.stateId : syntheticsStateId;
      }
      // Cannot display link message for deleted monitors or deleted locations
      linkMessage = '';
    }

    const upConfigKey = findConfigKeyByAlertId(upConfigs, recoveredAlertId);

    if (configId && recoveredAlertId && locationIds && upConfigKey) {
      const summary = getUpMonitorRecoverySummary({
        upConfigs,
        recoveredAlertId: upConfigKey,
        alertHit,
        locationIds,
        configId,
        basePath,
        spaceId,
        dateFormat,
        tz,
        params,
      });
      if (summary) {
        if (groupByLocation) {
          monitorSummary = {
            ...monitorSummary,
            ...summary.monitorSummary,
          };
        }
        recoveryStatus = summary.recoveryStatus;
        recoveryReason = summary.recoveryReason;
        isUp = summary.isUp;
        lastErrorMessage = summary.lastErrorMessage;
        linkMessage = summary.linkMessage ? summary.linkMessage : linkMessage;
        syntheticsStateId = summary.stateId ? summary.stateId : syntheticsStateId;
      }
    }

    const context = {
      ...alertState,
      ...(monitorSummary ? monitorSummary : {}),
      locationId: locationIds.join(` ${AND_LABEL} `),
      idWithLocation: recoveredAlertId,
      lastErrorMessage,
      recoveryStatus,
      linkMessage,
      stateId: syntheticsStateId,
      ...(isUp ? { status: 'up' } : {}),
      ...(recoveryReason
        ? {
            [RECOVERY_REASON]: recoveryReason,
          }
        : {}),
      ...(basePath && spaceId && alertUuid
        ? { [ALERT_DETAILS_URL]: getAlertDetailsUrl(basePath, spaceId, alertUuid) }
        : {}),
      grouping: alertHit?.[ALERT_GROUPING],
    };
    alertsClient.setAlertData({ id: recoveredAlertId, context });
  }
};

export const getDefaultLinkMessage = ({
  basePath,
  spaceId,
  syntheticsStateId,
  configId,
  locationId,
}: {
  basePath?: IBasePath;
  spaceId?: string;
  syntheticsStateId?: string;
  configId?: string;
  locationId?: string;
}) => {
  if (basePath && spaceId && syntheticsStateId && configId && locationId) {
    const relativeViewInAppUrl = getRelativeViewInAppUrl({
      configId,
      locationId,
      stateId: syntheticsStateId,
    });
    return getFullViewInAppMessage(basePath, spaceId, relativeViewInAppUrl);
  } else {
    return '';
  }
};

export const getDefaultRecoveredSummary = ({
  recoveredAlert,
  tz,
  dateFormat,
  params,
}: {
  recoveredAlert: RecoveredAlertData<
    MonitorStatusAlertDocument,
    AlertState,
    AlertContext,
    ActionGroupIdsOf<MonitorStatusActionGroup>
  >;
  tz: string;
  dateFormat: string;
  params?: StatusRuleParams;
}) => {
  if (!recoveredAlert.hit) return; // TODO: handle this case
  const hit = recoveredAlert.hit;
  const locationId = hit['location.id'];
  const configId = hit.configId;
  return getMonitorSummary({
    monitorInfo: {
      monitor: {
        id: hit['monitor.id'],
        name: hit['monitor.name'],
        type: hit['monitor.type'],
      },
      service: {
        name: hit['service.name'],
      },
      labels: hit.labels,
      config_id: configId,
      observer: {
        geo: {
          name: hit['observer.geo.name'] || hit['location.name'],
        },
        name: locationId,
      },
      agent: {
        name: hit['agent.name'] || '',
      },
      '@timestamp': String(hit['@timestamp']),
      ...(hit['error.message'] ? { error: { message: hit['error.message'] } } : {}),
      ...(hit['url.full'] ? { url: { full: hit['url.full'] } } : {}),
    } as unknown as OverviewPing,
    reason: 'recovered',
    locationId,
    configId,
    dateFormat,
    tz,
    params,
  });
};

export const getDeletedMonitorOrLocationSummary = ({
  staleConfigs,
  recoveredAlertId,
  locationIds,
  dateFormat,
  tz,
  params,
}: {
  staleConfigs:
    | AlertOverviewStatus['staleDownConfigs']
    | AlertOverviewStatus['stalePendingConfigs'];
  recoveredAlertId: string;
  locationIds: string[];
  dateFormat: string;
  tz: string;
  params?: StatusRuleParams;
}) => {
  const config = staleConfigs[recoveredAlertId];
  const monitorInfo = 'monitorInfo' in config ? config.monitorInfo : config.latestPing;
  const monitorSummary = getMonitorSummary({
    monitorInfo,
    reason: 'recovered',
    locationId: locationIds,
    configId: config.configId,
    dateFormat,
    tz,
    params,
  });
  const lastErrorMessage = monitorSummary.lastErrorMessage;

  if (config.isDeleted) {
    return {
      lastErrorMessage,
      monitorSummary,
      stateId: monitorInfo?.state?.id,
      recoveryStatus: i18n.translate('xpack.synthetics.alerts.monitorStatus.deleteMonitor.status', {
        defaultMessage: `has been deleted`,
      }),
      recoveryReason: i18n.translate('xpack.synthetics.alerts.monitorStatus.deleteMonitor.status', {
        defaultMessage: `has been deleted`,
      }),
    };
  } else if (config.isLocationRemoved) {
    return {
      monitorSummary,
      lastErrorMessage,
      stateId: monitorInfo?.state?.id,
      recoveryStatus: i18n.translate(
        'xpack.synthetics.alerts.monitorStatus.removedLocation.status',
        {
          defaultMessage: `has recovered`,
        }
      ),
      recoveryReason: i18n.translate(
        'xpack.synthetics.alerts.monitorStatus.removedLocation.reason',
        {
          defaultMessage: `this location has been removed from the monitor`,
        }
      ),
    };
  }
};

export const getUpMonitorRecoverySummary = ({
  upConfigs,
  recoveredAlertId,
  alertHit,
  locationIds,
  configId,
  basePath,
  spaceId,
  dateFormat,
  tz,
  params,
}: {
  upConfigs: AlertOverviewStatus['upConfigs'];
  recoveredAlertId: string;
  alertHit: any;
  locationIds: string[];
  configId: string;
  basePath?: IBasePath;
  spaceId?: string;
  dateFormat: string;
  tz: string;
  params?: StatusRuleParams;
}) => {
  // pull the last error from state, since it is not available on the up ping
  const lastErrorMessage = alertHit?.['error.message'];
  let linkMessage = '';

  const upConfig = upConfigs[recoveredAlertId];
  const isUp = Boolean(upConfig) || false;
  const ping = upConfig.latestPing;

  const monitorSummary = getMonitorSummary({
    monitorInfo: ping,
    reason: 'recovered',
    locationId: locationIds,
    configId,
    dateFormat,
    tz,
    params,
  });

  // When alert is flapping, the stateId is not available on ping.state.ends.id, use state instead
  const stateId = ping.state?.ends?.id;
  const upTimestamp = ping['@timestamp'];
  const checkedAt = moment(upTimestamp).tz(tz).format(dateFormat);
  const recoveryStatus = i18n.translate('xpack.synthetics.alerts.monitorStatus.upCheck.status', {
    defaultMessage: `is now up`,
  });
  const recoveryReason = i18n.translate(
    'xpack.synthetics.alerts.monitorStatus.upCheck.reasonWithoutDuration',
    {
      defaultMessage: `the monitor is now up again. It ran successfully at {checkedAt}`,
      values: {
        checkedAt,
      },
    }
  );

  if (basePath && spaceId && stateId) {
    const relativeViewInAppUrl = getRelativeViewInAppUrl({
      configId,
      locationId: locationIds[0],
      stateId,
    });
    linkMessage = getFullViewInAppMessage(basePath, spaceId, relativeViewInAppUrl);
  }

  return {
    monitorSummary,
    lastErrorMessage,
    recoveryStatus,
    recoveryReason,
    isUp,
    linkMessage,
    stateId,
  };
};

export const formatFilterString = async (
  syntheticsEsClient: SyntheticsEsClient,
  filters?: StatusCheckFilters,
  search?: string
) =>
  await generateFilterDSL(
    () =>
      getUptimeIndexPattern({
        syntheticsEsClient,
      }),
    filters,
    search
  );

export const hasFilters = (filters?: StatusCheckFilters) => {
  if (!filters) return false;
  for (const list of Object.values(filters)) {
    if (list.length > 0) {
      return true;
    }
  }
  return false;
};

export const generateFilterDSL = async (
  getIndexPattern: () => Promise<IndexPatternTitleAndFields | undefined>,
  filters?: StatusCheckFilters,
  search?: string
) => {
  const filtersExist = hasFilters(filters);
  if (!filtersExist && !search) return undefined;

  let filterString = '';
  if (filtersExist) {
    filterString = stringifyKueries(new Map(Object.entries(filters ?? {})));
  }

  const combinedString = combineFiltersAndUserSearch(filterString, search);

  return toElasticsearchQuery(fromKueryExpression(combinedString ?? ''), await getIndexPattern());
};

export const syntheticsRuleTypeFieldMap = {
  ...syntheticsRuleFieldMap,
  ...legacyExperimentalFieldMap,
};

const stringAsKeywords: MappingDynamicTemplate = {
  path_match: `${ALERT_GROUPING}.*`,
  match_mapping_type: 'string',
  mapping: { type: 'keyword', ignore_above: 1024 },
};
const dynamicTemplates = [
  {
    strings_as_keywords: stringAsKeywords,
  },
];

export const SyntheticsRuleTypeAlertDefinition: IRuleTypeAlerts<MonitorStatusAlertDocument> = {
  context: SYNTHETICS_RULE_TYPES_ALERT_CONTEXT,
  mappings: { fieldMap: syntheticsRuleTypeFieldMap, dynamicTemplates },
  useLegacyAlerts: true,
  shouldWrite: true,
};

export function getTimeUnitLabel(timeWindow: TimeWindow) {
  const { size: timeValue = 1, unit: timeUnit } = timeWindow;
  switch (timeUnit) {
    case 's':
      return i18n.translate('xpack.synthetics.timeUnits.secondLabel', {
        defaultMessage: '{timeValue, plural, one {second} other {seconds}}',
        values: { timeValue },
      });
    case 'm':
      return i18n.translate('xpack.synthetics.timeUnits.minuteLabel', {
        defaultMessage: '{timeValue, plural, one {minute} other {minutes}}',
        values: { timeValue },
      });
    case 'h':
      return i18n.translate('xpack.synthetics.timeUnits.hourLabel', {
        defaultMessage: '{timeValue, plural, one {hour} other {hours}}',
        values: { timeValue },
      });
    case 'd':
      return i18n.translate('xpack.synthetics.timeUnits.dayLabel', {
        defaultMessage: '{timeValue, plural, one {day} other {days}}',
        values: { timeValue },
      });
  }
}

export const AND_LABEL = i18n.translate('xpack.synthetics.alerts.monitorStatus.andLabel', {
  defaultMessage: 'and',
});
