/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { adminTestUser } from '@kbn/test';
import type {
  AuthenticatedUser,
  Role,
  RoleRemoteClusterPrivilege,
} from '@kbn/security-plugin/common';
import type { UserFormValues } from '@kbn/security-plugin/public/management/users/edit_user/user_form';
import { Key } from 'selenium-webdriver';
import { FtrService } from '../ftr_provider_context';

interface LoginOptions {
  expectSpaceSelector?: boolean;
  expectSuccess?: boolean;
  expectForbidden?: boolean;
}

type LoginExpectedResult =
  | 'spaceSelector'
  | 'error'
  | 'chrome'
  | (() => unknown | Promise<unknown>);

export class SecurityPageObject extends FtrService {
  private readonly browser = this.ctx.getService('browser');
  private readonly config = this.ctx.getService('config');
  private readonly retry = this.ctx.getService('retry');
  private readonly find = this.ctx.getService('find');
  private readonly log = this.ctx.getService('log');
  private readonly testSubjects = this.ctx.getService('testSubjects');
  private readonly esArchiver = this.ctx.getService('esArchiver');
  private readonly kibanaServer = this.ctx.getService('kibanaServer');
  private readonly userMenu = this.ctx.getService('userMenu');
  private readonly comboBox = this.ctx.getService('comboBox');
  private readonly supertest = this.ctx.getService('supertestWithoutAuth');
  private readonly deployment = this.ctx.getService('deployment');
  private readonly common = this.ctx.getPageObject('common');
  private readonly header = this.ctx.getPageObject('header');
  private readonly monacoEditor = this.ctx.getService('monacoEditor');
  private readonly es = this.ctx.getService('es');
  // cookieAuth / browserAuth are only registered in stateful functional configs.
  // Use hasService guards so SecurityPageObject remains safe in serverless configs too.
  private readonly cookieAuth = this.ctx.hasService('cookieAuth')
    ? this.ctx.getService('cookieAuth')
    : undefined;
  private readonly browserAuth = this.ctx.hasService('browserAuth')
    ? this.ctx.getService('browserAuth')
    : undefined;

  delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  public loginPage = Object.freeze({
    login: async (username?: string, password?: string, options: LoginOptions = {}) => {
      if (!(await this.isLoginFormVisible())) {
        await this.common.navigateToApp('login');
      }

      // ensure welcome screen won't be shown. This is relevant for environments which don't allow
      // to use the yml setting, e.g. cloud
      await this.browser.setLocalStorageItem('home:welcome:show', 'false');
      await this.waitForLoginForm();

      await this.testSubjects.setValue('loginUsername', username || adminTestUser.username);
      await this.testSubjects.setValue('loginPassword', password || adminTestUser.password);
      await this.testSubjects.click('loginSubmit');

      await this.waitForLoginResult(
        options.expectSpaceSelector
          ? 'spaceSelector'
          : options.expectForbidden
          ? 'error'
          : options.expectSuccess
          ? 'chrome'
          : undefined
      );
    },

    getInfoMessage: async () => {
      return await this.retry.try(async () => {
        const infoMessageContainer = await this.retry.try(() =>
          this.testSubjects.find('loginInfoMessage')
        );
        const infoMessageText = await infoMessageContainer.getVisibleText();

        if (!infoMessageText) {
          throw new Error('Login Info Message not present yet');
        }

        return infoMessageText;
      });
    },

    getErrorMessage: async () => {
      return await this.retry.try(async () => {
        const errorMessageContainer = await this.retry.try(() =>
          this.testSubjects.find('loginErrorMessage')
        );
        const errorMessageText = await errorMessageContainer.getVisibleText();

        if (!errorMessageText) {
          throw new Error('Login Error Message not present yet');
        }

        return errorMessageText;
      });
    },
  });

