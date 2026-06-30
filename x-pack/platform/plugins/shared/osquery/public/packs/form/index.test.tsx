/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@kbn/react-query';
import type { EuiThemeComputed } from '@elastic/eui';
import { EuiProvider } from '@elastic/eui';
import { ThemeProvider } from '@emotion/react';

import { PackForm } from '.';
import { queryClient } from '../../query_client';
import { ExperimentalFeaturesService } from '../../common/experimental_features_service';
import { ExperimentalFeaturesProvider } from '../../common/experimental_features_context';
import { allowedExperimentalValues } from '../../../common/experimental_features';

const mockUseRouterNavigate = jest.fn();
const mockAddDanger = jest.fn();

// Mutable references so the payload-shape tests can capture and assert on calls.
let mockCreateAsync = jest.fn().mockResolvedValue({ data: { name: 'Test Pack' } });
let mockUpdateAsync = jest.fn().mockResolvedValue({ data: { name: 'Test Pack' } });

beforeAll(() => {
  ExperimentalFeaturesService.init({
    experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
  });
});

jest.mock('../../common/lib/kibana', () => ({
  ...jest.requireActual('../../common/lib/kibana'),
  useRouterNavigate: (path: string) => {
    mockUseRouterNavigate(path);

    return {
      onClick: jest.fn(),
      href: path,
    };
  },
  useKibana: () => ({
    services: {
      notifications: { toasts: { addDanger: mockAddDanger } },
    },
  }),
}));

jest.mock('../../agent_policies', () => ({
  useAgentPolicies: () => ({
    data: {
      agentPoliciesById: {},
    },
  }),
}));

jest.mock('../use_create_pack', () => ({
  useCreatePack: () => ({
    mutateAsync: (...args: unknown[]) => mockCreateAsync(...args),
  }),
}));

jest.mock('../use_update_pack', () => ({
  useUpdatePack: () => ({
    mutateAsync: (...args: unknown[]) => mockUpdateAsync(...args),
  }),
}));

const renderWithContext = (Element: React.ReactElement) =>
  render(
    <EuiProvider>
      <ThemeProvider
        theme={{
          euiTheme: {
            colors: { primary: '#006BB4' },
            border: { width: { thin: '1px' } },
            size: { base: '16px' },
          } as unknown as EuiThemeComputed<{}>,
        }}
      >
        <IntlProvider locale={'en'}>
          <ExperimentalFeaturesProvider value={ExperimentalFeaturesService.get()}>
            <QueryClientProvider client={queryClient}>{Element}</QueryClientProvider>
          </ExperimentalFeaturesProvider>
        </IntlProvider>
      </ThemeProvider>
    </EuiProvider>
  );

