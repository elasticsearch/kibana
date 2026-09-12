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
import { TrustedAppValidator } from './trusted_app_validator';
import { GLOBAL_ARTIFACT_TAG } from '../../../../common/endpoint/service/artifacts/constants';
import { EndpointArtifactExceptionValidationError } from './errors';

describe('Endpoint Exceptions API validations', () => {
  it('should initialize', () => {
    expect(
      new TrustedAppValidator(
        createMockEndpointAppContextService(),
        httpServerMock.createKibanaRequest()
      )
    ).not.toBeUndefined();
  });

  describe('entry value/field length bounds', () => {
    let mockEndpointAppContextService: ReturnType<typeof createMockEndpointAppContextService>;
    let validator: TrustedAppValidator;

    beforeEach(() => {
      mockEndpointAppContextService = createMockEndpointAppContextService();
      validator = new TrustedAppValidator(
        mockEndpointAppContextService,
        httpServerMock.createKibanaRequest()
      );
    });

    const buildItem = (
      entries: CreateExceptionListItemOptions['entries'],
      tags: string[] = [GLOBAL_ARTIFACT_TAG]
    ): CreateExceptionListItemOptions =>
      ({
        listId: ENDPOINT_ARTIFACT_LISTS.trustedApps.id,
        name: 'Test trusted app',
        description: '',
        namespaceType: 'agnostic',
        osTypes: ['windows'],
        tags,
        entries,
      } as unknown as CreateExceptionListItemOptions);

    const pathEntry = (value: string): CreateExceptionListItemOptions['entries'] => [
      { field: 'process.executable.caseless', type: 'match', operator: 'included', value },
    ];

    const hashEntry = (value: string): CreateExceptionListItemOptions['entries'] => [
      { field: 'process.hash.sha256', type: 'match', operator: 'included', value },
    ];

    const signerEntry = (subjectName: string): CreateExceptionListItemOptions['entries'] => [
      {
        field: 'process.Ext.code_signature',
        type: 'nested',
        entries: [
          { field: 'trusted', value: 'true', type: 'match', operator: 'included' },
          { field: 'subject_name', value: subjectName, type: 'match', operator: 'included' },
        ],
      },
    ];

    const advancedFieldEntry = (field: string): CreateExceptionListItemOptions['entries'] => [
      { field, type: 'match', operator: 'included', value: 'elastic' },
    ];

    const enableAdvancedMode = () => {
      (
        mockEndpointAppContextService.experimentalFeatures as unknown as {
          trustedAppsAdvancedMode: boolean;
        }
      ).trustedAppsAdvancedMode = true;
    };

    it('accepts a path value at the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(pathEntry('a'.repeat(4096))))
      ).resolves.toBeDefined();
    });

    it('rejects a path value over the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(pathEntry('a'.repeat(4097))))
      ).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(
        validator.validatePreCreateItem(buildItem(pathEntry('a'.repeat(4097))))
      ).rejects.toThrow(/maximum length of \[4096\]/);
    });

    it('accepts a valid hash value', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(hashEntry('a'.repeat(64))))
      ).resolves.toBeDefined();
    });

    it('rejects a hash value over the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(hashEntry('a'.repeat(4097))))
      ).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(
        validator.validatePreCreateItem(buildItem(hashEntry('a'.repeat(4097))))
      ).rejects.toThrow(/maximum length of \[4096\]/);
    });

    it('accepts a signer subject_name value at the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(signerEntry('a'.repeat(4096))))
      ).resolves.toBeDefined();
    });

    it('rejects a signer subject_name value over the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(signerEntry('a'.repeat(4097))))
      ).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(
        validator.validatePreCreateItem(buildItem(signerEntry('a'.repeat(4097))))
      ).rejects.toThrow(/maximum length of \[4096\]/);
    });

    it('trims edge whitespace on create and then validates the cleaned hash', async () => {
      const item = buildItem(hashEntry(` ${'a'.repeat(64)} `));

      await expect(validator.validatePreCreateItem(item)).resolves.toBeDefined();
      expect(item.entries[0]).toEqual(expect.objectContaining({ value: 'a'.repeat(64) }));
    });

    it('rejects a nested control character on update', async () => {
      await expect(
        validator.validatePreUpdateItem(
          {
            ...buildItem(signerEntry('Elastic\u0000')),
            _version: undefined,
            id: 'trusted-app-id',
          },
          {} as ExceptionListItemSchema
        )
      ).rejects.toThrow(/control characters in fields: subject_name/);
    });

    it('accepts an advanced-mode field at the 1024 character limit', async () => {
      enableAdvancedMode();
      await expect(
        validator.validatePreCreateItem(
          buildItem(advancedFieldEntry('a'.repeat(1024)), [
            GLOBAL_ARTIFACT_TAG,
            'form_mode:advanced',
          ])
        )
      ).resolves.toBeDefined();
    });

    it('rejects an advanced-mode field over the 1024 character limit', async () => {
      enableAdvancedMode();
      const overLimit = buildItem(advancedFieldEntry('a'.repeat(1025)), [
        GLOBAL_ARTIFACT_TAG,
        'form_mode:advanced',
      ]);
      await expect(validator.validatePreCreateItem(overLimit)).rejects.toThrow(
        EndpointArtifactExceptionValidationError
      );
      await expect(validator.validatePreCreateItem(overLimit)).rejects.toThrow(
        /maximum length of \[1024\]/
      );
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
