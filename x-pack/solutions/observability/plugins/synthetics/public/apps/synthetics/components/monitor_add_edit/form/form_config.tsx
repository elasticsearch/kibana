/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { FieldMeta } from '../types';
import { ConfigKey, FormMonitorType } from '../types';
import { AlertConfigKey } from '../constants';
import { API_PRIVATE_LOCATIONS_ONLY, FIELD } from './field_config';

const DEFAULT_DATA_OPTIONS = (readOnly: boolean) => ({
  title: i18n.translate('xpack.synthetics.monitorConfig.section.dataOptions.title', {
    defaultMessage: 'Data options',
  }),
  description: i18n.translate('xpack.synthetics.monitorConfig.section.dataOptions.description', {
    defaultMessage: 'Configure data options to add context to the data coming from your monitors.',
  }),
  components: [
    FIELD(readOnly)[ConfigKey.TAGS],
    FIELD(readOnly)[ConfigKey.LABELS],
    FIELD(readOnly)[ConfigKey.APM_SERVICE_NAME],
    FIELD(readOnly)[ConfigKey.NAMESPACE],
  ],
});

const MAINTENANCE_WINDOWS_OPTIONS = (readOnly: boolean) => ({
  title: i18n.translate('xpack.synthetics.monitorConfig.section.maintenanceWindows.title', {
    defaultMessage: 'Maintenance windows',
  }),
  description: i18n.translate(
    'xpack.synthetics.monitorConfig.section.maintenanceWindows.description',
    {
      defaultMessage:
        'Configure maintenance windows to prevent alerts from being triggered during scheduled downtime.',
    }
  ),
  components: [FIELD(readOnly)[ConfigKey.MAINTENANCE_WINDOWS]],
});

const HTTP_ADVANCED = (readOnly: boolean) => ({
  requestConfig: {
    title: i18n.translate('xpack.synthetics.monitorConfig.section.requestConfiguration.title', {
      defaultMessage: 'Request configuration',
    }),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.section.requestConfiguration.description',
      {
        defaultMessage:
          'Configure an optional request to send to the remote host including method, body, and headers.',
      }
    ),
    components: [
      FIELD(readOnly)[ConfigKey.USERNAME],
      FIELD(readOnly)[ConfigKey.PASSWORD],
      FIELD(readOnly)[ConfigKey.REQUEST_METHOD_CHECK],
      FIELD(readOnly)[ConfigKey.REQUEST_HEADERS_CHECK],
      FIELD(readOnly)[ConfigKey.REQUEST_BODY_CHECK],
      FIELD(readOnly)[ConfigKey.PROXY_URL],
      FIELD(readOnly)[ConfigKey.PROXY_HEADERS],
      FIELD(readOnly)[ConfigKey.MODE],
      FIELD(readOnly)[ConfigKey.IPV4],
    ],
  },
  responseConfig: {
    title: i18n.translate('xpack.synthetics.monitorConfig.section.responseConfiguration.title', {
      defaultMessage: 'Response configuration',
    }),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.section.responseConfiguration.description',
      {
        defaultMessage: 'Control the indexing of the HTTP response contents.',
      }
    ),
    components: [
      FIELD(readOnly)[ConfigKey.RESPONSE_HEADERS_INDEX],
      FIELD(readOnly)[ConfigKey.RESPONSE_BODY_INDEX],
      FIELD(readOnly)[ConfigKey.RESPONSE_BODY_MAX_BYTES],
    ],
  },
  responseChecks: {
    title: i18n.translate('xpack.synthetics.monitorConfig.section.responseChecks.title', {
      defaultMessage: 'Response checks',
    }),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.section.responseChecks.description',
      {
        defaultMessage: 'Configure the expected HTTP response.',
      }
    ),
    components: [
      FIELD(readOnly)[ConfigKey.RESPONSE_STATUS_CHECK],
      FIELD(readOnly)[ConfigKey.RESPONSE_HEADERS_CHECK],
      FIELD(readOnly)[ConfigKey.RESPONSE_BODY_CHECK_POSITIVE],
      FIELD(readOnly)[ConfigKey.RESPONSE_BODY_CHECK_NEGATIVE],
      FIELD(readOnly)[ConfigKey.RESPONSE_JSON_CHECK],
    ],
  },
});

