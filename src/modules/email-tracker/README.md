# Email Tracker module

Everything specific to the email tracker lives here: connectors, `et_*` tables, AI prompts, jobs, dashboard UI.

Rules:
- May import from `@/core`. `@/core` must never import from here (enforced by ESLint).
- Never read `process.env`; use `@/core/config`.
- Every query filters by `tenant_id`.
