/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { NonEmptyArray, NonEmptyString } from '@kbn/securitysolution-io-ts-types';
import { AlertConfigsCodec } from './alert_config';
import type { secretKeys } from '../../constants/monitor_management';
import { ConfigKey } from './config_key';
import { MonitorServiceLocationCodec, ServiceLocationErrors } from './locations';
import {
  MonitorTypeEnum,
  MonitorTypeCodec,
  FormMonitorTypeCodec,
  ModeCodec,
  ResponseBodyIndexPolicyCodec,
  ResponseCheckJSONCodec,
  ScheduleUnitCodec,
  SourceTypeCodec,
  TLSVersionCodec,
  VerificationModeCodec,
  RequestBodyCheckCodec,
} from './monitor_configs';
import { MetadataCodec } from './monitor_meta_data';
import { PrivateLocationCodec } from './synthetics_private_locations';
import {
  getNonEmptyStringCodec,
  InlineScriptString,
  NameSpaceString,
  TimeoutString,
} from '../common';

const ScheduleCodec = t.interface({
  number: t.string,
  unit: ScheduleUnitCodec,
});

// TLSFields
export const TLSFieldsCodec = t.partial({
  [ConfigKey.TLS_CERTIFICATE_AUTHORITIES]: t.union([t.string, t.array(t.string)]),
  [ConfigKey.TLS_CERTIFICATE]: t.string,
  [ConfigKey.TLS_VERIFICATION_MODE]: VerificationModeCodec,
  [ConfigKey.TLS_VERSION]: t.array(TLSVersionCodec),
});

export const TLSSensitiveFieldsCodec = t.partial({
  [ConfigKey.TLS_KEY]: t.string,
  [ConfigKey.TLS_KEY_PASSPHRASE]: t.string,
});

export const TLSCodec = t.intersection([TLSFieldsCodec, TLSSensitiveFieldsCodec]);

const MonitorLocationsCodec = NonEmptyArray(
  t.union([MonitorServiceLocationCodec, PrivateLocationCodec])
);

export type MonitorLocations = t.TypeOf<typeof MonitorLocationsCodec>;

// CommonFields
export const CommonFieldsCodec = t.intersection([
  t.interface({
    [ConfigKey.NAME]: NonEmptyString,
    [ConfigKey.NAMESPACE]: NameSpaceString,
    [ConfigKey.MONITOR_TYPE]: MonitorTypeCodec,
    [ConfigKey.ENABLED]: t.boolean,
    [ConfigKey.SCHEDULE]: ScheduleCodec,
    [ConfigKey.APM_SERVICE_NAME]: t.string,
    [ConfigKey.TAGS]: t.array(t.string),
    [ConfigKey.LOCATIONS]: MonitorLocationsCodec,
    [ConfigKey.MONITOR_QUERY_ID]: t.string,
    [ConfigKey.CONFIG_ID]: t.string,
    [ConfigKey.MAX_ATTEMPTS]: t.number,
  }),
  t.partial({
    [ConfigKey.FORM_MONITOR_TYPE]: FormMonitorTypeCodec,
    [ConfigKey.TIMEOUT]: t.union([TimeoutString, t.null, t.number]),
    [ConfigKey.REVISION]: t.number,
    [ConfigKey.MONITOR_SOURCE_TYPE]: SourceTypeCodec,
    [ConfigKey.CONFIG_HASH]: t.string,
    [ConfigKey.JOURNEY_ID]: t.string,
    [ConfigKey.PROJECT_ID]: t.string,
    [ConfigKey.ORIGINAL_SPACE]: t.string,
    [ConfigKey.CUSTOM_HEARTBEAT_ID]: t.string,
    [ConfigKey.ALERT_CONFIG]: AlertConfigsCodec,
    [ConfigKey.PARAMS]: t.string,
    [ConfigKey.LABELS]: t.record(t.string, t.string),
    [ConfigKey.MAINTENANCE_WINDOWS]: t.array(t.string),
    [ConfigKey.KIBANA_SPACES]: t.array(t.string),
    retest_on_failure: t.boolean,
  }),
]);