export const TCP_ADVANCED = (readOnly: boolean) => ({
  requestConfig: {
    title: i18n.translate('xpack.synthetics.monitorConfig.section.requestConfigTCP.title', {
      defaultMessage: 'Request configuration',
    }),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.section.requestConfigTCP.description',
      {
        defaultMessage: 'Configure the payload sent to the remote host.',
      }
    ),
    components: [
      FIELD(readOnly)[`${ConfigKey.PROXY_URL}__tcp`],
      FIELD(readOnly)[ConfigKey.REQUEST_SEND_CHECK],
      FIELD(readOnly)[ConfigKey.MODE],
      FIELD(readOnly)[ConfigKey.IPV4],
    ],
  },
  responseChecks: {
    title: i18n.translate('xpack.synthetics.monitorConfig.section.responseChecksTCP.title', {
      defaultMessage: 'Response checks',
    }),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.section.responseChecksTCP.description',
      {
        defaultMessage: 'Configure the expected response from the remote host.',
      }
    ),
    components: [FIELD(readOnly)[ConfigKey.RESPONSE_RECEIVE_CHECK]],
  },
});

export const ICMP_ADVANCED = (readOnly: boolean) => ({
  requestConfig: {
    title: i18n.translate('xpack.synthetics.monitorConfig.section.requestConfigICMP.title', {
      defaultMessage: 'Request configuration',
    }),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.section.requestConfigICMP.description',
      {
        defaultMessage: 'Configure the payload sent to the remote host.',
      }
    ),
    components: [FIELD(readOnly)[ConfigKey.MODE], FIELD(readOnly)[ConfigKey.IPV4]],
  },
});

export const BROWSER_ADVANCED = (readOnly: boolean) => [
  {
    title: i18n.translate('xpack.synthetics.monitorConfig.section.syntAgentOptions.title', {
      defaultMessage: 'Synthetics agent options',
    }),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.section.syntAgentOptions.description',
      {
        defaultMessage: 'Provide fine-tuned configuration for the synthetics agent.',
      }
    ),
    components: [
      FIELD(readOnly)[ConfigKey.THROTTLING_CONFIG],
      FIELD(readOnly)[ConfigKey.IGNORE_HTTPS_ERRORS],
      FIELD(readOnly)[ConfigKey.CERTIFICATE_ERROR_SPKI_ALLOWLIST],
      FIELD(readOnly)[ConfigKey.SYNTHETICS_ARGS],
      FIELD(readOnly)[ConfigKey.PLAYWRIGHT_OPTIONS],
      FIELD(readOnly)[ConfigKey.PARAMS],
    ],
  },
];

// API journeys share the synthexec runtime with browser journeys but never
// launch Chromium. Heartbeat's `api` plugin (elastic/beats#50802) silently
// strips `--throttling` / `--screenshots` / `--sandbox` from the CLI args,
// so we omit THROTTLING_CONFIG from the form to avoid offering knobs that
// do nothing. IGNORE_HTTPS_ERRORS and PLAYWRIGHT_OPTIONS are still
// forwarded because they apply to APIRequestContext.
export const API_ADVANCED = (readOnly: boolean) => [
  {
    title: i18n.translate('xpack.synthetics.monitorConfig.section.syntAgentOptions.title', {
      defaultMessage: 'Synthetics agent options',
    }),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.section.syntAgentOptions.description',
      {
        defaultMessage: 'Provide fine-tuned configuration for the synthetics agent.',
      }
    ),
    components: [
      FIELD(readOnly)[ConfigKey.IGNORE_HTTPS_ERRORS],
      FIELD(readOnly)[ConfigKey.SYNTHETICS_ARGS],
      FIELD(readOnly)[ConfigKey.PLAYWRIGHT_OPTIONS],
      FIELD(readOnly)[ConfigKey.PARAMS],
    ],
  },
];

interface AdvancedFieldGroup {
  title: string;
  description: string;
  components: Array<FieldMeta<any>>;
}

type FieldConfig = Record<
  FormMonitorType,
  {
    step1: Array<FieldMeta<any>>;
    step2: Array<FieldMeta<any>>;
    step3?: Array<FieldMeta<any>>;
    scriptEdit?: Array<FieldMeta<any>>;
    advanced?: AdvancedFieldGroup[];
  }
>;

const TLS_OPTIONS = (readOnly: boolean): AdvancedFieldGroup => ({
  title: i18n.translate('xpack.synthetics.monitorConfig.section.tlsOptions.title', {
    defaultMessage: 'TLS options',
  }),
  description: i18n.translate('xpack.synthetics.monitorConfig.section.tlsOptions.description', {
    defaultMessage:
      'Configure TLS options, including verification mode, certificate authorities, and client certificates.',
  }),
  components: [
    FIELD(readOnly).isTLSEnabled,
    FIELD(readOnly)[ConfigKey.TLS_VERIFICATION_MODE],
    FIELD(readOnly)[ConfigKey.TLS_VERSION],
    FIELD(readOnly)[ConfigKey.TLS_CERTIFICATE_AUTHORITIES],
    FIELD(readOnly)[ConfigKey.TLS_CERTIFICATE],
    FIELD(readOnly)[ConfigKey.TLS_KEY],
    FIELD(readOnly)[ConfigKey.TLS_KEY_PASSPHRASE],
  ],
});

