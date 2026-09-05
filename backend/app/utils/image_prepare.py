from io import BytesIO
from PIL import Image, ImageOps

MAX_SEARCH_BYTES = 450 * 1024

def prepare_for_lens(input_path: str, output_path: str) -> dict:
    """
    SerpApi's Image API currently limits direct uploads to 500 KB.
    We resize/compress the user's image for the search request while
    keeping the original file untouched for evidence hashing.
    """
    img = Image.open(input_path)
    img = ImageOps.exif_transpose(img).convert("RGB")

    max_side = 1600
    if max(img.size) > max_side:
        scale = max_side / max(img.size)
        img = img.resize(
            (max(1, int(img.width * scale)), max(1, int(img.height * scale))),
            Image.Resampling.LANCZOS,
        )

    quality = 88
    while True:
        buf = BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
        data = buf.getvalue()
        if len(data) <= MAX_SEARCH_BYTES or quality <= 45:
            break
        quality -= 5
        if quality < 60:
            max_side = int(max_side * 0.85)
            img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)

    with open(output_path, "wb") as f:
        f.write(data)

    return {
        "path": output_path,
        "bytes": len(data),
        "width": img.width,
        "height": img.height,
        "format": "JPEG",
        "quality": quality,
    }
