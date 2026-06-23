/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

/**
 * Purpose: Verify map loads unified search from saved object
 *
 * Migration: migrate to unit tests for x-pack/platform/plugins/shared/maps/public/routes/map_page/map_app/map_app.tsx
 */
export default function ({ getPageObjects, getService }) {
  const { maps, timePicker } = getPageObjects(['maps', 'timePicker']);
  const queryBar = getService('queryBar');
  const filterBar = getService('filterBar');
  const browser = getService('browser');
  const inspector = getService('inspector');
  const security = getService('security');

  describe('map saved object management', () => {
    const MAP_NAME_PREFIX = 'saved_object_management_test_';
    const MAP1_NAME = `${MAP_NAME_PREFIX}map1`;
    const MAP2_NAME = `${MAP_NAME_PREFIX}map2`;

    describe('read', () => {
      let joinMapUrl = '';
      before(async () => {
        await security.testUser.setRoles([
          'global_maps_all',
          'geoshape_data_reader',
          'meta_for_geoshape_data_reader',
          'test_logstash_reader',
        ]);
        await maps.loadSavedMap('join example');
        joinMapUrl = await browser.getCurrentUrl();
      });
      after(async () => {
        await security.testUser.restoreDefaults();
      });

      it('should update global Kibana time to value stored with map', async () => {
        const timeConfig = await timePicker.getTimeConfig();
        // Legacy picker shows the humanised label; new picker returns the raw
        // dateMath from data-date-range (with optional rounding suffix from
        // roundRelativeTime).
        expect(timeConfig.start).to.match(/^~ 17 minutes ago$|^now-17m(\/m)?$/);
        expect(timeConfig.end).to.equal('now');
      });

      it('should update global Kibana refresh config to value stored with map', async () => {
        const kibanaRefreshConfig = await timePicker.getRefreshConfig();
        expect(kibanaRefreshConfig.interval).to.equal('1');
        expect(kibanaRefreshConfig.units).to.equal('Seconds');
        expect(kibanaRefreshConfig.isPaused).to.equal(true);
      });

      it('should set map location to value stored with map', async () => {
        const { lat, lon, zoom } = await maps.getView();
        expect(lat).to.equal(-0.04647);
        expect(lon).to.equal(77.33426);
        expect(zoom).to.equal(3.02);
      });

      it('should load map layers stored with map', async () => {
        const layerExists = await maps.doesLayerExist('geo_shapes*');
        expect(layerExists).to.equal(true);
      });

      it('should override time stored with map when query is provided in global state', async () => {
        const urlSplit = joinMapUrl.split('?');
        const globalState = `_g=(time:(from:now-36m,to:now))`;
        await browser.get(`${urlSplit[0]}?${globalState}`, true);
        await maps.waitForLayersToLoad();

        const timeConfig = await timePicker.getTimeConfig();
        expect(timeConfig.start).to.match(/^~ 36 minutes ago$|^now-36m(\/m)?$/);
        expect(timeConfig.end).to.equal('now');
      });

      describe('mapState contains query', () => {
        before(async () => {
          await maps.loadSavedMap('document example with query');
        });

        it('should update query bar with query stored with map', async () => {
          const query = await queryBar.getQueryString();
          expect(query).to.equal('machine.os.raw : "ios"');
        });

        it('should update app state with query stored with map', async () => {
          const currentUrl = await browser.getCurrentUrl();
          const appState = currentUrl.substring(currentUrl.indexOf('_a='));
          expect(appState).to.equal(
            '_a=(filters:!(),query:(language:kuery,query:%27machine.os.raw%20:%20%22ios%22%27))'
          );
        });

        it('should apply query stored with map', async () => {
          await inspector.open();
          await inspector.openInspectorRequestsView();
          const requestStats = await inspector.getTableData();
          const hits = maps.getInspectorStatRowHit(requestStats, 'Hits');
          await inspector.close();
          expect(hits).to.equal('1');
        });

        it('should override query stored with map when query is provided in app state', async () => {
          const currentUrl = await browser.getCurrentUrl();
          const kibanaBaseUrl = currentUrl.substring(0, currentUrl.indexOf('/maps/'));
          const appState = `_a=(query:(language:kuery,query:'machine.os.raw%20:%20"win%208"'))`;
          const urlWithQueryInAppState = `${kibanaBaseUrl}/maps/map/8eabdab0-144f-11e9-809f-ad25bb78262c#?${appState}`;

          await browser.get(urlWithQueryInAppState, true);
          await maps.waitForLayersToLoad();

          const query = await queryBar.getQueryString();
          expect(query).to.equal('machine.os.raw : "win 8"');

          await inspector.open();
          await inspector.openInspectorRequestsView();
          const requestStats = await inspector.getTableData();
          await inspector.close();
          const hits = maps.getInspectorStatRowHit(requestStats, 'Hits');
          expect(hits).to.equal('1');
        });
      });

      describe('mapState contains filters', () => {
        before(async () => {
          await maps.loadSavedMap('document example with filter');
        });

        it('should update filter bar with filters stored with map', async () => {
          const hasSourceFilter = await filterBar.hasFilter('machine.os.raw', 'ios');
          expect(hasSourceFilter).to.be(true);
        });

        it('should update app state with query stored with map', async () => {
          const currentUrl = await browser.getCurrentUrl();
          const appState = currentUrl.substring(currentUrl.indexOf('_a='));
          expect(appState).to.equal(
            '_a=(filters:!((%27$state%27:(store:appState),meta:(alias:!n,disabled:!f,index:c698b940-e149-11e8-a35a-370a8516603a,key:machine.os.raw,negate:!f,params:(query:ios),type:phrase),query:(match_phrase:(machine.os.raw:(query:ios))))),query:(language:kuery,query:%27%27))'
          );
        });

        it('should apply query stored with map', async () => {
          await inspector.open();
          await inspector.openInspectorRequestsView();
          const requestStats = await inspector.getTableData();
          const hits = maps.getInspectorStatRowHit(requestStats, 'Hits');
          await inspector.close();
          expect(hits).to.equal('1');
        });
      });
    });

    describe('create', () => {
      it('should allow saving map', async () => {
        await maps.openNewMap();

        await maps.saveMap(MAP1_NAME);

        await maps.searchAndExpectItemsCount(MAP1_NAME, 1);
      });

      it('should allow saving map that crosses dateline', async () => {
        await maps.openNewMap();
        await maps.setView('64', '179', '5');

        await maps.saveMap(MAP2_NAME);

        await maps.searchAndExpectItemsCount(MAP2_NAME, 1);
      });
    });

    describe('delete', () => {
      it('should delete selected saved objects', async () => {
        await maps.deleteSavedMaps(MAP_NAME_PREFIX);

        await maps.searchAndExpectItemsCount(MAP1_NAME, 0);

        await maps.searchAndExpectItemsCount(MAP2_NAME, 0);
      });
    });
  });
}
