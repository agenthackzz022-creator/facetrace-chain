import os
from concurrent.futures import ThreadPoolExecutor

import requests
from dotenv import load_dotenv

load_dotenv()


class LensSearch:
    IMAGE_API = "https://serpapi.com/image"
    SEARCH_API = "https://serpapi.com/search.json"

    def __init__(self):
        self.key = os.getenv("SERPAPI_KEY")
        if not self.key:
            raise RuntimeError("SERPAPI_KEY is missing in backend/.env")

    def upload_image(self, image_path: str):
        with open(image_path, "rb") as f:
            r = requests.post(
                self.IMAGE_API,
                params={"api_key": self.key},
                files={"image": ("search.jpg", f, "image/jpeg")},
                timeout=(3, 8),
            )
        try:
            data = r.json()
        except ValueError as exc:
            raise RuntimeError(f"Image API returned invalid JSON (HTTP {r.status_code})") from exc
        if r.status_code >= 400 or "error" in data:
            raise RuntimeError(data.get("error", f"Image API HTTP {r.status_code}"))
        if not data.get("image_id"):
            raise RuntimeError(f"No image_id returned: {data}")
        return data["image_id"]

    def search(self, image_id: str, search_type: str):
        r = requests.get(
            self.SEARCH_API,
            params={
                "engine": "google_lens",
                "image_id": image_id,
                "type": search_type,
                "hl": "en",
                "country": "in",
                "api_key": self.key,
            },
            timeout=(3, 10),
        )
        try:
            data = r.json()
        except ValueError as exc:
            raise RuntimeError(f"Lens API returned invalid JSON (HTTP {r.status_code})") from exc
        if r.status_code >= 400 or "error" in data:
            raise RuntimeError(data.get("error", f"Lens HTTP {r.status_code}"))
        return data

    def run(self, image_path: str):
        image_id = self.upload_image(image_path)

        # Run exact + visual searches concurrently so the two network calls do not
        # add their latencies together.
        with ThreadPoolExecutor(max_workers=2) as executor:
            exact_future = executor.submit(self.search, image_id, "exact_matches")
            visual_future = executor.submit(self.search, image_id, "visual_matches")
            exact = exact_future.result()
            visual = visual_future.result()

        return {
            "image_id": image_id,
            "exact": exact,
            "visual": visual,
        }
