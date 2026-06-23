/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiLink, EuiToolTip } from '@elastic/eui';
import type { EuiBasicTableColumn, EuiTableDataType } from '@elastic/eui';
import { omit } from 'lodash/fp';
import React from 'react';
import styled from 'styled-components';
import { ACTION_COLUMN_WIDTH } from './common_styles';
import { isUntitled } from '../helpers';
import { NotePreviews } from '../note_previews';
import * as i18n from '../translations';
import type { OnOpenTimeline, OnToggleShowNotes, OpenTimelineResult } from '../types';
import { getEmptyTagValue } from '../../../../common/components/empty_value';
import { FormattedRelativePreferenceDate } from '../../../../common/components/formatted_date';
import { type TimelineType, TimelineTypeEnum } from '../../../../../common/api/timeline';
import { TimelineId } from '../../../../../common/types';

const LineClampTextContainer = styled.span`
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

/**
 * Returns the column definitions (passed as the `columns` prop to
 * `EuiBasicTable`) that are common to the compact `Open Timeline` modal view,
 * and the full view shown in the `All Timelines` view of the `Timelines` page
 */
export const getCommonColumns = ({
  itemIdToExpandedNotesRowMap,
  onOpenTimeline,
  onToggleShowNotes,
  timelineType,
}: {
  onOpenTimeline: OnOpenTimeline;
  onToggleShowNotes: OnToggleShowNotes;
  itemIdToExpandedNotesRowMap: Record<string, JSX.Element>;
  timelineType: TimelineType | null;
}): Array<EuiBasicTableColumn<object>> => [
  {
    dataType: 'auto' as EuiTableDataType,
    isExpander: true,
    render: ({ notes, savedObjectId }: OpenTimelineResult) =>
      notes != null && notes.length > 0 && savedObjectId != null ? (
        <EuiToolTip
          content={itemIdToExpandedNotesRowMap[savedObjectId] ? i18n.COLLAPSE : i18n.EXPAND}
          disableScreenReaderOutput
        >
          <EuiButtonIcon
            data-test-subj="expand-notes"
            onClick={() =>
              itemIdToExpandedNotesRowMap[savedObjectId] != null
                ? onToggleShowNotes(omit(savedObjectId, itemIdToExpandedNotesRowMap))
                : onToggleShowNotes({
                    ...itemIdToExpandedNotesRowMap,
                    [savedObjectId]: <NotePreviews notes={notes} timelineId={TimelineId.active} />,
                  })
            }
            aria-label={itemIdToExpandedNotesRowMap[savedObjectId] ? i18n.COLLAPSE : i18n.EXPAND}
            iconType={
              itemIdToExpandedNotesRowMap[savedObjectId]
                ? 'chevronSingleDown'
                : 'chevronSingleRight'
            }
          />
        </EuiToolTip>
      ) : null,
    width: ACTION_COLUMN_WIDTH,
  },
  {
    dataType: 'string' as EuiTableDataType,
    field: 'title',
    name:
      timelineType === TimelineTypeEnum.default ? i18n.TIMELINE_NAME : i18n.TIMELINE_TEMPLATE_NAME,
    render: (title: string, timelineResult: OpenTimelineResult) =>
      timelineResult.savedObjectId != null ? (
        <EuiLink
          data-test-subj={`timeline-title-${timelineResult.savedObjectId}`}
          onClick={() =>
            onOpenTimeline({
              duplicate: false,
              timelineId: `${timelineResult.savedObjectId}`,
            })
          }
        >
          {isUntitled(timelineResult) ? (
            i18n.UNTITLED_TIMELINE
          ) : (
            <LineClampTextContainer>{title}</LineClampTextContainer>
          )}
        </EuiLink>
      ) : (
        <div data-test-subj={`title-no-saved-object-id-${title || 'no-title'}`}>
          {isUntitled(timelineResult) ? i18n.UNTITLED_TIMELINE : title}
        </div>
      ),
    sortable: false,
  },
  {
    dataType: 'string' as EuiTableDataType,
    field: 'description',
    name: i18n.DESCRIPTION,
    render: (description: string) => (
      <LineClampTextContainer data-test-subj="description">
        {description != null && description.trim().length > 0 ? description : getEmptyTagValue()}
      </LineClampTextContainer>
    ),
    sortable: false,
  },
  {
    dataType: 'date' as EuiTableDataType,
    field: 'updated',
    name: i18n.LAST_MODIFIED,
    render: (date: number, timelineResult: OpenTimelineResult) => (
      <div data-test-subj="updated">
        {timelineResult.updated != null ? (
          <FormattedRelativePreferenceDate value={date} />
        ) : (
          getEmptyTagValue()
        )}
      </div>
    ),
    sortable: true,
  },
];
