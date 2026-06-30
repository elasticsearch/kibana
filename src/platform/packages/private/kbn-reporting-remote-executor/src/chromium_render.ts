/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Page } from 'puppeteer';
import { PDFDocument } from 'pdf-lib';

import { REPORTING_REDIRECT_LOCATOR_STORE_KEY } from '@kbn/reporting-common';

export interface ResolvedScreenshot {
  readonly redirectUrl: string;
  readonly locatorParams: unknown;
}

async function installReportingRedirectContext(page: Page, locatorParams: unknown): Promise<void> {
  await page.evaluateOnNewDocument(
    (key: string, value: unknown) => {
      Object.defineProperty(window, '__KBN_SCREENSHOT_MODE_ENABLED_KEY__', {
        enumerable: true,
        writable: true,
        configurable: false,
        value: true,
      });

      const KBN_SCREENSHOT_CONTEXT = '__KBN_SCREENSHOT_CONTEXT__';
      const w = window as unknown as Record<string, Record<string, unknown>>;
      if (!w[KBN_SCREENSHOT_CONTEXT]) {
        Object.defineProperty(window, KBN_SCREENSHOT_CONTEXT, {
          enumerable: true,
          writable: true,
          configurable: false,
          value: {},
        });
      }
      w[KBN_SCREENSHOT_CONTEXT]![key] = value;
    },
    REPORTING_REDIRECT_LOCATOR_STORE_KEY,
    locatorParams
  );
}

function filterStringHeaders(
  forwardHeaders: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(forwardHeaders).filter(([, v]) => typeof v === 'string' && v.length > 0)
  ) as Record<string, string>;
}

export async function chromiumRenderPdf(opts: {
  forwardHeaders: Record<string, string>;
  resolvedScreenshots: ResolvedScreenshot[];
  layoutDimensions?: { width?: number; height?: number };
  navigationTimeoutMs: number;
}): Promise<{ buffer: Buffer; pages: number }> {
  const puppeteer = await import('puppeteer');
  const mergedPdf = await PDFDocument.create();
  const width = opts.layoutDimensions?.width ?? 1200;
  const height = opts.layoutDimensions?.height ?? 800;
  const stringHeaders = filterStringHeaders(opts.forwardHeaders);

  const browser = await puppeteer.default.launch({
    headless: true,
    pipe: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    acceptInsecureCerts: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  try {
    for (const shot of opts.resolvedScreenshots) {
      const page = await browser.newPage();
      try {
        await page.setViewport({
          width: Math.round(width),
          height: Math.round(height),
          deviceScaleFactor: 1,
        });

        if (Object.keys(stringHeaders).length > 0) {
          await page.setExtraHTTPHeaders(stringHeaders);
        }

        await installReportingRedirectContext(page, shot.locatorParams);

        await page.goto(shot.redirectUrl, {
          waitUntil: 'networkidle0',
          timeout: opts.navigationTimeoutMs,
        });

        const pdfBytes = await page.pdf({
          printBackground: true,
          width: `${width}px`,
          height: `${height}px`,
        });

        const singleDoc = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(singleDoc, singleDoc.getPageIndices());
        copiedPages.forEach((p) => mergedPdf.addPage(p));
      } finally {
        await page.close();
      }
    }

    const buffer = Buffer.from(await mergedPdf.save());
    return { buffer, pages: mergedPdf.getPageCount() };
  } finally {
    await browser.close();
  }
}

export async function chromiumRenderPng(opts: {
  forwardHeaders: Record<string, string>;
  resolvedScreenshots: ResolvedScreenshot[];
  layoutDimensions?: { width?: number; height?: number };
  navigationTimeoutMs: number;
}): Promise<{ buffer: Buffer }> {
  const puppeteer = await import('puppeteer');
  const firstShot = opts.resolvedScreenshots[0];
  if (!firstShot) {
    throw new Error('PNG chromium render requires at least one resolved screenshot');
  }

  const width = opts.layoutDimensions?.width ?? 1200;
  const height = opts.layoutDimensions?.height ?? 800;
  const stringHeaders = filterStringHeaders(opts.forwardHeaders);

  const browser = await puppeteer.default.launch({
    headless: true,
    pipe: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    acceptInsecureCerts: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();
    try {
      await page.setViewport({
        width: Math.round(width),
        height: Math.round(height),
        deviceScaleFactor: 1,
      });

      if (Object.keys(stringHeaders).length > 0) {
        await page.setExtraHTTPHeaders(stringHeaders);
      }

      await installReportingRedirectContext(page, firstShot.locatorParams);

      await page.goto(firstShot.redirectUrl, {
        waitUntil: 'networkidle0',
        timeout: opts.navigationTimeoutMs,
      });

      const buffer = (await page.screenshot({
        type: 'png',
        fullPage: false,
      })) as Buffer;

      return { buffer };
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
