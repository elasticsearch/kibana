/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SavedObjectsClientContract,
  KibanaRequest,
  IScopedClusterClient,
} from '@kbn/core/server';
import type { DataViewsService } from '@kbn/data-views-plugin/common';
import type { Module } from '@kbn/ml-common-types/modules';
import { DataRecognizer } from '.';
import type { MlClient } from '../../lib/ml_client';
import type { MLSavedObjectService } from '../../saved_objects';
import { type Config, filterConfigs } from './data_recognizer';

const callAs = () => Promise.resolve({ body: {} });

const mlClusterClient = {
  asCurrentUser: callAs,
  asInternalUser: callAs,
} as unknown as IScopedClusterClient;

const mlClient = callAs as unknown as MlClient;

const serverlessMock = {
  isServerless: false,
  cpsEnabled: false,
};

describe('ML - data recognizer', () => {
  const dr = new DataRecognizer(
    mlClusterClient,
    mlClient,
    {
      find: jest.fn(),
      bulkCreate: jest.fn(),
    } as unknown as SavedObjectsClientContract,
    { find: jest.fn() } as unknown as DataViewsService,
    {} as MLSavedObjectService,
    { headers: { authorization: '' } } as unknown as KibanaRequest,
    null,
    serverlessMock
  );

  describe('jobOverrides', () => {
    it('should apply job overrides correctly', () => {
      // arrange
      const prefix = 'pre-';
      const testJobId = 'test-job';
      const moduleConfig = {
        jobs: [
          {
            id: `${prefix}${testJobId}`,
            config: {
              groups: ['nginx'],
              analysis_config: {
                bucket_span: '1h',
              },
              analysis_limits: {
                model_memory_limit: '256mb',
                influencers: ['region'],
              },
              calendars: ['calendar-1'],
            },
          },
        ],
      } as unknown as Module;
      const jobOverrides = [
        {
          analysis_limits: {
            model_memory_limit: '512mb',
            influencers: [],
          },
        },
        {
          job_id: testJobId,
          groups: [],
        },
      ];
      // act
      dr.applyJobConfigOverrides(moduleConfig, jobOverrides, prefix);
      // assert
      expect(moduleConfig.jobs).toEqual([
        {
          config: {
            analysis_config: {
              bucket_span: '1h',
            },
            analysis_limits: {
              model_memory_limit: '512mb',
              influencers: [],
            },
            groups: [],
            calendars: ['calendar-1'],
          },
          id: 'pre-test-job',
        },
      ]);
    });

    it('should filter configs', () => {
      const configs = [
        {
          module: { tags: ['security'] },
        },
        {
          module: { tags: ['security', 'observability'] },
        },
        {
          module: { tags: ['security', 'logs'] },
        },
        {
          module: { tags: ['search'] },
        },
        {
          module: { tags: [] },
        },
        {
          module: { tags: [] },
        },
        {
          module: {},
        },
      ] as unknown as Config[];

      // no compatible module type, no filters
      // test all modules are returned
      const c1 = filterConfigs(configs, null, []);
      expect(c1).toStrictEqual(configs);

      // compatible module type is security, no filters
      // test only security modules and modules without tags are returned
      const c2 = filterConfigs(configs, 'security', []);
      expect(c2).toStrictEqual([
        {
          module: { tags: ['security'] },
        },
        {
          module: { tags: ['security', 'observability'] },
        },
        {
          module: { tags: ['security', 'logs'] },
        },
        {
          module: { tags: [] },
        },
        {
          module: { tags: [] },
        },
        {
          module: {},
        },
      ]);

      // no compatible module type, filter is search
      // test only modules with search tag are returned
      const c3 = filterConfigs(configs, null, ['search']);
      expect(c3).toStrictEqual([
        {
          module: { tags: ['search'] },
        },
      ]);

      // compatible module type is security, filter is search
      // test no modules are returned
      const c4 = filterConfigs(configs, 'security', ['search']);
      expect(c4).toStrictEqual([]);

      // compatible module type is observability, filter is search
      // test no modules are returned
      const c5 = filterConfigs(configs, 'observability', ['search']);
      expect(c5).toStrictEqual([]);

      // compatible module type is observability, filter is security
      // test only modules with security and observability tags are returned
      const c6 = filterConfigs(configs, 'observability', ['security']);
      expect(c6).toStrictEqual([
        {
          module: { tags: ['security', 'observability'] },
        },
      ]);

      // filter is not a valid tag
      // test no modules are returned
      const c7 = filterConfigs(configs, null, ['missing']);
      expect(c7).toStrictEqual([]);

      // compatible module type is not a valid tag, no filters
      const c8 = filterConfigs(configs, 'missing' as any, []);
      expect(c8).toStrictEqual([
        {
          module: { tags: [] },
        },
        {
          module: { tags: [] },
        },
        {
          module: {},
        },
      ]);
    });
  });
});
