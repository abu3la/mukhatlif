@AGENTS.md

# Claude workspace note

The Git repository is `/Users/abu3la/mukhtalif/dev/mukhatlif`, not the outer
`/Users/abu3la/mukhtalif` directory. The spelling difference is intentional.

`AGENTS.md` is the current operational source of truth for branches,
environments, deployments, DNS, Supabase, R2, Resend, and imports. Do not rely
on earlier chat summaries or legacy Worker URLs when they conflict with it.

Use `dev` for integration work. Production releases are reviewed through
`dev` -> `main`, and every provider deployment remains manual. Never put a live
secret in Git or substitute the development Supabase project in a production
build.

Before handoff, run the checks appropriate to the touched surfaces. A full
release candidate uses the verification workflow in
`.github/workflows/verify.yml`, which performs no deployment.
