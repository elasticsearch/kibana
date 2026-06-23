/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ObltPageObjects,
  ObltTestFixtures,
  ObltWorkerFixtures,
  ObltApiServicesFixture,
  EsClient,
  KibanaUrl,
  ScoutLogger,
  ScoutTestConfig,
} from '@kbn/scout-oblt';
import {
  mergeTests,
  test as base,
  createLazyPageObject,
  globalSetupHook as baseGlobalSetupHook,
  globalTeardownHook as baseGlobalTeardownHook,
} from '@kbn/scout-oblt';
import type { SynthtraceFixture } from '@kbn/scout-synthtrace';
import { getSynthtraceClient, synthtraceFixture } from '@kbn/scout-synthtrace';
import type { InfraDocument, SynthtraceGenerator } from '@kbn/synthtrace-client';
import { Readable } from 'stream';
import { InventoryPage } from './page_objects/inventory';
import { AssetDetailsPage } from './page_objects/asset_details/asset_details';
import { HostsPage } from './page_objects/hosts_page';
import { getInventoryViewsApiService, type InventoryViewApiService } from './apis/inventory_views';
import { NodeDetailsPage } from './page_objects/node_details/node_details';
import { SavedViews } from './page_objects/saved_views';

export interface ExtendedScoutTestFixtures extends ObltTestFixtures {
  pageObjects: ObltPageObjects & {
    inventoryPage: InventoryPage;
    assetDetailsPage: AssetDetailsPage;
    hostsPage: HostsPage;
    nodeDetailsPage: NodeDetailsPage;
    savedViews: SavedViews;
  };
}

export interface ExtendedScoutWorkerFixtures extends ObltWorkerFixtures {
  apiServices: ObltApiServicesFixture & {
    inventoryViews: InventoryViewApiService;
    nodeDetailsPage: NodeDetailsPage;
  };
}

const baseWithSynthtrace = mergeTests(base, synthtraceFixture);

export const test = baseWithSynthtrace.extend<
  ExtendedScoutTestFixtures,
  ExtendedScoutWorkerFixtures & SynthtraceFixture
>({
  pageObjects: async (
    { pageObjects, page, kbnUrl },
    use: (pageObjects: ExtendedScoutTestFixtures['pageObjects']) => Promise<void>
  ) => {
    const savedViews = createLazyPageObject(SavedViews, page);

    const extendedPageObjects = {
      ...pageObjects,
      inventoryPage: createLazyPageObject(InventoryPage, page, kbnUrl, savedViews),
      assetDetailsPage: createLazyPageObject(AssetDetailsPage, page, kbnUrl),
      hostsPage: createLazyPageObject(HostsPage, page, kbnUrl),
      nodeDetailsPage: createLazyPageObject(NodeDetailsPage, page, kbnUrl),
      savedViews,
    };

    await use(extendedPageObjects);
  },
  apiServices: async (
    { apiServices, kbnClient, log },
    use: (apiServices: ExtendedScoutWorkerFixtures['apiServices']) => Promise<void>
  ) => {
    const extendedApiServices: ExtendedScoutWorkerFixtures['apiServices'] = {
      ...apiServices,
      inventoryViews: getInventoryViewsApiService({
        kbnClient,
        log,
      }),
    };

    await use(extendedApiServices);
  },
});

interface InfraSynthtraceEsClient {
  index: (events: SynthtraceGenerator<InfraDocument>) => Promise<void>;
  clean: () => Promise<void>;
}

// Single source of truth for the infra synthtrace client, shared by both the
// global setup and teardown hooks so the client configuration only lives in one place.
const provideInfraSynthtraceEsClient = async (
  {
    esClient,
    config,
    kbnUrl,
    log,
  }: { esClient: EsClient; config: ScoutTestConfig; kbnUrl: KibanaUrl; log: ScoutLogger },
  use: (client: InfraSynthtraceEsClient) => Promise<void>
) => {
  const { infraEsClient } = await getSynthtraceClient(
    'infraEsClient',
    {
      esClient,
      kbnUrl: kbnUrl.get(),
      log,
      config,
    },
    // Metrics system indexes are TSDS and thus, time bound.
    // In order to have fixed dates in the tests, we need to skip the system package installation so that the TSDS configuration doesn't get applied.
    // Otherwise, time-bound indexes will reject documents outside their time range, which depends on the time the test is being ran, making them less deterministic.
    { skipInstallation: true }
  );

  const index = async (events: SynthtraceGenerator<InfraDocument>) => {
    await infraEsClient.index(Readable.from(Array.from(events)));
  };

  const clean = async () => await infraEsClient.clean();

  await use({ index, clean });
};

const globalSetupWithSynthtrace = mergeTests(baseGlobalSetupHook, synthtraceFixture);

export const globalSetupHook = globalSetupWithSynthtrace.extend({
  infraSynthtraceEsClient: provideInfraSynthtraceEsClient,
});

const globalTeardownWithSynthtrace = mergeTests(baseGlobalTeardownHook, synthtraceFixture);

export const globalTeardownHook = globalTeardownWithSynthtrace.extend({
  infraSynthtraceEsClient: provideInfraSynthtraceEsClient,
});