// TCP Simple Fields
export const TCPSimpleFieldsCodec = t.intersection([
  t.interface({
    [ConfigKey.METADATA]: MetadataCodec,
    [ConfigKey.HOSTS]: getNonEmptyStringCodec('host'),
    [ConfigKey.PORT]: t.union([t.number, t.null]),
  }),
  t.partial({
    [ConfigKey.URLS]: t.string,
  }),
  CommonFieldsCodec,
]);

// TCPAdvancedFields
export const TCPAdvancedFieldsCodec = t.intersection([
  t.interface({
    [ConfigKey.PROXY_URL]: t.string,
    [ConfigKey.PROXY_USE_LOCAL_RESOLVER]: t.boolean,
  }),
  t.partial({
    [ConfigKey.MODE]: ModeCodec,
    [ConfigKey.IPV4]: t.boolean,
    [ConfigKey.IPV6]: t.boolean,
  }),
]);

export const TCPSensitiveAdvancedFieldsCodec = t.interface({
  [ConfigKey.RESPONSE_RECEIVE_CHECK]: t.string,
  [ConfigKey.REQUEST_SEND_CHECK]: t.string,
});

export const TCPAdvancedCodec = t.intersection([
  TCPAdvancedFieldsCodec,
  TCPSensitiveAdvancedFieldsCodec,
]);

export type TCPAdvancedFields = t.TypeOf<typeof TCPAdvancedCodec>;

// TCPFields
// All fields for TCP monitor, excluding sensitive fields
export const EncryptedTCPFieldsCodec = t.intersection([
  TCPSimpleFieldsCodec,
  TCPAdvancedFieldsCodec,
  TLSFieldsCodec,
]);

// All fields for TCP monitor, including sensitive fields
export const TCPFieldsCodec = t.intersection([
  EncryptedTCPFieldsCodec,
  TCPSensitiveAdvancedFieldsCodec,
  TLSSensitiveFieldsCodec,
]);

export type TCPFields = t.TypeOf<typeof TCPFieldsCodec>;

// ICMP SimpleFields
export const ICMPSimpleFieldsCodec = t.intersection([
  t.interface({
    [ConfigKey.HOSTS]: NonEmptyString,
    [ConfigKey.WAIT]: t.string,
  }),
  CommonFieldsCodec,
]);

export type ICMPSimpleFields = t.TypeOf<typeof ICMPSimpleFieldsCodec>;

// ICMPAdvancedFields
export const ICMPAdvancedFieldsCodec = t.partial({
  [ConfigKey.MODE]: ModeCodec,
  [ConfigKey.IPV4]: t.boolean,
  [ConfigKey.IPV6]: t.boolean,
});

// ICMPFields
export const ICMPFieldsCodec = t.intersection([ICMPSimpleFieldsCodec, ICMPAdvancedFieldsCodec]);

export type ICMPFields = t.TypeOf<typeof ICMPFieldsCodec>;

// HTTPSimpleFields
export const HTTPSimpleFieldsCodec = t.intersection([
  t.interface({
    [ConfigKey.METADATA]: MetadataCodec,
    // string is for yaml config and number for public api
    [ConfigKey.MAX_REDIRECTS]: t.union([t.string, t.number]),
    [ConfigKey.URLS]: getNonEmptyStringCodec('url'),
    [ConfigKey.PORT]: t.union([t.number, t.null]),
  }),
  CommonFieldsCodec,
]);

export type HTTPSimpleFields = t.TypeOf<typeof HTTPSimpleFieldsCodec>;

// HTTPAdvancedFields
export const HTTPAdvancedFieldsCodec = t.intersection([
  t.interface({
    [ConfigKey.PROXY_URL]: t.string,
    [ConfigKey.RESPONSE_BODY_INDEX]: ResponseBodyIndexPolicyCodec,
    [ConfigKey.RESPONSE_HEADERS_INDEX]: t.boolean,
    [ConfigKey.RESPONSE_STATUS_CHECK]: t.array(t.string),
    [ConfigKey.REQUEST_METHOD_CHECK]: t.string,
  }),
  t.partial({
    [ConfigKey.MODE]: ModeCodec,
    [ConfigKey.RESPONSE_BODY_MAX_BYTES]: t.string,
    [ConfigKey.IPV4]: t.boolean,
    [ConfigKey.IPV6]: t.boolean,
  }),
]);

