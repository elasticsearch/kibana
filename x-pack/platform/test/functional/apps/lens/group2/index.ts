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

  describe('lens app - group 2', () => {
    const esArchive = 'x-pack/platform/test/fixtures/es_archives/logstash_functional';
    const localIndexPatternString = 'logstash-*';
    const localFixtures = {
      lensBasic: 'x-pack/platform/test/functional/fixtures/kbn_archives/lens/lens_basic.json',
      lensDefault: 'x-pack/platform/test/functional/fixtures/kbn_archives/lens/default',
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
      esNode = esArchiver;
      fixtureDirs = localFixtures;
      indexPatternString = localIndexPatternString;
      await esNode.load(esArchive);
      await kibanaServer.uiSettings.update({
        defaultIndex: indexPatternString,
        'dateFormat:tz': 'UTC',
      });
      await kibanaServer.importExport.load(fixtureDirs.lensBasic);
      await kibanaServer.importExport.load(fixtureDirs.lensDefault);
      await timePicker.setDefaultAbsoluteRangeViaUiSettings();
    });

    // total run time ~ 16m 20s
    loadTestFile(require.resolve('./partition')); // 1m 40s
    loadTestFile(require.resolve('./persistent_context')); // 1m
    loadTestFile(require.resolve('./table_dashboard')); // 3m 10s
    loadTestFile(require.resolve('./table')); // 1m 40s
    loadTestFile(require.resolve('./fields_list')); // 2m 7s
    loadTestFile(require.resolve('./layer_actions')); // 1m 45s
    loadTestFile(require.resolve('./field_formatters')); // 1m 30s
    loadTestFile(require.resolve('./color_mapping_runtime_migrations'));
    loadTestFile(require.resolve('./config_panel_scroll'));
  });
};
