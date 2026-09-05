import cv2
import numpy as np
from insightface.app import FaceAnalysis

class FaceRecognizer:
    def __init__(self):
        self.app = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"],
        )
        self.app.prepare(ctx_id=0, det_size=(640, 640))

    def analyze(self, image_path: str):
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError("Unable to read image")

        faces = self.app.get(image)
        results = []

        for idx, face in enumerate(faces):
            emb = np.asarray(face.embedding, dtype=np.float32)
            norm = np.linalg.norm(emb)
            if norm:
                emb = emb / norm

            results.append({
                "face_id": idx + 1,
                "bbox": [int(x) for x in face.bbox],
                "detection_score": round(float(face.det_score), 4),
                "embedding_dimension": int(len(emb)),
                "_embedding": emb,
            })

        public = []
        for r in results:
            public.append({k: v for k, v in r.items() if k != "_embedding"})

        return {
            "face_detected": bool(results),
            "face_count": len(results),
            "faces": public,
            "_faces": results,
        }

    def embedding_for_file(self, image_path: str):
        result = self.analyze(image_path)
        faces = result["_faces"]
        if not faces:
            return None
        # Use the largest detected face for candidate comparison.
        largest = max(
            faces,
            key=lambda x: max(0, x["bbox"][2]-x["bbox"][0]) *
                          max(0, x["bbox"][3]-x["bbox"][1])
        )
        return largest["_embedding"]

def cosine_similarity(a, b) -> float:
    a = np.asarray(a, dtype=np.float32)
    b = np.asarray(b, dtype=np.float32)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)
