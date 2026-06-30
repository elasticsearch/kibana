/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';

import type { EsAssetReference } from '../../../types';
import { ElasticsearchAssetType } from '../../../types';

import { updateEsAssetReferences } from './es_assets_reference';

jest.mock('../../audit_logging');

const PACKAGES_SO_TYPE = 'epm-packages';

function makeRef(type: ElasticsearchAssetType, id: string): EsAssetReference {
  return { type, id };
}

describe('updateEsAssetReferences', () => {
  let soClient: ReturnType<typeof savedObjectsClientMock.create>;

  beforeEach(() => {
    soClient = savedObjectsClientMock.create();
  });

  it('re-reads the SO on each attempt and merges with the latest installed_es', async () => {
    const existingRef = makeRef(ElasticsearchAssetType.ingestPipeline, 'existing-pipeline');
    const newRef = makeRef(ElasticsearchAssetType.indexTemplate, 'new-template');

    soClient.get.mockResolvedValue({
      id: 'my-pkg',
      type: PACKAGES_SO_TYPE,
      references: [],
      attributes: { installed_es: [existingRef] },
    } as any);

    soClient.update.mockResolvedValue({
      id: 'my-pkg',
      type: PACKAGES_SO_TYPE,
      references: [],
      attributes: { installed_es: [existingRef, newRef] },
    } as any);

    const result = await updateEsAssetReferences(soClient, 'my-pkg', [], {
      assetsToAdd: [newRef],
    });

    expect(soClient.get).toHaveBeenCalledWith(PACKAGES_SO_TYPE, 'my-pkg');
    expect(soClient.update).toHaveBeenCalledWith(
      PACKAGES_SO_TYPE,
      'my-pkg',
      { installed_es: [existingRef, newRef] },
      expect.objectContaining({ version: undefined }) // no version on mock SO
    );
    expect(result).toEqual([existingRef, newRef]);
  });

  it('removes specified assets from the freshly-read installed_es', async () => {
    const keep = makeRef(ElasticsearchAssetType.indexTemplate, 'keep-me');
    const remove = makeRef(ElasticsearchAssetType.ingestPipeline, 'remove-me');

    soClient.get.mockResolvedValue({
      id: 'my-pkg',
      type: PACKAGES_SO_TYPE,
      references: [],
      attributes: { installed_es: [keep, remove] },
    } as any);

    soClient.update.mockResolvedValue({
      id: 'my-pkg',
      type: PACKAGES_SO_TYPE,
      references: [],
      attributes: { installed_es: [keep] },
    } as any);

    const result = await updateEsAssetReferences(soClient, 'my-pkg', [], {
      assetsToRemove: [remove],
    });

    expect(soClient.update).toHaveBeenCalledWith(
      PACKAGES_SO_TYPE,
      'my-pkg',
      { installed_es: [keep] },
      expect.anything()
    );
    expect(result).toEqual([keep]);
  });

  it('deduplicates refs with the same type and id', async () => {
    const ref = makeRef(ElasticsearchAssetType.componentTemplate, 'dup');

    soClient.get.mockResolvedValue({
      id: 'my-pkg',
      type: PACKAGES_SO_TYPE,
      references: [],
      attributes: { installed_es: [ref] },
    } as any);

    soClient.update.mockResolvedValue({
      id: 'my-pkg',
      type: PACKAGES_SO_TYPE,
      references: [],
      attributes: { installed_es: [ref] },
    } as any);

    await updateEsAssetReferences(soClient, 'my-pkg', [], {
      assetsToAdd: [ref], // duplicate of the one already in installed_es
    });

    const [, , { installed_es }] = soClient.update.mock.calls[0] as any;
    expect(installed_es).toHaveLength(1);
  });

  it('retries on conflict and re-reads on each attempt', async () => {
    const initial = makeRef(ElasticsearchAssetType.ingestPipeline, 'pipe');
    const concurrent = makeRef(ElasticsearchAssetType.indexTemplate, 'concurrent-add');
    const toAdd = makeRef(ElasticsearchAssetType.componentTemplate, 'my-component');

    // First get returns only `initial`; second get (after conflict) includes `concurrent`
    soClient.get
      .mockResolvedValueOnce({
        id: 'my-pkg',
        type: PACKAGES_SO_TYPE,
        references: [],
        attributes: { installed_es: [initial] },
      } as any)
      .mockResolvedValueOnce({
        id: 'my-pkg',
        type: PACKAGES_SO_TYPE,
        references: [],
        attributes: { installed_es: [initial, concurrent] },
      } as any);

    // First update throws a conflict; second succeeds
    soClient.update
      .mockRejectedValueOnce(SavedObjectsErrorHelpers.createConflictError(PACKAGES_SO_TYPE, 'my-pkg'))
      .mockResolvedValueOnce({
        id: 'my-pkg',
        type: PACKAGES_SO_TYPE,
        references: [],
        attributes: { installed_es: [initial, concurrent, toAdd] },
      } as any);

    const result = await updateEsAssetReferences(soClient, 'my-pkg', [], {
      assetsToAdd: [toAdd],
    });

    expect(soClient.get).toHaveBeenCalledTimes(2);
    // On the second attempt the payload must include the concurrently-added ref
    const secondUpdatePayload = (soClient.update.mock.calls[1] as any)[2];
    expect(secondUpdatePayload.installed_es).toEqual(
      expect.arrayContaining([initial, concurrent, toAdd])
    );
    expect(result).toEqual([initial, concurrent, toAdd]);
  });

  it('passes the version token from the get response to the update', async () => {
    soClient.get.mockResolvedValue({
      id: 'my-pkg',
      type: PACKAGES_SO_TYPE,
      references: [],
      version: 'WzEsMV0=',
      attributes: { installed_es: [] },
    } as any);

    soClient.update.mockResolvedValue({
      id: 'my-pkg',
      type: PACKAGES_SO_TYPE,
      references: [],
      attributes: { installed_es: [] },
    } as any);

    await updateEsAssetReferences(soClient, 'my-pkg', [], {});

    expect(soClient.update).toHaveBeenCalledWith(
      PACKAGES_SO_TYPE,
      'my-pkg',
      expect.anything(),
      expect.objectContaining({ version: 'WzEsMV0=' })
    );
  });

  it('does not retry non-conflict errors', async () => {
    soClient.get.mockResolvedValue({
      id: 'my-pkg',
      type: PACKAGES_SO_TYPE,
      references: [],
      attributes: { installed_es: [] },
    } as any);

    const genericError = new Error('some other error');
    soClient.update.mockRejectedValue(genericError);

    await expect(updateEsAssetReferences(soClient, 'my-pkg', [], {})).rejects.toThrow(genericError);
    expect(soClient.update).toHaveBeenCalledTimes(1);
  });
});
