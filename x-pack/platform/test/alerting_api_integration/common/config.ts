/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import path from 'path';
import getPort from 'get-port';
import { CA_CERT_PATH } from '@kbn/dev-utils';
import type { FtrConfigProviderContext } from '@kbn/test';
import { findTestPluginPaths } from '@kbn/test';
import { ScoutTestRunConfigCategory } from '@kbn/scout-info';
import { getAllExternalServiceSimulatorPaths } from '@kbn/actions-simulators-plugin/server/plugin';
import type { ExperimentalConfigKeys } from '@kbn/stack-connectors-plugin/common/experimental_features';
import { CONNECTOR_ID as SENTINELONE_CONNECTOR_ID } from '@kbn/connector-schemas/sentinelone/constants';
import { CONNECTOR_ID as CROWDSTRIKE_CONNECTOR_ID } from '@kbn/connector-schemas/crowdstrike/constants';
import { CONNECTOR_ID as MICROSOFT_DEFENDER_ENDPOINT_CONNECTOR_ID } from '@kbn/connector-schemas/microsoft_defender_endpoint/constants';
import { services } from './services';
import { getTlsWebhookServerUrls } from './lib/get_tls_webhook_servers';

interface CreateTestConfigOptions {
  license: string;
  disabledPlugins?: string[];
  ssl?: boolean;
  enableActionsProxy: boolean;
  verificationMode?: 'full' | 'none' | 'certificate';
  publicBaseUrl?: boolean;
  preconfiguredAlertHistoryEsIndex?: boolean;
  customizeLocalHostSsl?: boolean;
  rejectUnauthorized?: boolean; // legacy
  emailDomainsAllowed?: string[];
  emailRecipientAllowlist?: string[];
  testFiles?: string[];
  reportName?: string;
  useDedicatedTaskRunner: boolean;
  enableFooterInEmail?: boolean;
  maxScheduledPerMinute?: number;
  experimentalFeatures?: ExperimentalConfigKeys;
  disabledRuleTypes?: string[];
  enabledRuleTypes?: string[];
  maxAlerts?: number;
  emailMaximumBodyLength?: number;
  indexRefreshInterval?: string | false;
  ruleChangeTrackingScope?: string[];
}

// test.not-enabled is specifically not enabled
const enabledActionTypes = [
  '.bedrock',
  '.cases-webhook',
  '.email',
  '.gemini',
  '.index',
  '.opsgenie',
  '.pagerduty',
  '.swimlane',
  '.server-log',
  '.servicenow',
  '.servicenow-sir',
  '.servicenow-itom',
  '.jira',
  '.jira-service-management',
  '.resilient',
  '.gen-ai',
  '.d3security',
  SENTINELONE_CONNECTOR_ID,
  CROWDSTRIKE_CONNECTOR_ID,
  MICROSOFT_DEFENDER_ENDPOINT_CONNECTOR_ID,
  '.slack',
  '.slack_api',
  '.thehive',
  '.tines',
  '.webhook',
  '.http',
  '.xmatters',
  '.xsoar',
  '.torq',
  'test.sub-action-connector',
  'test.sub-action-connector-without-sub-actions',
  'test.authorization',
  'test.failing',
  'test.index-record',
  'test.noop',
  'test.delayed',
  'test.rate-limit',
  'test.no-attempts-rate-limit',
  'test.throw',
  'test.excluded',
  'test.capped',
  'test.system-action',
  'test.system-action-kibana-privileges',
  'test.system-action-connector-adapter',
  'test.connector-with-hooks',
  'test.deprecated',
  'test.single_file_connector',
  'test.oauth-connector',
  'test.oauth-executor',
];

