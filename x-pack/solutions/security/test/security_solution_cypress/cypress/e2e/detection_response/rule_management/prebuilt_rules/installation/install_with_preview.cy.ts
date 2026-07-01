/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { omit } from 'lodash';
import type { Filter } from '@kbn/es-query';
import type { PrebuiltRuleAsset } from '@kbn/security-solution-plugin/server/lib/detection_engine/prebuilt_rules';
import type {
  Threshold,
  AlertSuppression,
} from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema';
import { type ThreatMapping } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema';
import { expectRulesInTable } from '../../../../../tasks/alerts_detection_rules';
import { createRuleAssetSavedObject } from '../../../../../helpers/rules';
import {
  INSTALL_PREBUILT_RULE_BUTTON,
  INSTALL_PREBUILT_RULE_PREVIEW,
  RULES_MANAGEMENT_TABLE,
} from '../../../../../screens/alerts_detection_rules';
import { RULE_MANAGEMENT_PAGE_BREADCRUMB } from '../../../../../screens/breadcrumbs';
import {
  installMockPrebuiltRulesPackage,
  installPrebuiltRuleAssets,
} from '../../../../../tasks/api_calls/prebuilt_rules';
import { createSavedQuery, deleteSavedQueries } from '../../../../../tasks/api_calls/saved_queries';
import { fetchMachineLearningModules } from '../../../../../tasks/api_calls/machine_learning';
import { resetRulesTableState } from '../../../../../tasks/common';
import { login } from '../../../../../tasks/login';
import {
  assertRuleInstallationSuccessToastShown,
  assertRulesNotPresentInAddPrebuiltRulesTable,
  clickAddElasticRulesButton,
} from '../../../../../tasks/prebuilt_rules';
import {
  assertAlertSuppressionPropertiesShown,
  assertCommonPropertiesShown,
  assertCustomQueryPropertyShown,
  assertDataViewPropertiesShown,
  assertEqlQueryPropertyShown,
  assertEsqlQueryPropertyShown,
  assertFiltersPropertyShown,
  assertIndexPropertyShown,
  assertMachineLearningPropertiesShown,
  assertNewTermsFieldsPropertyShown,
  assertSavedQueryPropertiesShown,
  assertThreatMatchQueryPropertiesShown,
  assertThresholdPropertyShown,
  assertWindowSizePropertyShown,
  closePrebuiltRuleInstallFlyout,
  openPrebuiltRuleInstallFlyoutFor,
} from '../../../../../tasks/prebuilt_rules_preview';
import {
  visitAddRulesPage,
  visitAddRulesPageWithRuleId,
} from '../../../../../tasks/rules_management';
import {
  deleteAlertsAndRules,
  deleteDataView,
  deletePrebuiltRulesAssets,
  postDataView,
} from '../../../../../tasks/api_calls/common';

