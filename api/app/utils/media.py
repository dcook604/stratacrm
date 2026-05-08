"""Image compression and thumbnail utilities using Pillow."""

import io
import os
from pathlib import Path

from PIL import Image, ImageOps

# Max dimension for the longest edge of a compressed image
_MAX_DIMENSION = 3840  # 4K UHD-ish
# JPEG/WebP quality target
_COMPRESS_QUALITY = 82
# Thumbnail size (longest edge)
_THUMB_SIZE = 480


def compress_image(source_path: str | Path, dest_path: str | Path | None = None) -> tuple[str, int]:
    """Compress an image file in-place (or to *dest_path* if given).

    Strips EXIF, resizes if the longest edge exceeds ``_MAX_DIMENSION``,
    re-encodes to JPEG (converting RGBA/P modes).  Returns the output path
    and final file size in bytes.
    """
    src = Path(source_path)
    dest = Path(dest_path) if dest_path else src

    with Image.open(src) as img:
        # Normalise orientation from EXIF before discarding it
        img = ImageOps.exif_transpose(img) or img

        # Convert palette / RGBA to RGB so we can save as JPEG
        if img.mode in ("P", "RGBA", "LA"):
            img = img.convert("RGB")

        # Downscale if needed
        if max(img.size) > _MAX_DIMENSION:
            img.thumbnail((_MAX_DIMENSION, _MAX_DIMENSION), Image.LANCZOS)

        # Write to an in-memory buffer first so we don't corrupt the
        # original on disk if something fails mid-write.
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=_COMPRESS_QUALITY, optimize=True, progressive=True)
        buf.seek(0)

        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            f.write(buf.read())

    return str(dest), dest.stat().st_size


def generate_thumbnail(source_path: str | Path, thumb_path: str | Path | None = None) -> str | None:
    """Create a thumbnail image at *thumb_path* (or next to the source with a ``.thumb`` suffix).

    Returns the thumbnail path, or ``None`` if generation fails.
    """
    src = Path(source_path)
    if not src.exists():
        return None

    thumb = Path(thumb_path) if thumb_path else src.with_name(f"{src.stem}.thumb{src.suffix}")

    try:
        with Image.open(src) as img:
            img = ImageOps.exif_transpose(img) or img
            if img.mode in ("P", "RGBA", "LA"):
                img = img.convert("RGB")
            img.thumbnail((_THUMB_SIZE, _THUMB_SIZE), Image.LANCZOS)
            thumb.parent.mkdir(parents=True, exist_ok=True)
            img.save(thumb, format="JPEG", quality=70, optimize=True)
        return str(thumb)
    except Exception:
        return None


def thumbnail_path_for(storage_path: str) -> str:
    """Derive the thumbnail file path for a given storage path."""
    p = Path(storage_path)
    return str(p.with_name(f"{p.stem}.thumb{p.suffix}"))