export const HTTPSensitiveAdvancedFieldsCodec = t.intersection([
  t.interface({
    [ConfigKey.PASSWORD]: t.string,
    [ConfigKey.RESPONSE_BODY_CHECK_NEGATIVE]: t.array(t.string),
    [ConfigKey.RESPONSE_BODY_CHECK_POSITIVE]: t.array(t.string),
    [ConfigKey.RESPONSE_HEADERS_CHECK]: t.record(t.string, t.string),
    [ConfigKey.REQUEST_BODY_CHECK]: RequestBodyCheckCodec,
    [ConfigKey.REQUEST_HEADERS_CHECK]: t.record(t.string, t.string),
    [ConfigKey.USERNAME]: t.string,
  }),
  t.partial({
    [ConfigKey.PROXY_HEADERS]: t.record(t.string, t.string),
    [ConfigKey.RESPONSE_JSON_CHECK]: t.array(ResponseCheckJSONCodec),
  }),
]);

export const HTTPAdvancedCodec = t.intersection([
  HTTPAdvancedFieldsCodec,
  HTTPSensitiveAdvancedFieldsCodec,
]);

// HTTPFields
// All fields for HTTP monitor, excluding sensitive fields
export const EncryptedHTTPFieldsCodec = t.intersection([
  HTTPSimpleFieldsCodec,
  HTTPAdvancedFieldsCodec,
  TLSFieldsCodec,
]);

// All fields for HTTP monitor, including sensitive fields
export const HTTPFieldsCodec = t.intersection([
  EncryptedHTTPFieldsCodec,
  HTTPSensitiveAdvancedFieldsCodec,
  TLSSensitiveFieldsCodec,
]);

export const EncryptedBrowserSimpleFieldsCodec = t.intersection([
  t.intersection([
    t.interface({
      [ConfigKey.METADATA]: MetadataCodec,
    }),
    t.partial({
      [ConfigKey.PLAYWRIGHT_OPTIONS]: t.string,
      [ConfigKey.TEXT_ASSERTION]: t.string,
    }),
  ]),
  CommonFieldsCodec,
]);

export const BrowserSensitiveSimpleFieldsCodec = t.intersection([
  t.interface({
    [ConfigKey.SOURCE_INLINE]: InlineScriptString,
    [ConfigKey.SOURCE_PROJECT_CONTENT]: t.string,
    [ConfigKey.URLS]: t.union([t.string, t.null]),
    [ConfigKey.PORT]: t.union([t.number, t.null]),
  }),
  CommonFieldsCodec,
]);

export const ThrottlingConfigValueCodec = t.interface({
  download: t.string,
  upload: t.string,
  latency: t.string,
});

export type ThrottlingConfigValue = t.TypeOf<typeof ThrottlingConfigValueCodec>;

export const ThrottlingConfigCodec = t.interface({
  value: t.union([ThrottlingConfigValueCodec, t.null]),
  label: t.string,
  id: t.string,
});

export type ThrottlingConfig = t.TypeOf<typeof ThrottlingConfigCodec>;

export const EncryptedBrowserAdvancedFieldsCodec = t.interface({
  [ConfigKey.SCREENSHOTS]: t.string,
  [ConfigKey.JOURNEY_FILTERS_MATCH]: t.string,
  [ConfigKey.JOURNEY_FILTERS_TAGS]: t.array(t.string),
  [ConfigKey.IGNORE_HTTPS_ERRORS]: t.boolean,
  [ConfigKey.CERTIFICATE_ERROR_SPKI_ALLOWLIST]: t.array(t.string),
  [ConfigKey.THROTTLING_CONFIG]: ThrottlingConfigCodec,
});

export const BrowserSimpleFieldsCodec = t.intersection([
  EncryptedBrowserSimpleFieldsCodec,
  BrowserSensitiveSimpleFieldsCodec,
]);

export const BrowserSensitiveAdvancedFieldsCodec = t.interface({
  [ConfigKey.SYNTHETICS_ARGS]: t.array(t.string),
});

