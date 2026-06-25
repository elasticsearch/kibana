/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DATE_PICKER_ABSOLUTE_TAB,
  DATE_PICKER_ABSOLUTE_INPUT,
  GET_DATE_PICKER_APPLY_BUTTON,
  DATE_PICKER_APPLY_BUTTON_TIMELINE,
  GET_DATE_PICKER_END_DATE_POPOVER_BUTTON,
  GET_LOCAL_DATE_PICKER_START_DATE_POPOVER_BUTTON,
  DATE_PICKER_NOW_TAB,
  DATE_PICKER_NOW_BUTTON,
  GET_LOCAL_DATE_PICKER_APPLY_BUTTON,
  GET_LOCAL_DATE_PICKER_END_DATE_POPOVER_BUTTON,
  GET_LOCAL_SHOW_DATES_BUTTON,
  GET_DATE_RANGE_PICKER_CONTROL_BUTTON,
  DATE_RANGE_PICKER_INPUT,
  GLOBAL_FILTERS_CONTAINER,
} from '../screens/date_picker';

const NEW_PICKER_CONTROL = '[data-test-subj="dateRangePickerControlButton"]';

// Convert legacy popover format ("MMM D, YYYY @ HH:mm:ss.SSS") to ISO 8601, which
// the new picker's input accepts. Falls through "now" / "now-15m" / ISO unchanged.
const toIsoIfDate = (value: string) => {
  if (/^now(\b|[-+])/.test(value)) return value;
  const parsed = new Date(value.replace(' @ ', ' '));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

// Read `data-date-range` ("start to end") from the control button before any
// click, since clicking swaps the button for the input element.
const retypeRangeOnNewPicker = (
  container: string,
  pickFromCurrent: (current: { start: string; end: string }) => { start: string; end: string }
) => {
  cy.get(`${container} ${NEW_PICKER_CONTROL}`).then(($btn) => {
    const [currentStart = '', currentEnd = ''] = ($btn.attr('data-date-range') ?? '')
      .split(' to ')
      .map((s) => s.trim());
    const next = pickFromCurrent({ start: currentStart, end: currentEnd });
    cy.wrap($btn).click();
    cy.get(DATE_RANGE_PICKER_INPUT).clear();
    cy.get(DATE_RANGE_PICKER_INPUT).type(`${next.start} to ${next.end}{enter}`);
  });
};

const usingNewPicker = (
  container: string,
  newPickerBranch: () => void,
  legacyBranch: () => void
) => {
  cy.get(container).then(($container) => {
    if ($container.find(NEW_PICKER_CONTROL).length) {
      newPickerBranch();
    } else {
      legacyBranch();
    }
  });
};

export const setEndDateNow = (container: string = GLOBAL_FILTERS_CONTAINER) => {
  usingNewPicker(
    container,
    () => retypeRangeOnNewPicker(container, ({ start }) => ({ start, end: 'now' })),
    () => {
      cy.get(GET_DATE_PICKER_END_DATE_POPOVER_BUTTON(container)).click();
      cy.get(DATE_PICKER_NOW_TAB).first().click();
      cy.get(DATE_PICKER_NOW_BUTTON).click();
    }
  );
};

export const setEndDate = (date: string, container: string = GLOBAL_FILTERS_CONTAINER) => {
  usingNewPicker(
    container,
    () => retypeRangeOnNewPicker(container, ({ start }) => ({ start, end: toIsoIfDate(date) })),
    () => {
      cy.get(GET_LOCAL_DATE_PICKER_END_DATE_POPOVER_BUTTON(container)).first().click();

      cy.get(DATE_PICKER_ABSOLUTE_TAB).first().click();

      cy.get(DATE_PICKER_ABSOLUTE_INPUT).click();
      cy.get(DATE_PICKER_ABSOLUTE_INPUT).then(($el) => {
        if (Cypress.dom.isAttached($el)) {
          cy.wrap($el).click();
        }
        cy.wrap($el).type(`{selectall}{backspace}${date}{enter}`);
      });
    }
  );
};

export const setStartDate = (date: string, container: string = GLOBAL_FILTERS_CONTAINER) => {
  usingNewPicker(
    container,
    () => retypeRangeOnNewPicker(container, ({ end }) => ({ start: toIsoIfDate(date), end })),
    () => {
      cy.get(GET_LOCAL_DATE_PICKER_START_DATE_POPOVER_BUTTON(container)).first().click({});

      cy.get(DATE_PICKER_ABSOLUTE_TAB).first().click();

      cy.get(DATE_PICKER_ABSOLUTE_INPUT).click();
      cy.get(DATE_PICKER_ABSOLUTE_INPUT).then(($el) => {
        if (Cypress.dom.isAttached($el)) {
          cy.wrap($el).click();
        }
        cy.wrap($el).type(`{selectall}{backspace}${date}{enter}`);
      });
    }
  );
};

export const updateDates = (container: string = GLOBAL_FILTERS_CONTAINER) => {
  // The new picker applies on Enter inside set{Start,End}Date{Now}, so this
  // step is a no-op there. The legacy picker still needs an explicit click.
  usingNewPicker(
    container,
    () => undefined,
    () => {
      cy.get(GET_DATE_PICKER_APPLY_BUTTON(container)).click({ force: true });
      cy.get(GET_DATE_PICKER_APPLY_BUTTON(container)).should('not.have.text', 'Updating');
    }
  );
};

/**
 * Asserts that the date picker inside `container` reflects the given range.
 * On the new picker, reads the ISO range from the control button's
 * `data-date-range` attribute. On the legacy picker, reads the formatted
 * `title` from the start/end popover buttons.
 */
export const expectDateRangeToBe = (
  container: string,
  expected: { start: string; end: string }
) => {
  usingNewPicker(
    container,
    () => {
      const expectedRange = `${toIsoIfDate(expected.start)} to ${toIsoIfDate(expected.end)}`;
      cy.get(`${container} ${NEW_PICKER_CONTROL}`)
        .first()
        .should('have.attr', 'data-date-range', expectedRange);
    },
    () => {
      cy.get(`${container} [data-test-subj="superDatePickerstartDatePopoverButton"]`)
        .first()
        .should('have.text', expected.start);
      cy.get(`${container} [data-test-subj="superDatePickerendDatePopoverButton"]`)
        .first()
        .should('have.text', expected.end);
    }
  );
};

export const updateTimelineDates = () => {
  cy.get(DATE_PICKER_APPLY_BUTTON_TIMELINE).first().click();
  cy.get(DATE_PICKER_APPLY_BUTTON_TIMELINE).first().should('not.have.text', 'Updating');
};

export const updateDateRangeInLocalDatePickers = (
  localQueryBarSelector: string,
  startDate: string,
  endDate: string
) => {
  cy.get(localQueryBarSelector).then(($container) => {
    if ($container.find('[data-test-subj="dateRangePickerControlButton"]').length) {
      // New DateRangePicker: type the full range as ISO into the text input.
      // Convert "MMM D, YYYY @ HH:mm:ss.SSS" → ISO by stripping the " @ " separator.
      const toIso = (d: string) => new Date(d.replace(' @ ', ' ')).toISOString();
      cy.get(GET_DATE_RANGE_PICKER_CONTROL_BUTTON(localQueryBarSelector)).click();
      cy.get(DATE_RANGE_PICKER_INPUT).clear();
      cy.get(DATE_RANGE_PICKER_INPUT).type(`${toIso(startDate)} to ${toIso(endDate)}{enter}`);
    } else {
      // Legacy EuiSuperDatePicker
      cy.get(GET_LOCAL_SHOW_DATES_BUTTON(localQueryBarSelector)).click();
      cy.get(DATE_PICKER_ABSOLUTE_TAB).first().click();

      cy.get(DATE_PICKER_ABSOLUTE_INPUT).click();
      cy.get(DATE_PICKER_ABSOLUTE_INPUT).clear();
      cy.get(DATE_PICKER_ABSOLUTE_INPUT).type(`${startDate}{enter}`);
      cy.get(GET_LOCAL_DATE_PICKER_APPLY_BUTTON(localQueryBarSelector)).click();
      cy.get(GET_LOCAL_DATE_PICKER_APPLY_BUTTON(localQueryBarSelector)).should(
        'not.have.text',
        'Updating'
      );

      cy.get(GET_LOCAL_DATE_PICKER_END_DATE_POPOVER_BUTTON(localQueryBarSelector)).click();

      cy.get(DATE_PICKER_ABSOLUTE_TAB).first().click();

      cy.get(DATE_PICKER_ABSOLUTE_INPUT).click();
      cy.get(DATE_PICKER_ABSOLUTE_INPUT).clear();
      cy.get(DATE_PICKER_ABSOLUTE_INPUT).type(`${endDate}{enter}`);
      cy.intercept('internal/search/esql_async').as('esqlQuery');
      cy.get(GET_LOCAL_DATE_PICKER_APPLY_BUTTON(localQueryBarSelector)).click();
      cy.wait('@esqlQuery');
    }
  });
};

export const showStartEndDate = (container: string = GLOBAL_FILTERS_CONTAINER) => {
  // The new picker exposes the input inline, no "show dates" affordance needed.
  // setStartDate / setEndDate / setEndDateNow each open the picker themselves.
  usingNewPicker(
    container,
    () => undefined,
    () => {
      cy.get(GET_LOCAL_SHOW_DATES_BUTTON(container)).click();
      cy.get(GET_LOCAL_DATE_PICKER_START_DATE_POPOVER_BUTTON(container)).click();
    }
  );
};
