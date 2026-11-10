import { postWithRetry } from "./api";
import { resizeImageFile } from "./resizeImage";

// Paperwork photos picked in the vehicle form but not uploaded yet, by document type. Each entry is
// { file, previewUrl } (previewUrl is null for a PDF); the form saves the vehicle first, then uploads these.
export const EMPTY_DOC_PHOTOS = { bluebook: [], tax_clearance: [], transfer: [] };

export const flattenStagedDocs = (docPhotos) =>
  Object.entries(docPhotos).flatMap(([docType, list]) => list.map(d => ({ docType, ...d })));

export const revokeStagedDocs = (staged) => staged.forEach(d => d.previewUrl && URL.revokeObjectURL(d.previewUrl));

// Uploads them to the vehicle, the way the vehicle page does: a phone photo is shrunk first, a PDF goes as it is.
// Resolves to true when at least one upload failed.
export async function uploadStagedDocs(vehicleId, staged) {
  const results = await Promise.allSettled(staged.map(async d => {
    const upload = d.file.type.startsWith("image/") ? await resizeImageFile(d.file) : d.file;
    const fd = new FormData(); fd.append("file", upload); fd.append("doc_type", d.docType);
    return postWithRetry(`/vehicles/${vehicleId}/legal-documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
  }));
  return results.some(res => res.status === "rejected");
}
