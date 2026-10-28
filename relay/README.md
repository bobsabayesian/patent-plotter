# The Google Patents relay

Google Patents answers a home connection but refuses Cloudflare's servers, so the deployed Worker sends its two Google
calls (the search feed and the patent page) through this relay, which runs on a home machine behind a cloudflared
tunnel. Drawings do not go through it (that image host works from Cloudflare), and patents and searches already
fetched are cached in R2, so the relay is only needed the first time something is looked up. If it is down, a cached
patent or search still works and anything new says the source could not be reached.

Set-up, once:

1. Make a key and keep it: `openssl rand -hex 24`
2. Run the relay (see `patent-relay.service` to keep it running): `RELAY_KEY=<key> node relay/relay.mjs`
3. Add a hostname to the tunnel. In `~/.cloudflared/config.yml`, above the final `http_status:404` line:
   ```yaml
   - hostname: patents-relay.bobsabayesian.io
     service: http://localhost:8788
   ```
   then `cloudflared tunnel route dns <tunnel name or id> patents-relay.bobsabayesian.io` and restart that tunnel
   (this briefly drops everything else it serves).
4. Give the Worker the key: `npx wrangler secret put RELAY_KEY`. The URL is `RELAY_URL` in `wrangler.toml`.
5. `npm run deploy`

Check: `curl https://patents-relay.bobsabayesian.io/health` answers `{"ok":true}`, then search on the site.

## If searches fail with "limiting the relay's connection"

Google has started refusing this home connection (its "Sorry..." page). It is usually temporary. The relay notices, stops
asking for 20 minutes (then 40, 80, up to 2 hours if Google keeps refusing), and the site says so; patents and searches
already loaded keep working from R2. `curl localhost:8788/health` shows `blockedForSec`. Do not hammer it with
test searches meanwhile, as that can make the block last longer. To apply a change to the relay:
`systemctl --user restart patent-relay`.
