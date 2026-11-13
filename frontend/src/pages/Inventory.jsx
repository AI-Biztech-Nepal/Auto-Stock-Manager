import { useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import useMediaQuery from "../hooks/useMediaQuery";
import { Plus, Search, Trash2, Filter, X, EyeOff, Package, Wallet, DollarSign, Lock, Moon, Sparkles, Store, User, Wrench, Clock, CheckCircle2, AlertTriangle, ImageOff, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import api, { postWithRetry } from "../utils/api";
import { EMPTY_DOC_PHOTOS, flattenStagedDocs, revokeStagedDocs, uploadStagedDocs } from "../utils/stagedDocs";
import { formatNPR, getAgingStyle, getStatusStyle, getTerminationStyle, isSanakhatOverdue, sanakhatPendingDays, sanakhatDaysLeft, SANAKHAT_CYCLE_DAYS, SANAKHAT_WARN_DAYS, BRANDS, VEHICLE_STATUS_OPTIONS, formatOwnership } from "../utils/helpers";
import { AddVehicleModal } from "./AddVehicleModal";
import { VehicleDetailModal } from "./VehicleDetail";
import HoverADDate from "../components/HoverADDate";
import { formatBSDateNumeric } from "../utils/nepali-date";
import { BOOK_CARD, BookTableStyle } from "../components/BookTable";
import DateRangeFilter, { resolveDateFilter } from "../components/DateRangeFilter";
import ViewToggle, { useViewMode } from "../components/ViewToggle";
import LazyThumb from "../components/LazyThumb";
import { useAuth } from "../context/AuthContext";
import { hasFullVehicleAccess, canAddVehicle, isBasicStockRole, hidesVehiclePricing } from "../utils/permissions";

// Sold vehicles get their own archive (the Sold list on the Sales page) rather than sitting in the active
// pipeline grid, so "sold" is left out of this page's status filter entirely. Scrap has no
// dedicated toggle either — it's a do-not-disturb terminal stage, not something staff need
// to quick-filter to day to day; it's still reachable via "All Status".
const STATUSES = ["all", ...VEHICLE_STATUS_OPTIONS.filter(o => o.value !== "sold" && o.value !== "scrap").map(o => o.value)];
const STATUS_ICONS = { all: Filter, unlisted: EyeOff, in_repair: Wrench, available: CheckCircle2, reserved: Clock };
const AGING_CATEGORIES = ["all", "fresh", "normal", "slow", "dead"];
// Amounts in the vehicle table: no "Rs." prefix, to keep the columns narrow.
const rs = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n || 0));
const AGING_RANGES = { fresh: "0–30 days", normal: "31–45 days", slow: "46–60 days", dead: "60+ days" };

// A single photo isn't enough for a storefront listing — this is the bar a vehicle
// needs to clear before it's considered adequately photographed.
const MIN_PHOTOS = 2;

// Orders active stock newest first (most recently added). Scrap is a "do not disturb" stage —
// it's excluded from that ordering and always pinned to the bottom, regardless of how many days
// it has sat there.
const sortStock = (a, b) => {
  const aScrap = a.status === "scrap";
  const bScrap = b.status === "scrap";
  if (aScrap !== bScrap) return aScrap ? 1 : -1;
  return (a.aging?.days ?? 0) - (b.aging?.days ?? 0);
};

// The vehicle list arrives in two halves (see fetchVehicles); put them back together newest first, as the server sends one list.
const newestFirst = (list) => list.sort((a, b) => {
  const ca = a.created_at || "", cb = b.created_at || "";
  return ca < cb ? 1 : ca > cb ? -1 : 0;
});

const EMPTY = {
  brand: "", model: "", year: new Date().getFullYear(), engine_cc: 125, fuel_type: "Petrol", vehicle_type: "bike",
  ownership_number: "", purchase_price: "", purchase_date: "", purchase_source: "", purchase_from: "",
  vendor_id: null, linked_contact_type: "vendor", linked_contact_id: null, linked_contact_name: "",
  condition: "Good", color: "", registration_number: "", selling_price: "", notes: "", status: "available",
  bluebook_status: "pending", tax_clearance_status: "pending", transfer_status: "pending",
  ownership_termination_status: "pending"
};

