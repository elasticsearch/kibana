/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import moment from 'moment';
import type {
  SavedObjectsClientContract,
  SavedObjectsFindResult,
} from '@kbn/core-saved-objects-api-server';
import type { Logger } from '@kbn/core/server';
import { intersection, isEmpty } from 'lodash';
import { getAlertDetailsUrl } from '@kbn/observability-plugin/common';
import type { SyntheticsMonitorStatusRuleParams as StatusRuleParams } from '@kbn/response-ops-rule-params/synthetics_monitor_status';
import { type StatusRuleCondition } from '@kbn/response-ops-rule-params/synthetics_monitor_status';
import { syntheticsMonitorAttributes } from '../../../common/types/saved_objects';
import { MonitorConfigRepository } from '../../services/monitor_config_repository';
import type {
  AlertOverviewStatus,
  AlertPendingStatusConfigs,
  AlertPendingStatusMetaData,
  AlertStatusConfigs,
  AlertStatusMetaData,
  StaleAlertMetadata,
  StatusRuleInspect,
} from '../../../common/runtime_types/alert_rules/common';
import { queryFilterMonitors } from './queries/filter_monitors';
import type { MonitorSummaryStatusRule, StatusRuleExecutorOptions } from './types';
import {
  AND_LABEL,
  getFullViewInAppMessage,
  getRelativeViewInAppUrl,
  getViewInAppUrl,
} from '../common';
import {
  getMonitorAlertDocument,
  getMonitorSummary,
  getUngroupedReasonMessage,
  formatStepInformation,
} from './message_utils';
import { applyPendingCounts, filterPendingConfigsByThreshold } from './queries/helpers';
import { queryMonitorStatusAlert } from './queries/query_monitor_status_alert';
import { getStepInformation, type StepInformation } from './queries/get_step_information';
import { parseArrayFilters, parseLocationFilter } from '../../routes/common';
import type { SyntheticsServerSetup } from '../../types';
import type { SyntheticsEsClient } from '../../lib';
import { processMonitors } from '../../saved_objects/synthetics_monitor/process_monitors';
import { getConditionType } from '../../../common/rules/status_rule';
import type { EncryptedSyntheticsMonitorAttributes } from '../../../common/runtime_types';
import { ConfigKey } from '../../../common/runtime_types';
import type { SyntheticsMonitorClient } from '../../synthetics_service/synthetics_monitor/synthetics_monitor_client';
import { AlertConfigKey } from '../../../common/constants/monitor_management';
import { ALERT_DETAILS_URL, VIEW_IN_APP_URL } from '../action_variables';
import { MONITOR_STATUS } from '../../../common/constants/synthetics_alerts';

const DEFAULT_RECOVERY_STRATEGY: NonNullable<StatusRuleCondition['recoveryStrategy']> =
  'conditionNotMet';

export class StatusRuleExecutor {
  previousStartedAt: Date | null;
  params: StatusRuleParams;
  esClient: SyntheticsEsClient;
  soClient: SavedObjectsClientContract;
  server: SyntheticsServerSetup;
  syntheticsMonitorClient: SyntheticsMonitorClient;
  monitors: Array<SavedObjectsFindResult<EncryptedSyntheticsMonitorAttributes>> = [];
  hasCustomCondition: boolean;
  monitorLocationsMap: Record<string, string[]>; // monitorId: locationIds
  dateFormat?: string;
  tz?: string;
  options: StatusRuleExecutorOptions;
  logger: Logger;
  ruleName: string;
  monitorConfigRepository: MonitorConfigRepository;

  constructor(
    esClient: SyntheticsEsClient,
    server: SyntheticsServerSetup,
    syntheticsMonitorClient: SyntheticsMonitorClient,
    options: StatusRuleExecutorOptions
  ) {
    const { services, params, previousStartedAt, rule } = options;
    const { savedObjectsClient } = services;
    this.ruleName = rule.name;
    this.logger = server.logger;
    this.previousStartedAt = previousStartedAt;
    this.params = params;
    this.soClient = savedObjectsClient;
    this.esClient = esClient;
    this.monitorConfigRepository = new MonitorConfigRepository(
      savedObjectsClient,
      server.encryptedSavedObjects.getClient()
    );
    this.server = server;
    this.syntheticsMonitorClient = syntheticsMonitorClient;
    this.hasCustomCondition = !isEmpty(this.params);
    this.monitorLocationsMap = {};
    this.options = options;
  }

