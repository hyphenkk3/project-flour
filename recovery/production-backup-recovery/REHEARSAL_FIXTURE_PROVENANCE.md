# Rehearsal fixture correction provenance

These files were copied from the preserved recovery source at commit `2d425658bec22f5816013838eab7b286918b3200` for review and qualification in the exact recovered DEV source repository. The November 16 actual-backup report is preserved separately and remains a failed run; this copy does not rewrite that result.

The event-behavior fixture and its synthetic baseline now supply the Production event table's required unique `event_key` and non-null `title`. The five migration SQL files are copied byte-for-byte from the recovery candidate and are not deployed application migrations. The coordinator’s sibling dependencies `audit_roles_archive.py`, `restore_roles_native.py`, and `stream-crypto.js` are also preserved here so the no-prompt preflight can run from this checkout.

The corrected synthetic integration was run in the pinned image `sha256:95d83f580287f55cf14e5e79e52ec930e08a9db089852e282ffc62790eb2e21f`, Docker network `none`; it passed all five migrations, rollback, security/ACL and event-scope assertions. This is synthetic qualification, not a rerun against the November 15 archive.
