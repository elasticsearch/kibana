/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldPassword,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiIcon,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSkeletonText,
  EuiSpacer,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { FunctionComponent } from 'react';
import React from 'react';

import { useCurrentUser } from '@kbn/core-user-profile-browser';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { euiThemeVars } from '@kbn/ui-theme';

import type { ValidationErrors } from '../../../components/use_form';
import { useForm } from '../../../components/use_form';
import { useInitialFocus } from '../../../components/use_initial_focus';
import { UserAPIClient } from '../user_api_client';

const MIN_PASSWORD_LENGTH = 6;

export interface ChangePasswordFormValues {
  current_password?: string;
  password: string;
  confirm_password: string;
}

export interface ChangePasswordModalProps {
  username: string;
  defaultValues?: ChangePasswordFormValues;
  onCancel(): void;
  onSuccess?(): void;
}

export const validateChangePasswordForm = (
  values: ChangePasswordFormValues,
  isCurrentUser: boolean
) => {
  const errors: ValidationErrors<typeof values> = {};

  if (isCurrentUser) {
    if (!values.current_password) {
      errors.current_password = i18n.translate(
        'xpack.security.management.users.changePasswordForm.currentPasswordRequiredError',
        { defaultMessage: 'Enter your current password.' }
      );
    }
  }

  if (!values.password) {
    errors.password = i18n.translate(
      'xpack.security.management.users.changePasswordForm.passwordRequiredError',
      { defaultMessage: 'Enter a new password.' }
    );
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = i18n.translate(
      'xpack.security.management.users.changePasswordForm.passwordInvalidError',
      {
        defaultMessage: 'Enter at least {minLength} characters.',
        values: { minLength: MIN_PASSWORD_LENGTH },
      }
    );
  } else if (values.password !== values.confirm_password) {
    errors.confirm_password = i18n.translate(
      'xpack.security.management.users.changePasswordForm.confirmPasswordInvalidError',
      { defaultMessage: 'Passwords do not match.' }
    );
  }

  return errors;
};

