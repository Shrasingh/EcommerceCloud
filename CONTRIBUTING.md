# Contributing

## Workflow

This is a solo portfolio project: `main` is the only long-lived branch, and work happens on short-lived branches merged back into it via PR.

1. Branch from `main`: `git switch main && git pull && git switch -c feat/<short-name>` (use `fix/` or `chore/` prefixes as appropriate).
2. Make one focused change. Add or update tests for behavior changes.
3. Run the same checks as CI before pushing:
   ```bash
   npm run lint && npm run typecheck && npm test && npm run build
   ```
4. Open a PR into `main`. CI must pass, and the PR's Vercel Preview deployment (backed by the preview database, never production) is where you QA the change.
5. Merge into `main` to release. If the change includes a migration, apply it as described in the README's [Database](README.md#database) and [Branching](README.md#branching-environments-and-releases) sections.

Never force-push `main`.

## Conventions

- **API routes** use the helpers in `lib/api.ts`: `requireStoreOwner` for writes, `parseBody` with a schema from `lib/validations.ts`, queries scoped by `storeId`, and `handleApiError` in the `catch`. Don't return raw error messages from unknown exceptions.
- **Business logic** that doesn't need the database goes in `lib/` as pure functions, with unit tests in `tests/unit`.
- **Schema changes:** edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>`, and commit the generated migration.
- **Secrets** stay in `.env` (gitignored) or the Vercel environment settings. `NEXT_PUBLIC_*` variables are visible in the browser, so never put secrets in them.

## Commit messages

Use an imperative subject that says what changed and why, for example `Return 409 when deleting a product that has orders`. Keep unrelated changes in separate commits.

## Git identity

Commits are attributed by the name and email in your Git config, not by the account you push with. Use an email that is verified on your GitHub account so commits link to your profile:

```bash
git config user.name "Your Name"
git config user.email "you@example.com"   # add --global to set it for all repos
git config user.email                     # check the current value
```

Pushing authenticates you to GitHub (HTTPS token, SSH key or GitHub Desktop) and controls *whether* you can push; the commit identity above controls *who the commits are attributed to*.

If you use AI tools while contributing, follow your employer's and this repository's disclosure rules.
