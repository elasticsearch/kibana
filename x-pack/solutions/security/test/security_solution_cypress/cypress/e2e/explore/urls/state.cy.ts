/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  DATE_PICKER_APPLY_BUTTON_TIMELINE,
  GLOBAL_FILTERS_CONTAINER,
} from '../../../screens/date_picker';
import { HOSTS_NAMES } from '../../../screens/hosts/all_hosts';
import { ANOMALIES_TAB } from '../../../screens/hosts/main';
import {
  BREADCRUMBS,
  EXPLORE,
  HOSTS,
  KQL_INPUT,
  LOADING_INDICATOR,
  NETWORK,
  openNavigationPanel as toggleNavigationPanel,
} from '../../../screens/security_header';
import { TIMELINE_DATE_PICKER_CONTAINER, TIMELINE_TITLE } from '../../../screens/timeline';

import { login } from '../../../tasks/login';
import { visit, visitWithTimeRange } from '../../../tasks/navigation';
import {
  expectDateRangeToBe,
  setEndDate,
  setStartDate,
  updateDates,
  updateTimelineDates,
} from '../../../tasks/date_picker';
import { openFirstHostDetails, waitForAllHostsToBeLoaded } from '../../../tasks/hosts/all_hosts';
import { openAllHosts } from '../../../tasks/hosts/main';

import { waitForIpsTableToBeLoaded } from '../../../tasks/network/flows';
import {
  clearSearchBar,
  kqlSearch,
  navigateFromHeaderTo,
  saveQuery,
} from '../../../tasks/security_header';
import { openTimelineUsingToggle } from '../../../tasks/security_main';
import { addNameToTimelineAndSave, closeTimeline, populateTimeline } from '../../../tasks/timeline';

import { hostsUrl } from '../../../urls/navigation';
import { ABSOLUTE_DATE_RANGE } from '../../../urls/state';

import { getTimeline } from '../../../objects/timeline';
import {
  GLOBAL_SEARCH_BAR_FILTER_ITEM_AT,
  GLOBAL_SEARCH_BAR_PINNED_FILTER,
} from '../../../screens/search_bar';

const ABSOLUTE_DATE = {
  endTime: 'Aug 1, 2019 @ 20:33:29.186',
  endTimeTimeline: '2019-08-02T21:03:29.186Z',
  endTimeTimelineFormatted: 'Aug 2, 2019 @ 21:03:29.186',
  newEndTimeTyped: 'Aug 1, 2019 @ 15:03:29.186',
  newStartTimeTyped: 'Aug 1, 2019 @ 14:33:29.186',
  startTime: 'Aug 1, 2019 @ 20:03:29.186',
  startTimeTimeline: '2019-08-02T20:03:29.186Z',
  startTimeTimelineFormatted: 'Aug 2, 2019 @ 20:03:29.186',
  firefoxEndTimeTyped: '2019-08-01T15:03:29',
  firefoxStartTimeTyped: '2019-08-01T14:33:29',
};

const mockTimeline = getTimeline();

