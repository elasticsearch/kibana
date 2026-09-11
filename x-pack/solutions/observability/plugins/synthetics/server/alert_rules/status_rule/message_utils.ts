/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import { i18n } from '@kbn/i18n';
import { ALERT_GROUPING, ALERT_REASON } from '@kbn/rule-data-utils';
import type { SyntheticsMonitorStatusRuleParams as StatusRuleParams } from '@kbn/response-ops-rule-params/synthetics_monitor_status';
import type {
  AlertPendingStatusMetaData,
  AlertStatusMetaData,
  MissingPingMonitorInfo,
} from '../../../common/runtime_types/alert_rules/common';
import { getConditionType } from '../../../common/rules/status_rule';
import { AND_LABEL, getTimeUnitLabel } from '../common';
import { ALERT_REASON_MSG } from '../action_variables';
import type { MonitorSummaryStatusRule } from './types';
import {
  MONITOR_ID,
  MONITOR_TYPE,
  MONITOR_NAME,
  OBSERVER_GEO_NAME,
  OBSERVER_NAME,
  URL_FULL,
  ERROR_MESSAGE,
  AGENT_NAME,
  STATE_ID,
  SERVICE_NAME,
  ERROR_STACK_TRACE,
} from '../../../common/field_names';
import type { OverviewPing } from '../../../common/runtime_types';
import { UNNAMED_LOCATION } from '../../../common/constants';

export const getMonitorAlertDocument = (
  monitorSummary: MonitorSummaryStatusRule,
  locationNames: string[],
  locationIds: string[],
  useLatestChecks: boolean,
  threshold: number,
  grouping?: Record<string, unknown>,
  evaluationValue?: number
) => ({
  [MONITOR_ID]: monitorSummary.monitorId,
  [MONITOR_TYPE]: monitorSummary.monitorType,
  [MONITOR_NAME]: monitorSummary.monitorName,
  [SERVICE_NAME]: monitorSummary.serviceName,
  [URL_FULL]: monitorSummary.monitorUrl,
  [OBSERVER_GEO_NAME]: locationNames,
  [OBSERVER_NAME]: locationIds,
  [ERROR_MESSAGE]: monitorSummary.lastErrorMessage,
  // done to avoid assigning null to the field
  [ERROR_STACK_TRACE]: monitorSummary.lastErrorStack ? monitorSummary.lastErrorStack : undefined,
  [AGENT_NAME]: monitorSummary.hostName,
  [ALERT_REASON]: monitorSummary.reason,
  [STATE_ID]: monitorSummary.stateId,
  'location.id': locationIds,
  'location.name': locationNames,
  labels: monitorSummary.labels,
  configId: monitorSummary.configId,
  'kibana.alert.evaluation.threshold': threshold,
  'kibana.alert.evaluation.value':
    evaluationValue ??
    (useLatestChecks ? monitorSummary.checks?.downWithinXChecks : monitorSummary.checks?.down) ??
    1,
  'monitor.tags': monitorSummary.monitorTags ?? [],
  'monitor.failed_step_info': monitorSummary.failedStepInfo,
  ...(grouping ? { [ALERT_GROUPING]: grouping } : {}),
});

type Reason = 'pending' | 'down' | 'recovered';

const DOWN_LABEL = i18n.translate('xpack.synthetics.alerts.monitorStatus.downLabel', {
  defaultMessage: `down`,
});

const PENDING_LABEL = i18n.translate('xpack.synthetics.alerts.monitorStatus.pendingLabel', {
  defaultMessage: `pending`,
});

const RECOVERED_LABEL = i18n.translate('xpack.synthetics.monitorStatus.recoveredLabel', {
  defaultMessage: 'recovered',
});

const statusMap: Record<Reason, string> = {
  down: DOWN_LABEL,
  pending: PENDING_LABEL,
  recovered: RECOVERED_LABEL,
};

export interface MonitorSummaryData {
  monitorInfo: OverviewPing | MissingPingMonitorInfo;
  reason: Reason;
  locationId: string[];
  configId: string;
  dateFormat: string;
  tz: string;
  checks?: {
    downWithinXChecks: number;
    down: number;
  };
  params?: StatusRuleParams;
  failedStepInfo?: string;
}