  debug(message: string) {
    this.logger.debug(`[Status Rule Executor][${this.ruleName}] ${message}`);
  }

  async getStepInformationForBrowserMonitor(
    checkGroup: string,
    monitorType: string
  ): Promise<StepInformation | null> {
    if (monitorType !== 'browser') {
      return null;
    }

    try {
      return await getStepInformation(this.esClient, checkGroup, monitorType);
    } catch (error) {
      this.debug(`Failed to fetch step information for check group ${checkGroup}: ${error}`);
      return null;
    }
  }

  async init() {
    const { uiSettingsClient } = this.options.services;
    this.dateFormat = await uiSettingsClient.get('dateFormat');
    const timezone = await uiSettingsClient.get('dateFormat:tz');
    this.tz = timezone === 'Browser' ? 'UTC' : timezone;
    return await this.getMonitors();
  }

  async getMonitors() {
    const baseFilter = !this.hasCustomCondition
      ? `${syntheticsMonitorAttributes}.${AlertConfigKey.STATUS_ENABLED}: true`
      : '';

    const configIds = await queryFilterMonitors({
      spaceId: this.options.spaceId,
      esClient: this.esClient,
      ruleParams: this.params,
    });

    if (this.params.kqlQuery && isEmpty(configIds)) {
      this.debug(`No monitor found with the given KQL query ${this.params.kqlQuery}`);
      return processMonitors([]);
    }

    const locationIds = await parseLocationFilter(
      {
        savedObjectsClient: this.soClient,
        server: this.server,
        syntheticsMonitorClient: this.syntheticsMonitorClient,
      },
      this.params.locations
    );

    const { filtersStr } = parseArrayFilters({
      configIds,
      filter: baseFilter,
      tags: this.params.tags,
      locations: locationIds,
      monitorTypes: this.params.monitorTypes,
      monitorQueryIds: this.params.monitorIds,
      projects: this.params.projects,
    });

    this.monitors = await this.monitorConfigRepository.getAll({
      filter: filtersStr,
    });

    this.debug(
      `Found ${this.monitors.length} monitors for params ${JSON.stringify(
        this.params
      )} | parsed location filter is ${JSON.stringify(locationIds)} `
    );
    return processMonitors(this.monitors);
  }

