import { useRef, useState } from "react";
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

  const processNext = (files) => {
    if (files.length === 0) return;
    const [next, ...rest] = files;
    setQueue(rest);
    const url = URL.createObjectURL(next);
    objectUrlRef.current = url;
    activeFileRef.current = next;
    setActiveSrc(url);
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
