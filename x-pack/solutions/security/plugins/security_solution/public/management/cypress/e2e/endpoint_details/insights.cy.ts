/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createBedrockAIConnector,
  deleteConnectors,
  expectDefendInsightsApiToBeCalled,
  expectPostDefendInsightsApiToBeCalled,
  expectWorkflowInsightsApiToBeCalled,
  interceptGetDefendInsightsApiCall,
  interceptGetWorkflowInsightsApiCall,
  interceptPostDefendInsightsApiCall,
  setConnectorIdInLocalStorage,
  stubDefendInsightsApiResponse,
  stubPutWorkflowInsightsApiResponse,
  stubWorkflowInsightsApiResponse,
  validateUserGotRedirectedToEndpointDetails,
  validateUserGotRedirectedToTrustedApps,
} from '../../tasks/insights';
import { loadEndpointDetailsFlyout, workflowInsightsSelectors } from '../../screens/insights';
import { indexEndpointHosts, type CyIndexEndpointHosts } from '../../tasks/index_endpoint_hosts';
import { login } from '../../tasks/login';

const {
  addConnectorButtonExists,
  insightsComponentExists,
  chooseConnectorButtonExistsWithLabel,
  selectConnector,
  clickScanButton,
  insightsResultExists,
  nInsightResultsExist,
  insightsEmptyResultsCalloutDoesNotExist,
  clickInsightsResultRemediationButton,
  scanButtonShouldBe,
  clickTrustedAppFormSubmissionButton,
  validateErrorToastContent,
} = workflowInsightsSelectors;

