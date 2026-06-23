/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiModal,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { isEmpty } from 'lodash';
import React, { useCallback, useMemo } from 'react';
import styled from '@emotion/styled';
import type { LogEntry } from '@kbn/logs-shared-plugin/common';
import { getLogsLocatorFromUrlService } from '@kbn/logs-shared-plugin/common';
import useAsync from 'react-use/lib/useAsync';
import { LazySavedSearchComponent } from '@kbn/saved-search-component';
import { i18n } from '@kbn/i18n';
import { Global, css } from '@emotion/react';
import { useKibanaContextForPlugin } from '../../../hooks/use_kibana';
import { useViewLogInProviderContext } from '../../../containers/logs/view_log_in_context';
import { useViewportDimensions } from '../../../hooks/use_viewport_dimensions';

const MODAL_MARGIN = 25;

export const PageViewLogInContext: React.FC = () => {
  const {
    services: {
      logsDataAccess: {
        services: { logSourcesService },
      },
      embeddable,
      dataViews,
      data: {
        search: { searchSource },
      },
      share: { url },
    },
  } = useKibanaContextForPlugin();

  const logsLocator = getLogsLocatorFromUrlService(url);

  const logSources = useAsync(logSourcesService.getFlattenedLogSources);
  const [{ contextEntry, startTimestamp, endTimestamp }, { setContextEntry }] =
    useViewLogInProviderContext();
  const closeModal = useCallback(() => setContextEntry(undefined), [setContextEntry]);
  const { width: vw, height: vh } = useViewportDimensions();

  // Convert timestamps to TimeRange format for LazySavedSearchComponent
  const timeRange = useMemo(
    () => ({
      from: new Date(startTimestamp).toISOString(),
      to: new Date(endTimestamp).toISOString(),
    }),
    [startTimestamp, endTimestamp]
  );

  const contextQuery = useMemo(() => {
    if (contextEntry && !isEmpty(contextEntry.context)) {
      return {
        language: 'kuery',
        query: Object.entries(contextEntry.context).reduce((kuery, [key, value]) => {
          const currentExpression = `${key} : "${value}"`;
          if (kuery.length > 0) {
            return `${kuery} AND ${currentExpression}`;
          } else {
            return currentExpression;
          }
        }, ''),
      };
    }
  }, [contextEntry]);

  if (!contextEntry) {
    return null;
  }

  const discoverLink = logsLocator?.getRedirectUrl({
    timeRange,
    query: contextQuery,
  });

  return (
    <>
      {/* z-index override so DocViewer flyout is being visible */}
      <Global
        styles={css`
          .DiscoverFlyout {
            z-index: 6000 !important;
          }
        `}
      />
      <EuiModal
        onClose={closeModal}
        maxWidth={false}
        aria-label={i18n.translate('xpack.infra.logs.viewInContext.modalAriaLabel', {
          defaultMessage: 'View log in context',
        })}
      >
        <LogInContextWrapper width={vw - MODAL_MARGIN * 2} height={vh - MODAL_MARGIN * 2}>
          <EuiFlexGroup direction="column" responsive={false} wrap={false} css={{ height: '100%' }}>
            <EuiFlexItem grow={false}>
              <LogEntryContext context={contextEntry.context} discoverLink={discoverLink} />
            </EuiFlexItem>
            <EuiFlexItem grow={1}>
              {logSources.value ? (
                <LazySavedSearchComponent
                  dependencies={{ embeddable, searchSource, dataViews }}
                  index={logSources.value}
                  timeRange={timeRange}
                  query={contextQuery}
                  height={'100%'}
                  displayOptions={{
                    solutionNavIdOverride: 'oblt',
                    enableFilters: false,
                  }}
                />
              ) : null}
            </EuiFlexItem>
          </EuiFlexGroup>
        </LogInContextWrapper>
      </EuiModal>
    </>
  );
};

const LogInContextWrapper = styled.div<{ width: number | string; height: number | string }>`
  padding: 16px;
  width: ${(props) => (typeof props.width === 'number' ? `${props.width}px` : props.width)};
  height: ${(props) => (typeof props.height === 'number' ? `${props.height}px` : props.height)};
  max-height: 75vh; // Same as EuiModal
`;

const LogEntryContext: React.FC<{ context: LogEntry['context']; discoverLink?: string }> = ({
  context,
  discoverLink,
}) => {
  let text;
  if ('container.id' in context) {
    text = (
      <FormattedMessage
        id="xpack.infra.logs.viewInContext.logsFromContainerTitle"
        defaultMessage="Displayed logs are from container {container}"
        values={{ container: context['container.id'] }}
      />
    );
  }

  if ('host.name' in context) {
    const shortenedFilePath =
      context['log.file.path'].length > 45
        ? context['log.file.path'].slice(0, 20) + '...' + context['log.file.path'].slice(-25)
        : context['log.file.path'];
    text = (
      <FormattedMessage
        id="xpack.infra.logs.viewInContext.logsFromFileTitle"
        defaultMessage="Displayed logs are from file {file} and host {host}"
        values={{
          file: (
            <EuiToolTip content={context['log.file.path']}>
              <span tabIndex={0}>{shortenedFilePath}</span>
            </EuiToolTip>
          ),
          host: context['host.name'],
        }}
      />
    );
  }

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText size="s" color="subdued">
          <p style={{ margin: 0 }}>{text}</p>
        </EuiText>
      </EuiFlexItem>
      {discoverLink && (
        <EuiFlexItem grow={false}>
          <EuiLink
            data-test-subj="infraHostLogsTabOpenInDiscoverLink"
            href={discoverLink}
            target="_blank"
            color="primary"
            external={false}
          >
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiIcon type="discoverApp" size="s" color="primary" aria-hidden={true} />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs">
                  {i18n.translate('xpack.infra.logs.viewInContext.openInDiscoverLabel', {
                    defaultMessage: 'Open in Discover',
                  })}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiLink>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
