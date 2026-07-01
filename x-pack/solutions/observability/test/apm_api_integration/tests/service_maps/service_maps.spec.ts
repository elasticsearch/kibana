/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { first, last, orderBy, uniq } from 'lodash';
import type { ApmApiError, SupertestReturnType } from '../../common/apm_api_supertest';
import archives_metadata from '../../common/fixtures/es_archiver/archives_metadata';
import type { FtrProviderContext } from '../../common/ftr_provider_context';

type DependencyResponse = SupertestReturnType<'GET /internal/apm/service-map/dependency'>;
type ServiceMapResponse = SupertestReturnType<'GET /internal/apm/service-map'>;

export default function serviceMapsApiTests({ getService }: FtrProviderContext) {
  const apmApiClient = getService('apmApiClient');
  const registry = getService('registry');

  const archiveName = 'apm_8.0.0';
  const metadata = archives_metadata[archiveName];

  registry.when('Service map with a basic license', { config: 'basic', archives: [] }, () => {
    describe('basic license', function () {
      this.tags('skipFIPS');
      it('is only be available to users with Platinum license (or higher)', async () => {
        try {
          await apmApiClient.readUser({
            endpoint: `GET /internal/apm/service-map`,
            params: {
              query: {
                start: metadata.start,
                end: metadata.end,
                environment: 'ENVIRONMENT_ALL',
              },
            },
          });

          expect(true).to.be(false);
        } catch (e) {
          const err = e as ApmApiError;
          expect(err.res.status).to.be(403);
          expectSnapshot(err.res.body.message).toMatchInline(
            `"In order to access Service maps, you must be subscribed to an Elastic Platinum license. With it, you'll have the ability to visualize your entire application stack along with your APM data."`
          );
        }
      });
    });
  });

  registry.when('Service map with data', { config: 'trial', archives: ['apm_8.0.0'] }, () => {
    describe('/internal/apm/service-map with data', () => {
      let response: ServiceMapResponse;
      before(async () => {
        response = await apmApiClient.readUser({
          endpoint: `GET /internal/apm/service-map`,
          params: {
            query: {
              environment: 'ENVIRONMENT_ALL',
              start: metadata.start,
              end: metadata.end,
            },
          },
        });
      });

      it('returns service map elements', () => {
        expect(response.status).to.be(200);
        expect(response.body.spans.length).to.be.greaterThan(0);
      });

      it('returns servicesData equal empty array if services have no traces', () => {
        const { spans, servicesData } = response.body;

        expect(servicesData.length).to.be.equal(0);

        const externalDestinations = uniq(
          spans
            .filter((element) => element.spanDestinationServiceResource)
            .map((element) => element.spanDestinationServiceResource)
        ).sort();

        expectSnapshot(externalDestinations).toMatchInline(`
              Array [
                "elasticsearch",
                "opbeans-frontend:3000",
                "opbeans:3000",
                "postgresql",
                "redis",
                "sqlite",
              ]
            `);
      });

      describe('with ML data', () => {
        describe('with the default apm user', () => {
          before(async () => {
            response = await apmApiClient.readUser({
              endpoint: `GET /internal/apm/service-map`,
              params: {
                query: {
                  environment: 'ENVIRONMENT_ALL',
                  start: metadata.start,
                  end: metadata.end,
                },
              },
            });
          });

          it('returns the correct anomaly stats', () => {
            const dataWithAnomalies = response.body.anomalies?.serviceAnomalies;
            expect(dataWithAnomalies).not.to.be.empty();
            expectSnapshot(dataWithAnomalies.length).toMatchInline(`7`);
            expectSnapshot(orderBy(dataWithAnomalies, 'serviceName').slice(0, 3)).toMatchInline(`
                    Array [
                      Object {
                        "actualValue": 868025.86875,
                        "anomalyScore": 0,
                        "jobId": "apm-production-6117-high_mean_transaction_duration",
                        "serviceName": "opbeans-dotnet",
                        "transactionType": "request",
                      },
                      Object {
                        "actualValue": 102786.319148936,
                        "anomalyScore": 0,
                        "jobId": "apm-testing-41e5-high_mean_transaction_duration",
                        "serviceName": "opbeans-go",
                        "transactionType": "request",
                      },
                      Object {
                        "actualValue": 175568.855769231,
                        "anomalyScore": 0,
                        "jobId": "apm-production-6117-high_mean_transaction_duration",
                        "serviceName": "opbeans-java",
                        "transactionType": "request",
                      },
                    ]
                  `);
          });

          it('ensures anomaly scores are never null or undefined', () => {
            // Validates the fix for the bug where top_metrics on mixed document types
            // (record + model_plot) could return model_plot docs with null record_score
            const dataWithAnomalies = response.body.anomalies?.serviceAnomalies;
            expect(dataWithAnomalies).not.to.be.empty();

            dataWithAnomalies.forEach((anomaly) => {
              // anomalyScore must be a valid finite number >= 0 (never null/undefined/NaN)
              expect(anomaly.anomalyScore).to.be.a('number');
              expect(anomaly.anomalyScore).not.to.be(null);
              expect(Number.isFinite(anomaly.anomalyScore)).to.be(true);
              expect(anomaly.anomalyScore >= 0).to.be(true);

              // All monitored services must have complete, valid data
              expect(anomaly.actualValue).to.be.a('number');
              expect(Number.isFinite(anomaly.actualValue)).to.be(true);
              expect(anomaly.transactionType).to.be.a('string');
              expect(anomaly.transactionType.length).to.be.greaterThan(0);
              expect(anomaly.serviceName).to.be.a('string');
              expect(anomaly.serviceName.length).to.be.greaterThan(0);
              expect(anomaly.jobId).to.match(/^apm-/);
            });
          });
        });
        describe('with a user that does not have access to ML', () => {
          before(async () => {
            response = await apmApiClient.noMlAccessUser({
              endpoint: `GET /internal/apm/service-map`,
              params: {
                query: {
                  environment: 'ENVIRONMENT_ALL',
                  start: metadata.start,
                  end: metadata.end,
                },
              },
            });
          });
          it('returns service map elements without anomaly stats', () => {
            expect(response.status).to.be(200);
            const dataWithAnomalies = response.body.anomalies?.serviceAnomalies;
            expect(dataWithAnomalies).to.be.empty();
          });
        });
      });

      describe('with a single service', () => {
        describe('when ENVIRONMENT_ALL is selected', () => {
          before(async () => {
            response = await apmApiClient.readUser({
              endpoint: `GET /internal/apm/service-map`,
              params: {
                query: {
                  environment: 'ENVIRONMENT_ALL',
                  start: metadata.start,
                  end: metadata.end,
                  serviceName: 'opbeans-java',
                },
              },
            });
          });

          it('retuns status code 200', () => {
            expect(response.status).to.be(200);
          });

          it('returns some elements', () => {
            expect(response.body.spans.length).to.be.greaterThan(1);
          });
        });
      });
    });

    describe('/internal/apm/service-map/dependency with data', () => {
      let response: DependencyResponse;
      before(async () => {
        response = await apmApiClient.readUser({
          endpoint: `GET /internal/apm/service-map/dependency`,
          params: {
            query: {
              dependencies: 'postgresql',
              start: metadata.start,
              end: metadata.end,
              environment: 'ENVIRONMENT_ALL',
            },
          },
        });
      });

      it('retuns status code 200', () => {
        expect(response.status).to.be(200);
      });

      it('returns some error rate', () => {
        expect(response.body.currentPeriod?.failedTransactionsRate?.value).to.eql(0);
        expect(
          response.body.currentPeriod?.failedTransactionsRate?.timeseries?.length
        ).to.be.greaterThan(0);
      });

      it('returns some latency', () => {
        expect(response.body.currentPeriod?.transactionStats?.latency?.value).to.be.greaterThan(0);
        expect(
          response.body.currentPeriod?.transactionStats?.latency?.timeseries?.length
        ).to.be.greaterThan(0);
      });

      it('returns some throughput', () => {
        expect(response.body.currentPeriod?.transactionStats?.throughput?.value).to.be.greaterThan(
          0
        );
        expect(
          response.body.currentPeriod?.transactionStats?.throughput?.timeseries?.length
        ).to.be.greaterThan(0);
      });
    });

    describe('With comparison', () => {
      describe('/internal/apm/service-map/dependency with comparison', () => {
        let response: DependencyResponse;
        before(async () => {
          response = await apmApiClient.readUser({
            endpoint: `GET /internal/apm/service-map/dependency`,
            params: {
              query: {
                dependencies: 'postgresql',
                start: metadata.start,
                end: metadata.end,
                environment: 'ENVIRONMENT_ALL',
                offset: '5m',
              },
            },
          });
        });

        it('returns some data', () => {
          const { currentPeriod, previousPeriod } = response.body;
          [
            currentPeriod.failedTransactionsRate,
            previousPeriod?.failedTransactionsRate,
            currentPeriod.transactionStats?.latency,
            previousPeriod?.transactionStats?.latency,
            currentPeriod.transactionStats?.throughput,
            previousPeriod?.transactionStats?.throughput,
          ].map((value) => expect(value?.timeseries?.length).to.be.greaterThan(0));
        });

        it('has same start time for both periods', () => {
          const { currentPeriod, previousPeriod } = response.body;
          expect(first(currentPeriod.failedTransactionsRate?.timeseries)?.x).to.equal(
            first(previousPeriod?.failedTransactionsRate?.timeseries)?.x
          );
        });

        it('has same end time for both periods', () => {
          const { currentPeriod, previousPeriod } = response.body;
          expect(last(currentPeriod.failedTransactionsRate?.timeseries)?.x).to.equal(
            last(previousPeriod?.failedTransactionsRate?.timeseries)?.x
          );
        });

        it('returns same number of buckets for both periods', () => {
          const { currentPeriod, previousPeriod } = response.body;
          expect(currentPeriod.failedTransactionsRate?.timeseries?.length).to.be(
            previousPeriod?.failedTransactionsRate?.timeseries?.length
          );
        });
      });

      describe('/internal/apm/service-map/dependency with sourceServiceName and array of dependencies', () => {
        let response: DependencyResponse;
        before(async () => {
          response = await apmApiClient.readUser({
            endpoint: `GET /internal/apm/service-map/dependency`,
            params: {
              query: {
                dependencies: ['postgresql', 'redis'],
                sourceServiceName: 'opbeans-java',
                start: metadata.start,
                end: metadata.end,
                environment: 'ENVIRONMENT_ALL',
              },
            },
          });
        });

        it('returns status code 200', () => {
          expect(response.status).to.be(200);
        });

        it('returns edge data with source service filter applied', () => {
          expect(response.body.currentPeriod?.failedTransactionsRate).to.not.be(undefined);
          expect(response.body.currentPeriod?.transactionStats?.latency).to.not.be(undefined);
          expect(response.body.currentPeriod?.transactionStats?.throughput).to.not.be(undefined);
        });
      });
    });
  });
}
