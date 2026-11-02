# Deploying the VibeLog landing page

The landing page is live at https://vibelogs.dev, and https://www.vibelogs.dev redirects to it with a 301 that keeps the path and query string.
It is a fully static Next.js export (`output: "export"`) served by Cloudflare Workers static assets, with no server routes.
Two Workers in the owner's Cloudflare account serve the domain, and each attaches its hostname as a Workers custom domain, so Cloudflare creates and manages the DNS records itself:

- `vibelog-landing` (`wrangler.jsonc`) serves `out/` on `vibelogs.dev`, with no Worker script.
- `vibelog-www-redirect` (`www-redirect/wrangler.jsonc`) is a ten-line script that redirects `www.vibelogs.dev` to the apex.

Security and cache headers live in `public/_headers`.
There is no runtime image optimizer, so screenshots in `public/shots/` are committed as pre-compressed WebP; convert new PNGs to WebP (quality 82) before adding them.

## Redeploy

Log in once with `npx wrangler login` (check with `npx wrangler whoami`).
From `landing/`, run `pnpm lint && pnpm typecheck`, then `pnpm run deploy` (not `pnpm deploy`, which is a different built-in pnpm command).
`pnpm run deploy` runs `next build` (writes `out/`) and then `wrangler deploy`, which uploads only changed assets.
The redirect rarely changes; redeploy it with `pnpm run deploy:www`.
To check the build locally first, run `pnpm build && pnpm run preview` and open http://localhost:8787.

## Roll back

Run `npx wrangler deployments list` to see recent deployments, or `npx wrangler versions list` to see versions.
Run `npx wrangler rollback` to return to the previous version, or `npx wrangler rollback <version-id>` for a specific one.
Add `-c www-redirect/wrangler.jsonc` to any of these commands to act on the redirect Worker instead.
Static assets are versioned with the Worker, so a rollback restores the old pages too.
Fix forward afterwards by reverting the commit and running `pnpm run deploy` again, so the repository matches what is live.

## Taking it down

Run `npx wrangler delete vibelog-landing` and `npx wrangler delete vibelog-www-redirect`, which also remove the custom domains and their DNS records.
