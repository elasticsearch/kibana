/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { FC, SVGProps } from 'react';

// Bespoke copy of the `warning_static` asset added in https://github.com/elastic/eui/pull/9642.
// Multi-color and intentionally static — the fills are baked in and ignore the icon `color`.
export const WarningStaticIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.00021 1C8.35577 1.00002 8.68427 1.18902 8.86349 1.49609L15.8635 13.4961C16.0439 13.8054 16.0457 14.1876 15.8674 14.498C15.6891 14.8085 15.3583 15 15.0002 15H1.00021C0.642148 15 0.311364 14.8085 0.133026 14.498C-0.0452792 14.1876 -0.0443711 13.8054 0.135956 13.4961L7.13596 1.49609C7.31517 1.18888 7.64455 1 8.00021 1Z"
      fill="#FACB3D"
    />
    <path
      d="M7.00024 12C7.00024 11.4477 7.44796 11 8.00024 11C8.5525 11 9.00024 11.4477 9.00024 12C9.00024 12.5523 8.5525 13 8.00024 13C7.44796 13 7.00024 12.5523 7.00024 12Z"
      fill="#825803"
    />
    <path d="M7.50024 10V5H8.50024V10H7.50024Z" fill="#825803" />
  </svg>
);
