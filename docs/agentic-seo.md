# Agentic SEO and AI discovery

Agentic browsing audits complement conventional SEO. They check whether the
public website is discoverable and operable by machine agents without exposing
authenticated application data.

## Public discovery files

The app generates these public resources at request/build time:

- `/llms.txt`: Curated Markdown overview for language models and agents. It
  contains an H1, product boundaries, public links, and the published English
  article list.
- `/.well-known/ard.json`: Canonical Agentic Resource Discovery manifest.
- `/.well-known/ai-catalog.json` and `/ai-catalog.json`: Backward-compatible
  aliases for older Lighthouse/ARD consumers.

The ARD manifest follows the proposed v0.91 discovery specification. It
describes only real public Agent Skills served as Markdown. It does not
advertise private cheque, payment, account, or notification capabilities.

The root HTML includes `rel="ard"` and `rel="describedby"` links so discovery
does not depend only on probing conventional filenames.

## Accessibility

Every linked brand image must have a programmatic accessible name. The logo
image remains decorative, while header and footer links use the explicit name
`Cheque Check home`. This makes the interaction discoverable in the
accessibility tree even when CSS hides the visible brand text on smaller
screens.

## Maintenance

When adding a public agent-facing resource:

1. Confirm it is safe for unsigned visitors to access.
2. Add it to `llms.txt` if it is important for understanding or using the site.
3. Add a valid ARD entry only if it represents a real discoverable resource.
4. Use a domain-anchored `urn:air:<publisher>:...` identifier.
5. Keep representative queries aligned with genuine supported workflows.
6. Validate that discovery URLs return JSON/text rather than fallback HTML.
7. Add authentication allowlist entries only where the route is intentionally
   public.

Do not use these files to expose authenticated APIs, cheque content, account
information, WebMCP tools that do not exist, or claims that the app cannot
perform.

## Experimental scope

Chrome's Agentic Browsing category and ARD/WebMCP standards are still proposed
and may change. Passing these audits improves machine discoverability but does
not replace semantic HTML, crawlable server-rendered content, structured
data, privacy controls, or conventional SEO.
