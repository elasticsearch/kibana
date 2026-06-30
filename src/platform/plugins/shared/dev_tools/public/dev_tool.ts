/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RouteComponentProps } from 'react-router-dom';

import type { AppUnmount } from '@kbn/core/public';
import type { DevToolsStartServices } from './types';

/**
 * Descriptor for a dev tool. A dev tool works similar to an application
 * registered in the core application service.
 */
export type CreateDevToolArgs = Omit<DevToolApp, 'enable' | 'disable' | 'isDisabled'> & {
  disabled?: boolean;
};

interface DevToolMountParams extends DevToolsStartServices {
  element: HTMLDivElement;
  history: RouteComponentProps['history'];
  location: RouteComponentProps['location'];
}

export class DevToolApp {
  /**
   * The id of the dev tools. This will become part of the URL path
   * (`dev_tools/${devTool.id}`. It has to be unique among registered
   * dev tools.
   */
  public readonly id: string;
  /**
   * The human readable name of the dev tool. Should be internationalized.
   * This will be used as a label in the tab above the actual tool.
   * May also be a ReactNode.
   */
  public readonly title: string;
  public readonly mount: (params: DevToolMountParams) => AppUnmount | Promise<AppUnmount>;

  /**
   * Flag indicating to disable the tab of this dev tool. Navigating to a
   * disabled dev tool will be treated as the navigation to an unknown route
   * (redirect to the console).
   */
  private disabled: boolean;

  /**
   * Optional tooltip content of the tab.
   */
  public readonly tooltipContent?: string;
  /**
   * Flag indicating whether the dev tool will do routing within the `dev_tools/${devTool.id}/`
   * prefix. If it is set to true, the dev tool is responsible to redirect
   * the user when navigating to unknown URLs within the prefix. If set
   * to false only the root URL of the dev tool will be recognized as valid.
   */
  public readonly enableRouting: boolean;
  /**
   * Number used to order the tabs.
   */
  public readonly order: number;

  /**
   * Mark the navigation tab as beta. Renders an icon-only beta badge on the tab.
   */
  public readonly isBeta?: boolean;

  constructor(
    id: string,
    title: string,
    mount: (params: DevToolMountParams) => AppUnmount | Promise<AppUnmount>,
    enableRouting: boolean,
    order: number,
    toolTipContent = '',
    disabled = false,
    isBeta?: boolean
  ) {
    this.id = id;
    this.title = title;
    this.mount = mount;
    this.enableRouting = enableRouting;
    this.order = order;
    this.tooltipContent = toolTipContent;
    this.disabled = disabled;
    this.isBeta = isBeta;
  }

  public enable() {
    this.disabled = false;
  }

  public disable() {
    this.disabled = true;
  }

  public isDisabled(): boolean {
    return this.disabled;
  }
}

export const createDevToolApp = ({
  id,
  title,
  mount,
  enableRouting,
  order,
  tooltipContent,
  disabled,
  isBeta,
}: CreateDevToolArgs) =>
  new DevToolApp(id, title, mount, enableRouting, order, tooltipContent, disabled, isBeta);
