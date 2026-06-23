/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { recurse } from 'cypress-recurse';
import type { Timeline, TimelineFilter } from '../objects/timeline';

import { ALL_CASES_CREATE_NEW_CASE_TABLE_BTN } from '../screens/all_cases';
import { FIELDS_BROWSER_CHECKBOX } from '../screens/fields_browser';
import {
  EQL_QUERY_VALIDATION_LABEL,
  EQL_QUERY_VALIDATION_SPINNER,
} from '../screens/create_new_rule';

import {
  ACTIVE_TIMELINE_BOTTOM_BAR,
  ADD_FILTER,
  ADD_NOTE_BUTTON,
  ATTACH_TIMELINE_TO_CASE_BUTTON,
  ATTACH_TIMELINE_TO_EXISTING_CASE_ICON,
  ATTACH_TIMELINE_TO_NEW_CASE_ICON,
  BOTTOM_BAR_CREATE_NEW_TIMELINE,
  BOTTOM_BAR_CREATE_NEW_TIMELINE_TEMPLATE,
  BOTTOM_BAR_TIMELINE_PLUS_ICON,
  CLOSE_TIMELINE_BTN,
  COMBO_BOX_INPUT,
  CREATE_NEW_TIMELINE,
  ESQL_TAB,
  FIELD_BROWSER,
  GET_TIMELINE_GRID_CELL,
  HOVER_ACTIONS,
  NEW_TIMELINE_ACTION,
  NOTES_TAB_BUTTON,
  NOTES_TEXT_AREA,
  OPEN_TIMELINE_ICON,
  PIN_EVENT,
  QUERY_EVENT_COUNT,
  RESET_FIELDS,
  SAVE_DATA_PROVIDER_BTN,
  SAVE_FILTER_BTN,
  SAVE_TIMELINE_ACTION,
  SAVE_TIMELINE_ACTION_BTN,
  SEARCH_OR_FILTER_CONTAINER,
  SELECT_CASE,
  STAR_ICON,
  TIMELINE_ADD_FIELD_BUTTON,
  TIMELINE_COLLAPSED_ITEMS_BTN,
  TIMELINE_CORRELATION_INPUT,
  TIMELINE_CORRELATION_TAB,
  TIMELINE_CREATE_TEMPLATE_FROM_TIMELINE_BTN,
  TIMELINE_CREATE_TIMELINE_FROM_TEMPLATE_BTN,
  TIMELINE_DATA_PROVIDER_FIELD,
  TIMELINE_DATA_PROVIDER_OPERATOR,
  TIMELINE_DATA_PROVIDER_VALUE,
  TIMELINE_DATA_PROVIDERS_CONTAINER,
  TIMELINE_DESCRIPTION_INPUT,
  TIMELINE_DISCOVER_FIELDS_BUTTON,
  TIMELINE_ENABLE_DISABLE_ALL_ROW_RENDERER,
  TIMELINE_FILTER_FIELD,
  TIMELINE_FILTER_OPERATOR,
  TIMELINE_FILTER_VALUE,
  TIMELINE_FLYOUT,
  TIMELINE_FULL_SCREEN_BUTTON,
  TIMELINE_INSPECT_BUTTON,
  TIMELINE_KQLLANGUAGE_BUTTON,
  TIMELINE_KQLMODE_FILTER,
  TIMELINE_KQLMODE_SEARCH,
  TIMELINE_LUCENELANGUAGE_BUTTON,
  TIMELINE_PANEL,
  TIMELINE_PROGRESS_BAR,
  TIMELINE_QUERY,
  TIMELINE_SAVE_MODAL,
  TIMELINE_SAVE_MODAL_SAVE_AS_NEW_SWITCH,
  TIMELINE_SAVE_MODAL_SAVE_BUTTON,
  TIMELINE_SEARCH_OR_FILTER,
  TIMELINE_SHOWQUERYBARMENU_BUTTON,
  TIMELINE_SWITCHQUERYLANGUAGE_BUTTON,
  TIMELINE_TAB_CONTENT_EQL,
  TIMELINE_TITLE,
  TIMELINE_TITLE_BY_ID,
  TIMELINE_TITLE_INPUT,
  TIMELINE_WRAPPER,
  TOGGLE_DATA_PROVIDER_BTN,
} from '../screens/timeline';

