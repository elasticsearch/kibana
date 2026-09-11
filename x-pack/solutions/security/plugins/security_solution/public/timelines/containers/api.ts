/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty } from 'lodash';

import type { SavedSearch } from '@kbn/saved-search-plugin/common';

import type {
  CleanDraftTimelinesResponse,
  TimelineType,
  PatchTimelineResponse,
  CreateTimelinesResponse,
  CopyTimelineResponse,
  GetDraftTimelinesResponse,
  GetTimelinesRequestQuery,
  SavedTimeline,
  ImportTimelinesResponse,
} from '../../../common/api/timeline';
import {
  ImportTimelineResult,
  TimelineErrorResponse,
  TimelineStatusEnum,
  PersistFavoriteRouteResponse,
  TimelineTypeEnum,
  GetTimelineResponse,
  ResolveTimelineResponse,
  GetTimelinesResponse,
  PersistTimelineResponse,
} from '../../../common/api/timeline';
import {
  TIMELINE_URL,
  TIMELINE_DRAFT_URL,
  TIMELINE_IMPORT_URL,
  TIMELINE_EXPORT_URL,
  TIMELINE_PREPACKAGED_URL,
  TIMELINE_RESOLVE_URL,
  TIMELINES_URL,
  TIMELINE_COPY_URL,
  TIMELINE_FAVORITE_URL,
} from '../../../common/constants';

import { KibanaServices } from '../../common/lib/kibana';
import { GET_TIMELINE_DISCOVER_SAVED_SEARCH_TITLE } from '../components/timeline/tabs/esql/translations';
import { ToasterError } from '../../common/components/toasters';
import { parseOrThrowErrorFactory } from '../../../common/timelines/zod_errors';
import type {
  ExportDocumentsProps,
  ImportDataProps,
} from '../../detection_engine/rule_management/logic';

interface RequestPostTimeline {
  timeline: SavedTimeline;
  signal?: AbortSignal;
}

interface RequestPatchTimeline<T = string> extends RequestPostTimeline {
  timelineId: T;
  version: T;
  savedSearch?: SavedSearch | null;
}

type RequestPersistTimeline = RequestPostTimeline & Partial<RequestPatchTimeline<null | string>>;

/**
 * Derives the Discover session title from the timeline title at persist time.
 *
 * The saved search held in redux is a snapshot taken by the ES|QL tab, and a rename dispatches
 * the title change and the save in the same tick, so that snapshot still carries the previous
 * title when it reaches this point. Deriving the title here keeps the persisted Discover session
 * in sync with the timeline it belongs to.
 */
const withDiscoverSessionTitle = (
  savedSearch: SavedSearch,
  timelineTitle: SavedTimeline['title']
): SavedSearch => ({
  ...savedSearch,
  ...(timelineTitle ? { title: GET_TIMELINE_DISCOVER_SAVED_SEARCH_TITLE(timelineTitle) } : {}),
});

const createToasterPlainError = (message: string) => new ToasterError([message]);

const parseOrThrow = parseOrThrowErrorFactory(createToasterPlainError);

const decodeTimelineResponse = (
  respTimeline?: PersistTimelineResponse | TimelineErrorResponse
): PersistTimelineResponse => parseOrThrow(PersistTimelineResponse)(respTimeline);

const decodeSingleTimelineResponse = (respTimeline?: GetTimelineResponse): GetTimelineResponse =>
  parseOrThrow(GetTimelineResponse)(respTimeline);

const decodeResolvedSingleTimelineResponse = (
  respTimeline?: ResolveTimelineResponse
): ResolveTimelineResponse => parseOrThrow(ResolveTimelineResponse)(respTimeline);

const decodeGetTimelinesResponse = (respTimeline: GetTimelinesResponse): GetTimelinesResponse =>
  parseOrThrow(GetTimelinesResponse)(respTimeline);

