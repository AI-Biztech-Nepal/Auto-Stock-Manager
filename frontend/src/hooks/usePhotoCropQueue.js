import { useRef, useState } from "react";
import { toast } from "sonner";
import { getCroppedFile } from "../components/PhotoCropperModal";

/**
 * Feeds picked/dropped files through the crop dialog one at a time before
 * handing each cropped result to `onCropped`. Shared by the Add Vehicle
 * modal (which stages files) and the vehicle detail page (which uploads
 * immediately) so both go through the same 4:3 framing step.
 */
export function usePhotoCropQueue(onCropped) {
  const [queue, setQueue] = useState([]);
  const [activeSrc, setActiveSrc] = useState(null);
  const activeFileRef = useRef(null);
  const objectUrlRef = useRef(null);

  const cleanupActiveUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  // Gallery picks (unlike in-browser camera captures, which the browser always hands back
  // as a plain JPEG) can be formats the browser itself can't decode into an <img>/canvas --
  // HEIC/HEIF from an iPhone's photo library is the common case on Chrome/Firefox/Android,
  // which have no built-in HEIC codec. The crop <img> would then just sit broken with
  // "Use this photo" permanently disabled (croppedAreaPixels never arrives), so uploading
  // looked completely dead. Probe decodability first and skip straight to the raw file --
  // the backend already decodes/compresses HEIC itself (see _compress_photo) -- instead of
  // trapping the user in a cropper that can never confirm.
  const processNext = (files) => {
    if (files.length === 0) return;
    const [next, ...rest] = files;
    const url = URL.createObjectURL(next);
    const probe = new Image();
    probe.onload = () => {
      setQueue(rest);
      objectUrlRef.current = url;
      activeFileRef.current = next;
      setActiveSrc(url);
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      toast.info("Couldn't preview this photo for cropping -- uploading it as-is.");
      onCropped(next);
      processNext(rest);
    };
    probe.src = url;
  };

  const enqueueFiles = (fileList) => {
    const files = Array.from(fileList);
    processNext(files);
  };

  const cancelActive = () => {
    cleanupActiveUrl();
    setActiveSrc(null);
    activeFileRef.current = null;
    processNext(queue);
  };

  const confirmActive = async (croppedAreaPixels) => {
    const file = activeFileRef.current;
    const src = activeSrc;
    if (!file || !src) return;
    try {
      const croppedFile = await getCroppedFile(src, croppedAreaPixels, file.name);
      onCropped(croppedFile);
    } finally {
      cleanupActiveUrl();
      setActiveSrc(null);
      activeFileRef.current = null;
      processNext(queue);
    }
  };

  return { activeSrc, enqueueFiles, cancelActive, confirmActive };
}
