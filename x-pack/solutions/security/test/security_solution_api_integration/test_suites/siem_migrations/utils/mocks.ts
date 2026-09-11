/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';

import type {
  ElasticRule,
  OriginalRule,
  RuleMigrationRuleData,
} from '@kbn/security-solution-plugin/common/siem_migrations/model/rule_migration.gen';
import { generateAssistantComment } from '@kbn/security-solution-plugin/server/lib/siem_migrations/common/task/util/comments';
import type { StoredSiemMigration } from '@kbn/security-solution-plugin/server/lib/siem_migrations/common/types';

const SIEM_MIGRATIONS_BASE_INDEX_PATTERN = '.kibana-siem-rule-migrations';

const SIEM_MIGRATIONS_INDEX_PATTERN = `${SIEM_MIGRATIONS_BASE_INDEX_PATTERN}-migrations-default`;
const SIEM_MIGRATIONS_RULES_INDEX_PATTERN = `${SIEM_MIGRATIONS_BASE_INDEX_PATTERN}-rules-default`;
const SIEM_MIGRATIONS_RESOURCES_INDEX_PATTERN = `${SIEM_MIGRATIONS_BASE_INDEX_PATTERN}-resources-default`;
const SOME_USER_ID = 'u_mGBROF_q5bmFCATbLXAcCwKa0k8JvONAwSruelyKA5E_0';

export const defaultOriginalRule: OriginalRule = {
  id: 'https://127.0.0.1:8089/servicesNS/nobody/SA-AccessProtection/saved/searches/Access%20-%20Default%20Account%20Usage%20-%20Rule',
  vendor: 'splunk',
  title: 'Access - Default Account Usage - Rule',
  description:
    'Discovers use of default accounts (such as admin, administrator, etc.). Default accounts have default passwords and are therefore commonly targeted by attackers using brute force attack tools.',
  query:
    '| from datamodel:"Authentication"."Successful_Default_Authentication" | stats max("_time") as "lastTime",values("tag") as "tag",count by "dest","user","app"',
  query_language: 'spl',
  annotations: {
    mitre_attack: ['T1078'],
  },
};

export const splunkRuleWithResources: OriginalRule = {
  id: 'https://127.0.0.1:8089/servicesNS/nobody/DA-ESS-EndpointProtection/saved/searches/Endpoint%20-%20Old%20Malware%20Infection%20-%20Rule',
  vendor: 'splunk',
  title: 'Endpoint - Old Malware Infection - Rule',
  query:
    '| tstats `summariesonly` max(_time) as lastTime from datamodel=Malware.Malware_Attacks by Malware_Attacks.signature,Malware_Attacks.dest | `drop_dm_object_name("Malware_Attacks")` | lookup local=true malware_tracker dest,signature OUTPUT firstTime | eval dayDiff=round((lastTime-firstTime)/86400,1) | search dayDiff>30',
  query_language: 'spl',
  description: 'Alerts when a host with an old infection is discovered (likely a re-infection).',
};

export const defaultElasticRule: ElasticRule = {
  severity: 'low',
  risk_score: 21,
  integration_ids: [''],
  query:
    'FROM [indexPattern]\n| STATS lastTime = max(_time), tag = values(tag), count BY dest, user, app',
  description:
    'Discovers use of default accounts (such as admin, administrator, etc.). Default accounts have default passwords and are therefore commonly targeted by attackers using brute force attack tools.',
  query_language: 'esql',
  title: 'Access - Default Account Usage - Rule',
};

const defaultMigrationRuleDocument: RuleMigrationRuleData = {
  '@timestamp': '2025-01-13T15:17:43.571Z',
  migration_id: '25a24356-3aab-401b-a73c-905cb8bf7a6d',
  original_rule: defaultOriginalRule,
  status: 'completed',
  created_by: SOME_USER_ID,
  updated_by: SOME_USER_ID,
  updated_at: '2025-01-13T15:39:48.729Z',
  comments: [
    generateAssistantComment(
      '## Prebuilt Rule Matching Summary\nThe Splunk rule "Access - Default Account Usage - Rule" is intended to discover the use of default accounts, which are commonly targeted by attackers using brute force attack tools. However, none of the provided Elastic Prebuilt Rules specifically address the detection of default account usage. The closest matches involve brute force attacks in general, but they do not specifically focus on default accounts. Therefore, no suitable match was found.'
    ),
    generateAssistantComment('## Integration Matching Summary\nNo related integration found.'),
    generateAssistantComment(
      '## Translation Summary\n\nThe provided Splunk SPL query was analyzed and translated into the equivalent ES|QL query. Here is a breakdown of the process:\n\n### Original SPL Query\n```splunk-spl\n| from datamodel:"Authentication"."Successful_Default_Authentication" \n| stats max("_time") as "lastTime",\nvalues("tag") as "tag",\ncount by "dest","user","app"\n```\n\n### Key SPL Components and Their ES|QL Equivalents:\n1. **Data Model**: `from datamodel:"Authentication"."Successful_Default_Authentication"` is not directly translatable to ES|QL. Instead, we use `FROM logs-*` to define the data source.\n2. **Stats Aggregation**: The `stats max("_time") as "lastTime", values("tag") as "tag", count by "dest","user","app"` was translated as follows:\n   - `max(_time) as lastTime` to find the latest time.\n   - `values(tag) as tag` to collect all values in the `tag` field.\n   - `count by dest, user, app` to count the occurrences grouped by `dest`, `user`, and `app`.\n\nBy analyzing these key components and their ES|QL equivalents, the translated query achieves the same results as the SPL query while adhering to the ES|QL syntax and structure.'
    ),
  ],
  translation_result: 'partial',
  elastic_rule: defaultElasticRule,
};

