/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { SavedObjectsUpdateResponse, SavedObjectsClientContract } from '@kbn/core/server';
import { isSavedObjectErrorResult } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import type { MaintenanceWindow } from '@kbn/maintenance-windows-plugin/common';
import { syntheticsMonitorSavedObjectType } from '../../../common/types/saved_objects';
import { getSavedObjectKqlFilter } from '../../routes/common';
import { InvalidLocationError } from './normalizers/common_fields';
import { InvalidMaintenanceWindowError } from '../maintenance_windows/resolve_maintenance_windows';
import type { SyntheticsServerSetup } from '../../types';
import type { RouteContext } from '../../routes/types';
import { getAllLocations } from '../get_all_locations';
import { syncNewMonitorBulk } from '../../routes/monitor_cruds/bulk_cruds/add_monitor_bulk';
import type { SyntheticsMonitorClient } from '../synthetics_monitor/synthetics_monitor_client';
import type { MonitorConfigUpdate } from '../../routes/monitor_cruds/bulk_cruds/edit_monitor_bulk';
import { syncEditedMonitorBulk } from '../../routes/monitor_cruds/bulk_cruds/edit_monitor_bulk';
import type {
  EncryptedSyntheticsMonitorAttributes,
  ServiceLocationErrors,
  ProjectMonitor,
  Locations,
  SyntheticsMonitor,
  MonitorFields,
} from '../../../common/runtime_types';
import { ConfigKey, type SyntheticsPrivateLocations } from '../../../common/runtime_types';
import { formatSecrets, normalizeSecrets } from '../utils/secrets';
import type { ValidationResult } from '../../routes/monitor_cruds/monitor_validation';
import {
  validateProjectMonitor,
  validateMonitor,
  INVALID_CONFIGURATION_ERROR,
} from '../../routes/monitor_cruds/monitor_validation';
import { normalizeProjectMonitor } from './normalizers';

type FailedError = Array<{ id?: string; reason: string; details: string; payload?: object }>;

export interface ExistingMonitor {
  [ConfigKey.JOURNEY_ID]: string;
  [ConfigKey.CONFIG_ID]: string;
  [ConfigKey.REVISION]: number;
  [ConfigKey.MONITOR_TYPE]: string;
}

export interface PreviousMonitorForUpdate extends ExistingMonitor {
  updated_at?: string;
}

export const CANNOT_UPDATE_MONITOR_TO_DIFFERENT_TYPE = i18n.translate(
  'xpack.synthetics.service.projectMonitors.cannotUpdateMonitorToDifferentType',
  {
    defaultMessage: 'Cannot update monitor to different type.',
  }
);

export const FAILED_TO_UPDATE_MONITOR = i18n.translate(
  'xpack.synthetics.service.projectMonitors.failedToUpdateMonitor',
  {
    defaultMessage: 'Failed to create or update monitor',
  }
);

export class ProjectMonitorFormatter {
  private projectId: string;
  private spaceId: string;
  private publicLocations: Locations;
  private privateLocations: SyntheticsPrivateLocations;
  private maintenanceWindows: MaintenanceWindow[];
  private savedObjectsClient: SavedObjectsClientContract;
  private monitors: ProjectMonitor[] = [];
  public createdMonitors: string[] = [];
  public updatedMonitors: string[] = [];
  public failedMonitors: FailedError = [];
  private server: SyntheticsServerSetup;
  private projectFilter: string;
  private syntheticsMonitorClient: SyntheticsMonitorClient;
  private routeContext: RouteContext;

  constructor({
    projectId,
    spaceId,
    monitors,
    routeContext,
  }: {
    routeContext: RouteContext;
    projectId: string;
    spaceId: string;
    monitors: ProjectMonitor[];
  }) {
    this.routeContext = routeContext;
    this.projectId = projectId;
    this.spaceId = spaceId;
    this.savedObjectsClient = routeContext.savedObjectsClient;
    this.syntheticsMonitorClient = routeContext.syntheticsMonitorClient;
    this.monitors = monitors;
    this.server = routeContext.server;
    this.projectFilter = `${syntheticsMonitorSavedObjectType}.attributes.${ConfigKey.PROJECT_ID}: "${this.projectId}"`;
    this.publicLocations = [];
    this.privateLocations = [];
    this.maintenanceWindows = [];
  }

