/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, fireEvent } from '@testing-library/react';
import { i18nTexts } from '../../../public/application/sections/edit_policy/i18n_texts';
import { setupEnvironment } from '../../helpers/setup_environment';
import {
  createColdPhaseActions,
  createDeletePhaseActions,
  createFrozenPhaseActions,
  createHotPhaseActions,
  createWarmPhaseActions,
} from '../../helpers/actions/phases';
import { expectErrorMessages } from '../../helpers/actions/errors_actions';
import { createFormSetValueAction } from '../../helpers/actions/form_set_value_action';
import { createRolloverActions } from '../../helpers/actions/rollover_actions';
import { createTogglePhaseAction } from '../../helpers/actions/toggle_phase_action';
import { renderEditPolicy } from '../../helpers/render_edit_policy';

describe('<EditPolicy /> hot phase validation', () => {
  const { httpSetup, httpRequestsMockHelpers } = setupEnvironment();
  let actions: {
    togglePhase: ReturnType<typeof createTogglePhaseAction>;
    setPolicyName: ReturnType<typeof createFormSetValueAction>;
    toggleSaveAsNewPolicy: () => void;
    savePolicy: () => void;
  } & ReturnType<typeof createRolloverActions> &
    ReturnType<typeof createHotPhaseActions> &
    ReturnType<typeof createWarmPhaseActions> &
    ReturnType<typeof createColdPhaseActions> &
    ReturnType<typeof createFrozenPhaseActions> &
    ReturnType<typeof createDeletePhaseActions>;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    httpRequestsMockHelpers.setDefaultResponses();
    httpRequestsMockHelpers.setLoadPolicies([]);

    renderEditPolicy(httpSetup, {
      initialEntries: ['/policies/edit'],
    });

    await screen.findByTestId('savePolicyButton');

    actions = {
      togglePhase: createTogglePhaseAction(),
      setPolicyName: createFormSetValueAction('policyNameField'),
      savePolicy: () => fireEvent.click(screen.getByTestId('savePolicyButton')),
      toggleSaveAsNewPolicy: () => fireEvent.click(screen.getByTestId('saveAsNewSwitch')),
      ...createRolloverActions(),
      ...createHotPhaseActions(),
      ...createWarmPhaseActions(),
      ...createColdPhaseActions(),
      ...createFrozenPhaseActions(),
      ...createDeletePhaseActions(),
    };

    await actions.setPolicyName('mypolicy');
  });

  describe('rollover', () => {
    test(`doesn't allow no max primary shard size, no max primary docs, no max age, no max docs, no max index size`, async () => {
      expect(actions.rollover.hasSettingRequiredCallout()).toBeFalsy();

      await actions.rollover.setMaxPrimaryShardSize('');
      await actions.rollover.setMaxPrimaryShardDocs('');
      await actions.rollover.setMaxAge('');
      await actions.rollover.setMaxDocs('');
      await actions.rollover.setMaxSize('');

      expect(actions.rollover.hasSettingRequiredCallout()).toBeTruthy();
    });

    describe('max primary shard size', () => {
      test(`doesn't allow -1`, async () => {
        await actions.rollover.setMaxPrimaryShardSize('-1');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });

      test(`doesn't allow 0`, async () => {
        await actions.rollover.setMaxPrimaryShardSize('0');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });
    });

    describe('max primary docs size', () => {
      test(`doesn't allow -1`, async () => {
        await actions.rollover.setMaxPrimaryShardDocs('-1');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });

      test(`doesn't allow 0`, async () => {
        await actions.rollover.setMaxPrimaryShardDocs('0');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });

      test(`doesn't allow decimals`, async () => {
        await actions.rollover.setMaxPrimaryShardDocs('5.5');

        await expectErrorMessages([i18nTexts.editPolicy.errors.integerRequired]);
      });
    });

    describe('max size', () => {
      test(`doesn't allow -1`, async () => {
        await actions.rollover.setMaxSize('-1');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });

      test(`doesn't allow 0`, async () => {
        await actions.rollover.setMaxSize('0');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });
    });

    describe('max age', () => {
      test(`doesn't allow -1`, async () => {
        await actions.rollover.setMaxAge('-1');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });

      test(`doesn't allow 0`, async () => {
        await actions.rollover.setMaxAge('0');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });

      test(`doesn't allow decimals`, async () => {
        await actions.rollover.setMaxAge('5.5');

        await expectErrorMessages([i18nTexts.editPolicy.errors.integerRequired]);
      });
    });

    describe('max docs', () => {
      test(`doesn't allow -1`, async () => {
        await actions.rollover.setMaxDocs('-1');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });

      test(`doesn't allow 0`, async () => {
        await actions.rollover.setMaxDocs('0');

        await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
      });

      test(`doesn't allow decimals`, async () => {
        await actions.rollover.setMaxDocs('5.5');

        await expectErrorMessages([i18nTexts.editPolicy.errors.integerRequired]);
      });
    });

    describe('min values', () => {
      test(`doesn't allow a minimum age greater than maximum age`, async () => {
        await actions.rollover.setMaxAge('10', 'd');
        await actions.rollover.setMinAge('11', 'd');

        await expectErrorMessages([
          i18nTexts.editPolicy.errors.rolloverRestrictionGreaterThanTrigger,
        ]);
      });

      test(`doesn't allow decimals for minimum docs`, async () => {
        await actions.rollover.setMinDocs('5.5');

        await expectErrorMessages([i18nTexts.editPolicy.errors.integerRequired]);
      });

      test(`doesn't allow negative minimum docs`, async () => {
        await actions.rollover.setMinDocs('-1');

        await expectErrorMessages([i18nTexts.editPolicy.errors.nonNegativeNumberRequired]);
      });

      test(`allows 0 for minimum docs`, async () => {
        await actions.rollover.setMinDocs('0');

        await expectErrorMessages([]);
      });
    });
  });

  describe('forcemerge', () => {
    test(`doesn't allow 0 for forcemerge`, async () => {
      actions.hot.toggleForceMerge();
      await actions.hot.setForcemergeSegmentsCount('0');
      await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
    });
    test(`doesn't allow -1 for forcemerge`, async () => {
      actions.hot.toggleForceMerge();
      await actions.hot.setForcemergeSegmentsCount('-1');
      await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
    });
  });

  describe('shrink', () => {
    test(`doesn't allow 0 for shrink size`, async () => {
      await actions.hot.setShrinkSize('0');
      await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
    });
    test(`doesn't allow -1 for shrink size`, async () => {
      await actions.hot.setShrinkSize('-1');
      await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
    });
    test(`doesn't allow 0 for shrink count`, async () => {
      await actions.hot.setShrinkCount('0');
      await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
    });
    test(`doesn't allow -1 for shrink count`, async () => {
      await actions.hot.setShrinkCount('-1');
      await expectErrorMessages([i18nTexts.editPolicy.errors.numberGreatThan0Required]);
    });
  });

  describe('index priority', () => {
    test(`doesn't allow -1 for index priority`, async () => {
      await actions.hot.setIndexPriority('-1');
      await expectErrorMessages([i18nTexts.editPolicy.errors.nonNegativeNumberRequired]);
    });

    test(`allows 0 for index priority`, async () => {
      await actions.hot.setIndexPriority('0');
      await expectErrorMessages([]);
    });
  });
});
