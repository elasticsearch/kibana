/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import React from 'react';

import { coreMock } from '@kbn/core/public/mocks';

import type { ChangePasswordFormValues } from './change_password_modal';
import { ChangePasswordModal, validateChangePasswordForm } from './change_password_modal';
import * as currentUserModule from '../../../components/use_current_user';
import { securityMock } from '../../../mocks';
import { Providers } from '../users_management_app';

describe('ChangePasswordModal', () => {
  describe('#validateChangePasswordForm', () => {
    describe('for current user', () => {
      it('should show an error when it is current user with no current password', () => {
        expect(
          validateChangePasswordForm({ password: 'changeme', confirm_password: 'changeme' }, true)
        ).toMatchInlineSnapshot(`
                  Object {
                    "current_password": "Enter your current password.",
                  }
              `);
      });

      it('should show errors when there is no new password', () => {
        expect(
          validateChangePasswordForm(
            {
              password: undefined,
              confirm_password: 'changeme',
            } as unknown as ChangePasswordFormValues,
            true
          )
        ).toMatchInlineSnapshot(`
          Object {
            "current_password": "Enter your current password.",
            "password": "Enter a new password.",
          }
        `);
      });

      it('should show errors when the new password is not at least 6 characters', () => {
        expect(validateChangePasswordForm({ password: '12345', confirm_password: '12345' }, true))
          .toMatchInlineSnapshot(`
          Object {
            "current_password": "Enter your current password.",
            "password": "Enter at least 6 characters.",
          }
        `);
      });

      it('should show errors when new password does not match confirmation password', () => {
        expect(
          validateChangePasswordForm(
            {
              password: 'changeme',
              confirm_password: 'notTheSame',
            },
            true
          )
        ).toMatchInlineSnapshot(`
                  Object {
                    "confirm_password": "Passwords do not match.",
                    "current_password": "Enter your current password.",
                  }
              `);
      });

      it('should show NO errors', () => {
        expect(
          validateChangePasswordForm(
            {
              current_password: 'oldpassword',
              password: 'changeme',
              confirm_password: 'changeme',
            },
            true
          )
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });

    describe('for another user', () => {
      it('should show errors when there is no new password', () => {
        expect(
          validateChangePasswordForm(
            {
              password: undefined,
              confirm_password: 'changeme',
            } as unknown as ChangePasswordFormValues,
            false
          )
        ).toMatchInlineSnapshot(`
          Object {
            "password": "Enter a new password.",
          }
        `);
      });

      it('should show errors when the new password is not at least 6 characters', () => {
        expect(validateChangePasswordForm({ password: '1234', confirm_password: '1234' }, false))
          .toMatchInlineSnapshot(`
          Object {
            "password": "Enter at least 6 characters.",
          }
        `);
      });

      it('should show errors when new password does not match confirmation password', () => {
        expect(
          validateChangePasswordForm(
            {
              password: 'changeme',
              confirm_password: 'notTheSame',
            },
            false
          )
        ).toMatchInlineSnapshot(`
          Object {
            "confirm_password": "Passwords do not match.",
          }
        `);
      });

      it('should show NO errors', () => {
        expect(
          validateChangePasswordForm(
            {
              password: 'changeme',
              confirm_password: 'changeme',
            },
            false
          )
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });
  });

  // FLAKY: https://github.com/elastic/kibana/issues/254057
  describe.skip('render', () => {
    const coreStart = coreMock.createStart();
    const authc = securityMock.createSetup().authc;
    const history = createMemoryHistory({ initialEntries: ['/users'] });
    const onCancelMock = jest.fn();
    const onSuccessMock = jest.fn();

    const renderChangePasswordModal = (
      username: string,
      defaultValues?: ChangePasswordFormValues
    ) => {
      return render(
        coreStart.rendering.addContext(
          <Providers services={coreStart} authc={authc} history={history}>
            <ChangePasswordModal
              username={username}
              defaultValues={defaultValues}
              onCancel={onCancelMock}
              onSuccess={onSuccessMock}
            />
          </Providers>
        )
      );
    };

    beforeEach(() => {
      jest.clearAllMocks();
      // Mock useCurrentUser to return a different user by default
      jest.spyOn(currentUserModule, 'useCurrentUser').mockReturnValue({
        loading: false,
        value: {
          username: 'different_user',
          roles: [],
          full_name: '',
          email: '',
          enabled: true,
          authentication_realm: { name: 'native', type: 'native' },
          lookup_realm: { name: 'native', type: 'native' },
          authentication_provider: { type: 'basic', name: 'basic' },
          authentication_type: 'realm',
          elastic_cloud_user: false,
          http_authentication_scheme: null,
        },
        error: undefined,
      });
    });

    it(`does not render the current password field when changing another user's password`, () => {
      renderChangePasswordModal('otheruser');

      // Should not show current password field
      expect(
        screen.queryByTestId('editUserChangePasswordCurrentPasswordInput')
      ).not.toBeInTheDocument();

      // Should show new password and confirm password fields
      expect(screen.getByTestId('editUserChangePasswordNewPasswordInput')).toBeInTheDocument();
      expect(screen.getByTestId('editUserChangePasswordConfirmPasswordInput')).toBeInTheDocument();

      // Should show username display
      expect(screen.getByText('otheruser')).toBeInTheDocument();
    });

    it('renders system user warning for kibana user', () => {
      renderChangePasswordModal('kibana');

      expect(screen.getByText('Kibana will lose connection to Elasticsearch')).toBeInTheDocument();
      expect(
        screen.getByText(/After changing the password for the kibana user/)
      ).toBeInTheDocument();
    });

    it('renders system user warning for kibana_system user', () => {
      renderChangePasswordModal('kibana_system');

      expect(screen.getByText('Kibana will lose connection to Elasticsearch')).toBeInTheDocument();
      expect(
        screen.getByText(/After changing the password for the kibana_system user/)
      ).toBeInTheDocument();
    });

    it('renders cancel and submit buttons', () => {
      renderChangePasswordModal('testuser');

      expect(screen.getByTestId('changePasswordFormCancelButton')).toBeInTheDocument();
      expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeInTheDocument();
    });

    it('disables submit button when the form is empty', () => {
      renderChangePasswordModal('testuser');

      const submitButton = screen.getByTestId('changePasswordFormSubmitButton');
      expect(submitButton).toBeDisabled();
    });

    it('disables submit button when passwords do not match', async () => {
      const { unmount } = renderChangePasswordModal('testuser');

      expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();

      const newPasswordInput = screen.getByTestId('editUserChangePasswordNewPasswordInput');
      const confirmPasswordInput = screen.getByTestId('editUserChangePasswordConfirmPasswordInput');

      fireEvent.change(newPasswordInput, { target: { value: 'passwd' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'other1' } });

      await waitFor(() => {
        expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();
      });

      unmount();
    });

    it('disables submit button when password is too short', async () => {
      const { unmount } = renderChangePasswordModal('testuser');

      expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();

      const newPasswordInput = screen.getByTestId('editUserChangePasswordNewPasswordInput');
      const confirmPasswordInput = screen.getByTestId('editUserChangePasswordConfirmPasswordInput');

      fireEvent.change(newPasswordInput, { target: { value: 'short' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'short' } });

      await waitFor(() => {
        expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();
      });

      unmount();
    });

    it('enables submit button when valid matching passwords are entered', async () => {
      const { unmount } = renderChangePasswordModal('testuser');

      expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();

      const newPasswordInput = screen.getByTestId('editUserChangePasswordNewPasswordInput');
      const confirmPasswordInput = screen.getByTestId('editUserChangePasswordConfirmPasswordInput');

      fireEvent.change(newPasswordInput, { target: { value: 'passwd' } });
      fireEvent.change(confirmPasswordInput, { target: { value: 'passwd' } });

      await waitFor(() => {
        expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeEnabled();
      });

      unmount();
    });

    it('calls onCancel when cancel button is clicked', () => {
      const { unmount } = renderChangePasswordModal('testuser');

      const cancelButton = screen.getByTestId('changePasswordFormCancelButton');
      fireEvent.click(cancelButton);

      expect(onCancelMock).toHaveBeenCalledTimes(1);

      unmount();
    });

    describe('when rendered for current user', () => {
      beforeEach(() => {
        // Mock useCurrentUser to return the current user
        jest.spyOn(currentUserModule, 'useCurrentUser').mockReturnValue({
          loading: false,
          value: {
            username: 'currentuser',
            roles: [],
            full_name: '',
            email: '',
            enabled: true,
            authentication_realm: { name: 'native', type: 'native' },
            lookup_realm: { name: 'native', type: 'native' },
            authentication_provider: { type: 'basic', name: 'basic' },
            authentication_type: 'realm',
            elastic_cloud_user: false,
            http_authentication_scheme: null,
          },
          error: undefined,
        });
      });

      it('renders current password field when changing own password', () => {
        renderChangePasswordModal('currentuser');

        // Should show current password field
        expect(
          screen.getByTestId('editUserChangePasswordCurrentPasswordInput')
        ).toBeInTheDocument();

        // Should show new password and confirm password fields
        expect(screen.getByTestId('editUserChangePasswordNewPasswordInput')).toBeInTheDocument();
        expect(
          screen.getByTestId('editUserChangePasswordConfirmPasswordInput')
        ).toBeInTheDocument();

        // Should NOT show username display
        expect(screen.queryByText('currentuser')).not.toBeInTheDocument();
      });

      it('disables submit button when current password is not provided', async () => {
        const { unmount } = renderChangePasswordModal('currentuser');

        expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();

        const newPasswordInput = screen.getByTestId('editUserChangePasswordNewPasswordInput');
        const confirmPasswordInput = screen.getByTestId(
          'editUserChangePasswordConfirmPasswordInput'
        );

        // Fill in new password and confirm password, but not current password
        fireEvent.change(newPasswordInput, { target: { value: 'passwd' } });
        fireEvent.change(confirmPasswordInput, { target: { value: 'passwd' } });

        await waitFor(() => {
          expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();
        });

        unmount();
      });

      it('disables submit button when only current password is provided', async () => {
        const { unmount } = renderChangePasswordModal('currentuser');

        expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();

        const currentPasswordInput = screen.getByTestId(
          'editUserChangePasswordCurrentPasswordInput'
        );

        fireEvent.change(currentPasswordInput, { target: { value: 'curpwd' } });

        await waitFor(() => {
          expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();
        });

        unmount();
      });

      it('disables submit button when passwords do not match', async () => {
        const { unmount } = renderChangePasswordModal('currentuser');

        const currentPasswordInput = screen.getByTestId(
          'editUserChangePasswordCurrentPasswordInput'
        );
        const newPasswordInput = screen.getByTestId('editUserChangePasswordNewPasswordInput');
        const confirmPasswordInput = screen.getByTestId(
          'editUserChangePasswordConfirmPasswordInput'
        );

        fireEvent.change(currentPasswordInput, { target: { value: 'curpwd' } });
        fireEvent.change(newPasswordInput, { target: { value: 'passwd' } });
        fireEvent.change(confirmPasswordInput, { target: { value: 'other1' } });

        await waitFor(() => {
          expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();
        });

        unmount();
      });

      it('disables submit button when password is too short', async () => {
        const { unmount } = renderChangePasswordModal('currentuser');

        const currentPasswordInput = screen.getByTestId(
          'editUserChangePasswordCurrentPasswordInput'
        );
        const newPasswordInput = screen.getByTestId('editUserChangePasswordNewPasswordInput');
        const confirmPasswordInput = screen.getByTestId(
          'editUserChangePasswordConfirmPasswordInput'
        );

        fireEvent.change(currentPasswordInput, { target: { value: 'curpwd' } });
        fireEvent.change(newPasswordInput, { target: { value: 'short' } });
        fireEvent.change(confirmPasswordInput, { target: { value: 'short' } });

        await waitFor(() => {
          expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();
        });

        unmount();
      });

      it('enables submit button when all password fields are valid for current user', async () => {
        const { unmount } = renderChangePasswordModal('currentuser');

        expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeDisabled();

        const currentPasswordInput = screen.getByTestId(
          'editUserChangePasswordCurrentPasswordInput'
        );
        const newPasswordInput = screen.getByTestId('editUserChangePasswordNewPasswordInput');
        const confirmPasswordInput = screen.getByTestId(
          'editUserChangePasswordConfirmPasswordInput'
        );

        fireEvent.change(currentPasswordInput, { target: { value: 'curpwd' } });
        fireEvent.change(newPasswordInput, { target: { value: 'passwd' } });
        fireEvent.change(confirmPasswordInput, { target: { value: 'passwd' } });

        await waitFor(() => {
          expect(screen.getByTestId('changePasswordFormSubmitButton')).toBeEnabled();
        });

        unmount();
      });
    });
  });
});