export const ChangePasswordModal: FunctionComponent<ChangePasswordModalProps> = ({
  username,
  defaultValues = {
    current_password: '',
    password: '',
    confirm_password: '',
  },
  onSuccess,
  onCancel,
}) => {
  const { services } = useKibana();
  const { rawAuthQuery } = useCurrentUser({ includeRawQuerySource: true });
  const isCurrentUser = rawAuthQuery.state?.username === username;
  const isLoading = rawAuthQuery.isLoading;
  const isSystemUser = username === 'kibana' || username === 'kibana_system';

  const [form, { onBlur, ...eventHandlers }] = useForm({
    onSubmit: async (values) => {
      try {
        await new UserAPIClient(services.http!).changePassword(
          username,
          values.password,
          values.current_password
        );
        services.notifications!.toasts.addSuccess(
          i18n.translate('xpack.security.management.users.changePasswordForm.successMessage', {
            defaultMessage: 'Password successfully changed',
          })
        );
        onSuccess?.();
      } catch (error) {
        if ((error as any).body?.statusCode === 403) {
          form.setError(
            'current_password',
            i18n.translate(
              'xpack.security.management.users.changePasswordForm.currentPasswordInvalidError',
              { defaultMessage: 'Invalid password.' }
            )
          );
        } else {
          services.notifications!.toasts.addDanger({
            title: i18n.translate(
              'xpack.security.management.users.changePasswordForm.errorMessage',
              { defaultMessage: 'Could not change password' }
            ),
            text: (error as any).body?.message || error.message,
          });
          throw error;
        }
      }
    },
    validate: async (values) => validateChangePasswordForm(values, isCurrentUser),
    defaultValues,
  });

  // For some reason, the focus-lock dependency that EuiModal uses to accessibly trap focus
  // is fighting the form `onBlur` and causing focus to be lost when clicking between password
  // fields, so this workaround waits a tick before validating the form on blur
  const validateFormOnBlur = (event: React.FocusEvent<HTMLFormElement & HTMLInputElement>) => {
    requestAnimationFrame(() => onBlur(event));
  };

  const firstFieldRef = useInitialFocus<HTMLInputElement>([isLoading]);
  const modalFormId = useGeneratedHtmlId({ prefix: 'modalForm' });

  const modalTitleId = useGeneratedHtmlId({ prefix: 'changePasswordModalTitle' });

  return (
    <EuiModal onClose={onCancel} aria-labelledby={modalTitleId}>
      <EuiModalHeader>
        <EuiModalHeaderTitle id={modalTitleId} data-test-subj="confirmModalTitleText">
          <FormattedMessage
            id="xpack.security.management.users.changePasswordForm.title"
            defaultMessage="Change password"
          />
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiSkeletonText isLoading={isLoading}>
          <EuiForm
            id={modalFormId}
            component="form"
            noValidate
            {...eventHandlers}
            onBlur={validateFormOnBlur}
          >
            {isSystemUser ? (
              <>
                <EuiCallOut
                  announceOnMount
                  title={i18n.translate(
                    'xpack.security.management.users.changePasswordForm.systemUserTitle',
                    { defaultMessage: 'Kibana will lose connection to Elasticsearch' }
                  )}
                  color="danger"
                  iconType="warning"
                  style={{ maxWidth: euiThemeVars.euiFormMaxWidth }}
                >
                  <p>
                    <FormattedMessage
                      id="xpack.security.management.users.changePasswordForm.systemUserWarning"
                      defaultMessage="After changing the password for the {username} user, Kibana will be unusable."
                      values={{ username }}
                    />
                  </p>
                  <p>
                    <FormattedMessage
                      id="xpack.security.management.users.changePasswordForm.systemUserDescription"
                      defaultMessage="To regain access, update your config file with the new password and restart Kibana."
                    />
                  </p>
                </EuiCallOut>
                <EuiSpacer />
              </>
            ) : undefined}

            {isCurrentUser ? (
              <>
                <EuiFormRow
                  label={i18n.translate(
                    'xpack.security.management.users.changePasswordForm.currentPasswordLabel',
                    { defaultMessage: 'Current password' }
                  )}
                  error={form.errors.current_password}
                  isInvalid={form.touched.current_password && !!form.errors.current_password}
                >
                  <EuiFieldPassword
                    name="current_password"
                    type="dual"
                    defaultValue={form.values.current_password}
                    isInvalid={form.touched.current_password && !!form.errors.current_password}
                    autoComplete="current-password"
                    inputRef={firstFieldRef}
                    data-test-subj="editUserChangePasswordCurrentPasswordInput"
                  />
                </EuiFormRow>
              </>
            ) : (
              <EuiFormRow
                label={i18n.translate(
                  'xpack.security.management.users.changePasswordForm.userLabel',
                  { defaultMessage: 'User' }
                )}
              >
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="user" aria-hidden={true} />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiSpacer size="xs" />
                    <EuiText>{username}</EuiText>
                    <EuiSpacer size="xs" />
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFormRow>
            )}

            <EuiFormRow
              label={i18n.translate(
                'xpack.security.management.users.changePasswordForm.passwordLabel',
                { defaultMessage: 'New password' }
              )}
              helpText={i18n.translate(
                'xpack.security.management.users.changePasswordForm.passwordHelpText',
                {
                  defaultMessage: 'Password must be at least {minLength} characters.',
                  values: { minLength: MIN_PASSWORD_LENGTH },
                }
              )}
              error={form.errors.password}
              isInvalid={form.touched.password && !!form.errors.password}
            >
              <EuiFieldPassword
                name="password"
                type="dual"
                defaultValue={form.values.password}
                isInvalid={form.touched.password && !!form.errors.password}
                autoComplete="new-password"
                inputRef={isCurrentUser ? undefined : firstFieldRef}
                data-test-subj="editUserChangePasswordNewPasswordInput"
              />
            </EuiFormRow>
            <EuiFormRow
              label={i18n.translate(
                'xpack.security.management.users.changePasswordForm.confirmPasswordLabel',
                { defaultMessage: 'Confirm password' }
              )}
              error={form.errors.confirm_password}
              isInvalid={form.touched.confirm_password && !!form.errors.confirm_password}
            >
              <EuiFieldPassword
                name="confirm_password"
                type="dual"
                defaultValue={form.values.confirm_password}
                isInvalid={form.touched.confirm_password && !!form.errors.confirm_password}
                autoComplete="new-password"
                data-test-subj="editUserChangePasswordConfirmPasswordInput"
              />
            </EuiFormRow>
          </EuiForm>
        </EuiSkeletonText>
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty
          data-test-subj="changePasswordFormCancelButton"
          aria-label={i18n.translate(
            'xpack.security.management.users.changePasswordForm.cancelButtonLabel',
            {
              defaultMessage: 'Cancel password change',
            }
          )}
          isDisabled={form.isSubmitting}
          onClick={onCancel}
        >
          <FormattedMessage
            id="xpack.security.changePasswordForm.cancelButton"
            defaultMessage="Cancel"
          />
        </EuiButtonEmpty>
        <EuiButton
          iconType="lock"
          type="submit"
          form={modalFormId}
          data-test-subj="changePasswordFormSubmitButton"
          isLoading={form.isSubmitting}
          isDisabled={
            isLoading ||
            form.isInvalid ||
            !form.values.password ||
            !form.values.confirm_password ||
            (isCurrentUser && !form.values.current_password)
          }
          color={isSystemUser ? 'danger' : undefined}
          fill
        >
          <FormattedMessage
            id="xpack.security.changePasswordForm.confirmButton"
            defaultMessage="{isSubmitting, select, true{Changing password…} other{Change password}}"
            values={{ isSubmitting: form.isSubmitting }}
          />
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
};
