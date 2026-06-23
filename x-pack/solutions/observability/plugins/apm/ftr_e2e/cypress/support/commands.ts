/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import 'cypress-real-events/support';
import type { Interception } from 'cypress/types/net-stubbing';
import 'cypress-axe';
import moment from 'moment';
import '@frsource/cypress-plugin-visual-regression-diff';
import { AXE_CONFIG, AXE_OPTIONS } from '@kbn/axe-config';
import { ApmUsername } from '@kbn/apm-plugin/server/test_helpers/create_apm_users/authentication';
import { resolveKibanaOrigin, suppressGlobalAnnouncements } from './suppress_global_announcements';

Cypress.Commands.add('loginAsSuperUser', () => {
  return cy.loginAs({ username: 'elastic', password: 'changeme' });
});

Cypress.Commands.add('loginAsViewerUser', () => {
  return cy.loginAs({ username: ApmUsername.viewerUser, password: 'changeme' });
});

Cypress.Commands.add('loginAsEditorUser', () => {
  return cy.loginAs({ username: ApmUsername.editorUser, password: 'changeme' });
});

Cypress.Commands.add('loginAsMonitorUser', () => {
  return cy.loginAs({
    username: ApmUsername.apmMonitorClusterAndIndices,
    password: 'changeme',
  });
});

Cypress.Commands.add('loginAsApmManageOwnAndCreateAgentKeys', () => {
  return cy.loginAs({
    username: ApmUsername.apmManageOwnAndCreateAgentKeys,
    password: 'changeme',
  });
});

Cypress.Commands.add('loginAsApmAllPrivilegesWithoutWriteSettingsUser', () => {
  return cy.loginAs({
    username: ApmUsername.apmAllPrivilegesWithoutWriteSettings,
    password: 'changeme',
  });
});

Cypress.Commands.add('loginAsApmReadPrivilegesWithWriteSettingsUser', () => {
  return cy.loginAs({
    username: ApmUsername.apmReadPrivilegesWithWriteSettings,
    password: 'changeme',
  });
});

Cypress.Commands.add(
  'loginAs',
  ({ username, password }: { username: string; password: string }) => {
    suppressGlobalAnnouncements();
    cy.session(
      username,
      () => {
        const kibanaUrl = resolveKibanaOrigin();
        if (!kibanaUrl) {
          throw new Error(
            'APM Cypress login requires Kibana origin: set Cypress env KIBANA_URL or cypress.config baseUrl'
          );
        }
        cy.log(`Logging in as ${username} on ${kibanaUrl}`);
        cy.visit('/');
        cy.request({
          log: true,
          method: 'POST',
          url: `${kibanaUrl}/internal/security/login`,
          body: {
            providerType: 'basic',
            providerName: 'basic',
            currentURL: `${kibanaUrl}/login`,
            params: { username, password },
          },
          headers: {
            'kbn-xsrf': 'e2e_test',
          },
        });
        cy.visit('/');
      },
      {
        cacheAcrossSpecs: true,
      }
    );
  }
);

Cypress.Commands.add('getByTestSubj', (selector: string) => {
  return cy.get(`[data-test-subj="${selector}"]`);
});

// Wait for whichever date picker variant the page rendered (driven by the
// enableDateRangePicker prop). cy.get retries until at least one selector
// matches, avoiding races where the React picker hasn't mounted yet.
const usingNewPicker = (newPickerBranch: () => void, legacyBranch: () => void) => {
  cy.get(
    [
      '[data-test-subj="dateRangePickerControlButton"]',
      '[data-test-subj="superDatePickerstartDatePopoverButton"]',
      '[data-test-subj="superDatePickerToggleQuickMenuButton"]',
    ].join(', ')
  )
    .first()
    .then(($el) => {
      if ($el.attr('data-test-subj') === 'dateRangePickerControlButton') {
        newPickerBranch();
      } else {
        legacyBranch();
      }
    });
};

Cypress.Commands.add('changeTimeRange', (value: string) => {
  usingNewPicker(
    () => {
      cy.getByTestSubj('dateRangePickerControlButton').click();
      cy.getByTestSubj('dateRangePickerMainPanel').should('be.visible');
      // The component's toTestSubj replaces all whitespace with underscores.
      cy.getByTestSubj(`dateRangePickerPresetItem-${value.replace(/\s+/g, '_')}`).click();
    },
    () => {
      cy.getByTestSubj('superDatePickerToggleQuickMenuButton').click();
      cy.contains(value).click();
    }
  );
});

Cypress.Commands.add('visitKibana', (url, options) => {
  suppressGlobalAnnouncements();
  cy.visit(url, {
    onBeforeLoad(win) {
      if (options?.localStorageOptions && options.localStorageOptions.length > 0) {
        options.localStorageOptions.forEach(([key, value]) => win.localStorage.setItem(key, value));
      }
    },
  });
  cy.getByTestSubj('kbnLoadingMessage').should('exist');
  cy.getByTestSubj('kbnLoadingMessage').should('not.exist', {
    timeout: 50000,
  });
});

