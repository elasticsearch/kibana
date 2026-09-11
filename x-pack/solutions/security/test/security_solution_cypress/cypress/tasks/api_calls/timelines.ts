/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  GetTimelinesResponse,
  PatchTimelineResponse,
} from '@kbn/security-solution-plugin/common/api/timeline';
import type { CompleteTimeline } from '../../objects/timeline';
import { getTimeline } from '../../objects/timeline';
import { rootRequest } from './common';

const mockTimeline = getTimeline();

/** Saved object type of a Discover session (saved search). */
const SAVED_SEARCH_TYPE = 'search';

/**
 * Prefix of the titles the ES|QL timeline tab gives to its Discover sessions, see
 * `GET_TIMELINE_DISCOVER_SAVED_SEARCH_TITLE` in the security solution plugin.
 */
const TIMELINE_DISCOVER_SESSION_TITLE_PREFIX = 'Saved Discover session for Timeline';

/**
 * Id of the tag the ES|QL timeline tab applies to its Discover sessions, see `updateSavedSearch`
 * in the security solution plugin. Surfaced as `Security_Solution` in Saved Objects management.
 */
export const SECURITY_SOLUTION_TAG_ID = 'security-solution-default';

/** Partial shape of `GET api/saved_objects/_find`, everything is optional to stay tolerant of error bodies. */
interface FindSavedObjectsResponse {
  saved_objects?: Array<{
    id: string;
    attributes?: { title?: string };
    references?: Array<{ type: string; id: string; name?: string }>;
  }>;
}

type TimelineDiscoverSession = NonNullable<FindSavedObjectsResponse['saved_objects']>[number];

const SAVED_OBJECTS_PAGE_SIZE = 100;

/**
 * Walks every page of `search` saved objects and keeps the ones the ES|QL timeline tab created.
 *
 * A single capped page is not enough: on a stack other specs have already written to, a
 * just-saved session can fall past the cap, which both hides it from cleanup and flakes the
 * assertions. `_find`'s `search` is not used to narrow this, because it matches analyzed tokens
 * rather than the literal title prefix, so a miss would silently look like "no sessions".
 */
const findTimelineDiscoverSessions = (
  page = 1,
  found: TimelineDiscoverSession[] = []
): Cypress.Chainable<TimelineDiscoverSession[]> =>
  rootRequest<FindSavedObjectsResponse>({
    // No `fields` filter: the tag assertion needs the saved object's references too.
    method: 'GET',
    url: `api/saved_objects/_find?type=${SAVED_SEARCH_TYPE}&per_page=${SAVED_OBJECTS_PAGE_SIZE}&page=${page}`,
    failOnStatusCode: false,
  }).then(({ body }) => {
    const savedObjects = body?.saved_objects ?? [];
    const sessions = found.concat(
      savedObjects.filter(({ attributes }) =>
        attributes?.title?.startsWith(TIMELINE_DISCOVER_SESSION_TITLE_PREFIX)
      )
    );

    return savedObjects.length < SAVED_OBJECTS_PAGE_SIZE
      ? cy.wrap(sessions)
      : findTimelineDiscoverSessions(page + 1, sessions);
  });

/**
 * Returns every Discover session belonging to a timeline.
 *
 * Asserting against these directly keeps the Discover-session persistence tests independent of
 * Saved Objects management, whose tag filter is a third-party surface this suite does not own —
 * a duplicate tag option in that dropdown is what got the whole suite skipped in #236526.
 */
export const getTimelineDiscoverSessions = () => findTimelineDiscoverSessions();

/** Title the ES|QL timeline tab gives the Discover session of the timeline named `timelineName`. */
export const getTimelineDiscoverSessionTitle = (timelineName: string) =>
  `${TIMELINE_DISCOVER_SESSION_TITLE_PREFIX} - ${timelineName}`;

/**
 * Creates a timeline saved object
 * @param {CompleteTimeline} [timeline] - configuration needed for creating a timeline. Defaults to getTimeline in security_solution_cypress/cypress/objects/timeline.ts
 * @returns undefined
 */
