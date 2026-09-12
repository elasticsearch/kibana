/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import type { CreateExceptionListItemOptions } from '@kbn/lists-plugin/server';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import { createMockEndpointAppContextService } from '../../../endpoint/mocks';
import { EventFilterValidator } from './event_filter_validator';
import { GLOBAL_ARTIFACT_TAG } from '../../../../common/endpoint/service/artifacts/constants';
import { EndpointArtifactExceptionValidationError } from './errors';

describe('Endpoint Exceptions API validations', () => {
  it('should initialize', () => {
    expect(
      new EventFilterValidator(
        createMockEndpointAppContextService(),
        httpServerMock.createKibanaRequest()
      )
    ).not.toBeUndefined();
  });

  describe('entry field length bounds', () => {
    let validator: EventFilterValidator;

    beforeEach(() => {
      validator = new EventFilterValidator(
        createMockEndpointAppContextService(),
        httpServerMock.createKibanaRequest()
      );
    });

    const buildItem = (field: string): CreateExceptionListItemOptions =>
      ({
        listId: ENDPOINT_ARTIFACT_LISTS.eventFilters.id,
        name: 'Test event filter',
        description: '',
        namespaceType: 'agnostic',
        osTypes: ['windows'],
        tags: [GLOBAL_ARTIFACT_TAG],
        entries: [{ field, type: 'match', operator: 'included', value: 'elastic' }],
      } as unknown as CreateExceptionListItemOptions);

    it('accepts a field at the 1024 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem('a'.repeat(1024)))
      ).resolves.toBeDefined();
    });

    it('rejects a field over the 1024 character limit', async () => {
      await expect(validator.validatePreCreateItem(buildItem('a'.repeat(1025)))).rejects.toThrow(
        EndpointArtifactExceptionValidationError
      );
      await expect(validator.validatePreCreateItem(buildItem('a'.repeat(1025)))).rejects.toThrow(
        /maximum length of \[1024\]/
      );
    });

    it('trims edge whitespace on create', async () => {
      const item = buildItem('process.executable');
      item.entries = [
        {
          field: 'process.executable',
          type: 'wildcard',
          operator: 'included',
          value: '/opt/Elastic/*\u00A0',
        },
      ];

      await expect(validator.validatePreCreateItem(item)).resolves.toBeDefined();
      expect(item.entries[0]).toEqual(expect.objectContaining({ value: '/opt/Elastic/*' }));
    });

    it('rejects a control character in a nested entry on update', async () => {
      const item = buildItem('process.parent');
      item.entries = [
        {
          field: 'process.parent',
          type: 'nested',
          entries: [
            {
              field: 'name',
              type: 'match',
              operator: 'included',
              value: 'endpoint\u007F',
            },
          ],
        },
      ];

      await expect(
        validator.validatePreUpdateItem(
          { ...item, _version: undefined, id: 'event-filter-id' },
          {} as ExceptionListItemSchema
        )
      ).rejects.toThrow(/control characters in fields: name/);
    });
  });
  // -----------------------------------------------------------------------------
  //
  //  API TESTS FOR THIS ARTIFACT TYPE SHOULD BE COVERED WITH INTEGRATION TESTS.
  //  ADD THEM HERE:
  //
  //  `x-pack/solutions/security/test/security_solution_api_integration/test_suites/edr_workflows`
  //
  // -----------------------------------------------------------------------------
});
