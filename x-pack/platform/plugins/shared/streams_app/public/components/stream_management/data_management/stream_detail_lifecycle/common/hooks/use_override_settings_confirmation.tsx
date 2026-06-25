/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { Streams } from '@kbn/streams-schema';
import {
  Streams as StreamsSchema,
  isIlmLifecycle,
  isInheritLifecycle,
  isRoot,
} from '@kbn/streams-schema';
import { OverrideSettingsModal } from '../../data_phases/override_settings_modal/override_settings_modal';

export interface UseOverrideSettingsConfirmationArgs {
  definition: Streams.ingest.all.GetResponse;
  isCurrentlyInherited?: boolean;
  forceDlm?: boolean;
}

export interface ConfirmOverrideOptions {
  targetMethod?: 'dlm' | 'ilm';
}

export interface UseOverrideSettingsConfirmationResult {
  confirmOverride: (action: () => void, options?: ConfirmOverrideOptions) => void;
  modal: React.ReactNode;
}

export const useOverrideSettingsConfirmation = ({
  definition,
  isCurrentlyInherited,
  forceDlm = false,
}: UseOverrideSettingsConfirmationArgs): UseOverrideSettingsConfirmationResult => {
  const [isOpen, setIsOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const inheritsDlmFromIndexTemplate = useMemo(() => {
    const ingestLifecycle = definition.stream.ingest?.lifecycle;
    const isLifecycleInherited =
      isCurrentlyInherited ?? (ingestLifecycle ? isInheritLifecycle(ingestLifecycle) : false);

    if (!isLifecycleInherited) {
      return false;
    }

    // Only DLM lifecycles get the override confirmation; ILM does not.
    if (!forceDlm && isIlmLifecycle(definition.effective_lifecycle)) {
      return false;
    }

    const isWiredStream = StreamsSchema.WiredStream.GetResponse.is(definition);
    const isRootStream = isRoot(definition.stream.name);
    return !isWiredStream || isRootStream;
  }, [definition, forceDlm, isCurrentlyInherited]);

  const closeModal = useCallback(() => {
    pendingActionRef.current = null;
    setIsOpen(false);
  }, []);

  const confirmOverride = useCallback(
    (action: () => void, options?: ConfirmOverrideOptions) => {
      const targetMethod = options?.targetMethod ?? 'dlm';
      if (!inheritsDlmFromIndexTemplate || targetMethod === 'ilm') {
        action();
        return;
      }
      pendingActionRef.current = action;
      setIsOpen(true);
    },
    [inheritsDlmFromIndexTemplate]
  );

  const onConfirm = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setIsOpen(false);
    action?.();
  }, []);

  const modal = isOpen ? <OverrideSettingsModal onCancel={closeModal} onSave={onConfirm} /> : null;

  return { confirmOverride, modal };
};
