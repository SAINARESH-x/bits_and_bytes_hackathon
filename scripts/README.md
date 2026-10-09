# scripts/

Utility scripts run with `node scripts/<file>.mjs`. Kept out of the app bundle
on purpose — nothing here should ever be imported from `app/` or `lib/`.

Add scripts here rather than growing `package.json` with long inline commands.
