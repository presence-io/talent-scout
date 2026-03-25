#!/usr/bin/env python3
"""
AI Talent Scout — 发现 AI Coding 时代优秀中国开发者

Pipeline:
  Phase 1: 收集（GitHub API）→ 多维度拉大列表
  Phase 2: 去重 + profile 充实 → 粗筛
  Phase 3: AI 评估（Claude Sonnet）→ 精筛 + 打分
  Phase 4: 输出 JSON/CSV
"""

import argparse
import csv
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import yaml

from github_api import GitHubAPI
from scorer import (
    ai_evaluate,
    compute_raw_score,
    final_score,
    quick_china_filter,
    rank_candidates,
)

RESULTS_DIR = Path("results")


def load_config(path="config.yaml"):
    with open(path) as f:
        return yaml.safe_load(f)


# ── Phase 1: Collect signals ──

def collect_code_signals(api, config, candidates):
    """1a. 代码文件搜索：CLAUDE.md, .cursorrules, .clinerules"""
    print("\n── Phase 1a: Code file search (proven users) ──")
    for sig in config.get("code_signals", []):
        fn = sig["filename"]
        weight = sig["weight"]
        label = sig.get("label", fn)
        max_pages = sig.get("max_pages", config["api_budget"]["search_pages_per_query"])
        print(f"  Searching filename:{fn}...")
        owners = api.search_code_owners(fn, sig.get("path", "/"), max_pages=max_pages)
        print(f"    → {len(owners)} unique owners")
        for owner in owners:
            candidates.setdefault(owner, {"signals": []})
            candidates[owner]["signals"].append({
                "type": f"code:{label}",
                "detail": f"has {fn} in repo",
                "weight": weight,
            })


def collect_commit_signals(api, config, candidates):
    """1b. Commit 签名搜索：Co-Authored-By: Claude"""
    print("\n── Phase 1b: Commit signature search ──")
    # Date windows to get more than 1000 results
    now = datetime.now()
    windows = [
        f"{(now - timedelta(days=90)).strftime('%Y-%m-%d')}..{now.strftime('%Y-%m-%d')}",
        f"{(now - timedelta(days=180)).strftime('%Y-%m-%d')}..{(now - timedelta(days=90)).strftime('%Y-%m-%d')}",
        f"{(now - timedelta(days=365)).strftime('%Y-%m-%d')}..{(now - timedelta(days=180)).strftime('%Y-%m-%d')}",
    ]
    for qcfg in config.get("commit_queries", []):
        query = qcfg["query"]
        weight = qcfg["weight"]
        total_found = 0
        for window in windows:
            print(f"  Searching {query} ({window})...")
            results = api.search_commits(query, max_pages=3, date_range=window)
            total_found += len(results)
            for r in results:
                login = r["login"]
                candidates.setdefault(login, {"signals": []})
                candidates[login]["signals"].append({
                    "type": "commit:claude-coauthor",
                    "detail": f"{r['repo']}: {r['message'][:60]}",
                    "weight": weight,
                })
        print(f"    → {total_found} commits found")


def collect_topic_signals(api, config, candidates):
    """1c. Topic 搜索：claude-code, mcp-server"""
    print("\n── Phase 1c: Topic repo search ──")
    for tcfg in config.get("topic_queries", []):
        topic = tcfg["topic"]
        weight = tcfg["weight"]
        max_pages = tcfg.get("max_pages", config["api_budget"]["search_pages_per_query"])
        print(f"  Searching topic:{topic}...")
        owners = api.search_topic_owners(topic, max_pages=max_pages)
        print(f"    → {len(owners)} repo owners")
        for owner in owners:
            candidates.setdefault(owner, {"signals": []})
            candidates[owner]["signals"].append({
                "type": f"topic:{topic}",
                "detail": f"created topic:{topic} repo",
                "weight": weight,
            })