  public loginSelector = Object.freeze({
    login: async (
      providerType: string,
      providerName: string,
      options?: Omit<Record<string, any>, 'expectedLoginResult'> & {
        expectedLoginResult?: LoginExpectedResult;
      }
    ) => {
      this.log.debug(`Starting login flow for ${providerType}/${providerName}`);

      await this.loginSelector.verifyLoginSelectorIsVisible();
      await this.loginSelector.selectLoginMethod(providerType, providerName);

      if (providerType === 'basic' || providerType === 'token') {
        await this.waitForLoginForm();

        await this.testSubjects.setValue(
          'loginUsername',
          options?.username ?? adminTestUser.username
        );
        await this.testSubjects.setValue(
          'loginPassword',
          options?.password ?? adminTestUser.password
        );
        await this.testSubjects.click('loginSubmit');
      }

      await this.waitForLoginResult(options?.expectedLoginResult ?? 'chrome');

      this.log.debug(`Finished login process currentUrl = ${await this.browser.getCurrentUrl()}`);
    },

    selectLoginMethod: async (providerType: string, providerName: string) => {
      // Ensure welcome screen won't be shown. This is relevant for environments which don't allow
      // to use the yml setting, e.g. cloud.
      await this.browser.setLocalStorageItem('home:welcome:show', 'false');
      await this.testSubjects.click(`loginCard-${providerType}/${providerName}`);
    },

    verifyLoginFormIsVisible: async () => {
      await this.waitForLoginForm();
    },

    verifyLoginSelectorIsVisible: async () => {
      await this.waitForLoginSelector();
    },

    verifyLoginHelpIsVisible: async (helpText: string) => {
      await this.waitForLoginHelp(helpText);
    },
  });

  private async waitForLoginPage() {
    this.log.debug('Waiting for Login Page to appear.');
    await this.retry.waitForWithTimeout(
      'login page',
      this.config.get('timeouts.waitFor') * 5,
      async () => {
        // As a part of the cleanup flow tests usually try to log users out, but there are cases when
        // browser/Kibana would like users to confirm that they want to navigate away from the current
        // page and lose the state (e.g. unsaved changes) via native alert dialog.
        const alert = await this.browser.getAlert();
        if (alert && alert.accept) {
          await alert.accept();
        }
        return await this.isLoginFormVisible();
      }
    );
  }

  public async isLoginFormVisible() {
    return await this.testSubjects.exists('loginForm');
  }

  private async waitForLoginForm() {
    this.log.debug('Waiting for Login Form to appear.');
    await this.retry.waitForWithTimeout(
      'login form',
      this.config.get('timeouts.waitFor') * 5,
      async () => {
        return await this.isLoginFormVisible();
      }
    );
  }

  private async waitForLoginSelector() {
    this.log.debug('Waiting for Login Selector to appear.');
    await this.retry.waitForWithTimeout(
      'login selector',
      this.config.get('timeouts.waitFor') * 5,
      async () => {
        return await this.testSubjects.exists('loginSelector');
      }
    );
  }

  private async waitForLoginHelp(helpText: string) {
    this.log.debug(`Waiting for Login Help to appear with text: ${helpText}.`);
    await this.retry.waitForWithTimeout(
      'login help',
      this.config.get('timeouts.waitFor') * 5,
      async () => {
        return (await this.testSubjects.getVisibleText('loginHelp')) === helpText;
      }
    );
  }

