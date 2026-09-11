/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactNode } from 'react';
import { EuiEmptyPrompt, EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner } from '@elastic/eui';
import { useAbortableAsync } from '@kbn/react-hooks';
import type { Conversation } from '@kbn/agent-builder-common';
import type { Investigation } from '../types';
import { TEMPLATE_UI_LABELS } from './translations';

/** Resolves the investigation backing an Agent Builder conversation. */
export type InvestigationLoader = (conversationId: string) => Promise<Investigation>;

export interface InvestigationSlotProps {
  conversation: Conversation;
  loadInvestigation: InvestigationLoader;
  /** Rendered when the investigation cannot be resolved. Pass `null` to render nothing. */
  fallback?: ReactNode;
  children: (investigation: Investigation, refresh: () => void) => ReactNode;
}

/** Resolves the conversation's investigation and renders `children` once it is available. */
export const InvestigationSlot = ({
  conversation,
  loadInvestigation,
  fallback,
  children,
}: InvestigationSlotProps) => {
  const { id } = conversation;
  const {
    value: investigation,
    loading,
    error,
    refresh,
  } = useAbortableAsync(() => loadInvestigation(id), [id, loadInvestigation]);

  // `useAbortableAsync` reports `loading: false` until its effect runs, so the first render has
  // neither a value nor an error yet.
  if (loading || (!investigation && !error)) {
    return (
      <EuiFlexGroup justifyContent="center" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiLoadingSpinner size="m" aria-label={TEMPLATE_UI_LABELS.loading} />
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (!investigation) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }
    return (
      <EuiEmptyPrompt
        iconType={error ? 'warning' : 'documents'}
        color={error ? 'danger' : 'subdued'}
        title={
          <h3>{error ? TEMPLATE_UI_LABELS.loadErrorTitle : TEMPLATE_UI_LABELS.notFoundTitle}</h3>
        }
      />
    );
  }

  return <>{children(investigation, refresh)}</>;
};