export const createTimeline = (timeline: CompleteTimeline = mockTimeline) =>
  rootRequest<PatchTimelineResponse>({
    method: 'POST',
    url: 'api/timeline',
    body: {
      timeline: {
        columns: [
          {
            id: '@timestamp',
          },
          {
            id: 'user.name',
          },
          {
            id: 'event.category',
          },
          {
            id: 'event.action',
          },
          {
            id: 'host.name',
          },
          {
            id: 'message',
          },
        ],
        kqlMode: 'filter',
        kqlQuery: {
          filterQuery: {
            kuery: {
              expression: timeline.query,
              kind: 'kuery',
            },
          },
        },
        dateRange: {
          end: '2023-04-01T12:22:56.000Z',
          start: '2018-01-01T12:22:56.000Z',
        },
        description: timeline.description,
        title: timeline.title,
        savedQueryId: null,
        ...(timeline.dataViewId != null && timeline.indexNames != null
          ? { dataViewId: timeline.dataViewId, indexNames: timeline.indexNames }
          : {}),
      },
    },
  });

/**
 * Creates a timeline template saved object
 * @param {CompleteTimeline} [timeline] - configuration needed for creating a timeline template. Defaults to `getTimeline` in security_solution_cypress/cypress/objects/timeline.ts
 * @returns undefined
 */
export const createTimelineTemplate = (timeline: CompleteTimeline = mockTimeline) =>
  rootRequest<PatchTimelineResponse>({
    method: 'POST',
    url: 'api/timeline',
    body: {
      timeline: {
        columns: [
          {
            id: '@timestamp',
          },
          {
            id: 'user.name',
          },
          {
            id: 'event.category',
          },
          {
            id: 'event.action',
          },
          {
            id: 'host.name',
          },
        ],
        kqlMode: 'filter',
        kqlQuery: {
          filterQuery: {
            kuery: {
              expression: timeline.query,
              kind: 'kuery',
            },
          },
        },
        dateRange: {
          end: '1577881376000',
          start: '1514809376000',
        },
        description: timeline.description,
        title: timeline.title,
        templateTimelineVersion: 1,
        timelineType: 'template',
        savedQueryId: null,
      },
    },
    headers: {
      'kbn-xsrf': 'cypress-creds',
      'x-elastic-internal-origin': 'security-solution',
      'elastic-api-version': '2023-10-31',
    },
  });

export const loadPrepackagedTimelineTemplates = () =>
  rootRequest({
    method: 'POST',
    url: 'api/timeline/_prepackaged',
    headers: {
      'kbn-xsrf': 'cypress-creds',
      'x-elastic-internal-origin': 'security-solution',

      'elastic-api-version': '2023-10-31',
    },
  });

export const favoriteTimeline = ({
  timelineId,
  timelineType,
  templateTimelineId,
  templateTimelineVersion,
}: {
  timelineId: string;
  timelineType: string;
  templateTimelineId?: string;
  templateTimelineVersion?: number;
}) =>
  rootRequest({
    method: 'PATCH',
    url: 'api/timeline/_favorite',
    body: {
      timelineId,
      timelineType,
      templateTimelineId: templateTimelineId || null,
      templateTimelineVersion: templateTimelineVersion || null,
    },
  });

export const getAllTimelines = () =>
  rootRequest<GetTimelinesResponse>({
    method: 'GET',
    url: 'api/timelines?page_size=100&page_index=1&sort_field=updated&sort_order=desc&timeline_type=default',
  });

const getAllCustomTimelineTemplates = () =>
  rootRequest<GetTimelinesResponse>({
    method: 'GET',
    url: 'api/timelines?page_size=100&page_index=1&sort_field=updated&sort_order=desc&timeline_type=template&status=active',
  });

export const deleteTimelines = () => {
  getAllTimelines().then(($timelines) => {
    const savedObjectIds = $timelines.body.timeline.map((timeline) => timeline.savedObjectId);
    rootRequest({
      method: 'DELETE',
      url: 'api/timeline',
      body: {
        savedObjectIds,
      },
    });
  });
};

/**
 * Deletes the Discover sessions the ES|QL timeline tab creates. They are plain `search`
 * saved objects which are not removed together with their timeline, so without this they
 * pile up across specs and retries and pollute the Saved Objects management table.
 */
export const deleteTimelineDiscoverSessions = () => {
  findTimelineDiscoverSessions().then((sessions) => {
    sessions.forEach(({ id }) => {
      rootRequest({
        method: 'DELETE',
        url: `api/saved_objects/${SAVED_SEARCH_TYPE}/${id}`,
        failOnStatusCode: false,
      });
    });
  });
};

export const deleteTimelineTemplates = () => {
  getAllCustomTimelineTemplates().then(($timelines) => {
    const savedObjectIds = $timelines.body.timeline
      .map((timeline) => timeline.savedObjectId)
      .filter((id): id is string => id != null);
    if (savedObjectIds.length > 0) {
      rootRequest({
        method: 'DELETE',
        url: 'api/timeline',
        body: {
          savedObjectIds,
        },
      });
    }
  });
};
