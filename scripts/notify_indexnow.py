"""Notify IndexNow after Pages publishes this commit; no credentials beyond CI's read token."""

from pathlib import Path
import json
import os
import subprocess
import time
from urllib.parse import urlsplit
import urllib.request
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
HOST = "zhuzhenfang.com"
ORIGIN = "https://" + HOST
KEY = "74b5e7c44a83c21a3c2b5765c25a4107"


def sitemap_urls(source):
    urls = {}
    root = ET.fromstring(source)
    for item in root.findall("{http://www.sitemaps.org/schemas/sitemap/0.9}url"):
        url = (item.findtext("{http://www.sitemaps.org/schemas/sitemap/0.9}loc") or "").strip()
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.netloc != HOST or parsed.query or parsed.fragment:
            raise ValueError(f"Invalid sitemap URL: {url}")
        if url in urls:
            raise ValueError(f"Duplicate sitemap URL: {url}")
        urls[url] = item.findtext("{http://www.sitemaps.org/schemas/sitemap/0.9}lastmod") or ""
    if not urls:
        raise ValueError("The sitemap has no URLs")
    return urls


def page_url(path):
    if path == "index.html":
        return ORIGIN + "/"
    if path.endswith("/index.html"):
        return ORIGIN + "/" + path[:-len("index.html")]
    return ORIGIN + "/" + path


def changed_urls(current, previous, paths):
    """Include changed pages and removed URLs, without re-notifying unrelated articles."""
    if previous is None:
        return sorted(current)
    selected = {url for url in current.keys() | previous.keys()
                if url not in current or url not in previous or current[url] != previous[url]}
    for path in paths:
        if path.endswith(".html"):
            url = page_url(path)
            if url in current or url in previous:
                selected.add(url)
        elif path.startswith("static/") or path in {"robots.txt", "CNAME"}:
            # Shared scripts, styles and assets can affect several rendered pages.
            selected.update(current)
    return sorted(selected)


def deployed_base(runs, sha):
    """Reject stale/manual requests while a newer Pages deployment is pending or failed."""
    if not runs:
        raise ValueError("No GitHub Pages deployment was found")
    latest = runs[0]
    if (latest.get("head_branch") != "main" or latest.get("head_sha") != sha
            or latest.get("status") != "completed" or latest.get("conclusion") != "success"):
        raise ValueError("This commit is not the latest successful, completed Pages deployment")
    return next((run["head_sha"] for run in runs[1:]
                 if run.get("head_branch") == "main"
                 and run.get("head_sha") != sha
                 and run.get("status") == "completed" and run.get("conclusion") == "success"), None)


def get(url, *, token=None):
    headers = {"User-Agent": "zhuzhenfang-search-discovery", "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = "Bearer " + token
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as response:
        return response.read()


def deployment_runs(repository, workflow_id, token):
    url = f"https://api.github.com/repos/{repository}/actions/workflows/{workflow_id}/runs?branch=main&per_page=30"
    return json.loads(get(url, token=token))["workflow_runs"]


def live_matches(source, key_source, expected):
    return key_source.decode("utf-8").strip() == KEY and sitemap_urls(source) == expected


def wait_for_live(expected, sha):
    last_error = "The deployed sitemap or key does not match"
    for attempt in range(18):
        try:
            source = get(ORIGIN + "/sitemap.xml?deployment=" + sha)
            key_source = get(ORIGIN + "/" + KEY + ".txt")
            if live_matches(source, key_source, expected):
                return
        except (OSError, ValueError, ET.ParseError) as error:
            last_error = str(error)
        if attempt < 17:
            time.sleep(10)
    raise ValueError("Live site verification failed: " + last_error)


def submit(urls):
    payload = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"{ORIGIN}/{KEY}.txt",
                          "urlList": urls}).encode("utf-8")
    request = urllib.request.Request("https://api.indexnow.org/indexnow", data=payload,
                                     headers={"Content-Type": "application/json; charset=utf-8"},
                                     method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status == 200:
            return f"IndexNow received {len(urls)} URL notifications (HTTP 200); indexing is not confirmed."
        if response.status == 202:
            return f"IndexNow received {len(urls)} URL notifications (HTTP 202); key validation is pending, indexing is not confirmed."
        raise ValueError(f"Unexpected IndexNow response: HTTP {response.status}")


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def main():
    sha = os.environ["DEPLOYED_SHA"]
    if git("rev-parse", "HEAD") != sha:
        raise ValueError("Checkout does not match the Pages deployment commit")
    repository = os.environ["GITHUB_REPOSITORY"]
    workflow_id = os.environ["PAGES_WORKFLOW_ID"]
    token = os.environ.get("GITHUB_TOKEN")
    base = deployed_base(deployment_runs(repository, workflow_id, token), sha)
    current = sitemap_urls((ROOT / "sitemap.xml").read_bytes())
    if os.environ.get("INDEXNOW_FULL", "").lower() == "true":
        urls = sorted(current)
    elif base:
        previous = sitemap_urls(git("show", base + ":sitemap.xml"))
        paths = git("diff", "--name-only", "--no-renames", base, sha).splitlines()
        urls = changed_urls(current, previous, paths)
    else:
        urls = changed_urls(current, None, [])
    if not urls:
        print("No changed sitemap URLs since the preceding successful Pages deployment.")
        return
    wait_for_live(current, sha)
    # A newer deployment may have started during CDN propagation checks.
    deployed_base(deployment_runs(repository, workflow_id, token), sha)
    print(submit(urls))


if __name__ == "__main__":
    main()
