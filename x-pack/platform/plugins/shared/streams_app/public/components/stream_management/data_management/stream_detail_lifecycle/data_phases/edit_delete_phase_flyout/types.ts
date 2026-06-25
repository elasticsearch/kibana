/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PhaseName } from '@kbn/streams-schema';

export type EditDeletePhaseFlyoutValue =
  | {
      deletePhaseEnabled: false;
    }
  | {
      deletePhaseEnabled: true;
      dataRetention: string;
      isDefaultRetention: boolean;
    };

export interface EditDeletePhaseFlyoutChangeMeta {
  invalidPhases: PhaseName[];
}

export interface EditDeletePhaseFlyoutProps {
  initialValue: EditDeletePhaseFlyoutValue;
  defaultRetentionPeriod?: string;
  maximumRetentionPeriod?: string;
  showRestoreDefaultButton?: boolean;
  /**
   * Whether the "Remove delete phase" button is shown. Removing the delete phase
   * disables the lifecycle (infinite retention), which is not supported in Serverless.
   */
  allowRemoveDeletePhase?: boolean;
  onChange?: (next: EditDeletePhaseFlyoutValue, meta?: EditDeletePhaseFlyoutChangeMeta) => void;
  onChangeDebounceMs?: number;
  onSave: (next: EditDeletePhaseFlyoutValue) => void;
  onClose: () => void;
  isSaving?: boolean;
  'data-test-subj'?: string;
}
