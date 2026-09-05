import io
import json
import os
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
from PIL import Image, ImageOps
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from app.utils.hashing import sha256_file, sha256_text
from app.utils.image_prepare import prepare_for_lens
from app.face.recognizer import FaceRecognizer, cosine_similarity
from app.search.lens import LensSearch
from app.search.result_parser import parse_lens_results

load_dotenv()

ROOT = Path(__file__).resolve().parents[1]
UPLOADS = ROOT / "uploads"
SEARCH = ROOT / "search_cache"
UPLOADS.mkdir(exist_ok=True)
SEARCH.mkdir(exist_ok=True)

app = FastAPI(title="FaceTrace Chain API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

face_engine = None
lens_engine = None


def get_face_engine():
    global face_engine
    if face_engine is None:
        face_engine = FaceRecognizer()
    return face_engine


def get_lens_engine():
    global lens_engine
    if lens_engine is None:
        lens_engine = LensSearch()
    return lens_engine


@app.on_event("startup")
def warm_models():
    """Load the face model at server startup so the first user analysis is faster."""
    try:
        get_face_engine()
        print("[startup] InsightFace model ready")
    except Exception as exc:
        # Do not prevent FastAPI from starting; /api/analyze will report the error.
        print(f"[startup] InsightFace warm-up failed: {exc}")


@app.get("/")
def root():
    return {"name": "FaceTrace Chain", "status": "online"}


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "serpapi_configured": bool(os.getenv("SERPAPI_KEY")),
        "blockchain_configured": bool(
            os.getenv("CONTRACT_ADDRESS") and os.getenv("PRIVATE_KEY")
        ),
    }


def _download_and_compare(candidate):
    """Download one candidate and calculate face similarity if a face is detectable."""
    image_url = candidate.get("image") or candidate.get("thumbnail")
    if not image_url:
        return None

    try:
        response = requests.get(
            image_url,
            timeout=(1.5, 2.5),
            headers={"User-Agent": "Mozilla/5.0"},
        )
        response.raise_for_status()

        # Avoid wasting time/memory on unexpectedly large candidate files.
        if len(response.content) > 3 * 1024 * 1024:
            return None

        img = Image.open(io.BytesIO(response.content))
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((800, 800), Image.Resampling.LANCZOS)

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=True) as tmp:
            img.save(tmp.name, "JPEG", quality=82, optimize=True)
            embedding = get_face_engine().embedding_for_file(tmp.name)

        return embedding
    except Exception as exc:
        print(f"[candidate] skipped: {exc}")
        return None


def _score_candidates(results, input_embedding):
    """Compare only the first few useful candidates concurrently."""
    if input_embedding is None or not results:
        return

    # Three candidates gives a good speed/quality balance for the demo.
    indexed = list(enumerate(results[:3]))

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(_download_and_compare, item): idx
            for idx, item in indexed
        }
        for future in as_completed(futures):
            idx = futures[future]
            try:
                embedding = future.result()
                if embedding is None:
                    continue
                cosine = cosine_similarity(input_embedding, embedding)
                # Display a normalized 0-100 similarity score, not an identity probability.
                score = ((cosine + 1.0) / 2.0) * 100.0
                results[idx]["face_similarity"] = round(
                    max(0.0, min(100.0, score)), 2
                )
                results[idx]["face_compared"] = True
            except Exception as exc:
                print(f"[candidate {idx}] comparison failed: {exc}")


def _choose_evidence_index(results):
    """Prefer the best actually face-compared candidate; otherwise use an exact result."""
    compared = [
        (idx, item.get("face_similarity"))
        for idx, item in enumerate(results)
        if item.get("face_compared") and item.get("face_similarity") is not None
    ]
    if compared:
        return max(compared, key=lambda pair: pair[1])[0]

    for idx, item in enumerate(results):
        if item.get("type") == "exact_match":
            return idx

    return 0 if results else None