  init = async () => {
    const locationsPromise = getAllLocations({
      server: this.server,
      syntheticsMonitorClient: this.syntheticsMonitorClient,
      savedObjectsClient: this.savedObjectsClient,
      excludeAgentPolicies: true,
    });
    const existingMonitorsPromise = this.getProjectMonitorsForProject();
    // Only fetch maintenance windows when a monitor actually references one, so
    // pushes that don't use them avoid the extra alerting lookup.
    const needsMaintenanceWindows = this.monitors.some(
      (monitor) => (monitor.maintenanceWindows?.length ?? 0) > 0
    );
    const maintenanceWindowsPromise = needsMaintenanceWindows
      ? this.syntheticsMonitorClient.syntheticsService.getMaintenanceWindows(this.spaceId)
      : Promise.resolve([]);

    const [locations, existingMonitors, maintenanceWindows] = await Promise.all([
      locationsPromise,
      existingMonitorsPromise,
      maintenanceWindowsPromise,
    ]);

    const { publicLocations, privateLocations } = locations;

    this.publicLocations = publicLocations;
    this.privateLocations = privateLocations;
    this.maintenanceWindows = maintenanceWindows ?? [];

    return existingMonitors;
  };

  public configureAllProjectMonitors = async () => {
    const existingMonitors = await this.init();

    const normalizedNewMonitors: SyntheticsMonitor[] = [];
    const normalizedUpdateMonitors: Array<{
      previousMonitor: PreviousMonitorForUpdate;
      monitor: SyntheticsMonitor;
    }> = [];

    for (const monitor of this.monitors) {
      const previousMonitor = existingMonitors.find(
        (monitorObj) => monitorObj[ConfigKey.JOURNEY_ID] === monitor.id
      );

      const normM = this.validateProjectMonitor({
        monitor,
        publicLocations: this.publicLocations,
        privateLocations: this.privateLocations,
        isNewMonitor: !previousMonitor,
      });
      if (normM) {
        if (
          previousMonitor &&
          previousMonitor[ConfigKey.MONITOR_TYPE] !== normM[ConfigKey.MONITOR_TYPE]
        ) {
          this.failedMonitors.push({
            reason: CANNOT_UPDATE_MONITOR_TO_DIFFERENT_TYPE,
            details: i18n.translate(
              'xpack.synthetics.service.projectMonitors.cannotUpdateMonitorToDifferentTypeDetails',
              {
                defaultMessage:
                  'Monitor {monitorId} of type {previousType} cannot be updated to type {currentType}. Please delete the monitor first and try again.',
                values: {
                  currentType: monitor.type,
                  previousType: previousMonitor[ConfigKey.MONITOR_TYPE],
                  monitorId: monitor.id,
                },
              }
            ),
            payload: monitor,
          });
        } else if (previousMonitor) {
          this.updatedMonitors.push(monitor.id);
          normalizedUpdateMonitors.push({ monitor: normM as MonitorFields, previousMonitor });
        } else {
          normalizedNewMonitors.push(normM as MonitorFields);
        }
      }
    }

    await Promise.allSettled([
      this.createMonitorsBulk(normalizedNewMonitors),
      this.updateMonitorsBulk(normalizedUpdateMonitors),
    ]);
  };

