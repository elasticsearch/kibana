/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface InheritLifecycleSectionLink {
  /** Link text. Defaults to "View source". */
  label?: string;
  /**
   * Kibana-internal URL for the inheritance source.
   * The link is rendered as an anchor and always opens in a new tab.
   */
  href: string;
}

export interface InheritLifecycleSectionProps {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  link?: InheritLifecycleSectionLink;
  /** Optional explicit checkbox id. */
  checkboxId?: string;
  /** Optional prefix used to generate a checkbox id when `checkboxId` is omitted. */
  checkboxIdPrefix?: string;
  /** Optional test subject applied to the link. */
  linkDataTestSubj?: string;
}
