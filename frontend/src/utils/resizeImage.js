/** Shrinks an image file to fit within maxDimension on its longest side, re-encoded as JPEG.
 * Used for document uploads, which (unlike vehicle photos) skip the crop dialog but still
 * benefit from not sending a multi-MB camera original over a possibly flaky mobile connection.
 * Falls back to the original file untouched if the browser can't decode or encode it. */
export async function resizeImageFile(file, maxDimension = 2000, quality = 0.85) {
  let url;
  try {
    url = URL.createObjectURL(file);
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image for resizing"));
      img.src = url;
    });

    let { naturalWidth: width, naturalHeight: height } = image;
    if (Math.max(width, height) > maxDimension) {
      const scale = maxDimension / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
