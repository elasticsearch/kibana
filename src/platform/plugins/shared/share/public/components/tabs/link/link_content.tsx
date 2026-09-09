/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  copyToClipboard,
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiSpacer,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { isTimeRangeAbsoluteTime } from '../../../lib/time_utils';
import { TimeTypeSection } from './time_type_section';
import { useShareContext, type IShareContext } from '../../context';
import type { LinkShareConfig, LinkShareUIConfig } from '../../../types';
import { DraftModeCallout } from '../../common/draft_mode_callout';

type LinkProps = Pick<
  IShareContext,
  | 'objectType'
  | 'objectId'
  | 'isDirty'
  | 'shareableUrl'
  | 'shareableUrlLocatorParams'
  | 'allowShortUrl'
> &
  LinkShareConfig['config'] & {
    objectConfig?: LinkShareUIConfig;
  };

interface UrlParams {
  [extensionName: string]: {
    [queryParam: string]: boolean;
  };
}

export const LinkContent = ({
  isDirty,
  objectType,
  objectConfig = {},
  shareableUrl,
  shortUrlService,
  shareableUrlLocatorParams,
  allowShortUrl,
}: LinkProps) => {
  const { onSave, isSaving } = useShareContext();
  const [snapshotUrl, setSnapshotUrl] = useState<string>('');
  const [isTextCopied, setTextCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const urlParamsRef = useRef<UrlParams | undefined>(undefined);
  const urlToCopy = useRef<string | undefined>(undefined);
  const copiedTextToolTipCleanupIdRef = useRef<ReturnType<typeof setTimeout>>();
  const timeRange = useMemo(() => {
    return shareableUrlLocatorParams?.locator.getTimeRange
      ? shareableUrlLocatorParams.locator.getTimeRange(shareableUrlLocatorParams?.params)
      : undefined;
  }, [shareableUrlLocatorParams]);
  const isAbsoluteTimeByDefault = isTimeRangeAbsoluteTime(timeRange);
  const [isAbsoluteTime, setIsAbsoluteTime] = useState(isAbsoluteTimeByDefault);

  const { delegatedShareUrlHandler, draftModeCallOut, helpText } = objectConfig;
  const draftModeCalloutContent = typeof draftModeCallOut === 'object' ? draftModeCallOut : {};

  const getUrlWithUpdatedParams = useCallback((tempUrl: string): string => {
    const urlWithUpdatedParams = urlParamsRef.current
      ? Object.keys(urlParamsRef.current).reduce((urlAccumulator, key) => {
          const urlParam = urlParamsRef.current?.[key];
          return urlParam
            ? Object.keys(urlParam).reduce((queryAccumulator, queryParam) => {
                const isQueryParamEnabled = urlParam[queryParam];
                return isQueryParamEnabled
                  ? queryAccumulator + `&${queryParam}=true`
                  : queryAccumulator;
              }, urlAccumulator)
            : urlAccumulator;
        }, tempUrl)
      : tempUrl;

    return urlWithUpdatedParams;
  }, []);

  useEffect(() => {
    setSnapshotUrl(getUrlWithUpdatedParams(shareableUrl || window.location.href));
  }, [getUrlWithUpdatedParams, shareableUrl]);

  const createShortUrl = useCallback(async () => {
    if (shareableUrlLocatorParams) {
      const shortUrl = await shortUrlService.createWithLocator(
        shareableUrlLocatorParams,
        isAbsoluteTime
      );
      return shortUrl.locator.getUrl(shortUrl.params, { absolute: true });
    } else {
      return (await shortUrlService.createFromLongUrl(snapshotUrl, isAbsoluteTime)).url;
    }
  }, [shareableUrlLocatorParams, shortUrlService, snapshotUrl, isAbsoluteTime]);

  const copyUrlHelper = useCallback(async () => {
    setIsLoading(true);

    if (!urlToCopy.current) {
      urlToCopy.current = delegatedShareUrlHandler
        ? await delegatedShareUrlHandler()
        : allowShortUrl
        ? await createShortUrl()
        : snapshotUrl;
    }

    copyToClipboard(urlToCopy.current);
    setTextCopied(() => {
      if (copiedTextToolTipCleanupIdRef.current) {
        clearTimeout(copiedTextToolTipCleanupIdRef.current);
      }

      // set up timer to revert copied state to false after specified duration
      copiedTextToolTipCleanupIdRef.current = setTimeout(() => setTextCopied(false), 1000);

      // set copied state to true for now
      return true;
    });
    setIsLoading(false);
  }, [snapshotUrl, delegatedShareUrlHandler, allowShortUrl, createShortUrl]);

  const handleTimeTypeChange = useCallback(
    (isAbsolute: boolean) => {
      if (urlToCopy?.current && isAbsolute !== isAbsoluteTime) {
        urlToCopy.current = undefined;
      }
      setIsAbsoluteTime(isAbsolute);
    },
    [isAbsoluteTime]
  );

  return (
    <>
      <EuiForm>
        <TimeTypeSection
          timeRange={timeRange}
          onTimeTypeChange={handleTimeTypeChange}
          isAbsoluteTimeByDefault={isAbsoluteTimeByDefault}
        />
        {helpText && (
          <>
            <EuiSpacer size="m" />
            <div data-test-subj="shareLinkHelpText">{helpText}</div>
          </>
        )}
        {isDirty && draftModeCallOut && (
          <>
            <EuiSpacer size="m" />
            <DraftModeCallout
              {...draftModeCalloutContent}
              {...(onSave && {
                saveButtonProps: {
                  onSave,
                  isSaving,
                },
              })}
            />
          </>
        )}
        <EuiSpacer size="l" />
      </EuiForm>
      <EuiFlexGroup justifyContent="flexEnd" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={
              isTextCopied
                ? i18n.translate('share.link.copied', { defaultMessage: 'Link copied' })
                : null
            }
          >
            <EuiButton
              iconType="link"
              fill
              data-test-subj="copyShareUrlButton"
              data-share-url={urlToCopy.current}
              onBlur={() => (objectType === 'lens' && isDirty ? null : setTextCopied(false))}
              onClick={copyUrlHelper}
              color={objectType === 'lens' && isDirty ? 'warning' : 'primary'}
              isLoading={isLoading}
            >
              <FormattedMessage id="share.link.copyLinkButton" defaultMessage="Copy link" />
            </EuiButton>
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};
