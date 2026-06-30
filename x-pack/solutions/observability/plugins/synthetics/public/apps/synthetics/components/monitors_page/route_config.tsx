/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React from 'react';
import type { useHistory, useLocation } from 'react-router-dom';
import { FormattedMessage } from '@kbn/i18n-react';

import { ErrorsTab } from './errors/errors_tab';
import { RefreshButton } from '../common/components/refresh_button';
import { SyntheticsDatePicker } from '../common/date_picker/synthetics_date_picker';
import { OverviewPage } from './overview/overview_page';
import { MonitorsPageHeader } from './management/page_header/monitors_page_header';
import { CreateMonitorButton } from './create_monitor_button';
import { MonitorManagementPage } from './monitors_page';
import type { RouteProps } from '../../routes';
import { ERRORS_ROUTE, MONITORS_ROUTE, OVERVIEW_ROUTE } from '../../../../../common/constants';
import { CLIENT_DEFAULTS_SYNTHETICS } from '../../../../../common/constants/synthetics/client_defaults';

const OVERVIEW_DEFAULT_DATE_RANGE = {
  from: CLIENT_DEFAULTS_SYNTHETICS.OVERVIEW_DATE_RANGE_START,
  to: CLIENT_DEFAULTS_SYNTHETICS.DATE_RANGE_END,
};

export const getMonitorsRoute = (
  history: ReturnType<typeof useHistory>,
  location: ReturnType<typeof useLocation>,
  syntheticsPath: string,
  baseTitle: string
): RouteProps[] => {
  const sharedProps = {
    pageTitle: <MonitorsPageHeader />,
    rightSideItems: [<RefreshButton />, <CreateMonitorButton />],
  };
  return [
    {
      title: i18n.translate('xpack.synthetics.overviewRoute.title', {
        defaultMessage: 'Synthetics Overview | {baseTitle}',
        values: { baseTitle },
      }),
      path: OVERVIEW_ROUTE,
      component: OverviewPage,
      dataTestSubj: 'syntheticsOverviewPage',
      pageHeader: {
        ...sharedProps,
        // The overview always scopes status by the page-level date range, so it
        // gets a <SyntheticsDatePicker /> in the header. The picker's built-in
        // refresh replaces the shared <RefreshButton />, which we drop here to
        // avoid two refresh controls. `rightSideItems` render right-to-left, so
        // the picker (last) sits to the left of Create Monitor.
        rightSideItems: [
          <CreateMonitorButton />,
          <SyntheticsDatePicker defaultDateRange={OVERVIEW_DEFAULT_DATE_RANGE} />,
        ],
        tabs: getMonitorsTabs(syntheticsPath, 'overview', location),
      },
    },
    {
      title: i18n.translate('xpack.synthetics.monitorManagementRoute.title', {
        defaultMessage: 'Synthetics Management | {baseTitle}',
        values: { baseTitle },
      }),
      path: MONITORS_ROUTE,
      component: MonitorManagementPage,
      dataTestSubj: 'syntheticsMonitorManagementPage',
      pageHeader: {
        ...sharedProps,
        tabs: getMonitorsTabs(syntheticsPath, 'management', location),
      },
    },
    {
      title: i18n.translate('xpack.synthetics.errorRoute.title', {
        defaultMessage: 'Errors | {baseTitle}',
        values: { baseTitle },
      }),
      path: ERRORS_ROUTE,
      component: ErrorsTab,
      dataTestSubj: 'syntheticsErrorPage',
      pageHeader: {
        ...sharedProps,
        tabs: getMonitorsTabs(syntheticsPath, 'errors', location),
      },
    },
  ];
};

const getMonitorsTabs = (
  syntheticsPath: string,
  selected: 'overview' | 'management' | 'errors',
  location: ReturnType<typeof useLocation>
) => {
  return [
    {
      label: (
        <FormattedMessage
          id="xpack.synthetics.monitorManagement.overviewTab.title"
          defaultMessage="Overview"
        />
      ),
      href: `${syntheticsPath}${OVERVIEW_ROUTE}${location.search}`,
      isSelected: selected === 'overview',
      'data-test-subj': 'syntheticsMonitorOverviewTab',
    },
    {
      label: (
        <FormattedMessage
          id="xpack.synthetics.monitorManagement.monitorsTab.title"
          defaultMessage="Management"
        />
      ),
      href: `${syntheticsPath}${MONITORS_ROUTE}${location.search}`,
      isSelected: selected === 'management',
      'data-test-subj': 'syntheticsMonitorManagementTab',
    },
    {
      label: (
        <FormattedMessage
          id="xpack.synthetics.monitorManagement.errorsTab.title"
          defaultMessage="Errors"
        />
      ),
      href: `${syntheticsPath}${ERRORS_ROUTE}${location.search}`,
      isSelected: selected === 'errors',
      'data-test-subj': 'syntheticsMonitorErrorsTab',
    },
  ];
};
