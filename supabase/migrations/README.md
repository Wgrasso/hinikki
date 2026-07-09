# Supabase migrations

Full schema for the HiNikki backend, applied in filename order:

| Migration | Contents |
|-----------|----------|
| `20260709120000_schema.sql` | Base schema: 24 tables, RLS on every table, identity/permission functions |
| `20260709120010_groups.sql` | Household groups, stable join code, pairing/recovery RPCs (idempotent) |
| `20260709120020_storage_family_photos.sql` | Private `family-photos` storage bucket + RLS scoped to `can_view/can_manage_older_adult()` |

On a fresh project these reproduce the entire backend:

```bash
supabase link --project-ref <ref>
supabase db push
```

## History note

The live project `ealeydrwcowpypvkjbfs` had this SQL applied out-of-band (via the
Management API) at provisioning time, then registered with
`supabase migration repair --status applied <version>` so the CLI treats them as
already applied. A `db push` against it is therefore a no-op.

## `../optional/migrate-existing.sql`

A one-shot data backfill that groups pre-existing older adults. **Not a schema
migration** and intentionally kept out of `migrations/` — it was never applied to
the live project (only fragmented pre-launch test data existed). Run it manually
only if you have real pre-group data to preserve.
