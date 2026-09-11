/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import type { ApiClientFixture, KbnClient, RoleSessionCredentials } from '@kbn/scout';
import { apiTest, testData, CUSTOM_ROLES, buildSpacesRole } from '../fixtures';

const {
  COMMON_HEADERS,
  TELEMETRY_HEADERS,
  SETTINGS_API_PATH,
  TELEMETRY_OPTIN_API_PATH,
  ADVANCED_SETTING_KEY,
  TELEMETRY_SAVED_OBJECT,
} = testData;

type UiSettingUserValue = Awaited<ReturnType<KbnClient['uiSettings']['get']>>;
type TelemetryAttributes = Record<string, unknown>;

type CookieHeader = RoleSessionCredentials['cookieHeader'];
type ApiResponse = Awaited<ReturnType<ApiClientFixture['post']>>;

const spacePath = (path: string, spaceId?: string) => (spaceId ? `/s/${spaceId}${path}` : path);

const saveAdvancedSetting = (
  apiClient: ApiClientFixture,
  cookieHeader: CookieHeader,
  spaceId?: string
): Promise<ApiResponse> =>
  apiClient.post(spacePath(SETTINGS_API_PATH, spaceId), {
    headers: { ...COMMON_HEADERS, ...cookieHeader },
    responseType: 'json',
    body: { changes: { [ADVANCED_SETTING_KEY]: null } },
  });

const saveTelemetry = (
  apiClient: ApiClientFixture,
  cookieHeader: CookieHeader,
  spaceId?: string
): Promise<ApiResponse> =>
  apiClient.post(spacePath(TELEMETRY_OPTIN_API_PATH, spaceId), {
    headers: { ...TELEMETRY_HEADERS, ...cookieHeader },
    responseType: 'json',
    body: { enabled: true },
  });

// Saving an advanced setting writes the shared `config` saved object, which can return a 409 when
// requests race. Mirror the FTR suite's retry-on-conflict behavior.
const CONFLICT_RETRIES = 3;
const saveWithConflictRetry = async (send: () => Promise<ApiResponse>): Promise<ApiResponse> => {
  let response = await send();
  for (let attempt = 0; attempt < CONFLICT_RETRIES && response.statusCode === 409; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    response = await send();
  }
  return response;
};

// Telemetry opt-in cannot be changed on Cloud (`allowChangingOptInStatus: false`), where the route
// rejects with this exact body before writing anything. On non-Cloud deployments the outcome tracks
// the telemetry saved-object write permission granted by an `all` privilege in the target space.
const TELEMETRY_CLOUD_400_MESSAGE = '{"error":"Not allowed to change Opt-in Status."}';

const isNotFoundError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return false;
  }

  return error.status === 404;
};

// `find` answers with an empty list when the object is absent, while `get` would 404 and the kbn
// client retries terminal 404s with backoff.
const getTelemetryAttributes = async (
  kbnClient: KbnClient
): Promise<TelemetryAttributes | undefined> => {
  const { saved_objects: savedObjects } = await kbnClient.savedObjects.find<TelemetryAttributes>({
    type: TELEMETRY_SAVED_OBJECT.type,
  });

  return savedObjects.find(({ id }) => id === TELEMETRY_SAVED_OBJECT.id)?.attributes;
};

const restoreAdvancedSetting = async (
  kbnClient: KbnClient,
  originalValue: UiSettingUserValue
): Promise<void> => {
  if (originalValue === undefined) {
    await kbnClient.uiSettings.unset(ADVANCED_SETTING_KEY);
    return;
  }

  await kbnClient.uiSettings.update({ [ADVANCED_SETTING_KEY]: originalValue });
};