import {
  DUPLICATE_TIMELINE,
  REFRESH_BUTTON,
  TIMELINE,
  TIMELINES_TAB_TEMPLATE,
  TIMELINES_TABLE,
} from '../screens/timelines';
import { waitForTabToBeLoaded } from './common';

import { closeFieldsBrowser, filterFieldsBrowser } from './fields_browser';
import { TIMELINE_CONTEXT_MENU_BTN } from '../screens/alerts';
import { LOADING_INDICATOR } from '../screens/security_header';
import { COLLAPSED_ACTION_BTN, TOASTER } from '../screens/alerts_detection_rules';
import { RUNTIME_FIELD_INPUT, SAVE_FIELD_BUTTON } from '../screens/create_runtime_field';
import { getDataTestSubjectSelector } from '../helpers/common';

const hostExistsQuery = 'host.name: *';

const typeAndVerifyValue = (
  selector: string,
  value: string,
  options?: Partial<Cypress.TypeOptions>
) => {
  recurse(
    () => {
      cy.get(selector).focus();
      cy.get(selector).clear();
      cy.get(selector).type(value, options);
      return cy.get(selector).invoke('val');
    },
    (nextValue) => `${nextValue ?? ''}` === value,
    {
      limit: 5,
      delay: 100,
    }
  );
};

export const addNameToTimelineAndSave = (name: string) => {
  cy.get(SAVE_TIMELINE_ACTION_BTN).first().click();
  cy.get(TIMELINE_TITLE_INPUT).should('not.be.disabled').clear();
  typeAndVerifyValue(TIMELINE_TITLE_INPUT, name);
  cy.get(TIMELINE_TITLE_INPUT).type('{enter}');
  cy.get(TIMELINE_TITLE_INPUT).should('have.attr', 'value', name);
  cy.get(TIMELINE_SAVE_MODAL_SAVE_BUTTON).click();
  cy.get(TIMELINE_TITLE_INPUT).should('not.exist');
};

export const addNameToTimelineAndSaveAsNew = (name: string) => {
  cy.get(SAVE_TIMELINE_ACTION_BTN).first().click();
  cy.get(TIMELINE_TITLE_INPUT).should('not.be.disabled').clear();
  typeAndVerifyValue(TIMELINE_TITLE_INPUT, name);
  cy.get(TIMELINE_TITLE_INPUT).type('{enter}');
  cy.get(TIMELINE_TITLE_INPUT).should('have.attr', 'value', name);
  cy.get(TIMELINE_SAVE_MODAL_SAVE_AS_NEW_SWITCH).should('exist');
  cy.get(TIMELINE_SAVE_MODAL_SAVE_AS_NEW_SWITCH).click();
  cy.get(TIMELINE_SAVE_MODAL_SAVE_BUTTON).click();
  cy.get(TIMELINE_TITLE_INPUT).should('not.exist');
};

export const addNameAndDescriptionToTimeline = (
  timeline: Timeline,
  modalAlreadyOpen: boolean = false
) => {
  if (!modalAlreadyOpen) {
    cy.get(SAVE_TIMELINE_ACTION).click();
  }
  typeAndVerifyValue(TIMELINE_TITLE_INPUT, timeline.title);
  cy.get(TIMELINE_TITLE_INPUT).type('{enter}');
  cy.get(TIMELINE_TITLE_INPUT).should('have.attr', 'value', timeline.title);
  typeAndVerifyValue(TIMELINE_DESCRIPTION_INPUT, timeline.description);
  cy.get(TIMELINE_DESCRIPTION_INPUT).invoke('val').should('equal', timeline.description);
  cy.get(TIMELINE_SAVE_MODAL_SAVE_BUTTON).click();
  cy.get(TIMELINE_TITLE_INPUT).should('not.exist');
};

