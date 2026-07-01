/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { lens } = getPageObjects(['lens']);
  const lensApi = getService('lens');
  const testSubjects = getService('testSubjects');
  const find = getService('find');
  const log = getService('log');
  const retry = getService('retry');

  describe('lens metric secondary', () => {
    const BASE_METRIC_ID = 'metric-secondary-base';
    const BASE_METRIC_TITLE = 'Metric secondary base';

    before(async () => {
      await lensApi.createMetricChart({ id: BASE_METRIC_ID, title: BASE_METRIC_TITLE });
    });

    const openBaseMetric = () => lens.openEditor(BASE_METRIC_ID, 'mtrVis');

    it('should show a badge for the secondary metric', async () => {
      const CUSTOM_STATIC_COLOR_HEX = '#EE72A6';

      await openBaseMetric();
      await lens.openDimensionEditor(
        'lnsMetric_secondaryMetricDimensionPanel > lns-dimensionTrigger'
      );

      log.info('Checking badge in various configurations');

      // make sure there's no badge
      expect(await lens.hasSecondaryMetricBadge()).to.be(false);

      /**
       * Perform a smoke testing of the badge features
       */

      // now configure a static badge color
      await testSubjects.click('lnsMetric_color_mode_static');

      const colorPicker = await testSubjects.find('euiColorPickerAnchor');

      await colorPicker.clearValue();
      await colorPicker.type(CUSTOM_STATIC_COLOR_HEX);
      await lens.waitForVisualization('mtrVis');

      expect(await lens.getSecondaryMetricBadgeColor()).to.be(CUSTOM_STATIC_COLOR_HEX);

      // now change to dynamic badge color
      await testSubjects.click('lnsMetric_color_mode_dynamic');

      expect(await lens.getSecondaryMetricBadgeText()).to.be(`5,727.322\n↑`);

      // now show icon only
      await testSubjects.click('lnsMetric_secondary_trend_display_icon');
      // badge is there but value is not there any more
      expect(await lens.getSecondaryMetricBadgeText()).to.be('↑');

      // now show value only
      await testSubjects.click('lnsMetric_secondary_trend_display_value');
      // badge is there but icon is not there any more
      expect(await lens.getSecondaryMetricBadgeText()).to.be('5,727.322');

      // enable the Primary metric baseline
      await testSubjects.click('lnsMetric_secondary_trend_baseline_primary');
      // and that the badge is still there
      expect(await lens.getSecondaryMetricBadgeText()).to.be('0');

      /**
       * Now check if the static and dynamic previous mode are correctly cached
       */
      log.info('Checking editor configuration caching');
      // switch to none now
      await testSubjects.click('lnsMetric_color_mode_none');

      // and back to static
      await testSubjects.click('lnsMetric_color_mode_static');
      // and check again the color is the previously custom one
      expect(await lens.getSecondaryMetricBadgeColor()).to.be(CUSTOM_STATIC_COLOR_HEX);

      // now switch to dynamic
      await testSubjects.click('lnsMetric_color_mode_dynamic');
      // and check the content is still based on primary value-only
      expect(await lens.getSecondaryMetricBadgeText()).to.be('0');
    });

    it('should disable collapse by when the primary metric is not numeric', async () => {
      await openBaseMetric();

      const N_TILES = 39;

      await lens.configureDimension({
        dimension: 'lnsMetric_breakdownByDimensionPanel > lns-empty-dimension',
        operation: 'date_histogram',
        field: '@timestamp',
        keepOpen: true,
      });
      // Metric defaults "Include empty rows" off; keep the empty buckets so the
      // breakdown still yields one tile per interval across the whole time range.
      await retry.try(async () => {
        await testSubjects.setEuiSwitch('indexPattern-include-empty-rows', 'check');
        expect(await testSubjects.isEuiSwitchChecked('indexPattern-include-empty-rows')).to.be(
          true
        );
      });
      await lens.waitForVisualization('mtrVis');

      // test that there are 39 tiles now
      await retry.try(async () => {
        expect(await lens.getMetricTiles()).to.have.length(N_TILES);
      });

      await find.clickByCssSelector(
        'select[data-test-subj="indexPattern-collapse-by"] > option[value="sum"]'
      );
      // change the collapse by fn
      await lens.closeDimensionEditor();

      // check that the collapse by is applied to the chart
      expect(await lens.getMetricTiles()).to.have.length(1);

      // now change the metric to Last value of a string field
      await lens.configureDimension({
        dimension: 'lnsMetric_primaryMetricDimensionPanel > lns-dimensionTrigger',
        operation: 'last_value',
        field: 'ip',
      });

      // test that there are 39 tiles now
      expect(await lens.getMetricTiles()).to.have.length(N_TILES);
    });

    it('should replace secondary metric label and badge when changing primary metric type to non-numeric', async () => {
      await openBaseMetric();

      // Set primary metric: count of records
      await lens.configureDimension({
        dimension: 'lnsMetric_primaryMetricDimensionPanel > lns-dimensionTrigger',
        operation: 'count',
        field: 'records',
      });

      // Set Dynamic color trend with compare to Primary metric
      await lens.openDimensionEditor(
        'lnsMetric_secondaryMetricDimensionPanel > lns-dimensionTrigger'
      );
      await testSubjects.click('lnsMetric_color_mode_dynamic');
      await testSubjects.click('lnsMetric_secondary_trend_baseline_primary');
      // Check the label and the badge text
      expect(await lens.getSecondaryMetricLabel()).to.be('Difference');
      expect(await lens.getSecondaryMetricBadgeText()).to.be('+8,277.678\n↑');

      await lens.closeDimensionEditor();

      await lens.openDimensionEditor(
        'lnsMetric_primaryMetricDimensionPanel > lns-dimensionTrigger'
      );
      await lens.configureDimension({
        dimension: 'lnsMetric_primaryMetricDimensionPanel > lns-dimensionTrigger',
        operation: 'last_value',
        field: 'ip',
        isPreviousIncompatible: true,
      });

      // The badge text should change and the label should be "Average of bytes"
      expect(await lens.getSecondaryMetricLabel()).to.contain('Average of bytes');
      expect(await lens.getSecondaryMetricBadgeText()).to.be('5,727.322\n↑');

      // Open secondary metric editor
      await lens.openDimensionEditor(
        'lnsMetric_secondaryMetricDimensionPanel > lns-dimensionTrigger'
      );
      // Check the compare to has changed to static value and baseline input is visible
      expect(await testSubjects.isEnabled('lnsMetric_secondary_trend_baseline_static')).to.be(true);
      expect(await testSubjects.isEnabled('lnsMetric_secondary_trend_baseline_primary')).to.be(
        false
      );
      expect(await testSubjects.isDisplayed('lnsMetric_secondary_trend_baseline_input')).to.be(
        true
      );
    });
  });
}
