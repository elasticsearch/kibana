/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiFlyoutProps } from '@elastic/eui';
import type { SerializedPolicy } from '@kbn/index-lifecycle-management-common-shared';

export interface InspectIlmPolicyFlyoutPrimaryAction {
  /** Button label shown as the flyout's primary action. */
  label: string;
  /**
   * Called when the user clicks the primary action button.
   * The current inspected policy name is provided for convenience.
   */
  onClick: (policyName: string) => void | Promise<void>;
  /** Optional test subject for the primary action button. */
  'data-test-subj'?: string;
  /** Optional disabled state for the primary action button. */
  isDisabled?: boolean;
}

export interface InspectIlmPolicyFlyoutProps {
  /** The name of the ILM policy being inspected. */
  policyName: string;
  /** The full serialized policy object (phases + _meta). */
  policy: SerializedPolicy;
  /**
   * Called when the user clicks the "Back" button.
   * Closes this flyout and returns to the previous one.
   */
  onBack: () => void;
  /**
   * Called when the user clicks "Edit policy".
   * Should navigate to the ILM policy editor for the given policy name.
   */
  onEditPolicy: (policyName: string) => void;
  /**
   * Primary action (label + callback) is provided by the calling flyout so it
   * can match the caller's main action (e.g. "Apply").
   */
  primaryAction: InspectIlmPolicyFlyoutPrimaryAction;
  /** Flyout display mode. Defaults to push. */
  type?: EuiFlyoutProps['type'];
  /** Optional container to constrain push behavior (EuiFlyout container). */
  container?: EuiFlyoutProps['container'];
  /**
   * Whether the flyout should take over focus (modal-like).
   * Defaults to true.
   */
  ownFocus?: EuiFlyoutProps['ownFocus'];
}
