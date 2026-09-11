/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import * as t from 'io-ts';
import { i18n } from '@kbn/i18n';
import { isLeft } from 'fp-ts/Either';
import { formatErrors } from '@kbn/securitysolution-io-ts-utils';

import { omit, isEmpty } from 'lodash';
import { schema } from '@kbn/config-schema';
import { AlertConfigSchema } from '../../../common/runtime_types/monitor_management/alert_config_schema';
import type { CreateMonitorPayLoad } from './add_monitor/add_monitor_api';
import { flattenAndFormatObject } from '../../synthetics_service/project_monitor/normalizers/common_fields';
import type {
  Locations,
  MonitorFields,
  ProjectMonitor,
  SyntheticsMonitor,
} from '../../../common/runtime_types';
import {
  BrowserFieldsCodec,
  CodeEditorMode,
  ConfigKey,
  FormMonitorType,
  HTTPFieldsCodec,
  ICMPFieldsCodec,
  MonitorTypeCodec,
  MonitorTypeEnum,
  ProjectMonitorCodec,
  ScheduleUnit,
  type SyntheticsPrivateLocations,
  TCPFieldsCodec,
} from '../../../common/runtime_types';

import {
  ALLOWED_SCHEDULES_IN_MINUTES,
  ALLOWED_SCHEDULES_IN_SECONDS,
  DEFAULT_FIELDS,
  HEARTBEAT_BROWSER_MONITOR_TIMEOUT_OVERHEAD_SECONDS,
} from '../../../common/constants/monitor_defaults';
import { privateLocationCoversAllMonitorSpaces } from './monitor_locations_utils';

type MonitorCodecType =
  | typeof ICMPFieldsCodec
  | typeof TCPFieldsCodec
  | typeof HTTPFieldsCodec
  | typeof BrowserFieldsCodec;

const monitorTypeToCodecMap: Record<MonitorTypeEnum, MonitorCodecType> = {
  [MonitorTypeEnum.ICMP]: ICMPFieldsCodec,
  [MonitorTypeEnum.TCP]: TCPFieldsCodec,
  [MonitorTypeEnum.HTTP]: HTTPFieldsCodec,
  [MonitorTypeEnum.BROWSER]: BrowserFieldsCodec,
};

export interface ValidationResult {
  valid: boolean;
  reason: string;
  details: string;
  payload: object;
  decodedMonitor?: SyntheticsMonitor;
}

export class MonitorValidationError extends Error {
  result: ValidationResult;
  constructor(result: ValidationResult) {
    super(result.reason);
    this.result = result;
  }
}

/**
 * Validates monitor fields with respect to the relevant Codec identified by object's 'type' property.
 * @param monitorFields {MonitorFields} The mixed type representing the possible monitor payload from UI.
 * @param spaceId
 */
