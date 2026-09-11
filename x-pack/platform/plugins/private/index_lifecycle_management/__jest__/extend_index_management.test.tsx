/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import moment from 'moment-timezone';
import { useEuiTheme } from '@elastic/eui';

import { screen, waitFor } from '@testing-library/react';
import { renderWithI18n } from '@kbn/test-jest-helpers';
import { usageCollectionPluginMock } from '@kbn/usage-collection-plugin/public/mocks';
import type { Index } from '../common/types';

import { init } from '../integration_tests/helpers/http_requests';
import {
  retryLifecycleActionExtension,
  removeLifecyclePolicyActionExtension,
  addLifecyclePolicyActionExtension,
  ilmBannerExtension,
  ilmFilterExtension,
} from '../public/extend_index_management';
import { init as initHttp } from '../public/application/services/http';
import { init as initUiMetric } from '../public/application/services/ui_metric';
import { indexLifecycleTab } from '../public/extend_index_management/components/index_lifecycle_summary';

const { httpSetup } = init();

initHttp(httpSetup);
initUiMetric(usageCollectionPluginMock.createSetupContract());

jest.mock('@kbn/index-management-plugin/public', async () => {
  const { indexManagementMock } = await import('@kbn/index-management-plugin/public/mocks');
  return indexManagementMock.createSetup();
});

// Mock useEuiTheme to return the desired theme
jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  useEuiTheme: () => ({
    euiTheme: {
      themeName: 'EUI_THEME_BOREALIS',
      colors: {
        vis: {
          euiColorVis3: '#BFDBFF',
        },
        severity: {
          risk: '#FF995E',
          warning: '#FCD883',
          neutral: '#B5E5F2',
        },
        backgroundBaseSubdued: '#CAD3E2',
      },
    },
  }),
}));

const indexWithoutLifecyclePolicy: Index = {
  health: 'yellow',
  status: 'open',
  name: 'noPolicy',
  uuid: 'BJ-nrZYuSrG-jaofr6SeLg',
  primary: 1,
  replica: 1,
  documents: 1,
  documents_deleted: 0,
  size: 3480,
  primary_size: 3480,
  aliases: 'none',
  isFrozen: false,
  hidden: false,
  ilm: {
    index: 'testy1',
    managed: false,
  },
};

const indexWithLifecyclePolicy: Index = {
  health: 'yellow',
  status: 'open',
  name: 'testy3',
  uuid: 'XL11TLa3Tvq298_dMUzLHQ',
  primary: 1,
  replica: 1,
  documents: 2,
  documents_deleted: 0,
  size: 6656,
  primary_size: 6656,
  aliases: 'none',
  isFrozen: false,
  hidden: false,
  ilm: {
    index: 'testy3',
    managed: true,
    policy: 'testy',
    lifecycle_date_millis: 1544020872361,
    phase: 'new',
    phase_time_millis: 1544187775867,
    action: 'complete',
    action_time_millis: 1544187775867,
    step: 'complete',
    step_time_millis: 1544187775867,
    skip: false,
  },
};