// legacy path tests, intentionally skipping instead of deleting until new skill based path is confirmed stable
describe.skip(
  'Workflow Insights',
  {
    tags: ['@ess', '@serverless', '@skipInServerlessMKI'],
  },
  () => {
    const connectorName = 'TEST-CONNECTOR';
    let loadedEndpoint: CyIndexEndpointHosts;
    let endpointId: string;

    // Since the endpoint is used only for displaying details flyout, we can use the same endpoint for all tests
    before(() => {
      indexEndpointHosts({ count: 1 }).then((indexedEndpoint) => {
        loadedEndpoint = indexedEndpoint;
        endpointId = indexedEndpoint.data.hosts[0].agent.id;
      });
    });

    after(() => {
      if (loadedEndpoint) {
        loadedEndpoint.cleanup();
      }
    });

    beforeEach(() => {
      login();
    });

    it('should render Insights section on endpoint flyout with option to define connectors', () => {
      loadEndpointDetailsFlyout(endpointId);
      insightsComponentExists();
      addConnectorButtonExists();
    });

    // FLAKY: https://github.com/elastic/kibana/issues/242402
    describe.skip('Workflow Insights first visit', () => {
      let connectorId: string | undefined;
      beforeEach(() => {
        createBedrockAIConnector(connectorName).then((response) => {
          connectorId = response.body.id;
        });
      });

      afterEach(() => {
        deleteConnectors();
        connectorId = undefined;
      });

      it('should properly initialize workflow insights for the first time', () => {
        interceptGetWorkflowInsightsApiCall();
        interceptGetDefendInsightsApiCall();

        loadEndpointDetailsFlyout(endpointId);

        expectDefendInsightsApiToBeCalled();

        chooseConnectorButtonExistsWithLabel('Select a connector');
        selectConnector(connectorId);
        chooseConnectorButtonExistsWithLabel(connectorName);

        scanButtonShouldBe('enabled');
      });

      it('should display an error toast if connector was created with invalid tokens', () => {
        const failureReason = 'Invalid token';
        loadEndpointDetailsFlyout(endpointId);

        chooseConnectorButtonExistsWithLabel('Select a connector');
        selectConnector(connectorId);
        chooseConnectorButtonExistsWithLabel(connectorName);
        stubDefendInsightsApiResponse({ status: 'failed', failureReason }, { times: 1 });

        clickScanButton();

        validateErrorToastContent(failureReason);
        scanButtonShouldBe('enabled');
      });
    });

    describe('Workflow Insights consequent visit', () => {
      beforeEach(() => {
        createBedrockAIConnector(connectorName).then(setConnectorIdInLocalStorage);
      });

      afterEach(() => {
        deleteConnectors();
      });

      it('should properly initialize workflow insights with a connector already defined', () => {
        loadEndpointDetailsFlyout(endpointId);
        chooseConnectorButtonExistsWithLabel(connectorName);
        scanButtonShouldBe('enabled');
      });

      it('should disable Scan button if there is an ongoing scan', () => {
        stubDefendInsightsApiResponse();
        loadEndpointDetailsFlyout(endpointId);
        scanButtonShouldBe('disabled');
      });

      it('should trigger insight generation on Scan button click', () => {
        interceptPostDefendInsightsApiCall();
        stubDefendInsightsApiResponse({
          status: 'succeeded',
          insights: [],
        });
        interceptGetWorkflowInsightsApiCall();

        loadEndpointDetailsFlyout(endpointId);
        clickScanButton();
        scanButtonShouldBe('disabled');

        stubDefendInsightsApiResponse({
          status: 'succeeded',
          insights: [{ events: [{}] }],
        });

        expectPostDefendInsightsApiToBeCalled();
        expectDefendInsightsApiToBeCalled();
        expectWorkflowInsightsApiToBeCalled();
      });

      it('should requery until all expected insights are received', () => {
        interceptPostDefendInsightsApiCall();
        stubDefendInsightsApiResponse({
          status: 'succeeded',
          insights: [],
        });

        loadEndpointDetailsFlyout(endpointId);
        clickScanButton();
        scanButtonShouldBe('disabled');

        // defend insights is 3 but workflow insights is 0
        stubDefendInsightsApiResponse({
          status: 'succeeded',
          insights: [
            {
              events: [{}, {}],
            },
            {
              events: [{}],
            },
          ],
        });
        stubWorkflowInsightsApiResponse(endpointId, 0);

        expectPostDefendInsightsApiToBeCalled();
        expectDefendInsightsApiToBeCalled();
        expectWorkflowInsightsApiToBeCalled();
        scanButtonShouldBe('disabled');

        // should be called again since workflow insights is still 0
        expectWorkflowInsightsApiToBeCalled();
        insightsEmptyResultsCalloutDoesNotExist();
        scanButtonShouldBe('disabled');

        // workflow insights is now 3
        stubWorkflowInsightsApiResponse(endpointId, 3);

        // insights should be displayed now
        expectWorkflowInsightsApiToBeCalled();
        nInsightResultsExist(3);
        scanButtonShouldBe('enabled');

        // ensure that GET workflow insights is not called again
        cy.get('@getWorkflowInsights.all').its('length').as('getWorkflowInsightsRequestCount');
        // eslint-disable-next-line cypress/no-unnecessary-waiting
        cy.wait(3000);
        cy.get('@getWorkflowInsights.all').then(($requests) => {
          cy.get('@getWorkflowInsightsRequestCount').then((initialCount) => {
            expect($requests.length).to.equal(initialCount);
          });
        });
      });

      it('should render existing Insights', () => {
        stubDefendInsightsApiResponse({
          status: 'succeeded',
          insights: [
            {
              events: [{}],
            },
          ],
        });
        stubWorkflowInsightsApiResponse(endpointId);

        loadEndpointDetailsFlyout(endpointId);

        insightsResultExists();

        insightsEmptyResultsCalloutDoesNotExist();
        clickInsightsResultRemediationButton();

        validateUserGotRedirectedToTrustedApps();

        // Fill in the trusted apps form to enable submit button
        cy.getByTestSubj('trustedApps-form-nameTextField').type('Test Trusted App');
        cy.getByTestSubj('trustedApps-form-descriptionField').type(
          'Test Description for trusted app'
        );
        cy.getByTestSubj('trustedApps-form-conditionsBuilder-group1-entry0-value').type(
          'A4370C0CF81686C0B696FA6261c9d3e0d810ae704ab8301839dffd5d5112f476'
        );

        stubPutWorkflowInsightsApiResponse();
        clickTrustedAppFormSubmissionButton();
        validateUserGotRedirectedToEndpointDetails(endpointId);
      });
    });
  }
);