const KIBANA_SPACES_OPTIONS = (readOnly: boolean): AdvancedFieldGroup => ({
  title: i18n.translate('xpack.synthetics.monitorConfig.section.kibanaSpaces.title', {
    defaultMessage: 'Kibana Spaces',
  }),
  description: i18n.translate('xpack.synthetics.monitorConfig.kibanaSpaces.description', {
    defaultMessage:
      'Select the Kibana spaces where this monitor should be available. Current space should always be part of list, unless All spaces is selected.',
  }),
  components: [FIELD(readOnly)[ConfigKey.KIBANA_SPACES]],
});

export const FORM_CONFIG = (readOnly: boolean): FieldConfig => ({
  [FormMonitorType.HTTP]: {
    step1: [FIELD(readOnly)[ConfigKey.FORM_MONITOR_TYPE]],
    step2: [
      FIELD(readOnly)[`${ConfigKey.URLS}__http`],
      FIELD(readOnly)[ConfigKey.NAME],
      FIELD(readOnly)[ConfigKey.LOCATIONS],
      FIELD(readOnly)[`${ConfigKey.SCHEDULE}.number`],
      FIELD(readOnly)[ConfigKey.MAX_REDIRECTS],
      FIELD(readOnly)[ConfigKey.TIMEOUT],
      FIELD(readOnly)[ConfigKey.ENABLED],
      FIELD(readOnly)[ConfigKey.MAX_ATTEMPTS],
      FIELD(readOnly)[AlertConfigKey.STATUS_ENABLED],
      FIELD(readOnly)[AlertConfigKey.TLS_ENABLED],
    ],
    advanced: [
      DEFAULT_DATA_OPTIONS(readOnly),
      MAINTENANCE_WINDOWS_OPTIONS(readOnly),
      HTTP_ADVANCED(readOnly).requestConfig,
      HTTP_ADVANCED(readOnly).responseConfig,
      HTTP_ADVANCED(readOnly).responseChecks,
      TLS_OPTIONS(readOnly),
      KIBANA_SPACES_OPTIONS(readOnly),
    ],
  },
  [FormMonitorType.TCP]: {
    step1: [FIELD(readOnly)[ConfigKey.FORM_MONITOR_TYPE]],
    step2: [
      FIELD(readOnly)[`${ConfigKey.HOSTS}__tcp`],
      FIELD(readOnly)[ConfigKey.NAME],
      FIELD(readOnly)[ConfigKey.LOCATIONS],
      FIELD(readOnly)[`${ConfigKey.SCHEDULE}.number`],
      FIELD(readOnly)[ConfigKey.TIMEOUT],
      FIELD(readOnly)[ConfigKey.ENABLED],
      FIELD(readOnly)[ConfigKey.MAX_ATTEMPTS],
      FIELD(readOnly)[AlertConfigKey.STATUS_ENABLED],
      FIELD(readOnly)[AlertConfigKey.TLS_ENABLED],
    ],
    advanced: [
      DEFAULT_DATA_OPTIONS(readOnly),
      MAINTENANCE_WINDOWS_OPTIONS(readOnly),
      TCP_ADVANCED(readOnly).requestConfig,
      TCP_ADVANCED(readOnly).responseChecks,
      TLS_OPTIONS(readOnly),
      KIBANA_SPACES_OPTIONS(readOnly),
    ],
  },
  [FormMonitorType.MULTISTEP]: {
    step1: [FIELD(readOnly)[ConfigKey.FORM_MONITOR_TYPE]],
    step2: [
      FIELD(readOnly)[ConfigKey.NAME],
      FIELD(readOnly)[ConfigKey.LOCATIONS],
      FIELD(readOnly)[`${ConfigKey.SCHEDULE}.number`],
      FIELD(readOnly)[ConfigKey.ENABLED],
      FIELD(readOnly)[ConfigKey.MAX_ATTEMPTS],
      FIELD(readOnly)[AlertConfigKey.STATUS_ENABLED],
    ],
    step3: [FIELD(readOnly)['source.inline'], FIELD(readOnly)[ConfigKey.PARAMS]],
    scriptEdit: [FIELD(readOnly)['source.inline'], FIELD(readOnly)[ConfigKey.PARAMS]],
    advanced: [
      {
        ...DEFAULT_DATA_OPTIONS(readOnly),
        components: [
          FIELD(readOnly)[ConfigKey.TAGS],
          FIELD(readOnly)[ConfigKey.LABELS],
          FIELD(readOnly)[ConfigKey.APM_SERVICE_NAME],
          FIELD(readOnly)[ConfigKey.SCREENSHOTS],
          FIELD(readOnly)[ConfigKey.NAMESPACE],
        ],
      },
      MAINTENANCE_WINDOWS_OPTIONS(readOnly),
      ...BROWSER_ADVANCED(readOnly),
      KIBANA_SPACES_OPTIONS(readOnly),
    ],
  },
  [FormMonitorType.API]: {
    step1: [FIELD(readOnly)[ConfigKey.FORM_MONITOR_TYPE]],
    step2: [
      FIELD(readOnly)[ConfigKey.NAME],
      {
        ...FIELD(readOnly)[ConfigKey.LOCATIONS],
        helpText: API_PRIVATE_LOCATIONS_ONLY,
      },
      FIELD(readOnly)[`${ConfigKey.SCHEDULE}.number`],
      FIELD(readOnly)[ConfigKey.ENABLED],
      FIELD(readOnly)[ConfigKey.MAX_ATTEMPTS],
      FIELD(readOnly)[AlertConfigKey.STATUS_ENABLED],
    ],
    step3: [FIELD(readOnly)['source.inline'], FIELD(readOnly)[ConfigKey.PARAMS]],
    scriptEdit: [FIELD(readOnly)['source.inline'], FIELD(readOnly)[ConfigKey.PARAMS]],
    advanced: [
      {
        ...DEFAULT_DATA_OPTIONS(readOnly),
        components: [
          FIELD(readOnly)[ConfigKey.TAGS],
          FIELD(readOnly)[ConfigKey.LABELS],
          FIELD(readOnly)[ConfigKey.APM_SERVICE_NAME],
          FIELD(readOnly)[ConfigKey.NAMESPACE],
        ],
      },
      MAINTENANCE_WINDOWS_OPTIONS(readOnly),
      ...API_ADVANCED(readOnly),
      KIBANA_SPACES_OPTIONS(readOnly),
    ],
  },
  [FormMonitorType.SINGLE]: {
    step1: [FIELD(readOnly)[ConfigKey.FORM_MONITOR_TYPE]],
    step2: [
      FIELD(readOnly)[`${ConfigKey.URLS}__single`],
      FIELD(readOnly)[ConfigKey.NAME],
      FIELD(readOnly)[ConfigKey.TEXT_ASSERTION],
      FIELD(readOnly)[ConfigKey.LOCATIONS],
      FIELD(readOnly)[`${ConfigKey.SCHEDULE}.number`],
      FIELD(readOnly)[ConfigKey.ENABLED],
      FIELD(readOnly)[ConfigKey.MAX_ATTEMPTS],
      FIELD(readOnly)[AlertConfigKey.STATUS_ENABLED],
    ],
    advanced: [
      {
        ...DEFAULT_DATA_OPTIONS(readOnly),
        components: [
          FIELD(readOnly)[ConfigKey.TAGS],
          FIELD(readOnly)[ConfigKey.LABELS],
          FIELD(readOnly)[ConfigKey.APM_SERVICE_NAME],
          FIELD(readOnly)[ConfigKey.SCREENSHOTS],
          FIELD(readOnly)[ConfigKey.NAMESPACE],
        ],
      },
      MAINTENANCE_WINDOWS_OPTIONS(readOnly),
      ...BROWSER_ADVANCED(readOnly),
      KIBANA_SPACES_OPTIONS(readOnly),
    ],
  },
  [FormMonitorType.ICMP]: {
    step1: [FIELD(readOnly)[ConfigKey.FORM_MONITOR_TYPE]],
    step2: [
      FIELD(readOnly)[`${ConfigKey.HOSTS}__icmp`],
      FIELD(readOnly)[ConfigKey.NAME],
      FIELD(readOnly)[ConfigKey.LOCATIONS],
      FIELD(readOnly)[`${ConfigKey.SCHEDULE}.number`],
      FIELD(readOnly)[ConfigKey.WAIT],
      FIELD(readOnly)[ConfigKey.TIMEOUT],
      FIELD(readOnly)[ConfigKey.ENABLED],
      FIELD(readOnly)[ConfigKey.MAX_ATTEMPTS],
      FIELD(readOnly)[AlertConfigKey.STATUS_ENABLED],
    ],
    advanced: [
      DEFAULT_DATA_OPTIONS(readOnly),
      MAINTENANCE_WINDOWS_OPTIONS(readOnly),
      ICMP_ADVANCED(readOnly).requestConfig,
      KIBANA_SPACES_OPTIONS(readOnly),
    ],
  },
});
