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

## Other search engines: public-entry review on 2026-10-03

This review checked official public documentation and entry points. It did not
register accounts, send application emails, or directly submit the site to 360,
Sogou, or Shenma. Their current account login, verification, submission permissions
and quotas still need to be checked in the browser before recording a submission
result. Some public help documents are older; their availability alone does not
establish that this site's account has access to a tool.

| Engine | Confirmed discovery route and limits |
| --- | --- |
| Yandex and Seznam | Both participate in IndexNow. A notification to the global endpoint is shared with participating engines, so the existing workflow covers this notification channel without duplicate per-engine requests. This is not proof that either engine indexed the URLs. See the [IndexNow participant list and sharing rules](https://www.indexnow.org/faq) and [Yandex's IndexNow guide](https://yandex.com/support/webmaster/en/indexing-options/index-now). |
| DuckDuckGo | Most ordinary links and images are sourced from Bing, but DuckDuckGo also has its own crawler and indexes. Bing submission addresses its main source; it does not establish complete synchronization or a separate DuckDuckGo submission receipt. See [DuckDuckGo's result sources](https://duckduckgo.com/duckduckgo-help-pages/results/sources). |
| Yahoo Search | Yahoo's public help directs website submissions to Bing Webmaster Tools. A separate Yahoo submission channel is unnecessary for the Yahoo Search service described in this guide. See [Yahoo's submission instructions](https://hk.help.yahoo.com/kb/SLN2217.html). |
| 360 Search | The [official webmaster platform](https://zhanzhang.so.com/) requires a 360 account and site-ownership verification before its data-submission tools can be used. The [website inclusion entry](https://info.so.com/site_submit.html) also redirected to the official 360 login during this review. No direct submission was made; inspect the existing account and its permissions first. See [360's platform introduction](https://www.so.com/help/help_3_16.html) and [verification help](https://www.so.com/help/help_3_8.html). |
| Sogou | The [official resource platform](https://zhanzhang.sogou.com/) requires login and website verification. Its public [sitemap instructions](https://zhanzhang.sogou.com/index.php/help/sitemap) still describe invitation-based access, so a verified account does not by itself establish permission to submit a sitemap. No direct submission or invitation request was made. |
| Shenma | The [official webmaster platform](https://zhanzhang.sm.cn/) publishes login, verification and sitemap tools. Inspect the site's account permissions before using them. No direct submission was made. See [platform help](https://zhanzhang.sm.cn/open/help) and [sitemap instructions](https://zhanzhang.sm.cn/open/helpsitemap). |
| Quark | This review did not confirm a separate public website/sitemap submission interface or an official guarantee that Shenma submissions synchronize to Quark. The [Quark product site](https://www.quark.cn/) provides product and feedback information; a feedback form is not an indexing-submission interface. Record any later confirmed official route separately. |

For 360, Sogou and Shenma, distinguish "official entry exists", "account verified",
"submission permission available", "notification accepted", and "page indexed".
Record the actual browser result and observation date before changing any pending
status above. IndexNow coverage and Bing-derived result sources must not be
reported as individual successful submissions or guaranteed indexing.

## Publication receipts on 2026-10-03 (Asia/Shanghai)

Published commit `93060aa0ec1aec9364f28dc76dfd3c90a39a1402`:

- [Pages deployment](https://github.com/zhenfangzhu/personal-website/actions/runs/37046510135)
  succeeded before the new notification workflow started. The live about page
  contains the new bilingual biography and public-profile links.
- [IndexNow run](https://github.com/zhenfangzhu/personal-website/actions/runs/37046608373)
  was automatically triggered by `workflow_run`, checked out the same commit,
  and reported: `IndexNow received 23 URL notifications (HTTP 200); indexing is not confirmed.`
- Google Search Console confirmed successful resubmission of `sitemap.xml`.
  The about URL was already indexed; the new request was accepted and added to
  the priority crawl queue. This does not confirm that the revised text is indexed yet.
  The site's generative AI inclusion setting was already enabled and was not changed.
- Bing accepted the sitemap resubmission. Its row changed to `Processing`, with
  last submit displayed as 2026-10-02 in the platform's timezone. The displayed
  38 discovered URLs and previous crawl date are older report data.
- Baidu: the user completed the slider verification for the manual submission
  of 9 principal URLs and explicitly confirmed seeing `链接提交成功` and clicking
  `确定`. The form was cleared, consistent with the platform's success flow.
  This receipt confirms submission acceptance, not indexing. The submission
  trend report still ended at 2026-10-02 with that day's data unavailable at
  the follow-up check; no current indexed count is inferred. The sitemap quota
  remains 0, independently of this successful manual submission.
- 360, Sogou, and Shenma were opened in the current browser session. Each requires
  account login before submission; no direct submissions or account registrations
  were completed. No claim is made about post-login quotas or eligibility.

These receipts establish publication and discovery notifications only. Search
ranking, indexing refreshes, and AI citations require later platform observations.
The published name remains the verified `朱振方 / Zhenfang Zhu`; the unconfirmed
name `朱志邦` from the request was not added as an alias.

## Requested Baidu repeat submission

At 2026-10-03 02:32 (Asia/Shanghai), the user completed verification for a
requested repeat of the same 9 URLs. The platform returned HTTP 200 with
application status `2` and displayed `您今日的链接提交量已达上限，请改天提交`.
The repeat was therefore **not accepted**. This does not revoke the original
submission's success dialog confirmed by the user above, and does not establish
indexing. No further retries or future automatic submissions were scheduled.

## Review and refresh on 2026-10-06 (Asia/Shanghai)

Published search-metadata revision `de8890efb59ada3e67954759075e83c4b8bc125f`:

- This initial revision added the university to the about title. The user later
  rejected university wording in titles; that title change is superseded by the
  preference recorded below. English homepage descriptions use
  the university's full name; the Chinese homepage explicitly says the person
  graduated from it. The visible page design and body copy were not changed.
- Only the four revised profile pages have new sitemap modification dates.
  All 38 sitemap URLs return HTTP 200 with the intended canonical and no
  indexing prohibition. Referenced local resources and verification files are
  reachable. Search/site/identity checks and existing tool regressions pass.
- [Pages run 37339449403](https://github.com/zhenfangzhu/personal-website/actions/runs/37339449403)
  succeeded at the revision above. All four live HTML responses and the live
  sitemap match the local published files.
- [IndexNow run 37339562548](https://github.com/zhenfangzhu/personal-website/actions/runs/37339562548)
  automatically ran after Pages at the same SHA. Its log confirms:
  `IndexNow received 4 URL notifications (HTTP 200); indexing is not confirmed.`
- Google confirmed `已成功提交站点地图` for the updated sitemap and
  `已请求编入索引` for the changed about page, adding that URL to its priority
  crawl queue. The existing about URL was already indexed. The overview reports
  39 indexed URLs; the sitemap has 38 discovered pages and was last read on
  2026-10-05 before this resubmission. Those counts do not establish that this
  revision's new text is indexed. Generative AI Search remains set to include
  the site through the inherited domain setting.
- Bing confirmed: `https://zhuzhenfang.com/sitemap.xml is successfully submitted
  for processing.` Before this resubmission, its sitemap was successful with
  38 discovered URLs and last crawl 2026-10-03. The AI Performance report still
  shows 0 citations in its sampled Microsoft Copilots and Partners data through
  2026-10-03; this is not an all-AI citation count.
- Baidu's submission trend now confirms 9 manual submissions on 2026-10-03.
  The user also supplied a later screenshot showing `链接提交成功` for the next
  manual batch before this review. The current trend has no values yet for
  2026-10-04 or 2026-10-05; these missing values must not be reported as failures
  or zero successful submissions. The latest index report shows 1 indexed URL
  on 2026-10-04. Submission acceptance and indexing remain separate measures.
- The user took control of the Baidu page, completed the manual verification,
  and explicitly reported that it displayed submission success for the new
  9-URL batch below. This is a user-confirmed acceptance receipt, not an API
  response independently read by the agent and not evidence of new indexing.
  Browser control remains with the user; the batch was not submitted again.
- 360, Sogou, and Shenma were checked again and still require account login.
  No new direct submissions, account registrations, or ownership-verification
  changes were made for them. Yahoo and DuckDuckGo source relationships and
  IndexNow participant coverage remain as documented above, not separate receipts.

Baidu batch accepted (success confirmed by the user):

```text
https://zhuzhenfang.com/zh/
https://zhuzhenfang.com/about/
https://zhuzhenfang.com/
https://zhuzhenfang.com/en/
https://zhuzhenfang.com/echoes/liu-qiangdong-oxon/
https://zhuzhenfang.com/echoes/zhixing-duanyongping/
https://zhuzhenfang.com/echoes/ustc-skating-rink/
https://zhuzhenfang.com/echoes/life-is-catching-a-bus/
https://zhuzhenfang.com/dreams/
```

The current audit also identified separate functional follow-ups: concurrent
public-board saves can overwrite another editor's update, and two open tabs of
Founder DNA or Yarrow I Ching can overwrite each other's local state. These were
reproduced offline; their persistence logic and production database were not
changed as part of this search-discovery refresh. Founder DNA's skip link also
lacks its matching main-content target. These findings are not indexing failures.

### Title preference confirmed during this review

The user explicitly wants the homepage search title to remain
`Zhenfang Zhu | 朱振方`, with no university added to the title. The three homepage
variants now use that name-only title consistently in HTML, Open Graph, Twitter,
and both language-switching title values. About titles are `关于朱振方` and
`About Zhenfang Zhu`; university wording was removed from those titles too.
Education remains in the visible biography, descriptions, and factual Person
structured data. Do not add education or promotional keywords to these titles
as a future search-optimization measure. Search engines still choose their own
result titles, so a published title cannot guarantee an immediate SERP change.

The final title revision is `0fd07f838ea2c9be2cb12d2f6438c389d24d859d`.
[Pages run 37340623505](https://github.com/zhenfangzhu/personal-website/actions/runs/37340623505)
and its automatic
[IndexNow run 37340742223](https://github.com/zhenfangzhu/personal-website/actions/runs/37340742223)
both completed successfully at that SHA. All four live HTML responses match
this revision and contain the requested titles. The final IndexNow run's status
was verified through the public API; its response body was not independently
read after the user took browser control. Google/Bing submissions already made
in this review are retained rather than repeatedly submitting the same URLs.