describe(
  'Detection rules, Prebuilt Rules Installation workflow',
  { tags: ['@ess', '@serverless', '@skipInServerlessMKI'] },
  () => {
    before(() => {
      installMockPrebuiltRulesPackage();
    });

    beforeEach(() => {
      resetRulesTableState();
      deletePrebuiltRulesAssets();
      deleteAlertsAndRules();

      login();
    });

    describe('basic functionality', () => {
      const PREBUILT_RULE_NAME = 'Test Prebuilt rule';
      const PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
        name: PREBUILT_RULE_NAME,
        rule_id: 'test-prebuilt-rule',
      });
      // We require an extra prebuilt rule to test prebuilt rule installation
      // when it's not the last one.
      const ANOTHER_PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
        name: 'Another prebuilt rule',
        rule_id: 'test-another-prebuilt-rule',
      });

      it('previews a prebuilt rule available for installation', () => {
        installPrebuiltRuleAssets([PREBUILT_RULE_ASSET, ANOTHER_PREBUILT_RULE_ASSET]);
        visitAddRulesPage();

        openPrebuiltRuleInstallFlyoutFor(PREBUILT_RULE_NAME);
        cy.contains(INSTALL_PREBUILT_RULE_PREVIEW, PREBUILT_RULE_NAME).should('be.visible');

        closePrebuiltRuleInstallFlyout();
        cy.contains(INSTALL_PREBUILT_RULE_PREVIEW, PREBUILT_RULE_NAME).should('not.exist');
      });

      it('auto-opens the install flyout from a rule_id deep link and clears it from the URL on close', () => {
        const ruleId = PREBUILT_RULE_ASSET['security-rule'].rule_id;
        installPrebuiltRuleAssets([PREBUILT_RULE_ASSET, ANOTHER_PREBUILT_RULE_ASSET]);

        // Navigate straight to the rule's deep link (e.g. from a chat recommendation).
        visitAddRulesPageWithRuleId(ruleId);

        // The preview flyout opens automatically for the deep-linked rule.
        cy.contains(INSTALL_PREBUILT_RULE_PREVIEW, PREBUILT_RULE_NAME).should('be.visible');
        cy.url().should('include', ruleId);

        // Closing the flyout strips the rule_id back out of the URL.
        closePrebuiltRuleInstallFlyout();
        cy.url().should('not.contain', ruleId);
      });

      it('installs a prebuilt rule after previewing', () => {
        installPrebuiltRuleAssets([PREBUILT_RULE_ASSET, ANOTHER_PREBUILT_RULE_ASSET]);
        visitAddRulesPage();

        openPrebuiltRuleInstallFlyoutFor(PREBUILT_RULE_NAME);
        cy.get(INSTALL_PREBUILT_RULE_BUTTON).click();
        assertRuleInstallationSuccessToastShown([PREBUILT_RULE_ASSET]);

        // Go back to rules table and assert that the rules are installed
        cy.get(RULE_MANAGEMENT_PAGE_BREADCRUMB).click();
        expectRulesInTable(RULES_MANAGEMENT_TABLE, [PREBUILT_RULE_NAME]);

        clickAddElasticRulesButton();
        assertRulesNotPresentInAddPrebuiltRulesTable([PREBUILT_RULE_ASSET]);
      });

      it('hides tabs and sections without content', () => {
        const ruleName = 'Rule with hidden tabs and sections';
        const RULE_WITHOUT_INVESTIGATION_AND_SETUP_GUIDES = createRuleAssetSavedObject({
          name: ruleName,
          rule_id: 'prebuilt_rule_without_investigation_and_setup_guides',
          setup: undefined,
          note: undefined,
        });

        installPrebuiltRuleAssets([
          RULE_WITHOUT_INVESTIGATION_AND_SETUP_GUIDES,
          ANOTHER_PREBUILT_RULE_ASSET,
        ]);
        visitAddRulesPage();

        openPrebuiltRuleInstallFlyoutFor(ruleName);

        cy.get(INSTALL_PREBUILT_RULE_PREVIEW).contains('Investigation guide').should('not.exist');
        cy.get(INSTALL_PREBUILT_RULE_PREVIEW).contains('Setup guide').should('not.exist');
      });
    });

    describe('preview prebuilt rule information', () => {
      it('shows custom query rule properties', () => {
        installPrebuiltRuleAssets([CUSTOM_QUERY_PREBUILT_RULE_ASSET]);
        visitAddRulesPage();

        openPrebuiltRuleInstallFlyoutFor(CUSTOM_QUERY_PREBUILT_RULE_ASSET['security-rule'].name);

        assertCommonPropertiesShown(commonProperties);

        const { index } = CUSTOM_QUERY_PREBUILT_RULE_ASSET['security-rule'] as {
          index: string[];
        };
        assertIndexPropertyShown(index);

        const { query } = CUSTOM_QUERY_PREBUILT_RULE_ASSET['security-rule'] as {
          query: string;
        };
        assertCustomQueryPropertyShown(query);

        const { filters: queryFilters } = CUSTOM_QUERY_PREBUILT_RULE_ASSET['security-rule'] as {
          filters: Filter[];
        };
        assertFiltersPropertyShown(queryFilters);

        const { alert_suppression: alertSuppression } = CUSTOM_QUERY_PREBUILT_RULE_ASSET[
          'security-rule'
        ] as { alert_suppression: AlertSuppression };
        assertAlertSuppressionPropertiesShown(alertSuppression);
      });

      it('shows saved query rule properties', () => {
        const testSavedQuery = {
          query: 'agent.id: *',
          name: 'My test saved query',
          filterKey: 'agent.hostname',
        };
        const testDataView = {
          indexPattern: 'test-*',
          name: 'My test data view',
          id: 'my-test-data-view-id',
        };

        deleteDataView(testDataView.id);
        postDataView(testDataView.indexPattern, testDataView.name, testDataView.id);

        deleteSavedQueries();
        createSavedQuery(testSavedQuery.name, testSavedQuery.query, testSavedQuery.filterKey)
          .its('body.id')
          .then((id: string) => {
            (SAVED_QUERY_PREBUILT_RULE_ASSET['security-rule'] as { saved_id: string }).saved_id =
              id;

            installPrebuiltRuleAssets([SAVED_QUERY_PREBUILT_RULE_ASSET]);
            visitAddRulesPage();

            openPrebuiltRuleInstallFlyoutFor(SAVED_QUERY_PREBUILT_RULE_ASSET['security-rule'].name);

            const { data_view_id: dataViewId } = SAVED_QUERY_PREBUILT_RULE_ASSET[
              'security-rule'
            ] as {
              data_view_id: string;
            };
            assertDataViewPropertiesShown(dataViewId, testDataView.indexPattern);

            assertSavedQueryPropertiesShown(
              testSavedQuery.query,
              testSavedQuery.filterKey,
              testSavedQuery.name
            );
          });
      });

      it('shows machine learning rule properties', function () {
        fetchMachineLearningModules()
          .its('body')
          .then((mlModules) => {
            installPrebuiltRuleAssets([MACHINE_LEARNING_PREBUILT_RULE_ASSET]);
            visitAddRulesPage();

            const {
              name,
              alert_suppression: alertSuppression,
              anomaly_threshold: anomalyThreshold,
              machine_learning_job_id: machineLearningJobIds,
            } = MACHINE_LEARNING_PREBUILT_RULE_ASSET['security-rule'] as {
              name: string;
              anomaly_threshold: number;
              machine_learning_job_id: string[];
              alert_suppression: AlertSuppression;
            };

            openPrebuiltRuleInstallFlyoutFor(name);

            assertCommonPropertiesShown(commonProperties);

            assertMachineLearningPropertiesShown(
              anomalyThreshold,
              machineLearningJobIds,
              mlModules
            );

            assertAlertSuppressionPropertiesShown(alertSuppression);
          });
      });

      it('shows threshold rule properties', () => {
        installPrebuiltRuleAssets([THRESHOLD_RULE_PREBUILT_ASSET]);
        visitAddRulesPage();

        openPrebuiltRuleInstallFlyoutFor(THRESHOLD_RULE_PREBUILT_ASSET['security-rule'].name);

        assertCommonPropertiesShown(commonProperties);

        const { threshold } = THRESHOLD_RULE_PREBUILT_ASSET['security-rule'] as {
          threshold: Threshold;
        };
        assertThresholdPropertyShown(threshold);

        const { index } = THRESHOLD_RULE_PREBUILT_ASSET['security-rule'] as {
          index: string[];
        };
        assertIndexPropertyShown(index);

        const { query } = THRESHOLD_RULE_PREBUILT_ASSET['security-rule'] as { query: string };
        assertCustomQueryPropertyShown(query);

        const { filters: queryFilters } = THRESHOLD_RULE_PREBUILT_ASSET['security-rule'] as {
          filters: Filter[];
        };
        assertFiltersPropertyShown(queryFilters);
      });

      it('shows EQL rule properties', () => {
        installPrebuiltRuleAssets([EQL_PREBUILT_RULE_ASSET]);
        visitAddRulesPage();

        openPrebuiltRuleInstallFlyoutFor(EQL_PREBUILT_RULE_ASSET['security-rule'].name);

        assertCommonPropertiesShown(commonProperties);

        const { query } = EQL_PREBUILT_RULE_ASSET['security-rule'] as { query: string };
        assertEqlQueryPropertyShown(query);

        const { filters: queryFilters } = EQL_PREBUILT_RULE_ASSET['security-rule'] as {
          filters: Filter[];
        };
        assertFiltersPropertyShown(queryFilters);
      });

      it('shows indicator match rule properties', () => {
        installPrebuiltRuleAssets([THREAT_MATCH_PREBUILT_RULE_ASSET]);
        visitAddRulesPage();

        openPrebuiltRuleInstallFlyoutFor(THREAT_MATCH_PREBUILT_RULE_ASSET['security-rule'].name);

        assertCommonPropertiesShown(commonProperties);

        const {
          threat_index: threatIndex,
          threat_mapping: threatMapping,
          threat_filters: threatFilters,
          threat_query: threatQuery,
        } = THREAT_MATCH_PREBUILT_RULE_ASSET['security-rule'] as {
          threat_index: string[];
          threat_mapping: ThreatMapping;
          threat_filters: Filter[];
          threat_query: string;
        };
        assertThreatMatchQueryPropertiesShown({
          threatIndex,
          threatMapping,
          threatFilters,
          threatQuery,
        });

        const { filters: queryFilters } = THREAT_MATCH_PREBUILT_RULE_ASSET['security-rule'] as {
          filters: Filter[];
        };
        assertFiltersPropertyShown(queryFilters);

        const { index } = THREAT_MATCH_PREBUILT_RULE_ASSET['security-rule'] as {
          index: string[];
        };
        assertIndexPropertyShown(index);

        const { query } = THREAT_MATCH_PREBUILT_RULE_ASSET['security-rule'] as {
          query: string;
        };
        assertCustomQueryPropertyShown(query);
      });

      it('shows new terms rule properties', () => {
        installPrebuiltRuleAssets([NEW_TERMS_PREBUILT_RULE_ASSET]);
        visitAddRulesPage();

        openPrebuiltRuleInstallFlyoutFor(NEW_TERMS_PREBUILT_RULE_ASSET['security-rule'].name);

        assertCommonPropertiesShown(commonProperties);

        const { new_terms_fields: newTermsFields } = NEW_TERMS_PREBUILT_RULE_ASSET[
          'security-rule'
        ] as {
          new_terms_fields: string[];
        };
        assertNewTermsFieldsPropertyShown(newTermsFields);

        const { history_window_start: historyWindowStart } = NEW_TERMS_PREBUILT_RULE_ASSET[
          'security-rule'
        ] as { history_window_start: string };
        assertWindowSizePropertyShown(historyWindowStart);

        const { filters: queryFilters } = NEW_TERMS_PREBUILT_RULE_ASSET['security-rule'] as {
          filters: Filter[];
        };
        assertFiltersPropertyShown(queryFilters);

        const { index } = NEW_TERMS_PREBUILT_RULE_ASSET['security-rule'] as {
          index: string[];
        };
        assertIndexPropertyShown(index);

        const { query } = NEW_TERMS_PREBUILT_RULE_ASSET['security-rule'] as { query: string };
        assertCustomQueryPropertyShown(query);
      });

      it('shows ES|QL rule properties', () => {
        installPrebuiltRuleAssets([ESQL_PREBUILT_RULE_ASSET]);
        visitAddRulesPage();

        openPrebuiltRuleInstallFlyoutFor(ESQL_PREBUILT_RULE_ASSET['security-rule'].name);

        assertCommonPropertiesShown(commonProperties);

        const { query } = ESQL_PREBUILT_RULE_ASSET['security-rule'] as { query: string };
        assertEsqlQueryPropertyShown(query);

        const { alert_suppression: alertSuppression } = ESQL_PREBUILT_RULE_ASSET[
          'security-rule'
        ] as {
          alert_suppression: AlertSuppression;
        };
        assertAlertSuppressionPropertiesShown(alertSuppression);
      });
    });
  }
);