const restoreTelemetryAttributes = async (
  kbnClient: KbnClient,
  attributes: TelemetryAttributes | undefined
): Promise<void> => {
  if (attributes !== undefined) {
    await kbnClient.savedObjects.create({
      type: TELEMETRY_SAVED_OBJECT.type,
      id: TELEMETRY_SAVED_OBJECT.id,
      overwrite: true,
      attributes,
    });
    return;
  }

  // Only the object the opt-in requests created has to go; skipping an already-absent object keeps
  // teardown off the same 404 retry path.
  if ((await getTelemetryAttributes(kbnClient)) === undefined) {
    return;
  }

  try {
    await kbnClient.savedObjects.delete({
      type: TELEMETRY_SAVED_OBJECT.type,
      id: TELEMETRY_SAVED_OBJECT.id,
    });
  } catch (error) {
    // A concurrent suite on the shared server may have removed it between the check and the delete.
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
};

const assertTelemetryResponse = (
  response: ApiResponse,
  { isCloud, canChange }: { isCloud: boolean; canChange: boolean }
): void => {
  const expected = isCloud
    ? { statusCode: 400, message: TELEMETRY_CLOUD_400_MESSAGE }
    : { statusCode: canChange ? 200 : 403 };

  expect({
    statusCode: response.statusCode,
    ...(isCloud ? { message: response.body?.message } : {}),
  }).toStrictEqual(expected);
};

// A single root-level describe is required (see `@kbn/eslint/scout_max_one_describe`). The spaces
// used by the per-space tests are created once for the suite with unique ids so the suite stays
// isolated on shared Cloud deployments.
apiTest.describe('Advanced settings feature controls', { tag: tags.stateful.classic }, () => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const space1Id = `as_fc_space_1_${suffix}`;
  const space2Id = `as_fc_space_2_${suffix}`;
  const space3Id = `as_fc_space_3_${suffix}`;

  // The spaces role descriptor is identical across the three per-space tests, so the fixture
  // reuses the same custom role and cached session cookie instead of recreating them.
  const spacesRole = () => buildSpacesRole(space1Id, space2Id, space3Id);

  // `undefined` is a legitimate captured value ("was not set"), so teardown keys off this flag
  // rather than off the captured values themselves.
  let capturedSharedState = false;
  let originalTz: UiSettingUserValue;
  let originalTelemetry: TelemetryAttributes | undefined;
  // Tracked so a partially failed setup tears down only what it created, instead of masking the
  // setup error with a delete of a space that was never created.
  const createdSpaceIds: string[] = [];

  apiTest.beforeAll(async ({ kbnClient }) => {
    originalTz = await kbnClient.uiSettings.get(ADVANCED_SETTING_KEY);
    originalTelemetry = await getTelemetryAttributes(kbnClient);
    capturedSharedState = true;

    for (const id of [space1Id, space2Id, space3Id]) {
      await kbnClient.spaces.create({ id, name: id, disabledFeatures: [] });
      createdSpaceIds.push(id);
    }
  });

  apiTest.afterAll(async ({ kbnClient }) => {
    try {
      if (capturedSharedState) {
        // Restore independently so a settings failure cannot skip telemetry restore.
        const restoreResults = await Promise.allSettled([
          restoreAdvancedSetting(kbnClient, originalTz),
          restoreTelemetryAttributes(kbnClient, originalTelemetry),
        ]);
        const firstRestoreFailure = restoreResults.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );
        if (firstRestoreFailure) {
          throw firstRestoreFailure.reason;
        }
      }
    } finally {
      await Promise.all(createdSpaceIds.map((id) => kbnClient.spaces.delete(id)));
    }
  });

  apiTest(
    'settings can be saved with the advancedSettings: ["all"] feature privilege',
    async ({ apiClient, samlAuth, config }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser(CUSTOM_ROLES.settings_all);

      const settingResponse = await saveWithConflictRetry(() =>
        saveAdvancedSetting(apiClient, cookieHeader)
      );
      expect(settingResponse).toHaveStatusCode(200);
      expect(settingResponse.body.settings).toBeDefined();

      const telemetryResponse = await saveTelemetry(apiClient, cookieHeader);
      assertTelemetryResponse(telemetryResponse, { isCloud: config.isCloud, canChange: true });
    }
  );

  apiTest(
    'settings cannot be saved with the advancedSettings: ["read"] feature privilege',
    async ({ apiClient, samlAuth, config }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser(CUSTOM_ROLES.settings_read);

      const settingResponse = await saveWithConflictRetry(() =>
        saveAdvancedSetting(apiClient, cookieHeader)
      );
      expect(settingResponse).toHaveStatusCode(403);

      const telemetryResponse = await saveTelemetry(apiClient, cookieHeader);
      assertTelemetryResponse(telemetryResponse, { isCloud: config.isCloud, canChange: false });
    }
  );

  apiTest(
    'settings cannot be saved with savedObjectsManagement: ["all"] but only advancedSettings: ["read"] privilege',
    async ({ apiClient, samlAuth }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser(
        CUSTOM_ROLES.settings_so_all_settings_read
      );

      const settingResponse = await saveWithConflictRetry(() =>
        saveAdvancedSetting(apiClient, cookieHeader)
      );
      expect(settingResponse).toHaveStatusCode(403);
    }
  );

  apiTest(
    'settings and telemetry can be saved in a space with advancedSettings: ["all"]',
    async ({ apiClient, samlAuth, config }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser(spacesRole());

      const settingResponse = await saveWithConflictRetry(() =>
        saveAdvancedSetting(apiClient, cookieHeader, space1Id)
      );
      expect(settingResponse).toHaveStatusCode(200);
      expect(settingResponse.body.settings).toBeDefined();

      const telemetryResponse = await saveTelemetry(apiClient, cookieHeader, space1Id);
      assertTelemetryResponse(telemetryResponse, { isCloud: config.isCloud, canChange: true });
    }
  );

  apiTest(
    'telemetry can be saved, but settings cannot, in a space with only dashboard: ["all"]',
    async ({ apiClient, samlAuth, config }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser(spacesRole());

      const settingResponse = await saveWithConflictRetry(() =>
        saveAdvancedSetting(apiClient, cookieHeader, space2Id)
      );
      expect(settingResponse).toHaveStatusCode(403);

      const telemetryResponse = await saveTelemetry(apiClient, cookieHeader, space2Id);
      assertTelemetryResponse(telemetryResponse, { isCloud: config.isCloud, canChange: true });
    }
  );

  apiTest(
    'settings and telemetry cannot be saved in a space with only dashboard: ["read"]',
    async ({ apiClient, samlAuth, config }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser(spacesRole());

      const settingResponse = await saveWithConflictRetry(() =>
        saveAdvancedSetting(apiClient, cookieHeader, space3Id)
      );
      expect(settingResponse).toHaveStatusCode(403);

      const telemetryResponse = await saveTelemetry(apiClient, cookieHeader, space3Id);
      assertTelemetryResponse(telemetryResponse, { isCloud: config.isCloud, canChange: false });
    }
  );
});