  async getConfigs({
    prevDownConfigs = {},
    prevPendingConfigs = {},
  }: {
    prevDownConfigs?: AlertStatusConfigs;
    prevPendingConfigs?: AlertPendingStatusConfigs;
  }): Promise<AlertOverviewStatus> {
    const { enabledMonitorQueryIds, maxPeriod, monitorLocationIds, monitorsData } =
      await this.init();

    const range = this.getRange(maxPeriod);

    const { numberOfChecks } = getConditionType(this.params.condition);

    if (enabledMonitorQueryIds.length === 0) {
      const staleDownConfigs = this.markDeletedConfigs(prevDownConfigs);
      const stalePendingConfigs = this.markDeletedConfigs(prevPendingConfigs);
      return {
        downConfigs: { ...prevDownConfigs },
        upConfigs: {},
        staleDownConfigs,
        enabledMonitorQueryIds,
        pendingConfigs: { ...prevPendingConfigs },
        stalePendingConfigs,
        maxPeriod,
      };
    }

    const queryLocations = this.params?.locations;

    // Account for locations filter
    const listOfLocationAfterFilter =
      queryLocations && queryLocations.length
        ? intersection(monitorLocationIds, queryLocations)
        : monitorLocationIds;

    const currentStatus = await queryMonitorStatusAlert({
      esClient: this.esClient,
      monitorLocationIds: listOfLocationAfterFilter,
      range,
      monitorQueryIds: enabledMonitorQueryIds,
      numberOfChecks,
      includeRetests: this.params.condition?.includeRetests,
      monitorsData,
      monitors: this.monitors,
      logger: this.logger,
    });

    const { downConfigs, upConfigs, configStats } = currentStatus;
    const pendingConfigs = applyPendingCounts(currentStatus.pendingConfigs, prevPendingConfigs);

    this.debug(
      `Found ${Object.keys(downConfigs).length} down configs, ${
        Object.keys(upConfigs).length
      } up configs and ${Object.keys(pendingConfigs).length} pending configs`
    );

    Object.entries(configStats).forEach(([configId, configStat]) => {
      const name = this.monitors.find((m) => m.id === configId)?.attributes.name ?? configId;
      this.debug(
        `Monitor: ${name} with id ${configId} has ${configStat.down} down check, ${configStat.up} up check and ${configStat.pending} pending check`
      );
    });

    const downConfigsToMarkAsStale = Object.keys(prevDownConfigs).reduce((acc, locId) => {
      if (!pendingConfigs[locId] && !upConfigs[locId] && !downConfigs[locId]) {
        acc[locId] = prevDownConfigs[locId];
      }
      return acc;
    }, {} as Record<string, AlertStatusMetaData>);

    const pendingConfigsToMarkAsStale = Object.keys(prevPendingConfigs).reduce((acc, locId) => {
      if (!pendingConfigs[locId] && !upConfigs[locId] && !downConfigs[locId]) {
        acc[locId] = prevPendingConfigs[locId];
      }
      return acc;
    }, {} as Record<string, AlertPendingStatusMetaData>);

    const staleDownConfigs = this.markDeletedConfigs(downConfigsToMarkAsStale);
    const stalePendingConfigs = this.markDeletedConfigs(pendingConfigsToMarkAsStale);

    return {
      ...currentStatus,
      pendingConfigs,
      staleDownConfigs,
      stalePendingConfigs,
      maxPeriod,
    };
  }

  getRange = (maxPeriod: number) => {
    const { numberOfChecks, useLatestChecks, timeWindow } = getConditionType(this.params.condition);

    if (useLatestChecks) {
      const from = moment()
        .subtract(maxPeriod * numberOfChecks, 'milliseconds')
        .subtract(5, 'minutes')
        .toISOString();
      this.debug(
        `Using range from ${from} to now, diff of ${moment().diff(from, 'minutes')} minutes`
      );
      return { from, to: 'now' };
    }

    // `timeWindow` is guaranteed to be defined here.
    const { unit, size } = timeWindow;
    const from = moment().subtract(size, unit).toISOString();
    this.debug(
      `Using range from ${from} to now, diff of ${moment().diff(from, 'minutes')} minutes`
    );
    return { from, to: 'now' };
  };

  markDeletedConfigs<T extends AlertStatusMetaData | AlertPendingStatusMetaData>(
    configs: Record<string, T>
  ): Record<string, T & StaleAlertMetadata> {
    const monitors = this.monitors;
    const staleConfigs: Record<string, T & StaleAlertMetadata> = {};

    Object.keys(configs).forEach((locPlusId) => {
      const config = configs[locPlusId];
      const monitor = monitors.find((m) => {
        return (
          m.id === config.configId ||
          m.attributes[ConfigKey.MONITOR_QUERY_ID] === config.monitorQueryId
        );
      });
      if (!monitor) {
        staleConfigs[locPlusId] = { ...config, isDeleted: true };
        delete configs[locPlusId];
      } else {
        const { locations } = monitor.attributes;
        const isLocationRemoved = !locations.some((l) => l.id === config.locationId);
        if (isLocationRemoved) {
          staleConfigs[locPlusId] = { ...config, isLocationRemoved: true };
          delete configs[locPlusId];
        }
      }
    });

    return staleConfigs;
  }