export const getMonitorSummary = ({
  monitorInfo,
  locationId,
  configId,
  tz,
  dateFormat,
  reason,
  checks,
  params,
  failedStepInfo = '',
}: MonitorSummaryData): MonitorSummaryStatusRule => {
  const { downThreshold, pendingThreshold } = getConditionType(params?.condition);
  const monitorName = monitorInfo?.monitor?.name ?? monitorInfo?.monitor?.id;
  const locationName = monitorInfo?.observer?.geo?.name ?? UNNAMED_LOCATION;
  const formattedLocationName = Array.isArray(locationName)
    ? locationName.join(` ${AND_LABEL} `)
    : locationName;

  // When the monitor is pending there is no timestamp for the last ping
  const { timestamp, checkedAt } =
    monitorInfo && '@timestamp' in monitorInfo
      ? {
          timestamp: monitorInfo['@timestamp'],
          checkedAt: moment(monitorInfo['@timestamp'])
            .tz(tz || 'UTC')
            .format(dateFormat),
        }
      : { timestamp: undefined, checkedAt: undefined };

  const typeToLabelMap: Record<string, string> = {
    http: 'HTTP',
    tcp: 'TCP',
    icmp: 'ICMP',
    browser: i18n.translate('xpack.synthetics.alertRules.monitorStatus.browser.label', {
      defaultMessage: 'browser',
    }),
  };
  const typeToUrlLabelMap: Record<string, string> = {
    http: 'URL',
    tcp: HOST_LABEL,
    icmp: HOST_LABEL,
    browser: 'URL',
  };
  const monitorType = monitorInfo.monitor?.type;
  const stateId = monitorInfo.state?.id;

  return {
    checkedAt,
    locationId: locationId?.join?.(` ${AND_LABEL} `) ?? '',
    configId,
    monitorUrl: monitorInfo.url?.full || UNAVAILABLE_LABEL,
    monitorUrlLabel: typeToUrlLabelMap[monitorType] || 'URL',
    monitorId: monitorInfo.monitor?.id,
    monitorName,
    monitorType: typeToLabelMap[monitorInfo.monitor?.type] || monitorInfo.monitor?.type,
    lastErrorMessage: monitorInfo.error?.message,
    // done to avoid assigning null to the field
    lastErrorStack: monitorInfo.error?.stack_trace ? monitorInfo.error?.stack_trace : undefined,
    serviceName: monitorInfo.service?.name,
    labels: monitorInfo.labels,
    locationName: formattedLocationName,
    locationNames: formattedLocationName,
    hostName: monitorInfo.agent?.name!,
    status: statusMap[reason],
    stateId,
    [ALERT_REASON_MSG]: getReasonMessage({
      name: monitorName,
      location: formattedLocationName,
      reason,
      checks,
      params,
    }),
    checks,
    downThreshold,
    pendingThreshold,
    timestamp,
    monitorTags: monitorInfo.tags,
    failedStepInfo,
  };
};

export const getUngroupedReasonMessage = ({
  statusConfigs,
  monitorName,
  params,
  reason,
}: {
  statusConfigs: Array<AlertStatusMetaData | AlertPendingStatusMetaData>;
  monitorName: string;
  params: StatusRuleParams;
  reason: Reason;
  checks?: {
    downWithinXChecks: number;
    down: number;
  };
}) => {
  const { useLatestChecks, numberOfChecks, timeWindow, downThreshold, locationsThreshold } =
    getConditionType(params.condition);
  const status = statusMap[reason];
  const locationDetails = statusConfigs
    .map((c) => {
      let downCount = 1;
      if ('checks' in c) {
        downCount = useLatestChecks ? c.checks?.downWithinXChecks : c.checks?.down;
      } else if ('pendingCount' in c) {
        downCount = c.pendingCount ?? 1;
      }
      return i18n.translate(
        'xpack.synthetics.alertRules.monitorStatus.reasonMessage.locationDetails',
        {
          defaultMessage:
            '{downCount} {downCount, plural, one {time} other {times}} from {locName}',
          values: {
            locName:
              c.latestPing?.observer.geo?.name ||
              ('monitorInfo' in c && c.monitorInfo.observer.geo.name) ||
              c.locationId,
            downCount,
          },
        }
      );
    })
    .join(` ${AND_LABEL} `);
  if (reason === 'pending') {
    return i18n.translate(
      'xpack.synthetics.alertRules.monitorStatus.reasonMessage.location.ungrouped.multiple.pending',
      {
        defaultMessage: `Monitor "{name}" is {status} {locationDetails}.`,
        values: {
          name: monitorName,
          status,
          locationDetails,
        },
      }
    );
  }
  return i18n.translate(
    'xpack.synthetics.alertRules.monitorStatus.reasonMessage.location.ungrouped.multiple',
    {
      defaultMessage: `Monitor "{name}" is {status} {locationDetails}. Alert when down {threshold} {threshold, plural, one {time} other {times}} {condition} from at least {locationsThreshold} {locationsThreshold, plural, one {location} other {locations}}.`,
      values: {
        name: monitorName,
        status,
        threshold: downThreshold,
        locationsThreshold,
        condition: useLatestChecks
          ? i18n.translate(
              'xpack.synthetics.alertRules.monitorStatus.reasonMessage.condition.latestChecks',
              {
                defaultMessage: 'out of the last {numberOfChecks} checks',
                values: { numberOfChecks },
              }
            )
          : i18n.translate(
              'xpack.synthetics.alertRules.monitorStatus.reasonMessage.condition.timeWindow',
              {
                defaultMessage: 'within the last {time} {unit}',
                values: {
                  time: timeWindow.size,
                  unit: getTimeUnitLabel(timeWindow),
                },
              }
            ),
        locationDetails,
      },
    }
  );
};