export const duplicateFirstTimeline = () => {
  cy.get(TIMELINES_TABLE).within(() => {
    cy.get(COLLAPSED_ACTION_BTN).first().click();
  });
  cy.get(DUPLICATE_TIMELINE).click();
  cy.get(TIMELINE_TITLE).should('be.visible');
};

export const goToNotesTab = () => {
  cy.get(NOTES_TAB_BUTTON).click();
  cy.get(NOTES_TEXT_AREA).should('be.visible');
};

export const goToEsqlTab = () => {
  waitForTabToBeLoaded(ESQL_TAB);
  cy.get(getDataTestSubjectSelector('kibanaCodeEditor')).should('be.visible');
};

export const goToCorrelationTab = () => {
  cy.get(TIMELINE_CORRELATION_TAB).click();
  cy.get(`${TIMELINE_TAB_CONTENT_EQL} ${TIMELINE_CORRELATION_INPUT}`).should('be.visible');

  return cy.get(TIMELINE_CORRELATION_TAB);
};

export const addNotesToTimeline = (notes: string) => {
  goToNotesTab();

  cy.get(NOTES_TAB_BUTTON)
    .find('.euiBadge__text')
    .invoke('text')
    .then(parseInt)
    .then((notesCount) => {
      typeAndVerifyValue(NOTES_TEXT_AREA, notes, {
        parseSpecialCharSequences: false,
      });

      cy.get(ADD_NOTE_BUTTON).click();
      cy.get(ADD_NOTE_BUTTON).should('have.attr', 'disabled');

      cy.get(`${NOTES_TAB_BUTTON} .euiBadge`).should('have.text', `${notesCount + 1}`);
    });
};

export const addEqlToTimeline = (eql: string) => {
  goToCorrelationTab().then(() => {
    cy.get(TIMELINE_CORRELATION_INPUT).type(eql);
    cy.get(EQL_QUERY_VALIDATION_SPINNER).should('not.exist');
  });
};

export const clearEqlInTimeline = () => {
  cy.get(TIMELINE_CORRELATION_INPUT).type('{selectAll} {del}');
  cy.get(TIMELINE_CORRELATION_INPUT).clear();
  cy.get(EQL_QUERY_VALIDATION_SPINNER).should('not.exist');
  cy.get(EQL_QUERY_VALIDATION_LABEL).should('not.exist');
};

export const addFilter = (filter: TimelineFilter): Cypress.Chainable<JQuery<HTMLElement>> => {
  cy.get(ADD_FILTER).click();
  cy.get(TIMELINE_FILTER_FIELD).type(`${filter.field}{downarrow}{enter}`);
  cy.get(TIMELINE_FILTER_OPERATOR).type(`${filter.operator}{downarrow}{enter}`);
  if (filter.operator !== 'exists') {
    cy.get(TIMELINE_FILTER_VALUE).type(`${filter.value}{enter}`);
  }
  return cy.get(SAVE_FILTER_BTN).click();
};

export const changeTimelineQueryLanguage = (language: 'kuery' | 'lucene') => {
  cy.get(TIMELINE_SHOWQUERYBARMENU_BUTTON).click();
  cy.get(TIMELINE_SWITCHQUERYLANGUAGE_BUTTON).click();
  if (language === 'lucene') {
    cy.get(TIMELINE_LUCENELANGUAGE_BUTTON).click();
  } else {
    cy.get(TIMELINE_KQLLANGUAGE_BUTTON).click();
  }
};

export const addDataProvider = (filter: TimelineFilter): Cypress.Chainable<JQuery<HTMLElement>> => {
  cy.get(TOGGLE_DATA_PROVIDER_BTN).click();
  cy.get(TIMELINE_DATA_PROVIDERS_CONTAINER).should('be.visible'); // Cypress doesn't properly wait for the data provider to finish expanding, so we wait for the animation to finish.
  cy.get(TIMELINE_ADD_FIELD_BUTTON).click();
  cy.get(TIMELINE_DATA_PROVIDER_FIELD)
    .find(COMBO_BOX_INPUT)
    .type(`${filter.field}{downarrow}{enter}`);

  cy.get(TIMELINE_DATA_PROVIDER_OPERATOR)
    .find(`${COMBO_BOX_INPUT} input`)
    .type(`{selectall}{backspace}{selectall}{backspace}`);

  cy.get(TIMELINE_DATA_PROVIDER_OPERATOR)
    .find(COMBO_BOX_INPUT)
    .type(`${filter.operator}{downarrow}{enter}`);

  if (filter.operator !== 'exists') {
    cy.get(TIMELINE_DATA_PROVIDER_VALUE).type(`${filter.value}{enter}`);
  }
  return cy.get(SAVE_DATA_PROVIDER_BTN).click();
};