  async schedulePendingAlertPerConfigIdPerLocation({
    pendingConfigs,
  }: {
    pendingConfigs: AlertPendingStatusConfigs;
  }) {
    for (const [idWithLocation, statusConfig] of Object.entries(pendingConfigs)) {
      const alertId = idWithLocation;
      const monitorSummary = this.getMonitorPendingSummary({
        statusConfig,
      });

      await this.scheduleAlert({
        idWithLocation,
        alertId,
        monitorSummary,
        statusConfig,
        locationNames: [monitorSummary.locationName],
        locationIds: [statusConfig.locationId],
      });
    }
  }

  async schedulePendingAlertPerConfigId({
    pendingConfigs,
  }: {
    pendingConfigs: AlertPendingStatusConfigs;
  }) {
    const pendingConfigsById = getConfigsByIds(pendingConfigs);

    for (const [configId, configs] of pendingConfigsById) {
      const alertId = configId;
      const monitorSummary = this.getUngroupedPendingSummary({
        statusConfigs: configs,
      });
      await this.scheduleAlert({
        idWithLocation: configId,
        alertId,
        monitorSummary,
        statusConfig: configs[0],
        locationNames: configs.map(
          ({ locationId, latestPing }) => latestPing?.observer.geo.name || locationId
        ),
        locationIds: configs.map(({ locationId }) => locationId),
      });
    }
  }

  handlePendingMonitorAlert = async ({
    pendingConfigs,
  }: {
    pendingConfigs: AlertPendingStatusConfigs;
  }) => {
    if (!this.params.condition?.alertOnNoData) {
      return;
    }

    const { pendingThreshold } = getConditionType(this.params.condition);
    const configsMeetingThreshold = filterPendingConfigsByThreshold(
      pendingConfigs,
      pendingThreshold
    );

    if (isEmpty(configsMeetingThreshold)) {
      return;
    }

    if (this.params.condition?.groupBy && this.params.condition.groupBy !== 'locationId') {
      await this.schedulePendingAlertPerConfigId({
        pendingConfigs: configsMeetingThreshold,
      });
    } else {
      await this.schedulePendingAlertPerConfigIdPerLocation({
        pendingConfigs: configsMeetingThreshold,
      });
    }
  };

  handleDownMonitorThresholdAlert = async ({
    downConfigs,
  }: {
    downConfigs: AlertStatusConfigs;
  }) => {
    const { useTimeWindow, useLatestChecks, downThreshold, locationsThreshold } = getConditionType(
      this.params?.condition
    );
    const recoveryStrategy = this.params?.condition?.recoveryStrategy ?? DEFAULT_RECOVERY_STRATEGY;
    const groupBy = this.params?.condition?.groupBy ?? 'locationId';

    const validDownConfigs: AlertStatusConfigs = {};

    for (const [downConfigId, config] of Object.entries(downConfigs)) {
      if (!config.latestPing?.monitor) {
        this.debug(
          `Skipping down config ${downConfigId}: latestPing is missing or corrupted (configId: ${config.configId})`
        );
        continue;
      }

      validDownConfigs[downConfigId] = config;
    }
    if (groupBy === 'locationId' && locationsThreshold === 1) {
      for (const [idWithLocation, statusConfig] of Object.entries(validDownConfigs)) {
        // Skip scheduling if recoveryStrategy is 'firstUp' and latest ping is up
        if (recoveryStrategy === 'firstUp' && (statusConfig.latestPing.summary?.up ?? 0) > 0) {
          continue;
        }

        const doesMonitorMeetLocationThreshold = getDoesMonitorMeetLocationThreshold({
          matchesByLocation: [statusConfig],
          locationsThreshold,
          downThreshold,
          useTimeWindow: useTimeWindow || false,
        });
        if (doesMonitorMeetLocationThreshold) {
          const alertId = idWithLocation;
          const monitorSummary = this.getMonitorDownSummary({
            statusConfig,
          });

          await this.scheduleAlert({
            idWithLocation,
            alertId,
            monitorSummary,
            statusConfig,
            downThreshold,
            useLatestChecks,
            locationNames: [statusConfig.latestPing.observer.geo?.name!],
            locationIds: [statusConfig.latestPing.observer.name!],
          });
        }
      }
    } else {
      const downConfigsById = getConfigsByIds(validDownConfigs);

      for (const [configId, locationConfigs] of downConfigsById) {
        // If recoveryStrategy is 'firstUp', we only consider configs that are not up
        const configs =
          recoveryStrategy === 'firstUp'
            ? locationConfigs.filter((c) => (c.latestPing.summary?.up ?? 0) === 0)
            : locationConfigs;

        if (!configs.length) {
          continue;
        }

        const doesMonitorMeetLocationThreshold = getDoesMonitorMeetLocationThreshold({
          matchesByLocation: configs,
          locationsThreshold,
          downThreshold,
          useTimeWindow: useTimeWindow || false,
        });

        if (doesMonitorMeetLocationThreshold) {
          const alertId = configId;
          const monitorSummary = this.getUngroupedDownSummary({
            statusConfigs: configs,
          });
          await this.scheduleAlert({
            idWithLocation: configId,
            alertId,
            monitorSummary,
            downConfigs: configs.reduce(
              (acc, conf) => ({ ...acc, [`${conf.configId}-${conf.locationId}`]: conf }),
              {}
            ),
            configId,
            downThreshold,
            useLatestChecks,
            locationNames: configs.map((c) => c.latestPing.observer.geo?.name!),
            locationIds: configs.map((c) => c.latestPing.observer.name!),
          });
        }
      }
    }
  };

