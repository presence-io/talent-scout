#!/usr/bin/env python3
"""
AI Talent Scout — Phase 1: GitHub data collection.

Collects signals from multiple dimensions, enriches top candidates with profiles,
outputs raw JSON for Claude Code to analyze and score.

Usage:
    python3 scout.py                    # full collection
    python3 scout.py --dry-run          # preview API budget
    python3 scout.py --phase code       # only code file search
    python3 scout.py --phase commits    # only commit signature search
    python3 scout.py --phase topics     # only topic repo search
    python3 scout.py --phase community  # only chinese community repos
    python3 scout.py --phase stars      # only top repo stargazers
    python3 scout.py --enrich-only      # skip collection, enrich existing raw data
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import yaml

import github_api as gh

RESULTS_DIR = Path("results")


def load_config(path="config.yaml"):
    with open(path) as f:
        return yaml.safe_load(f)


# ── Collection phases ──

def collect_code_signals(config, candidates):
    """1a. Search for repos with CLAUDE.md, .cursorrules, .clinerules"""
    print("\n── 1a: Code file search (proven users) ──")
    for sig in config.get("code_signals", []):
        fn = sig["filename"]
        weight = sig["weight"]
        label = sig.get("label", fn)
        max_pages = sig.get("max_pages", config["api_budget"]["search_pages_per_query"])
        print(f"  filename:{fn}...")
        owners = gh.search_code_owners(fn, sig.get("path", "/"), max_pages=max_pages)
        print(f"    → {len(owners)} owners")
        for owner in owners:
            candidates.setdefault(owner, [])
            candidates[owner].append({
                "type": f"code:{label}",
                "detail": f"has {fn} in repo",
                "weight": weight,
            })


def collect_commit_signals(config, candidates):
    """1b. Search for commits with Claude co-author signatures"""
    print("\n── 1b: Commit signature search ──")
    now = datetime.now()
    windows = [
        f"{(now - timedelta(days=90)).strftime('%Y-%m-%d')}..{now.strftime('%Y-%m-%d')}",
        f"{(now - timedelta(days=180)).strftime('%Y-%m-%d')}..{(now - timedelta(days=90)).strftime('%Y-%m-%d')}",
        f"{(now - timedelta(days=365)).strftime('%Y-%m-%d')}..{(now - timedelta(days=180)).strftime('%Y-%m-%d')}",
    ]
    for qcfg in config.get("commit_queries", []):
        query = qcfg["query"]
        weight = qcfg["weight"]
        total = 0
        for window in windows:
            print(f"  {query} ({window})...")
            results = gh.search_commits(query, max_pages=3, date_range=window)
            total += len(results)
            for r in results:
                login = r["login"]
                candidates.setdefault(login, [])
                candidates[login].append({
                    "type": "commit:claude-coauthor",
                    "detail": f"{r['repo']}: {r['message'][:60]}",
                    "weight": weight,
                })
        print(f"    → {total} commits total")


def collect_topic_signals(config, candidates):
    """1c. Search for repos tagged with claude-code, mcp-server, etc."""
    print("\n── 1c: Topic repo search ──")
    for tcfg in config.get("topic_queries", []):
        topic = tcfg["topic"]
        weight = tcfg["weight"]
        max_pages = tcfg.get("max_pages", config["api_budget"]["search_pages_per_query"])
        print(f"  topic:{topic}...")
        owners = gh.search_topic_owners(topic, max_pages=max_pages)
        print(f"    → {len(owners)} repo owners")
        for owner in owners:
            candidates.setdefault(owner, [])
            candidates[owner].append({
                "type": f"topic:{topic}",
                "detail": f"created topic:{topic} repo",
                "weight": weight,
            })


def collect_community_signals(config, candidates):
    """1d. Chinese community repos (stargazers/forks)"""
    print("\n── 1d: Chinese community repos ──")
    for ccfg in config.get("chinese_community", []):
        owner = ccfg["owner"]
        repo = ccfg["repo"]
        sig_type = ccfg["type"]
        weight = ccfg["weight"]
        max_pages = ccfg.get("max_pages", 10)
        print(f"  {sig_type} of {owner}/{repo}...")
        if sig_type == "stargazers":
            users = gh.get_stargazers(owner, repo, max_pages=max_pages)
        else:
            users = gh.get_forks_owners(owner, repo, max_pages=max_pages)
        print(f"    → {len(users)} users")
        for u in users:
            candidates.setdefault(u, [])
            candidates[u].append({
                "type": f"community:{sig_type}",
                "detail": f"{sig_type} of {owner}/{repo}",
                "weight": weight,
            })


def collect_stargazer_signals(config, candidates):
    """1e. Top repo stargazers"""
    print("\n── 1e: Top repo stargazers ──")
    for scfg in config.get("stargazer_repos", []):
        owner = scfg["owner"]
        repo = scfg["repo"]
        weight = scfg["weight"]
        max_pages = scfg.get("max_pages", 5)
        print(f"  {owner}/{repo} (max {max_pages} pages)...")
        users = gh.get_stargazers(owner, repo, max_pages=max_pages)
        print(f"    → {len(users)} stargazers")
        for u in users:
            candidates.setdefault(u, [])
            candidates[u].append({
                "type": "star",
                "detail": f"starred {owner}/{repo}",
                "weight": weight,
            })


PHASES = {
    "code": collect_code_signals,
    "commits": collect_commit_signals,
    "topics": collect_topic_signals,
    "community": collect_community_signals,
    "stars": collect_stargazer_signals,
}


# ── Phase 2: Enrich top candidates with profiles ──

def enrich_candidates(config, candidates):
    """Fetch GitHub profiles for top candidates sorted by signal score."""
    print("\n── Phase 2: Profile enrichment ──")
    batch_size = config["api_budget"]["profile_batch_size"]
    location_keywords = [kw.lower() for kw in config.get("location_keywords", [])]

    # Rank by total signal weight
    ranked = sorted(
        candidates.items(),
        key=lambda x: -sum(s["weight"] for s in x[1]),
    )
    to_enrich = [username for username, _ in ranked[:batch_size]]
    print(f"  Enriching top {len(to_enrich)} of {len(candidates)} candidates...")

    profiles = gh.get_user_batch(to_enrich)
    print(f"  Got {len(profiles)} profiles")

    # Build enriched output
    enriched = []
    for username, signals in ranked:
        profile = profiles.get(username)
        raw_score = sum(s["weight"] for s in signals)
        entry = {
            "username": username,
            "raw_score": raw_score,
            "signal_count": len(signals),
            "signals": signals[:15],  # cap for readability
            "profile": profile,
        }
        # Quick location tag
        if profile:
            loc = (profile.get("location") or "").lower()
            entry["location_match"] = any(kw in loc for kw in location_keywords) if loc else False
        else:
            entry["location_match"] = False
        enriched.append(entry)

    # Sort: location_match first, then by raw_score
    enriched.sort(key=lambda x: (-int(x["location_match"]), -x["raw_score"]))
    return enriched


# ── Output ──

def save_raw(candidates, enriched):
    """Save raw collection + enriched data as JSON."""
    RESULTS_DIR.mkdir(exist_ok=True)
    today = datetime.now().strftime("%Y-%m-%d")

    # Raw signals (all candidates, no profiles)
    raw_path = RESULTS_DIR / f"raw_{today}.json"
    raw_data = {
        "collected_at": datetime.now().isoformat(),
        "total_candidates": len(candidates),
        "candidates": {
            username: {
                "raw_score": sum(s["weight"] for s in signals),
                "signal_count": len(signals),
                "signals": signals,
            }
            for username, signals in candidates.items()
        },
    }
    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(raw_data, f, indent=2, ensure_ascii=False)
    print(f"  Raw: {raw_path} ({len(candidates)} candidates)")

    # Enriched (top candidates with profiles)
    enriched_path = RESULTS_DIR / f"enriched_{today}.json"
    with open(enriched_path, "w", encoding="utf-8") as f:
        json.dump(enriched, f, indent=2, ensure_ascii=False)
    print(f"  Enriched: {enriched_path} ({len(enriched)} candidates)")

    # Summary for Claude Code to read
    china_matches = [e for e in enriched if e["location_match"]]
    with_profile = [e for e in enriched if e["profile"]]
    print(f"\n  China location matches: {len(china_matches)}")
    print(f"  With profile: {len(with_profile)}")
    if china_matches:
        print(f"\n  Top 20 China-matched candidates:")
        for i, c in enumerate(china_matches[:20], 1):
            p = c["profile"] or {}
            print(f"    {i:2d}. {c['username']:<22s} {(p.get('name') or ''):<16s} "
                  f"{(p.get('location') or ''):<20s} score={c['raw_score']:.1f} "
                  f"signals={c['signal_count']}")

    return raw_path, enriched_path


# ── CLI ──

def dry_run(config):
    print("=== DRY RUN ===\n")
    total = 0

    code = config.get("code_signals", [])
    pages = config["api_budget"]["search_pages_per_query"]
    n = len(code) * pages
    total += n
    print(f"Code search:     {len(code)} files × {pages} pages = ~{n} gh api calls")

    commits = config.get("commit_queries", [])
    n = len(commits) * 3 * 3  # 3 windows × 3 pages
    total += n
    print(f"Commit search:   {len(commits)} queries × 3 windows × 3 pages = ~{n} calls")

    topics = config.get("topic_queries", [])
    n = sum(t.get("max_pages", pages) for t in topics)
    total += n
    print(f"Topic search:    {len(topics)} topics = ~{n} calls")

    community = config.get("chinese_community", [])
    n = sum(c.get("max_pages", 10) for c in community)
    total += n
    print(f"Community repos: {len(community)} repos = ~{n} calls")

    stars = config.get("stargazer_repos", [])
    n = sum(s.get("max_pages", 5) for s in stars)
    total += n
    print(f"Stargazers:      {len(stars)} repos = ~{n} calls")

    batch = config["api_budget"]["profile_batch_size"]
    total += batch
    print(f"Profile enrich:  up to {batch} users = ~{batch} calls")

    print(f"\nTotal: ~{total} gh api calls")
    print(f"\nAfter collection, run Claude Code to analyze results/enriched_*.json")


def main():
    parser = argparse.ArgumentParser(description="AI Talent Scout — GitHub data collection")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--phase", choices=list(PHASES.keys()))
    parser.add_argument("--enrich-only", action="store_true",
                        help="Skip collection, enrich from latest raw data")
    parser.add_argument("--config", default="config.yaml")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.dry_run:
        dry_run(config)
        return

    candidates = {}

    if args.enrich_only:
        # Load latest raw data
        raws = sorted(RESULTS_DIR.glob("raw_*.json"), reverse=True)
        if not raws:
            print("No raw data found. Run collection first.")
            sys.exit(1)
        print(f"Loading {raws[0]}...")
        with open(raws[0]) as f:
            raw = json.load(f)
        candidates = {k: v["signals"] for k, v in raw["candidates"].items()}
    elif args.phase:
        PHASES[args.phase](config, candidates)
    else:
        for name, fn in PHASES.items():
            fn(config, candidates)

    print(f"\n  Total unique candidates: {len(candidates)}")

    if not candidates:
        print("No candidates found.")
        return

    # Enrich
    enriched = enrich_candidates(config, candidates)

    # Save
    print("\n── Output ──")
    save_raw(candidates, enriched)

    print(f"\n=== Done ===")
    print(f"Next: Claude Code reads results/enriched_*.json and evaluates candidates")


if __name__ == "__main__":
    main()
