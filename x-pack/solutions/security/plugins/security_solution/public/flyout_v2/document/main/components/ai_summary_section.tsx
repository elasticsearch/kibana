/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { getFieldValue } from '@kbn/discover-utils';
import { EVENT_KIND } from '@kbn/rule-data-utils';
import type { TimelineEventsDetailsItem } from '@kbn/timelines-plugin/common';
import { DocumentSummarySection } from './document_summary_section';
import { EventKind } from '../constants/event_kinds';
import { useEventDetails } from '../../../../flyout/document_details/shared/hooks/use_event_details';
import { getRawData } from '../../../../assistant/helpers';
import { AI_SUMMARY_SECTION_TEST_ID } from './test_ids';

const EMPTY_DATA: TimelineEventsDetailsItem[] = [];

export interface AISummarySectionProps {
  /**
   * Document to display the AI summary for.
   */
  hit: DataTableRecord;
}

/**
 * AI summary section under the overview tab of the new flyout_v2 alert
 * details flyout. Resolves the document's prompt context, then defers to
 * the shared `DocumentSummarySection` for the rendering.
 *
 * The current AI summary prompt is alert-specific, so the section is only
 * rendered when the document is an alert (`event.kind === 'signal'`).
 * Events fall through and render nothing until an event-specific prompt is
 * available.
 */
export const AISummarySection = memo(({ hit }: AISummarySectionProps) => {
  const isAlert = useMemo(
    () => (getFieldValue(hit, EVENT_KIND) as string) === EventKind.signal,
    [hit]
  );

  const { dataFormattedForFieldBrowser } = useEventDetails({
    eventId: hit.raw._id,
    indexName: hit.raw._index,
    skip: !isAlert,
  });

  const safeData = useMemo(
    () => dataFormattedForFieldBrowser ?? EMPTY_DATA,
    [dataFormattedForFieldBrowser]
  );

  const getPromptContext = useCallback(async () => getRawData(safeData), [safeData]);

  if (!isAlert) {
    return null;
  }

  const documentId = hit.raw._id ?? '';

  return (
    <DocumentSummarySection
      documentId={documentId}
      getPromptContext={getPromptContext}
      data-test-subj={AI_SUMMARY_SECTION_TEST_ID}
    />
  );
});

AISummarySection.displayName = 'AISummarySection';