const commonProperties: Partial<PrebuiltRuleAsset> = {
  author: ['Elastic', 'Another author'],
  building_block_type: 'default',
  severity: 'medium',
  severity_mapping: [
    {
      field: 'Ransomware.severity',
      value: '50',
      operator: 'equals',
      severity: 'high',
    },
  ],
  risk_score: 20,
  risk_score_mapping: [
    {
      field: 'Ransomware.child_processes.score',
      operator: 'equals',
      risk_score: 30,
      value: '',
    },
  ],
  references: ['https://www.example.com/1', 'https://www.example.com/2'],
  false_positives: ['False positive example 1', 'False positive example 2'],
  investigation_fields: {
    field_names: ['Ransomware.files.path', 'Target.dll.name'],
  },
  license: 'MIT',
  rule_name_override: 'Endpoint.policy.applied.name',
  threat: [
    {
      framework: 'MITRE ATT&CK',
      tactic: {
        id: 'TA0009',
        reference: 'https://attack.mitre.org/tactics/TA0009',
        name: 'Collection',
      },
      technique: [
        {
          id: 'T1557',
          reference: 'https://attack.mitre.org/techniques/T1557',
          name: 'Adversary-in-the-Middle',
          subtechnique: [
            {
              id: 'T1557.002',
              reference: 'https://attack.mitre.org/techniques/T1557/002',
              name: 'ARP Cache Poisoning',
            },
          ],
        },
      ],
    },
  ],
  timestamp_override: 'Target.process.start',
  tags: ['tag-a', 'tag-b'],
  related_integrations: [
    { package: 'endpoint', version: '^8.2.0' },
    { package: 'windows', version: '^1.5.0' },
  ],
  required_fields: [
    { name: 'event.type', type: 'keyword' },
    { name: 'file.extension', type: 'keyword' },
  ],
  timeline_id: '3e827bab-838a-469f-bd1e-5e19a2bff2fd',
  timeline_title: 'Alerts Involving a Single User Timeline',
  interval: '5m',
  from: 'now-360s',
  note: 'Investigation guide content',
  setup: 'Setup guide content',
};

