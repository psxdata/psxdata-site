# psxdata-site

The landing page at [psxdata.org](https://psxdata.org): plain HTML and CSS in `public/`, served as Cloudflare Workers static assets. No build step.

## Preview locally

```
python -m http.server 8790 --directory public
```

Or with Wrangler, which matches production:

```
npx wrangler dev
```

## Deploy

Cloudflare Workers Builds deploys `main` on every push. Settings in the Worker's Builds tab:

- Build command: none
- Deploy command: `npx wrangler deploy`

`wrangler.jsonc` attaches the custom domain `psxdata.org`; Cloudflare creates its DNS record and certificate on the first deploy.

## Design

Colors, spacing and fonts (Geist, OFL licensed, in `public/fonts/`) match the waitlist and the MCP sign-in pages so every psxdata page looks like one product.