describe(
  'url state',
  {
    tags: ['@ess', '@skipInServerless'],
    env: {
      ftrConfig: {
        kbnServerArgs: [
          `--xpack.securitySolution.enableExperimental=${JSON.stringify([
            'disable:entityAnalyticsEntityStoreV2',
          ])}`,
          '--uiSettings.overrides.securitySolution:entityStoreEnableV2=false',
        ],
      },
    },
  },
  () => {
    beforeEach(() => {
      login();
    });

    it('sets filters from the url', () => {
      visit(ABSOLUTE_DATE_RANGE.urlFiltersHostsHosts);

      cy.get(GLOBAL_SEARCH_BAR_FILTER_ITEM_AT(0)).should('have.text', 'host.name: test-host');
      cy.get(GLOBAL_SEARCH_BAR_FILTER_ITEM_AT(0))
        .find(GLOBAL_SEARCH_BAR_PINNED_FILTER)
        .should('exist');
      cy.get(GLOBAL_SEARCH_BAR_FILTER_ITEM_AT(1)).should('have.text', 'host.os.name: test-os');
    });

    it('sets saved query from the url', () => {
      visit(ABSOLUTE_DATE_RANGE.urlFiltersHostsHosts);
      saveQuery('test-query');
      // refresh the page to force loading the saved query from the URL
      cy.reload();

      cy.get(GLOBAL_SEARCH_BAR_FILTER_ITEM_AT(0)).should('have.text', 'host.name: test-host');
      cy.get(GLOBAL_SEARCH_BAR_FILTER_ITEM_AT(0))
        .find(GLOBAL_SEARCH_BAR_PINNED_FILTER)
        .should('exist');
      cy.get(GLOBAL_SEARCH_BAR_FILTER_ITEM_AT(1)).should('have.text', 'host.os.name: test-os');
    });

    it('sets the global start and end dates from the url', () => {
      visit(ABSOLUTE_DATE_RANGE.url);
      expectDateRangeToBe(GLOBAL_FILTERS_CONTAINER, {
        start: ABSOLUTE_DATE.startTime,
        end: ABSOLUTE_DATE.endTime,
      });
    });

    it('sets the url state when start and end date are set', () => {
      visit(ABSOLUTE_DATE_RANGE.url);
      setStartDate(ABSOLUTE_DATE.newStartTimeTyped);
      updateDates();
      waitForIpsTableToBeLoaded();
      setEndDate(ABSOLUTE_DATE.newEndTimeTyped);
      updateDates();

      let startDate: string;
      let endDate: string;

      if (Cypress.browser.name === 'firefox') {
        startDate = new Date(ABSOLUTE_DATE.firefoxStartTimeTyped)
          .toISOString()
          .replace('000', '186');
        endDate = new Date(ABSOLUTE_DATE.firefoxEndTimeTyped).toISOString().replace('000', '186');
      } else {
        startDate = new Date(ABSOLUTE_DATE.newStartTimeTyped).toISOString();
        endDate = new Date(ABSOLUTE_DATE.newEndTimeTyped).toISOString();
      }

      cy.url().should(
        'include',
        `(global:(linkTo:!(timeline),timerange:(from:%27${startDate}%27,kind:absolute,to:%27${endDate}%27))`
      );
    });

    it('sets the timeline start and end dates from the url when locked to global time', () => {
      visit(ABSOLUTE_DATE_RANGE.url);
      openTimelineUsingToggle();

      expectDateRangeToBe(TIMELINE_DATE_PICKER_CONTAINER, {
        start: ABSOLUTE_DATE.startTime,
        end: ABSOLUTE_DATE.endTime,
      });
    });

    it('sets the timeline start and end dates independently of the global start and end dates when times are unlocked', () => {
      visit(ABSOLUTE_DATE_RANGE.urlUnlinked);
      expectDateRangeToBe(GLOBAL_FILTERS_CONTAINER, {
        start: ABSOLUTE_DATE.startTime,
        end: ABSOLUTE_DATE.endTime,
      });

      openTimelineUsingToggle();

      expectDateRangeToBe(TIMELINE_DATE_PICKER_CONTAINER, {
        start: ABSOLUTE_DATE.startTimeTimelineFormatted,
        end: ABSOLUTE_DATE.endTimeTimelineFormatted,
      });
    });

    it('sets the url state when timeline/global date pickers are unlinked and timeline start and end date are set', () => {
      visit(ABSOLUTE_DATE_RANGE.urlUnlinked);
      openTimelineUsingToggle();
      setStartDate(ABSOLUTE_DATE.newStartTimeTyped, TIMELINE_DATE_PICKER_CONTAINER);
      updateTimelineDates();
      setEndDate(ABSOLUTE_DATE.newEndTimeTyped, TIMELINE_DATE_PICKER_CONTAINER);
      updateTimelineDates();

      let startDate: string;
      let endDate: string;

      if (Cypress.browser.name === 'firefox') {
        startDate = new Date(ABSOLUTE_DATE.firefoxStartTimeTyped)
          .toISOString()
          .replace('000', '186');
        endDate = new Date(ABSOLUTE_DATE.firefoxEndTimeTyped).toISOString().replace('000', '186');
      } else {
        startDate = new Date(ABSOLUTE_DATE.newStartTimeTyped).toISOString();
        endDate = new Date(ABSOLUTE_DATE.newEndTimeTyped).toISOString();
      }

      cy.url().should(
        'include',
        `timeline:(linkTo:!(),timerange:(from:%27${startDate}%27,kind:absolute,to:%27${endDate}%27))`
      );
    });

    it('sets kql on network page', () => {
      visit(ABSOLUTE_DATE_RANGE.urlKqlNetworkNetwork);
      cy.get(KQL_INPUT()).should('have.text', 'source.ip: "10.142.0.9"');
    });

    it('sets kql on hosts page', () => {
      visit(ABSOLUTE_DATE_RANGE.urlKqlHostsHosts);
      cy.get(KQL_INPUT()).should('have.text', 'source.ip: "10.142.0.9"');
    });

    it('sets the url state when kql is set', () => {
      visit(ABSOLUTE_DATE_RANGE.url);
      kqlSearch('source.ip: "10.142.0.9" {enter}');

      cy.url().should(
        'include',
        `query=(language:kuery,query:%27source.ip:%20%2210.142.0.9%22%20%27)`
      );
    });

    it('sets the url state when kql is set and check if href reflect this change', () => {
      visit(ABSOLUTE_DATE_RANGE.url);
      kqlSearch('source.ip: "10.142.0.9" {enter}');
      navigateFromHeaderTo(HOSTS);

      toggleNavigationPanel(EXPLORE);
      cy.get(NETWORK)
        .should('have.attr', 'href')
        .and(
          'contain',
          "/app/security/network?query=(language:kuery,query:'source.ip:%20%2210.142.0.9%22%20')" +
            "&timeline=(activeTab:query,isOpen:!f,query:(expression:'',kind:kuery))" +
            "&timerange=(global:(linkTo:!(timeline),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2019-08-01T20:33:29.186Z')),timeline:(linkTo:!(global),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2019-08-01T20:33:29.186Z')),valueReport:(linkTo:!(),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2019-08-01T20:33:29.186Z')))"
        );
    });
    it('sets KQL in host page and detail page and check if href match on breadcrumb, tabs and subTabs', () => {
      visit(ABSOLUTE_DATE_RANGE.urlHostNew);
      kqlSearch('host.name: "siem-kibana" {enter}');
      openAllHosts();
      waitForAllHostsToBeLoaded();

      toggleNavigationPanel(EXPLORE);
      cy.get(HOSTS)
        .should('have.attr', 'href')
        .and(
          'contain',
          "/app/security/hosts?query=(language:kuery,query:'host.name:%20%22siem-kibana%22%20')" +
            "&timeline=(activeTab:query,isOpen:!f,query:(expression:'',kind:kuery))" +
            "&timerange=(global:(linkTo:!(timeline),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),timeline:(linkTo:!(global),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),valueReport:(linkTo:!(),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2019-08-01T20:33:29.186Z')))"
        );
      cy.get(NETWORK)
        .should('have.attr', 'href')
        .and(
          'contain',
          "/app/security/network?query=(language:kuery,query:'host.name:%20%22siem-kibana%22%20')" +
            "&timeline=(activeTab:query,isOpen:!f,query:(expression:'',kind:kuery))" +
            "&timerange=(global:(linkTo:!(timeline),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),timeline:(linkTo:!(global),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),valueReport:(linkTo:!(),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2019-08-01T20:33:29.186Z')))"
        );
      toggleNavigationPanel(EXPLORE);
      cy.get(HOSTS_NAMES).first().should('have.text', 'siem-kibana');

      openFirstHostDetails();
      clearSearchBar();
      kqlSearch('agent.type: "auditbeat" {enter}');

      cy.get(ANOMALIES_TAB)
        .should('have.attr', 'href')
        .and(
          'contain',
          "/app/security/hosts/name/siem-kibana/anomalies?timeline=(activeTab:query,isOpen:!f,query:(expression:'',kind:kuery))" +
            "&timerange=(global:(linkTo:!(timeline),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),timeline:(linkTo:!(global),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),valueReport:(linkTo:!(),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2019-08-01T20:33:29.186Z')))"
        );

      cy.get(BREADCRUMBS)
        .eq(2)
        .should('have.attr', 'href')
        .and(
          'contain',
          "/app/security/hosts?query=(language:kuery,query:'agent.type:%20%22auditbeat%22%20')" +
            "&timeline=(activeTab:query,isOpen:!f,query:(expression:'',kind:kuery))" +
            "&timerange=(global:(linkTo:!(timeline),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),timeline:(linkTo:!(global),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),valueReport:(linkTo:!(),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2019-08-01T20:33:29.186Z')))"
        );
      cy.get(BREADCRUMBS)
        .eq(3)
        .should('have.attr', 'href')
        .and(
          'contain',
          "/app/security/hosts/name/siem-kibana/events?query=(language:kuery,query:'agent.type:%20%22auditbeat%22%20')" +
            "&timeline=(activeTab:query,isOpen:!f,query:(expression:'',kind:kuery))" +
            "&timerange=(global:(linkTo:!(timeline),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),timeline:(linkTo:!(global),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2023-01-01T21:33:29.186Z')),valueReport:(linkTo:!(),timerange:(from:'2019-08-01T20:03:29.186Z',kind:absolute,to:'2019-08-01T20:33:29.186Z')))"
        );
    });

    it('Do not clears kql when navigating to a new page', () => {
      visit(ABSOLUTE_DATE_RANGE.urlKqlHostsHosts);
      navigateFromHeaderTo(NETWORK);
      cy.get(KQL_INPUT()).should('have.text', 'source.ip: "10.142.0.9"');
    });

    it('sets and reads the url state for timeline by id', () => {
      visitWithTimeRange(hostsUrl('allHosts'));
      openTimelineUsingToggle();
      populateTimeline();

      cy.intercept('PATCH', '/api/timeline').as('timeline');
      cy.get(LOADING_INDICATOR).should('not.exist');
      addNameToTimelineAndSave(mockTimeline.title);
      cy.wait('@timeline').then(({ response }) => {
        closeTimeline();
        cy.wrap(response?.statusCode).should('eql', 200);
        const timelineId = response?.body.savedObjectId;
        visitWithTimeRange('/app/home');
        visitWithTimeRange(`/app/security/timelines?timeline=(id:'${timelineId}',isOpen:!t)`);
        cy.get(DATE_PICKER_APPLY_BUTTON_TIMELINE).should('exist');
        cy.get(DATE_PICKER_APPLY_BUTTON_TIMELINE).should('not.have.text', 'Updating');
        cy.get(TIMELINE_TITLE).should('be.visible');
        cy.get(TIMELINE_TITLE).should('have.text', mockTimeline.title);
      });
    });
  }
);
