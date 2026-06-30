/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, renderHook } from '@testing-library/react';
import { parseDocument } from 'yaml';
import { z } from '@kbn/zod/v4';
import { formatMonacoYamlMarker } from './format_monaco_yaml_marker';
import { useMonacoMarkersChangedInterceptor } from './use_monaco_markers_changed_interceptor';
import { MarkerSeverity } from '../../../widgets/workflow_yaml_editor/lib/utils';
import { BATCHED_CUSTOM_MARKER_OWNER } from '../model/types';

jest.mock('./filter_monaco_yaml_markers', () => ({
  filterMonacoYamlMarkers: jest.fn((markers: any[]) => markers),
}));
jest.mock('./format_monaco_yaml_marker', () => ({
  formatMonacoYamlMarker: jest.fn((marker: any) => ({ ...marker, formatted: true })),
}));

jest.mock('yaml', () => {
  const actual = jest.requireActual('yaml');
  return {
    ...actual,
    parseDocument: jest.fn(actual.parseDocument),
  };
});

const parseDocumentMock = parseDocument as jest.MockedFunction<typeof parseDocument>;

const mockModel = {} as any;

const formatMonacoYamlMarkerMock = formatMonacoYamlMarker as jest.MockedFunction<
  typeof formatMonacoYamlMarker
>;

interface FakeModelOptions {
  id?: string;
  versionId: number;
  value?: string;
}

const createFakeModel = ({ id = 'model-1', versionId, value = 'name: test' }: FakeModelOptions) =>
  ({
    id,
    getVersionId: () => versionId,
    getValue: () => value,
  } as any);

describe('useMonacoMarkersChangedInterceptor', () => {
  beforeEach(() => {
    parseDocumentMock.mockClear();
    formatMonacoYamlMarkerMock.mockClear();
  });

  it('should produce unique ids for markers from different sources on the same range', () => {
    const { result } = renderHook(() =>
      useMonacoMarkersChangedInterceptor({
        yamlDocumentRef: { current: null },
        workflowYamlSchema: z.object({}),
      })
    );

    const sharedRange = {
      startLineNumber: 5,
      startColumn: 10,
      endLineNumber: 5,
      endColumn: 30,
      severity: MarkerSeverity.Error,
    };

    const markers = [
      { ...sharedRange, message: 'Unknown variable', source: 'variable-validation' },
      { ...sharedRange, message: 'Invalid Liquid syntax', source: 'liquid-template-validation' },
    ];

    act(() => {
      result.current.handleMarkersChanged(mockModel, BATCHED_CUSTOM_MARKER_OWNER, markers as any);
    });

    const errors = result.current.validationErrors;
    expect(errors).toHaveLength(2);

    const [varError, liquidError] = errors;
    expect(varError.id).not.toEqual(liquidError.id);
    expect(varError.id).toContain('variable-validation');
    expect(liquidError.id).toContain('liquid-template-validation');
  });

  describe('transformMonacoMarkers caching', () => {
    const yamlMarker = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 5,
      severity: MarkerSeverity.Error,
      message: 'Incorrect type. Expected "object"',
      source: 'yaml-schema:workflow',
    };

    it('reuses the parsed YAML document and formatted markers across calls within the same model version', () => {
      const { result } = renderHook(() =>
        useMonacoMarkersChangedInterceptor({
          yamlDocumentRef: { current: null },
          workflowYamlSchema: z.object({}),
        })
      );

      const model = createFakeModel({ versionId: 7 });
      result.current.transformMonacoMarkers(model, 'yaml', [yamlMarker as any]);
      result.current.transformMonacoMarkers(model, 'yaml', [yamlMarker as any]);

      expect(parseDocumentMock).toHaveBeenCalledTimes(1);
      expect(formatMonacoYamlMarkerMock).toHaveBeenCalledTimes(1);
    });

    it('reparses and reformats when the model version changes', () => {
      const { result } = renderHook(() =>
        useMonacoMarkersChangedInterceptor({
          yamlDocumentRef: { current: null },
          workflowYamlSchema: z.object({}),
        })
      );

      result.current.transformMonacoMarkers(createFakeModel({ versionId: 1 }), 'yaml', [
        yamlMarker as any,
      ]);
      result.current.transformMonacoMarkers(
        createFakeModel({ versionId: 2, value: 'name: changed' }),
        'yaml',
        [yamlMarker as any]
      );

      expect(parseDocumentMock).toHaveBeenCalledTimes(2);
      expect(formatMonacoYamlMarkerMock).toHaveBeenCalledTimes(2);
    });

    it('does not reuse the cache across different model instances even when versionId matches', () => {
      const { result } = renderHook(() =>
        useMonacoMarkersChangedInterceptor({
          yamlDocumentRef: { current: null },
          workflowYamlSchema: z.object({}),
        })
      );

      result.current.transformMonacoMarkers(
        createFakeModel({ id: 'model-A', versionId: 1, value: 'name: a' }),
        'yaml',
        [yamlMarker as any]
      );
      result.current.transformMonacoMarkers(
        createFakeModel({ id: 'model-B', versionId: 1, value: 'name: b' }),
        'yaml',
        [yamlMarker as any]
      );

      expect(parseDocumentMock).toHaveBeenCalledTimes(2);
      expect(formatMonacoYamlMarkerMock).toHaveBeenCalledTimes(2);
    });

    it('does not parse the YAML document for non-yaml owners', () => {
      const { result } = renderHook(() =>
        useMonacoMarkersChangedInterceptor({
          yamlDocumentRef: { current: null },
          workflowYamlSchema: z.object({}),
        })
      );

      result.current.transformMonacoMarkers(createFakeModel({ versionId: 1 }), 'liquid', [
        yamlMarker as any,
      ]);

      expect(parseDocumentMock).not.toHaveBeenCalled();
      expect(formatMonacoYamlMarkerMock).not.toHaveBeenCalled();
    });
  });
});
