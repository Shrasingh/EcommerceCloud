## What changed

<!-- One or two sentences. Link the issue if there is one. -->

## Why

<!-- The problem this solves, or the behaviour it changes. -->

## How it was tested

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Walked the affected dashboard flow on the Vercel Preview (Preview database, Stripe **test** keys)
- [ ] If a migration is included: applied to the Preview database with `npm run db:migrate:deploy` and noted the production rollout order in the description

## Checklist

- [ ] No secrets, `.env` files or generated artifacts are included
- [ ] New or changed environment variables are documented in `.env.example` and `README.md`
- [ ] Any new migration is additive (no drops, renames or `SET NOT NULL` on existing columns) or the rollout plan says why not
- [ ] Docs updated if behaviour or setup changed