// Sets the absolute time range AND submits the query bar. Both picker variants
// end with a submitted query — the legacy popover flow only updates state and
// needs an explicit querySubmitButton click; the new picker's onDateRangeChange
// auto-submits via onSubmit (see query_bar_top_row.tsx:onDateRangeChange).
//
// This command expects from and to both values to be present on the URL where
// this command is being executed. If from and to values are not present,
// the date picker renders singleValueInput where this command won't work.
Cypress.Commands.add('selectAbsoluteTimeRange', (start: string, end: string) => {
  const format = 'MMM D, YYYY @ HH:mm:ss.SSS';

  usingNewPicker(
    () => {
      cy.getByTestSubj('dateRangePickerControlButton').click();
      cy.getByTestSubj('dateRangePickerCustomRangeNavItem').click();
      cy.getByTestSubj('dateRangePickerCustomRangePanel').should('be.visible');

      cy.getByTestSubj('dateRangePickerStartAbsoluteTab').click();
      cy.getByTestSubj('dateRangePickerStartAbsoluteInput').clear();
      cy.getByTestSubj('dateRangePickerStartAbsoluteInput').type(moment(start).toISOString());

      cy.getByTestSubj('dateRangePickerEndAbsoluteTab').click();
      cy.getByTestSubj('dateRangePickerEndAbsoluteInput').clear();
      cy.getByTestSubj('dateRangePickerEndAbsoluteInput').type(moment(end).toISOString());

      // Apply commits the range and onDateRangeChange auto-submits the query.
      cy.getByTestSubj('dateRangePickerCustomRangeApplyButton').click();
    },
    () => {
      cy.getByTestSubj('superDatePickerstartDatePopoverButton').click();
      cy.getByTestSubj('superDatePickerAbsoluteDateInput').clear({ force: true });
      cy.getByTestSubj('superDatePickerAbsoluteDateInput')
        .type(moment(start).format(format), { force: true })
        .type('{enter}');

      cy.getByTestSubj('superDatePickerendDatePopoverButton').click();
      cy.getByTestSubj('superDatePickerAbsoluteDateInput').clear({ force: true });
      cy.getByTestSubj('superDatePickerAbsoluteDateInput')
        .type(moment(end).format(format), { force: true })
        .type('{enter}');

      // Legacy onTimeChange only updates state for absolute selections — submit
      // explicitly so callers don't need a separate Update click.
      cy.getByTestSubj('querySubmitButton').click();
    }
  );
});

Cypress.Commands.add(
  'expectAPIsToHaveBeenCalledWith',
  ({ apisIntercepted, value }: { apisIntercepted: string[]; value: string }) => {
    cy.wait(apisIntercepted).then((interceptions) => {
      if (Array.isArray(interceptions)) {
        interceptions.map((interception) => {
          expect(interception.request.url).include(value);
        });
      } else {
        expect((interceptions as Interception).request.url).include(value);
      }
    });
  }
);

Cypress.Commands.add('updateAdvancedSettings', (settings: Record<string, unknown>) => {
  const kibanaUrl = Cypress.env('KIBANA_URL');
  cy.request({
    log: false,
    method: 'POST',
    url: `${kibanaUrl}/internal/kibana/settings`,
    body: { changes: settings },
    headers: {
      'kbn-xsrf': 'e2e_test',
    },
    auth: { user: 'editor', pass: 'changeme' },
  });
});

Cypress.Commands.add('withHidden', (selector, callback) => {
  cy.get(selector).invoke('attr', 'style', 'display: none');
  callback();
  cy.get(selector).invoke('attr', 'style', '');
});

Cypress.Commands.add('waitUntilPageContentIsLoaded', () => {
  cy.getByTestSubj('kbnAppWrapper visibleChrome').find('[aria-busy=false]').should('be.visible');
});

// A11y configuration

const axeConfig = {
  ...AXE_CONFIG,
};
const axeOptions = {
  ...AXE_OPTIONS,
  runOnly: [...AXE_OPTIONS.runOnly, 'best-practice'],
};

/**
 * Runs accessibility checks using Axe.
 *
 * @param options - Configuration options for the accessibility check.
 * @param options.skipFailures - **@deprecated** Use of this option is discouraged. It may be used temporarily, but please ensure that all identified issues are addressed promptly.
 */
export const checkA11y = ({ skipFailures }: { skipFailures?: true } = {}) => {
  // https://github.com/component-driven/cypress-axe#cychecka11y
  cy.injectAxe();
  cy.configureAxe(axeConfig);
  const context = '.kbnAppWrapper'; // Scopes a11y checks to only our app
  /**
   * We can get rid of the last two params when we don't need to add skipFailures
   * params = (context, options, violationCallback, skipFailures)
   */
  cy.checkA11y(context, axeOptions, undefined, skipFailures ?? false);
};