export default function Inventory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = !user?.role || user.role === "admin";
  const isFrontDesk = user?.role === "stock_supervisor";
  const isSocialMedia = isBasicStockRole(user?.role);
  // Parts department and Social Media never see any pricing, selling price included.
  const hidePricing = hidesVehiclePricing(user?.role);
  const hideFinancials = isFrontDesk || hidePricing;
  const canManageStock = hasFullVehicleAccess(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [vehicles, setVehicles] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("aging") ? "available" : "all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [agingFilter, setAgingFilter] = useState(searchParams.get("aging") || "all");
  // Date-range filter over created_at (when the stock was entered, not purchase_date).
  // key "all" = off; otherwise resolved to an AD start/end by resolveDateFilter below.
  const [dateRange, setDateRange] = useState({ key: "all", custom: null });
  const [view, setView] = useViewMode();
  // null = off, "none" = zero photos, "low" = fewer than MIN_PHOTOS
  const [photoFilter, setPhotoFilter] = useState(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [photoMenuCoords, setPhotoMenuCoords] = useState(null); // { top, left } in viewport (fixed) coordinates
  const photoTriggerRef = useRef(null);
  const photoMenuRef = useRef(null);

  // The trigger sits in a horizontally-scrolling row (overflow-x-auto), which per the CSS
  // overflow spec forces overflow-y to auto too — so a plain absolutely-positioned dropdown
  // gets clipped and turns the whole row into a tiny scroll box instead of opening beside the
  // button. Rendering it through a portal at fixed viewport coordinates (same approach as
  // BSDatePicker's popover) sidesteps that clipping entirely.
  const positionPhotoMenu = useCallback(() => {
    const trigger = photoTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuWidth = 190;
    const menuHeight = photoMenuRef.current?.offsetHeight ?? 90;
    const gap = 6;

    const spaceRight = window.innerWidth - rect.right;
    const placeLeft = spaceRight < menuWidth + gap && rect.left > menuWidth + gap;
    const left = placeLeft
      ? Math.max(8, rect.left - menuWidth - gap)
      : Math.min(rect.right + gap, window.innerWidth - menuWidth - 8);
    const top = Math.min(Math.max(8, rect.top), window.innerHeight - menuHeight - 8);

    setPhotoMenuCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!photoMenuOpen) return;
    positionPhotoMenu();
  }, [photoMenuOpen, positionPhotoMenu]);

  useEffect(() => {
    if (!photoMenuOpen) return;
    const onClickOutside = (e) => {
      if (photoTriggerRef.current?.contains(e.target)) return;
      if (photoMenuRef.current?.contains(e.target)) return;
      setPhotoMenuOpen(false);
    };
    const onReposition = () => positionPhotoMenu();
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [photoMenuOpen, positionPhotoMenu]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState([]);
  // Paperwork photos staged in the Purchase form, by document type; uploaded once the vehicle is saved.
  const [docPhotos, setDocPhotos] = useState(EMPTY_DOC_PHOTOS);
  // Opening a vehicle renders VehicleDetailModal inline instead of navigating to /inventory/:id,
  // so the Inventory page underneath stays mounted (no refetch, no lost scroll/filter state).
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Flags registration numbers reused across more than one vehicle record — usually the same
  // vehicle logged twice by mistake, or a typo that collided with another plate. Left unnoticed
  // this silently inflates the on-screen vehicle count above what's physically in stock (or the
  // reverse: a real vehicle never got its own record because it was saved under a duplicate).
  // Compared with spaces/dashes/slashes/case stripped out, so "BA 2 PA 1234" and "BA-2-PA-1234"
  // are still caught as the same plate even though they don't match as exact strings.
  // A vehicle sold 30+ days ago that came back is re-entered as new stock under the same
  // plate, so its old sold record is skipped here (same rule as the backend).
  const duplicateRegGroups = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const byReg = {};
    for (const v of vehicles) {
      if (v.status === "sold" && v.sold_date && String(v.sold_date).slice(0, 10) < cutoff) continue;
      const norm = v.registration_number?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!norm) continue;
      (byReg[norm] ??= []).push(v);
    }
    return Object.values(byReg).filter(list => list.length > 1);
  }, [vehicles]);

  // Pairs the user has reviewed and dismissed from the banner (remembered in this browser).
  // Keyed by the group's vehicle ids, so a new vehicle joining a plate shows the banner again.
  const [dismissedDupKeys, setDismissedDupKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dismissedDupRegGroups") || "[]"); } catch { return []; }
  });
  const dupGroupKey = (vs) => vs.map(v => v.id).sort().join("|");
  const visibleDupGroups = duplicateRegGroups.filter(vs => !dismissedDupKeys.includes(dupGroupKey(vs)));
  const dismissDupBanner = () => {
    if (!window.confirm("Remove this warning? These vehicles won't be flagged again.")) return;
    const next = [...new Set([...dismissedDupKeys, ...visibleDupGroups.map(dupGroupKey)])];
    setDismissedDupKeys(next);
    try { localStorage.setItem("dismissedDupRegGroups", JSON.stringify(next)); } catch { /* storage unavailable */ }
  };

  // Vehicles with no registration number at all can't be checked for duplicates above, but
  // still occupy a slot in the stock count — worth a quick look when a count won't reconcile.
  const noRegVehicles = useMemo(
    () => vehicles.filter(v => v.status !== "sold" && !v.registration_number?.trim()),
    [vehicles]
  );

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recentlyAdded = vehicles
    .filter(v => v.created_at && new Date(v.created_at).getTime() >= oneDayAgo)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const totalInvestment = filtered.reduce((sum, v) => sum + (v.total_investment || 0), 0);
  const totalSellingPrice = filtered.reduce((sum, v) => sum + (v.selling_price || 0), 0);
  const lockedCapital = filtered.filter(v => v.status === "available").reduce((sum, v) => sum + (v.total_investment || 0), 0);

  // AD range for the active date filter, against created_at; null when the filter is off.
  const periodRange = dateRange.key === "all" ? null : resolveDateFilter(dateRange.key, dateRange.custom);

  // Same permission split the per-card finance row already uses — reused so the "Total
  // Vehicles" popup (the one summary tile parts_supervisor can actually reach) doesn't
  // leak investment/selling figures to a role the other three tiles are already hidden from.
  const showFinRow = !hideFinancials || !hidePricing;

  // Dedicated report popup for each summary tile above — null | "all" | "investment" | "locked" | "selling".
  const [summaryModalView, setSummaryModalView] = useState(null);
  const SUMMARY_MODAL_TITLE = { all: "All Vehicles", investment: "Total Investment", locked: "Locked Capital", selling: "Total Selling Price" };
  const summaryModalRows = useMemo(() => {
    if (summaryModalView === "investment") return [...filtered].sort((a, b) => (b.total_investment || 0) - (a.total_investment || 0));
    if (summaryModalView === "locked") return filtered.filter(v => v.status === "available").sort((a, b) => (b.total_investment || 0) - (a.total_investment || 0));
    if (summaryModalView === "selling") return filtered.filter(v => v.selling_price).sort((a, b) => (b.selling_price || 0) - (a.selling_price || 0));
    if (summaryModalView === "all") return filtered;
    return [];
  }, [filtered, summaryModalView]);

  // Counts per status toggle, applying every other active filter so switching tabs shows
  // what would actually appear rather than a total unaffected by search/brand/aging/date.
  // Scrap has no toggle of its own (it's a do-not-disturb terminal stage) and is deliberately
  // excluded from the "all" total below — it's still tracked for the investment it holds, and
  // still visible in the plain unfiltered list, it just shouldn't inflate the active stock count.
  const statusCounts = STATUSES.reduce((acc, s) => {
    let result = vehicles.filter(v => v.status !== "sold");
    if (s === "all") result = result.filter(v => v.status !== "scrap");
    else result = result.filter(v => v.status === s);
    if (agingFilter !== "all") result = result.filter(v => v.aging?.category === agingFilter);
    if (brandFilter !== "all") result = result.filter(v => v.brand === brandFilter);
    if (periodRange) result = result.filter(v => { const d = v.created_at?.slice(0, 10); return d && d >= periodRange.start && d <= periodRange.end; });
    if (photoFilter === "none") result = result.filter(v => !v.has_photo && v.status !== "scrap");
    else if (photoFilter === "low") result = result.filter(v => (v.photo_count ?? 0) < MIN_PHOTOS && v.status !== "scrap");
    if (search) {
      const q = search.toLowerCase();
      const qNoSlash = q.replace(/\//g, "");
      result = result.filter(v =>
        v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) ||
        v.registration_number?.toLowerCase().replace(/\//g, "").includes(qNoSlash) ||
        v.purchase_source?.toLowerCase().includes(q)
      );
    }
    acc[s] = result.length;
    return acc;
  }, {});

  // Count of vehicles missing a photo, applying every other active filter the same way
  // statusCounts does, so the toggle's badge matches what clicking it would actually show.
  // Scrap is excluded here too — same reasoning as the "all" status count above.
  const noPhotoCount = (() => {
    let result = vehicles.filter(v => v.status !== "sold" && v.status !== "scrap" && !v.has_photo);
    if (statusFilter !== "all") result = result.filter(v => v.status === statusFilter);
    if (agingFilter !== "all") result = result.filter(v => v.aging?.category === agingFilter);
    if (brandFilter !== "all") result = result.filter(v => v.brand === brandFilter);
    if (periodRange) result = result.filter(v => { const d = v.created_at?.slice(0, 10); return d && d >= periodRange.start && d <= periodRange.end; });
    if (search) {
      const q = search.toLowerCase();
      const qNoSlash = q.replace(/\//g, "");
      result = result.filter(v =>
        v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) ||
        v.registration_number?.toLowerCase().replace(/\//g, "").includes(qNoSlash) ||
        v.purchase_source?.toLowerCase().includes(q)
      );
    }
    return result.length;
  })();

  // Count of vehicles that fall short of MIN_PHOTOS (this includes the zero-photo vehicles
  // noPhotoCount already catches — a vehicle with 1 photo still isn't storefront-ready).
  // Scrap is excluded here too — same reasoning as the "all" status count above.
  const lowPhotoCount = (() => {
    let result = vehicles.filter(v => v.status !== "sold" && v.status !== "scrap" && (v.photo_count ?? 0) < MIN_PHOTOS);
    if (statusFilter !== "all") result = result.filter(v => v.status === statusFilter);
    if (agingFilter !== "all") result = result.filter(v => v.aging?.category === agingFilter);
    if (brandFilter !== "all") result = result.filter(v => v.brand === brandFilter);
    if (periodRange) result = result.filter(v => { const d = v.created_at?.slice(0, 10); return d && d >= periodRange.start && d <= periodRange.end; });
    if (search) {
      const q = search.toLowerCase();
      const qNoSlash = q.replace(/\//g, "");
      result = result.filter(v =>
        v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) ||
        v.registration_number?.toLowerCase().replace(/\//g, "").includes(qNoSlash) ||
        v.purchase_source?.toLowerCase().includes(q)
      );
    }
    return result.length;
  })();

  const stagedDocs = flattenStagedDocs(docPhotos);

  const clearStagedPhotos = () => {
    photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    revokeStagedDocs(stagedDocs);
    setDocPhotos(EMPTY_DOC_PHOTOS);
  };

  // Import Stock is its own page, so leaving the form for it asks first, as closing the form does.
  const importStock = () => {
    const dirty = photos.length > 0 || stagedDocs.length > 0 || JSON.stringify(form) !== JSON.stringify(EMPTY);
    if (dirty && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    navigate("/import-stock");
  };

  const closeAddModal = () => {
    const dirty = photos.length > 0 || stagedDocs.length > 0 || JSON.stringify(form) !== JSON.stringify(EMPTY);
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    setShowModal(false);
    setForm(EMPTY);
    clearStagedPhotos();
  };

  const fetchVehicles = useCallback(async () => {
    // The grid only shows unsold vehicles, so those load first and the page appears as soon as they arrive. Sold vehicles
    // (about half the list, and the slower half) only feed the duplicate-plate banner and the "this one was sold" hint
    // when searching, so they follow in the background and are merged in when they land. Both requests start together.
    const soldRequest = api.get("/vehicles", { params: { status: "sold" } });
    soldRequest.catch(() => {});  // handled below; this only keeps a failure from being reported twice
    try {
      const r = await api.get("/vehicles", { params: { exclude_status: "sold" } });
      setVehicles(prev => newestFirst([...r.data, ...prev.filter(v => v.status === "sold")]));  // keeps the sold ones already loaded
      // One-time migration: "hidden" was renamed to "unlisted" — silently carry over any leftover legacy records.
      const legacyHidden = r.data.filter(v => v.status === "hidden");
      if (legacyHidden.length > 0) {
        await Promise.allSettled(legacyHidden.map(v => api.put(`/vehicles/${v.id}`, { status: "unlisted" })));
        const r2 = await api.get("/vehicles", { params: { exclude_status: "sold" } });
        setVehicles(prev => newestFirst([...r2.data, ...prev.filter(v => v.status === "sold")]));
      }
    } catch { toast.error("Failed to load vehicles"); }
    finally { setLoading(false); }
    try {
      const rs = await soldRequest;
      setVehicles(prev => newestFirst([...prev.filter(v => v.status !== "sold"), ...rs.data]));
    } catch { /* the sold half only adds the duplicate warning and search hint; the page works without it */ }
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  // Sanaakhat (ownership termination) is a quick 3-state flag — cycle it straight from the
  // card chip (Pending → Yes → No → Pending) so staff don't have to open the vehicle just
  // to flip it. Optimistic; `filtered` re-derives from `vehicles` automatically.
  const cycleTermination = async (v) => {
    const order = { pending: "yes", yes: "no", no: "pending" };
    const current = v.ownership_termination_status || "pending";
    const next = order[current] || "pending";
    const label = { yes: "Yes", no: "No", pending: "Pending" }[next];
    setVehicles(prev => prev.map(x => (x.id === v.id ? { ...x, ownership_termination_status: next } : x)));
    try {
      await api.put(`/vehicles/${v.id}`, { ownership_termination_status: next });
      toast.success(`Sanaakhat set to ${label}`);
    } catch {
      setVehicles(prev => prev.map(x => (x.id === v.id ? { ...x, ownership_termination_status: current } : x)));
      toast.error("Couldn't update Sanaakhat");
    }
  };

  useEffect(() => {
    // Sold vehicles live in the Sales page's Sold list, not the active inventory grid.
    let result = vehicles.filter(v => v.status !== "sold");

    if (statusFilter !== "all") result = result.filter(v => v.status === statusFilter);
    if (agingFilter !== "all") result = result.filter(v => v.aging?.category === agingFilter);
    if (brandFilter !== "all") result = result.filter(v => v.brand === brandFilter);
    if (periodRange) result = result.filter(v => { const d = v.created_at?.slice(0, 10); return d && d >= periodRange.start && d <= periodRange.end; });
    if (photoFilter === "none") result = result.filter(v => !v.has_photo && v.status !== "scrap");
    else if (photoFilter === "low") result = result.filter(v => (v.photo_count ?? 0) < MIN_PHOTOS && v.status !== "scrap");
    if (search) {
      const q = search.toLowerCase();
      const qNoSlash = q.replace(/\//g, "");
      result = result.filter(v =>
        v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) ||
        v.registration_number?.toLowerCase().replace(/\//g, "").includes(qNoSlash) ||
        v.purchase_source?.toLowerCase().includes(q)
      );
    }

    result.sort(sortStock);

    setFiltered(result);
  }, [vehicles, search, statusFilter, brandFilter, agingFilter, dateRange, photoFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- periodRange is derived fresh from dateRange each render (a new object every time), so depending on dateRange itself is the stable, correct trigger

  // Sold vehicles are kept out of this grid, so a search for one would otherwise just read
  // "No vehicles found" — surface the sold matches so it's clear the vehicle was sold.
  const soldSearchMatches = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    const qNoSlash = q.replace(/\//g, "");
    return vehicles.filter(v =>
      v.status === "sold" && (
        v.brand?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q) ||
        v.registration_number?.toLowerCase().replace(/\//g, "").includes(qNoSlash)
      )
    );
  }, [vehicles, search]);

  const handleSave = async (e, confirmReusedRegistration = false) => {
    e.preventDefault();
    // Social Media adds basic details only -- purchase info is left for an admin to fill in.
    const needsPurchaseInfo = !isSocialMedia;
    if (!form.brand || !form.model || !form.registration_number || (needsPurchaseInfo && (!form.purchase_price || !form.purchase_date || !form.purchase_source))) {
      toast.error("Please fill all required fields"); return;
    }
    setSaving(true);
    try {
      const r = await api.post("/vehicles", {
        ...form,
        purchase_price: Number(form.purchase_price),
        selling_price: form.selling_price ? Number(form.selling_price) : null,
        sanakhat_date: form.sanakhat_date || null,
        sanakhat_cost: form.sanakhat_cost ? Number(form.sanakhat_cost) : null,
        year: Number(form.year),
        engine_cc: Number(form.engine_cc),
        ownership_number: form.ownership_number ? Number(form.ownership_number) : null,
        confirm_reused_registration: confirmReusedRegistration
      });
      if (photos.length > 0) {
        const results = await Promise.allSettled(photos.map(p => {
          const fd = new FormData(); fd.append("file", p.file);
          return postWithRetry(`/vehicles/${r.data.id}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        }));
        if (results.some(res => res.status === "rejected")) toast.error("Vehicle saved, but some photos failed to upload");
      }
      if (stagedDocs.length > 0 && await uploadStagedDocs(r.data.id, stagedDocs)) {
        toast.error("Vehicle saved, but some paperwork photos failed to upload. Add them from the vehicle page.");
      }
      toast.success("Vehicle added successfully!");
      setShowModal(false);
      setForm(EMPTY);
      clearStagedPhotos();
      fetchVehicles();
      setSaving(false);
    } catch (err) {
      setSaving(false);
      const detail = err.response?.data?.detail;
      // The backend only asks this when the plate's existing record is already closed out
      // (sold/scrapped) — genuinely ambiguous between a buyback and a typo — so confirming
      // here re-submits the exact same form, just flagged as intentional. No `finally` here:
      // the recursive confirmed re-submit manages its own `saving` state, and a shared
      // finally would race it and flip the button back on mid-save.
      if (err.response?.status === 409 && detail?.code === "duplicate_registration_closed") {
        if (window.confirm(detail.message)) handleSave(e, true);
        return;
      }
      toast.error(typeof detail === "string" ? detail : "Failed to save");
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this vehicle and all related data?")) return;
    try {
      await api.delete(`/vehicles/${id}`);
      toast.success("Vehicle deleted");
      fetchVehicles();
    } catch { toast.error("Failed to delete"); }
  };

  // The vehicle table's columns and their share of the card's width (colgroup below). Roles that don't see some
  // money, or can't delete, lose those columns and the rest share the room.
  const tableCols = [
    { key: "sn", w: 4 }, { key: "vehicle", w: 15 }, { key: "brand", w: 9 }, { key: "bike", w: 9 },
    ...(hideFinancials ? [] : [{ key: "purchase", w: 8 }, { key: "repair", w: 7 }, { key: "cost", w: 9 }]),
    ...(hidePricing ? [] : [{ key: "selling", w: 8 }]),
    { key: "sanakhat", w: 9 }, { key: "status", w: 9 }, { key: "stock", w: 8 },
    ...(isAdmin ? [{ key: "actions", w: 5 }] : []),
  ];
  const tableColsTotal = tableCols.reduce((n, c) => n + c.w, 0);
  const wideScreen = useMediaQuery("(min-width: 640px)");
  const { topbarSlot } = useOutletContext() || {};
  const viewControls = (
    <>
      <DateRangeFilter value={dateRange.key} custom={dateRange.custom} onChange={(key, custom) => setDateRange({ key, custom })} testid="inventory-date-filter" />
      <ViewToggle view={view} onChange={setView} testid="inventory-view-toggle" />
    </>
  );
  const sanakhatOverdue = vehicles.filter(isSanakhatOverdue).sort((a, b) => sanakhatPendingDays(b) - sanakhatPendingDays(a));

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Date range and Cards / List: up in the top bar on wide screens, here on phones */}
      {wideScreen && topbarSlot
        ? createPortal(viewControls, topbarSlot)
        : <div className="flex items-center justify-end gap-2 flex-wrap">{viewControls}</div>}

      {/* Sanaakhat pending past 30 days */}
      {canManageStock && sanakhatOverdue.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50" data-testid="sanakhat-overdue-banner">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {sanakhatOverdue.length} vehicle{sanakhatOverdue.length !== 1 ? "s" : ""} with Sanaakhat pending over {SANAKHAT_WARN_DAYS} days
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {sanakhatOverdue.map(v => (
                <button key={v.id} type="button" onClick={() => setSelectedVehicleId(v.id)} className="px-2 py-1 rounded-full bg-white border border-amber-200 text-xs text-amber-900 hover:bg-amber-100 transition-colors">
                  {v.brand} {v.model}{v.registration_number ? ` · ${v.registration_number}` : ""} · {sanakhatPendingDays(v)}d
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Registration Number Alert */}
      {canManageStock && visibleDupGroups.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50" data-testid="duplicate-reg-banner">
          <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700">
              {visibleDupGroups.length} registration number{visibleDupGroups.length !== 1 ? "s" : ""} used on more than one vehicle
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Same vehicle logged twice, or a typo reusing another plate — a likely cause of the stock count not matching what's on hand. Matched even when spacing/dashes/case differ, so a plate typed two different ways still shows up here. Review each pair below.
            </p>
            <div className="mt-2.5 space-y-2">
              {visibleDupGroups.map(vs => (
                <div key={vs.map(v => v.id).join("-")} className="flex items-center gap-2 flex-wrap">
                  {vs.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVehicleId(v.id)}
                      data-testid="duplicate-reg-vehicle"
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-red-200 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                    >
                      <span className="font-mono font-semibold">{v.registration_number}</span>
                      <span className="text-red-400">·</span>
                      {v.brand} {v.model} · {getStatusStyle(v.status).label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={dismissDupBanner}
            title="Remove this warning"
            data-testid="duplicate-reg-dismiss"
            className="max-md:min-w-11 max-md:min-h-11 max-md:inline-flex max-md:items-center max-md:justify-center p-1 rounded-lg text-red-400 hover:text-red-700 hover:bg-red-100 transition-colors shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Missing Registration Number Alert — these can't be checked for duplicates above,
          but each still occupies a slot in the active stock count. */}
      {canManageStock && noRegVehicles.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50" data-testid="no-reg-banner">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {noRegVehicles.length} vehicle{noRegVehicles.length !== 1 ? "s" : ""} in active stock with no registration number
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Can't be checked against the duplicate list above — worth a manual check if your stock count won't reconcile with paper records.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {noRegVehicles.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVehicleId(v.id)}
                  data-testid="no-reg-vehicle"
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-amber-200 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  {v.brand} {v.model} · {getStatusStyle(v.status).label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Active Aging Filter Banner */}
      {agingFilter !== "all" && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium border ${getAgingStyle(agingFilter).bg} ${getAgingStyle(agingFilter).border} ${getAgingStyle(agingFilter).text}`} data-testid="aging-filter-banner">
          <span>
            Showing: <strong>{getAgingStyle(agingFilter).label} ({AGING_RANGES[agingFilter]})</strong>
          </span>
          <button
            data-testid="clear-aging-filter"
            onClick={() => { setAgingFilter("all"); setSearchParams({}); }}
            className="flex items-center gap-1 ml-3 hover:opacity-70 transition-opacity"
          >
            <X size={14} /> Clear filter
          </button>
        </div>
      )}

      {/* One line: the six status chips at the left, Purchase Vehicle at the right end (on phones it drops under the
          chips, full width). Import Stock lives inside the Purchase Vehicle form. */}
      <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 overflow-x-auto min-w-0" data-testid="status-toggle-group">
        {STATUSES.map(s => {
          const active = statusFilter === s;
          const Icon = STATUS_ICONS[s] || Filter;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              data-testid={`status-toggle-${s}`}
              className={`flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon size={13} />
              {s === "all" ? "All Status" : getStatusStyle(s).label}
              <span className={`text-[11px] px-1.5 rounded-full ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {statusCounts[s]}
              </span>
            </button>
          );
        })}
        <button
          ref={photoTriggerRef}
          onClick={() => setPhotoMenuOpen(o => !o)}
          data-testid="photo-filter-toggle"
          title="Filter by photo coverage"
          className={`flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
            photoFilter ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <ImageOff size={13} />
          Photo Filter
          <span className={`text-[11px] px-1.5 rounded-full ${photoFilter ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
            {photoFilter === "none" ? noPhotoCount : lowPhotoCount}
          </span>
          <ChevronDown size={13} className={photoMenuOpen ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      </div>
      <div className="flex items-center gap-1.5 w-full lg:w-auto shrink-0" data-testid="inventory-actions">
          {canAddVehicle(user?.role) && (
            <button
              onClick={() => { setForm(EMPTY); setShowModal(true); }}
              data-testid="add-vehicle-button"
              className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-2.5 h-8 rounded-lg transition-all active:scale-95 shadow-sm"
            >
              <Plus size={14} /> Purchase Vehicle
            </button>
          )}
      </div>
      </div>

      {photoMenuOpen && photoMenuCoords && createPortal(
        <div
          ref={photoMenuRef}
          className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-2xl py-1 min-w-[190px]"
          style={{ top: photoMenuCoords.top, left: photoMenuCoords.left }}
          data-testid="photo-filter-menu"
        >
          <button
            type="button"
            data-testid="photo-filter-option-none"
            onClick={() => { setPhotoFilter(p => p === "none" ? null : "none"); setPhotoMenuOpen(false); }}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50 ${photoFilter === "none" ? "text-blue-600 font-semibold" : "text-slate-700"}`}
          >
            No Photos
            <span className="text-xs text-slate-400">{noPhotoCount}</span>
          </button>
          <button
            type="button"
            data-testid="photo-filter-option-low"
            onClick={() => { setPhotoFilter(p => p === "low" ? null : "low"); setPhotoMenuOpen(false); }}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50 ${photoFilter === "low" ? "text-blue-600 font-semibold" : "text-slate-700"}`}
          >
            Min {MIN_PHOTOS} Photos
            <span className="text-xs text-slate-400">{lowPhotoCount}</span>
          </button>
        </div>,
        document.body
      )}

      {/* Filters — sticky so search/filters stay reachable while scrolling a long list */}
      <div className="sm:sticky top-0 z-20 bg-white rounded-xl border border-slate-200 shadow-sm p-2 flex flex-wrap gap-2 sm:gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search brand, model, reg#..."
            className="w-full h-8 pl-9 pr-3 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
          <Filter size={14} className="hidden sm:block text-slate-400" />
          <select
            value={brandFilter}
            onChange={e => setBrandFilter(e.target.value)}
            className="h-11 sm:h-8 px-2.5 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Brands</option>
            {BRANDS.map(b => <option key={b}>{b}</option>)}
          </select>
          <select
            value={agingFilter}
            onChange={e => {
              const val = e.target.value;
              setAgingFilter(val);
              if (val === "all") setSearchParams({});
              else setSearchParams({ aging: val });
            }}
            data-testid="aging-filter-select"
            className="h-11 sm:h-8 px-2.5 text-[13px] border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {AGING_CATEGORIES.map(a => (
              <option key={a} value={a}>{a === "all" ? "All Stock Age" : `${getAgingStyle(a).label} (${AGING_RANGES[a]})`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary: one slim strip, so the vehicles start near the top of the page */}
      {!loading && !isFrontDesk && (
        <div className="grid grid-cols-2 lg:grid-flow-col lg:auto-cols-fr gap-px bg-slate-200 rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {[
            { label: "Total Vehicles", value: filtered.length, icon: Package, color: "text-blue-600", view: "all" },
            !hideFinancials && { label: "Total Investment", value: formatNPR(totalInvestment), icon: Wallet, color: "text-indigo-600", view: "investment" },
            !hideFinancials && { label: "Locked Capital", value: formatNPR(lockedCapital), icon: Lock, color: "text-purple-600", view: "locked" },
            !hidePricing && { label: "Total Selling Price", value: formatNPR(totalSellingPrice), icon: DollarSign, color: "text-green-600", view: "selling" },
          ].filter(Boolean).map(c => (
            <button
              type="button"
              key={c.label}
              onClick={() => setSummaryModalView(c.view)}
              data-testid={`inventory-summary-tile-${c.view}`}
              className="bg-white px-3 py-1.5 flex items-center gap-2 min-w-0 text-left hover:bg-slate-50 transition-colors"
            >
              <c.icon size={14} className={`${c.color} shrink-0`} />
              <span className="min-w-0">
                <span className="block text-[10px] text-slate-500 font-medium truncate">{c.label}</span>
                <span className="block text-[13px] font-bold text-slate-900 leading-tight" style={{ fontFamily: "Manrope" }}>{c.value}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Recently Added Highlight */}
      {!loading && !isFrontDesk && statusFilter === "all" && recentlyAdded.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-3" data-testid="recently-added-section">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-amber-600" />
            <h2 className="text-sm font-bold text-amber-900">Recently Added</h2>
            <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              {recentlyAdded.length} in the last 24 hours
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recentlyAdded.map(v => {
              const st = getStatusStyle(v.status);
              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVehicleId(v.id)}
                  data-testid="recently-added-card"
                  className="shrink-0 w-48 bg-white rounded-lg border border-amber-100 shadow-sm p-2.5 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-bold text-slate-900 text-sm truncate" style={{ fontFamily: "Manrope" }}>{v.brand} {v.model}</div>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${st.bg} ${st.text}`}>
                      {st.label}
                    </span>
                  </div>
                  {v.registration_number && <div className="text-xs font-mono text-slate-500 mb-1">{v.registration_number}</div>}
                  {(v.linked_contact_name || v.purchase_from) && (
                    <div className="text-xs text-slate-500 mb-1 flex items-center gap-1 truncate">
                      {v.linked_contact_name
                        ? (v.linked_contact_type === "customer" ? <User size={11} className="text-slate-400 shrink-0" /> : <Store size={11} className="text-slate-400 shrink-0" />)
                        : <Store size={11} className="text-slate-400 shrink-0" />}
                      <span className="truncate">{v.linked_contact_name || v.purchase_from}</span>
                    </div>
                  )}
                  <div className="text-xs text-slate-500">Added: <HoverADDate date={v.created_at?.slice(0, 10)} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vehicle Cards */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center h-48 text-slate-500" data-testid="empty-state">
          <p className="font-medium">
            {agingFilter !== "all"
              ? `No ${getAgingStyle(agingFilter).label.toLowerCase()} (${AGING_RANGES[agingFilter]}) vehicles found`
              : dateRange.key !== "all"
                ? `No stock entered in this period (${periodRange?.label || "selected dates"})`
                : "No vehicles found"}
          </p>
          <p className="text-sm mt-1">
            {agingFilter !== "all"
              ? "No vehicles fall into this stock age range right now."
              : search || statusFilter !== "all" || brandFilter !== "all" || dateRange.key !== "all" || photoFilter
                ? "Try adjusting your filters"
                : "Add your first vehicle to get started"}
          </p>
          {search && soldSearchMatches.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 px-4" data-testid="sold-search-matches">
              {soldSearchMatches.slice(0, 5).map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVehicleId(v.id)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-50 border border-green-200 text-xs font-medium text-green-800 hover:bg-green-100 transition-colors"
                >
                  <span className="font-bold uppercase">Sold</span>
                  {v.brand} {v.model}{v.registration_number ? ` · ${v.registration_number}` : ""}
                </button>
              ))}
            </div>
          )}
          {agingFilter !== "all" && (
            <button
              onClick={() => { setAgingFilter("all"); setSearchParams({}); }}
              className="mt-3 text-sm text-blue-600 hover:underline"
              data-testid="empty-clear-filter"
            >
              View all vehicles
            </button>
          )}
        </div>
      ) : view === "list" ? (
        <div className={`${BOOK_CARD} compact`} data-testid="vehicle-table">
          <BookTableStyle />
          <div className="overflow-x-auto">
            <table className="fixed-cols" style={{ minWidth: "56rem" }}>
              <colgroup>
                {tableCols.map(c => <col key={c.key} style={{ width: `${(c.w / tableColsTotal * 100).toFixed(2)}%` }} />)}
              </colgroup>
              <thead>
                <tr data-testid="vehicle-list-header">
                  <th>SN</th>
                  <th>Vehicle</th>
                  <th>Brand</th>
                  <th>Bike No.</th>
                  {!hideFinancials && <th className="text-right" title="Amount in Rs.">Purchase Price</th>}
                  {!hideFinancials && <th className="text-right" title="In Rs.: expenses, job cards, accessories and Sanakhat cost added after buying">Repair Price</th>}
                  {!hideFinancials && <th className="text-right" title="In Rs.: purchase + repair">Cost Price</th>}
                  {!hidePricing && <th className="text-right" title="Amount in Rs.">Selling Price</th>}
                  <th title={`Once done, the days left until it is due again (every ${SANAKHAT_CYCLE_DAYS} days)`}>Sanakhat</th>
                  <th>Status</th>
                  <th title="How long it has been in stock: days since it was bought, and its stock-age group">Stock Age</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => {
                  const ag = getAgingStyle(v.aging?.category);
                  const st = getStatusStyle(v.status);
                  const tm = getTerminationStyle(v.ownership_termination_status);
                  const late = isSanakhatOverdue(v);
                  const pendingDays = sanakhatPendingDays(v);
                  const daysLeft = sanakhatDaysLeft(v);
                  const photo = v.thumb_photos?.[0];
                  const purchase = v.purchase_price || 0;
                  const repair = Math.max(0, (v.total_investment || 0) - purchase);
                  const pill = "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold uppercase whitespace-nowrap";
                  const money = "text-right whitespace-nowrap";
                  const doneNoDate = v.ownership_termination_status === "yes" && v.status !== "sold" && v.status !== "scrap" && !(v.sanakhat_date || "").slice(0, 10);
                  return (
                    <tr
                      key={v.id}
                      data-testid="vehicle-row"
                      onClick={() => setSelectedVehicleId(v.id)}
                      className={`cursor-pointer ${v.status === "scrap" ? "opacity-60 saturate-50" : ""}`}
                    >
                      <td className="text-gray-500">{i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg overflow-hidden border border-gray-200 shrink-0 bg-gray-50 flex items-center justify-center">
                            {photo ? <LazyThumb src={photo.thumb || photo.url} /> : <Package size={14} className="text-gray-300" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate" style={{ fontFamily: "Manrope" }}>{v.model}</div>
                            <div className="text-[11px] text-gray-500 truncate">
                              {v.year} · {formatOwnership(v.ownership_number)}{v.status === "reserved" && v.booking?.customer_name ? ` · Booked by ${v.booking.customer_name}` : ""}{isAdmin && v.created_by ? ` · by ${v.created_by}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap font-medium text-gray-700">{v.brand || <span className="text-gray-300">—</span>}</td>
                      <td className="font-mono text-xs whitespace-nowrap text-gray-700">{v.registration_number || <span className="font-sans text-xs text-gray-400">No reg.</span>}</td>
                      {!hideFinancials && <td className={money}>{rs(purchase)}</td>}
                      {!hideFinancials && <td className={money}>{repair > 0 ? rs(repair) : <span className="text-gray-300">—</span>}</td>}
                      {!hideFinancials && <td className={`${money} font-bold`}>{rs(purchase + repair)}</td>}
                      {!hidePricing && <td className={money}>{v.selling_price ? rs(v.selling_price) : <span className="text-gray-300">—</span>}</td>}
                      {/* Sanakhat: Done shows the day it was done and the days left until it is due again, Pending the days it has waited */}
                      <td data-testid="vehicle-row-sanakhat">
                        <span
                          className={`${pill} ${late ? "bg-red-100 text-red-800" : `${tm.bg} ${tm.text}`}`}
                          title={late ? `Sanaakhat pending for ${pendingDays} days` : undefined}
                          data-testid="vehicle-row-termination"
                        >
                          {tm.label.replace("Sanaakhat: ", "")}
                        </span>
                        {late && <div className="mt-0.5 text-[11px] leading-tight font-semibold text-red-600">{pendingDays}d waiting</div>}
                        {daysLeft !== null && (
                          <div
                            className={`mt-0.5 text-[11px] leading-tight font-semibold ${daysLeft < 0 ? "text-red-600" : daysLeft <= 7 ? "text-amber-600" : "text-gray-500"}`}
                            title={`Sanaakhat has to be done again every ${SANAKHAT_CYCLE_DAYS} days`}
                            data-testid="vehicle-row-sanakhat-left"
                          >
                            <div>{formatBSDateNumeric(v.sanakhat_date.slice(0, 10))}</div>
                            <div>{daysLeft < 0 ? `${-daysLeft}d overdue` : daysLeft === 0 ? "due today" : `${daysLeft}d left`}</div>
                          </div>
                        )}
                        {doneNoDate && (
                          <div className="mt-0.5 text-[11px] font-semibold text-amber-600" title="Marked Done but no date was saved. Set it on the Sanakhat page, or Edit the vehicle." data-testid="vehicle-row-sanakhat-nodate">
                            no date saved
                          </div>
                        )}
                      </td>
                      <td><span className={`${pill} ${st.bg} ${st.text}`}>{st.label}</span></td>
                      <td className="whitespace-nowrap">
                        <span className={`${pill} ${ag.bg} ${ag.text}`} title={`${v.aging?.days} days in stock · ${ag.label}`}>{v.aging?.days}d</span>
                        <div className="mt-0.5 text-[10px] leading-tight text-gray-500">{ag.label}</div>
                      </td>
                      {isAdmin && (
                        <td onClick={e => e.stopPropagation()}>
                          <button onClick={e => handleDelete(v.id, e)} className="w-8 h-8 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors" data-testid="delete-vehicle-btn">
                            <Trash2 size={14} className="text-red-400" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(v => {
            const ag = getAgingStyle(v.aging?.category);
            const st = getStatusStyle(v.status);
            const tm = getTerminationStyle(v.ownership_termination_status);
            const showFinRow = !hideFinancials || !hidePricing;
            const isDND = v.status === "scrap";
            return (
              <div
                key={v.id}
                data-testid="vehicle-row"
                onClick={() => setSelectedVehicleId(v.id)}
                style={{ contentVisibility: "auto", containIntrinsicSize: "auto 340px" }}
                className={`${st.cardBg} min-w-0 overflow-hidden rounded-xl border ${st.cardBorder} shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer ${isDND ? "opacity-60 saturate-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 text-sm truncate" style={{ fontFamily: "Manrope" }}>{v.brand} {v.model}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{v.year} · {v.engine_cc}cc · {v.fuel_type} · {formatOwnership(v.ownership_number)}</div>
                    {v.registration_number && <div className="text-xs font-mono text-slate-500 mt-0.5">{v.registration_number}</div>}
                    {isAdmin && v.created_by && <div className="text-[11px] text-slate-400 mt-0.5" data-testid="vehicle-author">Added by {v.created_by}</div>}
                  </div>
                  <span className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${st.bg} ${st.text}`}>
                      {isDND && <Moon size={11} title="Do Not Disturb — snoozed" />}
                      {st.label}
                    </span>
                    {canManageStock ? (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); cycleTermination(v); }}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide cursor-pointer transition hover:brightness-95 active:scale-95 ${isSanakhatOverdue(v) ? "bg-red-100 text-red-800" : `${tm.bg} ${tm.text}`}`}
                        title="Click to change Sanaakhat (Pending → Yes → No)"
                        data-testid="vehicle-card-termination"
                      >
                        {tm.label}{isSanakhatOverdue(v) && ` · ${sanakhatPendingDays(v)}d`}
                      </button>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${tm.bg} ${tm.text}`} data-testid="vehicle-card-termination">
                        {tm.label}
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${ag.bg} ${ag.text}`}>
                      {v.aging?.days}d · {ag.label}
                    </span>
                  </span>
                </div>

                {v.status === "reserved" && (
                  <div className="text-xs text-yellow-900 bg-yellow-100 border border-yellow-200 rounded-lg px-2.5 py-1.5 mb-3" data-testid="vehicle-card-booking">
                    {v.booking
                      ? <>Booked by <span className="font-semibold">{v.booking.customer_name || "customer"}</span>{v.booking.booking_amount != null && <> · {formatNPR(v.booking.booking_amount)} deposit</>}{v.booking.booking_date && <> · <HoverADDate date={v.booking.booking_date} /></>}</>
                      : "Reserved"}
                  </div>
                )}
                <div className="text-xs text-slate-500 mb-3">
                  Source: <span className="font-medium text-slate-700">{v.purchase_source || "—"}</span>
                </div>
                <div className="text-xs text-slate-500 mb-1">Purchased: <span className="font-medium text-slate-700"><HoverADDate date={v.purchase_date} /></span></div>
                {(v.linked_contact_name || v.purchase_from) && (
                  <div className="text-xs text-slate-500 mb-3 flex items-center gap-1 truncate">
                    {v.linked_contact_name
                      ? (v.linked_contact_type === "customer" ? <User size={11} className="text-slate-400 shrink-0" /> : <Store size={11} className="text-slate-400 shrink-0" />)
                      : <Store size={11} className="text-slate-400 shrink-0" />}
                    <span className="truncate">Vendor/Customer: <span className="font-medium text-slate-700">{v.linked_contact_name || v.purchase_from}</span></span>
                  </div>
                )}

                {showFinRow && (
                  <div className="grid grid-cols-2 sm:flex gap-x-4 gap-y-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 mb-3 text-xs">
                    {!hideFinancials && (
                      <div>
                        <div className="text-slate-400">Investment</div>
                        <div className="font-semibold text-slate-800">{formatNPR(v.total_investment)}</div>
                      </div>
                    )}
                    {!hidePricing && (
                      <div>
                        <div className="text-slate-400">Selling</div>
                        <div className="font-semibold text-slate-800">{v.selling_price ? formatNPR(v.selling_price) : "—"}</div>
                      </div>
                    )}
                    {!hidePricing && (
                      <div>
                        <div className="text-slate-400">Min. Selling</div>
                        <div className="font-semibold text-slate-800">{v.minimum_selling_price ? formatNPR(v.minimum_selling_price) : "—"}</div>
                      </div>
                    )}
                    {!hideFinancials && (
                      <div>
                        <div className="text-slate-400">Margin</div>
                        <div className={`font-semibold ${v.low_margin ? "text-red-600" : "text-green-600"}`}>
                          {v.profit_margin !== null && v.profit_margin !== undefined ? `${v.profit_margin}%` : "—"}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-50">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {[0, 1, 2].map(i => {
                      const photo = v.thumb_photos?.[i];
                      return photo ? (
                        <button
                          key={photo.id}
                          type="button"
                          onClick={e => { e.stopPropagation(); setPreviewPhoto(photo.url); }}
                          className="w-11 h-11 rounded-lg overflow-hidden border border-slate-200 shrink-0"
                          data-testid="vehicle-card-photo"
                        >
                          <LazyThumb src={photo.thumb || photo.url} />
                        </button>
                      ) : (
                        <div key={i} className="w-11 h-11 rounded-lg border border-dashed border-slate-200 shrink-0" />
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && (
                      <button
                        onClick={e => handleDelete(v.id, e)}
                        className="w-11 h-11 flex items-center justify-center hover:bg-red-50 rounded-lg transition-colors"
                        data-testid="delete-vehicle-btn"
                      >
                        <Trash2 size={15} className="text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Vehicle Modal */}
      {showModal && (
        <AddVehicleModal
          form={form}
          setForm={setForm}
          onClose={closeAddModal}
          onSubmit={handleSave}
          saving={saving}
          photos={photos}
          setPhotos={setPhotos}
          docPhotos={docPhotos}
          setDocPhotos={setDocPhotos}
          basicOnly={isSocialMedia}
          onImport={isAdmin ? importStock : undefined}
          vehicles={vehicles}
        />
      )}

      {/* Vehicle View/Edit Modal — rendered inline (not via route navigation) so this page
          stays mounted underneath: no refetch, no lost scroll position or filters while open. */}
      {selectedVehicleId && (
        <VehicleDetailModal
          id={selectedVehicleId}
          onClose={() => { setSelectedVehicleId(null); fetchVehicles(); }}
        />
      )}

      {previewPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewPhoto(null)}>
          <button onClick={() => setPreviewPhoto(null)} className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white">✕</button>
          <img src={previewPhoto} alt="Vehicle full size" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Dedicated report popup for each Summary tile — same rows filtered/sorted per
          tile (see summaryModalRows), clicking a row opens that vehicle the same way
          the grid below does. */}
      {summaryModalView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSummaryModalView(null)}
          data-testid="inventory-summary-modal-backdrop"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
            data-testid="inventory-summary-modal"
          >
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900">{SUMMARY_MODAL_TITLE[summaryModalView]}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{summaryModalRows.length} vehicle{summaryModalRows.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                {summaryModalView !== "all" && (
                  <div className="text-right">
                    <div
                      className={`text-sm font-bold ${summaryModalView === "selling" ? "text-green-700" : summaryModalView === "locked" ? "text-purple-700" : "text-indigo-700"}`}
                      data-testid="inventory-summary-modal-total"
                    >
                      Total: {formatNPR(
                        summaryModalView === "investment" ? totalInvestment
                          : summaryModalView === "locked" ? lockedCapital
                          : totalSellingPrice
                      )}
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setSummaryModalView(null)}
                  className="w-11 h-11 -mr-2.5 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 shrink-0"
                  data-testid="close-inventory-summary-modal"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="overflow-y-auto divide-y divide-slate-100">
              {summaryModalRows.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">No vehicles to show</p>
              ) : (
                summaryModalRows.map(v => {
                  const st = getStatusStyle(v.status);
                  return (
                    <div
                      key={v.id}
                      onClick={() => { setSummaryModalView(null); setSelectedVehicleId(v.id); }}
                      data-testid="inventory-summary-modal-row"
                      className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 text-sm truncate" style={{ fontFamily: "Manrope" }}>{v.brand} {v.model}</div>
                        <div className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                          <span className={`px-1.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${st.bg} ${st.text}`}>{st.label}</span>
                          {v.registration_number && <span className="font-mono">{v.registration_number}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {summaryModalView === "selling" && (
                          <div className="text-sm font-bold text-green-700">{formatNPR(v.selling_price)}</div>
                        )}
                        {(summaryModalView === "investment" || summaryModalView === "locked") && (
                          <div className="text-sm font-bold text-indigo-700">{formatNPR(v.total_investment)}</div>
                        )}
                        {summaryModalView === "all" && showFinRow && (
                          <>
                            {!hideFinancials && <div className="text-sm font-bold text-indigo-700">{formatNPR(v.total_investment)}</div>}
                            {!hidePricing && v.selling_price ? <div className="text-xs text-green-700 mt-0.5">{formatNPR(v.selling_price)}</div> : null}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