  private async waitForLoginResult(expectedResult?: LoginExpectedResult) {
    this.log.debug(`Waiting for login result, expected: ${expectedResult}.`);

    // wait for either space selector, kibanaChrome or loginErrorMessage
    if (expectedResult === 'spaceSelector') {
      await this.retry.try(() => this.testSubjects.find('kibanaSpaceSelector'));
      this.log.debug(
        `Finished login process, landed on space selector. currentUrl = ${await this.browser.getCurrentUrl()}`
      );
      return;
    }

    if (expectedResult === 'error') {
      const rawDataTabLocator = 'a[id=rawdata-tab]';
      if (await this.find.existsByCssSelector(rawDataTabLocator)) {
        // Firefox has 3 tabs and requires navigation to see Raw output
        await this.find.clickByCssSelector(rawDataTabLocator);
      }
      await this.retry.try(async () => {
        if (await this.find.existsByCssSelector(rawDataTabLocator)) {
          await this.find.clickByCssSelector(rawDataTabLocator);
        }
        await this.testSubjects.existOrFail('ResetSessionButton');
      });
      this.log.debug(
        `Finished login process, found reset session button message. currentUrl = ${await this.browser.getCurrentUrl()}`
      );
      return;
    }

    if (expectedResult === 'chrome') {
      await this.find.byCssSelector('[data-test-subj="userMenuAvatar"]', 20000);
      this.log.debug(`Finished login process currentUrl = ${await this.browser.getCurrentUrl()}`);
    }

    if (expectedResult instanceof Function) {
      await expectedResult();
      this.log.debug(
        `Finished login process, await for custom condition. currentUrl = ${await this.browser.getCurrentUrl()}`
      );
    }
  }

  async initTests() {
    this.log.debug('SecurityPage:initTests');
    await this.kibanaServer.savedObjects.cleanStandardList();
    await this.esArchiver.loadIfNeeded(
      'x-pack/platform/test/fixtures/es_archives/logstash_functional'
    );
    await this.browser.setWindowSize(1600, 1000);
  }

  async login(username?: string, password?: string, options: LoginOptions = {}) {
    // When the cookie-login flag is on and we're not testing edge cases that require the
    // real login form (space-selector or forbidden redirects), bypass form fill entirely.
    if (
      this.config.get('security.cookieLogin') &&
      this.cookieAuth &&
      this.browserAuth &&
      !options.expectSpaceSelector &&
      !options.expectForbidden
    ) {
      const resolvedUsername = username || adminTestUser.username;
      const resolvedPassword = password || adminTestUser.password;
      const cookie = await this.cookieAuth.getCookieForUser(resolvedUsername, resolvedPassword);
      await this.browserAuth.loginByCookie(cookie, { expectedUsername: resolvedUsername });
      return;
    }

    await this.loginPage.login(username, password, options);

    if (options.expectSpaceSelector || options.expectForbidden) {
      return;
    }

    await this.retry.waitFor(
      'logout button visible',
      async () => await this.userMenu.logoutLinkExists()
    );
  }

  async logout() {
    this.log.debug('SecurityPage.logout');

    if (!(await this.userMenu.logoutLinkExists())) {
      this.log.debug('Logout not found');
      return;
    }

    await this.userMenu.clickLogoutButton();
    await this.waitForLoginPage();
  }

  async getCurrentUser() {
    const sidCookie = await this.browser.getCookie('sid');
    if (!sidCookie?.value) {
      this.log.debug('User is not authenticated yet.');
      return null;
    }

    const { body: user } = await this.supertest
      .get('/internal/security/me')
      .set('kbn-xsrf', 'xxx')
      .set('Cookie', `sid=${sidCookie.value}`)
      .expect(200);
    return user as AuthenticatedUser;
  }

