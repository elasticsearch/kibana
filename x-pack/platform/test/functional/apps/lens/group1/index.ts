/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsArchiver } from '@kbn/es-archiver';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default ({ getService, loadTestFile, getPageObjects }: FtrProviderContext) => {
  const browser = getService('browser');
  const log = getService('log');
  const esArchiver = getService('esArchiver');
  const kibanaServer = getService('kibanaServer');
  const { timePicker } = getPageObjects(['timePicker']);
  const config = getService('config');
  let remoteEsArchiver;

  describe('lens app - group 1', () => {
    const esArchive = 'x-pack/platform/test/fixtures/es_archives/logstash_functional';
    const localIndexPatternString = 'logstash-*';
    const remoteIndexPatternString = 'ftr-remote:logstash-*';
    const localFixtures = {
      lensBasic: 'x-pack/platform/test/functional/fixtures/kbn_archives/lens/lens_basic.json',
      lensDefault: 'x-pack/platform/test/functional/fixtures/kbn_archives/lens/default',
    };

    const remoteFixtures = {
      lensBasic: 'x-pack/platform/test/functional/fixtures/kbn_archives/lens/ccs/lens_basic.json',
      lensDefault: 'x-pack/platform/test/functional/fixtures/kbn_archives/lens/ccs/default',
    };
    let esNode: EsArchiver;
    let fixtureDirs: {
      lensBasic: string;
      lensDefault: string;
    };
    let indexPatternString: string;
    before(async () => {
      log.debug('Starting lens before method');
      await browser.setWindowSize(1280, 1200);
      await kibanaServer.savedObjects.cleanStandardList();
      try {
        config.get('esTestCluster.ccs');
        remoteEsArchiver = getService('remoteEsArchiver' as 'esArchiver');
        esNode = remoteEsArchiver;
        fixtureDirs = remoteFixtures;
        indexPatternString = remoteIndexPatternString;
      } catch (error) {
        esNode = esArchiver;
        fixtureDirs = localFixtures;
        indexPatternString = localIndexPatternString;
      }

      await esNode.load(esArchive);
      // changing the timepicker default here saves us from having to set it in Discover (~8s)
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();
      await kibanaServer.uiSettings.update({
        defaultIndex: indexPatternString,
        'dateFormat:tz': 'UTC',
      });
      await kibanaServer.importExport.load(fixtureDirs.lensBasic);
      await kibanaServer.importExport.load(fixtureDirs.lensDefault);
    });

    const loadSmokescreenTestFiles = () => {
      loadTestFile(require.resolve('./chart_creation'));
      loadTestFile(require.resolve('./chart_switching'));
      loadTestFile(require.resolve('./layers'));
      loadTestFile(require.resolve('./dimension_editor'));
      loadTestFile(require.resolve('./chart_style_settings'));
    };

    if (config.get('esTestCluster.ccs')) {
      loadSmokescreenTestFiles();
    } else {
      // total run time ~16 min
      loadSmokescreenTestFiles(); // smokescreen split, previously ~12m 12s
      loadTestFile(require.resolve('./ad_hoc_data_view')); // 3m 40s
      loadTestFile(require.resolve('./multiple_data_views'));
      loadTestFile(require.resolve('./inspector_pagination'));
    }
  });
};
