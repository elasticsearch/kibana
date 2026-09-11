/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { WebElementWrapper } from '@kbn/ftr-common-functional-ui-services';
import moment from 'moment';
import type { FtrProviderContext } from '../ftr_provider_context';

const START_DATE_PICKER_FORMAT = 'MMM D, YYYY @ HH:mm';

// eslint-disable-next-line import/no-default-export
export default function ({ getService, getPageObject }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const toasts = getService('toasts');
  const browser = getService('browser');
  const dashboard = getPageObject('dashboard');
  const common = getPageObject('common');
  const security = getPageObject('security');
  const retry = getService('retry');
  const reportingFunctional = getService('reportingFunctional');
  const reportingAPI = getService('reportingAPI');
  const comboBox = getService('comboBox');
  const find = getService('find');

  describe('Scheduled Reports Flyout', () => {
    const hasFocus = async (element: WebElementWrapper) => {
      const activeElement = await find.activeElement();
      return (await element._webElement.getId()) === (await activeElement._webElement.getId());
    };

    const getSelection = (element: WebElementWrapper) => {
      return browser.execute((field) => {
        const fieldElement = field as unknown as HTMLInputElement;
        return {
          start: fieldElement.selectionStart,
          end: fieldElement.selectionEnd,
        };
      }, element);
    };

    const setSelection = (element: WebElementWrapper, start: number, end: number) => {
      return browser.execute(
        (field, _start, _end) => {
          // browser.execute converts WebElementWrappers args to the corresponding HTML element
          const fieldElement = field as unknown as HTMLInputElement;
          fieldElement.setSelectionRange(_start, _end);
        },
        element,
        start,
        end
      );
    };

    const navigateToDashboard = async () => {
      await common.navigateToApp('dashboard');
      await dashboard.loadSavedDashboard('Ecom Dashboard');
    };

    const openExportFlyout = async () => {
      await testSubjects.click('exportTopNavButton');
      await testSubjects.click('scheduleExport');
      await testSubjects.existOrFail('exportDerivativeFlyout-scheduledReports');
    };

    const openFlyout = async () => {
      await navigateToDashboard();
      await openExportFlyout();
    };

    const fillInSchedule = async () => {
      const futureDateString = moment()
        .add(1, 'day')
        .startOf('day')
        .hours(10)
        .format(START_DATE_PICKER_FORMAT);
      await testSubjects.setValue('startDatePicker', futureDateString);
      // Close the date picker to prevent it from blocking other fields
      await browser.pressKeys(browser.keys.ESCAPE);
      await testSubjects.setValue('timezoneCombobox', 'UTC');
      // Close the timezone picker to prevent it from blocking other fields
      await browser.pressKeys(browser.keys.ESCAPE);
    };

    before(async () => {
      await reportingFunctional.initEcommerce();
    });

    after(async () => {
      await reportingFunctional.teardownEcommerce();
      await reportingAPI.deleteAllReports();
    });

    afterEach(async () => {
      if (await testSubjects.exists('exportDerivativeFlyout-scheduledReports')) {
        await testSubjects.click('euiFlyoutCloseButton');
      }
      await toasts.dismissIfExists();
    });

    it('validates required fields', async () => {
      await retry.try(() => reportingFunctional.loginReportingManager());
      await openFlyout();

      // Verify the title field is pre-filled with the dashboard name
      const titleInput = await testSubjects.find('reportTitleInput');
      const titleValue = await titleInput.getAttribute('value');
      expect(titleValue).to.equal('Ecom Dashboard');

      // Test date validation with a past date
      const pastDateString = moment().subtract(1, 'day').format(START_DATE_PICKER_FORMAT);

      await testSubjects.setValue('startDatePicker', pastDateString);
      // Close the date picker by pressing Escape key
      await browser.pressKeys(browser.keys.ESCAPE);
      await testSubjects.click('scheduleExportSubmitButton');

      // Verify past date validation error appears, retrying to wait for validation
      await retry.waitFor('form validation', async () =>
        (
          await testSubjects.getVisibleText('exportDerivativeFlyout-scheduledReports')
        ).includes('Start date must be in the future')
      );

      // Fill in all required fields with a future date
      await fillInSchedule();

      // Submit should succeed without email
      await testSubjects.click('scheduleExportSubmitButton');
      await retry.try(async () => {
        const successToast = await toasts.getElementByIndex(1);
        expect(await successToast.getVisibleText()).to.contain('Export scheduled');
      });
    });

    it('validates email fields when email is enabled', async () => {
      await openFlyout();

      // Fill required fields with a future date
      await testSubjects.setValue('reportTitleInput', 'Test Report');
      await fillInSchedule();

      // Enable email
      await testSubjects.click('sendByEmailToggle');

      // Try to submit without email recipient - should show validation error
      await testSubjects.click('scheduleExportSubmitButton');
      await retry.waitFor('form validation', async () =>
        (
          await testSubjects.getVisibleText('exportDerivativeFlyout-scheduledReports')
        ).includes('Provide at least one recipient')
      );

      // Add invalid email - should show validation warning
      await testSubjects.setValue('emailRecipientsCombobox', 'invalid-email');
      await testSubjects.click('scheduleExportSubmitButton');
      expect(
        await testSubjects.getVisibleText('exportDerivativeFlyout-scheduledReports')
      ).to.contain('Email address invalid-email is not valid');

      // Add valid email with subject and message containing template variables
      await testSubjects.setValue('emailRecipientsCombobox', 'user@example.com');
      await testSubjects.setValue('emailSubjectInput', 'Report: {{title}}');
      await testSubjects.setValue(
        'emailMessageTextArea',
        'Generated on {{date}} for {{objectType}}'
      );

      // Submit should succeed
      await testSubjects.click('scheduleExportSubmitButton');
      await retry.try(async () => {
        const successToast = await toasts.getElementByIndex(1);
        expect(await successToast.getVisibleText()).to.contain('Export scheduled');
      });
    });

    it('inserts variable interpolations in email fields correctly', async () => {
      await openFlyout();

      // Fill required fields with a future date
      await fillInSchedule();

      // Enable email
      await testSubjects.click('sendByEmailToggle');

      // Add valid email recipient
      await testSubjects.setValue('emailRecipientsCombobox', 'user@example.com');

      // Add variable to subject field in a specific position
      const subjectField = await testSubjects.find('emailSubjectInput');
      await subjectField.clearValue();
      const subjectPrefix = 'Your report (';
      const subjectSuffix = ') is ready';
      await subjectField.type(`${subjectPrefix}${subjectSuffix}`);
      // Move caret just after the prefix
      await setSelection(subjectField, subjectPrefix.length, subjectPrefix.length);
      // Select the variable to insert
      await testSubjects.click('emailSubjectAddVariableButton');
      await testSubjects.click('title-selectableOption');
      // Check that the variable was inserted at the correct position
      const subject = await subjectField.getAttribute('value');
      let expectedInterpolation = '{{title}}';
      expect(subject).to.equal(`${subjectPrefix}${expectedInterpolation}${subjectSuffix}`);
      // Check that focus was restored to the subject field
      // and the caret was placed after the inserted variable
      await retry.waitFor('subject field to have focus', () => hasFocus(subjectField));
      let selection = await getSelection(subjectField);
      let expectedPosition = subjectPrefix.length + expectedInterpolation.length;
      expect(selection.start).to.equal(expectedPosition);
      expect(selection.end).to.equal(expectedPosition);

      // Add variable to message field in a specific position
      const messageField = await testSubjects.find('emailMessageTextArea');
      await messageField.clearValue();
      const messagePrefix = 'Please find your report file (';
      const messageSuffix = ') attached';
      await messageField.type(`${messagePrefix}${messageSuffix}`);
      // Move caret just after the prefix
      await setSelection(messageField, messagePrefix.length, messagePrefix.length);
      // Select the variable to insert
      await testSubjects.click('emailMessageAddVariableButton');
      await testSubjects.click('filename-selectableOption');
      // Check that the variable was inserted at the correct position
      const message = await messageField.getAttribute('value');
      expectedInterpolation = '{{filename}}';
      expect(message).to.equal(`${messagePrefix}${expectedInterpolation}${messageSuffix}`);
      // Check that focus was restored to the message field
      // and the caret was placed after the inserted variable
      await retry.waitFor('message field to have focus', () => hasFocus(messageField));
      selection = await getSelection(messageField);
      expectedPosition = messagePrefix.length + expectedInterpolation.length;
      expect(selection.start).to.equal(expectedPosition);
      expect(selection.end).to.equal(expectedPosition);

      // Submit should succeed
      await testSubjects.click('scheduleExportSubmitButton');
      await retry.try(async () => {
        const successToast = await toasts.getElementByIndex(1);
        expect(await successToast.getVisibleText()).to.contain('Export scheduled');
      });
    });

    it('without reporting management privileges disables and hides the email recipient fields', async () => {
      // `common.navigateToApp` silently re-authenticates as the default super user (`test_user`,
      // which holds manageReporting) if the reporting_user session is transiently prompted for
      // login on navigation, rendering this non-manager flyout with manager privileges. Confirm
      // we navigated as the reporting user before opening the flyout.
      await retry.try(async () => {
        await reportingFunctional.loginReportingUser();
        await navigateToDashboard();
        const currentUser = await security.getCurrentUser();
        expect(currentUser?.username).to.equal('reporting_user');
      });
      await openExportFlyout();

      // Enable email
      await testSubjects.click('sendByEmailToggle');

      // Non-managers can only email the reports to themselves so the `To` field should be
      // pre-filled and disabled
      const emailToField = await (
        await testSubjects.find('emailRecipientsCombobox')
      ).findByTestSubject('comboBoxSearchInput');
      expect(await emailToField.isEnabled()).to.equal(false);
      expect((await comboBox.getComboBoxSelectedOptions('emailRecipientsCombobox'))[0]).to.equal(
        'reportinguser@example.com'
      );
      // and the Cc and Bcc fields should be hidden
      await testSubjects.missingOrFail('emailCcRecipientsCombobox');
      await testSubjects.missingOrFail('emailBccRecipientsCombobox');
    });
  });
}