const decodeTimelineErrorResponse = (respTimeline?: TimelineErrorResponse): TimelineErrorResponse =>
  parseOrThrow(TimelineErrorResponse)(respTimeline);

const decodePrepackedTimelineResponse = (
  respTimeline?: ImportTimelineResult
): ImportTimelineResult => parseOrThrow(ImportTimelineResult)(respTimeline);

const decodeResponseFavoriteTimeline = (
  respTimeline?: PersistFavoriteRouteResponse
): PersistFavoriteRouteResponse => parseOrThrow(PersistFavoriteRouteResponse)(respTimeline);

const postTimeline = async ({
  timeline,
}: RequestPostTimeline): Promise<CreateTimelinesResponse | TimelineErrorResponse> => {
  let requestBody;
  try {
    requestBody = JSON.stringify({ timeline });
  } catch (err) {
    return Promise.reject(new Error(`Failed to stringify query: ${JSON.stringify(err)}`));
  }

  const response = await KibanaServices.get().http.post<CreateTimelinesResponse>(TIMELINE_URL, {
    method: 'POST',
    body: requestBody,
    version: '2023-10-31',
  });

  return decodeTimelineResponse(response);
};

const patchTimeline = async ({
  timelineId,
  timeline,
  version,
  savedSearch,
}: RequestPatchTimeline): Promise<PatchTimelineResponse | TimelineErrorResponse> => {
  let response = null;
  let requestBody = null;
  try {
    requestBody = JSON.stringify({ timeline, timelineId, version });
  } catch (err) {
    return Promise.reject(new Error(`Failed to stringify query: ${JSON.stringify(err)}`));
  }

  try {
    if (timeline.savedSearchId && savedSearch) {
      const { savedSearch: savedSearchService } = KibanaServices.get();
      await savedSearchService.save(withDiscoverSessionTitle(savedSearch, timeline.title), {
        copyOnSave: false,
      });
    }
  } catch (e) {
    return Promise.reject(new Error(`Failed to copy saved search: ${timeline.savedSearchId}`));
  }

  try {
    response = await KibanaServices.get().http.patch<PatchTimelineResponse>(TIMELINE_URL, {
      method: 'PATCH',
      body: requestBody,
      version: '2023-10-31',
    });
  } catch (err) {
    // For Future developer
    // We are not rejecting our promise here because we had issue with our RXJS epic
    // the issue we were not able to pass the right object to it so we did manage the error in the success
    return Promise.resolve(decodeTimelineErrorResponse(err.body));
  }
  return decodeTimelineResponse(response);
};

/**
 * Creates a copy of the timeline with the given id. It will also apply changes to the original timeline
 * which are passed as `timeline` here.
 */
export const copyTimeline = async ({
  timelineId,
  timeline,
  savedSearch,
}: RequestPersistTimeline): Promise<CopyTimelineResponse | TimelineErrorResponse> => {
  let response = null;
  let requestBody = null;
  let newSavedSearchId = null;

  try {
    if (timeline.savedSearchId && savedSearch) {
      const { savedSearch: savedSearchService } = KibanaServices.get();
      const savedSearchCopy = withDiscoverSessionTitle(savedSearch, timeline.title);
      // delete the id and change the title to make sure we can copy the saved search
      delete savedSearchCopy.id;
      newSavedSearchId = await savedSearchService.save(savedSearchCopy, {
        copyOnSave: false,
      });
    }
  } catch (e) {
    return Promise.reject(new Error(`Failed to copy saved search: ${timeline.savedSearchId}`));
  }

  try {
    requestBody = JSON.stringify({
      timeline: { ...timeline, savedSearchId: newSavedSearchId || timeline.savedSearchId },
      timelineIdToCopy: timelineId,
    });
  } catch (err) {
    return Promise.reject(new Error(`Failed to stringify query: ${JSON.stringify(err)}`));
  }

  try {
    response = await KibanaServices.get().http.post<CopyTimelineResponse>(TIMELINE_COPY_URL, {
      method: 'POST',
      body: requestBody,
      version: '1',
    });
  } catch (err) {
    // For Future developer
    // We are not rejecting our promise here because we had issue with our RXJS epic
    // the issue we were not able to pass the right object to it so we did manage the error in the success
    return Promise.resolve(decodeTimelineErrorResponse(err.body));
  }
  return decodeTimelineResponse(response);
};

