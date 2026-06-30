---
mapped_pages:
  - https://www.elastic.co/guide/en/kibana/current/pr-review.html
---

# Pull request review guidelines [pr-review]

Every change made to {{kib}} must be held to a high standard, and while the responsibility for quality in a pull request ultimately lies with the author, {{kib}} team members have the responsibility as reviewers to verify during their review process.

Frankly, it’s impossible to build a concrete list of requirements that encompass all of the possible situations we’ll encounter when reviewing pull requests, so instead this document tries to lay out a common set of the few obvious requirements while also outlining a general philosophy that we should have when approaching any PR review.

It is not expected nor intended for a PR review to take the shape of this document, where the topmost guidelines are always applied first and the bottommost guidelines are always applied last. This entire document should be considered as a whole rather than as a series of consecutive todos that must be completed in order.

While the review process is always done by Elastic staff members, these guidelines apply to all pull requests regardless of whether they are authored by community members or Elastic staff.


## Target audience [_target_audience]

The target audience for this document are pull request reviewers. For {{kib}} maintainers, the PR review is the only part of the contributing process in which we have complete control. The author of any given pull request may not be up to speed on the latest expectations we have for pull requests, and they may have never read our guidelines at all. It’s our responsibility as reviewers to guide folks through this process, but it’s hard to do that consistently without a common set of documented principles.

Pull request authors can benefit from reading this document as well because it’ll help establish a common set of expectations between authors and reviewers early.


## Reject fast [_reject_fast]

Every pull request is different, and before reviewing any given PR, reviewers should consider the optimal way to approach the PR review so that if the change is ultimately rejected, it is done so as early in the process as possible.

For example, a reviewer may want to do a product level review as early as possible for a PR that includes a new UI feature. On the other hand, perhaps the author is submitting a new feature that has been rejected in the past due to key architectural decisions, in which case it may be appropriate for the reviewer to focus on the soundness of the architecture before diving into anything else.


## The big three [_the_big_three]

There are a lot of discrete requirements and guidelines we want to follow in all of our pull requests, but three things in particular stand out as important above all the rest.

1. **Do we want this change in the product?**

    Just because a person spent time building something doesn’t mean we want that change to exist in the product, which is why we encourage everyone to open issues describing what they want to do before going off and doing it.

    Every feature we add permanently takes a portion of our attention away from building and supporting other features. We literally have a finite capacity of the number of features we can maintain since they all require a little bit of our time and focus, so it’s important that enhancements to the project are scrutinized not just for their quality but also for the value they add, the maintenance burden they add, and how closely they align to our long term goals for the project.

    The landscape can change over time as well, so it’s important that continuously reevaluate decisions we’ve made around whether or not we want certain changes in the project. Some changes take a significant amount of time to build, and it’s possible that by the time we’re wrapping them up, the situation has changed enough that we no longer want the change in the project.

2. **Is this change architecturally sound?**

    Making poor decisions around how a change is technically architected means we immediately have taken on technical debt, which is going to unnecessarily distract us from our future efforts to improve the project as we need to maintain that existing change, chase down bugs, and ultimately re-architect that area in the future.

    There is no one-size-fits-all way to evaluate whether a given change is technically sound, so instead we must rely on our concrete knowledge and experience building software. This is an especially hard thing to do when two experienced developers have differing opinions about what is and is not architecturally sound, so it requires both the author and reviewer to show empathy, to go out of their way to understand each other, and to come to a consensus about a path forward.

    The goal here isn’t finding the one best architecture as it’s unlikely this could ever be qualified. There are usually many architecturally sound solutions to any problem, so reviewers should be focused on that goal objectively rather than whether or not their own vision for how the change should be architected is "better".

3. **Are there sufficient tests to ensure this change doesn’t break in the future?**

    We cannot scale our development efforts and continue to be effective at improving and maintaining the product if we’re relying on manual testing to catch bugs. Manual testing is our last line of defense, and it’s the least effective and most expensive way to ensure a stable product. This means that every change we make to the product needs to have sufficient test coverage.

    This isn’t simply a question of enough test files. The code in the tests themselves is just as important as the code in the product.

    All of our code should have unit tests that verify its behaviors, including not only the "happy path", but also edge cases, error handling, etc.  When you change an existing API of a module, then there should always be at least one failing unit test, which in turn means we need to verify that all code consuming that API properly handles the change if necessary. For modules at a high enough level, this will mean we have breaking change in the product, which we’ll need to handle accordingly.

    In addition to extensive unit test coverage, PRs should include relevant functional and integration tests. In some cases, we may simply be testing a programmatic interface (e.g. a service) that is integrating with the file system, the network, {{es}}, etc. In other cases, we’ll be testing REST APIs over HTTP or comparing screenshots/snapshots with prior known acceptable state. In the worst case, we are doing browser-based functional testing on a running instance of {{kib}} using selenium.

    Enhancements are pretty much always going to have extensive unit tests as a base as well as functional and integration testing. Bug fixes should always include regression tests to ensure that same bug does not manifest again in the future.



## Product level review [_product_level_review]

