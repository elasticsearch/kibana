/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import type {
  ComposeDiscoverAction,
  ComposeDiscoverState,
  CustomRecoveryRenderProps,
} from '../types';
import type { RuleFormServices } from '../../../form/contexts/rule_form_context';

export type BuilderState = unknown;

/**
 * The active builder's contribution to a save: its type plus the parameters the
 * server generates the query from. Carries no query, because the server rejects
 * one sent alongside builder fields.
 */
export interface BuilderSubmission {
  type: string;
  fields: Record<string, unknown>;
}

/**
 * How a builder presents itself on the create-rule options panel. Supplying
 * this is what makes a builder reachable from the UI, so no shared component
 * needs editing to add one.
 */
export interface RuleBuilderCreateOption {
  title: string;
  description: string;
  /** EUI icon type. */
  iconType: string;
  /** Flyout header when this builder is active. Defaults to "Create rule". */
  flyoutTitle?: string;
  /** Lower sorts earlier. Builders without one sort last, then by title. */
  order?: number;
}

export interface RuleBuilderStepProps {
  state: ComposeDiscoverState;
  dispatch: React.Dispatch<ComposeDiscoverAction>;
  services: RuleFormServices;
}

export interface RuleBuilderDefinition<TState = BuilderState> {
  type: string;
  createOption: RuleBuilderCreateOption;
  stepTitle: string;
  createDefaultState: () => TState;
  renderStep: (props: RuleBuilderStepProps) => React.ReactNode;
  renderRecoveryStep?: (props: CustomRecoveryRenderProps) => React.ReactNode;
  validate?: (state: ComposeDiscoverState, builderState?: TState) => boolean;
  /**
   * Reconstructs form state from a saved ES|QL query. Only used for rules saved
   * before `metadata.builder_fields` existed; rules that carry builder fields
   * are reopened from those instead.
   */
  parseState?: (query: string, recoveryQuery?: string) => TState | null;
  /**
   * Projects form state onto the `metadata.builder_fields` payload. Defaults to
   * sending the state unchanged; implement it when the form holds view-only
   * concerns (React list keys, collapsed flags) that the server's schema, being
   * strict, would reject.
   *
   * Returns `object` rather than a record because a builder names its fields
   * with a declared type; `toBuilderSubmission` widens it after checking.
   */
  toFields?: (state: TState) => object;
  /**
   * Inverse of {@link toFields}, used to reopen a saved rule in the builder.
   * Return `null` if the stored fields cannot be represented, which drops the
   * user into ES|QL mode rather than showing a half-populated form.
   */
  fromFields?: (fields: Record<string, unknown>) => TState | null;
}
