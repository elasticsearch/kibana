/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { v4 as uuidv4 } from 'uuid';
import type { NewTermsRuleCreateProps } from '@kbn/security-solution-plugin/common/api/detection_engine';
import { getCreateNewTermsRulesSchemaMock } from '@kbn/security-solution-plugin/common/api/detection_engine/model/rule_schema/mocks';
import { deleteAllRules, deleteAllAlerts } from '@kbn/detections-response-ftr-services';

import { previewRule, dataGeneratorFactory } from '../../../../utils';
import type { FtrProviderContext } from '../../../../../../ftr_provider_context';

const historicalWindowStart = '2022-10-13T05:00:04.000Z';
const ruleExecutionStart = '2022-10-19T05:00:04.000Z';

/**
 * Logged requests for the aggregation execution path of the New Terms rule (the fallback used
 * when the ES|QL approach is disabled). The ES|QL path produces a different sequence of requests
 * and is asserted in the trial-license tier spec of the same name.
 */
export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const es = getService('es');
  const log = getService('log');
  const { indexEnhancedDocuments } = dataGeneratorFactory({
    es,
    index: 'new_terms',
    log,
  });

  /**
   * indexes 2 sets of documents:
   * - documents in historical window
   * - documents in rule execution window
   * @returns id of documents
   */
  const newTermsTestExecutionSetup = async ({
    historicalDocuments,
    ruleExecutionDocuments,
  }: {
    historicalDocuments: Array<Record<string, unknown>>;
    ruleExecutionDocuments: Array<Record<string, unknown>>;
  }) => {
    const testId = uuidv4();

    await indexEnhancedDocuments({
      interval: [historicalWindowStart, ruleExecutionStart],
      id: testId,
      documents: historicalDocuments,
    });

    await indexEnhancedDocuments({
      id: testId,
      documents: ruleExecutionDocuments,
    });

    return testId;
  };

  describe('@ess New terms preview logged requests - aggregation approach', () => {
    const rule: NewTermsRuleCreateProps = {
      ...getCreateNewTermsRulesSchemaMock('rule-1', true),
      index: ['new_terms'],
      new_terms_fields: ['host.name', 'host.ip'],
      from: ruleExecutionStart,
      history_window_start: historicalWindowStart,
      query: '*',
    };

    before(async () => {
      await esArchiver.load(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/new_terms'
      );
    });

    after(async () => {
      await esArchiver.unload(
        'x-pack/solutions/security/test/fixtures/es_archives/security_solution/new_terms'
      );
      await deleteAllAlerts(supertest, log, es);
      await deleteAllRules(supertest, log);
    });

    it('should not return requests property when not enabled', async () => {
      const { logs } = await previewRule({
        supertest,
        rule,
      });

      expect(logs[0].requests).toEqual(undefined);
    });

    it('should return requests property when enable_logged_requests set to true for single new term field', async () => {
      // historical window documents
      const historicalDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.1' },
        },
        {
          host: { name: 'host-1', ip: '127.0.0.2' },
        },
      ];

      // rule execution documents
      const ruleExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.2' },
        },
        {
          host: { name: 'host-2', ip: '127.0.0.1' },
        },
      ];

      const testId = await newTermsTestExecutionSetup({
        historicalDocuments,
        ruleExecutionDocuments,
      });

      const { logs } = await previewRule({
        supertest,
        rule: { ...rule, query: `id: "${testId}"`, new_terms_fields: ['host.name'] },
        enableLoggedRequests: true,
      });

      expect(logs[0].requests?.length).toEqual(4);
      const requests = logs[0].requests ?? [];

      expect(requests[0].description).toBe('Find all values');
      expect(requests[0].request_type).toBe('findAllTerms');

      expect(requests[1].description).toBe('Find new values');
      expect(requests[1].request_type).toBe('findNewTerms');

      expect(requests[2].description).toBe('Find documents associated with new values');
      expect(requests[2].request_type).toBe('findDocuments');

      expect(requests[3].description).toBe('Find all values after host.name: host-2');
    });

    it('should return requests property when enable_logged_requests set to true for multiple fields', async () => {
      // historical window documents
      const historicalDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.1' },
        },
        {
          host: { name: 'host-1', ip: '127.0.0.2' },
        },
      ];

      // rule execution documents
      const ruleExecutionDocuments = [
        {
          host: { name: 'host-0', ip: '127.0.0.2' },
        },
        {
          host: { name: 'host-1', ip: '127.0.0.1' },
        },
      ];

      const testId = await newTermsTestExecutionSetup({
        historicalDocuments,
        ruleExecutionDocuments,
      });

      const { logs } = await previewRule({
        supertest,
        rule: { ...rule, query: `id: "${testId}"` },
        enableLoggedRequests: true,
      });

      expect(logs[0].requests?.length).toEqual(4);
      const requests = logs[0].requests ?? [];

      expect(requests[0].description).toBe('Find all values');
      expect(requests[0].request_type).toBe('findAllTerms');

      expect(requests[1].description).toBe('Find new values');
      expect(requests[1].request_type).toBe('findNewTerms');

      expect(requests[2].description).toBe('Find documents associated with new values');
      expect(requests[2].request_type).toBe('findDocuments');
    });
  });
};
