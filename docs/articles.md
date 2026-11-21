# Markdown articles

Educational marketing articles live in
`content/articles/<locale>/<category>/<slug>.md`. They are separate from the
GitBook help centre under `docs/help`.

## Add an article

1. Create a Markdown file named exactly like its slug.
2. Add the required YAML frontmatter.
3. Use the locale and category folders declared in the frontmatter.
4. Keep the status as `draft` until the article is ready.
5. Change the status to `published` after editorial review.

```yaml
---
id: issued-vs-received-cheques
translationKey: issued-vs-received-cheques
locale: en
status: published
category: cheque-workflow
slug: issued-vs-received-cheques
title: 'Issued vs Received Cheques: A Practical Business Workflow'
description: Practical summary for the article.
publishedAt: 2026-11-21
updatedAt: 2026-11-21
author: Cheque Check Editorial
reviewStatus: editorial-reviewed
---
```

The page renders standard Markdown and GFM tables/lists. Raw HTML is sanitized.
Article pages exist only for published locale/slug combinations; untranslated
content returns 404 instead of duplicating another language.

## Routes and localization

- Index: `/<locale>/articles`
- Article: `/<locale>/articles/<slug>`
- Supported locale segments: `en`, `hi`, `hi-en`

Use the same `translationKey` for equivalent translated articles. Slugs may
change between languages when that produces a clearer URL.

Published translations are linked automatically with `hreflang` values
`en-IN`, `hi-IN`, and `hi-Latn-IN`. The English translation is also exposed as
`x-default`. Missing or draft translations are omitted.

## Index and sitemap

The server builds an article index from frontmatter. Article-list search uses
summaries in the browser and never ships Markdown bodies. Individual article
pages render their Markdown body on demand. Published article and locale-index
URLs are included in the sitemap.

## Editorial checks

The repository validates locale, status, category, slug, title, description,
publication dates, author, and review status. Keep legal topics at
`needs-review` until qualified review is complete. Preserve canonical URLs when
renaming an article and add redirects for previously public slugs.

At larger volume, paginate category/index views and move the generated index or
search service to a database only when build-time indexing becomes a measured
bottleneck.
