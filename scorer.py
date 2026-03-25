"""
AI-powered candidate scoring — uses Claude Sonnet to evaluate candidates.

Two stages:
1. Quick pre-filter (Python): location keyword match to avoid wasting AI calls
2. AI evaluation (Claude Sonnet): batch-evaluate candidates for quality + China likelihood
"""

import json
import os
import re

import anthropic


# ── Quick pre-filter (Python, no AI) ──

def quick_china_filter(profile, location_keywords):
    """Fast check: does the profile location match any China keyword?"""
    loc = (profile.get("location") or "").lower()
    if not loc:
        return False
    return any(kw.lower() in loc for kw in location_keywords)


def compute_raw_score(signals):
    """Sum up signal weights for a candidate."""
    return sum(s["weight"] for s in signals)


# ── AI evaluation (Claude Sonnet) ──

def build_eval_prompt(candidates):
    """Build a prompt for Claude to evaluate a batch of candidates."""
    profiles_text = ""
    for i, c in enumerate(candidates):
        p = c.get("profile") or {}
        profiles_text += f"""
--- Candidate {i+1}: {c['username']} ---
Name: {p.get('name') or 'N/A'}
Location: {p.get('location') or 'N/A'}
Bio: {p.get('bio') or 'N/A'}
Company: {p.get('company') or 'N/A'}
Email: {p.get('email') or 'N/A'}
Blog: {p.get('blog') or 'N/A'}
Twitter: {p.get('twitter') or 'N/A'}
Public repos: {p.get('public_repos', 0)}
Followers: {p.get('followers', 0)}
Created: {p.get('created_at', 'N/A')}
Signals ({len(c['signals'])}): {'; '.join(s['type'] + ': ' + s['detail'] for s in c['signals'][:8])}
Recent pushes: {c.get('recent_pushes', 'N/A')}
"""

    return f"""你是一个技术招聘分析师。下面是 {len(candidates)} 个 GitHub 开发者候选人的信息。

请对每个候选人进行评估，返回 JSON 数组。每个元素包含：
- "username": 用户名
- "is_chinese": bool, 是否大概率是中国人（根据 location、name、company 判断）
- "city": string, 最可能所在的中国城市（如果是中国人），否则 "unknown"
- "skill_level": 1-10, 技术水平评估（根据 repo 数、followers、信号强度、bio）
- "ai_adoption": 1-10, AI 工具使用深度（根据信号类型：有 CLAUDE.md=高，只 star=低）
- "contact_quality": 1-10, 联系方式可用性（有 email=高，有 blog/twitter=中，什么都没有=低）
- "summary": string, 一句话中文评价
- "recommended_action": "reach_out" | "monitor" | "skip"

评估标准：
- is_chinese: location 含中国城市名、公司是中国公司（字节/腾讯/阿里/美团/京东等）、名字是中文或拼音
- skill_level: followers>500=高, public_repos>100=高, 有高质量信号（自建 claude-code topic repo）=高
- ai_adoption: 有 CLAUDE.md 文件=9-10, 有 Claude co-author commit=8-9, 有 .cursorrules=7-8, 只 star 了 repo=3-4
- 优先推荐：is_chinese=true + city 在北京/上海 + ai_adoption>=7 + 有联系方式

只返回 JSON 数组，不要其他文字。

{profiles_text}"""


def ai_evaluate(candidates, model="claude-sonnet-4-20250514", batch_size=20, max_batches=30):
    """Use Claude Sonnet to evaluate candidates in batches. Returns enriched candidates."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("  [WARN] ANTHROPIC_API_KEY not set, skipping AI evaluation")
        return candidates

    client = anthropic.Anthropic(api_key=api_key)
    evaluated = []
    batches = [candidates[i:i + batch_size] for i in range(0, len(candidates), batch_size)]

    for batch_idx, batch in enumerate(batches[:max_batches]):
        print(f"  AI eval batch {batch_idx + 1}/{min(len(batches), max_batches)} ({len(batch)} candidates)...")
        prompt = build_eval_prompt(batch)

        try:
            resp = client.messages.create(
                model=model,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            text = resp.content[0].text.strip()
            # Extract JSON from response (handle markdown code blocks)
            if text.startswith("```"):
                text = re.sub(r"^```(?:json)?\n?", "", text)
                text = re.sub(r"\n?```$", "", text)
            evals = json.loads(text)

            # Merge AI evaluation back into candidates
            eval_map = {e["username"].lower(): e for e in evals}
            for c in batch:
                ai = eval_map.get(c["username"].lower(), {})
                c["ai_eval"] = ai
                c["is_chinese"] = ai.get("is_chinese", False)
                c["city"] = ai.get("city", "unknown")
                c["skill_level"] = ai.get("skill_level", 0)
                c["ai_adoption"] = ai.get("ai_adoption", 0)
                c["contact_quality"] = ai.get("contact_quality", 0)
                c["summary"] = ai.get("summary", "")
                c["recommended_action"] = ai.get("recommended_action", "skip")
                evaluated.append(c)

        except json.JSONDecodeError as e:
            print(f"  [WARN] batch {batch_idx + 1} JSON parse error: {e}")
            # Keep candidates without AI eval
            for c in batch:
                c["ai_eval"] = {}
                evaluated.append(c)
        except Exception as e:
            print(f"  [ERR] batch {batch_idx + 1} API error: {e}")
            for c in batch:
                c["ai_eval"] = {}
                evaluated.append(c)

    return evaluated


def final_score(candidate):
    """Compute final composite score for ranking."""
    raw = compute_raw_score(candidate.get("signals", []))
    skill = candidate.get("skill_level", 0)
    adoption = candidate.get("ai_adoption", 0)
    contact = candidate.get("contact_quality", 0)

    # Location bonus
    city = (candidate.get("city") or "").lower()
    location_bonus = 0
    if any(c in city for c in ["beijing", "北京"]):
        location_bonus = 3.0
    elif any(c in city for c in ["shanghai", "上海"]):
        location_bonus = 3.0
    elif city != "unknown":
        location_bonus = 1.0

    # Weighted composite
    score = (
        raw * 1.0           # signal strength
        + skill * 0.5       # technical skill
        + adoption * 0.8    # AI tool depth
        + contact * 0.3     # reachability
        + location_bonus    # city preference
    )
    return round(score, 1)


def rank_candidates(candidates):
    """Sort by final score descending."""
    for c in candidates:
        c["final_score"] = final_score(c)
    candidates.sort(key=lambda c: -c["final_score"])
    return candidates
