/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  BareNote,
  BarePinnedEvent,
  ColumnHeaderResult,
  type DataProviderType,
  DataProviderTypeEnum,
  DataProviderResult,
  FavoriteTimelineResponse,
  FilterTimelineResult,
  ImportTimelineResult,
  ImportTimelines,
  type Note,
  PinnedEvent,
  PersistTimelineResponse,
  QueryMatchResult,
  ResolvedTimeline,
  RowRendererId,
  RowRendererIdEnum,
  SavedTimeline,
  SavedTimelineWithSavedObjectId,
  Sort,
  SortDirection,
  SortFieldTimeline,
  SortFieldTimelineEnum,
  TemplateTimelineType,
  TemplateTimelineTypeEnum,
  TimelineErrorResponse,
  TimelineResponse,
  TimelineSavedToReturnObject,
  TimelineStatus,
  TimelineStatusEnum,
  TimelineType,
  TimelineTypeEnum,
} from './components.gen';

export type { DataProviderType, Note };
export {
  BareNote,
  BarePinnedEvent,
  ColumnHeaderResult,
  DataProviderResult,
  DataProviderTypeEnum,
  FavoriteTimelineResponse,
  FilterTimelineResult,
  ImportTimelineResult,
  ImportTimelines,
  PinnedEvent,
  PersistTimelineResponse,
  QueryMatchResult,
  ResolvedTimeline,
  RowRendererId,
  RowRendererIdEnum,
  SavedTimeline,
  SavedTimelineWithSavedObjectId,
  Sort,
  SortDirection,
  SortFieldTimeline,
  SortFieldTimelineEnum,
  TemplateTimelineType,
  TimelineErrorResponse,
  TimelineResponse,
  TemplateTimelineTypeEnum,
  TimelineSavedToReturnObject,
  TimelineStatus,
  TimelineStatusEnum,
  TimelineType,
  TimelineTypeEnum,
};

/**
 * This type represents a timeline type stored in a saved object that does not include any fields that reference
 * other saved objects.
 */
export type TimelineWithoutExternalRefs = Omit<SavedTimeline, 'dataViewId' | 'savedQueryId'>;

export type BarePinnedEventWithoutExternalRefs = Omit<BarePinnedEvent, 'timelineId'>;

/**
 * This type represents a note type stored in a saved object that does not include any fields that reference
 * other saved objects.
 */
export type BareNoteWithoutExternalRefs = Omit<BareNote, 'timelineId'>;

export const RowRendererCount = Object.keys(RowRendererIdEnum).length;
export const RowRendererValues = Object.values(RowRendererId.enum);

/**
 * Import/export timelines
 */

export type ExportedGlobalNotes = Array<Exclude<Note, 'eventId'>>;
export type ExportedEventNotes = Note[];

export interface ExportedNotes {
  eventNotes: ExportedEventNotes;
  globalNotes: ExportedGlobalNotes;
}

export interface ExportTimelineNotFoundError {
  statusCode: number;
  message: string;
}

export interface PageInfoTimeline {
  pageIndex: number;
  pageSize: number;
}

export interface SortTimeline {
  sortField: SortFieldTimeline;
  sortOrder: SortDirection;
}
