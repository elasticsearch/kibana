/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';
import { kibanaStartMock } from '../../utils/kibana_react.mock';
import {
  ADD_DATA_BUTTON_TEST_SUBJ,
  CREATE_ANNOTATION_BUTTON_TEST_SUBJ,
  useAnnotationsAppHeaderMenu,
} from './use_annotations_app_header_menu';

const mockUseKibanaReturnValue = kibanaStartMock.startContract();
const onboardingHref = '/app/observabilityOnboarding';
const onboardingLocator = sharePluginMock.createLocator();
onboardingLocator.useUrl.mockReturnValue(onboardingHref);
jest
  .spyOn(mockUseKibanaReturnValue.services.share.url.locators, 'get')
  .mockReturnValue(onboardingLocator);

jest.mock('../../utils/kibana_react', () => ({
  __esModule: true,
  useKibana: jest.fn(() => mockUseKibanaReturnValue),
}));

describe('useAnnotationsAppHeaderMenu', () => {
  it('puts Add data first and Create annotation as the primary action', () => {
    const onCreate = jest.fn();
    const { result } = renderHook(() =>
      useAnnotationsAppHeaderMenu({
        includeCreate: true,
        canWrite: true,
        onCreate,
      })
    );

    expect(result.current.items).toEqual([
      expect.objectContaining({
        id: 'addData',
        label: 'Add data',
        href: onboardingHref,
        testId: ADD_DATA_BUTTON_TEST_SUBJ,
      }),
    ]);
    expect(result.current.primaryActionItem).toEqual(
      expect.objectContaining({
        id: 'createAnnotation',
        label: 'Create annotation',
        testId: CREATE_ANNOTATION_BUTTON_TEST_SUBJ,
        disableButton: false,
      })
    );

    result.current.primaryActionItem?.run?.();
    expect(onCreate).toHaveBeenCalled();
  });

  it('disables Create annotation without write permission', () => {
    const { result } = renderHook(() =>
      useAnnotationsAppHeaderMenu({
        includeCreate: true,
        canWrite: false,
        onCreate: jest.fn(),
      })
    );

    expect(result.current.primaryActionItem).toEqual(
      expect.objectContaining({
        disableButton: true,
        tooltipContent: 'You do not have permission to create annotations',
      })
    );
  });

  it('omits Create annotation when includeCreate is false', () => {
    const { result } = renderHook(() =>
      useAnnotationsAppHeaderMenu({
        includeCreate: false,
      })
    );

    expect(result.current.primaryActionItem).toBeUndefined();
    expect(result.current.items?.[0]).toEqual(
      expect.objectContaining({
        id: 'addData',
        testId: ADD_DATA_BUTTON_TEST_SUBJ,
      })
    );
  });
});
