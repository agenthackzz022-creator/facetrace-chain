from urllib.parse import urlparse

SOCIAL_DOMAINS = {
    "instagram.com": "Instagram",
    "www.instagram.com": "Instagram",
    "facebook.com": "Facebook",
    "www.facebook.com": "Facebook",
    "x.com": "X",
    "twitter.com": "X",
    "www.twitter.com": "X",
    "youtube.com": "YouTube",
    "www.youtube.com": "YouTube",
    "tiktok.com": "TikTok",
    "www.tiktok.com": "TikTok",
    "linkedin.com": "LinkedIn",
    "www.linkedin.com": "LinkedIn",
}

def source_label(link: str, source: str | None):
    if link:
        host = urlparse(link).netloc.lower()
        if host in SOCIAL_DOMAINS:
            return SOCIAL_DOMAINS[host]
        if host.startswith("www."):
            return host[4:]
        if host:
            return host
    return source or "Web"

def normalize(items, match_type):
    out = []
    for item in items or []:
        link = item.get("link")
        out.append({
            "type": match_type,
            "position": item.get("position"),
            "title": item.get("title") or "Untitled result",
            "source": source_label(link, item.get("source")),
            "link": link,
            "thumbnail": item.get("thumbnail"),
            "image": item.get("image"),
            "snippet": item.get("snippet"),
            "exact_matches": bool(item.get("exact_matches", False)),
        })
    return out

def parse_lens_results(data: dict):
    exact = normalize(data.get("exact", {}).get("exact_matches"), "exact_match")
    visual = normalize(data.get("visual", {}).get("visual_matches"), "visual_match")

    seen = set()
    results = []
    for item in exact + visual:
        key = item.get("link") or item.get("image") or item.get("thumbnail")
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        results.append(item)

    return results
