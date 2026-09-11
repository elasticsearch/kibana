/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { KbnDangerCallout } from '@kbn/ui-callout';
import { i18n } from '@kbn/i18n';
import { ElasticRequestState } from '@kbn/unified-doc-viewer';

const DOCUMENT_NOT_FOUND = i18n.translate(
  'xpack.securitySolution.flyout.document.overviewWrapper.documentNotFound',
  {
    defaultMessage: 'Cannot find document. No documents match that ID.',
  }
);

const FETCH_ERROR = i18n.translate(
  'xpack.securitySolution.flyout.document.overviewWrapper.fetchError',
  {
    defaultMessage: 'Unable to fetch document details.',
  }
);

export interface DocumentUnavailableCalloutProps {
  /**
   * Terminal outcome of the document request: `NotFound` when no document matches the requested
   * id, anything else is treated as a failed fetch.
   */
  requestState: ElasticRequestState;
}

/**
 * Callout shown when the requested document could not be resolved.
 */
export const DocumentUnavailableCallout = memo(
  ({ requestState }: DocumentUnavailableCalloutProps) => {
    const isNotFound = requestState === ElasticRequestState.NotFound;

    return (
      <KbnDangerCallout
        announceOnMount
        title={isNotFound ? DOCUMENT_NOT_FOUND : FETCH_ERROR}
        data-test-subj={
          isNotFound ? 'document-overview-wrapper-not-found' : 'document-overview-fetch-error'
        }
      />
    );
  }
);

DocumentUnavailableCallout.displayName = 'DocumentUnavailableCallout';
