/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock, loggingSystemMock, coreMock } from '@kbn/core/server/mocks';
import type { SavedObjectsExportTransformContext } from '@kbn/core/server';
import { handleExport } from './export';
import { mockCases } from '../../mocks';
import type { CaseSavedObjectTransformed } from '../../common/types/case';
import { CASE_ATTACHMENT_SAVED_OBJECT } from '../../../common/constants';
import { getAttachmentsAndUserActionsForCases } from './utils';

jest.mock('./utils', () => {
  return {
    getAttachmentsAndUserActionsForCases: jest.fn().mockResolvedValue([]),
  };
});

describe('case export', () => {
  const testRequest = httpServerMock.createFakeKibanaRequest({});
  const testContext: SavedObjectsExportTransformContext = { request: testRequest };
  const logger = loggingSystemMock.createLogger();
  const config = {
    attachments: { enabled: true },
  } as never;
  const testCases: CaseSavedObjectTransformed[] = mockCases.map((_case, idx) => ({
    ..._case,
    attributes: {
      ..._case.attributes,
      incremental_id: idx + 1,
    },
  }));

  it('should remove `incremental_id` from cases when exporting', async () => {
    const exported = await handleExport({
      context: testContext,
      coreSetup: coreMock.createSetup(),
      // @ts-ignore: mock objects are not matching persisted objects
      objects: testCases,
      logger,
      config,
    });

    const containsIncrementalId = exported.some((exportedCase) => {
      return (
        'incremental_id' in exportedCase.attributes &&
        exportedCase.attributes.incremental_id !== undefined
      );
    });

    expect(containsIncrementalId).toBeFalsy();
  });

  it('includes cases-attachments when exporting with unified attachments enabled', async () => {
    const coreSetup = coreMock.createSetup();

    await handleExport({
      context: testContext,
      coreSetup,
      // @ts-ignore: mock objects are not matching persisted objects
      objects: testCases,
      logger,
      config,
    });

    const [coreStart] = await coreSetup.getStartServices();

    expect(coreStart.savedObjects.getScopedClient).toHaveBeenCalledWith(
      testRequest,
      expect.objectContaining({
        includedHiddenTypes: expect.arrayContaining([CASE_ATTACHMENT_SAVED_OBJECT]),
      })
    );
    expect(getAttachmentsAndUserActionsForCases).toHaveBeenCalledWith(
      expect.anything(),
      testCases.map((testCase) => testCase.id),
      true
    );
  });
});
