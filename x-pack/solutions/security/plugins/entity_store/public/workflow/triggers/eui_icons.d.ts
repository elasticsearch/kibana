/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

declare module '@elastic/eui/es/components/icon/assets/*' {
  import type * as React from 'react';

  interface SVGRProps {
    title?: string;
    titleId?: string;
  }
  export const icon: ({
    title,
    titleId,
    ...props
  }: React.SVGProps<SVGSVGElement> & SVGRProps) => React.JSX.Element;
  export {};
}
