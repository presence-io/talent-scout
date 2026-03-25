#!/usr/bin/env python3
"""
AI Talent Scout — step-by-step pipeline, each step outputs to local file.

Steps:
  1a  Code file search (CLAUDE.md, .cursorrules, .clinerules)  → results/step1a_code.json
  1b  Commit signature search (Co-Authored-By: Claude)         → results/step1b_commits.json
  1c  Topic repo search (claude-code, mcp-server)              → results/step1c_topics.json
  1d  Chinese community repos (stargazers/forks)               → results/step1d_community.json
  1e  Top repo stargazers                                      → results/step1e_stars.json
  2   Merge + dedupe all step1 signals                         → results/step2_merged.json
  3   Enrich top N with GitHub profiles                        → results/step3_enriched.json
  4   (Claude Code) AI analysis                                → results/step4_talent.json

Usage:
  python3 scout.py --step 1a        # run one step
  python3 scout.py --step 2         # merge (reads step1*.json)
  python3 scout.py --step 3         # enrich (reads step2_merged.json)
  python3 scout.py --all            # run steps 1a→1e→2→3 sequentially
  python3 scout.py --dry-run        # preview API budget
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


def save_step(name, data):
    """Save step output to results/{name}.json"""
    RESULTS_DIR.mkdir(exist_ok=True)
    path = RESULTS_DIR / f"{name}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  → saved {path}")
    return path


def load_step(name):
    """Load step output from results/{name}.json"""
    path = RESULTS_DIR / f"{name}.json"
    if not path.exists():
        print(f"  [ERR] {path} not found. Run that step first.")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ── Step 1a: Code file search ──

def step_1a(config):
    """Search for repos with CLAUDE.md, .cursorrules, .clinerules → per-user signals."""
    print("\n══ Step 1a: Code file search ══")
    candidates = {}
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
    print(f"  Total: {len(candidates)} unique users")
    save_step("step1a_code", {
        "step": "1a_code",
        "collected_at": datetime.now().isoformat(),
        "user_count": len(candidates),
        "candidates": candidates,
    })


# ── Step 1b: Commit signature search ──

def step_1b(config):
    """Search for commits with Claude co-author signatures."""
    print("\n══ Step 1b: Commit signature search ══")
    candidates = {}
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
        print(f"    → {total} commits")
    print(f"  Total: {len(candidates)} unique users")
    save_step("step1b_commits", {
        "step": "1b_commits",
        "collected_at": datetime.now().isoformat(),
        "user_count": len(candidates),
        "candidates": candidates,
    })


# ── Step 1c: Topic repo search ──

def step_1c(config):
    """Search for repos tagged with claude-code, mcp-server, etc."""
    print("\n══ Step 1c: Topic repo search ══")
    candidates = {}
    for tcfg in config.get("topic_queries", []):
        topic = tcfg["topic"]
        weight = tcfg["weight"]
        max_pages = tcfg.get("max_pages", config["api_budget"]["search_pages_per_query"])
        print(f"  topic:{topic}...")
        owners = gh.search_topic_owners(topic, max_pages=max_pages)
        print(f"    → {len(owners)} owners")
        for owner in owners:
            candidates.setdefault(owner, [])
            candidates[owner].append({
                "type": f"topic:{topic}",
                "detail": f"created topic:{topic} repo",
                "weight": weight,
            })
    print(f"  Total: {len(candidates)} unique users")
    save_step("step1c_topics", {
        "step": "1c_topics",
        "collected_at": datetime.now().isoformat(),
        "user_count": len(candidates),
        "candidates": candidates,
    })


# ── Step 1d: Chinese community repos ──

def step_1d(config):
    """Stargazers/forks of chinese community repos (e.g. Awesome-MCP-ZH)."""
    print("\n══ Step 1d: Chinese community repos ══")
    candidates = {}
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
    print(f"  Total: {len(candidates)} unique users")
    save_step("step1d_community", {
        "step": "1d_community",
        "collected_at": datetime.now().isoformat(),
        "user_count": len(candidates),
        "candidates": candidates,
    })


# ── Step 1e: Top repo stargazers ──

def step_1e(config):
    """Stargazers of top AI coding repos."""
    print("\n══ Step 1e: Top repo stargazers ══")
    candidates = {}
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
    print(f"  Total: {len(candidates)} unique users")
    save_step("step1e_stars", {
        "step": "1e_stars",
        "collected_at": datetime.now().isoformat(),
        "user_count": len(candidates),
        "candidates": candidates,
    })


# ── Step 2: Merge + dedupe ──

def step_2(config):
    """Merge all step1 outputs into one deduplicated candidate list, sorted by score."""
    print("\n══ Step 2: Merge + dedupe ══")
    merged = {}
    step_files = ["step1a_code", "step1b_commits", "step1c_topics", "step1d_community", "step1e_stars"]
    loaded = 0
    for name in step_files:
        path = RESULTS_DIR / f"{name}.json"
        if not path.exists():
            print(f"  [SKIP] {path} not found")
            continue
        data = load_step(name)
        count_before = len(merged)
        for username, signals in data["candidates"].items():
            username = username.lower()
            merged.setdefault(username, [])
            merged[username].extend(signals)
        print(f"  {name}: +{len(merged) - count_before} new users (total: {len(merged)})")
        loaded += 1

    if loaded == 0:
        print("  No step1 data found. Run step 1a-1e first.")
        sys.exit(1)

    # Sort by total weight descending
    ranked = sorted(merged.items(), key=lambda x: -sum(s["weight"] for s in x[1]))

    output = []
    for username, signals in ranked:
        output.append({
            "username": username,
            "raw_score": round(sum(s["weight"] for s in signals), 1),
            "signal_count": len(signals),
            "signals": signals[:15],
        })

    print(f"\n  Total merged: {len(output)} unique users")
    print(f"  Top 10 by score:")
    for i, c in enumerate(output[:10], 1):
        types = list({s["type"] for s in c["signals"]})
        print(f"    {i:2d}. {c['username']:<22s} score={c['raw_score']:5.1f}  signals={c['signal_count']}  types={types}")

    save_step("step2_merged", {
        "step": "2_merged",
        "merged_at": datetime.now().isoformat(),
        "total_users": len(output),
        "sources_loaded": loaded,
        "candidates": output,
    })


# ── Step 3: Enrich with profiles ──

def step_3(config):
    """Fetch GitHub profiles for top candidates from step2_merged."""
    print("\n══ Step 3: Profile enrichment ══")
    data = load_step("step2_merged")
    candidates = data["candidates"]
    batch_size = config["api_budget"]["profile_batch_size"]
    location_keywords = [kw.lower() for kw in config.get("location_keywords", [])]

    to_enrich = candidates[:batch_size]
    print(f"  Enriching top {len(to_enrich)} of {len(candidates)} candidates...")

    usernames = [c["username"] for c in to_enrich]
    profiles = gh.get_user_batch(usernames)
    print(f"  Got {len(profiles)} profiles")

    enriched = []
    china_count = 0
    for c in to_enrich:
        profile = profiles.get(c["username"])
        entry = {**c, "profile": profile, "location_match": False}
        if profile:
            loc = (profile.get("location") or "").lower()
            if loc and any(kw in loc for kw in location_keywords):
                entry["location_match"] = True
                china_count += 1
        enriched.append(entry)

    # Sort: china matches first, then by score
    enriched.sort(key=lambda x: (-int(x["location_match"]), -x["raw_score"]))

    # Also include the rest (not enriched) at the bottom
    rest = candidates[batch_size:]
    for c in rest:
        enriched.append({**c, "profile": None, "location_match": False})

    china_matches = [e for e in enriched if e["location_match"]]
    print(f"\n  China location matches: {china_count}")
    if china_matches:
        print(f"  Top 20 China-matched:")
        for i, c in enumerate(china_matches[:20], 1):
            p = c["profile"] or {}
            print(f"    {i:2d}. {c['username']:<22s} {(p.get('name') or ''):<16s} "
                  f"{(p.get('location') or ''):<20s} score={c['raw_score']:.1f}")

    save_step("step3_enriched", {
        "step": "3_enriched",
        "enriched_at": datetime.now().isoformat(),
        "total_users": len(enriched),
        "profiles_fetched": len(profiles),
        "china_location_matches": china_count,
        "candidates": enriched,
    })

    print(f"\n  Next: Claude Code reads results/step3_enriched.json → outputs results/step4_talent.json")


# ── Dry run ──

def dry_run(config):
    print("=== DRY RUN ===\n")
    pages = config["api_budget"]["search_pages_per_query"]
    steps = []

    code = config.get("code_signals", [])
    n = len(code) * pages
    steps.append(("1a Code search", f"{len(code)} files × {pages} pages", n, "step1a_code.json"))

    commits = config.get("commit_queries", [])
    n = len(commits) * 3 * 3
    steps.append(("1b Commit search", f"{len(commits)} queries × 3 windows × 3 pages", n, "step1b_commits.json"))

    topics = config.get("topic_queries", [])
    n = sum(t.get("max_pages", pages) for t in topics)
    steps.append(("1c Topic search", f"{len(topics)} topics", n, "step1c_topics.json"))

    community = config.get("chinese_community", [])
    n = sum(c.get("max_pages", 10) for c in community)
    steps.append(("1d Community", f"{len(community)} repos", n, "step1d_community.json"))

    stars = config.get("stargazer_repos", [])
    n = sum(s.get("max_pages", 5) for s in stars)
    steps.append(("1e Stargazers", f"{len(stars)} repos", n, "step1e_stars.json"))

    steps.append(("2  Merge", "reads step1*.json", 0, "step2_merged.json"))

    batch = config["api_budget"]["profile_batch_size"]
    steps.append(("3  Enrich", f"up to {batch} profiles", batch, "step3_enriched.json"))

    steps.append(("4  AI analysis", "Claude Code reads step3", 0, "step4_talent.json"))

    total = 0
    print(f"{'Step':<20s} {'Work':<40s} {'API calls':>10s}  {'Output'}")
    print("-" * 95)
    for name, desc, calls, output in steps:
        total += calls
        calls_str = str(calls) if calls > 0 else "-"
        print(f"{name:<20s} {desc:<40s} {calls_str:>10s}  results/{output}")
    print("-" * 95)
    print(f"{'Total':<20s} {'':40s} {total:>10d}")


# ── CLI ──

STEP_MAP = {
    "1a": step_1a,
    "1b": step_1b,
    "1c": step_1c,
    "1d": step_1d,
    "1e": step_1e,
    "2": step_2,
    "3": step_3,
}


def main():
    parser = argparse.ArgumentParser(description="AI Talent Scout")
    parser.add_argument("--step", choices=list(STEP_MAP.keys()), help="Run a specific step")
    parser.add_argument("--all", action="store_true", help="Run steps 1a→1e→2→3 sequentially")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--config", default="config.yaml")
    args = parser.parse_args()

    config = load_config(args.config)

    if args.dry_run:
        dry_run(config)
        return

    if args.step:
        STEP_MAP[args.step](config)
    elif args.all:
        for step_name in ["1a", "1b", "1c", "1d", "1e", "2", "3"]:
            STEP_MAP[step_name](config)
    else:
        parser.print_help()
        print("\nExamples:")
        print("  python3 scout.py --step 1a    # run code file search")
        print("  python3 scout.py --step 2     # merge all step1 results")
        print("  python3 scout.py --all        # run everything 1a→3")
        print("  python3 scout.py --dry-run    # preview API budget")


if __name__ == "__main__":
    main()
