/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';
import { COMMENT_ATTACHMENT_TYPE, SECURITY_ATTACK_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';

import { useAddToNewCase } from '.';
import { useKibana } from '../../../../../common/lib/kibana';
import { TestProviders } from '../../../../../common/mock';

jest.mock('../../../../../common/lib/kibana', () => ({
  useKibana: jest.fn().mockReturnValue({
    services: {
      cases: {
        hooks: {
          useCasesAddToNewCaseFlyout: jest.fn().mockReturnValue({
            open: jest.fn(),
          }),
        },
      },
    },
  }),
}));

/** Points `useCasesAddToNewCaseFlyout().open` at a fresh mock and returns it. */
const mockCaseFlyout = (): jest.Mock => {
  const open = jest.fn();
  (useKibana as jest.Mock).mockReturnValue({
    services: {
      cases: {
        hooks: {
          useCasesAddToNewCaseFlyout: jest.fn().mockReturnValue({ open }),
        },
      },
    },
  });
  return open;
};

describe('useAddToNewCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('disables the action when a user can NOT create and read cases', () => {
    const canUserCreateAndReadCases = jest.fn().mockReturnValue(false);

    const { result } = renderHook(
      () =>
        useAddToNewCase({
          canUserCreateAndReadCases,
          title: 'Persistent Execution of Malicious Application',
        }),
      {
        wrapper: TestProviders,
      }
    );

    expect(result.current.disabled).toBe(true);
  });

  it('enables the action when a user can create and read cases', () => {
    const canUserCreateAndReadCases = jest.fn().mockReturnValue(true);

    const { result } = renderHook(
      () =>
        useAddToNewCase({
          canUserCreateAndReadCases,
          title: 'Persistent Execution of Malicious Application',
        }),
      {
        wrapper: TestProviders,
      }
    );

    expect(result.current.disabled).toBe(false);
  });

  it('calls the onClick callback when provided', () => {
    const onClick = jest.fn();
    const canUserCreateAndReadCases = jest.fn().mockReturnValue(true);

    const { result } = renderHook(
      () =>
        useAddToNewCase({
          canUserCreateAndReadCases,
          title: 'Persistent Execution of Malicious Application',
          onClick,
        }),
      {
        wrapper: TestProviders,
      }
    );

    act(() => {
      result.current.onAddToNewCase({
        alertIds: ['alert1', 'alert2'],
        markdownComments: ['Comment 1', 'Comment 2'],
      });
    });

    expect(onClick).toHaveBeenCalled();
  });

  it('posts a markdown user comment when no attachments are provided', () => {
    const canUserCreateAndReadCases = jest.fn().mockReturnValue(true);
    const openCaseFlyout = mockCaseFlyout();

    const { result } = renderHook(
      () =>
        useAddToNewCase({
          canUserCreateAndReadCases,
          title: 'Persistent Execution of Malicious Application',
        }),
      { wrapper: TestProviders }
    );

    act(() => {
      result.current.onAddToNewCase({
        alertIds: ['alert1'],
        markdownComments: ['Comment 1'],
      });
    });

    expect(openCaseFlyout).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: expect.arrayContaining([
          expect.objectContaining({ type: COMMENT_ATTACHMENT_TYPE }),
        ]),
      })
    );
  });

  it('posts the provided attachments verbatim, without a markdown user comment', () => {
    const canUserCreateAndReadCases = jest.fn().mockReturnValue(true);
    const openCaseFlyout = mockCaseFlyout();
    const attachments = [
      {
        type: SECURITY_ATTACK_ATTACHMENT_TYPE,
        attachmentId: 'attack-1',
        metadata: { title: 'An attack', alertCount: 1, index: 'attack-index' },
      },
    ];

    const { result } = renderHook(
      () =>
        useAddToNewCase({
          canUserCreateAndReadCases,
          title: 'Persistent Execution of Malicious Application',
        }),
      { wrapper: TestProviders }
    );

    act(() => {
      result.current.onAddToNewCase({
        alertIds: ['alert1'],
        markdownComments: ['Comment 1'],
        attachments,
      });
    });

    expect(openCaseFlyout).toHaveBeenCalledWith(expect.objectContaining({ attachments }));
  });
});
