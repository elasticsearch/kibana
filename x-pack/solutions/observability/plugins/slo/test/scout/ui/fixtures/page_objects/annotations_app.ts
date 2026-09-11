/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { APP_MENU_TEST_SUBJECTS } from '@kbn/app-header';
import type { ScoutPage } from '@kbn/scout-oblt';

export class AnnotationsApp {
  constructor(private readonly page: ScoutPage) {}

  async goto() {
    await this.page.gotoApp('slo', {});
    await this.page.getByRole('link', { name: 'Manage SLOs' }).waitFor({ state: 'visible' });
    await this.page.getByTestId(APP_MENU_TEST_SUBJECTS.overflowButton).click();
    await this.page.getByTestId('sloHeaderAnnotationsLink').click();
    await this.page.getByTestId('annotationsPage').waitFor({ state: 'visible' });
  }
}
