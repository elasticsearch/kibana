/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock, loggingSystemMock } from '@kbn/core/server/mocks';
import type { RunContext, TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';

// The task-manager server entry pulls in the whole plugin graph, which this
// package's jest config cannot resolve (`TaskCost` comes back undefined).
jest.mock('@kbn/task-manager-plugin/server', () => ({
  TaskCost: { Normal: 2 },
  throwRetryableError: (err: Error) => {
    throw err;
  },
  throwUnrecoverableError: (err: Error) => {
    throw err;
  },
}));

import {
  CONTENT_RETENTION_DAYS,
  registerScrubReportContentTask,
  SCRUB_REPORT_CONTENT_TASK_TYPE,
} from './scrub_report_content';

interface UpdateByQueryArg {
  index: string;
  max_docs: number;
  expand_wildcards: readonly string[];
  query: { bool: { filter: unknown[]; must_not: unknown[] } };
  script: { source: string; params: { now: string } };
}

const setupRunner = (updateByQueryResult: unknown, previousState: Record<string, unknown> = {}) => {
  const coreStart = coreMock.createStart();
  const esClient = coreStart.elasticsearch.client.asInternalUser;
  (esClient.updateByQuery as jest.Mock).mockImplementation(async () => {
    if (updateByQueryResult instanceof Error) throw updateByQueryResult;
    return updateByQueryResult;
  });

  const coreSetup = coreMock.createSetup();
  (coreSetup.getStartServices as jest.Mock).mockResolvedValue([coreStart, {}, {}]);

  const definitions: Record<string, { createTaskRunner: Function }> = {};
  const taskManager = {
    registerTaskDefinitions: jest.fn((defs) => Object.assign(definitions, defs)),
  } as unknown as TaskManagerSetupContract;

  const logger = loggingSystemMock.createLogger();
  registerScrubReportContentTask({ taskManager, coreSetup, logger });

  const runner = definitions[SCRUB_REPORT_CONTENT_TASK_TYPE].createTaskRunner({
    taskInstance: { state: previousState, params: {} },
    signal: new AbortController().signal,
    executionUuid: 'test',
    setCustomTaskRunEventFields: jest.fn(),
  } as unknown as RunContext);

  return { runner, esClient, logger };
};

const lastQuery = (esClient: { updateByQuery: unknown }): UpdateByQueryArg =>
  (esClient.updateByQuery as jest.Mock).mock.calls[0][0] as UpdateByQueryArg;

describe('scrub_report_content task', () => {
  it('only targets reports past the retention window that are not already scrubbed', async () => {
    const { runner, esClient } = setupRunner({ updated: 3 });

    await runner.run();

    const query = lastQuery(esClient);
    expect(query.query.bool.filter).toEqual([
      { range: { '@timestamp': { lt: `now-${CONTENT_RETENTION_DAYS}d` } } },
      { exists: { field: 'content.body_text' } },
    ]);
    // Without this the task would rewrite the same documents on every run.
    expect(query.query.bool.must_not).toEqual([
      { exists: { field: 'lineage.content_scrubbed_at' } },
      { terms: { 'lineage.extraction_method': ['pending'] } },
    ]);
  });

  // Retention outrunning enrichment is unrecoverable: the enrichment routes all
  // require a non-empty text, so a report whose body was scrubbed before it was
  // ever enriched stays pending forever and yields no IOCs.
  it('never scrubs a report that is still pending enrichment', async () => {
    const { runner, esClient } = setupRunner({ updated: 0 });

    await runner.run();

    expect(lastQuery(esClient).query.bool.must_not).toContainEqual({
      terms: { 'lineage.extraction_method': ['pending'] },
    });
  });

  it('reads the hidden reports index and caps the documents per run', async () => {
    const { runner, esClient } = setupRunner({ updated: 0 });

    await runner.run();

    const query = lastQuery(esClient);
    expect(query.expand_wildcards).toEqual(['open', 'hidden']);
    expect(query.max_docs).toBeGreaterThan(0);
  });

  it('removes the fetched body but keeps enrichment and evidence fields', async () => {
    const { runner, esClient } = setupRunner({ updated: 1 });

    await runner.run();

    const { source } = lastQuery(esClient).script;
    expect(source).toContain("remove('body_text')");
    expect(source).not.toContain("remove('body_html')");
    expect(source).toContain('lineage.content_scrubbed_at');
    // Ranking and hunt cooldown depend on these surviving past retention.
    expect(source).not.toContain('extracted');
    expect(source).not.toContain('evidence');
  });

  it('accumulates the scrubbed count across runs', async () => {
    const { runner } = setupRunner({ updated: 7 });

    const result = await runner.run();

    expect(result.state).toEqual(
      expect.objectContaining({ totalReportsScrubbed: 7, lastRunAt: expect.any(String) })
    );
  });

  /**
   * `update_by_query` answers 200 with per-document problems in `failures[]`,
   * so a run that failed on every document returns `updated: 0` and used to be
   * indistinguishable from a clean "nothing to scrub". What is left behind is
   * fetched third-party body text living past its retention window, which is
   * the one thing this task exists to prevent.
   */
  describe('per-document failures are not silent', () => {
    const withFailures = () =>
      setupRunner({
        updated: 0,
        failures: [{ id: 'report-1', status: 429, cause: { type: 'es_rejected_execution' } }],
      });

    it('counts them in state rather than reporting a clean run', async () => {
      const { runner } = withFailures();

      const result = await runner.run();

      expect(result.state).toEqual(expect.objectContaining({ totalReportsFailed: 1 }));
    });

    it('logs at error level, because content is retained past its window', async () => {
      const { runner, logger } = withFailures();

      await runner.run();

      expect(loggingSystemMock.collect(logger).error).toEqual([
        [expect.stringContaining('Failed to scrub report content on 1 report(s)')],
      ]);
    });

    it('accumulates the count across runs', async () => {
      const { runner } = setupRunner(
        { updated: 0, failures: [{ id: 'r' }, { id: 'r2' }] },
        {
          totalReportsFailed: 5,
        }
      );

      const result = await runner.run();

      expect(result.state).toEqual(expect.objectContaining({ totalReportsFailed: 7 }));
    });

    // `conflicts: 'proceed'` skips these, and the query keys on the absence of
    // `lineage.content_scrubbed_at`, so the next run re-selects them. Counting
    // them as failures would make a routine write race look like data retention
    // breaking.
    it('does not count a version conflict as a failure', async () => {
      const { runner } = setupRunner({ updated: 2, version_conflicts: 4 });

      const result = await runner.run();

      expect(result.state).toEqual(expect.objectContaining({ totalReportsFailed: 0 }));
    });

    it('does not log a version conflict as an error', async () => {
      const { runner, logger } = setupRunner({ updated: 2, version_conflicts: 4 });

      await runner.run();

      expect(loggingSystemMock.collect(logger).error).toEqual([]);
    });
  });

  it('treats a missing reports index as a no-op', async () => {
    const notFound = Object.assign(new Error('index_not_found_exception'), { statusCode: 404 });
    const { runner } = setupRunner(notFound);

    await expect(runner.run()).resolves.toEqual({ state: {} });
  });

  it('surfaces unexpected Elasticsearch failures', async () => {
    const boom = Object.assign(new Error('mapping is broken'), { statusCode: 400 });
    const { runner } = setupRunner(boom);

    await expect(runner.run()).rejects.toThrow(/mapping is broken/);
  });
});