const indexWithLifecycleError: Index = {
  health: 'yellow',
  status: 'open',
  name: 'testy3',
  uuid: 'XL11TLa3Tvq298_dMUzLHQ',
  primary: 1,
  replica: 1,
  documents: 2,
  documents_deleted: 0,
  size: 6656,
  primary_size: 6656,
  aliases: 'none',
  isFrozen: false,
  hidden: false,
  ilm: {
    index: 'testy3',
    managed: true,
    policy: 'testy',
    lifecycle_date_millis: 1544020872361,
    phase: 'hot',
    phase_time_millis: 1544187775891,
    action: 'rollover',
    action_time_millis: 1544187775891,
    step: 'ERROR',
    step_time_millis: 1544187776208,
    failed_step: 'check-rollover-ready',
    step_info: {
      type: 'illegal_argument_exception',
      reason: 'setting [index.lifecycle.rollover_alias] for index [testy3] is empty or not defined',
    },
    skip: false,
  },
};
const indexWithLifecyclePhaseDefinition: Index = {
  health: 'yellow',
  status: 'open',
  name: 'testy3',
  uuid: 'XL11TLa3Tvq298_dMUzLHQ',
  primary: 1,
  replica: 1,
  documents: 2,
  documents_deleted: 0,
  size: 6656,
  primary_size: 6656,
  aliases: 'none',
  isFrozen: false,
  hidden: false,
  ilm: {
    index: 'testy3',
    managed: true,
    policy: 'testy',
    lifecycle_date_millis: 1544020872361,
    phase: 'hot',
    phase_time_millis: 1544187775891,
    action: 'rollover',
    action_time_millis: 1544187775891,
    step: 'test',
    step_time_millis: 1544187776208,
    phase_execution: {
      policy: 'testy',
      phase_definition: { min_age: '0s', actions: { rollover: { max_size: '1gb' } } },
      version: 1,
      modified_date_in_millis: 1544031699844,
    },
    skip: false,
  },
};
const indexWithLifecycleWaitingStep: Index = {
  health: 'yellow',
  status: 'open',
  name: 'testy3',
  uuid: 'XL11TLa3Tvq298_dMUzLHQ',
  primary: 1,
  replica: 1,
  documents: 2,
  documents_deleted: 0,
  size: 6656,
  primary_size: 6656,
  aliases: 'none',
  isFrozen: false,
  hidden: false,
  ilm: {
    index: 'testy3',
    managed: true,
    policy: 'testy',
    lifecycle_date_millis: 1544020872361,
    phase: 'hot',
    phase_time_millis: 1544187775891,
    action: 'rollover',
    action_time_millis: 1544187775891,
    step: 'test',
    step_time_millis: 1544187776208,
    step_info: {
      message: 'Waiting for all shard copies to be active',
      shards_left_to_allocate: -1,
      all_shards_active: false,
      number_of_replicas: 2,
    },
    skip: false,
  },
};
const indexWithNonExistentPolicyError: Index = {
  health: 'yellow',
  status: 'open',
  name: 'testy3',
  uuid: 'XL11TLa3Tvq298_dMUzLHQ',
  primary: 1,
  replica: 1,
  documents: 2,
  documents_deleted: 0,
  size: 6656,
  primary_size: 6656,
  aliases: 'none',
  isFrozen: false,
  hidden: false,
  ilm: {
    index: 'testy3',
    managed: true,
    policy: 'testy',
    index_creation_date_millis: 1753074916462,
    step: 'ERROR',
    step_info: {
      type: 'illegal_argument_exception',
      reason: 'policy [testy] does not exist',
    },
    skip: false,
  },
};

// ES 9.6+ reports lookup indices as unmanaged even when `index.lifecycle.name` is set.
const lookupIndexWithoutPolicyName: Index = {
  health: 'green',
  status: 'open',
  name: 'lookupNoPolicy',
  uuid: 'lookupNoPolicyUuid',
  primary: 1,
  replica: 0,
  documents: 1,
  documents_deleted: 0,
  size: 3480,
  primary_size: 3480,
  aliases: 'none',
  isFrozen: false,
  hidden: false,
  mode: 'lookup',
  ilm: {
    index: 'lookupNoPolicy',
    managed: false,
  },
};

const lookupIndexWithPolicyName: Index = {
  ...lookupIndexWithoutPolicyName,
  name: 'lookupStalePolicy',
  uuid: 'lookupStalePolicyUuid',
  ilmPolicyName: 'testy',
  ilm: {
    index: 'lookupStalePolicy',
    managed: false,
  },
};

moment.tz.setDefault('utc');

const getUrlForApp = (appId: string, options: any) => {
  return appId + '/' + (options ? options.path : '');
};

const reloadIndices = () => {};

