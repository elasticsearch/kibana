/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { visitWithTimeRange } from '../../../../tasks/navigation';
import {
  addDiscoverEsqlQuery,
  addFieldToTable,
  assertFieldsAreLoaded,
  verifyDiscoverEsqlQuery,
} from '../../../../tasks/discover';
import { ALERTS_URL } from '../../../../urls/navigation';
import {
  DISCOVER_CONTAINER,
  GET_DISCOVER_DATA_GRID_CELL_HEADER,
  TIMELINE_DISCOVER_TAB,
} from '../../../../screens/discover';
import {
  expectDateRangeToBe,
  updateDateRangeInLocalDatePickers,
} from '../../../../tasks/date_picker';
import { login } from '../../../../tasks/login';
import {
  addNameToTimelineAndSave,
  createNewTimeline,
  createTimelineFromBottomBar,
  goToEsqlTab,
  openTimelineById,
  openTimelineFromSettings,
} from '../../../../tasks/timeline';
import { LOADING_INDICATOR } from '../../../../screens/security_header';
import {
  SECURITY_SOLUTION_TAG_ID,
  deleteTimelineDiscoverSessions,
  deleteTimelines,
  getTimelineDiscoverSessionTitle,
  getTimelineDiscoverSessions,
} from '../../../../tasks/api_calls/timelines';

const INITIAL_START_DATE = 'Jan 18, 2021 @ 20:33:29.186';
const INITIAL_END_DATE = 'Jan 19, 2024 @ 20:33:29.186';
const TIMELINE_REQ_WITH_SAVED_SEARCH = 'TIMELINE_REQ_WITH_SAVED_SEARCH';
const TIMELINE_PATCH_REQ = 'TIMELINE_PATCH_REQ';
const ESQL_QUERY_REQ = 'ESQL_QUERY_REQ';

/**
 * The CI config only raises `defaultCommandTimeout`, `requestTimeout` stays at Cypress'
 * 5s default which is not enough for the ES|QL search of a freshly restored timeline.
 */
const ESQL_QUERY_REQ_TIMEOUT = 120000;

const TIMELINE_RESPONSE_SAVED_OBJECT_ID_PATH = 'response.body.savedObjectId';
const esqlQuery = 'from auditbeat-* | where ecs.version == "8.0.0"';

const handleIntercepts = () => {
  cy.intercept('PATCH', '/api/timeline', (req) => {
    if (Object.hasOwn(req.body, 'timeline') && req.body.timeline.savedSearchId === null) {
      req.alias = TIMELINE_PATCH_REQ;
    }
  });
  cy.intercept('PATCH', '/api/timeline', (req) => {
    if (Object.hasOwn(req.body, 'timeline') && req.body.timeline.savedSearchId !== null) {
      req.alias = TIMELINE_REQ_WITH_SAVED_SEARCH;
    }
  });
};

