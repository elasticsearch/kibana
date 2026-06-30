/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { lazy } from 'react';
import type { ConnectorIconProps } from './types';

/**
 * Icon exports for connector specs. Add new icon exports here as they are created.
 * Convention:
 * - key should match the connector.id with the leading dot (e.g., '.virustotal')
 * - value should be a lazy component that imports the icon
 * - chunk name should match the connector.id (e.g., 'connectorIconVirustotal')
 */

export const ConnectorIconsMap: Map<
  string,
  React.LazyExoticComponent<React.ComponentType<ConnectorIconProps>>
> = new Map([
  [
    '.virustotal',
    lazy(() => import(/* webpackChunkName: "connectorIconVirustotal" */ './specs/virustotal/icon')),
  ],
  [
    '.alienvault-otx',
    lazy(
      () =>
        import(/* webpackChunkName: "connectorIconAlienvaultOtx" */ './specs/alienvault_otx/icon')
    ),
  ],
  ['.notion', lazy(() => import(/* webpackChunkName: "connectorNotion" */ './specs/notion/icon'))],
  [
    '.pagerduty_mcp',
    lazy(
      () => import(/* webpackChunkName: "connectorIconPagerdutyMcp" */ './specs/pagerduty/icon')
    ),
  ],
  [
    '.brave-search',
    lazy(
      () => import(/* webpackChunkName: "connectorIconBraveSearch" */ './specs/brave_search/icon')
    ),
  ],
  [
    '.bigquery',
    lazy(() => import(/* webpackChunkName: "connectorIconBigQuery" */ './specs/bigquery/icon')),
  ],
  [
    '.github',
    lazy(() => import(/* webpackChunkName: "connectorIconGithub" */ './specs/github/icon')),
  ],
  [
    '.jina',
    lazy(() => import(/* webpackChunkName: "connectorIconJina" */ './specs/jina/icon/jina')),
  ],
  [
    '.sharepoint-online',
    lazy(
      () =>
        import(
          /* webpackChunkName: "connectorIconsharepointonline" */ './specs/sharepoint_online/icon'
        )
    ),
  ],
  [
    '.salesforce',
    lazy(() => import(/* webpackChunkName: "connectorIconSalesforce" */ './specs/salesforce/icon')),
  ],
  [
    '.abuseipdb',
    lazy(() => import(/* webpackChunkName: "connectorIconAbuseipdb" */ './specs/abuseipdb/icon')),
  ],
  [
    '.greynoise',
    lazy(() => import(/* webpackChunkName: "connectorIconGreynoise" */ './specs/greynoise/icon')),
  ],
  [
    '.shodan',
    lazy(() => import(/* webpackChunkName: "connectorIconShodan" */ './specs/shodan/icon')),
  ],
  [
    '.urlvoid',
    lazy(() => import(/* webpackChunkName: "connectorIconUrlvoid" */ './specs/urlvoid/icon')),
  ],
  [
    '.jira-cloud',
    lazy(
      () =>
        import(/* webpackChunkName: "connectorIconJiraCloud" */ './specs/atlassian/jira-cloud/icon')
    ),
  ],
  ['.figma', lazy(() => import(/* webpackChunkName: "connectorIconFigma" */ './specs/figma/icon'))],
  [
    '.confluence-cloud',
    lazy(
      () =>
        import(
          /* webpackChunkName: "connectorIconConfluenceCloud" */ './specs/atlassian/confluence_cloud/icon'
        )
    ),
  ],
  [
    '.google_drive',
    lazy(
      () => import(/* webpackChunkName: "connectorIconGoogleDrive" */ './specs/google_drive/icon')
    ),
  ],
  [
    '.slack2',
    lazy(() => import(/* webpackChunkName: "connectorIconSlack2" */ './specs/slack/icon')),
  ],
  ['.gmail', lazy(() => import(/* webpackChunkName: "connectorIconGmail" */ './specs/gmail/icon'))],
  [
    '.azure-blob',
    lazy(() => import(/* webpackChunkName: "connectorIconAzureBlob" */ './specs/azure_blob/icon')),
  ],
  [
    '.firecrawl',
    lazy(() => import(/* webpackChunkName: "connectorIconFirecrawl" */ './specs/firecrawl/icon')),
  ],
  ['.zoom', lazy(() => import(/* webpackChunkName: "connectorIconZoom" */ './specs/zoom/icon'))],
  [
    '.zendesk',
    lazy(() => import(/* webpackChunkName: "connectorIconZendesk" */ './specs/zendesk/icon')),
  ],
  [
    '.servicenow_search',
    lazy(
      () =>
        import(
          /* webpackChunkName: "connectorIconservicenowsearch" */ './specs/servicenow_search/icon'
        )
    ),
  ],
  [
    '.1password',
    lazy(
      () => import(/* webpackChunkName: "connectorIconOnePassword" */ './specs/one_password/icon')
    ),
  ],
  [
    '.tavily_mcp',
    lazy(() => import(/* webpackChunkName: "connectorIconTavilyMcp" */ './specs/tavily/icon')),
  ],
  [
    '.google_calendar',
    lazy(
      () =>
        import(/* webpackChunkName: "connectorIconGoogleCalendar" */ './specs/google_calendar/icon')
    ),
  ],
  [
    '.aws_lambda',
    lazy(() => import(/* webpackChunkName: "connectorIconAwsLambda" */ './specs/aws_lambda/icon')),
  ],
  [
    '.gcp_cloud_functions',
    lazy(
      () =>
        import(
          /* webpackChunkName: "connectorIconGcpCloudFunctions" */ './specs/gcp_cloud_functions/icon'
        )
    ),
  ],
  [
    '.amazon_s3',
    lazy(() => import(/* webpackChunkName: "connectorIconAmazons3" */ './specs/amazon_s3/icon')),
  ],
  [
    '.sharepoint-server',
    lazy(
      () =>
        import(
          /* webpackChunkName: "connectorIconsharepointserver" */ './specs/sharepoint_server/icon'
        )
    ),
  ],
  [
    '.hubspot',
    lazy(() => import(/* webpackChunkName: "connectorIconHubspot" */ './specs/hubspot/icon')),
  ],
  [
    '.microsoft-teams',
    lazy(
      () =>
        import(/* webpackChunkName: "connectorIconMicrosoftTeams" */ './specs/microsoft_teams/icon')
    ),
  ],
  [
    '.outlook',
    lazy(() => import(/* webpackChunkName: "connectorIconOutlook" */ './specs/outlook/icon')),
  ],
  [
    '.google_cloud_storage',
    lazy(
      () =>
        import(
          /* webpackChunkName: "connectorIconGoogleCloudStorage" */ './specs/google_cloud_storage/icon'
        )
    ),
  ],

  [
    '.snowflake',
    lazy(() => import(/* webpackChunkName: "connectorIconsnowflake" */ './specs/snowflake/icon')),
  ],

  ['.box', lazy(() => import(/* webpackChunkName: "connectorIconbox" */ './specs/box/icon'))],

  [
    '.dropbox',
    lazy(() => import(/* webpackChunkName: "connectorIcondropbox" */ './specs/dropbox/icon')),
  ],
]);
