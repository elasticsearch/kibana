/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Locator, ScoutPage } from '@kbn/scout';
import { compressToEncodedURIComponent } from 'lz-string';

export class SearchProfilerPage {
  readonly container: Locator;
  readonly editor: Locator;
  readonly indexInput: Locator;
  readonly profileButton: Locator;
  readonly profileTree: Locator;
  readonly jsonParseErrorToast: Locator;
  readonly noShardsNotification: Locator;
  readonly consolePanel: Locator;

  constructor(private readonly page: ScoutPage) {
    this.container = this.page.testSubj.locator('searchprofiler');
    this.editor = this.page.testSubj.locator('searchProfilerEditor');
    this.indexInput = this.page.testSubj.locator('indexName');
    this.profileButton = this.page.testSubj.locator('profileButton');
    this.profileTree = this.page.testSubj.locator('profileTree');
    this.jsonParseErrorToast = this.page.testSubj.locator('jsonParseErrorToast');
    this.noShardsNotification = this.page.testSubj.locator('noShardsNotification');
    this.consolePanel = this.page.testSubj.locator('consolePanel');
  }

  async goto(options: { index?: string; loadFrom?: string } = {}) {
    const query = new URLSearchParams();
    if (options.index) {
      query.set('index', options.index);
    }
    if (options.loadFrom) {
      query.set('load_from', compressToEncodedURIComponent(options.loadFrom));
    }

    const hash = query.size > 0 ? `searchprofiler?${query.toString()}` : 'searchprofiler';
    await this.page.gotoApp('dev_tools', { hash });
    await this.container.waitFor();
  }

  async gotoConsole() {
    await this.page.gotoApp('dev_tools', { hash: 'console' });
    await this.consolePanel.waitFor({ state: 'visible' });
  }

  async waitForEditorToLoad() {
    await this.editor.waitFor();
  }

  async setIndex(index: string) {
    await this.waitForEditorToLoad();
    await this.indexInput.fill(index);
  }

  async setQuery(query: string) {
    await this.waitForEditorToLoad();
    await this.page.evaluate((value) => {
      window.MonacoEnvironment!.monaco!.editor.getModels()[0].setValue(value);
    }, query);
  }

  async getQuery(): Promise<string> {
    await this.waitForEditorToLoad();
    return await this.page.evaluate(() =>
      window.MonacoEnvironment!.monaco!.editor.getModels()[0].getValue()
    );
  }

  async profile() {
    await this.profileButton.click();
  }
}
