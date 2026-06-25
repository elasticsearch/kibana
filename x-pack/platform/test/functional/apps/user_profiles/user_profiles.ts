/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default ({ getPageObjects, getService }: FtrProviderContext) => {
  const pageObjects = getPageObjects(['common', 'userProfiles', 'settings']);
  const toasts = getService('toasts');

  describe('User Profile Page', () => {
    before(async () => {});

    describe('Details', () => {
      before(async () => {
        await pageObjects.common.navigateToApp('security_account');
      });

      it('should set the full name', async () => {
        await pageObjects.userProfiles.setFullNameInputField('Test User 2');

        await pageObjects.userProfiles.saveUserProfileChanges();

        let toast = await toasts.getTitleAndDismiss();

        expect(toast).to.be('Profile updated');

        await pageObjects.userProfiles.setFullNameInputField('test user');

        await pageObjects.userProfiles.saveUserProfileChanges();

        toast = await toasts.getTitleAndDismiss();

        expect(toast).to.be('Profile updated');
      });

      it('should set the email', async () => {
        await pageObjects.userProfiles.setEmailInputField('test@test.com');

        await pageObjects.userProfiles.saveUserProfileChanges();

        let toast = await toasts.getTitleAndDismiss();

        expect(toast).to.be('Profile updated');

        await pageObjects.userProfiles.setEmailInputField('', true);

        await pageObjects.userProfiles.saveUserProfileChanges();

        toast = await toasts.getTitleAndDismiss();

        expect(toast).to.be('Profile updated');
      });
    });

    describe('Change Password', () => {
      before(async () => {
        await pageObjects.common.navigateToApp('security_account');
      });

      it('should set the current password and enter a new password, then submit', async () => {
        const changePasswordButton = await pageObjects.userProfiles.getChangePasswordButton();
        await changePasswordButton.click();

        await pageObjects.userProfiles.setCurrentPasswordField('changeme');
        await pageObjects.userProfiles.setNewPasswordField('changeme2');
        await pageObjects.userProfiles.setConfirmPasswordField('changeme2');

        const submitButton = await pageObjects.userProfiles.getChangePasswordFormSubmitButton();
        await submitButton.click();

        const initialToast = await toasts.getTitleAndDismiss();

        expect(initialToast).to.be('Password successfully changed');

        await changePasswordButton.click();

        await pageObjects.userProfiles.setCurrentPasswordField('changeme2');
        await pageObjects.userProfiles.setNewPasswordField('changeme');
        await pageObjects.userProfiles.setConfirmPasswordField('changeme');

        await submitButton.click();

        const resetToast = await toasts.getTitleAndDismiss();

        expect(resetToast).to.be('Password successfully changed');
      });
    });

    describe('Theme', () => {
      it('should change theme based on the User Profile Theme control with default Adv. Settings value (light)', async () => {
        await pageObjects.common.navigateToApp('security_account');

        const themeKeyPadMenu = await pageObjects.userProfiles.getThemeKeypadMenu();
        expect(themeKeyPadMenu).not.to.be(null);

        await pageObjects.userProfiles.changeUserProfileTheme('dark');
        const darkModeTag = await pageObjects.userProfiles.getThemeTag();
        expect(darkModeTag).to.be('borealisdark');

        await pageObjects.userProfiles.changeUserProfileTheme('light');
        const lightModeTag = await pageObjects.userProfiles.getThemeTag();
        expect(lightModeTag).to.be('borealislight');

        await pageObjects.userProfiles.changeUserProfileTheme('space_default');
        const spaceDefaultModeTag = await pageObjects.userProfiles.getThemeTag();
        expect(spaceDefaultModeTag).to.be('borealislight');
      });

      it('should change theme based on the User Profile Theme control with default Adv. Settings value set to dark', async () => {
        await pageObjects.common.navigateToUrl('management', 'kibana/settings', {
          basePath: '',
          ensureCurrentUrl: false,
          shouldLoginIfPrompted: false,
          shouldUseHashForSubUrl: false,
        });

        let advancedSetting = await pageObjects.settings.getAdvancedSettings('theme:darkMode');
        expect(advancedSetting).to.be('system');

        await pageObjects.settings.setAdvancedSettingsSelect('theme:darkMode', 'enabled');
        advancedSetting = await pageObjects.settings.getAdvancedSettings('theme:darkMode');
        expect(advancedSetting).to.be('enabled');

        await pageObjects.common.navigateToApp('security_account');

        let spaceDefaultModeTag = await pageObjects.userProfiles.getThemeTag();
        expect(spaceDefaultModeTag).to.be('borealisdark');

        await pageObjects.userProfiles.changeUserProfileTheme('light');
        const lightModeTag = await pageObjects.userProfiles.getThemeTag();
        expect(lightModeTag).to.be('borealislight');

        await pageObjects.userProfiles.changeUserProfileTheme('dark');
        const darkModeTag = await pageObjects.userProfiles.getThemeTag();
        expect(darkModeTag).to.be('borealisdark');

        await pageObjects.userProfiles.changeUserProfileTheme('space_default');
        spaceDefaultModeTag = await pageObjects.userProfiles.getThemeTag();
        expect(spaceDefaultModeTag).to.be('borealisdark');

        await pageObjects.common.navigateToUrl('management', 'kibana/settings', {
          basePath: '',
          ensureCurrentUrl: false,
          shouldLoginIfPrompted: false,
          shouldUseHashForSubUrl: false,
        });

        await pageObjects.settings.setAdvancedSettingsSelect('theme:darkMode', 'disabled');
        advancedSetting = await pageObjects.settings.getAdvancedSettings('theme:darkMode');
        expect(advancedSetting).to.be('disabled');
      });
    });
  });
};