export const getMigrationRuleDocument = (
  overrideParams: Partial<RuleMigrationRuleData>
): RuleMigrationRuleData => ({
  ...defaultMigrationRuleDocument,
  ...overrideParams,
});

export const getMigrationRuleDocuments = (
  count: number,
  overrideCallback: (index: number) => Partial<RuleMigrationRuleData>
): RuleMigrationRuleData[] => {
  const docs: RuleMigrationRuleData[] = [];
  for (let i = 0; i < count; i++) {
    const overrideParams = overrideCallback(i);
    docs.push(getMigrationRuleDocument(overrideParams));
  }
  return docs;
};

const getDefaultMigrationDoc: () => Omit<StoredSiemMigration, 'id'> = () => ({
  name: 'Default Migration',
  created_by: '',
  created_at: new Date().toISOString(),
  last_execution: {
    is_aborted: false,
    started_at: new Date().toISOString(),
    ended_at: null,
    skip_prebuilt_rules_matching: false,
    connector_id: 'preconfigured-bedrock',
  },
});

export const createMigrationRules = async (
  es: Client,
  rules: RuleMigrationRuleData[]
): Promise<string[]> => {
  const createdAt = new Date().toISOString();
  const addRuleOperations = rules.flatMap((ruleMigration) => [
    { create: { _index: SIEM_MIGRATIONS_RULES_INDEX_PATTERN } },
    {
      ...ruleMigration,
      '@timestamp': createdAt,
      updated_at: createdAt,
    },
  ]);

  const migrationIdsToBeCreated = new Set(rules.map((rule) => rule.migration_id));
  const createMigrationOperations = Array.from(migrationIdsToBeCreated).flatMap((migrationId) => [
    { create: { _index: SIEM_MIGRATIONS_INDEX_PATTERN, _id: migrationId } },
    {
      ...getDefaultMigrationDoc(),
    },
  ]);

  const res = await es.bulk({
    refresh: 'wait_for',
    operations: [...createMigrationOperations, ...addRuleOperations],
  });

  const ids = res.items.reduce((acc, item) => {
    if (item.create?._id && item.create._index === SIEM_MIGRATIONS_RULES_INDEX_PATTERN) {
      acc.push(item.create._id);
    }
    return acc;
  }, [] as string[]);

  return ids;
};

export const deleteAllRuleMigrations = async (es: Client): Promise<void> => {
  await es.deleteByQuery({
    index: [
      SIEM_MIGRATIONS_INDEX_PATTERN,
      SIEM_MIGRATIONS_RULES_INDEX_PATTERN,
      SIEM_MIGRATIONS_RESOURCES_INDEX_PATTERN,
    ],
    query: {
      match_all: {},
    },
    conflicts: 'proceed',
    ignore_unavailable: true,
    refresh: true,
  });
};

export const defaultMacroResource = {
  type: 'macro',
  name: 'host_event_count',
  '@timestamp': '2025-05-21T15:23:15.505Z',
  updated_by: SOME_USER_ID,
  updated_at: '2025-05-21T15:23:15.505Z',
  content: '`host_eventcount` | `daysago($lessThan$)` | `hoursago($greaterThan$,' > ')`',
};

export const defaultSplunkLookupResource = {
  type: 'lookup',
  name: 'splunk_lookup',
  '@timestamp': '2025-05-21T15:23:15.505Z',
  updated_by: SOME_USER_ID,
  updated_at: '2025-05-21T15:23:15.505Z',
};

/**
 * QRadar rule XML with reference sets for testing.
 * The rule_data contains base64-encoded XML with ReferenceSetTest tests.
 */
