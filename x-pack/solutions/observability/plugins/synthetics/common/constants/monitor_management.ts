/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export enum AlertConfigKey {
  STATUS_ENABLED = 'alert.status.enabled',
  TLS_ENABLED = 'alert.tls.enabled',
}

// values must match keys in the integration package
export enum ConfigKey {
  ALERT_CONFIG = 'alert',
  APM_SERVICE_NAME = 'service.name',
  CUSTOM_HEARTBEAT_ID = 'custom_heartbeat_id',
  CONFIG_ID = 'config_id',
  CONFIG_HASH = 'hash',
  ENABLED = 'enabled',
  FORM_MONITOR_TYPE = 'form_monitor_type',
  HOSTS = 'hosts',
  IGNORE_HTTPS_ERRORS = 'ignore_https_errors',
  MONITOR_SOURCE_TYPE = 'origin',
  JOURNEY_FILTERS_MATCH = 'filter_journeys.match',
  JOURNEY_FILTERS_TAGS = 'filter_journeys.tags',
  JOURNEY_ID = 'journey_id',
  MAX_REDIRECTS = 'max_redirects',
  METADATA = '__ui',
  LABELS = 'labels',
  MODE = 'mode',
  MONITOR_TYPE = 'type',
  NAME = 'name',
  NAMESPACE = 'namespace',
  LOCATIONS = 'locations',
  PARAMS = 'params',
  PASSWORD = 'password',
  PLAYWRIGHT_OPTIONS = 'playwright_options',
  ORIGINAL_SPACE = 'original_space', // the original space the monitor was saved in. Used by push monitors to ensure uniqueness of monitor id sent to heartbeat and prevent data collisions
  PORT = 'url.port',
  PROXY_URL = 'proxy_url',
  PROXY_HEADERS = 'proxy_headers',
  PROXY_USE_LOCAL_RESOLVER = 'proxy_use_local_resolver',
  RESPONSE_BODY_CHECK_NEGATIVE = 'check.response.body.negative',
  RESPONSE_BODY_CHECK_POSITIVE = 'check.response.body.positive',
  RESPONSE_JSON_CHECK = 'check.response.json',
  RESPONSE_BODY_INDEX = 'response.include_body',
  RESPONSE_HEADERS_CHECK = 'check.response.headers',
  RESPONSE_HEADERS_INDEX = 'response.include_headers',
  RESPONSE_BODY_MAX_BYTES = 'response.include_body_max_bytes',
  RESPONSE_RECEIVE_CHECK = 'check.receive',
  RESPONSE_STATUS_CHECK = 'check.response.status',
  REQUEST_BODY_CHECK = 'check.request.body',
  REQUEST_HEADERS_CHECK = 'check.request.headers',
  REQUEST_METHOD_CHECK = 'check.request.method',
  REQUEST_SEND_CHECK = 'check.send',
  REVISION = 'revision',
  SCHEDULE = 'schedule',
  SCREENSHOTS = 'screenshots',
  SOURCE_PROJECT_CONTENT = 'source.project.content',
  SOURCE_INLINE = 'source.inline.script',
  IPV4 = 'ipv4',
  IPV6 = 'ipv6',
  PROJECT_ID = 'project_id',
  SYNTHETICS_ARGS = 'synthetics_args',
  TEXT_ASSERTION = 'playwright_text_assertion',
  TLS_CERTIFICATE_AUTHORITIES = 'ssl.certificate_authorities',
  TLS_CERTIFICATE = 'ssl.certificate',
  TLS_KEY = 'ssl.key',
  TLS_KEY_PASSPHRASE = 'ssl.key_passphrase',
  TLS_VERIFICATION_MODE = 'ssl.verification_mode',
  TLS_VERSION = 'ssl.supported_protocols',
  TAGS = 'tags',
  TIMEOUT = 'timeout',
  THROTTLING_CONFIG = 'throttling',
  URLS = 'urls',
  USERNAME = 'username',
  WAIT = 'wait',
  MONITOR_QUERY_ID = 'id',
  MAX_ATTEMPTS = 'max_attempts',
  MAINTENANCE_WINDOWS = 'maintenance_windows',
  KIBANA_SPACES = 'spaces',
}

export const secretKeys = [
  ConfigKey.PROXY_HEADERS,
  ConfigKey.PARAMS,
  ConfigKey.PASSWORD,
  ConfigKey.REQUEST_BODY_CHECK,
  ConfigKey.REQUEST_HEADERS_CHECK,
  ConfigKey.REQUEST_SEND_CHECK,
  ConfigKey.RESPONSE_BODY_CHECK_NEGATIVE,
  ConfigKey.RESPONSE_BODY_CHECK_POSITIVE,
  ConfigKey.RESPONSE_JSON_CHECK,
  ConfigKey.RESPONSE_HEADERS_CHECK,
  ConfigKey.RESPONSE_RECEIVE_CHECK,
  ConfigKey.SOURCE_INLINE,
  ConfigKey.SOURCE_PROJECT_CONTENT,
  ConfigKey.SYNTHETICS_ARGS,
  ConfigKey.TLS_KEY,
  ConfigKey.TLS_KEY_PASSPHRASE,
  ConfigKey.USERNAME,
] as const;

export enum LegacyConfigKey {
  SOURCE_ZIP_URL = 'source.zip_url.url',
  SOURCE_ZIP_USERNAME = 'source.zip_url.username',
  SOURCE_ZIP_PASSWORD = 'source.zip_url.password',
  SOURCE_ZIP_FOLDER = 'source.zip_url.folder',
  SOURCE_ZIP_PROXY_URL = 'source.zip_url.proxy_url',
  ZIP_URL_TLS_CERTIFICATE_AUTHORITIES = 'source.zip_url.ssl.certificate_authorities',
  ZIP_URL_TLS_CERTIFICATE = 'source.zip_url.ssl.certificate',
  ZIP_URL_TLS_KEY = 'source.zip_url.ssl.key',
  ZIP_URL_TLS_KEY_PASSPHRASE = 'source.zip_url.ssl.key_passphrase',
  ZIP_URL_TLS_VERIFICATION_MODE = 'source.zip_url.ssl.verification_mode',
  ZIP_URL_TLS_VERSION = 'source.zip_url.ssl.supported_protocols',

  THROTTLING_CONFIG = 'throttling.config',
  IS_THROTTLING_ENABLED = 'throttling.is_enabled',
  DOWNLOAD_SPEED = 'throttling.download_speed',
  UPLOAD_SPEED = 'throttling.upload_speed',
  LATENCY = 'throttling.latency',
}

export const MONITOR_STATUS_ENUM = {
  UP: 'up',
  DOWN: 'down',
  PENDING: 'pending',
  // The monitor produced a run inside the queried window but its latest run has
  // gone stale (it stopped reporting). Distinct from `pending`, which means no
  // run was found in the window at all (e.g. a brand-new, first-run monitor).
  // Mirrors the SLO plugin's `stale` concept (a summary that stopped updating).
  STALE: 'stale',
  SUCCESS: 'succeeded',
  DISABLED: 'disabled',
};
