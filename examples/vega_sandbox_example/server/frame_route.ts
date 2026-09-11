/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { randomBytes } from 'crypto';
import type { CoreSetup } from '@kbn/core/server';
import { VEGA_SANDBOX_BUNDLE_FILE, VEGA_SANDBOX_BUNDLE_PUBLIC_PATH } from '@kbn/vega-sandbox';
import { VEGA_SANDBOX_EXAMPLE_FRAME_PATH } from '../common';

/**
 * Demo-only CSP for this example frame.
 * Production visTypeVega owns img-src / externalUrl.policy; do not copy this policy.
 */
const createExampleFrameCsp = (nonce: string): string =>
  [
    "default-src 'none'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "img-src 'none'",
    "style-src 'unsafe-inline'",
    // Server-enforced containment — opaque origin and embedding restrictions independent of
    // the iframe sandbox attribute. Production visTypeVega must include the same directives.
    'sandbox allow-scripts',
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');

const renderFrameDocument = (nonce: string, bundleSrc: string): string => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Vega sandbox example</title>
    <style>
      html,
      body,
      #vega-sandbox-root {
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 0;
        background: transparent;
      }
      body {
        overflow: hidden;
      }
      #vega-sandbox-root {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
    </style>
  </head>
  <body>
    <div id="vega-sandbox-root"></div>
    <script nonce="${nonce}">
      const script = document.createElement('script');
      script.src = ${JSON.stringify(bundleSrc)};
      script.onload = function () {
        // Opaque sandboxed frames report origin as the string "null". Cross-origin parents
        // also block parent.document access, so that is not a reliable isolation signal.
        var opaqueOrigin = window.origin === 'null';
        window.parent.postMessage({
          source: 'vega-sandbox-example',
          type: 'isolationProbe',
          opaqueOrigin: opaqueOrigin,
        }, '*');
        window.parent.postMessage({
          source: 'vega-sandbox-example',
          type: 'bootstrapReady',
        }, '*');
      };
      script.onerror = function () {
        window.parent.postMessage({
          source: 'vega-sandbox-example',
          type: 'bootstrapError',
        }, '*');
      };
      document.head.appendChild(script);
    </script>
  </body>
</html>`;

export const registerFrameRoute = (core: CoreSetup): void => {
  const router = core.http.createRouter();
  const responseCspByRequestId = new Map<string, string>();
  const bundleSrc = core.http.staticAssets.prependPublicUrl(
    `${VEGA_SANDBOX_BUNDLE_PUBLIC_PATH}${VEGA_SANDBOX_BUNDLE_FILE}`
  );

  core.http.registerOnPreResponse((request, _response, toolkit) => {
    const csp = responseCspByRequestId.get(request.uuid);

    if (request.route.path !== VEGA_SANDBOX_EXAMPLE_FRAME_PATH || !csp) {
      return toolkit.next();
    }

    responseCspByRequestId.delete(request.uuid);

    return toolkit.next({
      headers: {
        'Content-Security-Policy': csp,
      },
    });
  });

  router.get(
    {
      path: VEGA_SANDBOX_EXAMPLE_FRAME_PATH,
      validate: false,
      options: { access: 'public' },
      security: {
        authz: {
          enabled: false,
          reason: 'Example iframe document does not access user data.',
        },
      },
    },
    async (_context, request, response) => {
      const nonce = randomBytes(16).toString('base64');
      responseCspByRequestId.set(request.uuid, createExampleFrameCsp(nonce));

      return response.ok({
        body: renderFrameDocument(nonce, bundleSrc),
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    }
  );
};