export const getReasonMessage = ({
  name,
  reason,
  location,
  checks,
  params,
}: {
  name: string;
  location: string;
  reason: Reason;
  checks?: {
    downWithinXChecks: number;
    down: number;
  };
  params?: StatusRuleParams;
}) => {
  const status = statusMap[reason];
  if (reason === 'pending') {
    return i18n.translate('xpack.synthetics.alertRules.monitorStatus.reasonMessage.pending', {
      defaultMessage: `Monitor "{name}" from {location} is {status}.`,
      values: {
        name,
        status,
        location,
      },
    });
  }
  const { useTimeWindow, numberOfChecks, locationsThreshold, downThreshold } = getConditionType(
    params?.condition
  );
  if (useTimeWindow) {
    return getReasonMessageForTimeWindow({
      name,
      location,
      reason,
      params,
    });
  }
  return i18n.translate('xpack.synthetics.alertRules.monitorStatus.reasonMessage.new', {
    defaultMessage: `Monitor "{name}" from {location} is {status}. {checksSummary}Alert when {downThreshold} out of the last {numberOfChecks} checks are down from at least {locationsThreshold} {locationsThreshold, plural, one {location} other {locations}}.`,
    values: {
      name,
      status,
      location,
      downThreshold,
      locationsThreshold,
      numberOfChecks,
      checksSummary: checks
        ? i18n.translate('xpack.synthetics.alertRules.monitorStatus.reasonMessage.checksSummary', {
            defaultMessage:
              'Monitor is down {downChecks} {downChecks, plural, one {time} other {times}} within the last {numberOfChecks} checks. ',
            values: {
              downChecks: checks.downWithinXChecks,
              numberOfChecks,
            },
          })
        : '',
    },
  });
};

export const getReasonMessageForTimeWindow = ({
  name,
  location,
  reason,
  params,
}: {
  name: string;
  location: string;
  reason: Reason;
  params?: StatusRuleParams;
}) => {
  const status = statusMap[reason];
  const { timeWindow, locationsThreshold, downThreshold } = getConditionType(params?.condition);
  return i18n.translate('xpack.synthetics.alertRules.monitorStatus.reasonMessage.timeBased', {
    defaultMessage: `Monitor "{name}" from {location} is {status}. Alert when {downThreshold} checks are down within the last {size} {unitLabel} from at least {locationsThreshold} {locationsThreshold, plural, one {location} other {locations}}.`,
    values: {
      name,
      status,
      location,
      downThreshold,
      unitLabel: getTimeUnitLabel(timeWindow),
      locationsThreshold,
      size: timeWindow.size,
    },
  });
};

export const UNAVAILABLE_LABEL = i18n.translate(
  'xpack.synthetics.alertRules.monitorStatus.unavailableUrlLabel',
  {
    defaultMessage: `(unavailable)`,
  }
);

export const HOST_LABEL = i18n.translate('xpack.synthetics.alertRules.monitorStatus.host.label', {
  defaultMessage: 'Host',
});

const MAX_SCRIPT_LENGTH = 200;

/**
 * Formats step information for display in alert messages
 */
export const formatStepInformation = (
  stepInfo: {
    stepName?: string;
    scriptSource?: string;
    stepNumber?: number;
  } | null
): string => {
  if (!stepInfo) {
    return '';
  }

  const parts: string[] = [];

  // Format: "Step: 1. Step name"
  if (stepInfo.stepNumber !== undefined && stepInfo.stepName) {
    parts.push(
      i18n.translate('xpack.synthetics.alertRules.monitorStatus.stepInfo.step', {
        defaultMessage: '\n- Step: {stepNumber}. {stepName}  ',
        values: {
          stepNumber: stepInfo.stepNumber,
          stepName: stepInfo.stepName,
        },
      })
    );
  } else if (stepInfo.stepName) {
    parts.push(
      i18n.translate('xpack.synthetics.alertRules.monitorStatus.stepInfo.stepNameOnly', {
        defaultMessage: '\n- Step: {stepName}  ',
        values: {
          stepName: stepInfo.stepName,
        },
      })
    );
  } else if (stepInfo.stepNumber !== undefined) {
    parts.push(
      i18n.translate('xpack.synthetics.alertRules.monitorStatus.stepInfo.stepNumberOnly', {
        defaultMessage: '\n- Step: {stepNumber}  ',
        values: {
          stepNumber: stepInfo.stepNumber,
        },
      })
    );
  }

  if (stepInfo.scriptSource) {
    // Limit script source to first 200 characters to avoid too long messages
    const truncatedScript = stepInfo.scriptSource.substring(0, MAX_SCRIPT_LENGTH);
    const script =
      stepInfo.scriptSource.length > MAX_SCRIPT_LENGTH ? `${truncatedScript}...` : truncatedScript;
    parts.push(
      i18n.translate('xpack.synthetics.alertRules.monitorStatus.stepInfo.stepScript', {
        defaultMessage: '\n- Step script: {script}  ',
        values: {
          script,
        },
      })
    );
  }

  return parts.join('');
};
