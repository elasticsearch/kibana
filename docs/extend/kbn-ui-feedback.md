---
navigation_title: Feedback components
---

# @kbn/ui-feedback [kbn-ui-feedback]

The UI for One Feedback — a universal way for users to rate their experience and submit feedback from anywhere in {{kib}}. The package is self-contained so it can be distributed to external consumers (for example, Cloud UI) alongside {{kib}} itself.

It exposes two components:

* `FeedbackTriggerButton` — a header button that opens the feedback form in a modal.
* `FeedbackContainer` — the feedback form itself, for hosts that manage their own container.

## Trigger button [kbn-ui-feedback-trigger-button]

The button lives in the global header and opens the form on click. It is disabled until usage collection is opted in.

:::{storybook}
:id: kibana:kbn_ui:feedback--trigger-button
:::

## Feedback form [kbn-ui-feedback-form]

`FeedbackContainer` renders the CSAT buttons, the context-aware questions, and the optional email-contact section.

:::{storybook}
:id: kibana:kbn_ui:feedback--form
:::

## Usage [kbn-ui-feedback-usage]

Both components are driven entirely by callbacks, so the host owns data fetching, telemetry, and toasts.

```tsx
import { FeedbackTriggerButton } from '@kbn/ui-feedback';

<FeedbackTriggerButton
  getQuestions={getQuestions}
  getAppDetails={getAppDetails}
  getCurrentUserEmail={getCurrentUserEmail}
  sendFeedback={sendFeedback}
  showToast={showToast}
  checkTelemetryOptIn={checkTelemetryOptIn}
/>;
```

| Prop | Description |
| --- | --- |
| `getQuestions` | Resolves the context-aware questions for an app id. |
| `getAppDetails` | Returns the current app's `title`, `id`, and `url`. |
| `getCurrentUserEmail` | Resolves the current user's email, used to prefill the email field. |
| `sendFeedback` | Persists the submitted feedback. |
| `showToast` | Surfaces success and error toasts to the user. |
| `checkTelemetryOptIn` | Resolves whether usage collection is opted in (`FeedbackTriggerButton` only). |

Questions are defined per application in the `@kbn/feedback-registry` package. See the One Feedback plugin docs for how to register them.

## Development [kbn-ui-feedback-development]

Run the stories in the shared `kbn-ui` Storybook:

```bash
yarn storybook kbn_ui
```

## Testing [kbn-ui-feedback-testing]

```bash
yarn test:jest src/platform/kbn-ui/feedback
```
