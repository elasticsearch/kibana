/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ADD_INTEGRATION_POLICY_BTN,
  CREATE_PACKAGE_POLICY_SAVE_BTN,
  INTEGRATION_NAME_LINK,
  POLICY_EDITOR,
} from '../screens/integrations';
import { EXISTING_HOSTS_TAB } from '../screens/fleet';
import { CONFIRM_MODAL } from '../screens/navigation';

import { API_VERSIONS } from '@kbn/fleet-plugin/common';
import { cleanupAgentPolicies } from '../tasks/cleanup';
import { login } from '../tasks/login';
import { request } from '../tasks/common';

const INPUT_TEST_PACKAGE = 'input_package-1.0.0';
const OTEL_INPUT_TEST_PACKAGE = 'otel_input_package-1.0.0';

describe('Input package with custom data stream type', () => {
  beforeEach(() => {
    login();
  });

  const agentPolicyId = 'test-input-package-policy';
  const agentPolicyName = 'Test input package policy';
  const packagePolicyName = 'input-package-policy';
  const datasetName = 'logs'; // Default from the package.
  const dataStreamType = 'metrics';

  before(() => {
    cy.task('installTestPackage', INPUT_TEST_PACKAGE);

    request({
      method: 'POST',
      url: `/api/fleet/agent_policies`,
      body: {
        id: agentPolicyId,
        name: agentPolicyName,
        description: 'desc',
        namespace: 'default',
        monitoring_enabled: [],
      },
      headers: { 'kbn-xsrf': 'cypress', 'Elastic-Api-Version': `${API_VERSIONS.public.v1}` },
    });
  });

  after(() => {
    cleanupAgentPolicies();
    cy.task('uninstallTestPackage', INPUT_TEST_PACKAGE);
  });

  it('should successfully create a package policy', () => {
    cy.visit(`/app/integrations/detail/${INPUT_TEST_PACKAGE}/overview`);
    cy.getBySel(ADD_INTEGRATION_POLICY_BTN).click();

    cy.getBySel(POLICY_EDITOR.POLICY_NAME_INPUT).click().clear().type(packagePolicyName);
    cy.getBySel('multiTextInput-paths')
      .find('[data-test-subj="multiTextInputRow-0"]')
      .click()
      .type('/var/log/test.log');

    cy.getBySel('multiTextInput-tags')
      .find('[data-test-subj="multiTextInputRow-0"]')
      .click()
      .type('tag1');

    // Select metrics data stream type.
    cy.get('[data-test-subj^="advancedStreamOptionsToggle"]').click();
    cy.get('[data-test-subj="packagePolicyDataStreamType"')
      .find(`label[for="${dataStreamType}"]`)
      .click();

    cy.getBySel(EXISTING_HOSTS_TAB).click();

    cy.getBySel(POLICY_EDITOR.AGENT_POLICY_SELECT).click();
    cy.getBySel('agentPolicyMultiItem').each(($el) => {
      if ($el.text() === agentPolicyName) {
        $el.trigger('click');
      }
    });
    cy.wait(1000); // wait for policy id to be set
    cy.getBySel(CREATE_PACKAGE_POLICY_SAVE_BTN).click();

    cy.getBySel(CONFIRM_MODAL.CANCEL_BUTTON).click();
  });

  it(`${dataStreamType} checkbox should be checked`, () => {
    cy.visit(`/app/integrations/detail/${INPUT_TEST_PACKAGE}/policies`);

    cy.getBySel(INTEGRATION_NAME_LINK).contains(packagePolicyName).click();

    cy.get('button').contains('Change defaults').click();
    cy.get('[data-test-subj^="advancedStreamOptionsToggle"]').click();
    cy.get('[data-test-subj="packagePolicyDataStreamType"')
      .find(`input#${dataStreamType}`)
      .should('be.checked');
  });

  it('should not allow to edit data stream type', () => {
    cy.visit(`/app/integrations/detail/${INPUT_TEST_PACKAGE}/policies`);

    cy.getBySel(INTEGRATION_NAME_LINK).contains(packagePolicyName).click();

    cy.get('button').contains('Change defaults').click();
    cy.get('[data-test-subj^="advancedStreamOptionsToggle"]').click();
    cy.get('[data-test-subj="packagePolicyDataStreamType"')
      .find('input')
      .should('have.length', 3)
      .each(($el) => cy.wrap($el).should('be.disabled'));
  });

  it('has an index template', () => {
    cy.visit(`app/management/data/index_management/templates/${dataStreamType}-${datasetName}`);

    // Check that the index pattern appears in the view.
    cy.get('[data-test-subj="templateDetails"').contains(`${dataStreamType}-${datasetName}-*`);
  });
});

