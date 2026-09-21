/**
 * PhotoCropperModal.jsx — lets staff centre a vehicle photo in a fixed 4:3
 * frame before it's added to a listing, instead of relying on the storefront's
 * blind object-fit crop.
 */
import { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { ZoomIn } from "lucide-react";

/** Draws the cropped region onto a canvas and returns it as a JPEG File. */
export async function getCroppedFile(imageSrc, cropPixels, fileName, maxDimension = 1600, quality = 0.9) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for cropping"));
    img.src = imageSrc;
  });

  let width = cropPixels.width;
  let height = cropPixels.height;
  if (width > maxDimension) {
    height = (maxDimension / width) * height;
    width = maxDimension;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error("Failed to create cropped image")); return; }
        resolve(new File([blob], fileName.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      quality
    );
  });
}

export function PhotoCropperModal({ imageSrc, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const onCropComplete = useCallback((_area, pixels) => setCroppedAreaPixels(pixels), []);

  if (!imageSrc) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
            Position the vehicle in frame
          </h3>
          <button type="button" onClick={onCancel} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500">✕</button>
        </div>

        <div className="relative w-full aspect-[4/3] bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={4 / 3}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="p-4 pb-2 space-y-2">
          <div className="flex items-center gap-3">
            <ZoomIn size={16} className="text-slate-400 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
          </div>
          <p className="text-[11px] text-slate-400 text-center">Drag to reposition &middot; use the slider to zoom</p>
        </div>

        <div className="flex gap-3 p-4 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-11 border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!croppedAreaPixels}
            onClick={() => croppedAreaPixels && onConfirm(croppedAreaPixels)}
            className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60"
          >
            Use this photo
          </button>
        </div>
      </div>
    </div>
  );
}