export const updateDataProviderByFieldHoverAction = (fieldName: string, rowNumber: number) => {
  const fieldSelector = GET_TIMELINE_GRID_CELL(fieldName);
  cy.get(fieldSelector).eq(rowNumber).should('be.visible').realHover();
  cy.get(HOVER_ACTIONS.ADD_TO_TIMELINE).should('be.visible');

  recurse(
    () => {
      cy.get(HOVER_ACTIONS.ADD_TO_TIMELINE).click();
      return cy.root();
    },
    ($el) => $el.find(TOASTER).text().startsWith('Added ')
  );
};

export const addNewCase = () => {
  cy.get(ALL_CASES_CREATE_NEW_CASE_TABLE_BTN).click();
};

export const attachTimelineToNewCase = () => {
  cy.get(ATTACH_TIMELINE_TO_CASE_BUTTON).click();
  cy.get(ATTACH_TIMELINE_TO_NEW_CASE_ICON).click();
};

export const attachTimelineToExistingCase = () => {
  cy.get(ATTACH_TIMELINE_TO_CASE_BUTTON).click();
  cy.get(ATTACH_TIMELINE_TO_EXISTING_CASE_ICON).click();
};

export const closeTimeline = () => {
  // Retry closing the timeline until the overlay mask gets the --hidden class.
  // Each iteration first checks whether the overlay is already hidden to avoid
  // clicking a button that is no longer in the visible portal. When the overlay is
  // still open, .should('be.visible') retries until the close button is actionable,
  // letting any concurrent React re-renders (e.g. from markAsFavorite's Redux
  // dispatches) settle before the click is issued.
  recurse(
    () => {
      return cy.get(TIMELINE_WRAPPER).then(($wrapper) => {
        if (!$wrapper.hasClass('timeline-portal-overlay-mask--hidden')) {
          cy.get(CLOSE_TIMELINE_BTN).should('be.visible').click();
        }
        return cy.get(TIMELINE_WRAPPER);
      });
    },
    ($timelineWrapper) => $timelineWrapper.hasClass('timeline-portal-overlay-mask--hidden')
  );
};

export const createNewTimeline = () => {
  openCreateTimelineOptionsPopover();
  cy.get(CREATE_NEW_TIMELINE).click();
};

export const openCreateTimelineOptionsPopover = () => {
  recurse(
    () => {
      cy.get(NEW_TIMELINE_ACTION).filter(':visible').click();
      return cy.get(CREATE_NEW_TIMELINE);
    },
    (sub) => sub.is(':visible')
  );
};

export const createTimelineFromBottomBar = () => {
  recurse(
    () => {
      cy.get(BOTTOM_BAR_TIMELINE_PLUS_ICON).filter(':visible').click();
      return cy.get(BOTTOM_BAR_CREATE_NEW_TIMELINE);
    },
    (sub) => sub.is(':visible')
  );

  cy.get(BOTTOM_BAR_CREATE_NEW_TIMELINE).click();
};

export const createTimelineTemplateFromBottomBar = () => {
  recurse(
    () => {
      cy.get(BOTTOM_BAR_TIMELINE_PLUS_ICON).filter(':visible').click();
      return cy.get(BOTTOM_BAR_CREATE_NEW_TIMELINE_TEMPLATE).eq(0);
    },
    (sub) => sub.is(':visible')
  );

  cy.get(BOTTOM_BAR_CREATE_NEW_TIMELINE_TEMPLATE).eq(0).click();
};

