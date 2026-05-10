---
name: implement-plan-pr
description: 'Implement a scoped plan end-to-end by creating a branch, making or organizing code changes, verifying quality gates, and opening a pull request to main. Use when asked to execute a plan, ship an implementation, or create a PR from existing local changes.'
argument-hint: 'Plan summary, target files/areas, and whether changes already exist'
user-invocable: true
---

# Implement Plan And Open PR

## Outcome
Produce a review-ready pull request targeting `main` with verified code changes and a clear change summary.

## When To Use
- User asks to implement a plan from scratch and open a PR.
- User already has local changes and asks to branch, verify, and open a PR.
- User asks for an end-to-end workflow from coding through PR creation.

## Inputs To Confirm
- Plan scope: what behavior or files must change.
- Starting state: no changes yet, or existing uncommitted/staged changes.
- Branch naming preference (if provided); if none provided, use template: `(feat|bugfix|hotfix)/short-description`.
- PR title/body constraints (if provided).
- Default commit strategy: multiple logical commits.
- Default PR mode: ready for review (not draft).

## Procedure
1. Inspect repository state.
- Check current branch and working tree status.
- Detect whether there are existing local changes.

2. Choose branch workflow.
- If currently on `main` and no branch name provided: create a descriptive feature branch using the template `(feat|bugfix|hotfix)/short-description` (for example: `feat/add-user-pagination`, `bugfix/invoice-calculation`, `hotfix/auth-timeout`).
- If currently on `main` with existing local changes: create and switch to a new branch using the same template while preserving changes.
- If already on a non-main feature branch: continue on that branch unless user asks otherwise.

3. Implement or organize changes.
- If no changes exist: apply the requested implementation plan.
- If changes already exist: review and align them to the requested plan; add missing edits as needed.
- Keep edits minimal and consistent with project conventions.

4. Verify quality gates before PR.
- Run required checks in this order and require passing exit codes:
  1. `npm run type-check`
  2. `npm run build`
  3. `npm run test`
  4. `npm run synth`
  5. `npm run lint`
  6. `npm run document`
- If a check fails: fix root causes, rerun failed checks, then continue.

5. Prepare commit(s).
- Review diff for accidental or unrelated changes.
- Stage only intended files.
- Prefer multiple logical commits by concern (for example: implementation, tests, docs), unless the user requests a single commit.
- Create clear commit message(s) that describe behavior changes.

6. Push and open PR to `main`.
- Push branch to remote.
- Open PR with concise title and body including:
  - What changed
  - Why
  - Validation performed
  - Risks or follow-ups
- Confirm base branch is `main`.
- Default to ready-for-review PRs unless the user explicitly requests a draft.

7. Final handoff.
- Share branch name, PR link, and validation summary.
- Call out any skipped checks, assumptions, or residual risks.

## Decision Points
- Existing changes present:
  - Keep and incorporate them if they match requested scope.
  - If unrelated changes are mixed in, isolate intended files into focused commits and note remaining local changes.
- Cannot run a required command:
  - Explain blocker clearly and provide next actionable step.
- Failing checks with unclear fix:
  - Report concrete failure details and stop only after reasonable attempts.

## Completion Criteria
- Branch exists and reflects requested scope.
- Requested implementation is present.
- Required verification commands pass or blockers are explicitly documented.
- PR is opened against `main` with a useful description.
- User receives branch, PR URL, and validation status.
