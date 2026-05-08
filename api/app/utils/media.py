"""Image compression, thumbnail, and video transcoding utilities."""

import io
import os
import subprocess
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
    """Derive the thumbnail file path for a given storage path.

    Images use the same extension (always saved as JPEG regardless).
    Videos always get a .jpg thumbnail since ffmpeg extracts a JPEG frame.
    """
    p = Path(storage_path)
    if p.suffix.lower() in {".mp4", ".webm", ".avi", ".mpeg", ".mpg", ".ogv", ".mov"}:
        return str(p.with_name(f"{p.stem}.thumb.jpg"))
    return str(p.with_name(f"{p.stem}.thumb{p.suffix}"))


# ---------------------------------------------------------------------------
# Video transcoding
# ---------------------------------------------------------------------------

_VIDEO_CRF = 23       # H.264 quality: lower = better (18–28 typical range)
_VIDEO_PRESET = "fast"
_VIDEO_MAX_W = 1920
_VIDEO_MAX_H = 1080


def transcode_video(source_path: str | Path) -> tuple[str, int]:
    """Transcode any video to H.264/AAC MP4, max 1080p, CRF 23.

    Returns (output_path, size_bytes).  Raises RuntimeError if ffmpeg fails.
    The source file is NOT deleted — callers decide whether to remove it.
    """
    src = Path(source_path)
    dest = src.with_suffix(".mp4")
    if dest == src:
        dest = src.with_name(f"{src.stem}_tc.mp4")

    cmd = [
        "ffmpeg", "-i", str(src),
        "-c:v", "libx264",
        "-crf", str(_VIDEO_CRF),
        "-preset", _VIDEO_PRESET,
        # Scale down to max 1920×1080, keep aspect ratio, force even dimensions
        "-vf", (
            f"scale='min({_VIDEO_MAX_W},iw)':'min({_VIDEO_MAX_H},ih)'"
            ":force_original_aspect_ratio=decrease,"
            "scale=trunc(iw/2)*2:trunc(ih/2)*2"
        ),
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",   # moov atom first — enables browser streaming
        "-y",                        # overwrite output
        str(dest),
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=900)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode(errors="replace")[-2000:])

    return str(dest), dest.stat().st_size


def generate_video_thumbnail(source_path: str | Path) -> str | None:
    """Extract a JPEG frame from a video at the 1-second mark as a thumbnail.

    Returns the thumbnail path, or None if ffmpeg fails.
    """
    src = Path(source_path)
    thumb = src.with_name(f"{src.stem}.thumb.jpg")
    cmd = [
        "ffmpeg", "-i", str(src),
        "-ss", "00:00:01",
        "-vframes", "1",
        "-vf", f"scale={_THUMB_SIZE}:{_THUMB_SIZE}:force_original_aspect_ratio=decrease",
        "-y",
        str(thumb),
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=30)
    return str(thumb) if result.returncode == 0 and thumb.exists() else None