  validateProjectMonitor = ({
    monitor,
    publicLocations,
    privateLocations,
    isNewMonitor,
  }: {
    monitor: ProjectMonitor;
    publicLocations: Locations;
    privateLocations: SyntheticsPrivateLocations;
    isNewMonitor: boolean;
  }) => {
    try {
      const { normalizedFields: normalizedMonitor, errors } = normalizeProjectMonitor({
        monitor,
        locations: this.publicLocations,
        privateLocations: this.privateLocations,
        projectId: this.projectId,
        namespace: this.spaceId,
        version: this.server.stackVersion,
        maintenanceWindows: this.maintenanceWindows,
      });

      if (errors.length) {
        this.failedMonitors.push(...errors);
        return null;
      }

      // Only gate brand-new API Journey monitors on Serverless; re-pushing an
      // already-existing project monitor (e.g. one grandfathered in before
      // this restriction) must not fail just because it's unchanged.
      const isServerless = Boolean(this.server.cloud?.isServerlessEnabled) && isNewMonitor;

      /* Validates that the payload sent from the synthetics agent is valid */
      const { valid: isMonitorPayloadValid } = this.validateMonitor({
        validationResult: validateProjectMonitor(
          {
            ...monitor,
            type: normalizedMonitor[ConfigKey.MONITOR_TYPE],
          },
          publicLocations,
          privateLocations,
          isServerless
        ),
        monitorId: monitor.id,
      });

      if (!isMonitorPayloadValid) {
        return null;
      }

      /* Validates that the normalized monitor is a valid monitor saved object type */
      const { valid: isNormalizedMonitorValid, decodedMonitor } = this.validateMonitor({
        validationResult: validateMonitor(
          normalizedMonitor as MonitorFields,
          this.spaceId,
          isServerless
        ),
        monitorId: monitor.id,
      });

      if (!isNormalizedMonitorValid || !decodedMonitor) {
        return null;
      }

      return decodedMonitor;
    } catch (e) {
      const isUserInputError =
        e instanceof InvalidLocationError || e instanceof InvalidMaintenanceWindowError;

      // User input errors (e.g. invalid locations or maintenance windows) are surfaced in
      // the API response via `failedMonitors`; don't log them as a server error (see #221378).
      if (!isUserInputError) {
        this.server.logger.error(e);
      }

      const reason = isUserInputError ? INVALID_CONFIGURATION_ERROR : FAILED_TO_UPDATE_MONITOR;

      this.failedMonitors.push({
        reason,
        id: monitor.id,
        details: e.message,
        payload: monitor,
      });
    }
  };

  public getProjectMonitorsForProject = async (): Promise<PreviousMonitorForUpdate[]> => {
    const journeyIds = this.monitors.map((monitor) => monitor.id);
    const journeyFilter = getSavedObjectKqlFilter({
      field: ConfigKey.JOURNEY_ID,
      values: journeyIds,
    });

    const result = await this.routeContext.monitorConfigRepository.find<ExistingMonitor>({
      filter: `${this.projectFilter} AND ${journeyFilter}`,
      fields: [
        ConfigKey.JOURNEY_ID,
        ConfigKey.CONFIG_ID,
        ConfigKey.REVISION,
        ConfigKey.MONITOR_TYPE,
      ],
    });

    return result.saved_objects.map<PreviousMonitorForUpdate>((monitor) => {
      return {
        ...monitor.attributes,
        updated_at: monitor.updated_at,
      };
    });
  };

  private createMonitorsBulk = async (monitors: SyntheticsMonitor[]) => {
    try {
      if (monitors.length > 0) {
        const { newMonitors, failedMonitors } = await syncNewMonitorBulk({
          normalizedMonitors: monitors,
          routeContext: this.routeContext,
          privateLocations: this.privateLocations,
          spaceId: this.spaceId,
        });

        if (newMonitors.length > 0) {
          newMonitors.forEach((monitor) => {
            if (isSavedObjectErrorResult(monitor)) {
              this.failedMonitors.push({
                reason: i18n.translate(
                  'xpack.synthetics.service.projectMonitors.failedToCreateMonitors',
                  {
                    defaultMessage: 'Failed to create monitor',
                  }
                ),
                details: monitor.error.message,
                payload: monitor,
              });
              return;
            }
            const journeyId = monitor.attributes[ConfigKey.JOURNEY_ID];
            if (journeyId) {
              this.createdMonitors.push(journeyId);
            }
          });
        }

        failedMonitors.forEach(({ monitor, error }) => {
          const journeyId = monitor.attributes[ConfigKey.JOURNEY_ID];

          this.failedMonitors.push({
            reason: error?.message ?? FAILED_TO_UPDATE_MONITOR,
            details: i18n.translate(
              'xpack.synthetics.service.projectMonitors.failedToCreateMonitors',
              {
                defaultMessage: 'Failed to create monitor: {journeyId}',
                values: {
                  journeyId,
                },
              }
            ),
            payload: monitors,
          });
        });
      }
    } catch (e) {
      this.server.logger.error(e);
      this.failedMonitors.push({
        reason: i18n.translate('xpack.synthetics.service.projectMonitors.failedToCreateXMonitors', {
          defaultMessage: 'Failed to create {length} monitors',
          values: {
            length: monitors.length,
          },
        }),
        details: e.message,
        payload: monitors,
      });
    }
  };

  private getDecryptedMonitors = async (monitors: PreviousMonitorForUpdate[]) => {
    const configIds = monitors.map((monitor) => monitor[ConfigKey.CONFIG_ID]);
    const monitorFilter = getSavedObjectKqlFilter({
      field: ConfigKey.CONFIG_ID,
      values: configIds,
    });

    return await this.routeContext.monitorConfigRepository.findDecryptedMonitors({
      filter: monitorFilter,
      spaceId: this.spaceId,
    });
  };

