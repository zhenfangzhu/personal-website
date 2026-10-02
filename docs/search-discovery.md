# Search discovery operations

The canonical site is https://zhuzhenfang.com. Public pages are listed in the root
sitemap, and robots.txt points crawlers to it. Search submission is a discovery
notification; it does not prove indexing, rank, or citation in an AI answer.

## Publish and notify

The repository uses GitHub's managed Pages workflow (workflow API name
`pages-build-deployment`, run display name `pages build and deployment`, workflow
ID `369909132`). `Notify IndexNow` listens for its successful completion on
`main`, checks out that deployment's SHA, and checks the latest Pages run and
live sitemap/key before sending notifications. A failed, pending, or superseded
deployment does not submit. The first deployment after changing the workflow
must be checked in Actions to confirm the managed workflow trigger fired.

Automatic runs compare the deployed commit with the preceding successful Pages
commit. They notify added/removed sitemap URLs, URLs with changed dates, and
changed HTML pages. Shared files under `static/`, robots.txt or CNAME changes
can affect several pages, so those changes notify all current sitemap URLs.
Documentation-only changes send nothing.

For a deliberate whole-site update or initial setup, run `Notify IndexNow`
manually from `main` with `full` enabled. This still requires the selected SHA's
Pages deployment to have completed successfully. Use a normal sitemap for
ongoing discovery of unchanged pages. HTTP 200 means the notification was
received; HTTP 202 also means key validation is pending. Neither confirms
indexing. Check search engine dashboards for crawl and indexing results.

[GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
and [IndexNow guidance](https://www.indexnow.org/faq).

## Maintain the sitemap

Include public canonical URLs that should appear in search. A sitemap URL must
resolve to an existing, indexable page and agree with its canonical link.
Use `lastmod` only for a real significant update to main text, structured data,
or links. Do not change every date on each deployment or cosmetic edit. If a
reliable date is unavailable, omit it.

For generated Echoes pages, update the sitemap when articles are published,
renamed, or withdrawn. The current builder adds published URLs but does not
automatically remove old ones or calculate modification dates. When retiring an
article, also check its internal links and its old URL, and notify the old URL
after deployment. The offline search-discovery test checks the current inventory;
it cannot establish whether a historical date accurately reflects editorial work.

[Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## Verify and inspect search platforms

Keep existing Google/Bing verification files and homepage verification tags.
They are ownership proofs, and removing them can invalidate verification.
Google HTML-file and HTML-tag verification use separately supplied values;
never derive the tag's value from a verification filename. Verification status
must be checked in the platform account.

- Google Search Console: open the verified `https://zhuzhenfang.com/` property,
  submit `sitemap.xml` in Sitemaps, and inspect representative home/about/article
  URLs. Review canonical selection, crawl errors, indexing status, and search
  impressions. Google's Indexing API is limited to eligible job-posting and
  livestream pages, so it is not a general submission API for this personal site.
- Bing Webmaster Tools: keep the verified site, submit or review the sitemap,
  and use URL inspection, IndexNow reports, and search performance. An existing
  verified Google property may also be imported, including its sitemap.
- Baidu Search Resource Platform: verify the actual HTTPS site using its provided
  HTML tag or file. Use the account's available ordinary submission options for
  public URLs and inspect crawl/indexing reports. Obtain an API token only if API
  submission is intentionally configured; never commit that account token.

Current platform results should be recorded separately with the observation
date and the property being inspected. Public verification files alone do not
prove the current account's verification or current indexing counts.

[Google verification](https://support.google.com/webmasters/answer/9008080),
[Google Indexing API scope](https://developers.google.com/search/apis/indexing-api/v3/using-api),
[Bing verification](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b),
[Bing sitemaps](https://www.bing.com/webmasters/help/sitemaps-3b5cf6ed),
[Baidu verification](https://ziyuan.baidu.com/college/courseinfo?id=267&page=21),
and [Baidu ordinary submission](https://ziyuan.baidu.com/linksubmit/index).

## Platform baseline observed on 2026-10-03

These account observations predate this round of content changes and search
workflow updates. They are existing platform results, not new submissions:

| Platform | Existing observation |
| --- | --- |
| Google Search Console | Verified owner; 39 indexed URLs; sitemap report lists 38 URLs, success, last read 2026-09-29. Generative AI setting inherits the domain setting and currently includes the site. |
| Bing Webmaster Tools | Verified site; sitemap report lists 38 URLs, success, last crawl 2026-09-30. Search performance for 2026-07-02 through 2026-10-01: 3 clicks, 32 impressions. AI Performance: 0 citations in its sampled Microsoft Copilots and Partners reporting. |
| Baidu Search Resource Platform | Verified site; sitemap submission daily quota and remaining allowance both 0. Manual submission allows up to 20 URLs in the UI and is pending a post-publication attempt. No API token is stored in this repository. |

Indexing totals and platform reporting can lag behind the live site's current
inventory. Record the next submission time and actual result after publication;
these baseline numbers do not prove this local revision is indexed. Bing's
sampled AI report does not establish citation counts across all AI products.

## AI search

Crawlable, indexable HTML with useful text, internal links, and accurate visible
identity/structured data supports search discovery. Google's AI search features
use normal search eligibility; they do not require an AI text file or special
schema. An optional `llms.txt` directory is not a submission endpoint or a
promised ranking improvement.

[Google AI search guidance](https://developers.google.com/search/docs/appearance/ai-features).

## Offline validation

```sh
python3 -B -m unittest discover -s tests -p test_search_discovery.py
```

These tests do not submit URLs or read platform accounts. After publishing,
confirm Pages succeeds, the notification starts afterwards, and its checkout SHA
matches the Pages run. Check the live sitemap and use platform reports to track
actual indexing; do not interpret an Actions success as proof of search inclusion.
