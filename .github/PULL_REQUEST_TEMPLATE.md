# Pull Request

<!-- Keep this title short — `type(scope): summary` conventional-commit style. -->

## What changed

<!-- One paragraph explaining the WHY. The diff itself explains the WHAT. -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Chore / refactor (no behavior change)
- [ ] Database migration (touches `/supabase/migrations/` — extra review required)

## How to test

<!-- A reviewer should be able to follow these steps in under 5 minutes. -->

1.
2.
3.

## Checklist

- [ ] I have run `npm run type-check` in `bonamind-web/` and there are no new errors
- [ ] I have run `npm test` in `bonamind-web/` and added/adjusted tests for the change
- [ ] I have updated `CHANGELOG.md` under the "Unreleased" section
- [ ] If this is a schema change, I have added a migration in `supabase/migrations/` and noted it in `docs/M6-store-submission-playbook.md` if it affects mobile
- [ ] I have considered and documented any privacy / RLS implications (no `(dev)` policy slips, every UPDATE has WITH CHECK)
- [ ] I have read [CONTRIBUTING.md](./CONTRIBUTING.md)

## Screenshots / recordings

<!-- Attach before / after if the change is UI-visible. -->