def _register_record(record_id: str, result_index: int):
    """Create and verify the selected evidence on the local Anvil chain."""
    from app.blockchain.client import BlockchainClient

    path = SEARCH / f"{record_id}.json"
    if not path.exists():
        raise RuntimeError("Analysis record not found.")

    record = json.loads(path.read_text())
    results = record.get("results", [])
    if not results:
        raise RuntimeError("No search result is available to record.")
    if result_index < 0 or result_index >= len(results):
        raise RuntimeError("Invalid result index.")

    selected = results[result_index]
    evidence = {
        "record_id": record_id,
        "image_hash": record["original_hash"],
        "metadata_hash": record["metadata_hash"],
        "source_url": selected.get("link") or "",
        "selected_result": selected,
    }
    evidence_hash = sha256_text(
        json.dumps(evidence, sort_keys=True, separators=(",", ":"))
    )

    client = BlockchainClient()
    tx = client.register(
        evidence_hash,
        record["original_hash"],
        record["metadata_hash"],
        selected.get("link") or "",
    )

    saved = {
        **tx,
        "evidence_hash": evidence_hash,
        "image_hash": record["original_hash"],
        "metadata_hash": record["metadata_hash"],
        "source_url": selected.get("link") or "",
        "result": selected,
    }
    (SEARCH / f"{record_id}.chain.json").write_text(
        json.dumps(saved, indent=2)
    )

    chain = client.get(tx["evidence_id"])
    verified = (
        evidence_hash == chain["evidence_hash"]
        and record["original_hash"] == chain["image_hash"]
        and record["metadata_hash"] == chain["metadata_hash"]
    )

    verification = {
        "success": True,
        "verified": verified,
        "local": {
            "evidence_hash": evidence_hash,
            "image_hash": record["original_hash"],
            "metadata_hash": record["metadata_hash"],
        },
        "blockchain": chain,
    }

    return saved, verification


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Only JPG, PNG and WEBP images are supported.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Maximum original upload size is 10MB.")

    ext = (
        file.filename.rsplit(".", 1)[-1]
        if file.filename and "." in file.filename
        else "jpg"
    ).lower()
    original = UPLOADS / f"{uuid.uuid4()}.{ext}"
    original.write_bytes(content)

    original_hash = sha256_file(str(original))

    # Fast local face detection + embedding. Model is warmed at startup.
    face = get_face_engine().analyze(str(original))
    public_faces = face["faces"]

    # Keep the original untouched for evidence hashing; compress only the search copy.
    search_copy = SEARCH / f"{original.stem}.jpg"
    search_info = prepare_for_lens(str(original), str(search_copy))

    try:
        raw = get_lens_engine().run(str(search_copy))
        results = parse_lens_results(raw)
        search_error = None
    except Exception as exc:
        raw = {}
        results = []
        search_error = str(exc)

    # Candidate face similarity is added after search. It is never presented unless
    # that exact candidate was successfully downloaded and face-processed.
    input_embedding = face["_faces"][0]["_embedding"] if face["_faces"] else None
    _score_candidates(results, input_embedding)

    # Exact matches are preferred for ordering, then actual face similarity.
    results.sort(
        key=lambda item: (
            1 if item.get("type") == "exact_match" else 0,
            item.get("face_similarity", -1),
            -int(item.get("position") or 999),
        ),
        reverse=True,
    )

    metadata = {
        "original_filename": file.filename,
        "content_type": file.content_type,
        "file_size": len(content),
        "face_count": face["face_count"],
        "search_results": results,
    }
    metadata_hash = sha256_text(
        json.dumps(metadata, sort_keys=True, separators=(",", ":"))
    )

    record_id = original.stem
    record = {
        "record_id": record_id,
        "original_hash": original_hash,
        "metadata_hash": metadata_hash,
        "face": public_faces,
        "results": results,
        "metadata": metadata,
    }
    (SEARCH / f"{record_id}.json").write_text(json.dumps(record, indent=2))

    # Automatically record and immediately re-verify the best available result.
    chain = None
    verification = None
    chain_error = None
    evidence_index = _choose_evidence_index(results)

    if evidence_index is not None and search_error is None:
        try:
            chain, verification = _register_record(record_id, evidence_index)
        except Exception as exc:
            chain_error = str(exc)
            print(f"[blockchain] automatic registration failed: {exc}")

    return {
        "success": True,
        "record_id": record_id,
        "file": {"name": file.filename, "size": len(content)},
        "face": public_faces,
        "face_count": face["face_count"],
        "search": {
            "count": len(results),
            "results": results[:20],
            "error": search_error,
            "search_image": search_info,
        },
        "fingerprint": {
            "algorithm": "SHA-256",
            "image_hash": original_hash,
            "metadata_hash": metadata_hash,
        },
        "selected_result_index": evidence_index,
        "chain": chain,
        "verification": verification,
        "chain_error": chain_error,
        "pipeline": {
            "face_detection": "complete",
            "biometric_encoding": "complete" if face["face_count"] else "blocked",
            "web_discovery": "complete" if search_error is None else "error",
            "match_analysis": "complete" if results else "blocked",
            "blockchain": (
                "verified" if verification and verification.get("verified")
                else "complete" if chain
                else "error" if chain_error
                else "waiting"
            ),
        },
    }


class RegisterRequest(BaseModel):
    record_id: str
    result_index: int = 0


@app.post("/api/evidence/register")
def register_evidence(req: RegisterRequest):
    try:
        saved, verification = _register_record(req.record_id, req.result_index)
        return {
            "success": True,
            **saved,
            "verification": verification,
        }
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"Blockchain recording failed: {exc}") from exc


class VerifyRequest(BaseModel):
    record_id: str
    evidence_id: int


@app.post("/api/evidence/verify")
def verify_evidence(req: VerifyRequest):
    from app.blockchain.client import BlockchainClient

    path = SEARCH / f"{req.record_id}.json"
    if not path.exists():
        raise HTTPException(404, "Analysis record not found.")

    record = json.loads(path.read_text())
    results = record.get("results", [])
    chain_path = SEARCH / f"{req.record_id}.chain.json"
    local_chain = json.loads(chain_path.read_text()) if chain_path.exists() else {}

    try:
        chain = BlockchainClient().get(req.evidence_id)
    except Exception as exc:
        raise HTTPException(500, f"Blockchain verification failed: {exc}") from exc

    selected = local_chain.get("result") or (results[0] if results else {})
    evidence = {
        "record_id": req.record_id,
        "image_hash": record["original_hash"],
        "metadata_hash": record["metadata_hash"],
        "source_url": selected.get("link") or "",
        "selected_result": selected,
    }
    local_evidence_hash = sha256_text(
        json.dumps(evidence, sort_keys=True, separators=(",", ":"))
    )

    verified = (
        local_evidence_hash == chain["evidence_hash"]
        and record["original_hash"] == chain["image_hash"]
        and record["metadata_hash"] == chain["metadata_hash"]
    )

    return {
        "success": True,
        "verified": verified,
        "local": {
            "evidence_hash": local_evidence_hash,
            "image_hash": record["original_hash"],
            "metadata_hash": record["metadata_hash"],
        },
        "blockchain": chain,
    }
