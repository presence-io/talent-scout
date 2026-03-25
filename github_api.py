"""
GitHub data collection via `gh` CLI — no token needed, uses local gh auth.

All methods shell out to `gh api` with pagination and rate-limit sleep.
"""

import json
import subprocess
import time


def gh(endpoint, paginate=False, method="GET", jq=None, per_page=100, max_pages=10,
       accept=None, search_sleep=2.0):
    """
    Call `gh api`. Returns parsed JSON (list or dict).

    For paginated endpoints, collects up to max_pages of results.
    For search endpoints, handles the {items: [...]} wrapper.
    """
    results = []

    for page in range(1, max_pages + 1):
        cmd = ["gh", "api", endpoint,
               "-X", method,
               "--header", "X-GitHub-Api-Version:2022-11-28"]

        if accept:
            cmd += ["--header", f"Accept:{accept}"]

        # Add pagination params
        sep = "&" if "?" in endpoint else "?"
        url = f"{endpoint}{sep}per_page={per_page}&page={page}"
        cmd[2] = url

        if jq:
            cmd += ["--jq", jq]

        try:
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        except subprocess.TimeoutExpired:
            print(f"  [TIMEOUT] {endpoint} page {page}")
            break

        if r.returncode != 0:
            stderr = r.stderr.strip()
            if "rate limit" in stderr.lower() or "403" in stderr:
                print(f"  [RATE] sleeping 60s...")
                time.sleep(60)
                continue
            if "422" in stderr:
                print(f"  [WARN] 422: {stderr[:100]}")
                break
            print(f"  [ERR] gh api failed: {stderr[:200]}")
            break

        output = r.stdout.strip()
        if not output or output == "[]" or output == "null":
            break

        try:
            data = json.loads(output)
        except json.JSONDecodeError:
            # jq output: one item per line
            items = [line for line in output.split("\n") if line.strip()]
            results.extend(items)
            if len(items) < per_page:
                break
            if not paginate:
                break
            time.sleep(search_sleep)
            continue

        # Search endpoints return {total_count, items: [...]}
        if isinstance(data, dict) and "items" in data:
            results.extend(data["items"])
            if len(data["items"]) < per_page:
                break
        elif isinstance(data, list):
            results.extend(data)
            if len(data) < per_page:
                break
        else:
            return data  # single object

        if not paginate:
            break

        # Search API: 30 req/min
        time.sleep(search_sleep)

    return results


# ── High-level collection functions ──

def search_code_owners(filename, path="/", max_pages=10):
    """Search repos with a specific file (e.g. CLAUDE.md), return unique owner logins."""
    q = f"filename:{filename}"
    if path:
        q += f" path:{path}"
    owners = set()
    items = gh(f"/search/code?q={q}&sort=indexed", paginate=True,
               max_pages=max_pages, search_sleep=2.5)
    for item in items:
        if isinstance(item, dict):
            repo = item.get("repository", {})
            owner = repo.get("owner", {}).get("login")
            if owner:
                owners.add(owner.lower())
    return owners


def search_commits(query, max_pages=3, date_range=None):
    """Search commits by message content. Returns list of {login, repo, message}."""
    q = query
    if date_range:
        q += f" committer-date:{date_range}"
    items = gh(f"/search/commits?q={q}&sort=committer-date", paginate=True,
               max_pages=max_pages, search_sleep=2.5,
               accept="application/vnd.github.cloak-preview+json")
    results = []
    for item in items:
        if not isinstance(item, dict):
            continue
        author = item.get("author")
        login = author["login"].lower() if author and author.get("login") else None
        if login:
            results.append({
                "login": login,
                "repo": item.get("repository", {}).get("full_name", ""),
                "message": item.get("commit", {}).get("message", "")[:120],
            })
    return results


def search_topic_owners(topic, max_pages=10):
    """Search repos by topic, return unique owner logins."""
    items = gh(f"/search/repositories?q=topic:{topic}&sort=updated", paginate=True,
               max_pages=max_pages, search_sleep=2.5)
    owners = set()
    for item in items:
        if isinstance(item, dict):
            owner = item.get("owner", {}).get("login")
            if owner:
                owners.add(owner.lower())
    return owners


def get_stargazers(owner, repo, max_pages=10):
    """Get stargazer logins."""
    items = gh(f"/repos/{owner}/{repo}/stargazers", paginate=True,
               max_pages=max_pages, search_sleep=0.2)
    users = set()
    for item in items:
        if isinstance(item, dict) and "login" in item:
            users.add(item["login"].lower())
    return users


def get_forks_owners(owner, repo, max_pages=5):
    """Get fork owner logins."""
    items = gh(f"/repos/{owner}/{repo}/forks?sort=newest", paginate=True,
               max_pages=max_pages, search_sleep=0.2)
    users = set()
    for item in items:
        if isinstance(item, dict):
            owner_login = item.get("owner", {}).get("login")
            if owner_login:
                users.add(owner_login.lower())
    return users


def get_user(username):
    """Get user profile."""
    data = gh(f"/users/{username}")
    if not isinstance(data, dict) or "login" not in data:
        return None
    return {
        "login": data.get("login", ""),
        "name": data.get("name"),
        "location": data.get("location"),
        "email": data.get("email"),
        "blog": data.get("blog"),
        "twitter": data.get("twitter_username"),
        "bio": data.get("bio"),
        "company": data.get("company"),
        "public_repos": data.get("public_repos", 0),
        "followers": data.get("followers", 0),
        "created_at": data.get("created_at"),
    }


def get_user_batch(usernames, progress_every=50):
    """Fetch profiles for a list of usernames. Returns dict of login→profile."""
    profiles = {}
    for i, u in enumerate(usernames):
        p = get_user(u)
        if p:
            profiles[u] = p
        if (i + 1) % progress_every == 0:
            print(f"    {i+1}/{len(usernames)} profiles fetched")
        time.sleep(0.1)  # gentle rate limit
    return profiles
