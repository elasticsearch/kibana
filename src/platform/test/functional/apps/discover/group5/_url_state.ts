/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Serverless test (remove during Scout migration): x-pack/platform/test/serverless/functional/test_suites/discover/group5/_url_state.ts

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const deployment = getService('deployment');
  const browser = getService('browser');
  const log = getService('log');
  const retry = getService('retry');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const filterBar = getService('filterBar');
  const testSubjects = getService('testSubjects');
  const appsMenu = getService('appsMenu');
  const dataGrid = getService('dataGrid');
  const { common, discover, header, timePicker, unifiedFieldList } = getPageObjects([
    'common',
    'discover',
    'header',
    'timePicker',
    'unifiedFieldList',
  ]);

  const defaultSettings = {
    defaultIndex: 'logstash-*',
  };

  describe('discover URL state', () => {
    before(async function () {
      log.debug('load kibana index with default index pattern');
      await kibanaServer.importExport.load(
        'src/platform/test/functional/fixtures/kbn_archiver/discover'
      );
      // and load a set of makelogs data
      await esArchiver.loadIfNeeded(
        'src/platform/test/functional/fixtures/es_archiver/logstash_functional'
      );
      await kibanaServer.uiSettings.replace(defaultSettings);
      await common.navigateToApp('discover');
      await timePicker.setDefaultAbsoluteRange();
    });

    after(async () => {
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
    });

    it('should show a warning and fall back to the default data view when navigating to a URL with an invalid data view ID', async () => {
      await common.navigateToApp('discover');
      await timePicker.setDefaultAbsoluteRange();
      await header.waitUntilLoadingHasFinished();
      const dataViewId = await discover.getCurrentDataViewId();
      const originalUrl = await browser.getCurrentUrl();
      const newUrl = originalUrl.replace(dataViewId, 'invalid-data-view-id');
      await browser.get(newUrl);
      await header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        expect(await browser.getCurrentUrl()).to.be(originalUrl);
        expect(await testSubjects.exists('dscDataViewNotFoundShowDefaultWarning')).to.be(true);
      });
    });

    it('should show a warning and fall back to the current data view if the URL is updated to an invalid data view ID', async () => {
      await common.navigateToApp('discover');
      await timePicker.setDefaultAbsoluteRange();
      const originalHash = await browser.execute<[], string>('return window.location.hash');
      const dataViewId = await discover.getCurrentDataViewId();
      const newHash = originalHash.replace(dataViewId, 'invalid-data-view-id');
      await browser.execute(`window.location.hash = "${newHash}"`);
      await header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        const currentHash = await browser.execute<[], string>('return window.location.hash');
        expect(currentHash).to.be(originalHash);
        expect(await testSubjects.exists('dscDataViewNotFoundShowSavedWarning')).to.be(true);
      });
    });

    it('should sync Lens global state to Discover sidebar link and carry over the state when navigating to Discover', async () => {
      await common.navigateToApp('discover');
      await common.navigateToApp('lens');
      await appsMenu.openCollapsibleNav();
      let discoverLink = await appsMenu.getLink('Discover');
      expect(discoverLink?.href).to.contain('/app/discover#/');
      expect(discoverLink?.href).to.contain(
        '_g=(filters:!(),refreshInterval:(pause:!t,value:60000),time:(from:now-15m,to:now))' +
          "&_a=(dataSource:(dataViewId:'logstash-*',type:dataView),filters:!(),interval:auto,query:(language:kuery,query:''),sort:!(!('@timestamp',desc)))"
      );
      await appsMenu.closeCollapsibleNav();
      await timePicker.setDefaultAbsoluteRange();
      await filterBar.addFilter({
        field: 'extension.raw',
        operation: 'is one of',
        value: ['jpg', 'css'],
      });
      await filterBar.toggleFilterPinned('extension.raw');
      await header.waitUntilLoadingHasFinished();
      await appsMenu.openCollapsibleNav();
      discoverLink = await appsMenu.getLink('Discover');
      expect(discoverLink?.href).to.contain('/app/discover#/');
      expect(discoverLink?.href).to.contain(
        "_g=(filters:!(('$state':(store:globalState)," +
          "meta:(alias:!n,disabled:!f,field:extension.raw,index:'logstash-*'," +
          'key:extension.raw,negate:!f,params:!(jpg,css),type:phrases,value:!(jpg,css)),' +
          'query:(bool:(minimum_should_match:1,should:!((match_phrase:(extension.raw:jpg)),' +
          "(match_phrase:(extension.raw:css))))))),query:(language:kuery,query:'')," +
          "refreshInterval:(pause:!t,value:60000),time:(from:'2015-09-19T06:31:44.000Z'," +
          "to:'2015-09-23T18:31:44.000Z'))&_a=(dataSource:(dataViewId:'logstash-*',type:dataView),filters:!()," +
          "interval:auto,query:(language:kuery,query:''),sort:!(!('@timestamp',desc)))"
      );
      await appsMenu.clickLink('Discover', { category: 'kibana' });
      await header.waitUntilLoadingHasFinished();
      expect(await filterBar.hasFilter('extension.raw', '', undefined, true)).to.be(true);
      expect(await filterBar.isFilterPinned('extension.raw')).to.be(true);
      expect(await timePicker.getTimeConfig()).to.eql({
        start: 'Sep 19, 2015 @ 06:31:44.000',
        end: 'Sep 23, 2015 @ 18:31:44.000',
      });
      expect(await discover.getHitCount()).to.be('11,268');
    });

    it('should merge custom global filters with saved search filters', async () => {
      await kibanaServer.uiSettings.update({
        'timepicker:timeDefaults':
          '{  "from": "Sep 18, 2015 @ 19:37:13.000",  "to": "Sep 23, 2015 @ 02:30:09.000"}',
      });
      await common.navigateToApp('discover');

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      await filterBar.addFilter({
        field: 'bytes',
        operation: 'is between',
        value: { from: '1000', to: '2000' },
      });
      await unifiedFieldList.clickFieldListItemAdd('extension');
      await unifiedFieldList.clickFieldListItemAdd('bytes');

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      const totalHitsForOneFilter = '737';
      const totalHitsForTwoFilters = '137';

      expect(await discover.getHitCount()).to.be(totalHitsForOneFilter);

      await discover.saveSearch('testFilters');

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      expect(await discover.getHitCount()).to.be(totalHitsForOneFilter);

      await browser.refresh();

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      expect(await discover.getHitCount()).to.be(totalHitsForOneFilter);

      const url = await browser.getCurrentUrl();
      const savedSearchIdMatch = url.match(/view\/([^?]+)\?/);
      const savedSearchId = savedSearchIdMatch?.length === 2 ? savedSearchIdMatch[1] : null;

      expect(typeof savedSearchId).to.be('string');

      await browser.openNewTab();
      await browser.get(`${deployment.getHostPort()}/app/discover#/view/${savedSearchId}`);

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      expect((await dataGrid.getRowsText()).slice(0, 6)).to.eql([
        'Sep 22, 2015 @ 20:44:05.521jpg1,808',
        'Sep 22, 2015 @ 20:41:53.463png1,969',
        'Sep 22, 2015 @ 20:40:22.952jpg1,576',
        'Sep 22, 2015 @ 20:11:39.532png1,708',
        'Sep 22, 2015 @ 19:45:13.813php1,406',
        'Sep 22, 2015 @ 19:40:17.903jpg1,557',
      ]);

      expect(await discover.getHitCount()).to.be(totalHitsForOneFilter);

      await browser.openNewTab();
      await browser.get(
        `${deployment.getHostPort()}/app/discover#/view/${savedSearchId}` +
          "?_g=(filters:!(('$state':(store:globalState)," +
          "meta:(alias:!n,disabled:!f,field:extension.raw,index:'logstash-*'," +
          'key:extension.raw,negate:!f,params:!(png,css),type:phrases,value:!(png,css)),' +
          'query:(bool:(minimum_should_match:1,should:!((match_phrase:(extension.raw:png)),' +
          "(match_phrase:(extension.raw:css))))))),query:(language:kuery,query:'')," +
          "refreshInterval:(pause:!t,value:60000),time:(from:'2015-09-19T06:31:44.000Z'," +
          "to:'2015-09-23T18:31:44.000Z'))"
      );

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      const filteredRows = [
        'Sep 22, 2015 @ 20:41:53.463png1,969',
        'Sep 22, 2015 @ 20:11:39.532png1,708',
        'Sep 22, 2015 @ 18:50:22.335css1,841',
        'Sep 22, 2015 @ 18:40:32.329css1,945',
        'Sep 22, 2015 @ 18:13:35.361css1,752',
        'Sep 22, 2015 @ 17:22:12.782css1,583',
      ];

      expect((await dataGrid.getRowsText()).slice(0, 6)).to.eql(filteredRows);
      expect(await discover.getHitCount()).to.be(totalHitsForTwoFilters);
      await discover.ensureHasUnsavedChangesIndicator();

      await browser.refresh();

      await header.waitUntilLoadingHasFinished();
      await discover.waitUntilSearchingHasFinished();

      expect((await dataGrid.getRowsText()).slice(0, 6)).to.eql(filteredRows);
      expect(await discover.getHitCount()).to.be(totalHitsForTwoFilters);
      await discover.ensureHasUnsavedChangesIndicator();
    });
  });
}
