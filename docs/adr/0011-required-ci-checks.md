# 11. Required CI checks before a merge to main

Status: Accepted (2026-11-05)

## Context

The CI workflow ran all checks in one job. A failed run did not show which check failed. CI also did not stop a merge: a pull request with a failed run could still go into `main`.

GitHub stops a merge only through a branch protection rule or a ruleset with required status checks. A workflow file cannot set this rule. A required check must have a stable name. When a job name changes, the rule waits for a check that never runs.

## Decision

- `.github/workflows/ci.yml` has three jobs: `Lint and type check`, `Unit tests` and `End-to-end tests`. The jobs run in parallel.
- The `CI passed` job runs after the three jobs, also when they fail. It fails when a job does not succeed, including a cancelled or skipped job.
- The workflow runs on each pull request, on each merge queue entry (`merge_group`) and on each push to `main`.
- The branch protection rule for `main` requires a pull request and the `CI passed` check. The rule also requires the branch to be up to date before the merge. A repository admin sets the rule in the GitHub settings.

## Consequences

- A pull request can go into `main` only when lint, type check, unit tests and end-to-end tests pass.
- The branch protection rule names only `CI passed`. A new job needs only a change to `needs` in the workflow, not a change to the rule.
- A merge queue works without a workflow change.
- The jobs install dependencies three times. This costs more runner time, but the jobs run in parallel, so the result comes sooner.
- If an admin removes the rule, CI still runs but does not stop a merge.
