/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { v4 as uuidv4 } from 'uuid';
import type { CreateExceptionListItemSchema, Type } from '@kbn/securitysolution-io-ts-list-types';
import { LIST_URL } from '@kbn/securitysolution-list-constants';
import type {
  RuleCreateProps,
  EqlRuleCreateProps,
  QueryRuleCreateProps,
  ThreatMatchRuleCreateProps,
  ThresholdRuleCreateProps,
} from '@kbn/security-solution-plugin/common/api/detection_engine';
import { getCreateExceptionListItemMinimalSchemaMock } from '@kbn/lists-plugin/common/schemas/request/create_exception_list_item_schema.mock';
import { getCreateExceptionListMinimalSchemaMock } from '@kbn/lists-plugin/common/schemas/request/create_exception_list_schema.mock';

import {
  createAlertsIndex,
  createRule,
  deleteAllRules,
  waitForRuleSuccess,
  waitForAlertsToBePresent,
  getAlertsByIds,
  deleteAllAlerts,
} from '@kbn/detections-response-ftr-services';
import { EsArchivePathBuilder } from '../../../../../../es_archive_path_builder';
import {
  getSimpleRule,
  createExceptionList,
  createExceptionListItem,
  getThresholdRuleForAlertTesting,
  getOpenAlerts,
  createRuleWithExceptionEntries,
  getEqlRuleForAlertTesting,
} from '../../../../utils';
import {
  createListsIndex,
  deleteAllExceptions,
  deleteListsIndex,
  importFile,
} from '../../../../../lists_and_exception_lists/utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';

const SYNTHETIC_INDEX = 'value-list-matrix-test';
const SYNTHETIC_HOST = 'value-list-matrix-host';
// WKT point in geo (lon, lat) order used for both geo_shape and shape tests.
const GEO_WKT = 'POINT (-74.006 40.7128)';
// Cartesian WKT point for the ES `shape` (non-geographic) type.
const CARTESIAN_WKT = 'POINT (100.0 200.0)';
// Geo coordinates stored as "lat,lon" (the lists plugin serialization format).
const GEO_LAT_LON = '40.7128,-74.006';

interface AuditbeatValueListSample {
  hostName: string;
  sourceIp: string;
  sourcePort: number;
  timestampIso: string;
  containerized: string;
  riskScore?: number;
}