export const executeTimelineKQL = (query: string) => {
  cy.get(`${SEARCH_OR_FILTER_CONTAINER} textarea`).clear();
  cy.get(`${SEARCH_OR_FILTER_CONTAINER} textarea`).type(`${query} {enter}`);
};

export const executeTimelineSearch = (query: string) => {
  typeAndVerifyValue(TIMELINE_QUERY, query);
  cy.get(TIMELINE_QUERY).type(' {enter}');
};

/**
 * Saves the timeline. Make sure that the timeline has a title set
 * before you're using this task. Otherwise it will fail to save.
 */
export const saveTimeline = () => {
  cy.get(SAVE_TIMELINE_ACTION_BTN).first().click();

  cy.get(TIMELINE_SAVE_MODAL).within(() => {
    cy.get(TIMELINE_PROGRESS_BAR).should('not.exist');
    cy.get(TIMELINE_TITLE_INPUT).should('not.be.disabled');

    cy.get(TIMELINE_SAVE_MODAL_SAVE_BUTTON).should('not.be.disabled');
    cy.get(TIMELINE_SAVE_MODAL_SAVE_BUTTON).click();

    cy.get(TIMELINE_PROGRESS_BAR).should('exist');
    cy.get(TIMELINE_PROGRESS_BAR).should('not.exist');

    cy.get(LOADING_INDICATOR).should('not.exist');
  });
};

export const markAsFavorite = () => {
  cy.intercept('PATCH', 'api/timeline/_favorite').as('markedAsFavourite');
  cy.intercept('GET', '/api/timelines*').as('timelinesRefreshed');
  cy.get(TIMELINE_PANEL).within(() => cy.get(STAR_ICON).click());
  cy.wait('@markedAsFavourite');
  cy.wait('@timelinesRefreshed');
};

export const openTimelineDiscoverAddField = () => {
  cy.get(TIMELINE_DISCOVER_FIELDS_BUTTON).first().click();
};

export const createRuntimeFieldFromTimelne = (
  fieldName: string
): Cypress.Chainable<JQuery<HTMLElement>> => {
  openTimelineDiscoverAddField();
  cy.get(RUNTIME_FIELD_INPUT).type(fieldName);
  return cy.get(SAVE_FIELD_BUTTON).click();
};

export const openTimelineInspectButton = () => {
  cy.get(TIMELINE_INSPECT_BUTTON).should('not.be.disabled');
  cy.get(TIMELINE_INSPECT_BUTTON).click();
};

export const openTimelineFromSettings = () => {
  cy.get(OPEN_TIMELINE_ICON).click();
};

export const openTimelineTemplate = (id: string) => {
  cy.get(TIMELINE_TITLE_BY_ID(id)).click();
};

export const openTimelineTemplatesTab = () => {
  cy.get(TIMELINES_TAB_TEMPLATE).click();
};

export const openTimelineById = (timelineId: string): Cypress.Chainable<JQuery<HTMLElement>> => {
  if (timelineId == null) {
    // Log out if for some reason this happens to be null just in case for our tests we experience
    // value of null. Some tests return an "any" which is why this could happen.
    cy.log('"timelineId" is null or undefined');
  }
  // We avoid use cypress.pipe() here and multiple clicks because each of these clicks
  // can result in a new URL async operation occurring and then we get indeterminism as the URL loads multiple times.
  return cy.get(TIMELINE_TITLE_BY_ID(timelineId)).click();
};

export const openActiveTimeline = () => {
  cy.get(ACTIVE_TIMELINE_BOTTOM_BAR).click();
};

export const pinFirstEvent = (): Cypress.Chainable<JQuery<HTMLElement>> => {
  return cy.get(PIN_EVENT).first().click();
};

export const populateTimeline = () => {
  executeTimelineKQL(hostExistsQuery);
  cy.get(QUERY_EVENT_COUNT).should('not.have.text', '0');
};

export const removeColumn = (columnName: string) => {
  cy.get(FIELD_BROWSER).first().click();
  filterFieldsBrowser(columnName);
  cy.get(FIELDS_BROWSER_CHECKBOX(columnName)).click();
  closeFieldsBrowser();
};

export const resetFields = () => {
  cy.get(RESET_FIELDS).click();
};

