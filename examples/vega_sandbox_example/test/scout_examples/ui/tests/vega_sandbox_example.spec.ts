/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { test } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

test.describe('Vega sandbox example', { tag: ['@local-stateful-classic'] }, () => {
  test.beforeEach(async ({ browserAuth, page }) => {
    await browserAuth.loginAsViewer();
    await page.gotoApp('vegaSandboxExample');
    await expect(page.testSubj.locator('vegaSandboxExampleHeader')).toBeVisible();
  });

  test('renders in an opaque iframe and reports isolation', async ({ page }) => {
    const iframe = page.testSubj.locator('vegaSandboxExampleFrame');
    await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(iframe).not.toHaveAttribute('sandbox', /allow-same-origin/);
    await expect(iframe).not.toHaveAttribute('sandbox', /allow-top-navigation/);
    await expect(iframe).not.toHaveAttribute('sandbox', /allow-popups/);
    await expect(iframe).toHaveAttribute('src', /\/internal\/vega_sandbox_example\/frame/);
    await expect(iframe).not.toHaveAttribute('srcdoc');

    await expect(page.testSubj.locator('vegaSandboxExampleIsolationProbe')).toContainText(
      'opaque origin (isolated)'
    );

    await expect(page.testSubj.locator('vegaSandboxExampleRenderBtn')).toBeEnabled();
    await page.testSubj.locator('vegaSandboxExampleRenderBtn').click();
    const protocolLog = page.testSubj.locator('vegaSandboxExampleProtocolLog');
    await expect(protocolLog).toContainText('"type": "init"');
    await expect(protocolLog).toContainText('"type": "render"');
    await expect(protocolLog).toContainText('"type": "rendered"');

    await page.testSubj.locator('vegaSandboxExampleFilterBtn').click();
    const frame = page.frameLocator('[data-test-subj="vegaSandboxExampleFrame"]');
    await expect(frame.getByText('Click a bar to send applyFilter')).toBeVisible();
    await frame.getByLabel('A').click();
    await expect(page.testSubj.locator('vegaSandboxExampleAppliedFilter')).toContainText(
      'category:A'
    );
    await expect(protocolLog).toContainText('"type": "applyFilter"');
    await expect(protocolLog).toContainText('kibanaAddFilter');
    await expect(protocolLog).toContainText(/"renderId": ".+-3"/);
  });
});
