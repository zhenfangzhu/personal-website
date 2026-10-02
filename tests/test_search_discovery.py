"""Offline checks for sitemap eligibility and post-deployment change notifications."""

from datetime import date, datetime, timedelta, timezone
from contextlib import redirect_stdout
from html.parser import HTMLParser
import io
import os
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("notify_indexnow", ROOT / "scripts/notify_indexnow.py")
notify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notify)
ORIGIN = notify.ORIGIN


class PageHead(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.canonical = []
        self.robots = []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical.append(attrs.get("href"))
        if tag == "meta" and attrs.get("name") == "robots":
            self.robots.append(attrs.get("content", ""))


def sitemap(*rows):
    return ('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            + "".join(f"<url><loc>{url}</loc><lastmod>{modified}</lastmod></url>" for url, modified in rows)
            + "</urlset>")


def deployment(sha="new", *, status="completed", conclusion="success", branch="main"):
    return {"head_sha": sha, "head_branch": branch, "status": status, "conclusion": conclusion}


class SearchDiscoveryTests(unittest.TestCase):
    def test_sitemap_urls_are_unique_public_canonical_pages_with_plausible_dates(self):
        urls = notify.sitemap_urls((ROOT / "sitemap.xml").read_bytes())
        for url, lastmod in urls.items():
            with self.subTest(url=url):
                relative = url[len(ORIGIN) + 1:]
                path = ROOT / (relative + "index.html" if url.endswith("/") else relative)
                self.assertTrue(path.is_file(), "Sitemap must not advertise a missing page")
                page = PageHead(path.read_text(encoding="utf-8"))
                self.assertEqual(page.canonical, [url], "Sitemap must use the page's canonical URL")
                self.assertFalse(any("noindex" in value.lower() for value in page.robots))
                if lastmod:
                    self.assertLessEqual(date.fromisoformat(lastmod), datetime.now(timezone(timedelta(hours=8))).date())

    def test_changed_html_and_dates_notify_only_affected_pages_and_removed_urls(self):
        old = {ORIGIN + "/": "2026-09-27", ORIGIN + "/about/": "2026-09-27",
               ORIGIN + "/echoes/old/": "", ORIGIN + "/echoes/unchanged/": ""}
        current = {ORIGIN + "/": "2026-10-03", ORIGIN + "/about/": "2026-09-27",
                   ORIGIN + "/echoes/new/": "", ORIGIN + "/echoes/unchanged/": ""}
        actual = notify.changed_urls(current, old, ["about/index.html", "googletoken.html", "docs/guide.md"])
        self.assertCountEqual(actual, [ORIGIN + "/", ORIGIN + "/about/", ORIGIN + "/echoes/old/",
                                       ORIGIN + "/echoes/new/"])

    def test_shared_asset_changes_include_pages_but_no_change_sends_nothing(self):
        current = {ORIGIN + "/": "", ORIGIN + "/zh/": "", ORIGIN + "/about/": ""}
        self.assertEqual(notify.changed_urls(current, current, ["docs/guide.md"]), [])
        self.assertCountEqual(notify.changed_urls(current, current, ["static/js/language.js"]), current)
        self.assertCountEqual(notify.changed_urls(current, None, []), current)

    def test_pending_failed_foreign_and_stale_deployments_do_not_allow_submissions(self):
        for run in [deployment(status="in_progress", conclusion=None),
                    deployment(conclusion="failure"), deployment(branch="other"), deployment(sha="different")]:
            with self.subTest(run=run), self.assertRaises(ValueError):
                notify.deployed_base([run, deployment(sha="old")], "new")
        self.assertEqual(notify.deployed_base([deployment(), deployment(), deployment(sha="old")], "new"), "old")
        self.assertIsNone(notify.deployed_base([deployment()], "new"))

    def test_old_live_sitemap_does_not_pass_just_because_key_is_online(self):
        current = {ORIGIN + "/": "2026-10-03"}
        self.assertFalse(notify.live_matches(sitemap((ORIGIN + "/", "2026-09-27")), notify.KEY.encode(), current))
        self.assertFalse(notify.live_matches(sitemap((ORIGIN + "/", "2026-10-03")), b"wrong", current))
        self.assertTrue(notify.live_matches(sitemap((ORIGIN + "/", "2026-10-03")), notify.KEY.encode(), current))

    def test_response_logs_do_not_claim_indexing_and_202_retains_pending_validation(self):
        for status in (200, 202):
            with self.subTest(status=status), patch.object(notify.urllib.request, "urlopen") as request:
                response = request.return_value.__enter__.return_value
                response.status = status
                message = notify.submit([ORIGIN + "/"])
                self.assertIn("indexing is not confirmed", message)
                self.assertEqual("key validation is pending" in message, status == 202)
                outgoing = request.call_args.args[0]
                self.assertEqual(outgoing.method, "POST")
                self.assertEqual(outgoing.full_url, "https://api.indexnow.org/indexnow")

    def test_main_never_submits_when_a_newer_pages_commit_is_pending(self):
        environment = {"DEPLOYED_SHA": "new", "GITHUB_REPOSITORY": "owner/site",
                       "PAGES_WORKFLOW_ID": "123", "INDEXNOW_FULL": "true"}
        with patch.dict(os.environ, environment), patch.object(notify, "git", return_value="new"), \
                patch.object(notify, "deployment_runs", return_value=[deployment(sha="newer", status="in_progress", conclusion=None)]), \
                patch.object(notify, "wait_for_live") as live, patch.object(notify, "submit") as submit:
            with self.assertRaises(ValueError):
                notify.main()
            live.assert_not_called()
            submit.assert_not_called()

    def test_main_checks_live_content_and_deployment_again_before_sending_only_changed_urls(self):
        environment = {"DEPLOYED_SHA": "new", "GITHUB_REPOSITORY": "owner/site",
                       "PAGES_WORKFLOW_ID": "123", "INDEXNOW_FULL": "false"}
        source = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
        git_responses = {("rev-parse", "HEAD"): "new", ("show", "old:sitemap.xml"): source,
                         ("diff", "--name-only", "--no-renames", "old", "new"): "about/index.html"}
        calls = []

        def runs(*args):
            calls.append("deployment")
            return [deployment(), deployment(sha="old")]

        def live(*args):
            calls.append("live")

        def send(urls):
            calls.append("submit")
            self.assertEqual(urls, [ORIGIN + "/about/"])
            return "Notification received, indexing not confirmed."

        with patch.dict(os.environ, environment), \
                patch.object(notify, "git", side_effect=lambda *args: git_responses[args]), \
                patch.object(notify, "deployment_runs", side_effect=runs), \
                patch.object(notify, "wait_for_live", side_effect=live), \
                patch.object(notify, "submit", side_effect=send), redirect_stdout(io.StringIO()):
            notify.main()
        self.assertEqual(calls, ["deployment", "live", "deployment", "submit"])

    def test_invalid_host_and_duplicate_sitemap_urls_are_rejected(self):
        for source in [sitemap(("https://example.com/", "")),
                       sitemap((ORIGIN + "/", ""), (ORIGIN + "/", ""))]:
            with self.subTest(source=source), self.assertRaises(ValueError):
                notify.sitemap_urls(source)


if __name__ == "__main__":
    unittest.main()