const filters = [
  {
    meta: {
      disabled: false,
      negate: false,
      alias: null,
      index: 'security-solution-default',
      key: 'Endpoint.policy.applied.artifacts.global.identifiers.name',
      field: 'Endpoint.policy.applied.artifacts.global.identifiers.name',
      value: 'exists',
      type: 'exists',
    },
    query: {
      exists: {
        field: 'Endpoint.policy.applied.artifacts.global.identifiers.name',
      },
    },
    $state: { store: 'appState' },
  },
];

const queryProperties: Partial<PrebuiltRuleAsset> = {
  query: '_id : *',
  language: 'kuery',
  filters,
};

const CUSTOM_QUERY_PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
  name: 'Custom query index pattern rule',
  rule_id: 'custom_query_index_pattern_rule',
  ...(commonProperties as Record<string, unknown>),
  ...queryProperties,
  type: 'query',
  index: ['winlogbeat-*', 'logs-endpoint.events.*'],
  alert_suppression: {
    group_by: [
      'Endpoint.policy.applied.artifacts.global.identifiers.name',
      'Endpoint.policy.applied.id',
    ],
    duration: { unit: 'm', value: 5 },
    missing_fields_strategy: 'suppress',
  },
});

const SAVED_QUERY_PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
  name: 'Custom query data view rule',
  rule_id: 'custom_query_data_view_rule',
  ...(commonProperties as Record<string, unknown>),
  type: 'saved_query',
  data_view_id: 'my-test-data-view-id',
  saved_id: '',
  language: 'kuery',
  index: ['winlogbeat-*', 'logs-endpoint.events.*'],
  alert_suppression: {
    group_by: [
      'Endpoint.policy.applied.artifacts.global.identifiers.name',
      'Endpoint.policy.applied.id',
    ],
    duration: { unit: 'm', value: 5 },
    missing_fields_strategy: 'suppress',
  },
  query: '',
});