export function validateMonitor(monitorFields: MonitorFields, spaceId: string): ValidationResult {
  const { [ConfigKey.MONITOR_TYPE]: monitorType, [ConfigKey.KIBANA_SPACES]: kSpaces } =
    monitorFields;

  if (monitorType !== MonitorTypeEnum.BROWSER && !monitorFields.name) {
    monitorFields.name = monitorFields.urls || monitorFields.hosts;
  }

  if (monitorFields.locations.length === 0) {
    return {
      valid: false,
      reason: LOCATION_REQUIRED_ERROR,
      details: '',
      payload: monitorFields,
    };
  }

  const decodedType = MonitorTypeCodec.decode(monitorType);

  if (isLeft(decodedType)) {
    return {
      valid: false,
      reason: INVALID_TYPE_ERROR,
      details: formatErrors(decodedType.left).join(' | '),
      payload: monitorFields,
    };
  }

  // Cast it to ICMPCodec to satisfy typing. During runtime, correct codec will be used to decode.
  const SyntheticsMonitorCodec = monitorTypeToCodecMap[monitorType] as typeof ICMPFieldsCodec;

  if (!SyntheticsMonitorCodec) {
    return {
      valid: false,
      reason: INVALID_PAYLOAD_ERROR,
      details: '',
      payload: monitorFields,
    };
  }

  const alert = monitorFields.alert;
  if (alert) {
    try {
      AlertConfigSchema.validate(alert);
    } catch (e) {
      return {
        valid: false,
        reason: 'Invalid alert configuration',
        details: e.message,
        payload: monitorFields,
      };
    }
  }

  const schedule = monitorFields[ConfigKey.SCHEDULE];
  if (!isAllowedMonitorSchedule(schedule)) {
    return {
      valid: false,
      reason: INVALID_SCHEDULE_ERROR,
      details: getInvalidScheduleDetails(schedule),
      payload: monitorFields,
    };
  }

  const ExactSyntheticsMonitorCodec = t.exact(SyntheticsMonitorCodec);
  const decodedMonitor = ExactSyntheticsMonitorCodec.decode(monitorFields);

  if (isLeft(decodedMonitor)) {
    return {
      valid: false,
      reason: INVALID_SCHEMA_ERROR(monitorType),
      details: formatErrors(decodedMonitor.left).join(' | '),
      payload: monitorFields,
    };
  }

  if (monitorType === MonitorTypeEnum.BROWSER) {
    const inlineScript = monitorFields[ConfigKey.SOURCE_INLINE];
    const projectContent = monitorFields[ConfigKey.SOURCE_PROJECT_CONTENT];
    if (!inlineScript && !projectContent) {
      return {
        valid: false,
        reason: 'Monitor is not a valid monitor of type browser',
        details: i18n.translate('xpack.synthetics.createMonitor.validation.noScript', {
          defaultMessage: 'source.inline.script: Script is required for browser monitor.',
        }),
        payload: monitorFields,
      };
    }

    const timeout = monitorFields[ConfigKey.TIMEOUT];
    if (timeout) {
      const timeoutSeconds = typeof timeout === 'string' ? parseInt(timeout, 10) : timeout;
      const hasPrivateLocations = monitorFields.locations?.some((loc) => !loc.isServiceManaged);
      if (
        timeoutSeconds < HEARTBEAT_BROWSER_MONITOR_TIMEOUT_OVERHEAD_SECONDS &&
        hasPrivateLocations
      ) {
        return {
          valid: false,
          reason: BROWSER_INVALID_TIMEOUT_ERROR,
          details: BROWSER_INVALID_TIMEOUT_DETAILS(timeoutSeconds),
          payload: monitorFields,
        };
      }
    }
  }

  if (spaceId && !isEmpty(kSpaces)) {
    // we throw error if kSpaces is not empty and spaceId is not present
    if (kSpaces && !kSpaces.includes(spaceId) && !kSpaces.includes('*')) {
      return {
        valid: false,
        reason: i18n.translate('xpack.synthetics.createMonitor.validation.invalidSpace', {
          defaultMessage:
            'Invalid space ID provided in monitor configuration. It should always include the current space ID.',
        }),
        details: '',
        payload: monitorFields,
      };
    }
  }

  return {
    valid: true,
    reason: '',
    details: '',
    payload: monitorFields,
    decodedMonitor: decodedMonitor.right,
  };
}

