/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test } from './fixtures/base_page';
import { assertEnv } from '../lib/assert_env';
import { OtelKubernetesOverviewDashboardPage } from './pom/pages/otel_kubernetes_overview_dashboard.page';
import { ApmServiceInventoryPage } from './pom/pages/apm_service_inventory.page';
import { assertDiscoverHasData } from '../lib/validation_helpers';

/**
 * In case you need to run this test locally, you can use https://github.com/elastic/oblt-reference-stack
 * to spin up a local k8s cluster with the required resources.
 */

test.beforeEach(async ({ page, onboardingHomePage }) => {
  await page.goto(`${process.env.KIBANA_BASE_URL}/app/observabilityOnboarding`);
  await onboardingHomePage.maybeClickIntroducingAIAgentModalContinueBtn();
});

/**
 * These constants are used by Ensemble test
 * when creating the app container. They should
 * be kept in sync.
 */
const INSTRUMENTED_APP_CONTAINER_NAMESPACE = 'java';
const INSTRUMENTED_APP_NAME = 'java-app';

test('Otel Kubernetes', async ({ page, onboardingHomePage, otelKubernetesFlowPage }) => {
  assertEnv(process.env.ARTIFACTS_FOLDER, 'ARTIFACTS_FOLDER is not defined.');

  const isLogsEssentialsMode = process.env.LOGS_ESSENTIALS_MODE === 'true';
  const fileName = 'code_snippet_otel_kubernetes.sh';
  const outputPath = path.join(__dirname, '..', process.env.ARTIFACTS_FOLDER, fileName);

  await onboardingHomePage.selectKubernetesUseCase();
  await onboardingHomePage.selectOtelKubernetesQuickstart();

  const helmRepoSnippet = (await otelKubernetesFlowPage.getHelmRepositorySnippet()) ?? '';

  await otelKubernetesFlowPage.copyInstallStackSnippetToClipboard();
  const installStackSnippet = (await page.evaluate('navigator.clipboard.readText()')) as string;

  let codeSnippet: string;

  if (!isLogsEssentialsMode) {
    /**
     * Getting the snippets and replacing placeholder
     * with the values used by Ensemble
     */
    await otelKubernetesFlowPage.switchInstrumentationInstructions('java');
    await otelKubernetesFlowPage.selectNamespaceInstrumentationInstructions();
    const annotateAllResourceSnippet = (
      await otelKubernetesFlowPage.getAnnotateAllResourceSnippet()
    )?.replace('my-namespace', INSTRUMENTED_APP_CONTAINER_NAMESPACE);
    const restartDeploymentSnippet = (await otelKubernetesFlowPage.getRestartDeploymentSnippet())
      ?.split('\n')[0]
      ?.replace('myapp', INSTRUMENTED_APP_NAME)
      ?.replace('my-namespace', INSTRUMENTED_APP_CONTAINER_NAMESPACE);
    /**
     * Adding timeout so Ensemble waits for the
     * pods to be created before instrumenting the app
     */
    const sleepSnippet = `sleep 120`;

    codeSnippet = `${helmRepoSnippet}\n${installStackSnippet}\n${sleepSnippet}\n${annotateAllResourceSnippet}\n${restartDeploymentSnippet}`;
  } else {
    codeSnippet = `${helmRepoSnippet}\n${installStackSnippet}`;
  }

  /**
   * Ensemble story watches for the code snippet file
   * to be created and then executes it
   */
  fs.writeFileSync(outputPath, codeSnippet);

  /**
   * The page waits for the browser window to lose
   * focus as a signal to start checking for incoming data
   */
  await page.evaluate('window.dispatchEvent(new Event("blur"))');

  /**
   * Wait for the data received indicator to appear.
   * The flow now uses DataIngestStatus which polls for data
   * after the blur event and shows "We are monitoring your cluster"
   * once both logs and metrics have arrived.
   */
  await otelKubernetesFlowPage.assertDataReceivedIndicator();

  /**
   * Additional buffer to ensure data has propagated
   * to dashboards and Discover before navigating.
   */
  await page.waitForTimeout(2 * 60000);

  if (!isLogsEssentialsMode) {
    const otelKubernetesOverviewDashboardPage = new OtelKubernetesOverviewDashboardPage(
      await otelKubernetesFlowPage.openClusterOverviewDashboardInNewTab()
    );

    await otelKubernetesOverviewDashboardPage.assertNodesPanelNotEmpty();

    const apmServiceName = 'opentelemetry/java/elastic';
    const apmProbePath = path.join(
      __dirname,
      '..',
      process.env.ARTIFACTS_FOLDER,
      'apm_service_probes.json'
    );
    const apmServiceCalls: Array<{
      tMs: number;
      status: number;
      requestUrl: string;
      services: Array<{ service: string; agent: string; transactionType: string }>;
      errorBody?: string;
    }> = [];

    try {
      // Open the inventory in a new tab manually so the response listener is
      // attached before navigation. page.on('response') only catches future
      // events, and the inventory's mount-fetch fires immediately on goto.
      const serviceInventoryHref = await page
        .getByTestId('observabilityOnboardingDataIngestStatusActionLink-services')
        .getAttribute('href');
      if (!serviceInventoryHref) {
        throw new Error('Service inventory URL not found');
      }

      const apmStartedAt = Date.now();
      const apmPage = await page.context().newPage();
      apmPage.on('response', async (response) => {
        // Match only the top-level list endpoint, not /internal/apm/services/foo/...
        const url = new URL(response.url());
        if (url.pathname !== '/internal/apm/services') return;
        const status = response.status();
        let services: Array<{ service: string; agent: string; transactionType: string }> = [];
        let errorBody: string | undefined;
        if (status >= 400) {
          try {
            errorBody = (await response.text()).slice(0, 1000);
          } catch {
            errorBody = '<read-failed>';
          }
        } else {
          try {
            const json = (await response.json()) as {
              items?: Array<{
                serviceName?: string;
                agentName?: string;
                transactionType?: string;
              }>;
              services?: Array<{
                serviceName?: string;
                agentName?: string;
                transactionType?: string;
              }>;
            };
            const items = json.items ?? json.services ?? [];
            services = items.map((item) => ({
              service: item?.serviceName ?? '<missing>',
              agent: item?.agentName ?? '<missing>',
              transactionType: item?.transactionType ?? '<missing>',
            }));
          } catch {
            // leave services empty
          }
        }
        apmServiceCalls.push({
          tMs: Date.now() - apmStartedAt,
          status,
          requestUrl: response.url(),
          services,
          ...(errorBody !== undefined ? { errorBody } : {}),
        });
      });
      await apmPage.goto(serviceInventoryHref);
      const apmServiceInventoryPage = new ApmServiceInventoryPage(apmPage);

      const serviceTestId = `serviceLink_${apmServiceName}`;

      await apmServiceInventoryPage.waitForServiceRow(serviceTestId);
      await apmServiceInventoryPage.page.getByTestId(serviceTestId).click();
      await apmServiceInventoryPage.assertTransactionExists();
    } finally {
      try {
        fs.writeFileSync(
          apmProbePath,
          JSON.stringify({ serviceName: apmServiceName, calls: apmServiceCalls }, null, 2)
        );
      } catch {
        // best-effort - don't mask the original test failure
      }
    }
  } else {
    await otelKubernetesFlowPage.clickExploreLogsCTA();
    await assertDiscoverHasData(page);
  }
});