const MACHINE_LEARNING_PREBUILT_RULE_ASSET = omit(
  createRuleAssetSavedObject({
    name: 'Machine learning rule',
    rule_id: 'machine_learning_rule',
    ...commonProperties,
    type: 'machine_learning',
    anomaly_threshold: 65,
    machine_learning_job_id: ['auth_high_count_logon_events_ea', 'auth_high_count_logon_fails_ea'],
    alert_suppression: {
      group_by: ['host.name'],
      duration: { unit: 'm', value: 5 },
      missing_fields_strategy: 'suppress',
    },
  }),
  ['security-rule.query', 'security-rule.language']
) as Omit<
  ReturnType<typeof createRuleAssetSavedObject>,
  'security-rule.query' | 'security-rule.language'
>;

const THRESHOLD_RULE_PREBUILT_ASSET = createRuleAssetSavedObject({
  name: 'Threshold index pattern rule',
  rule_id: 'threshold_index_pattern_rule',
  ...commonProperties,
  ...queryProperties,
  type: 'threshold',
  language: 'lucene',
  index: ['winlogbeat-*', 'logs-endpoint.events.*'],
  threshold: {
    field: [
      'Endpoint.policy.applied.artifacts.user.identifiers.name',
      'Endpoint.policy.applied.id',
    ],
    value: 200,
    cardinality: [{ field: 'Ransomware.score', value: 3 }],
  },
  alert_suppression: undefined,
});

