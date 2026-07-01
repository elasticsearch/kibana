/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { Document, Pair, Scalar } from 'yaml';
import { isPair, isScalar, parseDocument } from 'yaml';
import { monaco } from '@kbn/monaco';
import { isTriggerType } from '@kbn/workflows';
import { getTriggerNodesWithType } from '../../../../../common/lib/yaml';
import { triggerSchemas } from '../../../../trigger_schemas';
import { getExtensionStability } from '../../lib/get_stability_note';

/** Marker class for custom (registered) triggers */
export const CUSTOM_TRIGGER_INLINE_CLASS = 'custom-trigger-inline';

/** Sanitized trigger id for use as CSS class (dots → hyphens). Exported so dynamic icon CSS uses the same class. */
export const triggerTypeToCssClass = (triggerType: string): string =>
  triggerType.replace(/\./g, '-');

const getTriggerIcon = (triggerType: string): { className: string } => {
  if (isTriggerType(triggerType)) {
    return { className: triggerType };
  }
  return { className: `ct-${triggerTypeToCssClass(triggerType)}` };
};

function resolveDocument(
  model: monaco.editor.ITextModel,
  doc: Document | null | undefined
): Document | null {
  if (doc?.contents) return doc;
  const value = model.getValue();
  if (!value?.trim()) return null;
  try {
    const parsed = parseDocument(value, { keepSourceTokens: true });
    return parsed?.contents ? parsed : null;
  } catch {
    return null;
  }
}

function isRegisteredCustomTrigger(triggerType: string): boolean {
  const registeredIds = triggerSchemas.getRegisteredIds();
  return registeredIds.includes(triggerType);
}

function tryCreateTriggerDecoration(
  model: monaco.editor.ITextModel,
  triggerNode: ReturnType<typeof getTriggerNodesWithType>[number]
): monaco.editor.IModelDeltaDecoration | null {
  const typePair = triggerNode.items.find(
    (item): item is Pair<Scalar, Scalar> =>
      isPair(item) && isScalar(item.key) && isScalar(item.value) && item.key.value === 'type'
  );
  const valueScalar = typePair?.value;
  const triggerType = valueScalar?.value;
  if (typeof triggerType !== 'string' || triggerType.length < 3 || !valueScalar) return null;

  const typeRange = valueScalar.range;
  if (!typeRange || !Array.isArray(typeRange) || typeRange.length < 3) return null;

  const { className } = getTriggerIcon(triggerType);
  if (!className) return null;

  const isCustomTrigger = !isTriggerType(triggerType);
  if (isCustomTrigger && !isRegisteredCustomTrigger(triggerType)) return null;

  const triggerDefinition = isCustomTrigger
    ? triggerSchemas.getTriggerDefinition(triggerType)
    : undefined;
  const techPreviewClass =
    isCustomTrigger && getExtensionStability(triggerDefinition ?? {}) === 'tech_preview'
      ? ' type-tech-preview'
      : '';
  const inlineClasses = isCustomTrigger
    ? `type-inline-highlight ${CUSTOM_TRIGGER_INLINE_CLASS} type-${className}${techPreviewClass}`
    : `type-inline-highlight type-${className}`;

  const valueStartOffset = typeRange[1];
  const valueEndOffset = typeRange[2];
  const startPosition = model.getPositionAt(valueStartOffset);
  const endPosition = model.getPositionAt(valueEndOffset);
  const currentLineContent = model.getLineContent(startPosition.lineNumber);
  const trimmedLine = currentLineContent.trimStart();
  if (!trimmedLine.startsWith('type:') && !trimmedLine.startsWith('- type:')) return null;

  let targetLineNumber = startPosition.lineNumber;
  let lineContent = model.getLineContent(targetLineNumber);
  let typeIndex = lineContent.indexOf(triggerType);
  if (typeIndex === -1 && endPosition.lineNumber !== startPosition.lineNumber) {
    targetLineNumber = endPosition.lineNumber;
    lineContent = model.getLineContent(targetLineNumber);
    typeIndex = lineContent.indexOf(triggerType);
  }
  const actualStartColumn = typeIndex !== -1 ? typeIndex + 1 : startPosition.column;
  const actualEndColumn =
    typeIndex !== -1 ? typeIndex + triggerType.length + 1 : endPosition.column;

  return {
    range: {
      startLineNumber: targetLineNumber,
      startColumn: actualStartColumn,
      endLineNumber: targetLineNumber,
      endColumn: actualEndColumn,
    },
    options: {
      inlineClassName: inlineClasses,
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
    },
  };
}

function applyDecorationsToCollection(
  editor: monaco.editor.IStandaloneCodeEditor,
  collectionRef: MutableRefObject<monaco.editor.IEditorDecorationsCollection | null>,
  decorations: monaco.editor.IModelDeltaDecoration[]
): void {
  if (collectionRef.current) {
    collectionRef.current.set(decorations);
    return;
  }
  if (decorations.length > 0) {
    try {
      collectionRef.current = editor.createDecorationsCollection(decorations);
    } catch {
      setTimeout(() => {
        if (editor && decorations.length > 0) {
          collectionRef.current = editor.createDecorationsCollection(decorations);
        }
      }, 10);
    }
  }
}

/**
 * Apply trigger type decorations
 */
export function applyTriggerTypeDecorations(
  editor: monaco.editor.IStandaloneCodeEditor,
  collectionRef: MutableRefObject<monaco.editor.IEditorDecorationsCollection | null>,
  doc?: Document | null
): void {
  const model = editor.getModel();
  if (!model) return;

  const docToUse = resolveDocument(model, doc);
  if (!docToUse) {
    if (collectionRef.current) collectionRef.current.set([]);
    return;
  }

  const triggerNodes = getTriggerNodesWithType(docToUse);
  const decorations = triggerNodes
    .map((node) => tryCreateTriggerDecoration(model, node))
    .filter((dec): dec is monaco.editor.IModelDeltaDecoration => dec !== null);

  applyDecorationsToCollection(editor, collectionRef, decorations);
}

interface UseTriggerTypeDecorationsProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  yamlDocument: Document | null;
  isEditorMounted: boolean;
}

export const useTriggerTypeDecorations = ({
  editor,
  yamlDocument,
  isEditorMounted,
}: UseTriggerTypeDecorationsProps) => {
  const triggerTypeDecorationCollectionRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const contentDisposableRef = useRef<monaco.IDisposable | null>(null);
  const applyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const DEBOUNCE_MS = 200;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!isEditorMounted || !editor || !yamlDocument) {
        return;
      }

      const model = editor.getModel();
      if (!model) return;

      contentDisposableRef.current?.dispose();
      contentDisposableRef.current = null;

      applyTriggerTypeDecorations(editor, triggerTypeDecorationCollectionRef, yamlDocument);

      contentDisposableRef.current = model.onDidChangeContent(() => {
        if (applyDebounceRef.current) clearTimeout(applyDebounceRef.current);
        applyDebounceRef.current = setTimeout(() => {
          applyDebounceRef.current = null;
          applyTriggerTypeDecorations(editor, triggerTypeDecorationCollectionRef);
        }, DEBOUNCE_MS);
      });
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (applyDebounceRef.current) {
        clearTimeout(applyDebounceRef.current);
        applyDebounceRef.current = null;
      }
      contentDisposableRef.current?.dispose();
      contentDisposableRef.current = null;
    };
  }, [isEditorMounted, yamlDocument, editor]);

  return {
    decorationCollectionRef: triggerTypeDecorationCollectionRef,
  };
};
