/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SerializedPolicy } from '@kbn/index-lifecycle-management-common-shared';

export type DataLifecycleMethod = 'dlm' | 'ilm';

export type DataLifecycleApplyPayload =
  | { inheritLifecycle: true }
  | { inheritLifecycle: false; method: 'dlm'; frozenAfter?: string; dataRetention?: string }
  | { inheritLifecycle: false; method: 'ilm'; ilmPolicyName: string };

export interface BuildDataLifecycleApplyPayloadArgs {
  inheritLifecycle: boolean;
  method: DataLifecycleMethod;
  ilmPolicyName?: string;
  /** Serialized frozen phase duration (e.g. `'30d'`). Only used when `method === 'dlm'`. */
  frozenAfter?: string;
  /** Serialized delete phase retention (e.g. `'60d'`). Only used when `method === 'dlm'`. */
  dataRetention?: string;
}

/**
 * Builds the "apply" payload consumers need to persist a lifecycle change.
 *
 * - When inheriting, the upstream source is the source of truth.
 * - When using DLM, the serialized phase durations are forwarded so callers
 *   have everything they need in `onApply` without a separate `onChange` subscription.
 * - When using ILM, the selected policy name is required.
 */
export const buildDataLifecycleApplyPayload = ({
  inheritLifecycle,
  method,
  ilmPolicyName,
  frozenAfter,
  dataRetention,
}: BuildDataLifecycleApplyPayloadArgs): DataLifecycleApplyPayload | undefined => {
  if (inheritLifecycle) return { inheritLifecycle: true };
  if (method === 'dlm')
    return { inheritLifecycle: false, method: 'dlm', frozenAfter, dataRetention };
  if (!ilmPolicyName) return undefined;
  return { inheritLifecycle: false, method: 'ilm', ilmPolicyName };
};

/**
 * Minimal phase shape needed by the flyout body for summary stats:
 * delete age, phase count, and downsample step count.
 */
export interface IlmPolicyPhaseForFlyout {
  min_age?: string;
  actions?: {
    delete?: unknown;
    downsample?: { fixed_interval?: string };
    [key: string]: unknown;
  };
}

/**
 * Minimal ILM policy shape accepted by EditDataLifecycleFlyoutBody.
 * Only the fields needed for list display and summary stats are required.
 * Provide `serializedPolicy` to enable the full inspect flyout.
 */
export interface IlmPolicyForFlyout {
  name: string;
  phases: {
    hot?: IlmPolicyPhaseForFlyout;
    warm?: IlmPolicyPhaseForFlyout;
    cold?: IlmPolicyPhaseForFlyout;
    frozen?: IlmPolicyPhaseForFlyout;
    delete?: IlmPolicyPhaseForFlyout;
  };
  /** Full serialized policy — provide to enable the inspect flyout. */
  serializedPolicy?: SerializedPolicy;
}
