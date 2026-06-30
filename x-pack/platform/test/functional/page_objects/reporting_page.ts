/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import fs from 'fs';
import path from 'path';
import type SuperTest from 'supertest';
import { promisify } from 'util';

import { INTERNAL_ROUTES, REPORT_TABLE_ID, REPORT_TABLE_ROW_ID } from '@kbn/reporting-common';
import { FtrService } from '../ftr_provider_context';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

export class ReportingPageObject extends FtrService {
  private readonly browser = this.ctx.getService('browser');
  private readonly log = this.ctx.getService('log');
  private readonly retry = this.ctx.getService('retry');
  private readonly toasts = this.ctx.getService('toasts');
  private readonly security = this.ctx.getService('security');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly find = this.ctx.getService('find');
  private readonly exports = this.ctx.getPageObject('exports');
  private readonly timePicker = this.ctx.getPageObject('timePicker');
  private readonly appMenu = this.ctx.getPageObject('appMenu');

  async forceSharedItemsContainerSize({ width }: { width: number }) {
    await this.browser.execute(`
      var el = document.querySelector('[data-shared-items-container]');
      el.style.flex="none";
      el.style.width="${width}px";
    `);
  }

  async getReportJobId(timeout: number): Promise<string> {
    this.log.debug('getReportJobId');

    try {
      // get the report job id from a data attribute on the download button
      const jobIdElement = await this.find.byCssSelector('[data-test-jobId]', timeout);
      if (!jobIdElement) {
        throw new Error('Failed to find report job id.');
      }
      const jobId = await jobIdElement.getAttribute('data-test-jobId');
      if (!jobId) {
        throw new Error('Failed to find report job id.');
      }
      return jobId;
    } catch (err) {
      let errorText = 'Unknown error';
      if (await this.find.existsByCssSelector('[data-test-errorText]')) {
        const errorTextEl = await this.find.byCssSelector('[data-test-errorText]');
        errorText = (await errorTextEl.getAttribute('data-test-errorText')) ?? errorText;
      }
      throw new Error(`Test report failed: ${errorText}: ${err}`, { cause: err });
    }
  }

  async getReportURL(timeout: number) {
    this.log.debug('getReportURL');

    try {
      const url = await this.testSubjects.getAttribute(
        'downloadCompletedReportButton',
        'href',
        timeout
      );
      this.log.debug(`getReportURL got url: ${url}`);

      return url;
    } catch (err) {
      let errorText = 'Unknown error';
      if (await this.find.existsByCssSelector('[data-test-errorText]')) {
        const errorTextEl = await this.find.byCssSelector('[data-test-errorText]');
        errorText = (await errorTextEl.getAttribute('data-test-errorText')) ?? errorText;
      }
      throw new Error(`Test report failed: ${errorText}: ${err}`, { cause: err });
    }
  }

  async removeForceSharedItemsContainerSize() {
    await this.browser.execute(`
      var el = document.querySelector('[data-shared-items-container]');
      el.style.flex = null;
      el.style.width = null;
    `);
  }

  async getResponse(url: string, isFullUrl: boolean = true): Promise<SuperTest.Response> {
    this.log.debug(`getResponse for ${url}`);
    let urlToUse = url;
    if (isFullUrl) {
      const parsedUrl = new URL(url);
      urlToUse = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }
    const res = await this.security.testUserSupertest.get(urlToUse);
    return res ?? '';
  }

  async getReportInfo(jobId: string) {
    this.log.debug(`getReportInfo for ${jobId}`);
    const response = await this.getResponse(INTERNAL_ROUTES.JOBS.INFO_PREFIX + `/${jobId}`, false);
    return response.body;
  }

  async getRawReportData(url: string): Promise<Buffer> {
    this.log.debug(`getRawReportData for ${url}`);
    const response = await this.getResponse(url);
    expect(response.body).to.be.a(Buffer);
    return response.body as Buffer;
  }

  async openShareMenuItem(itemTitle: string) {
    this.log.debug(`openShareMenuItem title:${itemTitle}`);
    const isShareMenuOpen = await this.testSubjects.exists('shareContextMenu');
    if (!isShareMenuOpen) {
      await this.appMenu.clickMenuItem('shareTopNavButton');
    } else {
      // there is no easy way to ensure the menu is at the top level
      // so just close the existing menu
      await this.appMenu.clickMenuItem('shareTopNavButton');
      // and then re-open the menu
      await this.appMenu.clickMenuItem('shareTopNavButton');
    }
    const menuPanel = await this.find.byCssSelector('div.euiContextMenuPanel');
    await this.testSubjects.click(`sharePanel-${itemTitle.replace(' ', '')}`);
    await this.testSubjects.waitForDeleted(menuPanel);
  }

