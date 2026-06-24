/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';

/**
 * Minimal jest stub for `@kbn/app-header`'s <AppHeader/>. The real component
 * pulls from ChromeServiceProvider, which unit tests don't wire up. This stub
 * renders the bits our pages care about (title, badges, menu items) as plain
 * DOM so existing data-test-subj selectors keep working.
 *
 * Mirrors the shape of AppHeaderProps loosely — anything we don't use is
 * ignored.
 *
 * Usage:
 *   jest.mock('@kbn/app-header', () =>
 *     jest.requireActual('<rel path>/test_utils/mock_app_header')
 *   );
 */

interface MockMenuItem {
  id: string;
  testId?: string;
  label: string;
  run?: () => void;
}

interface MockBadge {
  label: string;
  'data-test-subj'?: string;
  tooltip?: string;
}

interface MockTab {
  id: string;
  label: string;
  isSelected?: boolean;
  onClick?: () => void;
  'data-test-subj'?: string;
  toolTipContent?: string;
}

interface MockSwitch {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'data-test-subj'?: string;
}

interface MockAppHeaderProps {
  title: string | { text: string };
  back?: { href?: string; label?: string };
  badges?: MockBadge[];
  tabs?: MockTab[];
  menu?: {
    primaryActionItem?: MockMenuItem & {
      splitButtonProps?: { items?: MockMenuItem[] };
    };
    items?: MockMenuItem[];
    switch?: MockSwitch;
  };
}

export const AppHeader = ({ title, back, badges, tabs, menu }: MockAppHeaderProps) => {
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const titleText = typeof title === 'string' ? title : title?.text;
  const primary = menu?.primaryActionItem;

  return (
    <div data-test-subj="app-header">
      {back && (
        <a data-test-subj="app-header-back" href={back.href}>
          {back.label ?? 'Back'}
        </a>
      )}
      <h1>{titleText}</h1>
      {badges?.map((badge, index) => (
        <span key={index} data-test-subj={badge['data-test-subj']} title={badge.tooltip}>
          {badge.label}
        </span>
      ))}
      {tabs?.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.isSelected}
          data-test-subj={tab['data-test-subj']}
          data-tooltip-content={tab.toolTipContent}
          onClick={() => tab.onClick?.()}
        >
          {tab.label}
        </button>
      ))}
      {primary && (
        <>
          <button type="button" data-test-subj={primary.testId} onClick={() => primary.run?.()}>
            {primary.label}
          </button>
          {primary.splitButtonProps && (
            <>
              <button
                type="button"
                data-test-subj={`${primary.testId}-secondary-button`}
                onClick={() => setIsSplitOpen((open) => !open)}
              >
                ▾
              </button>
              {isSplitOpen &&
                primary.splitButtonProps.items?.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-test-subj={item.testId}
                    onClick={() => item.run?.()}
                  >
                    {item.label}
                  </button>
                ))}
            </>
          )}
        </>
      )}
      {menu?.switch && (
        <label>
          <input
            type="checkbox"
            role="switch"
            data-test-subj={menu.switch['data-test-subj']}
            checked={menu.switch.checked}
            disabled={menu.switch.disabled}
            onChange={(e) => menu.switch!.onChange(e.target.checked)}
          />
          {menu.switch.label}
        </label>
      )}
      {menu?.items?.map((item) => (
        <button
          key={item.id}
          type="button"
          data-test-subj={item.testId}
          onClick={() => item.run?.()}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};
