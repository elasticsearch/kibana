/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiIconProps } from '@elastic/eui';

type ConfluenceLogoProps = Omit<EuiIconProps, 'type'>;

/**
 * EUI ships `logoSlack` and `logoGithub`, but not a Confluence logo. This mirrors the
 * stack-connectors logo convention (an inline brand SVG component passed to `EuiIcon`).
 */
export const ConfluenceLogo = (props: ConfluenceLogoProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 246"
    width="32"
    height="32"
    preserveAspectRatio="xMidYMid"
    {...props}
  >
    <defs>
      <linearGradient
        id="confluence-logo-gradient-a"
        x1="99.140087%"
        y1="112.708084%"
        x2="33.8723318%"
        y2="37.7501406%"
      >
        <stop stopColor="#0052CC" offset="18%" />
        <stop stopColor="#2684FF" offset="100%" />
      </linearGradient>
      <linearGradient
        id="confluence-logo-gradient-b"
        x1="0.92569163%"
        y1="-12.5460628%"
        x2="66.1838992%"
        y2="62.2125051%"
      >
        <stop stopColor="#0052CC" offset="18%" />
        <stop stopColor="#2684FF" offset="100%" />
      </linearGradient>
    </defs>
    <path
      d="M9.26 187.329c-2.682 4.368-5.685 9.45-8.236 13.52a8.224 8.224 0 0 0 2.749 11.282l53.605 32.997a8.232 8.232 0 0 0 11.367-2.74c2.14-3.59 4.901-8.252 7.905-13.245 21.186-34.972 42.494-30.697 80.929-12.348l53.164 25.294a8.232 8.232 0 0 0 11.013-3.965l25.514-57.711a8.23 8.23 0 0 0-4.149-10.81c-11.218-5.282-33.526-15.802-53.61-25.495C156.99 113.673 95.502 115.66 9.26 187.33z"
      fill="url(#confluence-logo-gradient-a)"
    />
    <path
      d="M246.74 58.665c2.682-4.367 5.685-9.449 8.236-13.52a8.224 8.224 0 0 0-2.749-11.282L198.622.866a8.232 8.232 0 0 0-11.367 2.74c-2.14 3.59-4.901 8.252-7.905 13.245-21.186 34.972-42.494 30.697-80.929 12.348L45.302 4.077a8.232 8.232 0 0 0-11.013 3.965L8.775 65.753a8.23 8.23 0 0 0 4.149 10.81c11.218 5.282 33.526 15.802 53.61 25.495 72.93 35.126 134.418 33.108 220.66-38.563z"
      fill="url(#confluence-logo-gradient-b)"
    />
  </svg>
);