  async forceLogout(
    { waitForLoginPage }: { waitForLoginPage: boolean } = { waitForLoginPage: true }
  ) {
    this.log.debug('SecurityPage.forceLogout');
    if (await this.isLoginFormVisible()) {
      this.log.debug('Already on the login page, not forcing anything');
      return;
    }

    // When cookie-login is active, skip the /logout server round-trip entirely.
    // Clearing browser state is sufficient for test isolation — the next navigateToApp
    // will redirect to /login and loginIfPrompted will inject a fresh cookie.
    if (this.config.get('security.cookieLogin') && this.browserAuth) {
      this.log.debug(
        '[security] cookieLogin: clearing browser state instead of navigating to /logout'
      );
      await this.browserAuth.cleanBrowserState();
      return;
    }

    const performForceLogout = async () => {
      this.log.debug(`Redirecting to ${this.deployment.getHostPort()}/logout to force the logout`);
      const url = this.deployment.getHostPort() + '/logout';
      await this.browser.get(url);
      // A previous test might leave unsaved changes and trigger a native beforeunload dialog on navigation.
      // Accept it immediately so subsequent WebDriver commands don't fail.
      const navigationAlert = await this.browser.getAlert();
      await navigationAlert?.accept();

      // After logging out, the user can be redirected to various locations depending on the context. By default, we
      // expect the user to be redirected to the login page. However, if the login page is not available for some reason,
      // we should simply wait until the user is redirected *elsewhere*.
      if (waitForLoginPage) {
        this.log.debug('Waiting on the login form to appear');
        await this.waitForLoginPage();
      } else {
        this.log.debug('Waiting for logout to complete');
        await this.retry.waitFor('logout to complete', async () => {
          // There are cases when browser/Kibana would like users to confirm that they want to navigate away from the
          // current page and lose the state (e.g. unsaved changes) via native alert dialog.
          const alert = await this.browser.getAlert();
          if (alert?.accept) {
            await alert.accept();
          }

          // Timeout has been doubled to 40s here in attempt to quiet the flakiness
          await this.retry.waitForWithTimeout('URL redirects to finish', 40000, async () => {
            const urlBefore = await this.browser.getCurrentUrl();
            await this.delay(1000);
            const urlAfter = await this.browser.getCurrentUrl();
            this.log.debug(`Expecting before URL '${urlBefore}' to equal after URL '${urlAfter}'`);
            return urlAfter === urlBefore;
          });

          const currentUrl = await this.browser.getCurrentUrl();
          if (this.config.get('serverless')) {
            // Logout might trigger multiple redirects, but in the end we expect the Cloud login page
            return currentUrl.includes('/login') || currentUrl.includes('/projects');
          } else {
            return !currentUrl.includes('/logout');
          }
        });
      }
    };

    await this.retry.tryWithRetries('force logout with retries', performForceLogout, {
      retryCount: 2,
    });
  }

  async clickRolesSection() {
    await this.testSubjects.click('roles');
  }

  async clickUsersSection() {
    await this.testSubjects.click('users');
  }

  async clickCreateNewUser() {
    await this.retry.try(() => this.testSubjects.click('createUserButton'));
  }

  async clickCreateNewRole() {
    await this.retry.try(() => this.testSubjects.click('createRoleButton'));
  }

  async clickCloneRole(roleName: string) {
    await this.retry.try(() => this.testSubjects.click(`clone-role-action-${roleName}`));
  }

  async clickCancelEditUser() {
    await this.find.clickByButtonText('Cancel');
  }

  async clickCancelEditRole() {
    await this.testSubjects.click('roleFormCancelButton');
  }

  async clickSaveEditUser() {
    await this.find.clickByButtonText('Update user');
    await this.header.waitUntilLoadingHasFinished();
  }

  async clickSaveCreateUser() {
    await this.find.clickByButtonText('Create user');
    await this.header.waitUntilLoadingHasFinished();
  }

  async clickSaveEditRole() {
    const saveButton = await this.retry.try(() => this.testSubjects.find('roleFormSaveButton'));
    await saveButton.moveMouseTo();
    await saveButton.click();
    await this.header.waitUntilLoadingHasFinished();
  }

  async addIndexToRole(index: string) {
    this.log.debug(`Adding index ${index} to role`);
    await this.comboBox.setCustom('indicesInput0', index);
  }

  async addPrivilegeToRole(privilege: string) {
    this.log.debug(`Adding privilege "${privilege}" to role`);
    const privilegesField = await this.testSubjects.find('privilegesInput0');
    const privilegesInput = await privilegesField.findByTagName('input');
    await privilegesInput.type(privilege);
    await privilegesInput.pressKeys(Key.ENTER); // Add typed privilege to combo box
    await privilegesInput.pressKeys(Key.ESCAPE); // Close dropdown menu to avoid hiding elements from test runner
  }

  async assignRoleToUser(role: string) {
    await this.selectRole(role);
  }

  async navigateTo() {
    await this.common.navigateToApp('settings');
  }