const ipToSlash16 = (ip: string): string => {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.0.0/16`;
  }
  return `${ip}/128`;
};

const toDateNanosLine = (iso: string): string => {
  const match = iso.match(/^(.+T\d{2}:\d{2}:\d{2})(\.\d+)?Z$/);
  if (match == null) {
    return `${iso.replace(/Z$/, '')}.000000000Z`;
  }
  const base = match[1];
  const fractionalDigits = (match[2] ?? '.0').slice(1);
  const padded = `${fractionalDigits}000000000`.slice(0, 9);
  return `${base}.${padded}Z`;
};

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const log = getService('log');
  const es = getService('es');
  // TODO: add a new service for loading archiver files similar to "getService('es')"
  const config = getService('config');
  const isServerless = config.get('serverless');
  const dataPathBuilder = new EsArchivePathBuilder(isServerless);
  const path = dataPathBuilder.getPath('auditbeat/hosts');

  describe('@serverless @serverlessQA @ess rule exceptions execution', () => {
    before(async () => {
      await esArchiver.load(path);
    });

    after(async () => {
      await esArchiver.unload(path);
    });

    describe('creating rules with exceptions', () => {
      beforeEach(async () => {
        await createAlertsIndex(supertest, log);
      });

      afterEach(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
        await deleteAllExceptions(supertest, log);
      });

      it('should be able to execute against an exception list that does not include valid entries and get back 10 alerts', async () => {
        const { id, list_id, namespace_type, type } = await createExceptionList(
          supertest,
          log,
          getCreateExceptionListMinimalSchemaMock()
        );

        const exceptionListItem: CreateExceptionListItemSchema = {
          ...getCreateExceptionListItemMinimalSchemaMock(),
          entries: [
            {
              field: 'some.none.existent.field', // non-existent field where we should not exclude anything
              operator: 'included',
              type: 'match',
              value: 'some value',
            },
          ],
        };
        await createExceptionListItem(supertest, log, exceptionListItem);

        const ruleWithException: RuleCreateProps = {
          name: 'Simple Rule Query',
          description: 'Simple Rule Query',
          enabled: true,
          risk_score: 1,
          rule_id: 'rule-1',
          severity: 'high',
          index: ['auditbeat-*'],
          type: 'query',
          from: '1900-01-01T00:00:00.000Z',
          query: 'host.name: "suricata-sensor-amsterdam"',
          exceptions_list: [
            {
              id,
              list_id,
              namespace_type,
              type,
            },
          ],
        };
        const { id: createdId } = await createRule(supertest, log, ruleWithException);
        await waitForRuleSuccess({ supertest, log, id: createdId });
        await waitForAlertsToBePresent(supertest, log, 10, [createdId]);
        const alertsOpen = await getAlertsByIds(supertest, log, [createdId]);
        expect(alertsOpen.hits.hits).toHaveLength(10);
      });

      it('should be able to execute against an exception list that does include valid entries and get back 0 alerts', async () => {
        const rule: QueryRuleCreateProps = {
          name: 'Simple Rule Query',
          description: 'Simple Rule Query',
          enabled: true,
          risk_score: 1,
          rule_id: 'rule-1',
          severity: 'high',
          index: ['auditbeat-*'],
          type: 'query',
          from: '1900-01-01T00:00:00.000Z',
          query: 'host.name: "suricata-sensor-amsterdam"',
        };
        const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
          [
            {
              field: 'host.name', // This matches the query above which will exclude everything
              operator: 'included',
              type: 'match',
              value: 'suricata-sensor-amsterdam',
            },
          ],
        ]);
        const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
        expect(alertsOpen.hits.hits).toHaveLength(0);
      });

      it('should be able to execute against an exception list that does include valid case sensitive entries and get back 0 alerts', async () => {
        const rule: QueryRuleCreateProps = {
          name: 'Simple Rule Query',
          description: 'Simple Rule Query',
          enabled: true,
          risk_score: 1,
          rule_id: 'rule-1',
          severity: 'high',
          index: ['auditbeat-*'],
          type: 'query',
          from: '1900-01-01T00:00:00.000Z',
          query: 'host.name: "suricata-sensor-amsterdam"',
        };
        const rule2: QueryRuleCreateProps = {
          name: 'Simple Rule Query',
          description: 'Simple Rule Query',
          enabled: true,
          risk_score: 1,
          rule_id: 'rule-2',
          severity: 'high',
          index: ['auditbeat-*'],
          type: 'query',
          from: '1900-01-01T00:00:00.000Z',
          query: 'host.name: "suricata-sensor-amsterdam"',
        };
        const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
          [
            {
              field: 'host.os.name',
              operator: 'included',
              type: 'match_any',
              value: ['ubuntu'],
            },
          ],
        ]);
        const createdRule2 = await createRuleWithExceptionEntries(supertest, log, rule2, [
          [
            {
              field: 'host.os.name', // This matches the query above which will exclude everything
              operator: 'included',
              type: 'match_any',
              value: ['ubuntu', 'Ubuntu'],
            },
          ],
        ]);
        const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
        const alertsOpen2 = await getOpenAlerts(supertest, log, es, createdRule2);
        // Expect alerts here because all values are "Ubuntu"
        // and exception is one of ["ubuntu"]
        expect(alertsOpen.hits.hits).toHaveLength(10);
        // Expect no alerts here because all values are "Ubuntu"
        // and exception is one of ["ubuntu", "Ubuntu"]
        expect(alertsOpen2.hits.hits).toHaveLength(0);
      });

      it('generates no alerts when an exception is added for an EQL rule', async () => {
        const rule: EqlRuleCreateProps = {
          ...getEqlRuleForAlertTesting(['auditbeat-*']),
          query: 'configuration where agent.id=="a1d7b39c-f898-4dbe-a761-efb61939302d"',
        };
        const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
          [
            {
              field: 'host.id',
              operator: 'included',
              type: 'match',
              value: '8cc95778cce5407c809480e8e32ad76b',
            },
          ],
        ]);
        const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
        expect(alertsOpen.hits.hits).toHaveLength(0);
      });

      it('generates no alerts when an exception is added for a threshold rule', async () => {
        const rule: ThresholdRuleCreateProps = {
          ...getThresholdRuleForAlertTesting(['auditbeat-*']),
          threshold: {
            field: 'host.id',
            value: 700,
          },
        };
        const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
          [
            {
              field: 'host.id',
              operator: 'included',
              type: 'match',
              value: '8cc95778cce5407c809480e8e32ad76b',
            },
          ],
        ]);
        const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
        expect(alertsOpen.hits.hits).toHaveLength(0);
      });

      it('generates no alerts when an exception is added for a threat match rule', async () => {
        const rule: ThreatMatchRuleCreateProps = {
          description: 'Detecting root and admin users',
          name: 'Query with a rule id',
          severity: 'high',
          index: ['auditbeat-*'],
          type: 'threat_match',
          risk_score: 55,
          language: 'kuery',
          rule_id: 'rule-1',
          from: '1900-01-01T00:00:00.000Z',
          query: '*:*',
          threat_query: 'source.ip: "188.166.120.93"', // narrow things down with a query to a specific source ip
          threat_index: ['auditbeat-*'], // We use auditbeat as both the matching index and the threat list for simplicity
          threat_mapping: [
            // We match host.name against host.name
            {
              entries: [
                {
                  field: 'host.name',
                  value: 'host.name',
                  type: 'mapping',
                },
              ],
            },
          ],
          threat_filters: [],
        };

        const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
          [
            {
              field: 'source.ip',
              operator: 'included',
              type: 'match',
              value: '188.166.120.93',
            },
          ],
        ]);
        const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
        expect(alertsOpen.hits.hits).toHaveLength(0);
      });

      describe('rules with value list exceptions', () => {
        beforeEach(async () => {
          await createListsIndex(supertest, log);
        });

        afterEach(async () => {
          await deleteListsIndex(supertest, log);
        });

        it('generates no alerts when a value list exception is added for a query rule', async () => {
          const valueListId = 'value-list-id.txt';
          await importFile(supertest, log, 'keyword', ['suricata-sensor-amsterdam'], valueListId);
          const rule: QueryRuleCreateProps = {
            name: 'Simple Rule Query',
            description: 'Simple Rule Query',
            enabled: true,
            risk_score: 1,
            rule_id: 'rule-1',
            severity: 'high',
            index: ['auditbeat-*'],
            type: 'query',
            from: '1900-01-01T00:00:00.000Z',
            query: 'host.name: "suricata-sensor-amsterdam"',
          };
          const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'host.name',
                operator: 'included',
                type: 'list',
                list: {
                  id: valueListId,
                  type: 'keyword',
                },
              },
            ],
          ]);
          const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alertsOpen.hits.hits).toHaveLength(0);
        });

        it('generates no alerts when a value list exception is added for a threat match rule', async () => {
          const valueListId = 'value-list-id.txt';
          await importFile(supertest, log, 'keyword', ['zeek-sensor-amsterdam'], valueListId);
          const rule: ThreatMatchRuleCreateProps = {
            description: 'Detecting root and admin users',
            name: 'Query with a rule id',
            severity: 'high',
            index: ['auditbeat-*'],
            type: 'threat_match',
            risk_score: 55,
            language: 'kuery',
            rule_id: 'rule-1',
            from: '1900-01-01T00:00:00.000Z',
            query: '*:*',
            threat_query: 'source.ip: "188.166.120.93"', // narrow things down with a query to a specific source ip
            threat_index: ['auditbeat-*'], // We use auditbeat as both the matching index and the threat list for simplicity
            threat_mapping: [
              // We match host.name against host.name
              {
                entries: [
                  {
                    field: 'host.name',
                    value: 'host.name',
                    type: 'mapping',
                  },
                ],
              },
            ],
            threat_filters: [],
          };

          const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'host.name',
                operator: 'included',
                type: 'list',
                list: {
                  id: valueListId,
                  type: 'keyword',
                },
              },
            ],
          ]);
          const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alertsOpen.hits.hits).toHaveLength(0);
        });

        it('generates no alerts when a value list exception is added for a threshold rule', async () => {
          const valueListId = 'value-list-id.txt';
          await importFile(supertest, log, 'keyword', ['zeek-sensor-amsterdam'], valueListId);
          const rule: ThresholdRuleCreateProps = {
            description: 'Detecting root and admin users',
            name: 'Query with a rule id',
            severity: 'high',
            index: ['auditbeat-*'],
            type: 'threshold',
            risk_score: 55,
            language: 'kuery',
            rule_id: 'rule-1',
            from: '1900-01-01T00:00:00.000Z',
            query: 'host.name: "zeek-sensor-amsterdam"',
            threshold: {
              field: 'host.name',
              value: 1,
            },
          };

          const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'host.name',
                operator: 'included',
                type: 'list',
                list: {
                  id: valueListId,
                  type: 'keyword',
                },
              },
            ],
          ]);
          const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alertsOpen.hits.hits).toHaveLength(0);
        });

        it('generates no alerts when a value list exception is added for an EQL rule', async () => {
          const valueListId = 'value-list-id.txt';
          await importFile(supertest, log, 'keyword', ['zeek-sensor-amsterdam'], valueListId);
          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['auditbeat-*']),
            query: 'configuration where host.name=="zeek-sensor-amsterdam"',
          };

          const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'host.name',
                operator: 'included',
                type: 'list',
                list: {
                  id: valueListId,
                  type: 'keyword',
                },
              },
            ],
          ]);
          const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alertsOpen.hits.hits).toHaveLength(0);
        });

        describe('query rule: value list exception filters documents for Elasticsearch list types', function () {
          this.timeout(120000);

          let sample: AuditbeatValueListSample;

          before(async () => {
            // `source.port` must fit into an Elasticsearch `short` (signed
            // 16-bit: -32768..32767). Many auditbeat ephemeral ports exceed
            // this range, which would cause `short`-typed list item imports to
            // be rejected and the `short` test to time out waiting for the
            // list item to appear. Constrain the sample selection up front.
            const SHORT_MAX = 32767;
            const res = await es.search({
              index: ['auditbeat-*'],
              size: 50,
              query: {
                bool: {
                  filter: [
                    { exists: { field: 'host.name' } },
                    { exists: { field: 'source.ip' } },
                    { exists: { field: 'source.port' } },
                    { exists: { field: 'destination.port' } },
                    { exists: { field: '@timestamp' } },
                    { exists: { field: 'host.containerized' } },
                    { range: { 'source.port': { lte: SHORT_MAX } } },
                  ],
                },
              },
              _source: [
                'host.name',
                'source.ip',
                'source.port',
                'destination.port',
                '@timestamp',
                'host.containerized',
              ],
            });
            const hit = res.hits.hits.find((h) => {
              const loc = (h._source as { host?: { containerized?: { location?: unknown } } })?.host
                ?.containerized;
              return loc != null;
            });
            if (hit == null || hit._source == null) {
              throw new Error(
                'Expected an auditbeat-* document with host, source, timestamp, risk_score, and geo for value list matrix tests'
              );
            }
            const src = hit._source as Record<string, unknown>;
            const tsRaw = src['@timestamp'];
            const timestampIso =
              typeof tsRaw === 'string'
                ? tsRaw
                : typeof tsRaw === 'number'
                ? new Date(tsRaw).toISOString()
                : new Date(String(tsRaw)).toISOString();

            sample = {
              hostName: String((src as { host?: { name?: string } }).host?.name),
              sourceIp: String((src as { source?: { ip?: string } }).source?.ip),
              sourcePort: Number((src as { source?: { port?: number } }).source?.port),
              timestampIso,
              containerized: String(
                (src as { host?: { containerized?: boolean } }).host?.containerized
              ),
              riskScore:
                typeof (src as { event?: { risk_score?: number } }).event?.risk_score === 'number'
                  ? (src as { event: { risk_score: number } }).event.risk_score
                  : undefined,
            };

            // Create a synthetic index with controlled mappings for types that
            // require fields not reliably present in the auditbeat fixture.
            await es.indices.create({
              index: SYNTHETIC_INDEX,
              mappings: {
                properties: {
                  host: { properties: { name: { type: 'keyword' } } },
                  '@timestamp': { type: 'date' },
                  source: { properties: { port: { type: 'integer' } } },
                  geo_location: { type: 'geo_point' },
                  geo_shape_field: { type: 'geo_shape' },
                  shape_field: { type: 'shape' },
                },
              },
            });
            await es.index({
              index: SYNTHETIC_INDEX,
              document: {
                host: { name: SYNTHETIC_HOST },
                '@timestamp': '2020-01-01T00:00:00.000Z',
                source: { port: 100 },
                geo_location: GEO_LAT_LON,
                geo_shape_field: GEO_WKT,
                shape_field: CARTESIAN_WKT,
              },
              refresh: 'wait_for',
            });
          });

          after(async () => {
            await es.indices.delete({ index: SYNTHETIC_INDEX });
          });

          const runValueListFilterCase = async ({
            listType,
            field,
            listLines,
            ruleQuery,
            testValues,
            index = ['auditbeat-*'],
          }: {
            listType: Type;
            field: string;
            listLines: string[];
            ruleQuery: string;
            testValues?: string[];
            index?: string[];
          }) => {
            const valueListId = `vl-${listType}-${uuidv4()}.txt`;
            await importFile(supertest, log, listType, listLines, valueListId, testValues);
            const rule: QueryRuleCreateProps = {
              name: `Value list matrix ${listType}`,
              description: 'Value list exception matrix',
              enabled: true,
              risk_score: 1,
              rule_id: `rule-vl-${listType}-${uuidv4()}`,
              severity: 'high',
              index,
              type: 'query',
              from: '1900-01-01T00:00:00.000Z',
              query: ruleQuery,
            };
            const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
              [
                {
                  field,
                  operator: 'included',
                  type: 'list',
                  list: {
                    id: valueListId,
                    type: listType,
                  },
                },
              ],
            ]);
            const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
            expect(alertsOpen.hits.hits).toHaveLength(0);
          };

          it('keyword', async () => {
            await runValueListFilterCase({
              listType: 'keyword',
              field: 'host.name',
              listLines: [sample.hostName],
              ruleQuery: `host.name: "${sample.hostName}"`,
            });
          });

          it('text', async () => {
            await runValueListFilterCase({
              listType: 'text',
              field: 'host.name',
              listLines: [sample.hostName],
              ruleQuery: `host.name: "${sample.hostName}"`,
            });
          });

          it('ip', async () => {
            await runValueListFilterCase({
              listType: 'ip',
              field: 'source.ip',
              listLines: [sample.sourceIp],
              ruleQuery: `source.ip: "${sample.sourceIp}"`,
            });
          });

          it('ip_range', async () => {
            await runValueListFilterCase({
              listType: 'ip_range',
              field: 'source.ip',
              listLines: [ipToSlash16(sample.sourceIp)],
              ruleQuery: `source.ip: "${sample.sourceIp}"`,
              testValues: [sample.sourceIp],
            });
          });

          it('boolean', async () => {
            await runValueListFilterCase({
              listType: 'boolean',
              field: 'host.containerized',
              listLines: [sample.containerized],
              ruleQuery: `host.containerized: ${sample.containerized}`,
            });
          });

          it('short', async () => {
            await runValueListFilterCase({
              listType: 'short',
              field: 'source.port',
              listLines: [sample.sourcePort.toString()],
              ruleQuery: `source.port: ${sample.sourcePort}`,
            });
          });

          it('integer', async () => {
            await runValueListFilterCase({
              listType: 'integer',
              field: 'source.port',
              listLines: [String(sample.sourcePort)],
              ruleQuery: `source.port: ${sample.sourcePort}`,
            });
          });

          it('long', async () => {
            await runValueListFilterCase({
              listType: 'long',
              field: 'source.port',
              listLines: [String(sample.sourcePort)],
              ruleQuery: `source.port: ${sample.sourcePort}`,
            });
          });

          it('date', async () => {
            await runValueListFilterCase({
              listType: 'date',
              field: '@timestamp',
              listLines: [sample.timestampIso],
              ruleQuery: `@timestamp: "${sample.timestampIso}"`,
            });
          });

          it('date_nanos', async () => {
            await runValueListFilterCase({
              listType: 'date_nanos',
              field: '@timestamp',
              listLines: [toDateNanosLine(sample.timestampIso)],
              ruleQuery: `@timestamp: "${sample.timestampIso}"`,
            });
          });

          it('float', async () => {
            await runValueListFilterCase({
              listType: 'float',
              field: 'source.port',
              listLines: [String(sample.sourcePort)],
              ruleQuery: `source.port: ${sample.sourcePort}`,
            });
          });

          it('half_float', async () => {
            await runValueListFilterCase({
              listType: 'half_float',
              field: 'source.port',
              listLines: [String(sample.sourcePort)],
              ruleQuery: `source.port: ${sample.sourcePort}`,
            });
          });

          it('double', async () => {
            await runValueListFilterCase({
              listType: 'double',
              field: 'source.port',
              listLines: [String(sample.sourcePort)],
              ruleQuery: `source.port: ${sample.sourcePort}`,
            });
          });

          // The following tests use the synthetic index (SYNTHETIC_INDEX) rather
          // than auditbeat-* because they require fields or data ranges not
          // reliably present in the auditbeat fixture.

          it('byte', async () => {
            // source.port: 100 is within the signed byte range (-128..127).
            await runValueListFilterCase({
              listType: 'byte',
              field: 'source.port',
              listLines: ['100'],
              ruleQuery: `source.port: 100`,
              index: [SYNTHETIC_INDEX],
            });
          });

          it('geo_point', async () => {
            await runValueListFilterCase({
              listType: 'geo_point',
              field: 'geo_location',
              listLines: [GEO_LAT_LON],
              ruleQuery: `host.name: "${SYNTHETIC_HOST}"`,
              index: [SYNTHETIC_INDEX],
              // geo_point is serialized as {lat, lon} object in the list index; the
              // waitForListItem term query uses the raw "lat,lon" string which never
              // matches the stored object. Import uses refresh:wait_for so skip the poll.
              testValues: [],
            });
          });

          it('geo_shape', async () => {
            await runValueListFilterCase({
              listType: 'geo_shape',
              field: 'geo_shape_field',
              listLines: [GEO_WKT],
              ruleQuery: `host.name: "${SYNTHETIC_HOST}"`,
              index: [SYNTHETIC_INDEX],
              // WKT values contain spaces; waitForListItem does not URL-encode the value
              // param, causing malformed requests. Import uses refresh:wait_for so data
              // is already searchable when the POST returns — skip the polling step.
              testValues: [],
            });
          });

          it('shape', async () => {
            await runValueListFilterCase({
              listType: 'shape',
              field: 'shape_field',
              listLines: [CARTESIAN_WKT],
              ruleQuery: `host.name: "${SYNTHETIC_HOST}"`,
              index: [SYNTHETIC_INDEX],
              // Same WKT space issue as geo_shape above.
              testValues: [],
            });
          });

          it('integer_range', async () => {
            await runValueListFilterCase({
              listType: 'integer_range',
              field: 'source.port',
              listLines: ['100-100'],
              ruleQuery: `source.port: 100`,
              index: [SYNTHETIC_INDEX],
              // Range types are serialized as {gte, lte} objects in the list index;
              // the waitForListItem term query uses the raw dash-separated string which
              // never matches. Import uses refresh:wait_for so skip the poll.
              testValues: [],
            });
          });

          it('float_range', async () => {
            await runValueListFilterCase({
              listType: 'float_range',
              field: 'source.port',
              listLines: ['99-101'],
              ruleQuery: `source.port: 100`,
              index: [SYNTHETIC_INDEX],
              // Same {gte, lte} object mismatch as integer_range above.
              testValues: [],
            });
          });

          it('long_range', async () => {
            await runValueListFilterCase({
              listType: 'long_range',
              field: 'source.port',
              listLines: ['100-100'],
              ruleQuery: `source.port: 100`,
              index: [SYNTHETIC_INDEX],
              // Same {gte, lte} object mismatch as integer_range above.
              testValues: [],
            });
          });

          it('double_range', async () => {
            await runValueListFilterCase({
              listType: 'double_range',
              field: 'source.port',
              listLines: ['99-101'],
              ruleQuery: `source.port: 100`,
              index: [SYNTHETIC_INDEX],
              // Same {gte, lte} object mismatch as integer_range above.
              testValues: [],
            });
          });

          it('date_range', async () => {
            await runValueListFilterCase({
              listType: 'date_range',
              field: '@timestamp',
              listLines: ['2019-01-01T00:00:00.000Z,2021-01-01T00:00:00.000Z'],
              ruleQuery: `host.name: "${SYNTHETIC_HOST}"`,
              index: [SYNTHETIC_INDEX],
              // date_range is serialized as {gte, lte} object; also the comma-separated
              // string is not URL-safe in waitForListItem. Import uses refresh:wait_for.
              testValues: [],
            });
          });

          it.skip('binary — ES binary fields are not indexed and cannot be queried with term/terms', () => {
            /* binary type stores base64-encoded data that is stored but never indexed;
               no standard ES query can match against it */
          });
        });

        it('should Not allow deleting value list when there are references and ignoreReferences is false', async () => {
          const valueListId = 'value-list-id.txt';
          await importFile(supertest, log, 'keyword', ['suricata-sensor-amsterdam'], valueListId);
          const rule: QueryRuleCreateProps = {
            ...getSimpleRule(),
            query: 'host.name: "suricata-sensor-amsterdam"',
          };
          await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'host.name',
                operator: 'included',
                type: 'list',
                list: {
                  id: valueListId,
                  type: 'keyword',
                },
              },
            ],
          ]);

          const deleteReferences = false;
          const ignoreReferences = false;

          // Delete the value list
          await supertest
            .delete(
              `${LIST_URL}?deleteReferences=${deleteReferences}&id=${valueListId}&ignoreReferences=${ignoreReferences}`
            )
            .set('kbn-xsrf', 'true')
            .send()
            .expect(409);
        });
      });
    });
  });
};
