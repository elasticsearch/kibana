/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import type { FieldsMetadataPublicStart } from '@kbn/fields-metadata-plugin/public';
import { useEcsFieldNames } from './use_ecs_field_names';

const SERVICE_NAME = 'service.name';
const HOST_NAME = 'host.name';
const LABELS_CUSTOM = 'labels.custom';

const makeFieldsMetadata = (
  ecsFields: Record<string, { short?: string } | undefined>
): FieldsMetadataPublicStart =>
  ({
    getClient: jest.fn().mockResolvedValue({
      find: jest.fn().mockImplementation(({ fieldNames }: { fieldNames: string[] }) =>
        Promise.resolve({
          fields: Object.fromEntries(fieldNames.map((name) => [name, ecsFields[name]])),
        })
      ),
    }),
  } as unknown as FieldsMetadataPublicStart);

describe('useEcsFieldNames', () => {
  it('returns null when fieldsMetadata is not provided', () => {
    const { result } = renderHook(() => useEcsFieldNames([SERVICE_NAME], undefined));
    expect(result.current).toBeNull();
  });

  it('returns null when fieldNames array is empty', () => {
    const { result } = renderHook(() => useEcsFieldNames([], makeFieldsMetadata({})));
    expect(result.current).toBeNull();
  });

  it('resolves to a Set containing only fields with a short description', async () => {
    const fieldNames = [SERVICE_NAME, HOST_NAME, LABELS_CUSTOM];
    const fieldsMetadata = makeFieldsMetadata({
      [SERVICE_NAME]: { short: 'Name of the service' },
      [HOST_NAME]: { short: 'Name of the host' },
      [LABELS_CUSTOM]: undefined,
    });

    const { result } = renderHook(() => useEcsFieldNames(fieldNames, fieldsMetadata));

    expect(result.current).toBeNull();

    await waitFor(() => expect(result.current).not.toBeNull());

    expect(result.current).toEqual(new Set([SERVICE_NAME, HOST_NAME]));
    expect(result.current?.has(LABELS_CUSTOM)).toBe(false);
  });

  it('resolves to an empty Set when getClient rejects', async () => {
    const fieldNames = [SERVICE_NAME];
    const fieldsMetadata = {
      getClient: jest.fn().mockRejectedValue(new Error('network error')),
    } as unknown as FieldsMetadataPublicStart;

    const { result } = renderHook(() => useEcsFieldNames(fieldNames, fieldsMetadata));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toEqual(new Set());
  });

  it('resolves to an empty Set when find rejects', async () => {
    const fieldNames = [SERVICE_NAME];
    const fieldsMetadata = {
      getClient: jest.fn().mockResolvedValue({
        find: jest.fn().mockRejectedValue(new Error('find error')),
      }),
    } as unknown as FieldsMetadataPublicStart;

    const { result } = renderHook(() => useEcsFieldNames(fieldNames, fieldsMetadata));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toEqual(new Set());
  });

  it('chunks large field lists into multiple requests and unions the results', async () => {
    // More than the 100-per-request chunk size, to force multiple requests.
    const fieldNames = Array.from({ length: 250 }, (_, i) => `field.${i}`);
    // Mark even-indexed fields as ECS.
    const ecsFields = Object.fromEntries(
      fieldNames.map((name, i) => [name, i % 2 === 0 ? { short: `desc ${i}` } : undefined])
    );

    const find = jest.fn().mockImplementation(({ fieldNames: names }: { fieldNames: string[] }) =>
      Promise.resolve({
        fields: Object.fromEntries(names.map((name) => [name, ecsFields[name]])),
      })
    );
    const fieldsMetadata = {
      getClient: jest.fn().mockResolvedValue({ find }),
    } as unknown as FieldsMetadataPublicStart;

    const { result } = renderHook(() => useEcsFieldNames(fieldNames, fieldsMetadata));

    await waitFor(() => expect(result.current).not.toBeNull());

    // 250 fields => 100 + 100 + 50 => 3 requests, none exceeding the chunk size.
    expect(find).toHaveBeenCalledTimes(3);
    for (const call of find.mock.calls) {
      expect(call[0].fieldNames.length).toBeLessThanOrEqual(100);
    }

    const expected = new Set(fieldNames.filter((_, i) => i % 2 === 0));
    expect(result.current).toEqual(expected);
  });

  it('keeps results from successful chunks when one chunk fails', async () => {
    const fieldNames = Array.from({ length: 150 }, (_, i) => `field.${i}`);

    const find = jest.fn().mockImplementation(({ fieldNames: names }: { fieldNames: string[] }) => {
      // Fail the second chunk only; the first chunk should still contribute.
      if (names.includes('field.100')) {
        return Promise.reject(new Error('chunk failed'));
      }
      return Promise.resolve({
        fields: Object.fromEntries(names.map((name) => [name, { short: `desc ${name}` }])),
      });
    });
    const fieldsMetadata = {
      getClient: jest.fn().mockResolvedValue({ find }),
    } as unknown as FieldsMetadataPublicStart;

    const { result } = renderHook(() => useEcsFieldNames(fieldNames, fieldsMetadata));

    await waitFor(() => expect(result.current).not.toBeNull());

    // First 100 fields resolved; the failed chunk (100..149) contributes nothing.
    expect(result.current).toEqual(new Set(fieldNames.slice(0, 100)));
    expect(result.current?.has('field.100')).toBe(false);
  });

  it('resets to null and re-resolves when fieldNames change', async () => {
    const fieldsMetadata = makeFieldsMetadata({
      [SERVICE_NAME]: { short: 'Name of the service' },
      [HOST_NAME]: { short: 'Name of the host' },
    });

    const { result, rerender } = renderHook(
      ({ fieldNames }: { fieldNames: string[] }) => useEcsFieldNames(fieldNames, fieldsMetadata),
      { initialProps: { fieldNames: [SERVICE_NAME] } }
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual(new Set([SERVICE_NAME]));

    rerender({ fieldNames: [HOST_NAME] });

    expect(result.current).toBeNull();

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual(new Set([HOST_NAME]));
  });
});