  getMonitorDownSummary({ statusConfig }: { statusConfig: AlertStatusMetaData }) {
    const { latestPing: ping, configId, locationId, checks } = statusConfig;

    return getMonitorSummary({
      monitorInfo: ping,
      reason: 'down',
      locationId: [locationId],
      configId,
      dateFormat: this.dateFormat ?? 'Y-MM-DD HH:mm:ss',
      tz: this.tz ?? 'UTC',
      checks,
      params: this.params,
    });
  }

  getMonitorPendingSummary({ statusConfig }: { statusConfig: AlertPendingStatusMetaData }) {
    const { monitorInfo } = statusConfig;

    return getMonitorSummary({
      monitorInfo,
      reason: 'pending',
      locationId: [statusConfig.locationId],
      configId: statusConfig.configId,
      dateFormat: this.dateFormat ?? 'Y-MM-DD HH:mm:ss',
      tz: this.tz ?? 'UTC',
      params: this.params,
    });
  }

  getUngroupedDownSummary({ statusConfigs }: { statusConfigs: AlertStatusMetaData[] }) {
    const sampleConfig = statusConfigs[0];
    const { latestPing: ping, configId, checks } = sampleConfig;

    const baseSummary = getMonitorSummary({
      monitorInfo: ping,
      reason: 'down',
      locationId: statusConfigs.map((c) => c.latestPing.observer.name!),
      configId,
      dateFormat: this.dateFormat!,
      tz: this.tz!,
      checks,
      params: this.params,
    });
    baseSummary.reason = getUngroupedReasonMessage({
      statusConfigs,
      monitorName: baseSummary.monitorName,
      params: this.params,
      reason: 'down',
    });
    if (statusConfigs.length > 1) {
      baseSummary.locationNames = statusConfigs
        .map((c) => c.latestPing.observer.geo?.name!)
        .join(` ${AND_LABEL} `);
    }

    return baseSummary;
  }

  getUngroupedPendingSummary({ statusConfigs }: { statusConfigs: AlertPendingStatusMetaData[] }) {
    const sampleConfig = statusConfigs[0];
    const { configId, monitorInfo } = sampleConfig;

    const baseSummary = getMonitorSummary({
      monitorInfo,
      reason: 'pending',
      locationId: statusConfigs.map(({ locationId }) => locationId),
      configId,
      dateFormat: this.dateFormat!,
      tz: this.tz!,
      params: this.params,
    });
    baseSummary.reason = getUngroupedReasonMessage({
      statusConfigs,
      monitorName: baseSummary.monitorName,
      params: this.params,
      reason: 'pending',
    });

    return baseSummary;
  }

