/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ConfigType } from './config';

interface WindowSize {
  height: number;
  width: number;
}

type Proxy = ConfigType['browser']['chromium']['proxy'];

interface LaunchArgs {
  userDataDir: string;
  windowSize?: WindowSize;
  disableSandbox?: boolean;
  proxy: Proxy;
}

export const args = ({
  userDataDir,
  disableSandbox,
  windowSize,
  proxy: proxyConfig,
}: LaunchArgs) => {
  const flags = [
    // Disable built-in Google Translate service
    '--disable-translate',
    // Disable all chrome extensions entirely
    '--disable-extensions',
    // Disable various background network services, including extension updating,
    //   safe browsing service, upgrade detector, translate, UMA
    '--disable-background-networking',
    // Disable fetching safebrowsing lists, likely redundant due to disable-background-networking
    '--safebrowsing-disable-auto-update',
    // Disable syncing to a Google account
    '--disable-sync',
    // Disable reporting to UMA, but allows for collection
    '--metrics-recording-only',
    // Disable installation of default apps on first run
    '--disable-default-apps',
    // Mute any audio
    '--mute-audio',
    // Skip first run wizards
    '--no-first-run',
    `--user-data-dir=${userDataDir}`,
    '--headless',
    '--hide-scrollbars',
    // allow screenshot clip region to go outside of the viewport
    `--mainFrameClipsContent=false`,
    // fix screenshot text kerning
    '--font-render-hinting=none',
  ];

  if (windowSize) {
    // NOTE: setting the window size does NOT set the viewport size: viewport and window size are different.
    // The viewport may later need to be resized depending on the position of the clip area.
    // These numbers come from the job parameters, so this is a close guess.
    flags.push(`--window-size=${Math.floor(windowSize.width)},${Math.floor(windowSize.height)}`);
  }

  if (proxyConfig.enabled) {
    flags.push(`--proxy-server=${proxyConfig.server}`);
    if (proxyConfig.bypass) {
      flags.push(`--proxy-bypass-list=${proxyConfig.bypass.join(',')}`);
    }
  }

  if (disableSandbox) {
    flags.push('--no-sandbox');
  }

  flags.push('--disable-gpu', '--enable-unsafe-swiftshader');

  return [...flags, 'about:blank'];
};