describe('OTel input package with custom data stream type', () => {
  beforeEach(() => {
    login();
  });

  const agentPolicyId = 'test-otel-input-package-policy';
  const agentPolicyName = 'Test input package policy';
  const packagePolicyName = 'input-package-policy';
  const datasetName = 'httpcheckreceiver'; // Default from the package.
  const dataStreamType = 'logs';

  before(() => {
    cy.task('installTestPackage', OTEL_INPUT_TEST_PACKAGE);

    request({
      method: 'POST',
      url: `/api/fleet/agent_policies`,
      body: {
        id: agentPolicyId,
        name: agentPolicyName,
        description: 'desc',
        namespace: 'default',
        monitoring_enabled: [],
      },
      headers: { 'kbn-xsrf': 'cypress', 'Elastic-Api-Version': `${API_VERSIONS.public.v1}` },
    });
  });

  after(() => {
    cleanupAgentPolicies();
    cy.task('uninstallTestPackage', OTEL_INPUT_TEST_PACKAGE);
  });

  it('should successfully create a package policy', () => {
    cy.visit(`/app/integrations/detail/${OTEL_INPUT_TEST_PACKAGE}/overview`);
    cy.getBySel(ADD_INTEGRATION_POLICY_BTN).click();

    cy.getBySel(POLICY_EDITOR.POLICY_NAME_INPUT).click().clear().type(packagePolicyName);
    cy.getBySel('multiTextInput-http-endpoints-to-check')
      .find('[data-test-subj="multiTextInputRow-0"]')
      .click()
      .type('https://www.elastic.co/integrations');

    // Select logs data stream type.
    cy.get('[data-test-subj^="advancedStreamOptionsToggle"]').click();
    cy.get('[data-test-subj="packagePolicyDataStreamType"')
      .find(`label[for="${dataStreamType}"]`)
      .click();

    cy.getBySel(EXISTING_HOSTS_TAB).click();

    cy.getBySel(POLICY_EDITOR.AGENT_POLICY_SELECT).click();
    cy.getBySel('agentPolicyMultiItem').each(($el) => {
      if ($el.text() === agentPolicyName) {
        $el.trigger('click');
      }
    });
    cy.wait(1000); // wait for policy id to be set
    cy.getBySel(CREATE_PACKAGE_POLICY_SAVE_BTN).click();

    cy.getBySel(CONFIRM_MODAL.CANCEL_BUTTON).click();
  });

  it(`agent policy configures the dataset and type`, () => {
    cy.request({
      method: 'GET',
      url: `/api/fleet/agent_policies/${agentPolicyId}/full`,
    }).then(({ body }) => {
      expect(body.item).to.have.property('processors');
      let routingTransform;
      Object.entries(body.item.processors).forEach(([name, config]) => {
        if (!name.match(/transform\/.*-routing/)) {
          return;
        }
        routingTransform = config;
      });
      expect(routingTransform).to.deep.equal({
        log_statements: [
          {
            context: 'log',
            statements: [
              `set(attributes["data_stream.type"], "${dataStreamType}")`,
              `set(attributes["data_stream.dataset"], "${datasetName}") where attributes["data_stream.dataset"] == nil`,
              `set(attributes["data_stream.namespace"], "default") where attributes["data_stream.namespace"] == nil`,
            ],
          },
        ],
      });
    });
  });

  it(`${dataStreamType} checkbox should be checked`, () => {
    cy.visit(`/app/integrations/detail/${OTEL_INPUT_TEST_PACKAGE}/policies`);

    cy.getBySel(INTEGRATION_NAME_LINK).contains(packagePolicyName).click();

    cy.get('button').contains('Change defaults').click();
    cy.get('[data-test-subj^="advancedStreamOptionsToggle"]').click();
    cy.get('[data-test-subj="packagePolicyDataStreamType"')
      .find(`input#${dataStreamType}`)
      .should('be.checked');
  });

  it('should not allow to edit data stream type', () => {
    cy.visit(`/app/integrations/detail/${OTEL_INPUT_TEST_PACKAGE}/policies`);

    cy.getBySel(INTEGRATION_NAME_LINK).contains(packagePolicyName).click();

    cy.get('button').contains('Change defaults').click();
    cy.get('[data-test-subj^="advancedStreamOptionsToggle"]').click();
    cy.get('[data-test-subj="packagePolicyDataStreamType"')
      .find('input')
      .should('have.length', 3)
      .each(($el) => cy.wrap($el).should('be.disabled'));
  });

  it('has an index template', () => {
    cy.visit(`app/management/data/index_management/templates/${dataStreamType}-${datasetName}`);

    // Check that the index pattern appears in the view.
    cy.get('[data-test-subj="templateDetails"').contains(`${dataStreamType}-${datasetName}.otel-*`);
  });
});
