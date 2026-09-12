/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';

import type { ToastWithRichTitle } from './deduplicate_toasts';
import { deduplicateToasts, TitleWithBadge } from './deduplicate_toasts';
import type { Toast } from '@kbn/core-notifications-browser';
import type { MountPoint } from '@kbn/core-mount-utils-browser';

function toast(title: string | MountPoint, text?: string | MountPoint, id = Math.random()): Toast {
  return {
    id: id.toString(),
    title,
    text,
  };
}

const fakeMountPoint = () => () => {};

describe('deduplicate toasts', () => {
  it('returns an empty list for an empty input', () => {
    const toasts: Toast[] = [];

    const { toasts: deduplicatedToastList } = deduplicateToasts(toasts);

    expect(deduplicatedToastList).toHaveLength(0);
  });

  it(`doesn't affect singular notifications`, () => {
    const toasts: Toast[] = [
      toast('A', 'B'), // single toast
      toast('X', 'Y'), // single toast
    ];

    const { toasts: deduplicatedToastList } = deduplicateToasts(toasts);

    expect(deduplicatedToastList).toHaveLength(toasts.length);
    verifyTextAndTitle(deduplicatedToastList[0], 'A', 'B');
    verifyTextAndTitle(deduplicatedToastList[1], 'X', 'Y');
  });

  it(`doesn't group notifications with MountPoints for title`, () => {
    const toasts: Toast[] = [
      toast('A', 'B'),
      toast(fakeMountPoint, 'B'),
      toast(fakeMountPoint, 'B'),
      toast(fakeMountPoint, fakeMountPoint),
      toast(fakeMountPoint, fakeMountPoint),
    ];

    const { toasts: deduplicatedToastList } = deduplicateToasts(toasts);

    expect(deduplicatedToastList).toHaveLength(toasts.length);
  });

  it('groups toasts based on title + text', () => {
    const toasts: Toast[] = [
      toast('A', 'B'), // 2 of these
      toast('X', 'Y'), // 3 of these
      toast('A', 'B'),
      toast('X', 'Y'),
      toast('A', 'C'), // 1 of these
      toast('X', 'Y'),
    ];

    const { toasts: deduplicatedToastList } = deduplicateToasts(toasts);

    expect(deduplicatedToastList).toHaveLength(3);
    verifyTextAndTitle(deduplicatedToastList[0], 'A 2', 'B');
    verifyTextAndTitle(deduplicatedToastList[1], 'X 3', 'Y');
    verifyTextAndTitle(deduplicatedToastList[2], 'A', 'C');
  });

  it('groups toasts based on title, when text is not available', () => {
    const toasts: Toast[] = [
      toast('A', 'B'), // 2 of these
      toast('A', fakeMountPoint), // 2 of these
      toast('A', 'C'), // 1 of this
      toast('A', 'B'),
      toast('A', fakeMountPoint),
      toast('A'), // but it doesn't group functions with missing texts
    ];

    const { toasts: deduplicatedToastList } = deduplicateToasts(toasts);

    expect(deduplicatedToastList).toHaveLength(4);
    verifyTextAndTitle(deduplicatedToastList[0], 'A 2', 'B');
    verifyTextAndTitle(deduplicatedToastList[1], 'A 2', expect.any(Function));
    verifyTextAndTitle(deduplicatedToastList[2], 'A', 'C');
    verifyTextAndTitle(deduplicatedToastList[3], 'A', undefined);
  });
});

describe('TitleWithBadge component', () => {
  it('renders with string titles', () => {
    const title = 'Welcome!';

    const titleComponent = <TitleWithBadge title={title} counter={5} />;
    const renderedTitle = render(titleComponent);

    expect(renderedTitle.container.textContent).toMatch('Welcome! 5');
    expect(render(titleComponent).container.innerHTML).toMatchInlineSnapshot(
      `"Welcome! <span class=\\"euiNotificationBadge css-4a6p8m-floatTopRight css-syjyv5-euiNotificationBadge-m-subdued\\">5</span>"`
    );
  });
});

function verifyTextAndTitle(
  { text, title }: ToastWithRichTitle,
  expectedTitle?: string,
  expectedText?: string
) {
  expect(getNodeText(title)).toEqual(expectedTitle);
  expect(text).toEqual(expectedText);
}

function getNodeText(node: ReactNode | MountPoint) {
  const rendered = render(node as ReactElement);
  return rendered.container.textContent;
}
