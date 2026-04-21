# `config/` — local runtime configuration

Everything in this directory **except this README and the `*.example.*` files
is gitignored**. Put your real, credential-bearing configs here so they never
end up in source control.

## Files

| File                              | Purpose                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `sovereign-streams.example.json`  | Template — copy to `sovereign-streams.json` and fill in.      |
| `ring-mqtt.example.json`          | Template — shows the shape `ring-mqtt` expects.               |
| `sovereign-streams.json`          | Real RTSP stream list (gitignored).                           |
| `ring-mqtt.json` / `config.json`  | Real `ring-mqtt` config with refresh token (gitignored).      |

## Wiring into GuardDog

In `.env`:

```env
SOVEREIGN_STREAMS_FILE=./config/sovereign-streams.json
```

GuardDog only reads paths from `.env`; it never reads inline credentials. Your
`ring-mqtt` config lives entirely outside GuardDog — point your local
`ring-mqtt` install at it, then point GuardDog at the RTSP URLs `ring-mqtt`
exposes.

## ⚠️ If you ever accidentally commit credentials

1. **Rotate them immediately.** Once a token is in git history (even on a
   private repo), it is effectively burned.
   - Ring: revoke at <https://account.ring.com/account/control-center/authorized-client-devices>, then change your password.
   - eSeeCloud / Hikvision / etc.: log in to the NVR and change the admin password.
2. Then scrub git history (`git filter-repo --path config/badfile.json --invert-paths`).
3. Then re-issue fresh credentials and put them only in this gitignored folder.
