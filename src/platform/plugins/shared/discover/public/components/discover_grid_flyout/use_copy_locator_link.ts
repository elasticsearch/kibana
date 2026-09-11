/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useCallback, useRef } from 'react';
import { copyToClipboard } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { DiscoverAppLocatorParams } from '../../../common';
import { useDiscoverServices } from '../../hooks/use_discover_services';

/**
 * Copies a Discover deep link built from the given locator params, using a short URL when the user
 * can create one and falling back to a redirect URL otherwise. Concurrent copies are ignored so a
 * double click cannot open two short-URL requests. Shared by the Discover app and the saved search
 * embeddable so both produce identical links.
 */
export const useCopyLocatorLink = (
  buildParams: () => DiscoverAppLocatorParams
): (() => Promise<void>) => {
  const { locator, share, capabilities, toastNotifications } = useDiscoverServices();
  const isCopyingLinkRef = useRef(false);

  const copyLink = useCallback(async () => {
    try {
      const params = buildParams();
      let url: string;

      if (capabilities.discover_v2.createShortUrl && share) {
        const shortUrl = await share.url.shortUrls.get(null).createWithLocator({ locator, params });
        url = await shortUrl.locator.getUrl(shortUrl.params, { absolute: true });
      } else {
        const link = document.createElement('a');
        link.setAttribute('href', locator.getRedirectUrl(params));
        url = link.href;
      }

      copyToClipboard(url);
      toastNotifications.addSuccess({
        title: i18n.translate('discover.docViews.flyout.copyLinkSuccessTitle', {
          defaultMessage: 'Link copied to clipboard',
        }),
      });
    } catch (error) {
      toastNotifications.addDanger({
        title: i18n.translate('discover.docViews.flyout.copyLinkErrorTitle', {
          defaultMessage: 'Unable to copy link',
        }),
        text: error instanceof Error ? error.message : String(error),
      });
    }
  }, [buildParams, capabilities.discover_v2.createShortUrl, locator, share, toastNotifications]);

  const copyLinkOnce = useCallback(async () => {
    if (isCopyingLinkRef.current) {
      return;
    }

    isCopyingLinkRef.current = true;

    try {
      await copyLink();
    } finally {
      isCopyingLinkRef.current = false;
    }
  }, [copyLink]);

  return copyLinkOnce;
};