export const getPreConfiguredActions = (
  tlsWebhookServers: Awaited<ReturnType<typeof getTlsWebhookServerUrls>>
) =>
  JSON.stringify({
    'my-test-email': {
      actionTypeId: '.email',
      name: 'TestEmail#xyz',
      config: {
        from: 'me@test.com',
        service: '__json',
      },
      secrets: {
        user: 'user',
        password: 'password',
      },
    },
    'notification-email': {
      actionTypeId: '.email',
      name: 'Notification Email Connector',
      config: {
        from: 'me@test.com',
        service: '__json',
      },
      secrets: {
        user: 'user',
        password: 'password',
      },
    },
    'my-slack1': {
      actionTypeId: '.slack',
      name: 'Slack#xyz',
      secrets: {
        webhookUrl: 'https://hooks.slack.com/services/abcd/efgh/ijklmnopqrstuvwxyz',
      },
    },
    'my-deprecated-servicenow': {
      actionTypeId: '.servicenow',
      name: 'ServiceNow#xyz',
      config: {
        apiUrl: 'https://ven04334.service-now.com',
        usesTableApi: true,
      },
      secrets: {
        username: 'elastic_integration',
        password: 'somepassword',
      },
    },
    'my-deprecated-servicenow-default': {
      actionTypeId: '.servicenow',
      name: 'ServiceNow#xyz',
      config: {
        apiUrl: 'https://ven04334.service-now.com',
      },
      secrets: {
        username: 'elastic_integration',
        password: 'somepassword',
      },
    },
    'custom-system-abc-connector': {
      actionTypeId: 'system-abc-action-type',
      name: 'SystemABC',
      config: {
        xyzConfig1: 'value1',
        xyzConfig2: 'value2',
        listOfThings: ['a', 'b', 'c', 'd'],
      },
      secrets: {
        xyzSecret1: 'credential1',
        xyzSecret2: 'credential2',
      },
    },
    'preconfigured-es-index-action': {
      actionTypeId: '.index',
      name: 'preconfigured_es_index_action',
      config: {
        index: 'functional-test-actions-index-preconfigured',
        refresh: true,
        executionTimeField: 'timestamp',
      },
    },
    'preconfigured.test.index-record': {
      actionTypeId: 'test.index-record',
      name: 'Test:_Preconfigured_Index_Record',
      config: {
        unencrypted: 'ignored-but-required',
      },
      secrets: {
        encrypted: 'this-is-also-ignored-and-also-required',
      },
    },
    'custom.ssl.noCustom': {
      actionTypeId: '.webhook',
      name: `${tlsWebhookServers.noCustom}`,
      config: {
        url: tlsWebhookServers.noCustom,
      },
    },
    'custom.ssl.rejectUnauthorizedFalse': {
      actionTypeId: '.webhook',
      name: `${tlsWebhookServers.rejectUnauthorizedFalse}`,
      config: {
        url: tlsWebhookServers.rejectUnauthorizedFalse,
      },
    },
    'custom.ssl.rejectUnauthorizedTrue': {
      actionTypeId: '.webhook',
      name: `${tlsWebhookServers.rejectUnauthorizedTrue}`,
      config: {
        url: tlsWebhookServers.rejectUnauthorizedTrue,
      },
    },
    'custom.ssl.caFile': {
      actionTypeId: '.webhook',
      name: `${tlsWebhookServers.caFile}`,
      config: {
        url: tlsWebhookServers.caFile,
      },
    },
  });

