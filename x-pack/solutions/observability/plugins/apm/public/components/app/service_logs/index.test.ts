/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  ENVIRONMENT_ALL,
  ENVIRONMENT_NOT_DEFINED,
} from '../../../../common/environment_filter_values';
import { getInfrastructureFilter } from '.';

describe('service logs', () => {
  const serviceName = 'opbeans-node';
  const environment = 'production';

  describe('getInfrastructureFilter', () => {
    it('filter by service name and a specific environment only', () => {
      expect(
        getInfrastructureFilter({
          containerIds: [],
          serviceName,
          environment,
        })
      ).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [
            {
              bool: {
                filter: [
                  { term: { 'service.name': 'opbeans-node' } },
                  { term: { 'service.environment': 'production' } },
                ],
              },
            },
          ],
        },
      });
    });

    it('filter by service name and missing environment when environment is not defined', () => {
      expect(
        getInfrastructureFilter({
          containerIds: [],
          serviceName,
          environment: ENVIRONMENT_NOT_DEFINED.value,
        })
      ).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [
            {
              bool: {
                filter: [{ term: { 'service.name': 'opbeans-node' } }],
                must_not: [{ exists: { field: 'service.environment' } }],
              },
            },
          ],
        },
      });
    });

    it('does not filter by environment all', () => {
      expect(
        getInfrastructureFilter({
          containerIds: [],
          serviceName,
          environment: ENVIRONMENT_ALL.value,
        })
      ).toEqual({
        bool: { minimum_should_match: 1, should: [{ term: { 'service.name': 'opbeans-node' } }] },
      });
    });

    it('filter by container id as fallback', () => {
      expect(
        getInfrastructureFilter({
          containerIds: ['foo', 'bar'],
          serviceName,
          environment,
        })
      ).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [
            {
              bool: {
                filter: [
                  { term: { 'service.name': 'opbeans-node' } },
                  { term: { 'service.environment': 'production' } },
                ],
              },
            },
            {
              bool: {
                filter: [{ terms: { 'container.id': ['foo', 'bar'] } }],
                must_not: [{ term: { 'service.name': '*' } }],
              },
            },
          ],
        },
      });
    });

    it('does not filter by host names as fallback', () => {
      expect(
        getInfrastructureFilter({
          containerIds: [],
          serviceName,
          environment,
        })
      ).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [
            {
              bool: {
                filter: [
                  { term: { 'service.name': 'opbeans-node' } },
                  { term: { 'service.environment': 'production' } },
                ],
              },
            },
          ],
        },
      });
    });
  });
});