const qradarRuleDataWithReferenceSets = `<rule buildingBlock="false" enabled="true" id="100001">
  <name>Test Rule with Reference Sets</name>
  <notes>This rule checks IPs against blocked and suspicious lists</notes>
  <testDefinitions>
    <test name="com.q1labs.semsources.cre.tests.ReferenceSetTest" id="1">
      <text>when the event IP is contained in any of Blocked IPs, Suspicious IPs</text>
    </test>
    <test name="com.q1labs.semsources.cre.tests.ReferenceSetTest" id="2">
      <text>when the event IP is contained in all of Malicious Hosts</text>
    </test>
  </testDefinitions>
</rule>`;

const qradarRuleDataBase64 = Buffer.from(qradarRuleDataWithReferenceSets).toString('base64');

/**
 * QRadar XML export containing a rule with reference sets.
 * Used for testing QRadar rule ingestion and reference set identification.
 */
export const qradarXmlWithReferenceSets = `<?xml version="1.0" encoding="UTF-8"?>
<content>
  <custom_rule>
    <rule_data>${qradarRuleDataBase64}</rule_data>
  </custom_rule>
</content>`;

/**
 * Expected reference sets that should be identified from qradarXmlWithReferenceSets.
 */
export const expectedQradarReferenceSets = [
  { type: 'lookup', name: 'Blocked IPs' },
  { type: 'lookup', name: 'Suspicious IPs' },
  { type: 'lookup', name: 'Malicious Hosts' },
];

/**
 * Sentinel ARM template resources containing one Scheduled rule referencing a watchlist.
 * Mirrors the export shape produced by Microsoft Sentinel.
 */
export const sentinelArmResourcesWithWatchlist = {
  resources: [
    {
      id: '/subscriptions/abc/resourceGroups/rg/providers/Microsoft.SecurityInsights/alertRules/rule-1',
      name: 'rule-1',
      kind: 'Scheduled',
      type: 'Microsoft.SecurityInsights/alertRules',
      properties: {
        displayName: 'Suspicious sign-in from watchlisted account',
        description: 'Detects sign-ins from accounts on the high-value watchlist',
        query: "SigninLogs | where AccountName in (_GetWatchlist('HighValueAccounts'))",
        severity: 'Medium',
        tactics: ['InitialAccess'],
        techniques: ['T1078'],
      },
    },
  ],
};

/**
 * Expected watchlist resources identified from sentinelArmResourcesWithWatchlist.
 */
export const expectedSentinelWatchlists = [{ type: 'lookup', name: 'HighValueAccounts' }];

export const executeTaskInBatches = async <T>({
  items,
  batchSize,
  executor,
}: {
  items: T[];
  batchSize: number;
  executor: (batch: T[], batchNumber: number) => Promise<void>;
}) => {
  const batches = Math.ceil(items.length / batchSize);
  for (let i = 0; i < batches; i++) {
    const batch = items.slice(i * batchSize, (i + 1) * batchSize);
    await executor(batch, i);
  }
};

export const createMacrosForMigrationId = async ({
  es,
  migrationId,
  count,
  index = SIEM_MIGRATIONS_RESOURCES_INDEX_PATTERN,
}: {
  es: Client;
  migrationId: string;
  count: number;
  index?: string;
}) => {
  const macros = [];
  for (let i = 0; i < count; i++) {
    macros.push({
      ...defaultMacroResource,
      migration_id: migrationId,
      name: `macro_${i}`,
    });
  }

  await executeTaskInBatches({
    items: macros,
    batchSize: 1000,
    executor: async (batch) => {
      const createMacroOperations = batch.flatMap((macro) => [
        { create: { _index: index } },
        macro,
      ]);

      await es.bulk({
        refresh: 'wait_for',
        operations: [...createMacroOperations],
      });
    },
  });
};

export const createLookupsForMigrationId = async ({
  es,
  migrationId,
  count,
  index = SIEM_MIGRATIONS_RESOURCES_INDEX_PATTERN,
}: {
  es: Client;
  migrationId: string;
  count: number;
  index?: string;
}) => {
  const lookups = [];
  for (let i = 0; i < count; i++) {
    lookups.push({
      ...defaultSplunkLookupResource,
      migration_id: migrationId,
      name: `lookup_${i}`,
    });
  }

  await executeTaskInBatches({
    items: lookups,
    batchSize: 1000,
    executor: async (batch) => {
      const createLookupOperations = batch.flatMap((lookup) => [
        { create: { _index: index } },
        lookup,
      ]);
      await es.bulk({
        refresh: 'wait_for',
        operations: [...createLookupOperations],
      });
    },
  });
};