  async scheduleAlert(
    params: {
      idWithLocation: string;
      alertId: string;
      monitorSummary: MonitorSummaryStatusRule;
      useLatestChecks?: boolean;
      locationNames: string[];
      locationIds: string[];
    } & (
      | { statusConfig: AlertPendingStatusMetaData }
      | { statusConfig: AlertStatusMetaData; downThreshold: number }
      | { downConfigs: AlertStatusConfigs; downThreshold: number; configId: string }
    )
  ) {
    const {
      idWithLocation,
      alertId,
      monitorSummary,
      useLatestChecks = false,
      locationNames,
      locationIds,
    } = params;
    const { configId } = 'statusConfig' in params ? params.statusConfig : params;
    const locationId = 'statusConfig' in params ? params.statusConfig.locationId : undefined;

    const { spaceId, startedAt } = this.options;
    const { alertsClient } = this.options.services;
    const { basePath } = this.server;
    if (!alertsClient) return;

    const { uuid: alertUuid, start } = alertsClient.report({
      id: alertId,
      actionGroup: MONITOR_STATUS.id,
    });
    const errorStartedAt = start ?? startedAt.toISOString() ?? monitorSummary.timestamp;

    let relativeViewInAppUrl = '';
    if (monitorSummary.stateId) {
      // For ungrouped monitors with downConfigs, use the first location ID
      const effectiveLocationId = locationId || locationIds[0];
      if (effectiveLocationId) {
        relativeViewInAppUrl = getRelativeViewInAppUrl({
          configId,
          locationId: effectiveLocationId,
          stateId: monitorSummary.stateId,
        });
      }
    }

    const grouping: Record<string, unknown> = {
      monitor: { id: monitorSummary.monitorId, config_id: monitorSummary.configId },
    };
    if (locationIds.length === 1) {
      grouping.location = { id: locationIds[0] };
    }
    if (monitorSummary.serviceName) {
      grouping.service = { name: monitorSummary.serviceName };
    }

    const context = {
      ...monitorSummary,
      idWithLocation,
      errorStartedAt,
      linkMessage: monitorSummary.stateId
        ? getFullViewInAppMessage(basePath, spaceId, relativeViewInAppUrl)
        : '',
      [VIEW_IN_APP_URL]: getViewInAppUrl(basePath, spaceId, relativeViewInAppUrl),
      [ALERT_DETAILS_URL]: getAlertDetailsUrl(basePath, spaceId, alertUuid),
      grouping,
    };

    const { pendingThreshold } = getConditionType(this.params.condition);

    // downThreshold and checks are only available for down alerts
    if ('downThreshold' in params) {
      context.downThreshold = params.downThreshold;
    } else {
      context.pendingThreshold = pendingThreshold;
    }

    if ('statusConfig' in params && 'checks' in params.statusConfig) {
      context.checks = params.statusConfig.checks;
    } else if ('downConfigs' in params) {
      // For ungrouped alerts with downConfigs, get checks from the first config
      const configsArray = Object.values(params.downConfigs);
      if (configsArray.length > 0 && 'checks' in configsArray[0]) {
        context.checks = configsArray[0].checks;
      }
    }

    // Fetch step information for browser monitors synchronously before creating alert
    let failedStepInfo = '';
    let failedStepName: string | undefined;
    let failedStepNumber: number | undefined;
    // Get monitor type directly from saved object attributes
    const monitor = this.monitors.find((m) => m.id === configId);
    const monitorType = monitor?.attributes.type;

    if (monitorType === 'browser') {
      let allConfigs: Array<AlertStatusMetaData | AlertPendingStatusMetaData> = [];
      if ('statusConfig' in params) {
        allConfigs = [params.statusConfig];
      } else if ('downConfigs' in params) {
        allConfigs = getConfigsByIds(params.downConfigs).get(params.configId) || [];
      }

      const stepInfoPromises = allConfigs.map(async (config) => {
        if ('latestPing' in config && config.latestPing) {
          const checkGroup = config.latestPing.monitor?.check_group;
          if (checkGroup) {
            try {
              return await this.getStepInformationForBrowserMonitor(checkGroup, 'browser');
            } catch (error) {
              this.debug(`Failed to fetch step information for alert ${alertId}: ${error}`);
            }
          }
        }
        return null;
      });
      const stepInfoResults = await Promise.all(stepInfoPromises);
      const validStepInfos = stepInfoResults.filter(
        (info): info is StepInformation => info !== null
      );

      // Format step information for the alert body
      const formattedStepInfos = validStepInfos.map((info) => formatStepInformation(info));
      failedStepInfo = formattedStepInfos.filter((info) => info).join('\n');

      // Extract first step name and number for the email subject
      if (validStepInfos.length > 0) {
        const firstStep = validStepInfos[0];
        failedStepName = firstStep.stepName;
        failedStepNumber = firstStep.stepNumber;
      }
    }

    // Update monitor summary with step info
    const updatedMonitorSummary = {
      ...monitorSummary,
      failedStepInfo,
      failedStepName,
      failedStepNumber,
    };

    const evaluationThreshold = 'downThreshold' in params ? params.downThreshold : pendingThreshold;
    let evaluationValue: number | undefined;
    if (!('downThreshold' in params)) {
      evaluationValue = params.statusConfig.pendingCount ?? 1;
    }

    const alertDocument = getMonitorAlertDocument(
      updatedMonitorSummary,
      locationNames,
      locationIds,
      useLatestChecks,
      evaluationThreshold,
      grouping,
      evaluationValue
    );

    // Update context with step info if available
    const updatedContext = {
      ...context,
      ...(failedStepInfo ? { failedStepInfo } : {}),
      ...(failedStepName ? { failedStepName } : {}),
      ...(failedStepNumber !== undefined ? { failedStepNumber } : {}),
    };

    alertsClient.setAlertData({
      id: alertId,
      payload: alertDocument,
      context: updatedContext,
    });
  }

