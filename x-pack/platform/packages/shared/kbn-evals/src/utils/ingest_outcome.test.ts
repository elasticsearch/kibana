/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { classifyIngestOutcome, createIngestOutcome, recordIngestFailure } from './ingest_outcome';

describe('ingest outcome', () => {
  describe('recordIngestFailure', () => {
    it('keeps the first failure reason so later noise cannot mask the original cause', () => {
      const outcome = createIngestOutcome();

      recordIngestFailure(outcome, 'unauthorized for API key');
      recordIngestFailure(outcome, 'some later unrelated error');

      expect(outcome.rejected).toBe(2);
      expect(outcome.firstFailure).toBe('unauthorized for API key');
    });
  });

  describe('classifyIngestOutcome', () => {
    it('passes a run where nothing was rejected', () => {
      const outcome = createIngestOutcome();
      outcome.ingested = 42;

      expect(classifyIngestOutcome(outcome)).toEqual({ kind: 'ok' });
    });

    it('treats a run where every document was rejected as a total failure', () => {
      // The regression this guards: a dead or unprivileged export key rejects
      // every score while the run still exits 0, producing no durable results.
      const outcome = createIngestOutcome();
      recordIngestFailure(outcome, 'action [indices:data/write/bulk[s]] is unauthorized');

      const verdict = classifyIngestOutcome(outcome);

      expect(verdict.kind).toBe('total-failure');
      expect(verdict).toMatchObject({
        message: expect.stringContaining('no durable results'),
      });
      expect(verdict).toMatchObject({
        message: expect.stringContaining('is unauthorized'),
      });
    });

    it('reports partial rejection without failing a run that still exported scores', () => {
      const outcome = createIngestOutcome();
      outcome.ingested = 10;
      recordIngestFailure(outcome, 'mapper_parsing_exception');

      const verdict = classifyIngestOutcome(outcome);

      expect(verdict.kind).toBe('partial');
      expect(verdict).toMatchObject({
        message: expect.stringContaining('10 ingested, 1 rejected'),
      });
    });

    it('does not fail a run that exported nothing because it had nothing to export', () => {
      // Zero ingested with zero rejected means no scores were produced at all
      // (e.g. an empty suite) — that is not an export failure.
      expect(classifyIngestOutcome(createIngestOutcome())).toEqual({ kind: 'ok' });
    });
  });
});