export const normalizeAPIConfig = (monitor: CreateMonitorPayLoad) => {
  const monitorType = monitor.type as MonitorTypeEnum;
  const decodedType = MonitorTypeCodec.decode(monitorType);

  if (isLeft(decodedType)) {
    return {
      errorMessage: formatErrors(decodedType.left).join(' | '),
    };
  }

  const defaultFields = DEFAULT_FIELDS[monitor.type as MonitorTypeEnum];
  let supportedKeys = Object.keys(defaultFields);
  const flattenedConfig = flattenAndFormatObject(monitor, '', supportedKeys);
  const {
    locations: _locations,
    private_locations: _privateLocations,
    id: _id,
    retest_on_failure: _retestOnFailure,
    url: rawUrl,
    ssl: _rawSSL,
    host: rawHost,
    inline_script: inlineScript,
    custom_heartbeat_id: _customHeartbeatId,
    params: rawParams,
    playwright_options: rawPlaywrightOptions,
    ...rawConfig
  } = flattenedConfig;
  if (
    Object.keys(flattenedConfig).some((key) => key.startsWith('ssl.')) &&
    monitor.origin !== 'project'
  ) {
    rawConfig[ConfigKey.METADATA] = {
      is_tls_enabled: true,
      ...((flattenedConfig[ConfigKey.METADATA] as any) ?? {}),
    };
  }

  if (rawUrl) {
    // since api accept url key as well
    rawConfig[ConfigKey.URLS] = rawUrl;
  }
  if (inlineScript) {
    rawConfig[ConfigKey.SOURCE_INLINE] = inlineScript;
  }
  if (rawHost) {
    // since api accept url key as well
    rawConfig[ConfigKey.HOSTS] = rawHost;
  }
  if (
    monitor.type === 'browser' &&
    monitor[ConfigKey.FORM_MONITOR_TYPE] !== FormMonitorType.SINGLE &&
    monitor[ConfigKey.FORM_MONITOR_TYPE] !== FormMonitorType.MULTISTEP
  ) {
    // urls isn't supported for browser but is needed for SO AAD
    supportedKeys = supportedKeys.filter((key) => key !== ConfigKey.URLS);
  }
  // needed for SO AAD
  supportedKeys.push(ConfigKey.PROJECT_ID, ConfigKey.ORIGINAL_SPACE);

  let unsupportedKeys = Object.keys(rawConfig).filter((key) => !supportedKeys.includes(key));

  const result = omit(rawConfig, unsupportedKeys);
  let kSpaces = rawConfig[ConfigKey.KIBANA_SPACES] as string[];
  if (kSpaces?.includes('*')) {
    kSpaces = ['*'];
  }

  const formattedConfig = {
    ...result,
    locations: _locations,
    private_locations: _privateLocations,
    retest_on_failure: _retestOnFailure,
    custom_heartbeat_id: _customHeartbeatId,
    ...(kSpaces ? { [ConfigKey.KIBANA_SPACES]: kSpaces } : {}),
  } as CreateMonitorPayLoad;

  const requestBodyCheck = formattedConfig[ConfigKey.REQUEST_BODY_CHECK];
  if (typeof requestBodyCheck === 'string') {
    formattedConfig[ConfigKey.REQUEST_BODY_CHECK] = {
      type: CodeEditorMode.PLAINTEXT,
      value: requestBodyCheck,
    };
  }

  if (rawParams) {
    const { value, error } = validateParams(rawParams);
    if (error) {
      formattedConfig[ConfigKey.PARAMS] = rawParams as string;
      return {
        formattedConfig,
        errorMessage: i18n.translate('xpack.synthetics.restApi.monitor.invalidParams', {
          defaultMessage: 'Invalid params: {error}',
          values: { error: error.message },
        }),
      };
    }
    formattedConfig[ConfigKey.PARAMS] = value;
  }

  if (rawPlaywrightOptions) {
    const { value, error } = validateJSON(rawPlaywrightOptions);
    if (error) {
      formattedConfig[ConfigKey.PLAYWRIGHT_OPTIONS] = rawPlaywrightOptions as string;
      return {
        formattedConfig,
        errorMessage: i18n.translate('xpack.synthetics.restApi.monitor.invalidPlaywrightOptions', {
          defaultMessage: 'Invalid playwright_options: {error}',
          values: { error: error.message },
        }),
      };
    }
    formattedConfig[ConfigKey.PLAYWRIGHT_OPTIONS] = value;
  }

  if (unsupportedKeys.length > 0) {
    unsupportedKeys = unsupportedKeys.map((key) => {
      if (key === ConfigKey.SOURCE_INLINE && inlineScript) {
        return 'inline_script';
      }
      if (key === ConfigKey.URLS && rawUrl) {
        return 'url';
      }
      if (key === ConfigKey.HOSTS && rawHost) {
        return 'host';
      }
      return key;
    });
    return {
      formattedConfig,
      errorMessage: i18n.translate('xpack.synthetics.restApi.monitor.invalidMonitorKey', {
        defaultMessage: 'Invalid monitor key(s) for {monitorType} type:  {unsupportedKeys}',
        values: { monitorType: monitor.type, unsupportedKeys: unsupportedKeys.join(' | ') },
      }),
    };
  }
  return { formattedConfig };
};
const RecordSchema = schema.recordOf(schema.string(), schema.string());

const validateParams = (jsonString: string | any) => {
  if (typeof jsonString === 'string') {
    try {
      JSON.parse(jsonString);
      return { value: jsonString };
    } catch (e) {
      return { error: e };
    }
  }
  try {
    RecordSchema.validate(jsonString);
    return { value: JSON.stringify(jsonString) };
  } catch (e) {
    return { error: e };
  }
};

const validateJSON = (jsonString: string | any) => {
  if (typeof jsonString === 'string') {
    try {
      JSON.parse(jsonString);
      return { value: jsonString };
    } catch (e) {
      return { error: e };
    }
  }
  try {
    return { value: JSON.stringify(jsonString) };
  } catch (e) {
    return { error: e };
  }
};

export function validateProjectMonitor(
  monitorFields: ProjectMonitor,
  publicLocations: Locations,
  privateLocations: SyntheticsPrivateLocations
): ValidationResult {
  const locationsError = validateLocation(monitorFields, publicLocations, privateLocations);
  // Cast it to ICMPCodec to satisfy typing. During runtime, correct codec will be used to decode.
  const decodedMonitor = ProjectMonitorCodec.decode(monitorFields);

  if (isLeft(decodedMonitor)) {
    return {
      valid: false,
      reason: INVALID_CONFIGURATION_ERROR,
      details: [...formatErrors(decodedMonitor.left), locationsError]
        .filter((error) => error !== '' && error !== undefined)
        .join(' | '),
      payload: monitorFields,
    };
  }

  if (locationsError) {
    return {
      valid: false,
      reason: INVALID_CONFIGURATION_ERROR,
      details: locationsError,
      payload: monitorFields,
    };
  }

  return { valid: true, reason: '', details: '', payload: monitorFields };
}