export const selectCase = (caseId: string) => {
  cy.get(SELECT_CASE(caseId)).click();
};

/**
 * We keep clicking on the refresh button until we have the timeline we are looking
 * for. NOTE: That because refresh happens so fast, the click handler in most cases
 * is not on it reliably. You should not use a pipe off of this to get your timeline
 * clicked as a pipe off the timeline link can product multiple URL loads which will
 * add a different type of flake to your tests. You will usually have to use wait() for
 * this like so:
 *
 * refreshTimelinesUntilTimeLinePresent(timelineId)
 *   // This wait is here because we cannot do a pipe on a timeline as that will introduce multiple URL
 *   // request responses and indeterminism.
 *   .then(() => cy.wait(1000))
 *   .then(() => ... your code here ...)
 * @param id The timeline id to click the refresh button until we find it.
 */
export const refreshTimelinesUntilTimeLinePresent = (
  id: string
): Cypress.Chainable<JQuery<HTMLHtmlElement>> => {
  cy.get(REFRESH_BUTTON).click();
  cy.get(TIMELINE(id)).should('be.visible');
  return cy.get(TIMELINE(id));
};

export const clickingOnCreateTimelineFormTemplateBtn = () => {
  cy.get(TIMELINE_CREATE_TIMELINE_FROM_TEMPLATE_BTN).click();
};

export const clickingOnCreateTemplateFromTimelineBtn = () => {
  cy.get(TIMELINE_CREATE_TEMPLATE_FROM_TIMELINE_BTN).click();
};

export const expandEventAction = () => {
  cy.waitUntil(() => {
    cy.get(TIMELINE_COLLAPSED_ITEMS_BTN).should('exist');
    cy.get(TIMELINE_COLLAPSED_ITEMS_BTN).should('be.visible');
    return cy.get(TIMELINE_COLLAPSED_ITEMS_BTN).then(($el) => $el.length >= 1);
  });
  cy.get(TIMELINE_COLLAPSED_ITEMS_BTN).first().click();
};

const showDataProviderQueryBuilder = () => {
  cy.get(TOGGLE_DATA_PROVIDER_BTN).should('have.attr', 'aria-pressed', 'false');
  cy.get(TOGGLE_DATA_PROVIDER_BTN).click();
  cy.get(TOGGLE_DATA_PROVIDER_BTN).should('have.attr', 'aria-pressed', 'true');
};

export const selectKqlFilterMode = () => {
  showDataProviderQueryBuilder();
  cy.get(TIMELINE_SEARCH_OR_FILTER).click();
  cy.get(TIMELINE_KQLMODE_FILTER).click();
};

export const selectKqlSearchMode = () => {
  showDataProviderQueryBuilder();
  cy.get(TIMELINE_SEARCH_OR_FILTER).click();
  cy.get(TIMELINE_KQLMODE_SEARCH).click();
};

export const openTimelineEventContextMenu = (rowIndex: number = 0) => {
  cy.get(TIMELINE_FLYOUT).within(() => {
    const togglePopover = () => {
      cy.get(TIMELINE_CONTEXT_MENU_BTN).eq(rowIndex).should('be.visible');
      cy.get(TIMELINE_CONTEXT_MENU_BTN).eq(rowIndex).click();
      cy.get(TIMELINE_CONTEXT_MENU_BTN)
        .first()
        .should('be.visible')
        .then(($btnEl) => {
          if ($btnEl.attr('data-popover-open') !== 'true') {
            cy.log(`${TIMELINE_CONTEXT_MENU_BTN} was flaky, attempting to re-open popover`);
            togglePopover();
          }
        });
    };

    togglePopover();
  });
};

export const toggleFullScreen = () => {
  cy.get(TIMELINE_FULL_SCREEN_BUTTON).first().click();
};

export const enableAllRowRenderersWithSwitch = () => {
  cy.get(TIMELINE_ENABLE_DISABLE_ALL_ROW_RENDERER).click();
  cy.get(TIMELINE_ENABLE_DISABLE_ALL_ROW_RENDERER).should('have.attr', 'aria-checked', 'true');
};
