/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createTelemetryServiceMock } from '../../../common/lib/telemetry/telemetry_service.mock';
import { TestProviders } from '@kbn/timelines-plugin/public/mock';
import { renderHook, waitFor } from '@testing-library/react';
import { useFileValidation, useNavigationSteps } from './hooks';
import { useKibana as mockUseKibana } from '../../../common/lib/kibana/__mocks__';
import { FileUploaderSteps } from './types';

const mockedUseKibana = mockUseKibana();
const mockedTelemetry = createTelemetryServiceMock();

jest.mock('../../../common/lib/kibana', () => {
  const original = jest.requireActual('../../../common/lib/kibana');

  return {
    ...original,
    useKibana: () => ({
      ...mockedUseKibana,
      services: {
        ...mockedUseKibana.services,
        telemetry: mockedTelemetry,
      },
    }),
  };
});

describe('useFileValidation', () => {
  const headerRow = 'type,user.email,user.name,criticality_level';
  const validLine = 'user,user-001@elastic.co,user-001,low_impact';
  const extraLine = 'user,user-002@elastic.co,user-002,medium_impact';

  test('should call onError for invalid file type', () => {
    const onErrorMock = jest.fn();
    const onCompleteMock = jest.fn();

    const { result } = renderHook(
      () =>
        useFileValidation({
          onError: onErrorMock,
          onComplete: onCompleteMock,
        }),
      { wrapper: TestProviders }
    );
    result.current(new File([validLine], 'test.csv', { type: 'invalid file type' }));

    expect(onErrorMock).toHaveBeenCalled();
    expect(onCompleteMock).not.toHaveBeenCalled();
  });

  test('should call onComplete with all rows valid and no invalid lines', async () => {
    const onErrorMock = jest.fn();
    const onCompleteMock = jest.fn();
    const fileName = 'test.csv';
    const csvContent = `${headerRow}\n${validLine}\n${extraLine}`;

    const { result } = renderHook(
      () =>
        useFileValidation({
          onError: onErrorMock,
          onComplete: onCompleteMock,
        }),
      { wrapper: TestProviders }
    );
    result.current(new File([csvContent], fileName, { type: 'text/csv' }));

    await waitFor(() => {
      expect(onErrorMock).not.toHaveBeenCalled();
      expect(onCompleteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          validatedFile: expect.objectContaining({
            name: fileName,
            invalidLines: {
              text: '',
              count: 0,
              errors: [],
            },
          }),
        })
      );
    });
  });

  test('should subtract 1 from count to exclude the header row', async () => {
    const onCompleteMock = jest.fn();
    const fileName = 'test.csv';
    const csvContent = `${headerRow}\n${validLine}\n${extraLine}`;

    const { result } = renderHook(
      () =>
        useFileValidation({
          onError: jest.fn(),
          onComplete: onCompleteMock,
        }),
      { wrapper: TestProviders }
    );
    result.current(new File([csvContent], fileName, { type: 'text/csv' }));

    await waitFor(() => {
      expect(onCompleteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          validatedFile: expect.objectContaining({
            validLines: expect.objectContaining({
              count: 2, // 3 total rows - 1 header row
            }),
          }),
        })
      );
    });
  });
});

describe('useNavigationSteps', () => {
  const goToFirstStep = jest.fn();
  const filePickerState = { step: FileUploaderSteps.FILE_PICKER as const, isLoading: false };
  const resultState = { step: FileUploaderSteps.RESULT as const, validLinesAsText: '' };

  test('renders select-file and results steps', () => {
    const { result } = renderHook(() => useNavigationSteps(filePickerState, goToFirstStep));

    expect(result.current).toHaveLength(2);
    expect(result.current[0].title).toMatch(/select a file/i);
    expect(result.current[1].title).toMatch(/results/i);
  });

  test('result step is always last', () => {
    const { result } = renderHook(() => useNavigationSteps(resultState, goToFirstStep));

    expect(result.current[result.current.length - 1].title).toMatch(/results/i);
  });
});
