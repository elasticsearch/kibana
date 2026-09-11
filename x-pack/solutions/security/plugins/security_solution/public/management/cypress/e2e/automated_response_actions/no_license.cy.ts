/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { navigateToAlertsList } from '../../screens/alerts';
import { closeAllToasts } from '../../tasks/toasts';
import { fillUpNewRule } from '../../tasks/response_actions';
import { login, ROLE } from '../../tasks/login';
import { generateRandomStringName } from '../../tasks/utils';
import type { ReturnTypeFromChainable } from '../../types';
import { indexEndpointHosts } from '../../tasks/index_endpoint_hosts';
import { indexEndpointRuleAlerts } from '../../tasks/index_endpoint_rule_alerts';

describe('No License', { tags: '@ess', env: { ftrConfig: { license: 'basic' } } }, () => {
  describe('User cannot use endpoint action in form', () => {
    const [ruleName, ruleDescription] = generateRandomStringName(2);

    beforeEach(() => {
      login(ROLE.endpoint_response_actions_access);
    });

    it('response actions are disabled', () => {
      fillUpNewRule(ruleName, ruleDescription);
      cy.getByTestSubj('response-actions-wrapper').within(() => {
        cy.getByTestSubj('Elastic Defend-response-action-type-selection-option').should(
          'be.disabled'
        );
      });
    });
  });

  describe('User cannot see results', () => {
    let endpointData: ReturnTypeFromChainable<typeof indexEndpointHosts> | undefined;
    let alertData: ReturnTypeFromChainable<typeof indexEndpointRuleAlerts> | undefined;
    const [endpointAgentId, endpointHostname] = generateRandomStringName(2);
    beforeEach(() => {
      login();
      indexEndpointRuleAlerts({
        endpointAgentId,
        endpointHostname,
        endpointIsolated: false,
      }).then((indexedAlert) => {
        alertData = indexedAlert;
        const alertId = alertData.alerts[0]._id;
        return indexEndpointHosts({
          withResponseActions: true,
          numResponseActions: 1,
          alertIds: [alertId],
        }).then((indexEndpoints) => {
          endpointData = indexEndpoints;
        });
      });
    });

    afterEach(() => {
      if (endpointData) {
        endpointData.cleanup();
        endpointData = undefined;
      }

      if (alertData) {
        alertData.cleanup();
        alertData = undefined;
      }
    });

    it('show the permission denied callout', () => {
      navigateToAlertsList(`query=(language:kuery,query:'agent.id: "${endpointAgentId}" ')`);
      closeAllToasts();
      cy.getByTestSubj('expand-event').first().click();
      cy.getByTestSubj('securitySolutionFlyoutNavigationExpandDetailButton').click();
      cy.getByTestSubj('securitySolutionFlyoutResponseTab').click();
      cy.contains('Permission denied');
      cy.contains(
        'To access these results, ask your administrator for Elastic Defend Kibana privileges.'
      );
    });
  });
});