export function createTestConfig(name: string, options: CreateTestConfigOptions) {
  const {
    license = 'trial',
    disabledPlugins = [],
    ssl = false,
    verificationMode = 'full',
    preconfiguredAlertHistoryEsIndex = false,
    customizeLocalHostSsl = false,
    emailDomainsAllowed = undefined,
    emailRecipientAllowlist = undefined,
    testFiles = undefined,
    reportName = undefined,
    useDedicatedTaskRunner,
    enableFooterInEmail = true,
    maxScheduledPerMinute,
    experimentalFeatures = [],
    maxAlerts = 20,
    indexRefreshInterval,
    ruleChangeTrackingScope,
  } = options;

  return async ({ readConfigFile }: FtrConfigProviderContext) => {
    const xPackApiIntegrationTestsConfig = await readConfigFile(
      require.resolve('../../api_integration/config.ts')
    );
    const servers = {
      ...xPackApiIntegrationTestsConfig.get('servers'),
      elasticsearch: {
        ...xPackApiIntegrationTestsConfig.get('servers.elasticsearch'),
        protocol: ssl ? 'https' : 'http',
      },
    };

    const proxyPort =
      process.env.ALERTING_PROXY_PORT ?? (await getPort({ port: getPort.makeRange(6200, 6299) }));

    // Create URLs of identical simple webhook servers using TLS, but we'll
    // create custom host settings for them below.
    const tlsWebhookServers = await getTlsWebhookServerUrls(6300, 6399);

    // If testing with proxy, also test proxyOnlyHosts for this proxy;
    // all the actions are assumed to be acccessing localhost anyway.
    // If not testing with proxy, set a bogus proxy up, and set the bypass
    // flag for all our localhost actions to bypass it.  Currently,
    // security_and_spaces uses enableActionsProxy: true, and spaces_only
    // uses enableActionsProxy: false.
    const proxyHosts = ['localhost', 'some.non.existent.com'];
    const actionsProxyUrl = options.enableActionsProxy
      ? [
          `--xpack.actions.proxyUrl=http://localhost:${proxyPort}`,
          `--xpack.actions.proxyOnlyHosts=${JSON.stringify(proxyHosts)}`,
        ]
      : [
          `--xpack.actions.proxyUrl=http://elastic.co`,
          `--xpack.actions.proxyBypassHosts=${JSON.stringify(proxyHosts)}`,
        ];

    // set up custom host settings for webhook ports; don't set one for noCustom
    const customHostSettingsValue = [
      {
        url: tlsWebhookServers.rejectUnauthorizedFalse,
        ssl: {
          verificationMode: 'none',
        },
      },
      {
        url: tlsWebhookServers.rejectUnauthorizedTrue,
        ssl: {
          verificationMode: 'full',
        },
      },
      {
        url: tlsWebhookServers.caFile,
        ssl: {
          verificationMode: 'certificate',
          certificateAuthoritiesFiles: [CA_CERT_PATH],
        },
      },
    ];
    const customHostSettings = customizeLocalHostSsl
      ? [`--xpack.actions.customHostSettings=${JSON.stringify(customHostSettingsValue)}`]
      : [];

    let emailSettings = emailDomainsAllowed
      ? [`--xpack.actions.email.domain_allowlist=${JSON.stringify(emailDomainsAllowed)}`]
      : [];

    emailSettings = emailRecipientAllowlist
      ? [
          ...emailSettings,
          `--xpack.actions.email.recipient_allowlist=${JSON.stringify(emailRecipientAllowlist)}`,
        ]
      : emailSettings;

    const maxScheduledPerMinuteSettings =
      typeof maxScheduledPerMinute === 'number'
        ? [`--xpack.alerting.rules.maxScheduledPerMinute=${maxScheduledPerMinute}`]
        : [];

    const disabledRuleTypesSetting =
      options.disabledRuleTypes == null
        ? []
        : [`--xpack.alerting.disabledRuleTypes=${JSON.stringify(options.disabledRuleTypes)}`];

    const enabledRuleTypesSetting =
      options.enabledRuleTypes == null
        ? []
        : [`--xpack.alerting.enabledRuleTypes=${JSON.stringify(options.enabledRuleTypes)}`];

    const emailMaximumBodyLengthSetting =
      options.emailMaximumBodyLength == null
        ? []
        : [`--xpack.actions.email.maximum_body_length=${options.emailMaximumBodyLength}`];

    const ruleChangeTrackingSettings = ruleChangeTrackingScope
      ? [`--xpack.alerting.ruleChangeTracking.scope=${JSON.stringify(ruleChangeTrackingScope)}`]
      : [];

    return {
      testConfigCategory: ScoutTestRunConfigCategory.API_TEST,
      testFiles: testFiles ? testFiles : [require.resolve(`../${name}/tests/`)],
      servers,
      services,
      junit: {
        reportName: reportName ? reportName : 'X-Pack Alerting API Integration Tests',
      },
      esTestCluster: {
        ...xPackApiIntegrationTestsConfig.get('esTestCluster'),
        license,
        ssl,
        serverArgs: [
          `xpack.license.self_generated.type=${license}`,
          `xpack.security.enabled=${
            !disabledPlugins.includes('security') && ['trial', 'basic'].includes(license)
          }`,
        ],
      },
      kbnTestServer: {
        ...xPackApiIntegrationTestsConfig.get('kbnTestServer'),
        useDedicatedTaskRunner,
        serverArgs: [
          ...xPackApiIntegrationTestsConfig.get('kbnTestServer.serverArgs'),
          ...(options.publicBaseUrl ? ['--server.publicBaseUrl=https://localhost:5601'] : []),
          `--xpack.actions.allowedHosts=${JSON.stringify([
            'localhost',
            '127.0.0.1',
            'some.non.existent.com',
            'smtp-mail.outlook.com',
            'slack.com',
          ])}`,
          `--xpack.actions.enableFooterInEmail=${enableFooterInEmail}`,
          '--xpack.encryptedSavedObjects.encryptionKey="wuGNaIhoMpk5sO4UBxgr3NyW1sFcLgIf"',
          '--xpack.alerting.invalidateApiKeysTask.removalDelay="1s"',
          // Task Manager keeps the keys it granted queued for an hour by default, which is longer
          // than any test can wait for a key to actually be revoked.
          '--xpack.task_manager.invalidate_api_key_task.removalDelay="1s"',
          '--xpack.alerting.healthCheck.interval="1s"',
          '--xpack.alerting.rules.minimumScheduleInterval.value="1s"',
          `--xpack.alerting.rules.run.alerts.max=${maxAlerts}`,
          `--xpack.alerting.rules.run.actions.connectorTypeOverrides=${JSON.stringify([
            { id: 'test.capped', max: '1' },
          ])}`,
          `--xpack.alerting.enableFrameworkAlerts=true`,
          `--xpack.alerting.rulesSettings.cacheInterval=10000`,
          `--xpack.actions.enabledActionTypes=${JSON.stringify(enabledActionTypes)}`,
          `--xpack.actions.microsoftGraphApiUrl=${servers.kibana.protocol}://${servers.kibana.hostname}:${servers.kibana.port}/api/_actions-FTS-external-service-simulators/exchange/users/test@/sendMail`,
          `--xpack.actions.ssl.verificationMode=${verificationMode}`,
          ...actionsProxyUrl,
          ...customHostSettings,
          ...emailSettings,
          ...maxScheduledPerMinuteSettings,
          ...disabledRuleTypesSetting,
          ...enabledRuleTypesSetting,
          ...emailMaximumBodyLengthSetting,
          ...ruleChangeTrackingSettings,
          '--xpack.eventLog.logEntries=true',
          `--xpack.task_manager.unsafe.exclude_task_types=${JSON.stringify([
            'actions:test.excluded',
          ])}`,
          `--xpack.actions.preconfiguredAlertHistoryEsIndex=${preconfiguredAlertHistoryEsIndex}`,
          `--xpack.actions.preconfigured=${getPreConfiguredActions(tlsWebhookServers)}`,
          ...disabledPlugins
            .filter((k) => k !== 'security')
            .map((key) => `--xpack.${key}.enabled=false`),
          ...findTestPluginPaths(path.resolve(__dirname, 'plugins')),
          `--server.xsrf.allowlist=${JSON.stringify(getAllExternalServiceSimulatorPaths())}`,
          ...(ssl
            ? [
                `--elasticsearch.hosts=${servers.elasticsearch.protocol}://${servers.elasticsearch.hostname}:${servers.elasticsearch.port}`,
                `--elasticsearch.ssl.certificateAuthorities=${CA_CERT_PATH}`,
              ]
            : []),
          '--notifications.connectors.default.email=notification-email',
          '--xpack.task_manager.allow_reading_invalid_state=false',
          '--xpack.actions.queued.max=500',
          `--xpack.stack_connectors.enableExperimental=${JSON.stringify(experimentalFeatures)}`,
          '--xpack.uptime.service.password=test',
          '--xpack.uptime.service.username=localKibanaIntegrationTestsUser',
          '--xpack.uptime.service.devUrl=mockDevUrl',
          '--xpack.uptime.service.manifestUrl=mockDevUrl',
        ],
      },
      indexRefreshInterval,
    };
  };
}