  private updateMonitorsBulk = async (
    monitors: Array<{
      monitor: SyntheticsMonitor;
      previousMonitor: PreviousMonitorForUpdate;
    }>
  ): Promise<
    | {
        editedMonitors: Array<SavedObjectsUpdateResponse<EncryptedSyntheticsMonitorAttributes>>;
        errors: ServiceLocationErrors;
        updatedCount: number;
      }
    | undefined
  > => {
    try {
      if (monitors.length === 0) {
        return {
          editedMonitors: [],
          errors: [],
          updatedCount: 0,
        };
      }
      const decryptedPreviousMonitors = await this.getDecryptedMonitors(
        monitors.map((m) => m.previousMonitor)
      );

      const monitorsToUpdate: MonitorConfigUpdate[] = [];

      decryptedPreviousMonitors.forEach((decryptedPreviousMonitor) => {
        const monitor = monitors.find(
          (m) => m.previousMonitor[ConfigKey.CONFIG_ID] === decryptedPreviousMonitor.id
        );
        if (monitor) {
          const normalizedMonitor = monitor?.monitor;
          const {
            attributes: { [ConfigKey.REVISION]: _, ...normalizedPrevMonitorAttr },
          } = normalizeSecrets(decryptedPreviousMonitor);

          const monitorWithRevision = formatSecrets({
            ...normalizedPrevMonitorAttr,
            ...normalizedMonitor,
            revision: (decryptedPreviousMonitor.attributes[ConfigKey.REVISION] || 0) + 1,
          });
          monitorsToUpdate.push({
            normalizedMonitor,
            monitorWithRevision,
            decryptedPreviousMonitor,
          });
        }
      });

      const { editedMonitors, failedConfigs } = await syncEditedMonitorBulk({
        monitorsToUpdate,
        routeContext: this.routeContext,
        privateLocations: this.privateLocations,
        spaceId: this.spaceId,
      });

      if (failedConfigs && Object.keys(failedConfigs).length > 0) {
        const failedConfigsIds = Object.keys(failedConfigs);
        failedConfigsIds.forEach((id) => {
          const { config, error } = failedConfigs[id];

          const journeyId = config[ConfigKey.JOURNEY_ID];
          this.failedMonitors.push({
            reason: error?.message ?? FAILED_TO_UPDATE_MONITOR,
            details: i18n.translate(
              'xpack.synthetics.service.projectMonitors.failedToUpdateJourney',
              {
                defaultMessage: 'Failed to update journey: {journeyId}',
                values: {
                  journeyId,
                },
              }
            ),
            payload: config,
          });
        });

        // remove failed monitors from the list of updated monitors
        this.updatedMonitors.splice(
          this.updatedMonitors.findIndex((monitorId) => failedConfigsIds.includes(monitorId)),
          failedConfigsIds.length
        );
      }

      const successfulMonitors = (editedMonitors ?? []).reduce<
        Array<SavedObjectsUpdateResponse<EncryptedSyntheticsMonitorAttributes>>
      >((acc, monitor) => {
        if (isSavedObjectErrorResult(monitor)) {
          this.failedMonitors.push({
            reason: FAILED_TO_UPDATE_MONITOR,
            details: monitor.error.message,
            payload: monitor,
          });
        } else {
          acc.push(monitor);
        }
        return acc;
      }, []);

      return {
        errors: [],
        editedMonitors: successfulMonitors,
        updatedCount: successfulMonitors.length,
      };
    } catch (e) {
      this.server.logger.error(e);
      this.failedMonitors.push({
        reason: i18n.translate('xpack.synthetics.service.projectMonitors.failedToUpdateXMonitors', {
          defaultMessage: 'Failed to update {length} monitors',
          values: {
            length: monitors.length,
          },
        }),
        details: e.message,
        payload: monitors,
      });
    }
  };

  private validateMonitor = ({
    validationResult,
    monitorId,
  }: {
    validationResult: ValidationResult;
    monitorId: string;
  }) => {
    const { reason: message, details, payload: validationPayload, valid } = validationResult;
    if (!valid) {
      this.failedMonitors.push({
        id: monitorId,
        reason: message,
        details,
        payload: validationPayload,
      });
    }
    return validationResult;
  };
}
