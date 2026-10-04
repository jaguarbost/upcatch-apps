# Brand assets, SEO and GEO

The logo keeps the existing blue/yellow palette and display/body fonts. `public/upcatch-mark.svg` is the vector source. Run `node scripts/generate-brand-icons.mjs` to regenerate the logo SVG, multi-size favicon, 192/512 app icons, 180px Apple icon, and maskable icon. `LogoMark` uses the same paths with the existing theme tokens.

`lib/seo.ts` defines titles, descriptions, social previews and site origin. Set `NEXT_PUBLIC_SITE_URL` to the real public HTTPS domain in production. Vercel’s production hostname is used when the configured URL is a local development address. Localhost must not become the deployed canonical URL. Private account/auth/app routes carry noindex metadata; preview deployments are excluded from indexing.

The public homepage has a canonical URL and Organization, WebSite and WebPage JSON-LD. The sitemap lists only the public homepage, and robots excludes private routes and APIs. The JSON-LD contains no invented rating, physical office address, social profiles, venue approval, or usage statistics.

`/llms.txt` provides a factual product summary for AI tools, including the Manchester starting city and the distinction between friendships and dating. This is an optional reference file, not a guarantee of AI-search visibility. Standard crawlability and accurate public content remain the basis of GEO. See [Google’s AI search guidance](https://developers.google.com/search/docs/appearance/ai-features) and [Next.js metadata documentation](https://nextjs.org/docs/app/getting-started/metadata-and-og-images).
