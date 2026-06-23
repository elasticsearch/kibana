/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Original test (remove during Scout migration): src/platform/test/functional/apps/discover/group5/_url_state.ts

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const browser = getService('browser');
  const log = getService('log');
  const retry = getService('retry');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const filterBar = getService('filterBar');
  const testSubjects = getService('testSubjects');
  const PageObjects = getPageObjects([
    'common',
    'svlCommonPage',
    'discover',
    'header',
    'timePicker',
    'svlCommonNavigation',
  ]);

  const defaultSettings = {
    defaultIndex: 'logstash-*',
  };

  describe('discover URL state', function () {
    // failsOnMKI, see https://github.com/elastic/kibana/issues/237086
    this.tags(['failsOnMKI']);

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
      await PageObjects.svlCommonPage.loginAsViewer();
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.timePicker.setDefaultAbsoluteRange();
    });

    after(async () => {
      await kibanaServer.savedObjects.clean({ types: ['search', 'index-pattern'] });
    });

    it('should show a warning and fall back to the default data view when navigating to a URL with an invalid data view ID', async () => {
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.timePicker.setDefaultAbsoluteRange();
      await PageObjects.header.waitUntilLoadingHasFinished();
      const dataViewId = await PageObjects.discover.getCurrentDataViewId();
      const originalUrl = await browser.getCurrentUrl();
      const newUrl = originalUrl.replace(dataViewId, 'invalid-data-view-id');
      await browser.get(newUrl);
      await PageObjects.header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        expect(await browser.getCurrentUrl()).to.be(originalUrl);
        expect(await testSubjects.exists('dscDataViewNotFoundShowDefaultWarning')).to.be(true);
      });
    });

    it('should show a warning and fall back to the current data view if the URL is updated to an invalid data view ID', async () => {
      await PageObjects.common.navigateToApp('discover');
      await PageObjects.timePicker.setDefaultAbsoluteRange();
      const originalHash = await browser.execute<[], string>('return window.location.hash');
      const dataViewId = await PageObjects.discover.getCurrentDataViewId();
      const newHash = originalHash.replace(dataViewId, 'invalid-data-view-id');
      await browser.execute(`window.location.hash = "${newHash}"`);
      await PageObjects.header.waitUntilLoadingHasFinished();
      await retry.try(async () => {
        const currentHash = await browser.execute<[], string>('return window.location.hash');
        expect(currentHash).to.be(originalHash);
        expect(await testSubjects.exists('dscDataViewNotFoundShowSavedWarning')).to.be(true);
      });
    });

    describe('Side nav', function () {
      this.tags([
        'skipSvlOblt', // the "Discover" side nav entry does something different in oblt
      ]);

      it('should sync Lens global state to Discover sidebar link and carry over the state when navigating to Discover', async () => {
        await PageObjects.common.navigateToApp('discover');
        await PageObjects.common.navigateToApp('lens');
        // TODO: Sidebar links works differently in Serverless
        let discoverLink = await PageObjects.svlCommonNavigation.sidenav.findLink({
          deepLinkId: 'discover',
        });
        expect(await discoverLink?.getAttribute('href')).to.contain('/app/discover#/');
        expect(await discoverLink?.getAttribute('href')).to.contain(
          '_g=(filters:!(),refreshInterval:(pause:!t,value:60000),time:(from:now-15m,to:now))' +
            "&_a=(dataSource:(dataViewId:'logstash-*',type:dataView),filters:!(),interval:auto,query:(language:kuery,query:''),sort:!(!('@timestamp',desc)))"
        );
        await PageObjects.timePicker.setDefaultAbsoluteRange();
        await filterBar.addFilter({
          field: 'extension.raw',
          operation: 'is one of',
          value: ['jpg', 'css'],
        });
        await filterBar.toggleFilterPinned('extension.raw');
        await PageObjects.header.waitUntilLoadingHasFinished();
        discoverLink = await PageObjects.svlCommonNavigation.sidenav.findLink({
          deepLinkId: 'discover',
        });
        expect(await discoverLink?.getAttribute('href')).to.contain('/app/discover#/');
        expect(await discoverLink?.getAttribute('href')).to.contain(
          "_g=(filters:!(('$state':(store:globalState)," +
            "meta:(alias:!n,disabled:!f,field:extension.raw,index:'logstash-*'," +
            'key:extension.raw,negate:!f,params:!(jpg,css),type:phrases,value:!(jpg,css)),' +
            'query:(bool:(minimum_should_match:1,should:!((match_phrase:(extension.raw:jpg)),' +
            "(match_phrase:(extension.raw:css))))))),query:(language:kuery,query:'')," +
            "refreshInterval:(pause:!t,value:60000),time:(from:'2015-09-19T06:31:44.000Z'," +
            "to:'2015-09-23T18:31:44.000Z'))&_a=(dataSource:(dataViewId:'logstash-*',type:dataView),filters:!()," +
            "interval:auto,query:(language:kuery,query:''),sort:!(!('@timestamp',desc)))"
        );
        await PageObjects.svlCommonNavigation.sidenav.clickLink({ deepLinkId: 'discover' });
        await PageObjects.header.waitUntilLoadingHasFinished();
        expect(await filterBar.hasFilter('extension.raw', '', undefined, true)).to.be(true);
        expect(await filterBar.isFilterPinned('extension.raw')).to.be(true);
        expect(await PageObjects.timePicker.getTimeConfig()).to.eql({
          start: 'Sep 19, 2015 @ 06:31:44.000',
          end: 'Sep 23, 2015 @ 18:31:44.000',
        });
        expect(await PageObjects.discover.getHitCount()).to.be('11,268');
      });
    });
  });
}