describe(
  'Discover Timeline State Integration',
  {
    tags: ['@ess', '@skipInServerless'],
  },
  () => {
    beforeEach(() => {
      // Timelines and their Discover sessions are not cleaned up by the framework, so
      // without this they accumulate across tests and retries within the same stack.
      deleteTimelines();
      deleteTimelineDiscoverSessions();
      login();
      visitWithTimeRange(ALERTS_URL);
      createTimelineFromBottomBar();
      goToEsqlTab();
      addDiscoverEsqlQuery(esqlQuery);
      updateDateRangeInLocalDatePickers(DISCOVER_CONTAINER, INITIAL_START_DATE, INITIAL_END_DATE);
      handleIntercepts();
    });

    /**
     * Which state the ES|QL tab is handed on mount — the restored session's for a saved timeline,
     * the default for a new one — is asserted against a real Discover state container in
     * `apply_timeline_state_to_discover.test.ts`. What is left here is the end-to-end proof that
     * the restored state reaches Elasticsearch and comes back as rows, which no unit test can
     * stand in for.
     */
    describe('ESQL tab state', () => {
      it('should save/restore esql tab dataview/timerange/filter/query/columns when saving/restoring timeline', () => {
        const timelineSuffix = Date.now();
        const timelineName = `DataView timeline-${timelineSuffix}`;
        const column1 = 'event.category';
        const column2 = 'ecs.version';
        assertFieldsAreLoaded();
        addFieldToTable(column1, TIMELINE_DISCOVER_TAB);
        addFieldToTable(column2, TIMELINE_DISCOVER_TAB);

        // create a custom timeline
        addNameToTimelineAndSave(timelineName);
        cy.wait(`@${TIMELINE_PATCH_REQ}`)
          .its(TIMELINE_RESPONSE_SAVED_OBJECT_ID_PATH)
          .then((timelineId) => {
            cy.wait(`@${TIMELINE_REQ_WITH_SAVED_SEARCH}`);
            // create an empty timeline
            createNewTimeline();
            // switch to old timeline
            openTimelineFromSettings();
            openTimelineById(timelineId);
            cy.intercept('POST', '**/internal/search/esql_async').as(ESQL_QUERY_REQ);
            goToEsqlTab();
            cy.get(LOADING_INDICATOR).should('not.exist');
            cy.wait(`@${ESQL_QUERY_REQ}`, { timeout: ESQL_QUERY_REQ_TIMEOUT });
            verifyDiscoverEsqlQuery(esqlQuery);
            // Assert the time range before the columns: the columns only render once the query
            // returns documents, so a range that was not restored fails here rather than as a
            // misleading "column header never appeared".
            expectDateRangeToBe(DISCOVER_CONTAINER, {
              start: INITIAL_START_DATE,
              end: INITIAL_END_DATE,
            });
            cy.get(GET_DISCOVER_DATA_GRID_CELL_HEADER(column1)).should('exist');
            cy.get(GET_DISCOVER_DATA_GRID_CELL_HEADER(column2)).should('exist');
          });
      });

      it('should save/restore esql tab dataview/timerange/filter/query/columns when timeline is opened via url', () => {
        const timelineSuffix = Date.now();
        const timelineName = `DataView timeline-${timelineSuffix}`;
        const column1 = 'event.category';
        const column2 = 'ecs.version';
        addDiscoverEsqlQuery(esqlQuery);
        assertFieldsAreLoaded();
        addFieldToTable(column1, TIMELINE_DISCOVER_TAB);
        addFieldToTable(column2, TIMELINE_DISCOVER_TAB);

        // create a custom timeline
        addNameToTimelineAndSave(timelineName);
        cy.wait(`@${TIMELINE_PATCH_REQ}`)
          .its(TIMELINE_RESPONSE_SAVED_OBJECT_ID_PATH)
          .then(() => {
            cy.wait(`@${TIMELINE_REQ_WITH_SAVED_SEARCH}`);
            expectDateRangeToBe(DISCOVER_CONTAINER, {
              start: INITIAL_START_DATE,
              end: INITIAL_END_DATE,
            });
            // reload the page with the exact url
            cy.reload();
            verifyDiscoverEsqlQuery(esqlQuery);
            expectDateRangeToBe(DISCOVER_CONTAINER, {
              start: INITIAL_START_DATE,
              end: INITIAL_END_DATE,
            });
            cy.get(GET_DISCOVER_DATA_GRID_CELL_HEADER(column1)).should('exist');
            cy.get(GET_DISCOVER_DATA_GRID_CELL_HEADER(column2)).should('exist');
          });
      });
    });

    /**
     * The browser drives the save, the assertions read the saved object back over the API. What
     * these tests are about is what got persisted, and routing that through Saved Objects
     * management only added a third-party UI this suite does not own to the failure surface.
     */
    describe('Discover saved search state for ESQL tab', () => {
      it('should save the esql tab Discover session tagged as Security Solution', () => {
        const timelineName = `SavedObject timeline-${Date.now()}`;
        addDiscoverEsqlQuery(esqlQuery);
        addNameToTimelineAndSave(timelineName);
        cy.wait(`@${TIMELINE_REQ_WITH_SAVED_SEARCH}`);

        getTimelineDiscoverSessions().then((sessions) => {
          const expectedTitle = getTimelineDiscoverSessionTitle(timelineName);
          const session = sessions.find(({ attributes }) => attributes?.title === expectedTitle);
          expect(session?.attributes?.title).to.eq(expectedTitle);

          const tagIds = (session?.references ?? [])
            .filter(({ type }) => type === 'tag')
            .map(({ id }) => id);
          expect(tagIds).to.include(SECURITY_SOLUTION_TAG_ID);
        });
      });

      it('should rename the Discover session on timeline rename', () => {
        const initialTimelineName = `Timeline-${Date.now()}`;
        addDiscoverEsqlQuery(esqlQuery);
        addNameToTimelineAndSave(initialTimelineName);
        cy.wait(`@${TIMELINE_REQ_WITH_SAVED_SEARCH}`);
        cy.get(LOADING_INDICATOR).should('not.exist');

        const renamedTimelineName = `Rename timeline-${Date.now()}`;
        addNameToTimelineAndSave(renamedTimelineName);
        cy.wait(`@${TIMELINE_REQ_WITH_SAVED_SEARCH}`);

        getTimelineDiscoverSessions().then((sessions) => {
          const titles = sessions.map(({ attributes }) => attributes?.title);
          expect(titles).to.include(getTimelineDiscoverSessionTitle(renamedTimelineName));
          expect(titles).to.not.include(getTimelineDiscoverSessionTitle(initialTimelineName));
        });
      });
    });
  }
);
