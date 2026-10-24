# Fresh Pick complimentary — source preservation checkpoint

Recorded: 2026-10-24 (Asia/Kuala_Lumpur)
Repository: hyphenkk3/project-flour
Branch: codex/freshpick-complimentary-dev-20261024

## Verified Git state at checkpoint
- Branch initially created from main, commit 437228c81bcb8e5d70497f687990cf949b50fbe4.
- GitHub compare main...branch returned IDENTICAL: ahead 0, behind 0, changed files 0.
- Therefore, this branch did NOT contain the new complimentary-order feature source when created.
- The local developer working tree, uncommitted changes, and any unpublished candidate commit have NOT been inspected. Do not equate remote Git state with local work.

## Vercel and environment checkpoint
- Project: project-flour, prj_3rmlAQzLSFOi15DEGczSuDYDq8xr (Hyphen Org).
- A request to set previewDeploymentsDisabled=true succeeded before branch creation; verify the project setting again before deploying.
- No Vercel deployment was returned for this branch when queried.
- Branch-scoped NEXT_PUBLIC_SUPABASE_URL points to DEV project tzwtpxdcggesgjaqxkqr, not PROD cuowwlduhxxifmpvpltt.
- Branch-scoped NEXT_PUBLIC_SUPABASE_ANON_KEY was taken from the verified DEV Supabase project.
- Branch-scoped SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, STAFF_NOTIFICATION_DISPATCH_SECRET, and CRON_SECRET contain intentionally nonfunctional placeholders. Do NOT enable Preview with these and assume the application works; audit other inherited credentials.
- Never copy Production keys into this Preview branch.

## Recovery/source requirements
1. Inspect and preserve the local working tree, including dirty and untracked files, BEFORE any checkout, reset, merge, rebase, clean, cherry-pick or branch switch.
2. Find the actual complimentary-order candidate source and identify its originating commit/files/patch. Do not regenerate or substitute the feature without comparison.
3. Make a named Git recovery ref and commit the candidate to a dedicated recoverable branch; verify against the working tree.
4. List migrations separately and verify compatibility with DEV and Production callers.
5. DEV-only isolation and QA before any Production consideration.
6. Record candidate SHA, diff, tests, migration state, Preview deployment ID, Production release SHA, deployment ID, and rollback SHA.
7. Preserve unrelated changes; do not create .bak files or overwrite previous work.

## Historical references for investigation (NOT assumed released)
- 14c9288e670c: Fresh Pick payment sharing and ready override.
- 2c4bb70d91bb: Bakery aware of Fresh Pick allocations.
- 11e21193fc7a: Fresh Pick order assignment eligibility.
- Latest Production-targeted Vercel deployment found: dpl_6gZLDJuwPgefyB9RJwh4ztZpJBRJ from ec9e982eb4c64b65191b71e6511f5f3fb1603978 (READY; serving-domain status not proven).

## Hold points
- Complimentary feature source NOT yet located/verified.
- DEV service-role secret NOT yet verified.
- Outbound notification and cron isolation NOT code-verified.
- Preview deployment intentionally blocked.
- No Production release authorized.