export const BrowserAdvancedFieldsCodec = t.intersection([
  EncryptedBrowserAdvancedFieldsCodec,
  BrowserSensitiveAdvancedFieldsCodec,
]);

// All fields for Browser monitor, excluding sensitive fields
export const EncryptedBrowserFieldsCodec = t.intersection([
  EncryptedBrowserSimpleFieldsCodec,
  EncryptedBrowserAdvancedFieldsCodec,
  TLSFieldsCodec,
]);

// All fields for Browser monitor, including sensitive fields
export const BrowserFieldsCodec = t.intersection([
  BrowserSimpleFieldsCodec,
  BrowserAdvancedFieldsCodec,
  TLSCodec,
]);

// API monitor — `monitor.type: api`. Structurally identical to BrowserFields:
// same script source, params, journey filters, metadata, and Playwright
// options. Differentiated solely by `monitor.type`, which Heartbeat routes to
// the `api` plugin (see elastic/beats#50802). That plugin reuses the synthexec
// runtime without launching Chromium and silently filters out browser-only
// CLI args (`--screenshots`, `--throttling`, `--sandbox`). SCREENSHOTS /
// THROTTLING_CONFIG remain in the shape for SO compatibility but are ignored
// downstream; the API form hides those knobs.
export const EncryptedAPISimpleFieldsCodec = EncryptedBrowserSimpleFieldsCodec;
export const APISensitiveSimpleFieldsCodec = BrowserSensitiveSimpleFieldsCodec;
export const APISimpleFieldsCodec = BrowserSimpleFieldsCodec;
export const EncryptedAPIAdvancedFieldsCodec = EncryptedBrowserAdvancedFieldsCodec;
export const APISensitiveAdvancedFieldsCodec = BrowserSensitiveAdvancedFieldsCodec;
export const APIAdvancedFieldsCodec = BrowserAdvancedFieldsCodec;
export const EncryptedAPIFieldsCodec = EncryptedBrowserFieldsCodec;
export const APIFieldsCodec = BrowserFieldsCodec;

// MonitorFields, represents any possible monitor type. APIFieldsCodec is
// structurally identical to BrowserFieldsCodec, so it is intentionally not
// listed here — adding it would be a no-op intersection that confuses readers.
export const MonitorFieldsCodec = t.intersection([
  HTTPFieldsCodec,
  TCPFieldsCodec,
  ICMPSimpleFieldsCodec,
  BrowserFieldsCodec,
]);

export const MonitorFieldsResultCodec = t.intersection([
  MonitorFieldsCodec,
  t.interface({ id: t.string, updated_at: t.string, created_at: t.string }),
]);

// Monitor, represents one of (Icmp | Tcp | Http | Browser | API) decrypted.
// APIFieldsCodec is structurally identical to BrowserFieldsCodec; we list it
// explicitly so a future split into its own codec is a non-breaking change.
export const SyntheticsMonitorCodec = t.union([
  HTTPFieldsCodec,
  TCPFieldsCodec,
  ICMPSimpleFieldsCodec,
  BrowserFieldsCodec,
  APIFieldsCodec,
]);

// Monitor, represents one of (Icmp | Tcp | Http | Browser | API) encrypted.
export const EncryptedSyntheticsMonitorCodec = t.union([
  EncryptedHTTPFieldsCodec,
  EncryptedTCPFieldsCodec,
  ICMPSimpleFieldsCodec,
  EncryptedBrowserFieldsCodec,
  EncryptedAPIFieldsCodec,
]);

export const SyntheticsMonitorWithIdCodec = t.intersection([
  SyntheticsMonitorCodec,
  t.interface({ id: t.string, updated_at: t.string, created_at: t.string }),
  t.partial({ spaces: t.array(t.string), spaceId: t.string, revision: t.number }),
]);

const HeartbeatFieldsCodec = t.intersection([
  t.interface({
    config_id: t.string,
  }),
  t.partial({
    run_once: t.boolean,
    test_run_id: t.string,
    'monitor.project.name': t.string,
    'monitor.id': t.string,
    'monitor.project.id': t.string,
    'monitor.fleet_managed': t.boolean,
    'monitor.interval': t.number,
    meta: t.record(t.string, t.union([t.string, t.array(t.string)])),
    kibanaUrl: t.string,
  }),
]);

