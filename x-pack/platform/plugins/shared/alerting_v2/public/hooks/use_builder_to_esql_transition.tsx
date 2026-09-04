/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuilderState, ComposeDiscoverMode } from '@kbn/alerting-v2-rule-form';
import { RULE_BUILDER_REGISTRY } from '@kbn/alerting-v2-rule-form';
import { getBreachEsqlQuery, getRecoverEsqlQuery } from '@kbn/alerting-v2-schemas';
import React, { useCallback, useState } from 'react';
import type { RuleApiResponse } from '../services/rules_api';
import {
  ConfirmBuilderToEsqlModal,
  CONFIRM_BUILDER_TO_ESQL_VARIANT,
} from '../components/confirm_builder_to_esql_modal';

/**
 * Reconstructs builder form state from `metadata.builder_fields` using the
 * registered `fromFields` adapter, or the fields themselves when the form shape
 * matches the stored shape (no adapter needed).
 */
const tryRestoreFromBuilderFields = (
  type: string,
  builderFields: Record<string, unknown>
): BuilderState | null => {
  const definition = RULE_BUILDER_REGISTRY[type];
  if (!definition) return null;
  if (definition.fromFields) {
    return definition.fromFields(builderFields);
  }
  return builderFields;
};

/**
 * Legacy path: reconstructs builder form state by parsing the ES|QL query text.
 * Only used for rules saved before `metadata.builder_fields` existed.
 */
const tryParseBuilderState = (
  type: string,
  query: string,
  recoveryQuery?: string
): BuilderState | null => {
  const definition = RULE_BUILDER_REGISTRY[type];
  if (definition?.parseState) {
    return definition.parseState(query, recoveryQuery);
  }
  return null;
};

interface UseBuilderToEsqlTransitionOptions {
  onConfirmEsqlFallback: (rule: RuleApiResponse, mode: ComposeDiscoverMode) => void;
  onConfirmSwitch: () => void;
}

interface ResolvedBuilderMode {
  builderType: string;
  initialBuilderState: BuilderState;
}

export const useBuilderToEsqlTransition = ({
  onConfirmEsqlFallback,
  onConfirmSwitch,
}: UseBuilderToEsqlTransitionOptions) => {
  const [pendingEsqlFallback, setPendingEsqlFallback] = useState<{
    rule: RuleApiResponse;
    mode: ComposeDiscoverMode;
  } | null>(null);
  const [showSwitchConfirmation, setShowSwitchConfirmation] = useState(false);

  const resolveBuilderMode = useCallback(
    (rule: RuleApiResponse): ResolvedBuilderMode | 'esql-fallback' | 'esql' => {
      if (!rule.metadata.builder_type) {
        return 'esql';
      }

      // Primary path: restore from stored builder_fields (new rules).
      if (rule.metadata.builder_fields) {
        const state = tryRestoreFromBuilderFields(
          rule.metadata.builder_type,
          rule.metadata.builder_fields
        );
        if (state && typeof state === 'object') {
          return {
            builderType: rule.metadata.builder_type,
            initialBuilderState: state,
          };
        }
      }

      // Legacy path: parse builder state from the ES|QL query text (pre-builder_fields rules).
      const query = rule.query ? getBreachEsqlQuery(rule.query) : '';
      const recoveryQuery = rule.query
        ? getRecoverEsqlQuery(rule.query, rule.recovery_strategy)
        : undefined;
      const state = query
        ? tryParseBuilderState(rule.metadata.builder_type, query, recoveryQuery)
        : null;
      if (state && typeof state === 'object') {
        return {
          builderType: rule.metadata.builder_type,
          initialBuilderState: { ...state, timeField: rule.time_field ?? '@timestamp' },
        };
      }
      return 'esql-fallback';
    },
    []
  );

  const requestEsqlFallback = useCallback((rule: RuleApiResponse, mode: ComposeDiscoverMode) => {
    setPendingEsqlFallback({ rule, mode });
  }, []);

  const confirmEsqlFallback = useCallback(() => {
    if (!pendingEsqlFallback) return;
    const { rule, mode } = pendingEsqlFallback;
    setPendingEsqlFallback(null);
    onConfirmEsqlFallback(rule, mode);
  }, [pendingEsqlFallback, onConfirmEsqlFallback]);

  const cancelEsqlFallback = useCallback(() => {
    setPendingEsqlFallback(null);
  }, []);

  const requestSwitchToEsql = useCallback(() => {
    setShowSwitchConfirmation(true);
  }, []);

  const confirmSwitchToEsql = useCallback(() => {
    setShowSwitchConfirmation(false);
    onConfirmSwitch();
  }, [onConfirmSwitch]);

  const cancelSwitchToEsql = useCallback(() => {
    setShowSwitchConfirmation(false);
  }, []);

  const confirmationModal = pendingEsqlFallback ? (
    <ConfirmBuilderToEsqlModal
      variant={CONFIRM_BUILDER_TO_ESQL_VARIANT.INCOMPATIBLE_QUERY}
      onConfirm={confirmEsqlFallback}
      onCancel={cancelEsqlFallback}
    />
  ) : showSwitchConfirmation ? (
    <ConfirmBuilderToEsqlModal
      variant={CONFIRM_BUILDER_TO_ESQL_VARIANT.USER_INITIATED}
      onConfirm={confirmSwitchToEsql}
      onCancel={cancelSwitchToEsql}
    />
  ) : null;

  return {
    resolveBuilderMode,
    requestEsqlFallback,
    requestSwitchToEsql,
    confirmationModal,
  };
};