export const persistTimeline = async ({
  timelineId,
  timeline,
  version,
  savedSearch,
}: RequestPersistTimeline): Promise<PersistTimelineResponse | TimelineErrorResponse> => {
  try {
    if (isEmpty(timelineId) && timeline.status === TimelineStatusEnum.draft && timeline) {
      const temp: CleanDraftTimelinesResponse | TimelineErrorResponse = await cleanDraftTimeline({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        timelineType: timeline.timelineType!,
        templateTimelineId: timeline.templateTimelineId ?? undefined,
        templateTimelineVersion: timeline.templateTimelineVersion ?? undefined,
      });

      const draftTimeline = decodeTimelineResponse(temp);
      const templateTimelineInfo =
        timeline.timelineType === TimelineTypeEnum.template
          ? {
              templateTimelineId: draftTimeline.templateTimelineId ?? timeline.templateTimelineId,
              templateTimelineVersion:
                draftTimeline.templateTimelineVersion ?? timeline.templateTimelineVersion,
            }
          : {};

      return patchTimeline({
        timelineId: draftTimeline.savedObjectId,
        timeline: {
          ...timeline,
          ...templateTimelineInfo,
        },
        version: draftTimeline.version ?? '',
        savedSearch,
      });
    }

    if (isEmpty(timelineId)) {
      return postTimeline({ timeline });
    }

    return patchTimeline({
      timelineId: timelineId ?? '-1',
      timeline,
      version: version ?? '',
      savedSearch,
    });
  } catch (err) {
    if (err.status_code === 403 || err.body?.status_code === 403) {
      return Promise.resolve({
        statusCode: 403,
        message: err.message || err.body.message,
      });
    }
    return Promise.resolve(err);
  }
};

