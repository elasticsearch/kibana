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
  isEisAvailable,
  isEisAvailableFromInferenceGet,
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

  it('ignores resourceType today (same priority for all KB content)', () => {
    expect(
      resolveDefaultInferenceId(
        new Set([
          defaultInferenceEndpoints.JINAv5,
          defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID,
          defaultInferenceEndpoints.ELSER,
        ]),
        { resourceType: ResourceTypes.securityLabs }
      )
    ).toBe(defaultInferenceEndpoints.JINAv5);
  });
});

describe('isEisAvailable', () => {
  it('returns true when Jina is present', () => {
    expect(isEisAvailable(new Set([defaultInferenceEndpoints.JINAv5]))).toBe(true);
  });

  it('returns true when EIS ELSER is present', () => {
    expect(isEisAvailable(new Set([defaultInferenceEndpoints.ELSER_IN_EIS_INFERENCE_ID]))).toBe(
      true
    );
  });

  it('returns false when only default ELSER is present', () => {
    expect(isEisAvailable(new Set([defaultInferenceEndpoints.ELSER]))).toBe(false);
  });

  it('returns false when no endpoints are present', () => {
    expect(isEisAvailable(new Set())).toBe(false);
  });
});

describe('isEisAvailableFromInferenceGet', () => {
  it('returns true when inference lookup includes an EIS endpoint', async () => {
    await expect(
      isEisAvailableFromInferenceGet(() =>
        Promise.resolve({
          endpoints: [{ inference_id: defaultInferenceEndpoints.JINAv5 }],
        })
      )
    ).resolves.toBe(true);
  });

  it('returns false when inference lookup has no EIS endpoints', async () => {
    await expect(
      isEisAvailableFromInferenceGet(() =>
        Promise.resolve({
          endpoints: [{ inference_id: defaultInferenceEndpoints.ELSER }],
        })
      )
    ).resolves.toBe(false);
  });

  it('returns false when inference lookup fails', async () => {
    await expect(
      isEisAvailableFromInferenceGet(() => Promise.reject(new Error('failed')))
    ).resolves.toBe(false);
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

  it('returns undefined when no candidate has installed documentation', async () => {
    await expect(
      resolveInstalledProductDocInferenceId({
        getDefaultInferenceId: async () => defaultInferenceEndpoints.JINAv5,
        isDocumentationAvailable: async () => false,
      })
    ).resolves.toBeUndefined();
  });
});
