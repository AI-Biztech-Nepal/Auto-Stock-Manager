import { useEffect, useState } from "react";
import api from "../utils/api";

// The Team members who can be named as the seller of a vehicle: the sales staff and the front desk.
// Loaded once per page load and shared by everything that asks "Sold by" (the Sales forms and the CRM).
const SELLER_ROLES = ["sales", "frontdesk_admin"];
let cached = null;

const loadSellers = () => {
  if (!cached) {
    cached = api.get("/team", { suppressErrorToast: true })
      .then(r => r.data
        .filter(m => SELLER_ROLES.includes(m.role))
        .map(m => ({ id: m.id, name: (m.name || "").trim() }))
        .sort((a, b) => a.name.localeCompare(b.name)))
      .catch(() => { cached = null; return []; });
  }
  return cached;
};

export default function useSellers() {
  const [sellers, setSellers] = useState([]);
  useEffect(() => {
    let alive = true;
    loadSellers().then(list => { if (alive) setSellers(list); });
    return () => { alive = false; };
  }, []);
  return sellers;
}
