# Private-board database upgrade

Apply `private-boards.sql` in the Supabase SQL editor before deploying this version of the website. This is an atomic, repeatable migration for both a new database and the existing private-board table. It preserves active rooms and adds a UUID `revision` to each row; it does not re-encrypt existing content.

The new browser uses only these RPCs:

- `read_private_board_versioned(p_room_id)` returns the encrypted payload and its current revision.
- `save_private_board_if_current(p_room_id, p_ciphertext, p_iv, p_salt, p_expected_revision, p_ttl_days)` atomically writes only if that revision is still current. A null expected revision creates an unused room. It returns the new revision and expiry; SQLSTATE `PT409` (HTTP 409) means the room changed.

UUID revisions prevent an old session from overwriting a room after its PIN expires and is reused. The browser preserves conflicting drafts, displays the latest text, and requires an explicit merged save. A further concurrent change still fails the same version check.

The migration keeps the legacy read RPC but blocks the legacy unconditional writer. Older open pages must copy any unsaved text and refresh after the website deploys. Before the database upgrade, the new browser reports that the save service needs an upgrade and does not fall back to the unsafe writer.

Ciphertext capacity rises from 50,000 to 200,000 base64 characters. The browser still accepts 20,000 UTF-16 characters. The larger limit covers UTF-8, JSON escaping, the AES-GCM authentication tag, and base64 expansion, including the worst allowed text payload (160,056 base64 characters).

No database migration is executed by editing or testing the website. Apply the database upgrade explicitly as part of deployment, then verify room opening, concurrent editing, conflict recovery, and a long Chinese draft. Client regression tests run with `node --test tests/board-save.test.js` and do not access the live database.

Business version conflicts must not raise `40001` (`serialization_failure`). PostgREST 14 can retry that error indefinitely instead of returning the conflict to the browser. `PT409` returns the business conflict immediately; the browser also understands an old `40001` response during rollout. See the [Supabase troubleshooting explanation](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). If this upgrade replaces a service already raising `40001`, changing the function does not terminate existing retry loops: use database logs to identify and stop only the confirmed affected backends.
