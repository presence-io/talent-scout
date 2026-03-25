"""
GitHub API wrapper — rate-limit aware, with pagination and search support.

All collection logic is pure Python. AI evaluation lives in scorer.py.
"""

import os
import time
import requests


class GitHubAPI:
    BASE = "https://api.github.com"

    def __init__(self, token=None, max_calls=1500, search_sleep=2.5):
        self.token = token or os.environ.get("GITHUB_TOKEN")
        if not self.token:
            raise ValueError("GITHUB_TOKEN required (env var or constructor arg)")
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        })
        self.max_calls = max_calls
        self.search_sleep = search_sleep
        self.call_count = 0
        self.rate_remaining = 5000
        self.rate_reset = 0

    # ── Core request ──

    def _request(self, method, url, params=None, is_search=False):
        if self.call_count >= self.max_calls:
            print(f"  [BUDGET] hit {self.max_calls} calls, stopping")
            return None

        # Search API has 30 req/min limit
        if is_search:
            time.sleep(self.search_sleep)

        # Rate limit backoff
        if self.rate_remaining < 50:
            wait = max(0, self.rate_reset - time.time()) + 2
            print(f"  [RATE] waiting {wait:.0f}s for reset...")
            time.sleep(wait)

        resp = self.session.request(method, url, params=params)
        self.call_count += 1
        self.rate_remaining = int(resp.headers.get("X-RateLimit-Remaining", 5000))
        self.rate_reset = int(resp.headers.get("X-RateLimit-Reset", 0))

        if resp.status_code == 403 and "rate limit" in resp.text.lower():
            wait = max(0, self.rate_reset - time.time()) + 5
            print(f"  [RATE] 403 rate limited, sleeping {wait:.0f}s")
            time.sleep(wait)
            return self._request(method, url, params, is_search)

        if resp.status_code == 422:
            print(f"  [WARN] 422: {resp.json().get('message', '')[:100]}")
            return None

        if resp.status_code >= 400:
            print(f"  [ERR] {resp.status_code}: {resp.text[:200]}")
            return None

        return resp

    def _paginate(self, url, params=None, max_pages=10, is_search=False):
        params = params or {}
        params.setdefault("per_page", 100)
        for page in range(1, max_pages + 1):
            params["page"] = page
            resp = self._request("GET", url, params=params, is_search=is_search)
            if resp is None:
                break
            data = resp.json()
            items = data.get("items", data) if isinstance(data, dict) else data
            if not items:
                break
            yield from items
            # Search API: check if we got all results
            if isinstance(data, dict) and "total_count" in data:
                fetched = page * params["per_page"]
                if fetched >= data["total_count"]:
                    break

    # ── Code search (filename:CLAUDE.md etc.) ──

    def search_code_owners(self, filename, path="/", max_pages=10):
        """Search for repos containing a specific file, return unique owner logins."""
        url = f"{self.BASE}/search/code"
        q = f"filename:{filename}"
        if path:
            q += f" path:{path}"
        owners = set()
        for item in self._paginate(url, {"q": q, "sort": "indexed"}, max_pages, is_search=True):
            repo = item.get("repository", {})
            owner = repo.get("owner", {}).get("login")
            if owner:
                owners.add(owner.lower())
        return owners

    # ── Commit search ──

    def search_commits(self, query, max_pages=3, date_range=None):
        """Search commits, return list of (login, repo, message_preview)."""
        url = f"{self.BASE}/search/commits"
        q = query
        if date_range:
            q += f" committer-date:{date_range}"
        # Commit search needs special accept header
        old_accept = self.session.headers["Accept"]
        self.session.headers["Accept"] = "application/vnd.github.cloak-preview+json"
        results = []
        for item in self._paginate(url, {"q": q, "sort": "committer-date"}, max_pages, is_search=True):
            author = item.get("author")
            login = author["login"].lower() if author and author.get("login") else None
            if login:
                results.append({
                    "login": login,
                    "repo": item.get("repository", {}).get("full_name", ""),
                    "message": item.get("commit", {}).get("message", "")[:120],
                })
        self.session.headers["Accept"] = old_accept
        return results

    # ── Topic/repo search ──

    def search_topic_owners(self, topic, max_pages=10):
        """Search repos by topic, return unique owner logins."""
        url = f"{self.BASE}/search/repositories"
        q = f"topic:{topic}"
        owners = set()
        for item in self._paginate(url, {"q": q, "sort": "updated"}, max_pages, is_search=True):
            owner = item.get("owner", {}).get("login")
            if owner:
                owners.add(owner.lower())
        return owners

    # ── Stargazers / forks ──

    def get_stargazers(self, owner, repo, max_pages=10):
        """Get stargazer logins for a repo."""
        url = f"{self.BASE}/repos/{owner}/{repo}/stargazers"
        users = set()
        for item in self._paginate(url, max_pages=max_pages):
            if isinstance(item, dict) and "login" in item:
                users.add(item["login"].lower())
        return users

    def get_forks_owners(self, owner, repo, max_pages=5):
        """Get fork owner logins for a repo."""
        url = f"{self.BASE}/repos/{owner}/{repo}/forks"
        users = set()
        for item in self._paginate(url, {"sort": "newest"}, max_pages=max_pages):
            fork_owner = item.get("owner", {}).get("login")
            if fork_owner:
                users.add(fork_owner.lower())
        return users

    # ── User profile ──

    def get_user(self, username):
        """Get user profile dict."""
        resp = self._request("GET", f"{self.BASE}/users/{username}")
        if not resp:
            return None
        d = resp.json()
        return {
            "login": d.get("login", ""),
            "name": d.get("name"),
            "location": d.get("location"),
            "email": d.get("email"),
            "blog": d.get("blog"),
            "twitter": d.get("twitter_username"),
            "bio": d.get("bio"),
            "company": d.get("company"),
            "public_repos": d.get("public_repos", 0),
            "followers": d.get("followers", 0),
            "created_at": d.get("created_at"),
        }

    def get_recent_push_count(self, username):
        """Count recent PushEvent in public events (last ~30 days)."""
        url = f"{self.BASE}/users/{username}/events/public"
        count = 0
        for event in self._paginate(url, max_pages=1):
            if event.get("type") == "PushEvent":
                count += 1
        return count

    # ── Rate limit check ──

    def check_rate_limit(self):
        resp = self._request("GET", f"{self.BASE}/rate_limit")
        if not resp:
            return {}
        data = resp.json()
        core = data.get("resources", {}).get("core", {})
        search = data.get("resources", {}).get("search", {})
        return {
            "core_remaining": core.get("remaining"),
            "core_limit": core.get("limit"),
            "search_remaining": search.get("remaining"),
            "search_limit": search.get("limit"),
        }