export const HeartbeatConfigCodec = t.intersection([
  SyntheticsMonitorCodec,
  t.interface({
    id: t.string,
  }),
  t.partial({
    fields_under_root: t.boolean,
    fields: HeartbeatFieldsCodec,
  }),
]);

export const EncryptedSyntheticsSavedMonitorCodec = t.intersection([
  EncryptedSyntheticsMonitorCodec,
  t.interface({ id: t.string, updated_at: t.string, created_at: t.string }),
]);

export const MonitorDefaultsCodec = t.interface({
  [MonitorTypeEnum.HTTP]: HTTPFieldsCodec,
  [MonitorTypeEnum.TCP]: TCPFieldsCodec,
  [MonitorTypeEnum.ICMP]: ICMPSimpleFieldsCodec,
  [MonitorTypeEnum.BROWSER]: BrowserFieldsCodec,
  [MonitorTypeEnum.API]: APIFieldsCodec,
});

export const MonitorManagementListResultCodec = t.type({
  monitors: t.array(EncryptedSyntheticsSavedMonitorCodec),
  page: t.number,
  perPage: t.number,
  total: t.union([t.number, t.null]),
  absoluteTotal: t.union([t.number, t.null]),
  syncErrors: t.union([ServiceLocationErrors, t.null]),
});

export const SyntheticsMonitorWithSecretsCodec = t.intersection([
  EncryptedSyntheticsMonitorCodec,
  t.interface({
    secrets: t.string,
  }),
]);

export type SyntheticsMonitorSchedule = t.TypeOf<typeof ScheduleCodec>;
export type TLSFields = t.TypeOf<typeof TLSCodec>;
export type CommonFields = t.TypeOf<typeof CommonFieldsCodec>;
export type TCPSimpleFields = t.TypeOf<typeof TCPSimpleFieldsCodec>;
export type HTTPAdvancedFields = t.TypeOf<typeof HTTPAdvancedCodec>;
export type HTTPFields = t.TypeOf<typeof HTTPFieldsCodec>;
export type BrowserFields = t.TypeOf<typeof BrowserFieldsCodec>;
export type BrowserSimpleFields = t.TypeOf<typeof BrowserSimpleFieldsCodec>;
export type BrowserAdvancedFields = t.TypeOf<typeof BrowserAdvancedFieldsCodec>;
export type APIFields = t.TypeOf<typeof APIFieldsCodec>;
export type APISimpleFields = t.TypeOf<typeof APISimpleFieldsCodec>;
export type APIAdvancedFields = t.TypeOf<typeof APIAdvancedFieldsCodec>;
export type MonitorFields = t.TypeOf<typeof MonitorFieldsCodec>;
export type MonitorFieldsResult = t.TypeOf<typeof MonitorFieldsResultCodec>;
export type HeartbeatFields = t.TypeOf<typeof HeartbeatFieldsCodec>;
export type SyntheticsMonitor = t.TypeOf<typeof SyntheticsMonitorCodec>;
export type SyntheticsMonitorWithId = t.TypeOf<typeof SyntheticsMonitorWithIdCodec>;
export type EncryptedSyntheticsSavedMonitor = t.TypeOf<typeof EncryptedSyntheticsSavedMonitorCodec>;
export type HeartbeatConfig = t.TypeOf<typeof HeartbeatConfigCodec>;
export type MonitorDefaults = t.TypeOf<typeof MonitorDefaultsCodec>;
export type MonitorManagementListResult = t.TypeOf<typeof MonitorManagementListResultCodec>;
export type Secret = (typeof secretKeys)[number];
export type SyntheticsMonitorWithSecrets = Omit<
  t.TypeOf<typeof SyntheticsMonitorWithSecretsCodec>,
  Secret
>;
export type SyntheticsMonitorWithSecretsAttributes = Omit<
  t.TypeOf<typeof SyntheticsMonitorWithSecretsCodec>,
  Secret
>;
export type EncryptedSyntheticsMonitor = Omit<SyntheticsMonitorWithSecrets, 'secrets'>;
export type EncryptedSyntheticsMonitorAttributes = Omit<SyntheticsMonitorWithSecrets, 'secrets'>;
