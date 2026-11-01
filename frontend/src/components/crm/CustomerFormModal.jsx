import { useState } from "react";
import CustomerForm from "./CustomerForm";
import { Modal, btnPrimary, btnGhost } from "./ui";

// Adding a customer. (Editing one happens inside their profile: see CustomerProfile.)
export default function CustomerFormModal({ customers, onClose, onSaved, onOpenExisting }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Add customer" subtitle="Add a customer or lead" size="lg" onClose={onClose} testid="customer-modal"
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Cancel</button>
        <button type="submit" form="customer-form" disabled={busy} className={btnPrimary} data-testid="customer-save">{busy ? "Saving..." : "Add customer"}</button>
      </>}>
      <CustomerForm formId="customer-form" mode="add" customers={customers} onSaved={onSaved} onBusy={setBusy} onOpenExisting={onOpenExisting} />
    </Modal>
  );
}
