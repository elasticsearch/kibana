/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defaultInferenceEndpoints } from '@kbn/inference-common';
import { ResourceTypes } from './resource_type';
import {
  getProductDocInferenceIdCandidates,
  resolveDefaultInferenceId,
  resolveDefaultInferenceIdFromInferenceGet,
  resolveInstalledProductDocInferenceId,
} from './default_inference_id';

describe('resolveDefaultInferenceId', () => {
  it('prefers Jina when available alongside EIS ELSER and default ELSER', () => {
    expect(
      resolveDefaultInferenceId(
        new Set([
          defaultInferenceEndpoints.JINAv5,
          defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
          defaultInferenceEndpoints.ELSER,
        ])
      )
    ).toBe(defaultInferenceEndpoints.JINAv5);
  });

  it('prefers EIS ELSER when Jina is unavailable', () => {
    expect(
      resolveDefaultInferenceId(
        new Set([
          defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
          defaultInferenceEndpoints.ELSER,
        ])
      )
    ).toBe(defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID);
  });

  it('falls back to default ELSER when Jina and EIS ELSER are unavailable', () => {
    expect(resolveDefaultInferenceId(new Set([defaultInferenceEndpoints.ELSER]))).toBe(
      defaultInferenceEndpoints.ELSER
    );
  });

  it('falls back to default ELSER when no endpoints are available', () => {
    expect(resolveDefaultInferenceId(new Set())).toBe(defaultInferenceEndpoints.ELSER);
  });

  it('prefers EIS ELSER over Jina for Security Labs content', () => {
    expect(
      resolveDefaultInferenceId(
        new Set([
          defaultInferenceEndpoints.JINAv5,
          defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
          defaultInferenceEndpoints.ELSER,
        ]),
        { resourceType: ResourceTypes.securityLabs }
      )
    ).toBe(defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID);
  });
});

describe('getProductDocInferenceIdCandidates', () => {
  it('returns the default first without duplicates', () => {
    expect(getProductDocInferenceIdCandidates(defaultInferenceEndpoints.JINAv5)).toEqual([
      defaultInferenceEndpoints.JINAv5,
      defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
      defaultInferenceEndpoints.ELSER,
    ]);
  });
});

describe('resolveDefaultInferenceIdFromInferenceGet', () => {
  it('prefers Jina when inference lookup returns all supported endpoints', async () => {
    await expect(
      resolveDefaultInferenceIdFromInferenceGet(() =>
        Promise.resolve({
          endpoints: [
            { inference_id: defaultInferenceEndpoints.ELSER },
            { inference_id: defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID },
            { inference_id: defaultInferenceEndpoints.JINAv5 },
          ],
        })
      )
    ).resolves.toBe(defaultInferenceEndpoints.JINAv5);
  });

  it('falls back to default ELSER when inference lookup fails', async () => {
    await expect(
      resolveDefaultInferenceIdFromInferenceGet(() => Promise.reject(new Error('failed')))
    ).resolves.toBe(defaultInferenceEndpoints.ELSER);
  });

  it('prefers EIS ELSER over Jina for Security Labs content', async () => {
    await expect(
      resolveDefaultInferenceIdFromInferenceGet(
        () =>
          Promise.resolve({
            endpoints: [
              { inference_id: defaultInferenceEndpoints.ELSER },
              { inference_id: defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID },
              { inference_id: defaultInferenceEndpoints.JINAv5 },
            ],
          }),
        { resourceType: ResourceTypes.securityLabs }
      )
    ).resolves.toBe(defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID);
  });
});

describe('resolveInstalledProductDocInferenceId', () => {
  it('returns the first installed candidate inference ID', async () => {
    await expect(
      resolveInstalledProductDocInferenceId({
        getDefaultInferenceId: async () => defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
        isDocumentationAvailable: async (inferenceId) =>
          inferenceId === defaultInferenceEndpoints.ELSER,
      })
    ).resolves.toBe(defaultInferenceEndpoints.ELSER);
  });
});
