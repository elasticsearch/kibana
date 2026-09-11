/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';

/**
 * Opens the classic AppMenu overflow. Lens Share, Export, Inspect, and Open in
 * Discover are overflow items — callers assert or click the item locators after this.
 */
export async function openLensAppMenuOverflow(page: ScoutPage): Promise<void> {
  const overflowButton = page.testSubj.locator('app-menu-overflow-button');
  const popover = page.testSubj.locator('app-menu-popover');

  await expect(overflowButton).toBeVisible();
  await overflowButton.click();
  await expect(popover).toBeVisible();
}

/** Dismisses the AppMenu overflow so the next step starts with a closed menu. */
export async function closeLensAppMenuOverflow(page: ScoutPage): Promise<void> {
  const popover = page.testSubj.locator('app-menu-popover');
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
}

/** Opens the overflow menu and clicks an overflow AppMenu item. */
export async function clickLensAppMenuItem(page: ScoutPage, testId: string): Promise<void> {
  await openLensAppMenuOverflow(page);
  await page.testSubj.locator(testId).click();
}
