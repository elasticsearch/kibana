/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import type { Streams } from '@kbn/streams-schema';
import type { QueryLink, StreamQuery } from '@kbn/significant-events-schema';
import type { IRulesManagementClient } from './rules/rules_management_client';
import type { IndicatorReader } from './indicator_reader';
import type { IndicatorWriter } from './indicator_writer';
import { QueryRuleOrchestrator } from './query_rule_orchestrator';

const STREAM = 'logs.test';
const definition = { name: STREAM } as Streams.all.Definition;

const makeQuery = (
  overrides: Partial<StreamQuery> & { id?: string; severity_score?: number } = {}
): StreamQuery => ({
  id: overrides.id ?? 'q1',
  type: 'match',
  title: overrides.title ?? 'Test query',
  description: 'desc',
  esql: { query: overrides.esql?.query ?? 'FROM logs | WHERE body.text:"error"' },
  severity_score: overrides.severity_score ?? 30,
  ...overrides,
});

const makeLink = (
  overrides: Partial<StreamQuery> & { id?: string; ruleBacked?: boolean } = {}
): QueryLink => ({
  query: makeQuery(overrides),
  stream_name: STREAM,
  rule_backed: overrides.ruleBacked ?? false,
  rule_id: `rule-${overrides.id ?? 'q1'}`,
});

function createOrchestrator({
  currentLinks = [] as QueryLink[],
}: {
  currentLinks?: QueryLink[];
} = {}) {
  const rulesManagementClient = {
    createRule: jest.fn().mockResolvedValue(undefined),
    updateRule: jest.fn().mockResolvedValue(undefined),
    bulkDeleteRules: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<IRulesManagementClient>;

  const writer = {
    bulk: jest.fn().mockResolvedValue({ applied: 1, skipped: 0 }),
  } as unknown as jest.Mocked<IndicatorWriter>;

  const reader = {
    getStreamToQueryLinksMap: jest.fn().mockResolvedValue({ [STREAM]: currentLinks }),
  } as unknown as jest.Mocked<IndicatorReader>;

  const orchestrator = new QueryRuleOrchestrator(
    rulesManagementClient,
    loggerMock.create(),
    true,
    writer,
    reader
  );

  return { orchestrator, rulesManagementClient, writer, reader };
}

describe('QueryRuleOrchestrator', () => {
  describe('syncQueries', () => {
    it('creates rules for new high-severity MATCH queries', async () => {
      const { orchestrator, rulesManagementClient } = createOrchestrator();
      const newQuery = makeQuery({
        id: 'new-high',
        severity_score: 80,
        esql: { query: 'FROM logs | WHERE body.text:"critical"' },
      });

      await orchestrator.syncQueries(definition, [newQuery]);

      expect(rulesManagementClient.createRule).toHaveBeenCalledTimes(1);
    });

    it('does not promote existing unbacked low-severity MATCH queries when syncing a new high-severity query', async () => {
      const existingLow = makeLink({
        id: 'low-sev',
        severity_score: 25,
        esql: { query: 'FROM logs | WHERE body.text:"startup"' },
        ruleBacked: false,
      });
      const { orchestrator, rulesManagementClient, writer } = createOrchestrator({
        currentLinks: [existingLow],
      });
      const newHigh = makeQuery({
        id: 'high-sev',
        title: 'OOM errors',
        severity_score: 80,
        esql: { query: 'FROM logs | WHERE body.text:"oom"' },
      });

      await orchestrator.syncQueries(definition, [existingLow.query, newHigh], {
        currentLinks: [existingLow],
      });

      expect(rulesManagementClient.createRule).toHaveBeenCalledTimes(1);
      expect(rulesManagementClient.createRule).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ name: 'OOM errors' })
      );

      const bulkOps = (writer.bulk as jest.Mock).mock.calls[0][1];
      const lowSevOp = bulkOps.find(
        (op: { index?: { query?: { id?: string } } }) => op.index?.query?.id === 'low-sev'
      );
      expect(lowSevOp?.index?.query?.rule_backed).toBe(false);
    });

    it('promotes existing unbacked queries only via promoteQueries', async () => {
      const existingLow = makeLink({
        id: 'low-sev',
        severity_score: 25,
        ruleBacked: false,
      });
      const { orchestrator, rulesManagementClient, writer } = createOrchestrator({
        currentLinks: [existingLow],
      });

      await orchestrator.promoteQueries(definition, ['low-sev']);

      expect(rulesManagementClient.createRule).toHaveBeenCalledTimes(1);
      const bulkOps = (writer.bulk as jest.Mock).mock.calls[0][1];
      expect(bulkOps[0].index.query.rule_backed).toBe(true);
    });
  });
});
