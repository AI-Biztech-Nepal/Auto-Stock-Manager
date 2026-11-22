import { useRef } from "react";

// Lets a pop-up be closed by clicking the dark area around it: spread the result on the backdrop element
// (<div className="fixed inset-0 ..." {...backdrop}>). It closes only when the press AND the release both land on the
// backdrop itself, so selecting text inside the form and letting go outside it does not close the form, and a click
// inside the form (or in a pop-up opened over it) never does.
export default function useBackdropClose(onClose) {
  const pressedOnBackdrop = useRef(false);
  return {
    onMouseDown: (e) => { pressedOnBackdrop.current = e.target === e.currentTarget; },
    onClick: (e) => {
      const close = pressedOnBackdrop.current && e.target === e.currentTarget;
      pressedOnBackdrop.current = false;
      if (close) onClose();
    },
  };
}