  async clickElasticsearchUsers() {
    await this.navigateTo();
    await this.clickUsersSection();
  }

  async clickElasticsearchRoles() {
    await this.navigateTo();
    await this.clickRolesSection();
  }

  async getElasticsearchUsers() {
    const users = [];
    await this.testSubjects.click('tablePaginationPopoverButton');
    await this.testSubjects.click('tablePagination-100-rows');
    for (const user of await this.testSubjects.findAll('userRow')) {
      const fullnameElement = await user.findByTestSubject('userRowFullName');
      const usernameElement = await user.findByTestSubject('userRowUserName');
      const emailElement = await user.findByTestSubject('userRowEmail');
      const rolesElement = await user.findByTestSubject('userRowRoles');
      // findAll is substantially faster than `find.descendantExistsByCssSelector for negative cases
      const isUserReserved = (await user.findAllByTestSubject('userReserved', 1)).length > 0;
      const isUserDeprecated = (await user.findAllByTestSubject('userDeprecated', 1)).length > 0;
      const isEnabled = (await user.findAllByTestSubject('userDisabled', 1)).length === 0;
      users.push({
        username: await usernameElement.getVisibleText(),
        fullname: await fullnameElement.getVisibleText(),
        email: await emailElement.getVisibleText(),
        roles: (await rolesElement.getVisibleText()).split('\n').map((role) => role.trim()),
        reserved: isUserReserved,
        deprecated: isUserDeprecated,
        enabled: isEnabled,
      });
    }

    return users;
  }

  async getElasticsearchRoles() {
    const roles = [];
    await this.testSubjects.exists('rolesTable');
    await this.testSubjects.click('tablePaginationPopoverButton');
    await this.testSubjects.click('tablePagination-100-rows');
    await this.testSubjects.exists('rolesTableLoading');
    await this.testSubjects.exists('rolesTable');

    for (const role of await this.testSubjects.findAll('roleRow')) {
      const [rolename, reserved, deprecated] = await Promise.all([
        role.findByTestSubject('roleRowName').then((el) => el.getVisibleText()),
        // findAll is substantially faster than `find.descendantExistsByCssSelector for negative cases
        role.findAllByTestSubject('roleReserved', 1).then((el) => el.length > 0),
        // findAll is substantially faster than `find.descendantExistsByCssSelector for negative cases
        role.findAllByTestSubject('roleDeprecated', 1).then((el) => el.length > 0),
      ]);

      roles.push({ rolename, reserved, deprecated });
    }

    return roles;
  }

  /**
   * @deprecated Use `this.security.clickCreateNewUser` instead
   */
  async clickNewUser() {
    return await this.testSubjects.click('createUserButton');
  }

  /**
   * @deprecated Use `this.security.clickCreateNewUser` instead
   */
  async clickNewRole() {
    return await this.testSubjects.click('createRoleButton');
  }

  async fillUserForm(user: UserFormValues) {
    if (user.username) {
      await this.find.setValue('[name=username]', user.username);
    }
    if (user.password) {
      await this.find.setValue('[name=password]', user.password);
    }
    if (user.confirm_password) {
      await this.find.setValue('[name=confirm_password]', user.confirm_password);
    }
    if (user.full_name) {
      await this.find.setValue('[name=full_name]', user.full_name);
    }
    if (user.email) {
      await this.find.setValue('[name=email]', user.email);
    }

    const rolesToAdd = user.roles || [];
    for (let i = 0; i < rolesToAdd.length; i++) {
      await this.selectRole(rolesToAdd[i]);
    }
  }

  async updateUserProfileForm(user: UserFormValues) {
    if (user.full_name) {
      await this.find.setValue('[name=full_name]', user.full_name);
    }
    if (user.email) {
      await this.find.setValue('[name=email]', user.email);
    }
  }

  async submitCreateUserForm() {
    await this.find.clickByButtonText('Create user');
  }

  async submitUpdateUserForm() {
    await this.find.clickByButtonText('Update user');
  }

  async backToUsersList() {
    await this.find.clickByButtonText('Back to users');
  }

