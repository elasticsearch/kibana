/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { decodeCloudIdMock, parseDeploymentIdFromDeploymentUrlMock } from './plugin.test.mocks';
import { coreMock } from '@kbn/core/server/mocks';
import type { CloudConfigType } from './config';
import { CloudPlugin } from './plugin';
import type { DecodedCloudId } from '../common/decode_cloud_id';

const baseConfig = {
  base_url: 'https://cloud.elastic.co',
  deployment_url: '/abc123',
  profile_url: '/user/settings/',
  projects_url: '/projects/',
  organization_url: '/account/',
};

describe('Cloud Plugin', () => {
  beforeEach(() => {
    parseDeploymentIdFromDeploymentUrlMock.mockReset().mockReturnValue('deployment-id');
    decodeCloudIdMock.mockReset().mockReturnValue({});
  });

  const setupPlugin = (configParts: Partial<CloudConfigType> = {}) => {
    const initContext = coreMock.createPluginInitializerContext({
      ...baseConfig,
      id: 'cloudId',
      cname: 'cloud.elastic.co',
      csp: 'aws',
      ...configParts,
    });
    const plugin = new CloudPlugin(initContext);

    const coreSetup = coreMock.createSetup();
    const setup = plugin.setup(coreSetup, {});
    const start = plugin.start();

    return { setup, start };
  };

  describe('#setup', () => {
    describe('interface', () => {
      it('snapshot', () => {
        const { setup } = setupPlugin();
        expect(setup).toMatchSnapshot();
      });
      it('exposes isCloudEnabled', () => {
        const { setup } = setupPlugin();
        expect(setup.isCloudEnabled).toBe(true);
      });

      describe('isEce', () => {
        it('defaults to true for cloud-enabled non-serverless deployments when isSaasContainer is missing', () => {
          const { setup } = setupPlugin();
          expect(setup.isEce).toBe(true);
        });

        it('is false when isSaasContainer is true', () => {
          const { setup } = setupPlugin({
            isSaasContainer: true,
          });
          expect(setup.isEce).toBe(false);
        });

        it('is true when isSaasContainer is false', () => {
          const { setup } = setupPlugin({
            isSaasContainer: false,
          });
          expect(setup.isEce).toBe(true);
        });

        it('is undefined for self-managed deployments when isSaasContainer is missing', () => {
          const { setup } = setupPlugin({
            id: undefined,
          });
          expect(setup.isEce).toBeUndefined();
        });

        it('is undefined for serverless deployments when isSaasContainer is missing', () => {
          const { setup } = setupPlugin({
            serverless: {
              project_id: 'my-awesome-project',
            },
          });
          expect(setup.isEce).toBeUndefined();
        });
      });

      it('exposes cloudId', () => {
        const { setup } = setupPlugin();
        expect(setup.cloudId).toBe('cloudId');
      });

      it('exposes instanceSizeMb', () => {
        const { setup } = setupPlugin();
        expect(setup.instanceSizeMb).toBeUndefined();
      });

      it('exposes apm', () => {
        const { setup } = setupPlugin();
        expect(setup.apm).toStrictEqual({ url: undefined, secretToken: undefined });
      });

      it('exposes deploymentId', () => {
        parseDeploymentIdFromDeploymentUrlMock.mockReturnValue('some-deployment-id');
        const { setup } = setupPlugin();
        expect(setup.deploymentId).toBe('some-deployment-id');
        expect(parseDeploymentIdFromDeploymentUrlMock).toHaveBeenCalledTimes(1);
        expect(parseDeploymentIdFromDeploymentUrlMock).toHaveBeenCalledWith(
          baseConfig.deployment_url
        );
      });

      it('exposes csp', () => {
        const { setup } = setupPlugin();
        expect(setup.csp).toBe('aws');
      });

      it('exposes components decoded from the cloudId', () => {
        const decodedId: DecodedCloudId = {
          defaultPort: '9000',
          host: 'host',
          elasticsearchClusterId: 'elasticsearch-cluster-id',
          elasticsearchUrl: 'elasticsearch-url',
          kibanaUrl: 'kibana-url',
        };
        decodeCloudIdMock.mockReturnValue(decodedId);
        const { setup } = setupPlugin();
        expect(setup).toEqual(
          expect.objectContaining({
            cloudDefaultPort: '9000',
            cloudHost: 'host',
            elasticsearchUrl: 'elasticsearch-url',
            kibanaUrl: 'kibana-url',
            elasticsearchClusterId: 'elasticsearch-cluster-id',
          })
        );
        expect(decodeCloudIdMock).toHaveBeenCalledTimes(1);
        expect(decodeCloudIdMock).toHaveBeenCalledWith('cloudId', expect.any(Object));
      });

      it('exposes `onboarding.default_solution`', () => {
        const { setup } = setupPlugin({
          onboarding: {
            default_solution: 'Elasticsearch',
          },
        });
        expect(setup.onboarding.defaultSolution).toBe('es');
      });

      describe('isServerlessEnabled', () => {
        it('is `true` when `serverless.projectId` is set', () => {
          const { setup } = setupPlugin({
            serverless: {
              project_id: 'my-awesome-project',
            },
          });
          expect(setup.isServerlessEnabled).toBe(true);
        });

        it('is `false` when `serverless.projectId` is not set', () => {
          const { setup } = setupPlugin({
            serverless: undefined,
          });
          expect(setup.isServerlessEnabled).toBe(false);
        });
      });

      it('exposes `serverless.projectId`', () => {
        const { setup } = setupPlugin({
          serverless: {
            project_id: 'my-awesome-project',
          },
        });
        expect(setup.serverless.projectId).toBe('my-awesome-project');
      });

      it('exposes `serverless.projectName`', () => {
        const { setup } = setupPlugin({
          serverless: {
            project_id: 'my-awesome-project',
            project_name: 'My Awesome Project',
          },
        });
        expect(setup.serverless.projectName).toBe('My Awesome Project');
      });

      it('exposes `serverless.projectType`', () => {
        const { setup } = setupPlugin({
          serverless: {
            project_id: 'my-awesome-project',
            project_name: 'My Awesome Project',
            project_type: 'security',
          },
        });
        expect(setup.serverless.projectType).toBe('security');
      });
      describe('exposes isInTrial', () => {
        it('is `true` when `serverless.in_trial` is set', () => {
          const { setup } = setupPlugin({
            serverless: {
              project_id: 'my-awesome-project',
              in_trial: true,
            },
          });

          expect(setup.isInTrial()).toBe(true);
        });
        it('is `false` when `serverless.in_trial` is set to false', () => {
          const { setup } = setupPlugin({
            serverless: {
              project_id: 'my-awesome-project',
              in_trial: false,
            },
          });
          expect(setup.isInTrial()).toBe(false);
        });
        it('is `true` when `trial_end_date` is set and is in the future', () => {
          const { setup } = setupPlugin({
            trial_end_date: new Date(Date.now() + 10000).toISOString(),
          });

          expect(setup.isInTrial()).toBe(true);
        });
        it('is `false` when `trial_end_date` is set and is in the past', () => {
          const { setup } = setupPlugin({
            trial_end_date: new Date(Date.now() - 10000).toISOString(),
          });

          expect(setup.isInTrial()).toBe(false);
        });
        it('is `false` when `serverless.in_trial` & `trial_end_date` are not set', () => {
          const { setup } = setupPlugin({});
          expect(setup.isInTrial()).toBe(false);
        });
      });
      describe('exposes trialDaysLeft', () => {
        it('returns positive number when `trial_end_date` is in the future', () => {
          const { setup } = setupPlugin({
            trial_end_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          });
          expect(setup.trialDaysLeft()).toBe(5);
        });
        it('returns 0 when `trial_end_date` is in the past', () => {
          const { setup } = setupPlugin({
            trial_end_date: new Date(Date.now() - 10000).toISOString(),
          });
          expect(setup.trialDaysLeft()).toBe(0);
        });
        it('returns undefined when `trial_end_date` is not set', () => {
          const { setup } = setupPlugin({});
          expect(setup.trialDaysLeft()).toBeUndefined();
        });
        it('returns undefined when `trial_end_date` is invalid', () => {
          const { setup } = setupPlugin({ trial_end_date: 'invalid-date' });
          expect(setup.trialDaysLeft()).toBeUndefined();
        });
      });
    });
  });

  describe('#start', () => {
    describe('interface', () => {
      it('snapshot', () => {
        const { start } = setupPlugin();
        expect(start).toMatchSnapshot();
      });
      it('exposes isCloudEnabled', () => {
        const { start } = setupPlugin();
        expect(start.isCloudEnabled).toBe(true);
      });

      describe('exposes isInTrial', () => {
        it('is `true` when `serverless.in_trial` is set', () => {
          const { start } = setupPlugin({
            serverless: {
              project_id: 'my-awesome-project',
              in_trial: true,
            },
          });

          expect(start.isInTrial()).toBe(true);
        });
        it('is `false` when `serverless.in_trial` is set to false', () => {
          const { start } = setupPlugin({
            serverless: {
              project_id: 'my-awesome-project',
              in_trial: false,
            },
          });
          expect(start.isInTrial()).toBe(false);
        });
        it('is `true` when `trial_end_date` is set and is in the future', () => {
          const { start } = setupPlugin({
            trial_end_date: new Date(Date.now() + 10000).toISOString(),
          });

          expect(start.isInTrial()).toBe(true);
        });
        it('is `false` when `trial_end_date` is set and is in the past', () => {
          const { start } = setupPlugin({
            trial_end_date: new Date(Date.now() - 10000).toISOString(),
          });

          expect(start.isInTrial()).toBe(false);
        });
        it('is `false` when `trial_end_date` is not a valid date', () => {
          const { start } = setupPlugin({
            trial_end_date: 'invalid-date',
          });

          expect(start.isInTrial()).toBe(false);
        });
        it('is `false` when `serverless.in_trial` & `trial_end_date` are not set', () => {
          const { start } = setupPlugin({});
          expect(start.isInTrial()).toBe(false);
        });
      });
      describe('exposes trialDaysLeft', () => {
        it('returns positive number when `trial_end_date` is in the future', () => {
          const { start } = setupPlugin({
            trial_end_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          });
          expect(start.trialDaysLeft()).toBe(5);
        });
        it('returns 0 when `trial_end_date` is in the past', () => {
          const { start } = setupPlugin({
            trial_end_date: new Date(Date.now() - 10000).toISOString(),
          });
          expect(start.trialDaysLeft()).toBe(0);
        });
        it('returns undefined when `trial_end_date` is invalid', () => {
          const { start } = setupPlugin({ trial_end_date: 'invalid-date' });
          expect(start.trialDaysLeft()).toBeUndefined();
        });
        it('returns undefined when `trial_end_date` is not set', () => {
          const { start } = setupPlugin({});
          expect(start.trialDaysLeft()).toBeUndefined();
        });
      });
    });
  });
});
