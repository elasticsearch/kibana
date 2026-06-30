/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface DlmPhaseDuration {
  enabled: boolean;
  value: string;
  unit: string;
}

export interface DlmPhasesSelectorValue {
  frozen: DlmPhaseDuration;
  delete: DlmPhaseDuration;
}

export interface SerializedDlmPhases {
  frozen_after?: string;
  data_retention?: string;
}

export interface DlmPhasesSelectorEnterpriseConfig {
  /** Whether the user is on Cloud (affects the upgrade modal copy and CTA). */
  isCloudEnabled: boolean;
  /** Whether the user has permission to manage the license (used for the self-managed upgrade modal). */
  canManageLicense: boolean;
  /**
   * Number of trial days remaining. Pass `0` when trial has expired,
   * `undefined` when not on a trial.
   */
  trialDaysLeft?: number;
  onUpgrade?: () => void;
  /** URL for the "Review subscription features" link in the upgrade modal. */
  subscriptionFeaturesUrl: string;
}

export interface DlmPhasesSelectorProps {
  defaultValue?: Partial<{
    frozen: Partial<DlmPhaseDuration>;
    delete: Partial<DlmPhaseDuration>;
  }>;
  isDisabled?: boolean;
  defaultSnapshotRepository?: string;
  /**
   * When true, only the Delete phase is shown (no Hot, no Frozen).
   * Use this on Serverless deployments where the Frozen phase is not available.
   */
  serverless?: boolean;
  hasEnterpriseLicense?: boolean;
  hasDefaultSnapshotRepository?: boolean;
  /**
   * URL to the Snapshot Restore repositories page.
   * Used as the "manage repositories" link in the frozen phase card.
   */
  manageRepositoriesUrl?: string;
  /**
   * URL to create a new default snapshot repository.
   * Used in the "default repository required" modal.
   */
  createDefaultRepositoryUrl?: string;
  /**
   * Whether the current user can create a default snapshot repository.
   * When false, the Frozen phase card is hidden entirely.
   */
  canCreateDefaultSnapshotRepository?: boolean;
  /**
   * Enterprise gating configuration — needed to render the upgrade modal
   * when the user tries to enable the Frozen phase without an Enterprise license.
   */
  enterprise?: DlmPhasesSelectorEnterpriseConfig;
  onRefreshDefaultSnapshotRepository?: () => void | Promise<void>;
  onChange?: (
    value: DlmPhasesSelectorValue,
    serializedValue: SerializedDlmPhases,
    isValid: boolean
  ) => void;
}
