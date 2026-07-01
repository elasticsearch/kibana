/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elementsOverlap } from '../../../helpers/rules';
import {
  TIMELINE_ROW_RENDERERS_DISABLE_ALL_BTN,
  TIMELINE_ROW_RENDERERS_MODAL_ITEMS_CHECKBOX,
  TIMELINE_ROW_RENDERERS_SEARCHBOX,
  TIMELINE_SHOW_ROW_RENDERERS_GEAR,
  TIMELINE_ROW_RENDERERS_SURICATA_SIGNATURE,
  TIMELINE_ROW_RENDERERS_SURICATA_SIGNATURE_TOOLTIP,
  TIMELINE_ROW_RENDERERS_SURICATA_LINK_TOOLTIP,
  TIMELINE_ROW_RENDERERS_MODAL_CLOSE_BUTTON,
  TIMELINE_ROW_RENDERERS_WRAPPER,
} from '../../../screens/timeline';
import { deleteTimelines } from '../../../tasks/api_calls/timelines';
import { waitForWelcomePanelToBeLoaded } from '../../../tasks/common';
import { waitForAllHostsToBeLoaded } from '../../../tasks/hosts/all_hosts';

import { login } from '../../../tasks/login';
import { visitWithTimeRange } from '../../../tasks/navigation';
import { openTimelineUsingToggle } from '../../../tasks/security_main';
import {
  addNameToTimelineAndSave,
  enableAllRowRenderersWithSwitch,
  populateTimeline,
  saveTimeline,
} from '../../../tasks/timeline';

import { hostsUrl } from '../../../urls/navigation';

describe('Row renderers', { tags: ['@ess', '@serverless'] }, () => {
  before(() => {
    cy.task('esArchiverLoad', { archiveName: 'bulk_process' });
  });

  after(() => {
    cy.task('esArchiverUnload', { archiveName: 'bulk_process' });
  });
  beforeEach(() => {
    deleteTimelines();
    login();
    visitWithTimeRange(hostsUrl('allHosts'), {
      visitOptions: {
        onLoad: () => {
          waitForWelcomePanelToBeLoaded();
          waitForAllHostsToBeLoaded();
        },
      },
    });
    openTimelineUsingToggle();
    populateTimeline();
  });

  it('Row renderers should be disabled by default', () => {
    cy.get(TIMELINE_SHOW_ROW_RENDERERS_GEAR).first().click();
    cy.get(TIMELINE_ROW_RENDERERS_MODAL_ITEMS_CHECKBOX).should('not.be.checked');
  });

  it('Selected renderer can be disabled and enabled', () => {
    // The netflow renderer checkbox has id="netflow" per EuiCheckbox id={item.id}
    const NETFLOW_CHECKBOX = '[data-test-subj="row-renderers-modal"] #netflow';

    cy.get(TIMELINE_ROW_RENDERERS_WRAPPER).should('have.length', 0);
    enableAllRowRenderersWithSwitch();
    // Wait for at least one row renderer to appear before proceeding
    cy.get(TIMELINE_ROW_RENDERERS_WRAPPER).should('have.length.gt', 0);
    cy.get(TIMELINE_ROW_RENDERERS_WRAPPER).first().should('be.visible');
    cy.get(TIMELINE_SHOW_ROW_RENDERERS_GEAR).first().click();
    cy.get(TIMELINE_ROW_RENDERERS_SEARCHBOX).scrollIntoView();
    cy.get(TIMELINE_ROW_RENDERERS_SEARCHBOX).type('flow');
    // Wait for the table to filter and verify the netflow checkbox is present and checked
    cy.get(NETFLOW_CHECKBOX).should('be.checked');

    // Register the intercept for the first save (excluding netflow) before triggering it
    cy.intercept('PATCH', '/api/timeline').as('excludeNetflow');
    cy.get(NETFLOW_CHECKBOX).uncheck();

    // close modal and save timeline changes
    cy.get(TIMELINE_ROW_RENDERERS_MODAL_CLOSE_BUTTON).click();
    addNameToTimelineAndSave('Test');

    cy.wait('@excludeNetflow').then((interception) => {
      expect(interception?.response?.body.excludedRowRendererIds).to.contain('netflow');
    });

    // open modal, filter and check
    cy.get(TIMELINE_SHOW_ROW_RENDERERS_GEAR).first().click();
    cy.get(TIMELINE_ROW_RENDERERS_SEARCHBOX).scrollIntoView();
    cy.get(TIMELINE_ROW_RENDERERS_SEARCHBOX).type('flow');
    // Wait for the table to filter and verify the netflow checkbox is present and unchecked
    cy.get(NETFLOW_CHECKBOX).should('not.be.checked');

    // Register the intercept for the second save (including netflow) before triggering it
    cy.intercept('PATCH', '/api/timeline').as('includeNetflow');
    cy.get(NETFLOW_CHECKBOX).check();

    // close modal and save timeline changes
    cy.get(TIMELINE_ROW_RENDERERS_MODAL_CLOSE_BUTTON).click();
    saveTimeline();

    cy.wait('@includeNetflow').then((interception) => {
      expect(interception?.response?.body.excludedRowRendererIds).not.to.contain('netflow');
    });
  });

  it('Selected renderer can be disabled with one click', () => {
    enableAllRowRenderersWithSwitch();
    cy.get(TIMELINE_SHOW_ROW_RENDERERS_GEAR).should('exist');
    cy.get(TIMELINE_SHOW_ROW_RENDERERS_GEAR).first().click();
    cy.get(TIMELINE_ROW_RENDERERS_DISABLE_ALL_BTN).should('exist');
    cy.get(TIMELINE_ROW_RENDERERS_MODAL_ITEMS_CHECKBOX).should('be.checked');

    // Intercepts should be before click handlers that activate them rather than afterwards or you have race conditions
    cy.intercept('PATCH', '/api/timeline').as('updateTimeline');

    cy.get(TIMELINE_ROW_RENDERERS_DISABLE_ALL_BTN).click();

    cy.get(TIMELINE_ROW_RENDERERS_MODAL_ITEMS_CHECKBOX).first().should('not.be.checked');

    cy.get(TIMELINE_ROW_RENDERERS_MODAL_CLOSE_BUTTON).click();

    addNameToTimelineAndSave('Test');

    cy.wait('@updateTimeline').its('response.statusCode').should('eq', 200);
  });

  describe('Suricata', () => {
    // Skipped due to historical flakiness — see https://github.com/elastic/kibana/issues/126894.
    // The parent suite skip from #250924 was removed, but this individual test remains skipped
    // pending its own follow-up.
    it.skip('Signature tooltips do not overlap', () => {
      // Hover the signature to show the tooltips
      cy.get(TIMELINE_ROW_RENDERERS_SURICATA_SIGNATURE).parents('.euiPopover').realHover();

      cy.get(TIMELINE_ROW_RENDERERS_SURICATA_LINK_TOOLTIP).then(($googleLinkTooltip) => {
        cy.get(TIMELINE_ROW_RENDERERS_SURICATA_SIGNATURE_TOOLTIP).then(($signatureTooltip) => {
          expect(
            elementsOverlap($googleLinkTooltip, $signatureTooltip),
            'tooltips do not overlap'
          ).to.equal(false);
        });
      });
    });
  });
});