Reviewers are not simply evaluating the code itself, they are also evaluating the quality of the user-facing change in the product. This generally means they need to check out the branch locally and "play around" with it. In addition to the "do we want this change in the product" details, the reviewer should be looking for bugs and evaluating how approachable and useful the feature is as implemented. Special attention should be given to error scenarios and edge cases to ensure they are all handled well within the product.


## Consistency, style, readability [_consistency_style_readability]

Having a relatively consistent codebase is an important part of us building a sustainable project. With dozens of active contributors at any given time, we rely on automation to help ensure consistency - we enforce a comprehensive set of linting rules through CI. We’re also rolling out prettier to make this even more automatic.

For things that can’t be easily automated, we maintain a [style guide](https://github.com/elastic/kibana/tree/master/STYLEGUIDE.mdx) that authors should adhere to and reviewers should keep in mind when they review a pull request.

Beyond that, we’re into subjective territory. Statements like "this isn’t very readable" are hardly helpful since they can’t be qualified, but that doesn’t mean a reviewer should outright ignore code that is hard to understand due to how it is written. There isn’t one definitively "best" way to write any particular code, so pursuing such shouldn’t be our goal. Instead, reviewers and authors alike must accept that there are likely many different appropriate ways to accomplish the same thing with code, and so long as the contribution is utilizing one of those ways, then we’re in good shape.

On the other hand, if a reviewer calls out a specific chunk of code as being hard to understand, then one of the first people to look at the code is having a hard time understanding it. If the reviewer feels strongly that this is a problem, they should raise the issue for the author’s consideration and potentially propose alternatives. The reviewer must be pragmatic, and their goal should be to propel the discussion forward rather than simply throwing up obstacles.

When in doubt, relying on "prior art" in the codebase, especially in and around the area of the codebase that is being contributed to, is generally a good idea.

There may also be times when a person is inspired by a particular contribution to introduce a new way to style code that we already have different style guidelines or "prior art" for. It’s OK to bring this up in a pull request, but ultimately that discussion should branch off into a separate issue or pull request to update the appropriate guide. If this change is prompted by a reviewer, then the original PR should not be blocked on this.  If the change is prompted by the author, then they can either update the PR to be consistent with our existing guidelines (preferred) or they can choose to block the PR entirely on that separate styleguide discussion.


## Nitpicking [_nitpicking]

Nitpicking is when a reviewer identifies trivial and unimportant details in a pull request and asks the author to change them. This is a completely subjective category that is impossible to define universally, and it’s equally impractical to define a blanket policy on nitpicking that everyone will be happy with.

Reviewers should feel comfortable giving any feedback they have on a pull request regardless of how trivial it is. Authors should feel equally comfortable passing on feedback that they think is trivial and inconsequential.

Often, reviewers have an opinion about whether the feedback they are about to give is a nitpick or not. While not required, it can be really helpful to identify that feedback as such, for example "nit: a newline after this would be helpful". This helps the author understand your intention.


## Handling disagreements [_handling_disagreements]

Conflicting opinions between reviewers and authors happen, and sometimes it is hard to reconcile those opinions. Ideally folks can work together in the spirit of these guidelines toward a consensus, but if that doesn’t work out it may be best to bring a third person into the discussion. Our pull requests generally have two reviewers, so an appropriate third person may already be obvious. Otherwise, reach out to the functional area that is most appropriate or to technical leadership if an area isn’t obvious.


## Inappropriate review feedback [_inappropriate_review_feedback]

Whether or not a bit of feedback is appropriate for a pull request is often dependent on the motivation for giving the feedback in the first place.

*Demanding* an author make changes based primarily on the mindset of "how would I write this code?" isn’t appropriate. The reviewer didn’t write the code, and their critical purpose in the review process is not to craft the contribution into a form that is simply whatever they would have written if they had. If a reviewer wants to provide this type of feedback, they should qualify it as a "nit" as mentioned in the nitpicking section to make it clear that the author can take it or leave it.

Inflammatory feedback such as "this is crap" isn’t feedback at all. It’s both mean and unhelpful, and it is never appropriate.


## A checklist [_a_checklist]

Establishing a comprehensive checklist for all of the things that should happen in all possible pull requests is impractical, but that doesn’t mean we lack a concrete set of minimum requirements that we can enumerate. The following items should be double checked for any pull request:

* CLA check passes
* CI job runs and passes
* Adheres to the spirit of our various styleguides
* Has thorough unit test coverage
* Automated tests provide high confidence the change continues to work without manual verification
* Appropriate product documentation is included (asciidocs)
* Any new UI changes are accessible to differently abled persons, including but not limited to sufficient contrasts in colors, keyboard navigation, and aria tags
* Sufficient security protections are in place where appropriate, particularly when rendering API responses, parsing expressions, compiling URLs, loading external content, or redirecting
* PR title summarizes the change (no "fixes bug number 123")
* PR description includes:

    * A detailed summary of what changed
    * The motivation for the change
    * Screenshot(s) if the UI is changing
    * A link to each issue that is closed by the PR (e.g. Closes #123)