const EQL_PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
  name: 'Event correlation index pattern rule',
  rule_id: 'eql_index_pattern_rule',
  ...commonProperties,
  type: 'eql',
  language: 'eql',
  query: 'process where process.name == "regsvr32.exe"',
  index: ['winlogbeat-*', 'logs-endpoint.events.*'],
  filters,
  alert_suppression: undefined,
});

const THREAT_MATCH_PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
  name: 'Threat match index pattern rule',
  rule_id: 'threat_match_index_pattern_rule',
  ...commonProperties,
  ...queryProperties,
  type: 'threat_match',
  language: 'lucene',
  index: ['winlogbeat-*', 'logs-endpoint.events.*'],
  filters,
  threat_query: '@timestamp >= "now-30d/d"',
  threat_mapping: [
    {
      entries: [
        {
          field: 'file.hash.md5',
          type: 'mapping',
          value: 'threat.indicator.file.hash.md5',
        },
      ],
    },
  ],
  threat_index: ['filebeat-*', 'logs-ti_*'],
  threat_filters: [
    {
      $state: { store: 'appState' },
      meta: {
        disabled: false,
        key: 'event.category',
        negate: false,
        params: { query: 'threat' },
        type: 'phrase',
        alias: null,
      },
      query: { match_phrase: { 'event.category': 'threat' } },
    },
  ],
  threat_language: 'kuery',
  threat_indicator_path: 'threat.indicator',
  alert_suppression: undefined,
});

const NEW_TERMS_PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
  name: 'New terms index pattern rule',
  rule_id: 'new_terms_index_pattern_rule',
  ...commonProperties,
  ...queryProperties,
  type: 'new_terms',
  query: '_id: *',
  new_terms_fields: ['Endpoint.policy.applied.id', 'Memory_protection.unique_key_v1'],
  history_window_start: 'now-9d',
  index: ['apm-*-transaction*', 'auditbeat-*'],
  language: 'lucene',
  filters: [
    {
      meta: {
        disabled: false,
        negate: false,
        alias: null,
        index: 'security-solution-default',
        key: 'Endpoint.policy.applied.artifacts.global.identifiers.name',
        field: 'Endpoint.policy.applied.artifacts.global.identifiers.name',
        value: 'exists',
        type: 'exists',
      },
      query: {
        exists: {
          field: 'Endpoint.policy.applied.artifacts.global.identifiers.name',
        },
      },
      $state: { store: 'appState' },
    },
  ],
  alert_suppression: undefined,
});

const ESQL_PREBUILT_RULE_ASSET = createRuleAssetSavedObject({
  name: 'ESQL rule',
  rule_id: 'esql_rule',
  ...commonProperties,
  type: 'esql',
  language: 'esql',
  query: 'FROM .alerts-security.alerts-default | STATS count = COUNT(@timestamp) BY @timestamp',
  alert_suppression: {
    group_by: [
      'Endpoint.policy.applied.artifacts.global.identifiers.name',
      'Endpoint.policy.applied.id',
    ],
    duration: { unit: 'm', value: 5 },
    missing_fields_strategy: 'suppress',
  },
});
