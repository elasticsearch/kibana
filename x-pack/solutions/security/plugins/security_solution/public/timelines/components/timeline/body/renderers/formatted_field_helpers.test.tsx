/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { RenderRuleName } from './formatted_field_helpers';
import { TestProviders } from '../../../../../common/mock';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { useKibana } from '../../../../../common/lib/kibana';

jest.mock('../../../../../common/lib/kibana');
jest.mock('../../../../../common/components/link_to');
jest.mock('../../../../../common/components/user_privileges');

const useUserPrivilegesMock = useUserPrivileges as jest.Mock;
const useKibanaMock = useKibana as jest.Mock;

const mockNavigateToApp = jest.fn();

const defaultProps = {
  fieldName: 'kibana.alert.rule.name',
  linkValue: 'rule-id-123',
  value: 'Test Rule Name',
};

describe('RenderRuleName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useKibanaMock.mockReturnValue({
      services: {
        application: {
          navigateToApp: mockNavigateToApp,
          getUrlForApp: jest.fn().mockReturnValue('/app/security/rules/id/rule-id-123'),
        },
        uiSettings: {
          get: jest.fn().mockReturnValue(false),
        },
      },
    });
  });

  describe('link rendering based on rules read permission', () => {
    describe('when the user has read rule permissions', () => {
      beforeEach(() => {
        useUserPrivilegesMock.mockReturnValue({
          rulesPrivileges: {
            rules: { read: true, edit: false },
            exceptions: { read: false, crud: false },
          },
        });

        render(
          <TestProviders>
            <RenderRuleName {...defaultProps} />
          </TestProviders>
        );
      });
      it('renders the rule name as a link', () => {
        const element = screen.getByTestId('ruleName');
        expect(element).toBeInTheDocument();
        expect(element.tagName).toBe('A');
        expect(element).toHaveTextContent('Test Rule Name');
      });

      it('navigates to rule details when clicking the link', () => {
        const element = screen.getByTestId('ruleName');
        fireEvent.click(element);

        expect(mockNavigateToApp).toHaveBeenCalledTimes(1);
        expect(mockNavigateToApp).toHaveBeenCalledWith(
          'securitySolutionUI',
          expect.objectContaining({
            deepLinkId: 'rules',
            path: expect.stringContaining('rule-id-123'),
          })
        );
      });
    });

    describe('when the user does not have read rule permissions', () => {
      beforeEach(() => {
        useUserPrivilegesMock.mockReturnValue({
          rulesPrivileges: {
            rules: { read: false, edit: false },
            exceptions: { read: false, crud: false },
          },
        });

        render(
          <TestProviders>
            <RenderRuleName {...defaultProps} />
          </TestProviders>
        );
      });
      it('renders the rule name as plain text', () => {
        const element = screen.getByTestId('ruleName');
        expect(element).toBeInTheDocument();
        expect(element.tagName).toBe('SPAN');
        expect(element).toHaveTextContent('Test Rule Name');
      });

      it('does not navigate when clicking rule name', () => {
        const element = screen.getByTestId('ruleName');
        fireEvent.click(element);

        expect(mockNavigateToApp).not.toHaveBeenCalled();
      });
    });
  });
});