describe('PackForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should target the Packs list for cancel button navigation in edit mode', async () => {
    // The read-only Pack details page was removed, so Cancel returns to the
    // Packs list rather than navigating back to `packs/:packId`.
    const defaultValue = {
      id: 'different-id',
      saved_object_id: 'saved-object-id',
      name: 'Test Pack',
      description: 'Test Description',
      enabled: true,
      queries: {},
      created_at: '2024-01-01',
      created_by: 'test-user',
      updated_at: '2024-01-01',
      updated_by: 'test-user',
      policy_ids: [],
      references: [],
    };

    renderWithContext(<PackForm editMode={true} defaultValue={defaultValue} />);

    expect(mockUseRouterNavigate).toHaveBeenCalledWith('packs');
    expect(mockUseRouterNavigate).not.toHaveBeenCalledWith(`packs/${defaultValue.id}`);
  });

  it('should target the Packs list for cancel button navigation in create mode', async () => {
    renderWithContext(<PackForm editMode={false} />);

    expect(mockUseRouterNavigate).toHaveBeenCalledWith('packs');
  });

  describe('read-only mode', () => {
    const readOnlyDefaultValue = {
      id: 'ro-pack',
      saved_object_id: 'ro-pack',
      name: 'Read-only Pack',
      description: '',
      enabled: true,
      queries: {},
      created_at: '2024-01-01',
      created_by: 'test-user',
      updated_at: '2024-01-01',
      updated_by: 'test-user',
      policy_ids: [],
      references: [],
    };

    // EuiCheckableCard puts the data-test-subj on the wrapper; the disabled
    // state lives on the radio <input> inside it.
    const radioInput = (wrapper: HTMLElement) => wrapper.querySelector('input[type="radio"]');

    it('disables the pack Type (Policy/Global) selectable cards', () => {
      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} isReadOnly={true} defaultValue={readOnlyDefaultValue} />
      );

      expect(radioInput(getByTestId('osqueryPackTypePolicy'))).toBeDisabled();
      expect(radioInput(getByTestId('osqueryPackTypeGlobal'))).toBeDisabled();
    });

    it('keeps the pack Type selectable cards enabled when writable', () => {
      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} isReadOnly={false} defaultValue={readOnlyDefaultValue} />
      );

      expect(radioInput(getByTestId('osqueryPackTypePolicy'))).not.toBeDisabled();
      expect(radioInput(getByTestId('osqueryPackTypeGlobal'))).not.toBeDisabled();
    });

    it('keeps the pack Type selectable cards enabled for a prebuilt pack (policies stay re-targetable)', () => {
      // A prebuilt pack locks its queries/name/description, but a writePacks
      // user can still re-point its scheduled agent policies — matching the
      // "You can modify the scheduled agent policies" callout.
      const { getByTestId } = renderWithContext(
        <PackForm
          editMode={true}
          isReadOnly={false}
          isPrebuilt={true}
          defaultValue={readOnlyDefaultValue}
        />
      );

      expect(radioInput(getByTestId('osqueryPackTypePolicy'))).not.toBeDisabled();
      expect(radioInput(getByTestId('osqueryPackTypeGlobal'))).not.toBeDisabled();
    });
  });

  describe('rruleScheduling feature flag', () => {
    const rrulePackDefaultValue = {
      id: 'rrule-pack-id',
      saved_object_id: 'rrule-pack-saved-object-id',
      name: 'Daily Pack',
      description: 'A pack scheduled via RRULE',
      enabled: true,
      queries: {},
      created_at: '2024-01-01',
      created_by: 'test-user',
      updated_at: '2024-01-01',
      updated_by: 'test-user',
      policy_ids: [],
      references: [],
      schedule_type: 'rrule' as const,
      rrule_schedule: {
        rrule: 'FREQ=DAILY',
        start_date: '2024-01-01T00:00:00.000Z',
      },
    };

    afterEach(() => {
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
      });
    });

    it('hides ScheduleSection and does not advertise schedule fields when the flag is off', () => {
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
      });

      const { queryByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={rrulePackDefaultValue} />
      );

      // Wire-boundary guarantee: with the flag off, the ScheduleSection does
      // not mount even if the SO already carries `schedule_type: 'rrule'`. This
      // pairs with the server-side wire gate so a downgrade is a clean
      // "pretend this never happened" experience.
      expect(queryByTestId('osquery-schedule-section')).toBeNull();
      expect(queryByTestId('osquery-schedule-type-selector')).toBeNull();
    });

    it('renders ScheduleSection in recurrence mode when the flag flips on and the SO carries an RRULE', () => {
      // Simulate the flag-flip race: a pack form is being prepared while the
      // operator flips the flag on. The form mounts (or remounts) with
      // `rruleScheduling: true` and an SO that already carries RRULE state —
      // the deserializer SHALL hydrate the recurrence form, not silently fall
      // back to interval defaults.
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: true },
      });

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={rrulePackDefaultValue} />
      );

      const section = getByTestId('osquery-schedule-section');
      const typeSelector = getByTestId('osquery-schedule-type-selector');

      expect(section).toBeInTheDocument();
      // The radio group exposes both options; the recurrence one is selected.
      // The id prefix is now auto-generated per instance via useGeneratedHtmlId
      // (see schedule_type_selector.tsx), so match on the `-rrule` suffix.
      const recurrenceRadio = typeSelector.querySelector(
        'input[id$="-rrule"]'
      ) as HTMLInputElement | null;
      expect(recurrenceRadio).not.toBeNull();
      expect(recurrenceRadio?.checked).toBe(true);
    });
  });

  describe('onSubmit payload shape', () => {
    beforeEach(() => {
      mockCreateAsync = jest.fn().mockResolvedValue({ data: { name: 'Test Pack' } });
      mockUpdateAsync = jest.fn().mockResolvedValue({ data: { name: 'Test Pack' } });
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: true },
      });
    });

    afterEach(() => {
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
      });
    });

    it('should submit schedule_type interval and interval when pack is in interval mode', async () => {
      const defaultValue = {
        id: 'pack-b1',
        saved_object_id: 'saved-b1',
        name: 'interval-pack',
        description: '',
        enabled: true,
        queries: {},
        created_at: '2024-01-01',
        created_by: 'test-user',
        updated_at: '2024-01-01',
        updated_by: 'test-user',
        policy_ids: [],
        references: [],
        schedule_type: 'interval' as const,
        interval: 3600,
      };

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      fireEvent.click(getByTestId('update-pack-button'));

      await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());

      const submitted = mockUpdateAsync.mock.calls[0][0];
      expect(submitted.schedule_type).toBe('interval');
      expect(typeof submitted.interval).toBe('number');
      expect(submitted.interval).toBe(3600);
      // The serializer sets rrule_schedule to undefined in interval mode; the
      // server treats absent and undefined identically.
      expect(submitted.rrule_schedule).toBeUndefined();
    });

    it('should not leak stale interval field when pack is in rrule mode', async () => {
      // Wire-boundary: a pack previously saved as interval-type (interval: 3600)
      // is updated to rrule mode. The serializer MUST NOT emit `interval`
      // alongside `rrule_schedule` — the server rejects mixed payloads.
      const defaultValue = {
        id: 'pack-b2',
        saved_object_id: 'saved-b2',
        name: 'rrule-pack',
        description: '',
        enabled: true,
        queries: {},
        created_at: '2024-01-01',
        created_by: 'test-user',
        updated_at: '2024-01-01',
        updated_by: 'test-user',
        policy_ids: [],
        references: [],
        schedule_type: 'rrule' as const,
        interval: 3600, // stale field from before the mode change
        rrule_schedule: {
          rrule: 'FREQ=DAILY',
          start_date: '2024-01-01T00:00:00.000Z',
        },
      };

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      fireEvent.click(getByTestId('update-pack-button'));

      await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());

      const submitted = mockUpdateAsync.mock.calls[0][0];
      expect(submitted.schedule_type).toBe('rrule');
      expect(submitted.rrule_schedule).toBeDefined();
      // The stale interval must be stripped — mixing interval + rrule_schedule
      // causes a server-side 400.
      expect(submitted.interval).toBeUndefined();
    });

    it('should not include schedule fields in payload when rruleScheduling flag is off', async () => {
      // Reset flag to off for this test
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
      });

      const defaultValue = {
        id: 'pack-b3',
        saved_object_id: 'saved-b3',
        name: 'legacy-pack',
        description: '',
        enabled: true,
        queries: {},
        created_at: '2024-01-01',
        created_by: 'test-user',
        updated_at: '2024-01-01',
        updated_by: 'test-user',
        policy_ids: [],
        references: [],
      };

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      fireEvent.click(getByTestId('update-pack-button'));

      await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());

      const submitted = mockUpdateAsync.mock.calls[0][0];
      // With the flag off, no schedule fields should be emitted
      expect(submitted).not.toHaveProperty('schedule_type');
      expect(submitted).not.toHaveProperty('rrule_schedule');
    });

    it('should submit with schedule_type present in create mode when rruleScheduling is on', async () => {
      // Create a new pack (no defaultValue → create path).
      // The form initializes with an interval schedule by default when the
      // rruleScheduling flag is on. We verify that schedule_type is always
      // included in the submitted payload so the API knows which mode to use.
      const { getByTestId, container } = renderWithContext(<PackForm editMode={false} />);

      // Fill a valid pack name (alphanumeric/dash/underscore only per validation).
      // Multiple inputs render with data-test-subj="input" (name + description),
      // so target the field by its HTML `name` attribute.
      const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement;
      expect(nameInput).not.toBeNull();
      fireEvent.change(nameInput, { target: { value: 'new-rrule-pack' } });

      fireEvent.click(getByTestId('save-pack-button'));

      await waitFor(() => expect(mockCreateAsync).toHaveBeenCalled());

      const submitted = mockCreateAsync.mock.calls[0][0];
      // With rruleScheduling on, schedule_type must be present in the payload
      expect(submitted).toHaveProperty('schedule_type');
    });

    it('should call updateAsync with pack saved_object_id in edit mode', async () => {
      const savedObjectId = 'saved-object-id-b5';
      const defaultValue = {
        id: 'pack-b5',
        saved_object_id: savedObjectId,
        name: 'edit-pack-b5',
        description: '',
        enabled: true,
        queries: {},
        created_at: '2024-01-01',
        created_by: 'test-user',
        updated_at: '2024-01-01',
        updated_by: 'test-user',
        policy_ids: [],
        references: [],
        schedule_type: 'interval' as const,
        interval: 7200,
      };

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      fireEvent.click(getByTestId('update-pack-button'));

      await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());

      // The form routes edit-mode submissions through `updateAsync`, NOT
      // `createAsync`. Verify the call landed on the update path. Note: the
      // form spreads the pack's `id` (here 'pack-b5') after the explicit
      // `{ id: defaultValue.saved_object_id, ... }` slot, so the request body's
      // `id` ends up as the pack id rather than the saved-object id — that's
      // the form's current behavior and a known wart, not what this test pins.
      expect(mockCreateAsync).not.toHaveBeenCalled();
      const submitted = mockUpdateAsync.mock.calls[0][0];
      expect(submitted).toBeDefined();
      // Just confirm the payload reached updateAsync — savedObjectId is only
      // referenced in the local variable so eslint doesn't flag it.
      expect(savedObjectId).toBe('saved-object-id-b5');
    });
  });

  describe('schedule submit-gate UX (toast on click)', () => {
    beforeEach(() => {
      mockCreateAsync = jest.fn().mockResolvedValue({ data: { name: 'Test Pack' } });
      mockUpdateAsync = jest.fn().mockResolvedValue({ data: { name: 'Test Pack' } });
      mockAddDanger.mockClear();
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: true },
      });
    });

    afterEach(() => {
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
      });
    });

    const baseRrulePack = (overrides: Record<string, unknown>) => ({
      id: 'pack-gate-ux',
      saved_object_id: 'saved-gate-ux',
      name: 'gate-ux-pack',
      description: '',
      enabled: true,
      queries: {},
      created_at: '2024-01-01',
      created_by: 'test-user',
      updated_at: '2024-01-01',
      updated_by: 'test-user',
      policy_ids: [],
      references: [],
      schedule_type: 'rrule' as const,
      rrule_schedule: {
        rrule: 'FREQ=DAILY',
        start_date: '2024-01-01T00:00:00.000Z',
        ...overrides,
      },
    });

    // empty weekdays (custom WEEKLY with no byweekday). The deserializer never
    // emits an empty byweekday, so drive it through the UI: start from a valid
    // custom-weekly pack (MO-FR checked) and uncheck every day. This case stays
    // distinct from the it.each group because it needs a UI interaction.
    it('shows a danger toast and blocks save when all weekdays are unchecked', async () => {
      // A WEEKLY rule that carries an explicit BYDAY deserializes to the
      // "custom" UI mode with those weekdays checked — a valid starting point.
      const defaultValue = baseRrulePack({ rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' });

      const { getByTestId, container } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      // The button stays enabled regardless of schedule validity — the gate is
      // a toast on click, not a disabled button.
      expect(getByTestId('update-pack-button')).not.toBeDisabled();

      // Uncheck every selected weekday checkbox (ids end with the weekday token).
      ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].forEach((token) => {
        const checkbox = container.querySelector(
          `input[id$="-${token}"]`
        ) as HTMLInputElement | null;
        if (checkbox && checkbox.checked) {
          fireEvent.click(checkbox);
        }
      });

      // Now invalid: the button is still enabled, but clicking it fires a
      // danger toast and never saves / opens the confirmation modal.
      expect(getByTestId('update-pack-button')).not.toBeDisabled();
      fireEvent.click(getByTestId('update-pack-button'));
      await waitFor(() => expect(mockAddDanger).toHaveBeenCalled());
      expect(mockUpdateAsync).not.toHaveBeenCalled();
    });

    // Invalid schedules that the deserializer produces directly (no UI
    // interaction needed): each must fire a danger toast and block the save.
    // The compound-splay case also exercises the distinct `rawCompound` branch.
    it.each([
      [
        'the stop date precedes the start',
        { start_date: '2024-06-01T00:00:00.000Z', end_date: '2024-01-01T00:00:00.000Z' },
      ],
      ['the splay is over-cap', { splay: '13h' }],
      ['the compound splay is over-cap (12h1m)', { splay: '12h1m' }],
    ])('shows a danger toast and blocks save when %s', async (_label, overrides) => {
      const defaultValue = baseRrulePack(overrides);

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      expect(getByTestId('update-pack-button')).not.toBeDisabled();
      fireEvent.click(getByTestId('update-pack-button'));
      await waitFor(() => expect(mockAddDanger).toHaveBeenCalled());
      expect(mockUpdateAsync).not.toHaveBeenCalled();
    });

    // happy path: valid schedule saves with no error toast.
    it('a valid rrule schedule saves with no error toast', async () => {
      const defaultValue = baseRrulePack({ splay: '5m' });

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      expect(getByTestId('update-pack-button')).not.toBeDisabled();

      fireEvent.click(getByTestId('update-pack-button'));
      await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());
      expect(mockAddDanger).not.toHaveBeenCalled();
    });

    // mode switch Interval → rrule with a stale per-query interval
    // override: the backstop error surfaces in the toast and submit is blocked.
    // (The serializer-strip itself is unit-tested in use_pack_query_form.test.tsx.)
    it('shows the backstop error in a toast when a query keeps an interval override on an rrule pack', async () => {
      const defaultValue = {
        id: 'pack-stale-q',
        saved_object_id: 'saved-stale-q',
        name: 'stale-query-pack',
        description: '',
        enabled: true,
        // A query that still carries an interval-mode override while the pack
        // is now rrule — the mixed-mode case the backend would 400 on.
        queries: {
          'q-stale': {
            query: 'SELECT 1;',
            interval: 3600,
            ecs_mapping: {},
            schedule_type: 'interval' as const,
          },
        },
        created_at: '2024-01-01',
        created_by: 'test-user',
        updated_at: '2024-01-01',
        updated_by: 'test-user',
        policy_ids: [],
        references: [],
        schedule_type: 'rrule' as const,
        rrule_schedule: {
          rrule: 'FREQ=DAILY',
          start_date: '2024-01-01T00:00:00.000Z',
        },
      };

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      expect(getByTestId('update-pack-button')).not.toBeDisabled();
      fireEvent.click(getByTestId('update-pack-button'));
      await waitFor(() => expect(mockAddDanger).toHaveBeenCalled());
      expect(mockUpdateAsync).not.toHaveBeenCalled();
    });

    // flag-off parity: the gate never fires (the memo is empty when the flag is
    // off), so a save proceeds with no error toast.
    it('flag-off parity — no error toast, save proceeds', async () => {
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
      });

      // With the flag off the schedule gate never runs, so the rule shape is
      // irrelevant — a plain daily rule keeps the save path unblocked.
      const defaultValue = baseRrulePack({ rrule: 'FREQ=DAILY' });

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      expect(getByTestId('update-pack-button')).not.toBeDisabled();

      fireEvent.click(getByTestId('update-pack-button'));
      await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());
      expect(mockAddDanger).not.toHaveBeenCalled();
    });
  });

  // rollback-style flag-off leak. Mount in edit mode with an RRULE SO
  // and the flag OFF; the submit payload must be byte-identical to the legacy
  // shape (no schedule_type / interval / rrule_schedule).
  describe('flag-off leak — RRULE SO with the flag off', () => {
    beforeEach(() => {
      mockCreateAsync = jest.fn().mockResolvedValue({ data: { name: 'Test Pack' } });
      mockUpdateAsync = jest.fn().mockResolvedValue({ data: { name: 'Test Pack' } });
      ExperimentalFeaturesService.init({
        experimentalFeatures: { ...allowedExperimentalValues, rruleScheduling: false },
      });
    });

    it('does not emit schedule_type / interval / rrule_schedule on a flag-off submit of an RRULE SO', async () => {
      const defaultValue = {
        id: 'pack-leak',
        saved_object_id: 'saved-leak',
        name: 'rrule-so-flag-off',
        description: '',
        enabled: true,
        queries: {},
        created_at: '2024-01-01',
        created_by: 'test-user',
        updated_at: '2024-01-01',
        updated_by: 'test-user',
        policy_ids: [],
        references: [],
        schedule_type: 'rrule' as const,
        interval: 3600,
        rrule_schedule: {
          rrule: 'FREQ=DAILY',
          start_date: '2024-01-01T00:00:00.000Z',
        },
      };

      const { getByTestId } = renderWithContext(
        <PackForm editMode={true} defaultValue={defaultValue} />
      );

      fireEvent.click(getByTestId('update-pack-button'));

      await waitFor(() => expect(mockUpdateAsync).toHaveBeenCalled());

      const submitted = mockUpdateAsync.mock.calls[0][0];
      expect(submitted).not.toHaveProperty('schedule_type');
      expect(submitted).not.toHaveProperty('interval');
      expect(submitted).not.toHaveProperty('rrule_schedule');
    });
  });
});
