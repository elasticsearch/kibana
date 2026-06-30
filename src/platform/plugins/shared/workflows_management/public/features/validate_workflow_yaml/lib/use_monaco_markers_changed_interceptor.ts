/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useRef, useState } from 'react';
import { parseDocument } from 'yaml';
import type YAML from 'yaml';
import type { monaco } from '@kbn/monaco';
import type { z } from '@kbn/zod/v4';
import { filterMonacoYamlMarkers } from './filter_monaco_yaml_markers';
import { formatMonacoYamlMarker } from './format_monaco_yaml_marker';
import type { MarkerSeverity } from '../../../widgets/workflow_yaml_editor/lib/utils';
import { getSeverityString } from '../../../widgets/workflow_yaml_editor/lib/utils';
import {
  BATCHED_CUSTOM_MARKER_OWNER,
  isYamlValidationMarkerOwner,
  validationResultFingerprint,
  type YamlValidationResult,
} from '../model/types';

export interface UseMonacoMarkersChangedInterceptorResult {
  transformMonacoMarkers: (
    editorModel: monaco.editor.ITextModel,
    owner: string,
    markers: monaco.editor.IMarkerData[]
  ) => monaco.editor.IMarker[] | monaco.editor.IMarkerData[];
  handleMarkersChanged: (
    editorModel: monaco.editor.ITextModel,
    owner: string,
    markers: monaco.editor.IMarker[] | monaco.editor.IMarkerData[]
  ) => void;
  validationErrors: YamlValidationResult[];
}

interface UseMonacoMarkersChangedInterceptorProps {
  yamlDocumentRef: React.RefObject<YAML.Document | null>;
  workflowYamlSchema: z.ZodSchema;
}

function formattedMarkerKey(marker: monaco.editor.IMarkerData): string {
  return [
    marker.startLineNumber,
    marker.startColumn,
    marker.endLineNumber,
    marker.endColumn,
    marker.severity,
    marker.source ?? '',
    typeof marker.code === 'string' ? marker.code : marker.code?.value ?? '',
    marker.message ?? '',
  ].join('|');
}

export function useMonacoMarkersChangedInterceptor({
  yamlDocumentRef,
  workflowYamlSchema,
}: UseMonacoMarkersChangedInterceptorProps): UseMonacoMarkersChangedInterceptorResult {
  const [validationErrors, setValidationErrors] = useState<YamlValidationResult[]>([]);
  const lastFingerprintRef = useRef<string>('');
  // yamlDocumentRef lags the model by the 500ms Redux compute debounce, so formatMonacoYamlMarker
  // needs a parse matching the current model. Cache by (modelId, versionId) so repeated
  // setModelMarkers bursts on the same model version share one parse; modelId guards against
  // collisions when the editor swaps to a different model whose versionId starts over.
  const freshYamlDocCacheRef = useRef<{
    modelId: string;
    versionId: number;
    doc: YAML.Document;
  } | null>(null);

  // Memoize per-marker formatting output for the current model version. monaco-yaml's worker
  // can re-emit the same marker set across multiple setModelMarkers callbacks (same model
  // version, same markers); caching the formatted output collapses those into a Map lookup.
  const formattedMarkerCacheRef = useRef<{
    modelId: string;
    versionId: number;
    entries: Map<string, monaco.editor.IMarkerData>;
  } | null>(null);

  const transformMonacoMarkers = useCallback(
    (
      editorModel: monaco.editor.ITextModel,
      owner: string,
      markers: monaco.editor.IMarkerData[]
    ) => {
      const filtered = filterMonacoYamlMarkers(markers, editorModel, yamlDocumentRef.current);

      if (owner !== 'yaml') {
        return filtered;
      }

      const modelId = editorModel.id;
      const versionId = editorModel.getVersionId();

      const docCached = freshYamlDocCacheRef.current;
      const freshYamlDocument =
        docCached && docCached.modelId === modelId && docCached.versionId === versionId
          ? docCached.doc
          : parseDocument(editorModel.getValue());
      if (!docCached || docCached.modelId !== modelId || docCached.versionId !== versionId) {
        freshYamlDocCacheRef.current = { modelId, versionId, doc: freshYamlDocument };
      }

      const formatCached = formattedMarkerCacheRef.current;
      const entries =
        formatCached && formatCached.modelId === modelId && formatCached.versionId === versionId
          ? formatCached.entries
          : new Map<string, monaco.editor.IMarkerData>();
      if (entries !== formatCached?.entries) {
        formattedMarkerCacheRef.current = { modelId, versionId, entries };
      }

      return filtered.map((marker) => {
        const cacheKey = formattedMarkerKey(marker);
        const hit = entries.get(cacheKey);
        if (hit) {
          return hit;
        }
        const formatted = formatMonacoYamlMarker(
          marker,
          editorModel,
          workflowYamlSchema,
          freshYamlDocument
        );
        entries.set(cacheKey, formatted);
        return formatted;
      });
    },
    [workflowYamlSchema, yamlDocumentRef]
  );

  const handleMarkersChanged = useCallback(
    (
      _editorModel: monaco.editor.ITextModel,
      owner: string,
      markers: monaco.editor.IMarkerData[]
    ) => {
      const isBatched = owner === BATCHED_CUSTOM_MARKER_OWNER;
      if (!isBatched && !isYamlValidationMarkerOwner(owner)) {
        return;
      }

      const errors: YamlValidationResult[] = markers.map((marker) => {
        const effectiveOwner = isBatched && marker.source ? marker.source : owner;

        return {
          message: marker.message,
          severity: getSeverityString(marker.severity as MarkerSeverity),
          startLineNumber: marker.startLineNumber,
          startColumn: marker.startColumn,
          endLineNumber: marker.endLineNumber,
          endColumn: marker.endColumn,
          id: `${effectiveOwner}-${marker.startLineNumber}-${marker.startColumn}-${marker.endLineNumber}-${marker.endColumn}`,
          owner: effectiveOwner,
          source: marker.source,
          hoverMessage: null,
        } as YamlValidationResult;
      });

      setValidationErrors((prevErrors) => {
        let nextErrors: YamlValidationResult[];
        if (isBatched) {
          const prevYamlOnly = prevErrors?.filter((e) => e.owner === 'yaml');
          nextErrors = [...(prevYamlOnly ?? []), ...errors];
        } else {
          const prevOtherOwners = prevErrors?.filter((e) => e.owner !== owner);
          nextErrors = [...(prevOtherOwners ?? []), ...errors];
        }

        const fingerprint = nextErrors.map(validationResultFingerprint).sort().join('\n');
        if (fingerprint === lastFingerprintRef.current) {
          return prevErrors;
        }
        lastFingerprintRef.current = fingerprint;
        return nextErrors;
      });
    },
    // the yamlDocumentRef is not needed here because it's a ref object and not a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workflowYamlSchema]
  );

  return {
    validationErrors,
    transformMonacoMarkers,
    handleMarkersChanged,
  };
}
