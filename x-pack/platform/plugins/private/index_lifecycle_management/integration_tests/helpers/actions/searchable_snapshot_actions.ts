/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Phase } from '../../../common/types';

export const createSearchableSnapshotActions = (phase: Phase) => {
  const fieldSelector = `searchableSnapshotField-${phase}`;
  const forceMergeIndexSwitchSelector = `searchableSnapshotForceMergeIndexSwitch-${phase}`;
  const forceMergeOnCloneSwitchSelector = `searchableSnapshotForceMergeOnCloneSwitch-${phase}`;

  const openPhaseAdvancedSettings = async () => {
    const phaseContainer = screen.queryByTestId(`${phase}-phase`);
    if (!phaseContainer) {
      return;
    }
    const advancedButton = within(phaseContainer).queryByRole('button', {
      name: /advanced settings/i,
    }) as HTMLButtonElement | null;
    if (advancedButton && advancedButton.getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(advancedButton);
    }
  };
  const ensurePhasePreconditions = async () => {
    if (phase === 'hot') {
      const rolloverSwitch = screen.queryByTestId('rolloverSwitch');
      if (rolloverSwitch && rolloverSwitch.getAttribute('aria-checked') !== 'true') {
        fireEvent.click(rolloverSwitch);
        await waitFor(() => {
          expect(rolloverSwitch.getAttribute('aria-checked')).toBe('true');
        });
      }
    }

    if (phase !== 'delete') {
      const phaseSwitch = screen.queryByTestId(`enablePhaseSwitch-${phase}`);
      if (phaseSwitch) {
        if (phaseSwitch.getAttribute('aria-checked') !== 'true') {
          fireEvent.click(phaseSwitch);
          await waitFor(() => {
            expect(phaseSwitch.getAttribute('aria-checked')).toBe('true');
          });
        }
      }
    }

    await openPhaseAdvancedSettings();
  };

  const waitForFieldContainer = async () => {
    // Try quick path first, then ensure preconditions if needed
    await waitFor(
      async () => {
        let container = screen.queryByTestId(fieldSelector);

        if (!container) {
          // Ensure phase is set up correctly
          await ensurePhasePreconditions();

          if (phase === 'cold' || phase === 'frozen') {
            const minAgeInput = screen.queryByTestId<HTMLInputElement>(`${phase}-selectedMinAge`);
            if (minAgeInput && !minAgeInput.value) {
              fireEvent.change(minAgeInput, { target: { value: '1' } });
              fireEvent.blur(minAgeInput);
            }
          }

          container = screen.queryByTestId(fieldSelector);
        }

        if (!container) {
          const availableFields = Array.from(
            screen.queryAllByTestId(/^searchableSnapshotField-/),
            (el) => el.getAttribute('data-test-subj')
          );
          throw new Error(
            `Container ${fieldSelector} not found. Available fields: ${JSON.stringify(
              availableFields
            )}`
          );
        }

        return container;
      },
      { timeout: 5000 }
    );

    return screen.getByTestId(fieldSelector);
  };

  const waitForCombobox = async (container: HTMLElement) => {
    return (await within(container).findByTestId('searchableSnapshotCombobox')) as HTMLInputElement;
  };

  const getForceMergeIndexSwitch = async () => {
    const container = await waitForFieldContainer();
    return within(container).queryByTestId<HTMLButtonElement>(forceMergeIndexSwitchSelector);
  };

  const getForceMergeOnCloneSwitch = async () => {
    const container = await waitForFieldContainer();
    return within(container).queryByTestId<HTMLButtonElement>(forceMergeOnCloneSwitchSelector);
  };

  const toggleSearchableSnapshot = async () => {
    const container = await waitForFieldContainer();
    const toggle = within(container).queryByTestId('searchableSnapshotToggle');

    // Frozen phase cannot disable the field so the toggle is absent. No action required.
    if (!toggle) {
      return;
    }

    const user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
      pointerEventsCheck: 0,
    });

    await user.click(toggle);
  };

  return {
    searchableSnapshotDisabledDueToLicense: () => {
      const container = screen.queryByTestId(fieldSelector);
      if (!container) return false;
      const licenseCallout = within(container).queryByTestId(
        'searchableSnapshotDisabledDueToLicense'
      );
      const toggle = within(container).queryByTestId(
        'searchableSnapshotToggle'
      ) as HTMLButtonElement | null;
      return Boolean(licenseCallout && toggle?.disabled);
    },
    searchableSnapshotsExists: () => Boolean(screen.queryByTestId(fieldSelector)),
    toggleSearchableSnapshot,
    forceMergeIndexSwitchExists: async () => Boolean(await getForceMergeIndexSwitch()),
    forceMergeOnCloneSwitchExists: async () => Boolean(await getForceMergeOnCloneSwitch()),
    toggleForceMergeIndex: async () => {
      const forceMergeIndexSwitch = await getForceMergeIndexSwitch();
      if (!forceMergeIndexSwitch) {
        throw new Error(`Force merge index switch not found for phase ${phase}`);
      }

      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
        pointerEventsCheck: 0,
      });
      await user.click(forceMergeIndexSwitch);
    },
    toggleForceMergeOnClone: async () => {
      const forceMergeOnCloneSwitch = await getForceMergeOnCloneSwitch();
      if (!forceMergeOnCloneSwitch) {
        throw new Error(`Force merge on clone switch not found for phase ${phase}`);
      }

      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
        pointerEventsCheck: 0,
      });
      await user.click(forceMergeOnCloneSwitch);
    },
    forceMergeIndexIsChecked: async () => {
      const forceMergeIndexSwitch = await getForceMergeIndexSwitch();
      if (!forceMergeIndexSwitch) return undefined;
      return forceMergeIndexSwitch.getAttribute('aria-checked') === 'true';
    },
    forceMergeOnCloneIsChecked: async () => {
      const forceMergeOnCloneSwitch = await getForceMergeOnCloneSwitch();
      if (!forceMergeOnCloneSwitch) return undefined;
      return forceMergeOnCloneSwitch.getAttribute('aria-checked') === 'true';
    },
    setSearchableSnapshot: async (value: string) => {
      let container = screen.queryByTestId(fieldSelector);

      if (!container) {
        container = await waitForFieldContainer();
      }

      let combobox = within(container).queryByTestId(
        'searchableSnapshotCombobox'
      ) as HTMLInputElement | null;

      if (!combobox) {
        await toggleSearchableSnapshot();
        container = await waitForFieldContainer();
        combobox = within(container).queryByTestId(
          'searchableSnapshotCombobox'
        ) as HTMLInputElement | null;
      }

      if (!combobox) {
        combobox = await waitForCombobox(container);
      }

      const user = userEvent.setup({
        advanceTimers: jest.advanceTimersByTime,
        pointerEventsCheck: 0,
      });

      await user.click(combobox);
      await user.clear(combobox);

      if (value !== '') {
        await user.type(combobox, value);
        fireEvent.keyDown(combobox, { key: 'Enter', code: 'Enter', keyCode: 13 });
      }
    },
  };
};
