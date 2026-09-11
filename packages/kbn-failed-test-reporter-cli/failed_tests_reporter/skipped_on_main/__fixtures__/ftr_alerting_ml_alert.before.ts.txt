/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { sample } from 'lodash';
import { duration } from 'moment';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { Job } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { MlAnomalyDetectionAlertParams } from '@kbn/ml-common-types/alerts';
import { ANOMALY_SCORE_MATCH_GROUP_ID } from '@kbn/ml-plugin/server/lib/alerts/register_anomaly_detection_alert_type';
import { ML_ALERT_TYPES } from '@kbn/ml-plugin/common/constants/alerts';
import { ESTestIndexTool, ES_TEST_INDEX_NAME } from '@kbn/alerting-api-integration-helpers';
import { Spaces } from '../../../../../scenarios';
import { getUrlPrefix, ObjectRemover } from '../../../../../../common/lib';
import type { FtrProviderContext } from '../../../../../../common/ftr_provider_context';

const ACTION_TYPE_ID = '.index';
const ALERT_TYPE_ID = ML_ALERT_TYPES.ANOMALY_DETECTION;
const ES_TEST_INDEX_SOURCE = 'ml-alert:anomaly-detection';
const ES_TEST_INDEX_REFERENCE = '-na-';
const ES_TEST_OUTPUT_INDEX_NAME = `${ES_TEST_INDEX_NAME}-ad-alert-output`;

const AAD_INDEX = '.alerts-ml.anomaly-detection.alerts-default';

const ALERT_INTERVAL_SECONDS = 3;

const AD_JOB_ID = 'rt-anomaly-mean-value';
const DATAFEED_ID = `datafeed-${AD_JOB_ID}`;
const BASIC_TEST_DATA_INDEX = `rt-ad-basic-data-anomalies`;
const DOC_KEYS = ['first-key', 'second-key', 'third-key'];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getAnomalyDetectionConfig(): Job {
  return {
    job_id: AD_JOB_ID,
    description: '',
    groups: ['real-time', 'anomaly-alerting'],
    analysis_config: {
      bucket_span: '1m',
      detectors: [{ function: 'mean', field_name: 'value', partition_field_name: 'key' }],
      influencers: ['key'],
    },
    data_description: { time_field: '@timestamp' },
    analysis_limits: { model_memory_limit: '11MB' },
    model_plot_config: { enabled: true, annotations_enabled: true },
  } as Job;
}

export function getDatafeedConfig(): Datafeed {
  return {
    indices: [BASIC_TEST_DATA_INDEX],
    query: { bool: { must: [{ match_all: {} }] } },
    runtime_mappings: {},
    query_delay: '5s',
    frequency: '10s',
    job_id: AD_JOB_ID,
    datafeed_id: DATAFEED_ID,
  } as Datafeed;
}

