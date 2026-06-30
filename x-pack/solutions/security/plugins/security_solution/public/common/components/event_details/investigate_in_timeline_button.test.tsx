/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';

import { InvestigateInTimelineButton } from './investigate_in_timeline_button';
import { TestProviders } from '../../mock';
import { getDataProvider } from './use_action_cell_data_provider';
import { useUserPrivileges } from '../user_privileges';

import { ACTION_INVESTIGATE_IN_TIMELINE } from '../../../detections/components/alerts_table/translations';

jest.mock('../../lib/kibana');
jest.mock('../user_privileges');

describe('InvestigateInTimelineButton', () => {
  describe('When all props are provided', () => {
    test('it should display the add to timeline button', () => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        timelinePrivileges: { read: true },
      });
      const dataProviders = ['127.0.0.1', '::1', '10.1.2.3', '2001:0DB8:AC10:FE01::'].map(
        (ipValue) => getDataProvider('host.ip', '', ipValue)
      );
      const { container } = render(
        <TestProviders>
          <InvestigateInTimelineButton asEmptyButton={true} dataProviders={dataProviders} />
        </TestProviders>
      );
      expect(
        container.querySelector(`[aria-label="${ACTION_INVESTIGATE_IN_TIMELINE}"]`)
      ).toBeInTheDocument();
      expect(
        container.querySelector(`[aria-label="${ACTION_INVESTIGATE_IN_TIMELINE}"]`)
      ).not.toBeDisabled();
    });

    it('should be disabled when the user has insufficient privileges', () => {
      (useUserPrivileges as jest.Mock).mockReturnValue({
        timelinePrivileges: { read: false },
      });
      const dataProviders = ['127.0.0.1', '::1', '10.1.2.3', '2001:0DB8:AC10:FE01::'].map(
        (ipValue) => getDataProvider('host.ip', '', ipValue)
      );
      const { container } = render(
        <TestProviders>
          <InvestigateInTimelineButton asEmptyButton={true} dataProviders={dataProviders} />
        </TestProviders>
      );
      expect(
        container.querySelector(`[aria-label="${ACTION_INVESTIGATE_IN_TIMELINE}"]`)
      ).toBeDisabled();
    });
  });
});