def collect_community_signals(api, config, candidates):
    """1d. 中文社区快捷通道"""
    print("\n── Phase 1d: Chinese community repos ──")
    for ccfg in config.get("chinese_community", []):
        owner = ccfg["owner"]
        repo = ccfg["repo"]
        signal_type = ccfg["type"]
        weight = ccfg["weight"]
        max_pages = ccfg.get("max_pages", 10)
        print(f"  {signal_type} of {owner}/{repo}...")
        if signal_type == "stargazers":
            users = api.get_stargazers(owner, repo, max_pages=max_pages)
        else:
            users = api.get_forks_owners(owner, repo, max_pages=max_pages)
        print(f"    → {len(users)} users")
        for u in users:
            candidates.setdefault(u, {"signals": []})
            candidates[u]["signals"].append({
                "type": f"community:{signal_type}",
                "detail": f"{signal_type} of {owner}/{repo}",
                "weight": weight,
            })


def collect_stargazer_signals(api, config, candidates):
    """1e. 头部 repo stargazers"""
    print("\n── Phase 1e: Top repo stargazers ──")
    for scfg in config.get("stargazer_repos", []):
        owner = scfg["owner"]
        repo = scfg["repo"]
        weight = scfg["weight"]
        max_pages = scfg.get("max_pages", 5)
        print(f"  Stargazers of {owner}/{repo} (max {max_pages} pages)...")
        users = api.get_stargazers(owner, repo, max_pages=max_pages)
        print(f"    → {len(users)} stargazers")
        for u in users:
            candidates.setdefault(u, {"signals": []})
            candidates[u]["signals"].append({
                "type": "star",
                "detail": f"starred {owner}/{repo}",
                "weight": weight,
            })


# ── Phase 2: Dedupe + enrich profiles ──

def enrich_profiles(api, config, candidates):
    """Fetch GitHub profiles for top candidates by raw signal score."""
    print("\n── Phase 2: Profile enrichment ──")
    batch_size = config["api_budget"]["profile_batch_size"]
    location_keywords = config.get("location_keywords", [])

    # Sort by raw score, take top N
    ranked = sorted(
        candidates.items(),
        key=lambda x: -compute_raw_score(x[1]["signals"]),
    )
    to_enrich = ranked[:batch_size]
    print(f"  Enriching top {len(to_enrich)} of {len(candidates)} candidates...")

    enriched = []
    china_count = 0
    for i, (username, data) in enumerate(to_enrich):
        profile = api.get_user(username)
        if not profile:
            continue

        entry = {
            "username": username,
            "signals": data["signals"],
            "profile": profile,
            "raw_score": compute_raw_score(data["signals"]),
        }

        # Quick China pre-filter: check if location matches
        is_china_loc = quick_china_filter(profile, location_keywords)
        entry["location_match"] = is_china_loc
        if is_china_loc:
            china_count += 1
            # Fetch activity for China-located candidates
            entry["recent_pushes"] = api.get_recent_push_count(username)
        else:
            entry["recent_pushes"] = None

        enriched.append(entry)

        if (i + 1) % 50 == 0:
            print(f"    {i+1}/{len(to_enrich)} enriched "
                  f"(China match: {china_count}, API: {api.call_count})")

    print(f"  Done. {len(enriched)} enriched, {china_count} location-match China")
    return enriched


# ── Phase 3: AI evaluation ──

def ai_score(config, enriched):
    """Run Claude Sonnet evaluation on enriched candidates."""
    print("\n── Phase 3: AI evaluation (Claude Sonnet) ──")
    ai_cfg = config.get("ai_eval", {})
    model = ai_cfg.get("model", "claude-sonnet-4-20250514")
    batch_size = ai_cfg.get("batch_size", 20)
    max_batches = ai_cfg.get("max_batches", 30)

    evaluated = ai_evaluate(enriched, model=model, batch_size=batch_size, max_batches=max_batches)
    # Filter to Chinese candidates + rank
    chinese = [c for c in evaluated if c.get("is_chinese", False)]
    print(f"  AI identified {len(chinese)} Chinese developers")
    return rank_candidates(chinese)


# ── Phase 4: Output ──