  async createUser(user: UserFormValues) {
    await this.clickElasticsearchUsers();
    await this.clickCreateNewUser();
    await this.fillUserForm(user);
    await this.submitCreateUserForm();
  }

  async clickUserByUserName(username: string) {
    await this.find.clickByDisplayedLinkText(username);
    await this.header.awaitGlobalLoadingIndicatorHidden();
  }

  async updateUserPassword(user: UserFormValues, isCurrentUser: boolean = false) {
    await this.clickUserByUserName(user.username ?? '');
    await this.testSubjects.click('editUserChangePasswordButton');
    if (isCurrentUser) {
      await this.testSubjects.setValue(
        'editUserChangePasswordCurrentPasswordInput',
        user.current_password ?? ''
      );
    }
    await this.testSubjects.setValue('editUserChangePasswordNewPasswordInput', user.password ?? '');
    await this.testSubjects.setValue(
      'editUserChangePasswordConfirmPasswordInput',
      user.confirm_password ?? ''
    );
    await this.testSubjects.click('changePasswordFormSubmitButton');
  }

  async updateUserProfile(user: UserFormValues) {
    await this.clickUserByUserName(user.username ?? '');
    await this.updateUserProfileForm(user);
    await this.submitUpdateUserForm();
  }

  async deactivatesUser(user: UserFormValues) {
    await this.clickUserByUserName(user.username ?? '');
    await this.testSubjects.click('editUserDisableUserButton');
    await this.testSubjects.click('confirmModalConfirmButton');
    await this.testSubjects.missingOrFail('confirmModalConfirmButton');
    if (user.username) {
      await this.retry.waitForWithTimeout('ES to acknowledge deactivation', 15000, async () => {
        const userResponse = await this.es.security.getUser({ username: user.username });
        return userResponse[user.username!].enabled === false;
      });
    }
    await this.backToUsersList();
  }

  async activatesUser(user: UserFormValues) {
    await this.clickUserByUserName(user.username ?? '');
    await this.testSubjects.click('editUserEnableUserButton');
    await this.testSubjects.click('confirmModalConfirmButton');
    await this.testSubjects.missingOrFail('confirmModalConfirmButton');
    if (user.username) {
      await this.retry.waitForWithTimeout('ES to acknowledge activation', 15000, async () => {
        const userResponse = await this.es.security.getUser({ username: user.username });
        return userResponse[user.username!].enabled === true;
      });
    }
    await this.backToUsersList();
  }

  async deleteUser(username: string) {
    this.log.debug('Delete user ' + username);
    await this.clickUserByUserName(username);

    this.log.debug('Find delete button and click');
    await this.find.clickByButtonText('Delete user');
    await this.common.sleep(2000);

    const confirmText = await this.testSubjects.getVisibleText('confirmModalBodyText');
    this.log.debug('Delete user alert text = ' + confirmText);
    await this.testSubjects.click('confirmModalConfirmButton');
    return confirmText;
  }

  async addRemoteClusterPrivilege(privilege: RoleRemoteClusterPrivilege, index = 0) {
    this.log.debug('addRemoteClusterPrivilege, index = ', index);

    await this.testSubjects.click('addRemoteClusterPrivilegesButton');

    for (const cluster of privilege.clusters) {
      await this.comboBox.setCustom(`remoteClusterClustersInput${index}`, cluster);
    }

    for (const clusterPrivilege of privilege.privileges) {
      await this.comboBox.setCustom(`remoteClusterPrivilegesInput${index}`, clusterPrivilege);
    }
  }

  async saveRole() {
    this.log.debug('click save button');
    await this.testSubjects.click('roleFormSaveButton');

    // Signifies that the role management page redirected back to the role grid page,
    // and successfully refreshed the grid
    await this.testSubjects.existOrFail('roleRow');
  }

  async deleteRemoteClusterPrivilege(index: number) {
    this.log.debug('deleteRemoteClusterPrivilege, index = ', index);

    await this.testSubjects.click(`deleteRemoteClusterPrivilegesButton${index}`);
  }