  getRuleThresholdOverview = async (): Promise<StatusRuleInspect> => {
    const data = await this.getConfigs({});
    return {
      ...data,
      monitors: this.monitors.map((monitor) => ({
        id: monitor.id,
        name: monitor.attributes.name,
        type: monitor.attributes.type,
      })),
    };
  };
}

export const getDoesMonitorMeetLocationThreshold = ({
  matchesByLocation,
  locationsThreshold,
  downThreshold,
  useTimeWindow,
}: {
  matchesByLocation: AlertStatusMetaData[];
  locationsThreshold: number;
  downThreshold: number;
  useTimeWindow: boolean;
}) => {
  // for location based we need to make sure, monitor is down for the threshold for all locations
  const getMatchingLocationsWithDownThresholdWithXChecks = (matches: AlertStatusMetaData[]) => {
    return matches.filter((config) => (config.checks?.downWithinXChecks ?? 1) >= downThreshold);
  };
  const getMatchingLocationsWithDownThresholdWithinTimeWindow = (
    matches: AlertStatusMetaData[]
  ) => {
    return matches.filter((config) => (config.checks?.down ?? 1) >= downThreshold);
  };
  if (useTimeWindow) {
    const matchingLocationsWithDownThreshold =
      getMatchingLocationsWithDownThresholdWithinTimeWindow(matchesByLocation);
    return matchingLocationsWithDownThreshold.length >= locationsThreshold;
  } else {
    const matchingLocationsWithDownThreshold =
      getMatchingLocationsWithDownThresholdWithXChecks(matchesByLocation);
    return matchingLocationsWithDownThreshold.length >= locationsThreshold;
  }
};

export function getConfigsByIds(configs: AlertStatusConfigs): Map<string, AlertStatusMetaData[]>;
export function getConfigsByIds(
  configs: AlertPendingStatusConfigs
): Map<string, AlertPendingStatusMetaData[]>;
export function getConfigsByIds(
  configs: AlertStatusConfigs | AlertPendingStatusConfigs
): Map<string, Array<AlertStatusMetaData | AlertPendingStatusMetaData>> {
  const configsById = new Map<string, Array<AlertStatusMetaData | AlertPendingStatusMetaData>>();
  Object.entries(configs).forEach(([_, config]) => {
    const { configId } = config;
    if (!configsById.has(configId)) {
      configsById.set(configId, []);
    }
    configsById.get(configId)?.push(config);
  });
  return configsById;
}