  async openExportPopover() {
    this.log.debug('open export popover');

    // First check if export button is directly visible
    if (await this.testSubjects.exists('exportTopNavButton')) {
      await this.exports.clickExportTopNavButton();
      return;
    }

    // If not visible, try the overflow menu
    if (await this.testSubjects.exists('app-menu-overflow-button')) {
      await this.testSubjects.click('app-menu-overflow-button');
      await this.exports.clickExportTopNavButton();
    }
  }

  async selectExportItem(label: string) {
    await this.exports.clickPopoverItem(label);
  }

  async getQueueReportError() {
    return await this.testSubjects.exists('errorToastBtn');
  }

  async getGenerateReportButton() {
    return await this.retry.try(async () => await this.testSubjects.find('generateReportButton'));
  }

  async isGenerateReportButtonDisabled() {
    const generateReportButton = await this.getGenerateReportButton();
    return await this.retry.try(async () => {
      const isDisabled = await generateReportButton.getAttribute('disabled');
      return isDisabled;
    });
  }

  async canReportBeCreated() {
    await this.clickGenerateReportButton();
    const success = await this.checkForReportingToasts();
    return success;
  }

  async checkUsePrintLayout() {
    // The print layout checkbox slides in as part of an animation, and tests can
    // attempt to click it too quickly, leading to flaky tests. The 500ms wait allows
    // the animation to complete before we attempt a click.
    const menuAnimationDelay = 500;
    await this.retry.tryForTime(menuAnimationDelay, () =>
      this.testSubjects.click('usePrintLayout')
    );
  }

  async clickGenerateReportButton() {
    await this.testSubjects.click('generateReportButton');
  }

  async toggleReportMode() {
    await this.testSubjects.click('reportModeToggle');
  }

  async checkForReportingToasts() {
    this.log.debug('Reporting:checkForReportingToasts');
    const isToastPresent = await this.testSubjects.exists('completeReportSuccess', {
      allowHidden: true,
      timeout: 90000,
    });
    // Close toast so it doesn't obscure the UI.
    if (isToastPresent) {
      // If close button fails to be clicked, the toast should dismiss regardless.
      await this.toasts.dismissAll();
    }

    return isToastPresent;
  }

  // set the time picker to a range matching 720 documents when using the
  // reporting/ecommerce archive
  async setTimepickerInEcommerceDataRange() {
    this.log.debug('Reporting:setTimepickerInDataRange');
    const fromTime = 'Jun 20, 2019 @ 00:00:00.000';
    const toTime = 'Jun 25, 2019 @ 00:00:00.000';
    await this.timePicker.setAbsoluteRange(fromTime, toTime);
  }

  // set the time picker to a range matching 0 documents when using the
  // reporting/ecommerce archive
  async setTimepickerInEcommerceNoDataRange() {
    this.log.debug('Reporting:setTimepickerInNoDataRange');
    const fromTime = 'Sep 19, 1999 @ 06:31:44.000';
    const toTime = 'Sep 23, 1999 @ 18:31:44.000';
    await this.timePicker.setAbsoluteRange(fromTime, toTime);
  }

  async getManagementList() {
    const table = await this.testSubjects.find(REPORT_TABLE_ID);
    const allRows = await table.findAllByTestSubject(REPORT_TABLE_ROW_ID);

    return await Promise.all(
      allRows.map(async (row) => {
        const $ = await row.parseDomContent();
        return {
          report: $.findTestSubject('reportingListItemObjectTitle').text().trim(),
          createdAt: $.findTestSubject('reportJobCreatedAt').text().trim(),
          status: $.findTestSubject('reportJobStatus').text().trim(),
          actions: $.findTestSubject('reportJobActions').text().trim(),
        };
      })
    );
  }

  async openReportFlyout(reportTitle: string) {
    const table = await this.testSubjects.find(REPORT_TABLE_ID);
    const allRows = await table.findAllByTestSubject(REPORT_TABLE_ROW_ID);
    for (const row of allRows) {
      const titleColumn = await row.findByTestSubject('reportingListItemObjectTitle');
      const title = await titleColumn.getVisibleText();
      if (title === reportTitle) {
        await titleColumn.click();
        return;
      }
    }
  }

  async writeSessionReport(name: string, reportExt: string, rawPdf: Buffer, folder: string) {
    const sessionDirectory = path.resolve(folder, 'session');
    await mkdirAsync(sessionDirectory, { recursive: true });
    const sessionReportPath = path.resolve(sessionDirectory, `${name}.${reportExt}`);
    await writeFileAsync(sessionReportPath, rawPdf);
    this.log.debug(`sessionReportPath (${sessionReportPath})`);
    return sessionReportPath;
  }

  getBaselineReportPath(fileName: string, reportExt: string, folder: string) {
    const baselineFolder = path.resolve(folder, 'baseline');
    const fullPath = path.resolve(baselineFolder, `${fileName}.${reportExt}`);
    this.log.debug(`baselineReportPath (${fullPath})`);
    return fullPath;
  }

  async copyReportingPOSTURLValueToClipboard() {
    await this.exports.copyExportAssetText();
  }
}