export default function alertTests({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const retry = getService('retry');
  const es = getService('es');
  const log = getService('log');
  const ml = getService('ml');

  const esTestIndexTool = new ESTestIndexTool(es, retry);
  const esTestIndexToolOutput = new ESTestIndexTool(es, retry, ES_TEST_OUTPUT_INDEX_NAME);

  describe('alert', () => {
    const objectRemover = new ObjectRemover(supertest);
    let actionId: string;

    beforeEach(async () => {
      await esTestIndexTool.destroy();
      await esTestIndexTool.setup();

      await esTestIndexToolOutput.destroy();
      await esTestIndexToolOutput.setup();

      await ml.testResources.setKibanaTimeZoneToUTC();

      actionId = await createAction();

      // Create source index
      await createSourceIndex();

      // Ingest normal docs
      await ingestNormalDocs(BASIC_TEST_DATA_INDEX);

      await ml.api.createAnomalyDetectionJob(getAnomalyDetectionConfig(), Spaces.space1.id);
      await ml.api.createDatafeed(getDatafeedConfig(), Spaces.space1.id);
      await ml.api.openAnomalyDetectionJob(AD_JOB_ID);
      await ml.api.startDatafeed(DATAFEED_ID);
    });

    afterEach(async () => {
      await objectRemover.removeAll();
      await esTestIndexTool.destroy();
      await esTestIndexToolOutput.destroy();
      await ml.api.deleteAnomalyDetectionJobES(AD_JOB_ID);
      await ml.api.cleanMlIndices();
      await ml.api.deleteIndices(BASIC_TEST_DATA_INDEX);
    });

    it('runs correctly', async () => {
      await createAlert({
        name: 'Test AD job',
        // To make sure the alert is triggered ASAP
        includeInterim: true,
        jobSelection: {
          jobIds: [AD_JOB_ID],
        },
        severity: 0,
        lookbackInterval: undefined,
        resultType: 'bucket',
        topNBuckets: 3,
      });

      //  Ingest anomalous records
      await ingestAnomalousDoc(BASIC_TEST_DATA_INDEX);

      log.debug('Wait for bucket to finalize...');
      await sleep(60000);

      log.debug('Checking created alert instances...');

      const docs = await waitForDocs(1);
      for (const doc of docs) {
        const { name, message, anomalyExplorerUrl } = doc._source.params;

        expect(name).to.be('Test AD job');
        expect(message).to.be(
          'Alerts are raised based on real-time scores. Remember that scores may be adjusted over time as data continues to be analyzed.'
        );
        // check only part of the URL as time bounds vary based on the anomaly
        expect(anomalyExplorerUrl).to.contain(
          '/s/space1/app/ml/explorer/?_g=(ml%3A(jobIds%3A!(rt-anomaly-mean-value))'
        );
      }

      log.debug('Checking docs in the alerts-as-data index...');

      const aadDocs = await waitForAAD(1);

      for (const doc of aadDocs) {
        expect(doc._source['kibana.alert.job_id']).to.be(AD_JOB_ID);
        expect(doc._source['kibana.alert.url']).to.contain(
          '/s/space1/app/ml/explorer/?_g=(ml%3A(jobIds%3A!(rt-anomaly-mean-value))'
        );
        expect(doc._source['kibana.alert.anomaly_score'][0]).to.be.above(0);
      }
    });

    describe('custom filter validation', () => {
      it('rejects disallowed field: job_id', async () => {
        const { status, body } = await supertest
          .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
          .set('kbn-xsrf', 'foo')
          .send({
            name: 'Test disallowed field job_id',
            consumer: 'alerts',
            enabled: true,
            rule_type_id: ALERT_TYPE_ID,
            schedule: { interval: `${ALERT_INTERVAL_SECONDS}s` },
            actions: [],
            params: {
              jobSelection: { jobIds: [AD_JOB_ID] },
              severity: 0,
              resultType: 'record',
              includeInterim: true,
              kqlQueryString: 'job_id: "test"',
            },
          });

        expect(status).to.be(400);
        expect(body.message).to.contain('job_id');
        expect(body.message).to.contain('not allowed');
      });
    });

    describe('custom filter functionality', () => {
      it('filters alerts by partition_field_value', async () => {
        await createAlert({
          name: 'Test filtered alerts',
          includeInterim: true,
          jobSelection: {
            jobIds: [AD_JOB_ID],
          },
          severity: 0,
          lookbackInterval: undefined,
          resultType: 'record',
          topNBuckets: undefined,
          kqlQueryString: 'partition_field_value: "first-key"',
        });

        await ingestAnomalousDocWithKey(BASIC_TEST_DATA_INDEX, 'first-key');

        log.debug('Checking created alert instances...');

        const docs = await waitForDocs(1);
        expect(docs.length).to.be.greaterThan(0);
      });

      it('does not alert when filter does not match', async () => {
        await createAlert({
          name: 'Test filtered alerts no match',
          includeInterim: true,
          jobSelection: {
            jobIds: [AD_JOB_ID],
          },
          severity: 0,
          lookbackInterval: undefined,
          resultType: 'record',
          topNBuckets: undefined,
          kqlQueryString: 'partition_field_value: "non-existent-key"',
        });

        await ingestAnomalousDocWithKey(BASIC_TEST_DATA_INDEX, 'first-key');

        log.debug('Waiting for potential alerts to be created...');
        // wait 15s - 5x alert interval
        await sleep(ALERT_INTERVAL_SECONDS * 5 * 1000);

        log.debug('Verifying no alerts were created...');

        const docs = await waitForDocs(0);
        expect(docs.length).to.be(0);
      });
    });

    async function waitForDocs(count: number): Promise<any[]> {
      return await esTestIndexToolOutput.waitForDocs(
        ES_TEST_INDEX_SOURCE,
        ES_TEST_INDEX_REFERENCE,
        count
      );
    }

    async function waitForAAD(numDocs: number): Promise<any[]> {
      return await retry.try(async () => {
        const searchResult = await es.search({ index: AAD_INDEX, size: 1000 });

        // @ts-expect-error doesn't handle total: number
        const value = searchResult.hits.total.value?.value || searchResult.hits.total.value;
        if (value < numDocs) {
          // @ts-expect-error doesn't handle total: number
          throw new Error(`Expected ${numDocs} but received ${searchResult.hits.total.value}.`);
        }
        return searchResult.hits.hits;
      });
    }

    async function createAlert({
      name,
      ...params
    }: MlAnomalyDetectionAlertParams & { name: string }): Promise<string> {
      log.debug(`Creating an alerting rule "${name}"...`);
      const action = {
        id: actionId,
        group: ANOMALY_SCORE_MATCH_GROUP_ID,
        params: {
          documents: [
            {
              source: ES_TEST_INDEX_SOURCE,
              reference: ES_TEST_INDEX_REFERENCE,
              params: {
                name: '{{{rule.name}}}',
                message: '{{{context.message}}}',
                anomalyExplorerUrl: '{{{context.anomalyExplorerUrl}}}',
              },
            },
          ],
        },
      };

      const { status, body: createdAlert } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/alerting/rule`)
        .set('kbn-xsrf', 'foo')
        .send({
          name,
          consumer: 'alerts',
          enabled: true,
          rule_type_id: ALERT_TYPE_ID,
          schedule: { interval: `${ALERT_INTERVAL_SECONDS}s` },
          actions: [action],
          notify_when: 'onActiveAlert',
          params,
        });

      expect(status).to.be(200);

      const alertId = createdAlert.id;
      objectRemover.add(Spaces.space1.id, alertId, 'rule', 'alerting');

      return alertId;
    }

    async function createAction(): Promise<string> {
      log.debug('Creating an action...');
      // @ts-ignore
      const { statusCode, body: createdAction } = await supertest
        .post(`${getUrlPrefix(Spaces.space1.id)}/api/actions/connector`)
        .set('kbn-xsrf', 'foo')
        .send({
          name: 'index action for anomaly detection FT',
          connector_type_id: ACTION_TYPE_ID,
          config: {
            index: ES_TEST_OUTPUT_INDEX_NAME,
          },
          secrets: {},
        });

      expect(statusCode).to.be(200);

      log.debug(`Action with id "${createdAction.id}" has been created.`);

      const resultId = createdAction.id;
      objectRemover.add(Spaces.space1.id, resultId, 'connector', 'actions');

      return resultId;
    }

    async function createSourceIndex() {
      log.debug('Creating the source index...');
      await ml.api.createIndex(BASIC_TEST_DATA_INDEX, {
        properties: {
          '@timestamp': { type: 'date' },
          value: { type: 'integer' },
          key: { type: 'keyword' },
        },
      });
    }

    async function ingestNormalDocs(
      indexName: string,
      hoursAgo: number = 24,
      hoursFromNow: number = 4,
      secondsBetweenDocs: number = 30
    ) {
      log.debug(`Ingesting baseline documents into ${indexName}...`);
      const timestamp = Date.now();
      const start = timestamp - duration(hoursAgo, 'h').asMilliseconds();
      const end = timestamp - duration(hoursFromNow, 'h').asMilliseconds();

      log.debug(
        `> from ${start} until ${end} with one document every ${secondsBetweenDocs} seconds`
      );

      const step = duration(secondsBetweenDocs, 's').asMilliseconds();

      let docTime = start;
      const docs: Array<{ _index: string; '@timestamp': number; value: number; key: string }> = [];
      while (docTime + step < end) {
        for (const key of DOC_KEYS) {
          docs.push({
            _index: indexName,
            '@timestamp': docTime,
            value: Math.floor(Math.random() * 10 + 1),
            key,
          });
        }
        docTime += step;
      }

      const operations = docs.flatMap(({ _index, ...doc }) => {
        return [{ index: { _index } }, doc];
      });

      await es.bulk({
        refresh: 'wait_for',
        operations,
      });

      log.debug('> docs ingested.');
    }

    async function ingestAnomalousDoc(indexName: string) {
      log.debug('Ingesting anomalous doc...');
      await es.index({
        refresh: 'wait_for',
        index: indexName,
        body: { '@timestamp': Date.now(), value: 10 * 1000, key: sample(DOC_KEYS) },
      });
      log.debug('Anomalous doc indexed successfully...');
    }

    async function ingestAnomalousDocWithKey(indexName: string, key: string) {
      log.debug(`Ingesting anomalous doc with key '${key}'...`);
      await es.index({
        refresh: 'wait_for',
        index: indexName,
        body: { '@timestamp': Date.now(), value: 10 * 1000, key },
      });
      log.debug('Anomalous doc indexed successfully...');
    }
  });
}
