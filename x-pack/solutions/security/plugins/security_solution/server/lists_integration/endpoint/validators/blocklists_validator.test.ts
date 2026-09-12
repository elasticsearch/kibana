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
import { BlocklistValidator } from './blocklist_validator';
import { createMockEndpointAppContextService } from '../../../endpoint/mocks';
import { GLOBAL_ARTIFACT_TAG } from '../../../../common/endpoint/service/artifacts/constants';
import { EndpointArtifactExceptionValidationError } from './errors';

describe('Blocklists API validations', () => {
  it('should initialize', () => {
    expect(
      new BlocklistValidator(
        createMockEndpointAppContextService(),
        httpServerMock.createKibanaRequest()
      )
    ).not.toBeUndefined();
  });

  describe('entry value length bounds', () => {
    let validator: BlocklistValidator;

    beforeEach(() => {
      validator = new BlocklistValidator(
        createMockEndpointAppContextService(),
        httpServerMock.createKibanaRequest()
      );
    });

    const buildItem = (
      entries: CreateExceptionListItemOptions['entries']
    ): CreateExceptionListItemOptions =>
      ({
        listId: ENDPOINT_ARTIFACT_LISTS.blocklists.id,
        name: 'Test blocklist',
        description: '',
        namespaceType: 'agnostic',
        osTypes: ['windows'],
        tags: [GLOBAL_ARTIFACT_TAG],
        entries,
      } as unknown as CreateExceptionListItemOptions);

    const filePathEntry = (value: string[]): CreateExceptionListItemOptions['entries'] => [
      { field: 'file.path', type: 'match_any', operator: 'included', value },
    ];

    const hashEntry = (value: string[]): CreateExceptionListItemOptions['entries'] => [
      { field: 'file.hash.sha256', type: 'match_any', operator: 'included', value },
    ];

    const signerEntry = (value: string[]): CreateExceptionListItemOptions['entries'] => [
      {
        field: 'file.Ext.code_signature',
        type: 'nested',
        entries: [{ field: 'subject_name', type: 'match_any', operator: 'included', value }],
      },
    ];

    const signerMatchEntry = (value: string): CreateExceptionListItemOptions['entries'] => [
      {
        field: 'file.Ext.code_signature',
        type: 'nested',
        entries: [{ field: 'subject_name', type: 'match', operator: 'included', value }],
      },
    ];

    it('accepts a file path value at the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(filePathEntry(['a'.repeat(4096)])))
      ).resolves.toBeDefined();
    });

    it('rejects a file path value over the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(filePathEntry(['a'.repeat(4097)])))
      ).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(
        validator.validatePreCreateItem(buildItem(filePathEntry(['a'.repeat(4097)])))
      ).rejects.toThrow(/maximum length of \[4096\]/);
    });

    it('accepts a valid hash value', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(hashEntry(['a'.repeat(64)])))
      ).resolves.toBeDefined();
    });

    it('rejects a hash value over the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(hashEntry(['a'.repeat(4097)])))
      ).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(
        validator.validatePreCreateItem(buildItem(hashEntry(['a'.repeat(4097)])))
      ).rejects.toThrow(/maximum length of \[4096\]/);
    });

    it('accepts a signer subject_name match_any value at the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(signerEntry(['a'.repeat(4096)])))
      ).resolves.toBeDefined();
    });

    it('rejects a signer subject_name match_any value over the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(signerEntry(['a'.repeat(4097)])))
      ).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(
        validator.validatePreCreateItem(buildItem(signerEntry(['a'.repeat(4097)])))
      ).rejects.toThrow(/maximum length of \[4096\]/);
    });

    it('accepts a signer subject_name match value at the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(signerMatchEntry('a'.repeat(4096))))
      ).resolves.toBeDefined();
    });

    it('rejects a signer subject_name match value over the 4096 character limit', async () => {
      await expect(
        validator.validatePreCreateItem(buildItem(signerMatchEntry('a'.repeat(4097))))
      ).rejects.toThrow(EndpointArtifactExceptionValidationError);
      await expect(
        validator.validatePreCreateItem(buildItem(signerMatchEntry('a'.repeat(4097))))
      ).rejects.toThrow(/maximum length of \[4096\]/);
    });

    it('trims an edge-whitespace match_any array member on create', async () => {
      const item = buildItem(filePathEntry([' C:\\Elastic\\endpoint.exe ', '\tbad']));

      await expect(validator.validatePreCreateItem(item)).resolves.toBeDefined();
      expect(item.entries[0]).toEqual(
        expect.objectContaining({ value: ['C:\\Elastic\\endpoint.exe', 'bad'] })
      );
    });

    it('deduplicates values that only differ by edge whitespace', async () => {
      const item = buildItem(
        filePathEntry([' C:\\Elastic\\endpoint.exe ', 'C:\\Elastic\\endpoint.exe'])
      );

      await expect(validator.validatePreCreateItem(item)).resolves.toBeDefined();
      expect(item.entries[0]).toEqual(
        expect.objectContaining({ value: ['C:\\Elastic\\endpoint.exe'] })
      );
    });

    it('rejects a nested match_any control character on update', async () => {
      await expect(
        validator.validatePreUpdateItem(
          {
            ...buildItem(signerEntry(['Elastic', 'bad\rname'])),
            _version: undefined,
            id: 'blocklist-id',
          },
          {} as ExceptionListItemSchema
        )
      ).rejects.toThrow(/control characters in fields: subject_name/);
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
