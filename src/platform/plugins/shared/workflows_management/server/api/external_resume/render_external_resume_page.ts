/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

const PAGE_TITLE = i18n.translate('workflowsManagement.externalResume.pageTitle', {
  defaultMessage: 'Workflow response',
});

const SUCCESS_TITLE = i18n.translate('workflowsManagement.externalResume.successTitle', {
  defaultMessage: 'Thank you',
});

const SUCCESS_MESSAGE = i18n.translate('workflowsManagement.externalResume.successMessage', {
  defaultMessage: 'Your response was received. You can close this window.',
});

const ERROR_TITLE = i18n.translate('workflowsManagement.externalResume.errorTitle', {
  defaultMessage: 'Unable to submit response',
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPage({
  title,
  message,
  isError,
}: {
  title: string;
  message: string;
  isError: boolean;
}): string {
  const accent = isError ? '#BD271E' : '#006BB4';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(PAGE_TITLE)}</title>
    <style>
      *, *::before, *::after {
        box-sizing: border-box;
      }
      :root {
        color-scheme: light;
        font-family: Inter, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
        background: #F5F7FA;
        color: #343741;
      }
      html {
        height: 100%;
      }
      body {
        margin: 0;
        min-height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 480px;
        background: #FFFFFF;
        border: 1px solid #D3DAE6;
        border-radius: 6px;
        box-shadow: 0 2px 2px -1px rgba(152, 162, 179, 0.3);
        padding: 32px;
      }
      .brand {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #69707D;
        margin-bottom: 16px;
      }
      .status {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${accent}14;
        color: ${accent};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        margin-bottom: 16px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 24px;
        line-height: 1.25;
        font-weight: 600;
      }
      p {
        margin: 0;
        font-size: 16px;
        line-height: 1.5;
        color: #535966;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="brand">Elastic Workflows</div>
      <div class="status" aria-hidden="true">${isError ? '!' : '✓'}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

export function renderExternalResumeSuccessPage(): string {
  return renderPage({
    title: SUCCESS_TITLE,
    message: SUCCESS_MESSAGE,
    isError: false,
  });
}

export function renderExternalResumeErrorPage(message: string): string {
  return renderPage({
    title: ERROR_TITLE,
    message,
    isError: true,
  });
}