def save_results(results, raw_candidates=None):
    """Save JSON + CSV output."""
    RESULTS_DIR.mkdir(exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")

    # Save raw data for debugging
    if raw_candidates:
        raw_path = RESULTS_DIR / f"raw_{today}.json"
        # Convert sets to lists for JSON serialization
        raw_data = {}
        for username, data in raw_candidates.items():
            raw_data[username] = {
                "signals": data["signals"],
                "raw_score": compute_raw_score(data["signals"]),
            }
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(raw_data, f, indent=2, ensure_ascii=False)
        print(f"  Raw data: {raw_path} ({len(raw_data)} candidates)")

    # Format output
    output = []
    for c in results:
        p = c.get("profile") or {}
        output.append({
            "username": c["username"],
            "name": p.get("name", ""),
            "city": c.get("city", ""),
            "location": p.get("location", ""),
            "final_score": c.get("final_score", 0),
            "raw_score": c.get("raw_score", 0),
            "skill_level": c.get("skill_level", 0),
            "ai_adoption": c.get("ai_adoption", 0),
            "contact_quality": c.get("contact_quality", 0),
            "recommended_action": c.get("recommended_action", ""),
            "summary": c.get("summary", ""),
            "email": p.get("email", ""),
            "blog": p.get("blog", ""),
            "twitter": p.get("twitter", ""),
            "company": p.get("company", ""),
            "bio": (p.get("bio") or "")[:150],
            "public_repos": p.get("public_repos", 0),
            "followers": p.get("followers", 0),
            "signal_count": len(c.get("signals", [])),
            "signals": [f"{s['type']}: {s['detail']}" for s in c.get("signals", [])[:10]],
            "profile_url": f"https://github.com/{c['username']}",
        })

    # JSON
    json_path = RESULTS_DIR / f"talent_{today}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"  JSON: {json_path}")

    # CSV
    csv_path = RESULTS_DIR / f"talent_{today}.csv"
    if output:
        fields = ["username", "name", "city", "final_score", "skill_level",
                  "ai_adoption", "recommended_action", "summary",
                  "email", "blog", "twitter", "company", "public_repos",
                  "followers", "signal_count", "profile_url"]
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(output)
    print(f"  CSV:  {csv_path}")

    # Cumulative
    all_path = RESULTS_DIR / "all_talent.json"
    existing = {}
    if all_path.exists():
        with open(all_path, encoding="utf-8") as f:
            for entry in json.load(f):
                existing[entry["username"]] = entry
    for r in output:
        if r["username"] not in existing or r["final_score"] > existing[r["username"]].get("final_score", 0):
            r["last_seen"] = today
            existing[r["username"]] = r
    all_sorted = sorted(existing.values(), key=lambda x: -x.get("final_score", 0))
    with open(all_path, "w", encoding="utf-8") as f:
        json.dump(all_sorted, f, indent=2, ensure_ascii=False)
    print(f"  Cumulative: {all_path} ({len(all_sorted)} total)")

    return json_path, csv_path


# ── CLI ──

def dry_run(config):
    """Preview API budget without executing."""
    print("=== DRY RUN ===\n")
    total = 1  # rate limit check

    code = config.get("code_signals", [])
    pages = config["api_budget"]["search_pages_per_query"]
    code_calls = len(code) * pages
    total += code_calls
    print(f"Code search:     {len(code)} files × {pages} pages = ~{code_calls} calls")

    commits = config.get("commit_queries", [])
    windows = 3
    commit_calls = len(commits) * windows * 3
    total += commit_calls
    print(f"Commit search:   {len(commits)} queries × {windows} windows × 3 pages = ~{commit_calls} calls")

    topics = config.get("topic_queries", [])
    topic_calls = sum(t.get("max_pages", pages) for t in topics)
    total += topic_calls
    print(f"Topic search:    {len(topics)} topics = ~{topic_calls} calls")

    community = config.get("chinese_community", [])
    community_calls = sum(c.get("max_pages", 10) for c in community)
    total += community_calls
    print(f"Community repos:  {len(community)} repos = ~{community_calls} calls")

    stars = config.get("stargazer_repos", [])
    star_calls = sum(s.get("max_pages", 5) for s in stars)
    total += star_calls
    print(f"Stargazers:      {len(stars)} repos = ~{star_calls} calls")

    batch = config["api_budget"]["profile_batch_size"]
    enrich_calls = batch * 2  # profile + events
    total += enrich_calls
    print(f"Profile enrich:  {batch} users × 2 = ~{enrich_calls} calls")

    ai_cfg = config.get("ai_eval", {})
    ai_calls = ai_cfg.get("max_batches", 30)
    print(f"AI eval:         {ai_calls} Sonnet API calls (batch of {ai_cfg.get('batch_size', 20)})")

    print(f"\nTotal GitHub API: ~{total} calls (budget: {config['api_budget']['max_total_calls']})")
    print(f"Total Sonnet:    ~{ai_calls} calls")


PHASE_MAP = {
    "code": collect_code_signals,
    "commits": collect_commit_signals,
    "topics": collect_topic_signals,
    "community": collect_community_signals,
    "stars": collect_stargazer_signals,
}


def main():
    parser = argparse.ArgumentParser(description="AI Talent Scout")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--phase", choices=list(PHASE_MAP.keys()) + ["ai-only"])
    parser.add_argument("--skip-ai", action="store_true", help="Skip AI evaluation")
    parser.add_argument("--min-score", type=float, default=0)
    parser.add_argument("--config", default="config.yaml")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.dry_run:
        dry_run(config)
        return

    api = GitHubAPI(
        max_calls=config["api_budget"]["max_total_calls"],
        search_sleep=config["api_budget"].get("search_sleep", 2.5),
    )

    print(f"AI Talent Scout — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    rate = api.check_rate_limit()
    print(f"Rate limit: {rate.get('core_remaining')}/{rate.get('core_limit')} core, "
          f"{rate.get('search_remaining')}/{rate.get('search_limit')} search")

    # Phase 1: Collect
    candidates = {}

    if args.phase == "ai-only":
        # Load raw data from previous run
        today = datetime.now().strftime("%Y-%m-%d")
        raw_path = RESULTS_DIR / f"raw_{today}.json"
        if not raw_path.exists():
            # Try finding most recent raw file
            raws = sorted(RESULTS_DIR.glob("raw_*.json"), reverse=True)
            if not raws:
                print("No raw data found. Run collection first.")
                sys.exit(1)
            raw_path = raws[0]
        print(f"Loading raw data from {raw_path}...")
        with open(raw_path) as f:
            raw = json.load(f)
        candidates = {k: {"signals": v["signals"]} for k, v in raw.items()}
    elif args.phase:
        PHASE_MAP[args.phase](api, config, candidates)
    else:
        for name, fn in PHASE_MAP.items():
            fn(api, config, candidates)

    print(f"\n  Total unique candidates: {len(candidates)}")
    print(f"  Total API calls so far: {api.call_count}")

    if not candidates:
        print("No candidates found.")
        return

    # Phase 2: Enrich
    enriched = enrich_profiles(api, config, candidates)
    print(f"  Total API calls: {api.call_count}")

    if not enriched:
        print("No candidates after enrichment.")
        save_results([], raw_candidates=candidates)
        return

    # Phase 3: AI evaluation
    if args.skip_ai:
        print("\n── Phase 3: SKIPPED (--skip-ai) ──")
        # Use location-match as fallback filter
        results = [c for c in enriched if c.get("location_match")]
        for c in results:
            c["final_score"] = c["raw_score"]
            c["is_chinese"] = True
        results.sort(key=lambda c: -c["final_score"])
    else:
        results = ai_score(config, enriched)

    # Min score filter
    if args.min_score > 0:
        results = [c for c in results if c.get("final_score", 0) >= args.min_score]

    # Phase 4: Output
    print(f"\n── Phase 4: Output ──")
    print(f"  Final candidates: {len(results)}")
    if results:
        print(f"\n  Top 15:")
        for i, r in enumerate(results[:15], 1):
            p = r.get("profile") or {}
            print(f"    {i:2d}. {r['username']:<20s} {p.get('name') or '':<15s} "
                  f"{r.get('city', ''):<10s} score={r.get('final_score', 0):5.1f} "
                  f"signals={len(r.get('signals', []))}")

    save_results(results, raw_candidates=candidates)

    print(f"\n=== Summary ===")
    print(f"  GitHub API calls: {api.call_count}")
    print(f"  Candidates collected: {len(candidates)}")
    print(f"  After enrichment: {len(enriched)}")
    print(f"  Final (Chinese + scored): {len(results)}")


if __name__ == "__main__":
    main()