export function validateLocation(
  monitorFields: ProjectMonitor,
  publicLocations: Locations,
  privateLocations: SyntheticsPrivateLocations
) {
  const hasPublicLocationsConfigured = (monitorFields.locations || []).length > 0;
  const hasPrivateLocationsConfigured = (monitorFields.privateLocations || []).length > 0;

  if (hasPublicLocationsConfigured) {
    let invalidLocation = '';
    const hasValidPublicLocation = monitorFields.locations?.some((location) => {
      if (publicLocations.length === 0) {
        invalidLocation = location;
        return false;
      }

      return publicLocations.some((supportedLocation) => {
        const locationIsValid = supportedLocation.id === location;
        if (!locationIsValid) {
          invalidLocation = location;
        }
        return locationIsValid;
      });
    });
    if (!hasValidPublicLocation) {
      return INVALID_PUBLIC_LOCATION_ERROR(invalidLocation);
    }
  }

  if (hasPrivateLocationsConfigured) {
    let invalidLocation = '';
    const hasValidPrivateLocation = monitorFields.privateLocations?.some((location) => {
      if (privateLocations.length === 0) {
        invalidLocation = location;
        return false;
      }

      return privateLocations.some((supportedLocation) => {
        const locationIsValid = supportedLocation.label === location;
        if (!locationIsValid) {
          invalidLocation = location;
        }
        return locationIsValid;
      });
    });

    if (!hasValidPrivateLocation) {
      return INVALID_PRIVATE_LOCATION_ERROR(invalidLocation);
    }
  }

  if (hasPrivateLocationsConfigured && monitorFields.spaces && monitorFields.spaces.length > 0) {
    for (const locationName of monitorFields.privateLocations ?? []) {
      const loc = locationName.toLowerCase();
      const matchedLocation = privateLocations.find(
        (privateLocation) =>
          privateLocation.label.toLowerCase() === loc || privateLocation.id.toLowerCase() === loc
      );
      if (matchedLocation) {
        if (!privateLocationCoversAllMonitorSpaces(monitorFields.spaces, matchedLocation.spaces)) {
          return PRIVATE_LOCATION_SPACE_COVERAGE_ERROR(matchedLocation.label);
        }
      }
    }
  }

  const hasEmptyLocations =
    monitorFields.locations &&
    monitorFields.locations.length === 0 &&
    (monitorFields.privateLocations ?? []).length === 0;

  if (hasEmptyLocations) {
    return EMPTY_LOCATION_ERROR;
  }
}

export const INVALID_CONFIGURATION_ERROR = i18n.translate(
  'xpack.synthetics.server.monitors.invalidConfigurationError',
  {
    defaultMessage: "Couldn't save or update monitor because of an invalid configuration.",
  }
);

const INVALID_PAYLOAD_ERROR = i18n.translate(
  'xpack.synthetics.server.monitors.invalidPayloadError',
  {
    defaultMessage: 'Payload is not a valid monitor object',
  }
);

const INVALID_TYPE_ERROR = i18n.translate('xpack.synthetics.server.monitors.invalidTypeError', {
  defaultMessage: 'Monitor type is invalid',
});

const INVALID_SCHEDULE_ERROR = i18n.translate(
  'xpack.synthetics.server.monitors.invalidScheduleError',
  {
    defaultMessage: 'Monitor schedule is invalid',
  }
);

const INVALID_SCHEDULE_DETAILS = (schedule: string) =>
  i18n.translate('xpack.synthetics.server.monitors.invalidScheduleDetails', {
    defaultMessage:
      'Invalid schedule {schedule} minutes supplied to monitor configuration. Supported schedule values in minutes are {allowedSchedulesInMinutes}',
    values: {
      schedule,
      allowedSchedulesInMinutes: ALLOWED_SCHEDULES_IN_MINUTES.join(', '),
    },
  });