export const importTimelines = async ({
  fileToImport,
  signal,
}: ImportDataProps): Promise<ImportTimelineResult> => {
  const formData = new FormData();
  formData.append('file', fileToImport);

  return KibanaServices.get().http.fetch<ImportTimelinesResponse>(`${TIMELINE_IMPORT_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': undefined },
    body: formData,
    signal,
    version: '2023-10-31',
  });
};

export const exportSelectedTimeline = ({
  filename = `timelines_export.ndjson`,
  ids = [],
  signal,
}: ExportDocumentsProps): Promise<Blob | TimelineErrorResponse> => {
  let requestBody;
  try {
    requestBody = ids.length > 0 ? JSON.stringify({ ids }) : undefined;
  } catch (err) {
    return Promise.reject(new Error(`Failed to stringify query: ${JSON.stringify(err)}`));
  }
  return KibanaServices.get().http.fetch<Blob>(`${TIMELINE_EXPORT_URL}`, {
    method: 'POST',
    body: requestBody,
    query: {
      file_name: filename,
    },
    signal,
    version: '2023-10-31',
  });
};

export const getDraftTimeline = async ({
  timelineType,
}: {
  timelineType: TimelineType;
}): Promise<GetDraftTimelinesResponse> => {
  const response = await KibanaServices.get().http.get<GetDraftTimelinesResponse>(
    TIMELINE_DRAFT_URL,
    {
      query: {
        timelineType,
      },
      version: '2023-10-31',
    }
  );

  return decodeTimelineResponse(response);
};

export const cleanDraftTimeline = async ({
  timelineType,
  templateTimelineId,
  templateTimelineVersion,
}: {
  timelineType: TimelineType;
  templateTimelineId?: string;
  templateTimelineVersion?: number;
}): Promise<CleanDraftTimelinesResponse | TimelineErrorResponse> => {
  let requestBody;
  const templateTimelineInfo =
    timelineType === TimelineTypeEnum.template
      ? {
          templateTimelineId,
          templateTimelineVersion,
        }
      : {};
  try {
    requestBody = JSON.stringify({
      timelineType,
      ...templateTimelineInfo,
    });
  } catch (err) {
    return Promise.reject(new Error(`Failed to stringify query: ${JSON.stringify(err)}`));
  }
  const response = await KibanaServices.get().http.post<CleanDraftTimelinesResponse>(
    TIMELINE_DRAFT_URL,
    {
      body: requestBody,
      version: '2023-10-31',
    }
  );

  return decodeTimelineResponse(response);
};

export const installPrepackedTimelines = async (): Promise<ImportTimelineResult> => {
  const response = await KibanaServices.get().http.post<ImportTimelineResult>(
    TIMELINE_PREPACKAGED_URL,
    {
      version: '2023-10-31',
    }
  );

  return decodePrepackedTimelineResponse(response);
};

export const getTimeline = async (id: string) => {
  const response = await KibanaServices.get().http.get<GetTimelineResponse>(TIMELINE_URL, {
    query: {
      id,
    },
    version: '2023-10-31',
  });

  return decodeSingleTimelineResponse(response);
};

export const resolveTimeline = async (id: string) => {
  const response = await KibanaServices.get().http.get<ResolveTimelineResponse>(
    TIMELINE_RESOLVE_URL,
    {
      query: {
        id,
      },
      version: '2023-10-31',
    }
  );

  return decodeResolvedSingleTimelineResponse(response);
};

export const getTimelineTemplate = async (templateTimelineId: string) => {
  const response = await KibanaServices.get().http.get<GetTimelineResponse>(TIMELINE_URL, {
    query: {
      template_timeline_id: templateTimelineId,
    },
    version: '2023-10-31',
  });

  return decodeSingleTimelineResponse(response);
};

export const getAllTimelines = async (
  query: GetTimelinesRequestQuery,
  abortSignal: AbortSignal
) => {
  const response = await KibanaServices.get().http.fetch<GetTimelinesResponse>(TIMELINES_URL, {
    method: 'GET',
    query,
    signal: abortSignal,
    version: '2023-10-31',
  });

  return decodeGetTimelinesResponse(response);
};

export const persistFavorite = async ({
  timelineId,
  templateTimelineId,
  templateTimelineVersion,
  timelineType,
}: {
  timelineId?: string | null;
  templateTimelineId?: string | null;
  templateTimelineVersion?: number | null;
  timelineType: TimelineType;
}) => {
  let requestBody;

  try {
    requestBody = JSON.stringify({
      timelineId,
      templateTimelineId,
      templateTimelineVersion,
      timelineType,
    });
  } catch (err) {
    return Promise.reject(new Error(`Failed to stringify query: ${JSON.stringify(err)}`));
  }

  const response = await KibanaServices.get().http.patch<PersistFavoriteRouteResponse>(
    TIMELINE_FAVORITE_URL,
    {
      method: 'PATCH',
      body: requestBody,
      version: '2023-10-31',
    }
  );

  return decodeResponseFavoriteTimeline(response);
};

export const deleteTimelinesByIds = async (savedObjectIds: string[], searchIds?: string[]) => {
  let requestBody;

  try {
    if (searchIds) {
      requestBody = JSON.stringify({
        savedObjectIds,
        searchIds,
      });
    } else {
      requestBody = JSON.stringify({
        savedObjectIds,
      });
    }
  } catch (err) {
    return Promise.reject(new Error(`Failed to stringify query: ${JSON.stringify(err)}`));
  }
  const response = await KibanaServices.get().http.delete<boolean>(TIMELINE_URL, {
    method: 'DELETE',
    body: requestBody,
    version: '2023-10-31',
  });
  return response;
};