  async getRemoteClusterPrivilege(index: number) {
    this.log.debug('getRemoteClusterPrivilege, index = ', index);
    const clusterOptions = await this.comboBox.getComboBoxSelectedOptions(
      `remoteClusterClustersInput${index}`
    );

    const privilegeOptions = await this.comboBox.getComboBoxSelectedOptions(
      `remoteClusterPrivilegesInput${index}`
    );

    return {
      clusters: clusterOptions,
      privileges: privilegeOptions,
    };
  }

  async addRole(
    roleName: string,
    roleObj: { elasticsearch: Pick<Role['elasticsearch'], 'indices' | 'remote_cluster'> }
  ) {
    const self = this;

    await this.clickCreateNewRole();

    // We have to use non-test-subject selectors because this markup is generated by ui-select.
    this.log.debug('roleObj.indices[0].names = ' + roleObj.elasticsearch.indices[0].names);
    await this.testSubjects.append('roleFormNameInput', roleName);

    for (const indexName of roleObj.elasticsearch.indices[0].names) {
      await this.comboBox.setCustom('indicesInput0', indexName);
    }

    if (roleObj.elasticsearch.indices[0].query) {
      await this.testSubjects.click('restrictDocumentsQuery0');

      await this.monacoEditor.typeCodeEditorValue(
        roleObj.elasticsearch.indices[0].query,
        'kibanaCodeEditor'
      );
    }

    await this.testSubjects.click('addSpacePrivilegeButton');
    const spaceSelectorComboBox = await this.testSubjects.find('spaceSelectorComboBox');
    await spaceSelectorComboBox.click();

    const globalSpaceOption = await this.find.byCssSelector(`#spaceOption_\\*`);
    await globalSpaceOption.click();

    // Close dropdown menu to avoid hiding elements from test runner
    const spaceSelectorInput = await spaceSelectorComboBox.findByTagName('input');
    await spaceSelectorInput.pressKeys(Key.ESCAPE);

    await this.testSubjects.click('basePrivilege_all');
    await this.testSubjects.click('createSpacePrivilegeButton');

    const addPrivileges = (privileges: string[]) => {
      return privileges.reduce((promise: Promise<any>, privilegeName: string) => {
        return promise
          .then(() => self.addPrivilegeToRole(privilegeName))
          .then(() => this.common.sleep(250));
      }, Promise.resolve());
    };
    await addPrivileges(roleObj.elasticsearch.indices[0].privileges);

    const addGrantedField = async (fields: string[]) => {
      for (const entry of fields) {
        await this.comboBox.setCustom('fieldInput0', entry);
      }
    };

    const addDeniedField = async (fields: string[]) => {
      for (const entry of fields) {
        await this.comboBox.setCustom('deniedFieldInput0', entry);
      }
    };

    // clicking the Granted fields and removing the asterix
    if (roleObj.elasticsearch.indices[0].field_security) {
      // Toggle FLS switch
      await this.testSubjects.click('restrictFieldsQuery0');

      // have to remove the '*'
      await this.find.clickByCssSelector(
        'div[data-test-subj="fieldInput0"] [title="Remove * from selection in this group"] svg.euiIcon'
      );

      await addGrantedField(roleObj.elasticsearch.indices[0].field_security!.grant!);
      if (roleObj.elasticsearch.indices[0].field_security?.except) {
        await addDeniedField(roleObj.elasticsearch.indices[0].field_security.except);
      }
    }

    if (roleObj.elasticsearch.remote_cluster) {
      this.log.debug('adding remote_cluster privileges');

      for (const [
        index,
        remoteClusterPrivilege,
      ] of roleObj.elasticsearch.remote_cluster.entries()) {
        await this.addRemoteClusterPrivilege(remoteClusterPrivilege, index);
      }
    }

    await this.saveRole();
  }

  async selectRole(role: string) {
    await this.comboBox.set('rolesDropdown', role);
  }
}
