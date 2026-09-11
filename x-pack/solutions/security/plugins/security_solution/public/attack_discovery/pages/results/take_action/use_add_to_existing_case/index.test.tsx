/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import { SECURITY_ATTACK_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';

import { useAddToExistingCase } from '.';
import { useKibana } from '../../../../../common/lib/kibana';
import { TestProviders } from '../../../../../common/mock';

jest.mock('../../../../../common/lib/kibana', () => ({
  useKibana: jest.fn().mockReturnValue({
    services: {
      cases: {
        hooks: {
          useCasesAddToExistingCaseModal: jest.fn().mockReturnValue({
            open: jest.fn(),
          }),
        },
      },
    },
  }),
}));

describe('useAddToExistingCase', () => {
  const mockCanUserCreateAndReadCases = jest.fn();
  const mockOnClick = jest.fn();
  const mockAlertIds = ['alert1', 'alert2'];
  const mockMarkdownComments = ['Comment 1', 'Comment 2'];
  const mockReplacements = { alert1: 'replacement1', alert2: 'replacement2' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables the action when a user can NOT create and read cases', () => {
    mockCanUserCreateAndReadCases.mockReturnValue(false);

    const { result } = renderHook(
      () =>
        useAddToExistingCase({
          canUserCreateAndReadCases: mockCanUserCreateAndReadCases,
          onClick: mockOnClick,
        }),
      {
        wrapper: TestProviders,
      }
    );

    expect(result.current.disabled).toBe(true);
  });

  it('enables the action when a user can create and read cases', () => {
    mockCanUserCreateAndReadCases.mockReturnValue(true);

    const { result } = renderHook(
      () =>
        useAddToExistingCase({
          canUserCreateAndReadCases: mockCanUserCreateAndReadCases,
          onClick: mockOnClick,
        }),
      {
        wrapper: TestProviders,
      }
    );

    expect(result.current.disabled).toBe(false);
  });

  it('calls the openSelectCaseModal function with the expected attachments', () => {
    mockCanUserCreateAndReadCases.mockReturnValue(true);
    const mockOpenSelectCaseModal = jest.fn();
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        cases: {
          hooks: {
            useCasesAddToExistingCaseModal: jest.fn().mockReturnValue({
              open: mockOpenSelectCaseModal,
            }),
          },
        },
      },
    });

    const { result } = renderHook(
      () =>
        useAddToExistingCase({
          canUserCreateAndReadCases: mockCanUserCreateAndReadCases,
          onClick: mockOnClick,
        }),
      {
        wrapper: TestProviders,
      }
    );

    act(() => {
      result.current.onAddToExistingCase({
        alertIds: mockAlertIds,
        markdownComments: mockMarkdownComments,
        replacements: mockReplacements,
      });
    });

    expect(mockOpenSelectCaseModal).toHaveBeenCalledWith({
      getAttachments: expect.any(Function),
    });

    const getAttachments = mockOpenSelectCaseModal.mock.calls[0][0].getAttachments;
    const attachments = getAttachments();

    expect(attachments).toHaveLength(4);
    expect(attachments[0]).toEqual({
      type: 'comment',
      data: {
        content: 'Comment 1',
      },
    });
    expect(attachments[1]).toEqual({
      type: 'comment',
      data: {
        content: 'Comment 2',
      },
    });
    expect(attachments[2]).toEqual({
      type: 'security.alert',
      attachmentId: 'replacement1',
      metadata: {
        index: '',
        rule: { id: null, name: null },
      },
    });
    expect(attachments[3]).toEqual({
      type: 'security.alert',
      attachmentId: 'replacement2',
      metadata: {
        index: '',
        rule: { id: null, name: null },
      },
    });
  });

  it('posts the provided attachments verbatim, without a markdown user comment', () => {
    mockCanUserCreateAndReadCases.mockReturnValue(true);
    const mockOpenSelectCaseModal = jest.fn();
    (useKibana as jest.Mock).mockReturnValue({
      services: {
        cases: {
          hooks: {
            useCasesAddToExistingCaseModal: jest.fn().mockReturnValue({
              open: mockOpenSelectCaseModal,
            }),
          },
        },
      },
    });
    const providedAttachments = [
      {
        type: SECURITY_ATTACK_ATTACHMENT_TYPE,
        attachmentId: 'attack-1',
        metadata: { title: 'An attack', alertCount: 1, index: 'attack-index' },
      },
    ];

    const { result } = renderHook(
      () =>
        useAddToExistingCase({
          canUserCreateAndReadCases: mockCanUserCreateAndReadCases,
          onClick: mockOnClick,
        }),
      {
        wrapper: TestProviders,
      }
    );

    act(() => {
      result.current.onAddToExistingCase({
        alertIds: mockAlertIds,
        markdownComments: mockMarkdownComments,
        replacements: mockReplacements,
        attachments: providedAttachments,
      });
    });

    const getAttachments = mockOpenSelectCaseModal.mock.calls[0][0].getAttachments;
    expect(getAttachments()).toEqual(providedAttachments);
  });
});
