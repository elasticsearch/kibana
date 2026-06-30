/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const { lens, visualize } = getPageObjects(['lens', 'visualize']);
  const browser = getService('browser');
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');

  describe('lens disable auto-apply tests', () => {
    it('should persist auto-apply setting across page refresh', async () => {
      await visualize.navigateToNewVisualization();
      await visualize.clickVisType('lens');

      expect(await lens.getAutoApplyEnabled()).to.be.ok();

      await lens.disableAutoApply();

      expect(await lens.getAutoApplyEnabled()).not.to.be.ok();

      await browser.refresh();
      await lens.waitForEmptyWorkspace();

      expect(await lens.getAutoApplyEnabled()).not.to.be.ok();

      await lens.enableAutoApply();

      expect(await lens.getAutoApplyEnabled()).to.be.ok();

      await browser.refresh();
      await lens.waitForEmptyWorkspace();

      expect(await lens.getAutoApplyEnabled()).to.be.ok();

      await lens.disableAutoApply();

      expect(await lens.getAutoApplyEnabled()).not.to.be.ok();
    });

    it('should preserve apply-changes button with full-screen datasource', async () => {
      await lens.disableAutoApply();

      await lens.configureDimension({
        dimension: 'lnsXY_yDimensionPanel > lns-empty-dimension',
        operation: 'formula',
        formula: `count()`,
        keepOpen: true,
      });

      await lens.toggleFullscreen();

      expect(await lens.applyChangesExists('toolbar')).to.be.ok();

      await lens.toggleFullscreen();

      await lens.closeDimensionEditor();
    });

    it('should apply changes when "Apply" is clicked', async () => {
      await retry.waitForWithTimeout('x dimension to be available', 1000, () =>
        testSubjects
          .existOrFail('lnsXY_xDimensionPanel > lns-empty-dimension')
          .then(() => true)
          .catch(() => false)
      );

      // configureDimension
      await lens.configureDimension({
        dimension: 'lnsXY_xDimensionPanel > lns-empty-dimension',
        operation: 'date_histogram',
        field: '@timestamp',
      });

      // assert that changes haven't been applied
      await lens.waitForWorkspaceWithApplyChangesPrompt();

      await lens.applyChanges('workspace');

      await lens.waitForVisualization('xyVisChart');
    });

    it('should hide suggestions when a change is made', async () => {
      await lens.switchToVisualization('lnsDatatable');

      expect(await lens.applyChangesExists('suggestions')).to.be.ok();

      await lens.applyChanges('suggestions');

      expect(await lens.applyChangesExists('suggestions')).not.to.be.ok();
    });
  });
}