describe('extend index management', () => {
  describe('retry lifecycle action extension', () => {
    test('should return null when no indices have index lifecycle policy', () => {
      const extension = retryLifecycleActionExtension({ indices: [indexWithoutLifecyclePolicy] });
      expect(extension).toBeNull();
    });

    test('should return null when no index has failed step lifecycle errors', () => {
      const extension = retryLifecycleActionExtension({
        indices: [indexWithLifecyclePolicy, indexWithLifecyclePolicy],
      });
      expect(extension).toBeNull();
    });

    test('should return extension with only indices that have failed step lifecycle errors', () => {
      const extension = retryLifecycleActionExtension({
        indices: [
          indexWithLifecyclePolicy,
          indexWithLifecycleError,
          indexWithNonExistentPolicyError,
        ],
      });
      expect(extension).toBeDefined();
      expect(extension).toMatchSnapshot();
    });

    test('should return extension when all indices have failed step lifecycle errors', () => {
      const extension = retryLifecycleActionExtension({
        indices: [indexWithLifecycleError, indexWithLifecycleError],
      });
      expect(extension).toBeDefined();
      expect(extension).toMatchSnapshot();
    });
  });

  describe('remove lifecycle action extension', () => {
    test('should return null when no indices have index lifecycle policy', () => {
      const extension = removeLifecyclePolicyActionExtension({
        indices: [indexWithoutLifecyclePolicy],
        reloadIndices,
      });
      expect(extension).toBeNull();
    });

    test('should return null when some indices have index lifecycle policy', () => {
      const extension = removeLifecyclePolicyActionExtension({
        indices: [indexWithoutLifecyclePolicy, indexWithLifecyclePolicy],
        reloadIndices,
      });
      expect(extension).toBeNull();
    });

    test('should return extension when all indices have lifecycle policy', () => {
      const extension = removeLifecyclePolicyActionExtension({
        indices: [indexWithLifecycleError, indexWithLifecycleError],
        reloadIndices,
      });
      expect(extension).toBeDefined();
      expect(extension).toMatchSnapshot();
    });

    test('should return extension when lookup index has a configured lifecycle policy name', () => {
      const extension = removeLifecyclePolicyActionExtension({
        indices: [lookupIndexWithPolicyName],
        reloadIndices,
      });
      expect(extension).not.toBeNull();
      expect(extension?.indexNames).toEqual([[lookupIndexWithPolicyName.name]]);
    });

    test('should return extension when mixing managed and lookup indices with a policy name', () => {
      const extension = removeLifecyclePolicyActionExtension({
        indices: [indexWithLifecyclePolicy, lookupIndexWithPolicyName],
        reloadIndices,
      });
      expect(extension).not.toBeNull();
      expect(extension?.indexNames).toEqual([
        [indexWithLifecyclePolicy.name, lookupIndexWithPolicyName.name],
      ]);
    });

    test('should return null when lookup index has no configured lifecycle policy name', () => {
      const extension = removeLifecyclePolicyActionExtension({
        indices: [lookupIndexWithoutPolicyName],
        reloadIndices,
      });
      expect(extension).toBeNull();
    });

    test('should return null when a non-lookup unmanaged index has a configured lifecycle policy name', () => {
      const extension = removeLifecyclePolicyActionExtension({
        indices: [{ ...indexWithoutLifecyclePolicy, ilmPolicyName: 'inactive-policy' }],
        reloadIndices,
      });
      expect(extension).toBeNull();
    });
  });

  describe('add lifecycle policy action extension', () => {
    test('should return null when index has index lifecycle policy', () => {
      const extension = addLifecyclePolicyActionExtension({
        indices: [indexWithLifecyclePolicy],
        reloadIndices,
        getUrlForApp,
      });
      expect(extension).toBeNull();
    });

    test('should return null when more than one index is passed', () => {
      const extension = addLifecyclePolicyActionExtension({
        indices: [indexWithoutLifecyclePolicy, indexWithoutLifecyclePolicy],
        reloadIndices,
        getUrlForApp,
      });
      expect(extension).toBeNull();
    });

    test('should return null when index is a lookup index', () => {
      const extension = addLifecyclePolicyActionExtension({
        indices: [lookupIndexWithoutPolicyName],
        reloadIndices,
        getUrlForApp,
      });
      expect(extension).toBeNull();
    });

    test('should return null when lookup index still has a configured lifecycle policy name', () => {
      const extension = addLifecyclePolicyActionExtension({
        indices: [lookupIndexWithPolicyName],
        reloadIndices,
        getUrlForApp,
      });
      expect(extension).toBeNull();
    });

    test('should return extension when one index is passed and it does not have lifecycle policy', async () => {
      const extension = addLifecyclePolicyActionExtension({
        indices: [indexWithoutLifecyclePolicy],
        reloadIndices,
        getUrlForApp,
      });
      expect(extension?.renderConfirmModal).toBeDefined();
      const component = extension!.renderConfirmModal(jest.fn());
      renderWithI18n(component);

      // Wait for the async componentDidMount to complete
      await waitFor(() => {
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      });
    });
  });

  describe('ilm banner extension', () => {
    test('should return null when no index has index lifecycle policy', () => {
      const extension = ilmBannerExtension([
        indexWithoutLifecyclePolicy,
        indexWithoutLifecyclePolicy,
      ]);
      expect(extension).toBeNull();
    });

    test('should return null no index has lifecycle error', () => {
      const extension = ilmBannerExtension([indexWithoutLifecyclePolicy, indexWithLifecyclePolicy]);
      expect(extension).toBeNull();
    });

    test('should return extension when any index has lifecycle error', () => {
      const extension = ilmBannerExtension([
        indexWithoutLifecyclePolicy,
        indexWithLifecyclePolicy,
        indexWithLifecycleError,
      ]);
      expect(extension).toBeDefined();
      expect(extension).toMatchSnapshot();
    });

    test('should return action definition when any index has failed step lifecycle error', () => {
      const extension = ilmBannerExtension([
        indexWithoutLifecyclePolicy,
        indexWithLifecyclePolicy,
        indexWithLifecycleError,
        indexWithNonExistentPolicyError,
      ]);
      const { requestMethod, successMessage, buttonLabel } =
        retryLifecycleActionExtension({
          indices: [indexWithLifecycleError],
        }) ?? {};
      expect(extension?.action).toEqual({
        requestMethod,
        successMessage,
        buttonLabel,
        indexNames: [indexWithLifecycleError.name],
      });
    });

    test('should not return action definition when index has lifecycle error other than failed step', () => {
      const extension = ilmBannerExtension([
        indexWithoutLifecyclePolicy,
        indexWithLifecyclePolicy,
        indexWithNonExistentPolicyError,
      ]);
      expect(extension?.action).toBeUndefined();
    });
  });

  describe('ilm summary extension', () => {
    const IlmComponent = indexLifecycleTab.renderTabContent;
    const policyPropertiesPanel = 'policyPropertiesPanel';
    const policyStepPanel = 'policyStepPanel';
    const policyErrorPanel = 'policyErrorPanel';
    const phaseDefinitionPanel = 'phaseDefinitionPanel';

    const IlmContentComponent = ({ index }: { index: Index }) => {
      const { euiTheme } = useEuiTheme();
      return <IlmComponent index={index} getUrlForApp={getUrlForApp} euiTheme={euiTheme} />;
    };

    test('should not render the tab when index has no index lifecycle policy', () => {
      const shouldRenderTab =
        indexLifecycleTab.shouldRenderTab &&
        indexLifecycleTab.shouldRenderTab({
          index: indexWithoutLifecyclePolicy,
        });
      expect(shouldRenderTab).toBeFalsy();
    });

    test('should render the tab when index has lifecycle policy', () => {
      const shouldRenderTab =
        indexLifecycleTab.shouldRenderTab &&
        indexLifecycleTab.shouldRenderTab({
          index: indexWithLifecyclePolicy,
        });
      expect(shouldRenderTab).toBeTruthy();
      const { container } = renderWithI18n(
        <IlmContentComponent index={indexWithLifecyclePolicy} />
      );
      expect(container).toMatchSnapshot();
      expect(screen.getByTestId(policyPropertiesPanel)).toBeInTheDocument();
      expect(screen.queryByTestId(phaseDefinitionPanel)).not.toBeInTheDocument();
      expect(screen.queryByTestId(policyStepPanel)).not.toBeInTheDocument();
      expect(screen.queryByTestId(policyErrorPanel)).not.toBeInTheDocument();
    });

    test('should render an error panel when index has lifecycle error', () => {
      const { container } = renderWithI18n(<IlmContentComponent index={indexWithLifecycleError} />);
      expect(container).toMatchSnapshot();
      expect(screen.getByTestId(policyPropertiesPanel)).toBeInTheDocument();
      expect(screen.queryByTestId(phaseDefinitionPanel)).not.toBeInTheDocument();
      expect(screen.queryByTestId(policyStepPanel)).not.toBeInTheDocument();
      expect(screen.getByTestId(policyErrorPanel)).toBeInTheDocument();
    });

    test('should render a phase definition panel when lifecycle has phase definition', () => {
      const { container } = renderWithI18n(
        <IlmContentComponent index={indexWithLifecyclePhaseDefinition} />
      );
      expect(container).toMatchSnapshot();
      expect(screen.getByTestId(policyPropertiesPanel)).toBeInTheDocument();
      expect(screen.getByTestId(phaseDefinitionPanel)).toBeInTheDocument();
      expect(screen.queryByTestId(policyStepPanel)).not.toBeInTheDocument();
      expect(screen.queryByTestId(policyErrorPanel)).not.toBeInTheDocument();
    });

    test('should render a step info panel when lifecycle is waiting for a step completion', () => {
      const { container } = renderWithI18n(
        <IlmContentComponent index={indexWithLifecycleWaitingStep} />
      );
      expect(container).toMatchSnapshot();
      expect(screen.getByTestId(policyPropertiesPanel)).toBeInTheDocument();
      expect(screen.queryByTestId(phaseDefinitionPanel)).not.toBeInTheDocument();
      expect(screen.getByTestId(policyStepPanel)).toBeInTheDocument();
      expect(screen.queryByTestId(policyErrorPanel)).not.toBeInTheDocument();
    });
  });

  describe('ilm filter extension', () => {
    test('should return empty array when no indices have index lifecycle policy', () => {
      const extension = ilmFilterExtension([
        indexWithoutLifecyclePolicy,
        indexWithoutLifecyclePolicy,
      ]);
      expect(extension.length).toBe(0);
    });

    test('should return extension when any index has lifecycle policy', () => {
      const extension = ilmFilterExtension([
        indexWithLifecyclePolicy,
        indexWithoutLifecyclePolicy,
        indexWithoutLifecyclePolicy,
      ]);
      expect(extension).toBeDefined();
      expect(extension).toMatchSnapshot();
    });
  });
});
