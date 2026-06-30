/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import type { CreateExceptionListItemOptions } from '@kbn/lists-plugin/server';
import { createMockEndpointAppContextService } from '../../../endpoint/mocks';
import { getEndpointAuthzInitialStateMock } from '../../../../common/endpoint/service/authz/mocks';
import { ExceptionsListItemGenerator } from '../../../../common/endpoint/data_generators/exceptions_list_item_generator';
import { HostIsolationExceptionsValidator } from './host_isolation_exceptions_validator';
import { EndpointArtifactExceptionValidationError } from './errors';

describe('Endpoint Exceptions API validations', () => {
  it('should initialize', () => {
    expect(
      new HostIsolationExceptionsValidator(
        createMockEndpointAppContextService(),
        httpServerMock.createKibanaRequest()
      )
    ).not.toBeUndefined();
  });

  describe('entry `value` bound', () => {
    let validator: HostIsolationExceptionsValidator;

    const buildCreateItem = (value: string): CreateExceptionListItemOptions => {
      const generated = new ExceptionsListItemGenerator().generateHostIsolationExceptionForCreate({
        entries: [{ field: 'destination.ip', operator: 'included', type: 'match', value }],
        tags: [],
      });
      return {
        ...generated,
        listId: generated.list_id,
        namespaceType: 'agnostic',
        osTypes: generated.os_types,
      } as unknown as CreateExceptionListItemOptions;
    };

    beforeEach(() => {
      const endpointAppContextService = createMockEndpointAppContextService();
      (endpointAppContextService.getEndpointAuthz as jest.Mock).mockResolvedValue(
        getEndpointAuthzInitialStateMock()
      );
      validator = new HostIsolationExceptionsValidator(
        endpointAppContextService,
        httpServerMock.createKibanaRequest()
      );
    });

    it('should accept a valid IPv4/CIDR `value`', async () => {
      await expect(validator.validatePreCreateItem(buildCreateItem('0.0.0.0/24'))).resolves.toEqual(
        expect.objectContaining({ listId: ENDPOINT_ARTIFACT_LISTS.hostIsolationExceptions.id })
      );
    });

    it('should reject a `value` longer than 64 characters', async () => {
      const promise = validator.validatePreCreateItem(buildCreateItem('a'.repeat(65)));
      await expect(promise).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(promise).rejects.toThrow(/maximum length of \[64\]/);
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