const INVALID_SCHEDULE_SECONDS_DETAILS = (schedule: string) =>
  i18n.translate('xpack.synthetics.server.monitors.invalidScheduleSecondsErrorMessage', {
    defaultMessage:
      'Invalid schedule {schedule} supplied to monitor configuration. Supported schedule values in seconds are {allowedSchedulesInSeconds}',
    values: {
      schedule,
      allowedSchedulesInSeconds: ALLOWED_SCHEDULES_IN_SECONDS.join(', '),
    },
  });

const INVALID_SCHEDULE_UNIT_DETAILS = (unit: string) =>
  i18n.translate('xpack.synthetics.server.monitors.invalidScheduleUnitErrorMessage', {
    defaultMessage:
      'Invalid schedule unit {unit} supplied to monitor configuration. Supported units are m and s.',
    values: {
      unit,
    },
  });

const scheduleNumberAsString = (schedule: MonitorFields['schedule']): string => {
  const numberValue = schedule.number as unknown;
  return typeof numberValue === 'number' ? `${numberValue}` : String(numberValue ?? '');
};

const isAllowedMonitorSchedule = (schedule: MonitorFields['schedule']): boolean => {
  const number = scheduleNumberAsString(schedule);
  const { unit } = schedule;
  if (!number || !unit) {
    return false;
  }
  if (unit === ScheduleUnit.MINUTES) {
    return ALLOWED_SCHEDULES_IN_MINUTES.includes(number);
  }
  if (unit === ScheduleUnit.SECONDS) {
    return ALLOWED_SCHEDULES_IN_SECONDS.includes(`${number}s`);
  }
  return false;
};

const getInvalidScheduleDetails = (schedule: MonitorFields['schedule']): string => {
  const number = scheduleNumberAsString(schedule);
  const { unit } = schedule;
  if (unit === ScheduleUnit.MINUTES) {
    return INVALID_SCHEDULE_DETAILS(number);
  }
  if (unit === ScheduleUnit.SECONDS) {
    return INVALID_SCHEDULE_SECONDS_DETAILS(`${number}s`);
  }
  return INVALID_SCHEDULE_UNIT_DETAILS(String(unit ?? ''));
};

const INVALID_SCHEMA_ERROR = (type: string) =>
  i18n.translate('xpack.synthetics.server.monitors.invalidSchemaError', {
    defaultMessage: 'Monitor is not a valid monitor of type {type}',
    values: {
      type,
    },
  });

const EMPTY_LOCATION_ERROR = i18n.translate(
  'xpack.synthetics.server.projectMonitors.locationEmptyError',
  {
    defaultMessage: 'You must add at least one location or private location to this monitor.',
  }
);

const INVALID_PRIVATE_LOCATION_ERROR = (location: string) =>
  i18n.translate('xpack.synthetics.server.projectMonitors.invalidPrivateLocationError', {
    defaultMessage:
      'Invalid private location: "{location}". Remove it or replace it with a valid private location.',
    values: {
      location,
    },
  });

const INVALID_PUBLIC_LOCATION_ERROR = (location: string) =>
  i18n.translate('xpack.synthetics.server.projectMonitors.invalidPublicLocationError', {
    defaultMessage:
      'Invalid location: "{location}". Remove it or replace it with a valid location.',
    values: {
      location,
    },
  });

const PRIVATE_LOCATION_SPACE_COVERAGE_ERROR = (location: string) =>
  i18n.translate('xpack.synthetics.server.projectMonitors.privateLocationSpaceCoverageError', {
    defaultMessage:
      'Private location "{location}" is not available in all spaces this monitor is shared to. ' +
      'Either share the private location to all monitor spaces, or remove those spaces from the monitor.',
    values: {
      location,
    },
  });

export const LOCATION_REQUIRED_ERROR = i18n.translate(
  'xpack.synthetics.createMonitor.validation.noLocations',
  {
    defaultMessage:
      'At least one location is required, either elastic managed or private e.g locations: ["us-east"] or private_locations:["test private location"]',
  }
);

const BROWSER_INVALID_TIMEOUT_ERROR = i18n.translate(
  'xpack.synthetics.server.monitors.invalidTimeoutError',
  {
    defaultMessage: 'Browser monitor timeout for private locations is invalid',
  }
);

const BROWSER_INVALID_TIMEOUT_DETAILS = (timeout: number) =>
  i18n.translate('xpack.synthetics.server.monitors.invalidTimeoutDetails', {
    defaultMessage:
      'Timeout of {timeout} seconds is too low. Browser monitors on private locations require a minimum timeout of {heartbeatTimeoutOverhead} seconds.',
    values: {
      timeout,
      heartbeatTimeoutOverhead: HEARTBEAT_BROWSER_MONITOR_TIMEOUT_OVERHEAD_SECONDS,
    },
  });
