import { useState, useRef, useCallback, useEffect } from "react";
import { RotateCw, RotateCcw, Crop, Undo2, Check, X } from "lucide-react";

interface ImageEditorProps {
  /** The source image (a blob URL, data URL, or File object). */
  src: string | File;
  /** Called with the final edited Blob when the user confirms. */
  onConfirm: (blob: Blob) => void;
  /** Called when the user cancels editing. */
  onCancel: () => void;
}

export default function ImageEditor({ src, onConfirm, onCancel }: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const [isCropping, setIsCropping] = useState(false);

  // Crop coords (in display-container space, 0–1 fraction of image dimensions)
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null);

  const [imgWidth, setImgWidth] = useState(0);
  const [imgHeight, setImgHeight] = useState(0);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setImgWidth(img.naturalWidth);
      setImgHeight(img.naturalHeight);
    };
    if (typeof src === "string") {
      img.src = src;
    } else {
      img.src = URL.createObjectURL(src);
    }
    return () => { img.onload = null; };
  }, [src]);

  // Rotate helpers (swap w/h for 90/270)
  const displayWidth = rotation % 180 === 0 ? imgWidth : imgHeight;
  const displayHeight = rotation % 180 === 0 ? imgHeight : imgWidth;

  // Scale to fit container (max 500px)
  const maxDisplay = 500;
  const scale = Math.min(1, maxDisplay / Math.max(displayWidth, displayHeight));
  const viewW = Math.round(displayWidth * scale);
  const viewH = Math.round(displayHeight * scale);

  // Draw the image with current rotation
  const drawImage = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (!image) return;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      // After rotation, the "natural" dimensions may be swapped
      const drawW = rotation % 180 === 0 ? imgWidth : imgHeight;
      const drawH = rotation % 180 === 0 ? imgHeight : imgWidth;
      ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    },
    [image, rotation, imgWidth, imgHeight],
  );

  // Render preview canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = viewW;
    canvas.height = viewH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawImage(ctx, viewW, viewH);

    // Draw crop overlay
    if (isCropping && dragStart && dragEnd) {
      const x = Math.min(dragStart.x, dragEnd.x);
      const y = Math.min(dragStart.y, dragEnd.y);
      const w = Math.abs(dragEnd.x - dragStart.x);
      const h = Math.abs(dragEnd.y - dragStart.y);

      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.clearRect(x, y, w, h);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
    }
  }, [image, drawImage, viewW, viewH, isCropping, dragStart, dragEnd]);

  // Mouse handlers for crop
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isCropping) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      setDragEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [isCropping],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isCropping || !dragStart) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDragEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [isCropping, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    if (!isCropping || !dragStart || !dragEnd) return;
    const x = Math.min(dragStart.x, dragEnd.x) / viewW;
    const y = Math.min(dragStart.y, dragEnd.y) / viewH;
    const w = Math.abs(dragEnd.x - dragStart.x) / viewW;
    const h = Math.abs(dragEnd.y - dragStart.y) / viewH;
    // Only set crop if selection is meaningful (> 10 px)
    if (w * viewW > 10 && h * viewH > 10) {
      setCrop({ x, y, w, h });
    }
    setDragStart(null);
    setDragEnd(null);
  }, [isCropping, dragStart, dragEnd, viewW, viewH]);

  function applyRotation(delta: number) {
    setRotation((r) => (r + delta + 360) % 360);
    setCrop(null);
    setDragStart(null);
    setDragEnd(null);
  }

  function resetAll() {
    setRotation(0);
    setIsCropping(false);
    setCrop(null);
    setDragStart(null);
    setDragEnd(null);
  }

  function applyChanges() {
    if (!image) return;
    // Compute final dimensions
    const finalW = crop ? Math.round(crop.w * displayWidth) : displayWidth;
    const finalH = crop ? Math.round(crop.h * displayHeight) : displayHeight;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, finalW);
    canvas.height = Math.max(1, finalH);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    // Apply rotation to the full image
    ctx.translate(displayWidth / 2, displayHeight / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(image, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);
    ctx.restore();

    // Crop
    if (crop) {
      const sx = crop.x * displayWidth;
      const sy = crop.y * displayHeight;
      const sw = crop.w * displayWidth;
      const sh = crop.h * displayHeight;
      // Extract the crop region into a new canvas
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = Math.max(1, Math.round(sw));
      cropCanvas.height = Math.max(1, Math.round(sh));
      const cropCtx = cropCanvas.getContext("2d");
      if (!cropCtx) return;
      cropCtx.drawImage(canvas, -sx, -sy);
      canvas.width = cropCanvas.width;
      canvas.height = cropCanvas.height;
      const finCtx = canvas.getContext("2d");
      if (!finCtx) return;
      finCtx.drawImage(cropCanvas, 0, 0);
    }

    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob);
      },
      "image/jpeg",
      0.90,
    );
  }

  return (
    <div className="space-y-3">
      {/* Canvas preview */}
      <div
        ref={displayRef}
        className="relative bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center"
        style={{ width: viewW, height: viewH }}
      >
        <canvas
          ref={canvasRef}
          className={`block ${isCropping ? "cursor-crosshair" : "cursor-default"}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        <button
          className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
          onClick={() => applyRotation(-90)}
          title="Rotate 90° CCW"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Rotate Left
        </button>
        <button
          className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
          onClick={() => applyRotation(90)}
          title="Rotate 90° CW"
        >
          <RotateCw className="w-3.5 h-3.5" /> Rotate Right
        </button>
        <button
          className={`btn text-xs py-1.5 px-3 flex items-center gap-1 ${
            isCropping ? "bg-blue-100 text-blue-700 border-blue-300" : "btn-secondary"
          }`}
          onClick={() => {
            setIsCropping((v) => !v);
            setDragStart(null);
            setDragEnd(null);
          }}
        >
          <Crop className="w-3.5 h-3.5" /> {isCropping ? "Done Cropping" : "Crop"}
        </button>
        {(rotation !== 0 || crop) && (
          <button
            className="btn btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
            onClick={resetAll}
          >
            <Undo2 className="w-3.5 h-3.5" /> Reset
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <button
          className="btn btn-secondary text-sm py-1.5 px-4 flex items-center gap-1.5"
          onClick={onCancel}
        >
          <X className="w-4 h-4" /> Cancel
        </button>
        <button
          className="btn btn-primary text-sm py-1.5 px-4 flex items-center gap-1.5"
          onClick={applyChanges}
        >
          <Check className="w-4 h-4" /> Apply
        </button>
      </div>
    </div>
  );
}
