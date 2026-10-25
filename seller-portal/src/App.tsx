import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  CircleAlert,
  ClipboardList,
  Clock3,
  Droplets,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck2,
  FileUp,
  ImagePlus,
  LogOut,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Store,
  Trash2,
  Users,
  X,
  Bell,
  Inbox,
  ShoppingBag,
  Star,
  Truck,
  Wallet,
  WifiOff,
} from "lucide-react";
import { supabase, supabaseConfigured } from "./supabase";
import { LocationPicker } from "./Location-Picker";
import {
  CountUp,
  KpiTile,
  MiniColumns,
  RankBars,
  SalesTrendChart,
  SectionNav,
  type ColumnItem,
  type KpiDelta,
  type RankItem,
} from "./analytics-charts";
import type {
  ContainerType,
  DocumentRequirement,
  Station,
  StationApplication,
  StationDocument,
  StationOperatingHour,
  StationProduct,
  StationProductImage,
  StationRider,
  WaterType,
} from "./types";

type PortalSection = "overview" | "orders" | "products" | "delivery" | "riders" | "application";

interface Notice {
  kind: "success" | "error";
  text: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface PsgcDivision {
  code: string;
  name: string;
  regionCode?: string;
}

interface StationOrder {
  id: string;
  order_number: number;
  customer_id: string;
  status: string;
  payment_method: string;
  total: number;
  delivery_fee: number;
  address_snapshot: Record<string, unknown>;
  customer_notes: string | null;
  created_at: string;
  delivered_at: string | null;
  estimated_delivery_at: string | null;
  items: Array<{
    product_name_snapshot: string;
    water_type_snapshot: string;
    container_type_snapshot: string;
    container_option: string;
    quantity: number;
    line_total: number;
  }>;
  payment_status: string | null;
  rider_number: number | null;
  rider_name: string | null;
  rider_phone: string | null;
}

interface AnalyticsOrder {
  id: string;
  order_number: number;
  customer_id: string;
  status: string;
  total: number;
  delivery_fee: number;
  address_snapshot: Record<string, unknown>;
  created_at: string;
  delivered_at: string | null;
  estimated_delivery_at: string | null;
  payment_status: string | null;
}

interface AnalyticsOrderItem {
  id: string;
  order_id: string;
  water_type_snapshot: string;
  container_type_snapshot: string;
  quantity: number;
}

const PSGC_API = "https://psgc.gitlab.io/api";

async function fetchPsgcDivisions(path: string, signal: AbortSignal): Promise<PsgcDivision[]> {
  const response = await fetch(`${PSGC_API}${path}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Administrative address data could not be loaded (HTTP ${response.status}).`);
  }
  const data: unknown = await response.json();
  if (!Array.isArray(data) || !data.every(
    (item): item is PsgcDivision => (
      typeof item === "object"
      && item !== null
      && "code" in item
      && typeof item.code === "string"
      && "name" in item
      && typeof item.name === "string"
    ),
  )) {
    throw new Error("Administrative address data was returned in an unexpected format.");
  }
  return data;
}

function orderUpdateMessage(orderNumber: number, status: string) {
  const outcome: Record<string, string> = {
    confirmed: "confirmed",
    preparing: "is being prepared",
    ready: "is ready",
    out_for_delivery: "is out for delivery",
    delivered: "was delivered",
  };
  return `Order #${orderNumber} ${outcome[status] ?? `is now ${readable(status).toLowerCase()}`}`;
}

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0));

const moneyWhole = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);

const moneyCompact = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const wholeNumber = (value: number) => Math.round(value).toLocaleString("en-PH");

const analyticsSections = [
  { id: "an-sales", label: "Sales" },
  { id: "an-products", label: "Products & customers" },
  { id: "an-delivery", label: "Delivery & stock" },
  { id: "an-orders", label: "Recent orders" },
];

function readable(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function containerTypeLabel(container: ContainerType) {
  if (container.volume_liters !== null) {
    if (Math.abs(container.volume_liters - 18.9) < 0.2) return "Regular (18.9 L)";
    if (Math.abs(container.volume_liters - 11.3) < 0.2) return "Slim (11.3 L)";
    return `${container.name} (${container.volume_liters.toFixed(1)} L)`;
  }
  return container.name;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) setNotice({ kind: "error", text: error.message });
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) {
    return (
      <AuthFrame>
        <div className="configuration-card">
          <div className="icon-tile"><CircleAlert size={22} /></div>
          <h1>Connect your Supabase project</h1>
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code> and add the
            project URL and anon key from Supabase Settings → API.
          </p>
        </div>
      </AuthFrame>
    );
  }

  if (!authReady) {
    return (
      <AuthFrame>
        <div className="loading-card"><span className="spinner" /> Loading seller portal…</div>
      </AuthFrame>
    );
  }

  if (!session) {
    return <AuthScreen notice={notice} onNotice={setNotice} />;
  }

  return (
    <SellerDashboard
      session={session}
      notice={notice}
      onNotice={setNotice}
      onSignOut={async () => {
        const { error } = await supabase!.auth.signOut();
        if (error) setNotice({ kind: "error", text: error.message });
        else setNotice(null);
      }}
    />
  );
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  notification_type: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

type Tone = "green" | "blue" | "amber" | "red" | "gray";

function statusTone(value: string | null | undefined): Tone {
  const text = (value ?? "").toLowerCase();
  if (/approved|verified|published|accepted|delivered|^paid$|success|succeeded/.test(text)) return "green";
  if (/reject|failed|cancelled|canceled/.test(text)) return "red";
  if (/change|pending|partially_refunded|refunded/.test(text)) return "amber";
  if (/submitted|review|confirmed|preparing|ready|rider_assigned|out_for_delivery|processing/.test(text)) return "blue";
  return "gray";
}

function paymentStatusLabel(value: string | null) {
  if (!value) return "Status unavailable";
  if (value === "paid") return "Payment received";
  return readable(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "not set";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function timeAgo(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.floor(Math.max(0, Date.now() - time) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(time));
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getManilaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day };
}

function getManilaDateString(date = new Date()) {
  const { year, month, day } = getManilaDateParts(date);
  return `${year}-${month}-${day}`;
}

function getDefaultAnalyticsRange() {
  const today = getManilaDateString();
  return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
}

function addCalendarDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function getAnalyticsRangeBounds(startDate: string, endDate: string) {
  const dayCount = Math.floor(
    (new Date(`${endDate}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime())
      / 86_400_000,
  ) + 1;
  return {
    start: `${startDate}T00:00:00+08:00`,
    end: `${addCalendarDays(endDate, 1)}T00:00:00+08:00`,
    dayCount,
  };
}

function getPreviousAnalyticsRange(startDate: string, dayCount: number) {
  const endDate = addCalendarDays(startDate, -1);
  const previousStartDate = addCalendarDays(endDate, -dayCount + 1);
  return getAnalyticsRangeBounds(previousStartDate, endDate);
}

function formatAnalyticsRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
  const start = formatter.format(new Date(`${startDate}T12:00:00+08:00`));
  const end = formatter.format(new Date(`${endDate}T12:00:00+08:00`));
  return startDate === endDate ? start : `${start} – ${end}`;
}

function isCancelledOrder(status: string) {
  return status.toLowerCase() === "cancelled" || status.toLowerCase() === "canceled";
}

function orderSalesAmount(order: { total: number; delivery_fee: number }) {
  return Math.max(0, Number(order.total) - Number(order.delivery_fee));
}

function orderCustomerName(addressSnapshot: Record<string, unknown>, orderNumber: number) {
  const recipientName = addressSnapshot.recipient_name;
  return typeof recipientName === "string" && recipientName.trim()
    ? recipientName.trim()
    : `Customer #${orderNumber}`;
}

async function fetchAnalyticsRange(
  stationId: string,
  start: string,
  end: string,
  includeItems = true,
) {
  if (!supabase) throw new Error("Supabase is not configured. Monthly analytics could not be loaded.");
  const pageSize = 1000;
  const analyticsOrders: AnalyticsOrder[] = [];
  let orderOffset = 0;

  while (true) {
    const { data, error } = await supabase.from("orders")
      .select("id, order_number, customer_id, status, total, delivery_fee, address_snapshot, created_at, delivered_at, estimated_delivery_at")
      .eq("station_id", stationId)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false })
      .range(orderOffset, orderOffset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as AnalyticsOrder[];
    analyticsOrders.push(...page);
    if (page.length < pageSize) break;
    orderOffset += pageSize;
  }

  const analyticsItems: AnalyticsOrderItem[] = [];
  const orderIds = analyticsOrders.map((order) => order.id);
  for (let index = 0; index < orderIds.length; index += 100) {
    const batch = orderIds.slice(index, index + 100);
    const paymentPromise = supabase.from("station_order_payment_status")
      .select("order_id, payment_status")
      .in("order_id", batch);
    const itemPromise = includeItems
      ? supabase.from("order_items")
          .select("id, order_id, water_type_snapshot, container_type_snapshot, quantity")
          .in("order_id", batch)
          .order("created_at")
          .order("id")
          .range(0, pageSize - 1)
      : Promise.resolve({ data: [], error: null });
    const [{ data: itemData, error: itemError }, { data: paymentData, error: paymentError }] =
      await Promise.all([itemPromise, paymentPromise]);
    if (itemError) throw itemError;
    if (paymentError) throw paymentError;
    analyticsItems.push(...(itemData ?? []) as AnalyticsOrderItem[]);
    const paymentStatusByOrder = new Map(
      (paymentData ?? []).map((payment) => [payment.order_id, payment.payment_status]),
    );
    for (const order of analyticsOrders) {
      if (batch.includes(order.id)) {
        order.payment_status = paymentStatusByOrder.get(order.id) ?? null;
      }
    }
    let itemOffset = pageSize;
    if (includeItems && (itemData ?? []).length === pageSize) {
      while (true) {
        const { data, error } = await supabase.from("order_items")
          .select("id, order_id, water_type_snapshot, container_type_snapshot, quantity")
          .in("order_id", batch)
          .order("created_at")
          .order("id")
          .range(itemOffset, itemOffset + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as AnalyticsOrderItem[];
        analyticsItems.push(...page);
        if (page.length < pageSize) break;
        itemOffset += pageSize;
      }
    }
  }

  return { orders: analyticsOrders, items: analyticsItems };
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}

function useDismiss(open: boolean, onDismiss: () => void, ref: { current: HTMLElement | null }) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) dismissRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref]);
}

function notificationMeta(item: NotificationItem): { tone: Tone; icon: ReactNode } {
  const status = typeof item.data?.status === "string" ? item.data.status : "";
  if (status === "cancelled" || status === "failed") return { tone: "red", icon: <CircleAlert size={16} /> };
  if (status === "delivered") return { tone: "green", icon: <Check size={16} /> };
  if (status === "out_for_delivery" || status === "rider_assigned") return { tone: "blue", icon: <Truck size={16} /> };
  if (item.notification_type.includes("payment")) return { tone: "green", icon: <Wallet size={16} /> };
  if (item.notification_type.includes("order")) return { tone: "blue", icon: <ShoppingBag size={16} /> };
  return { tone: "gray", icon: <Bell size={16} /> };
}

function NotificationCenter({
  userId,
  onNotice,
  onOpenOrders,
}: {
  userId: string;
  onNotice: (notice: Notice | null) => void;
  onOpenOrders: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const markingRef = useRef(false);
  const markFailedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [listResult, countResult] = await Promise.all([
      supabase.from("notifications")
        .select("id, title, body, notification_type, data, read_at, dismissed_at, created_at")
        .eq("user_id", userId)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("dismissed_at", null)
        .is("read_at", null),
    ]);
    const failure = listResult.error ?? countResult.error;
    if (failure) {
      setError(failure.message);
    } else {
      setItems((listResult.data ?? []) as NotificationItem[]);
      setUnread(countResult.count ?? 0);
      setError("");
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const channel = client
      .channel(`seller-notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      void client.removeChannel(channel);
    };
  }, [refresh, userId]);

  useEffect(() => {
    const baseTitle = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${baseTitle}` : baseTitle;
    return () => { document.title = baseTitle; };
  }, [unread]);

  const markAllRead = useCallback(async () => {
    if (!supabase || markingRef.current) return;
    markingRef.current = true;
    const readAt = new Date().toISOString();
    const { error: updateError } = await supabase.from("notifications")
      .update({ read_at: readAt })
      .eq("user_id", userId)
      .is("read_at", null);
    markingRef.current = false;
    if (updateError) {
      markFailedRef.current = true;
      onNotice({ kind: "error", text: `Notifications could not be marked as read: ${updateError.message}` });
      return;
    }
    setItems((current) => current.map((entry) => (entry.read_at ? entry : { ...entry, read_at: readAt })));
    setUnread(0);
  }, [onNotice, userId]);

  const removeAllNotifications = useCallback(async () => {
    if (!supabase) {
      onNotice({ kind: "error", text: "Supabase is not configured. Notifications could not be removed." });
      return;
    }
    if (items.length === 0 || !window.confirm("Remove all notifications from your notification list?")) return;
    const dismissedAt = new Date().toISOString();
    const { error: updateError } = await supabase.from("notifications")
      .update({ dismissed_at: dismissedAt, read_at: dismissedAt })
      .eq("user_id", userId)
      .is("dismissed_at", null);
    if (updateError) {
      onNotice({ kind: "error", text: `Notifications could not be removed: ${updateError.message}` });
      return;
    }
    setItems([]);
    setUnread(0);
    setFreshIds(new Set());
    onNotice({ kind: "success", text: "All notifications removed." });
  }, [items.length, onNotice, userId]);

  // Opening the panel counts as seeing the notifications; keep history, but
  // clear the unread emphasis immediately after the server confirms the update.
  useEffect(() => {
    if (!open) {
      markFailedRef.current = false;
      setFreshIds((current) => (current.size === 0 ? current : new Set()));
      return;
    }
    if (unread === 0 || markFailedRef.current) return;
    setFreshIds((current) => {
      const next = new Set(current);
      for (const entry of items) if (!entry.read_at) next.add(entry.id);
      return next;
    });
    void markAllRead().then(() => {
      if (!markFailedRef.current) setFreshIds(new Set());
    });
  }, [open, unread, items, markAllRead]);

  useDismiss(open, () => {
    setOpen(false);
    buttonRef.current?.focus();
  }, rootRef);

  return (
    <div className="notif" ref={rootRef}>
      <button
        ref={buttonRef}
        className={`icon-button notif-button ${unread > 0 ? "has-unread" : ""}`}
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={17} />
        {unread > 0 && <span className="notif-badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <header className="notif-head">
            <h2>Notifications</h2>
            <div className="notif-head-actions">
              {freshIds.size > 0 && <span className="pill pill-blue">{freshIds.size} new</span>}
              {items.length > 0 && (
                <button
                  className="text-link notif-clear-all"
                  type="button"
                  onClick={() => void removeAllNotifications()}
                >
                  Remove all notifications <Trash2 size={13} />
                </button>
              )}
            </div>
          </header>
          <div className="notif-body">
            {loading ? (
              <div className="notif-loading" aria-busy="true">
                <div className="skeleton notif-skeleton" />
                <div className="skeleton notif-skeleton" />
                <div className="skeleton notif-skeleton" />
              </div>
            ) : error ? (
              <div className="notif-empty">
                <span className="empty-icon"><CircleAlert size={20} /></span>
                <strong>Notifications did not load</strong>
                <p>{error}</p>
                <button className="button button-secondary button-small" type="button" onClick={() => void refresh()}>Try again</button>
              </div>
            ) : items.length === 0 ? (
              <div className="notif-empty">
                <span className="empty-icon"><Inbox size={20} /></span>
                <strong>You’re all caught up</strong>
                <p>New orders and station updates will appear here.</p>
              </div>
            ) : (
              <ul className="notif-list">
                {items.map((item) => {
                  const meta = notificationMeta(item);
                  const isNew = freshIds.has(item.id);
                  return (
                    <li className={`notif-item ${isNew ? "is-new" : ""}`} key={item.id}>
                      <span className={`notif-icon notif-icon-${meta.tone}`}>{meta.icon}</span>
                      <div className="notif-copy">
                        <strong>{item.title}</strong>
                        <p>{item.body}</p>
                        <time dateTime={item.created_at}>{timeAgo(item.created_at)}</time>
                        {typeof item.data?.order_id === "string" && (
                          <button
                            className="text-link"
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              onOpenOrders();
                            }}
                          >
                            View station orders <ArrowRight size={13} />
                          </button>
                        )}
                      </div>
                      {isNew && <span className="notif-dot" role="img" aria-label="New" />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu({
  name,
  email,
  initials,
  onSignOut,
}: {
  name: string;
  email: string;
  initials: string;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useDismiss(open, () => {
    setOpen(false);
    buttonRef.current?.focus();
  }, rootRef);

  return (
    <div className="account" ref={rootRef}>
      <button
        ref={buttonRef}
        className="avatar top-avatar account-button"
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {initials}
      </button>
      {open && (
        <div className="account-panel" role="menu">
          <div className="account-id">
            <strong>{name}</strong>
            {email && email !== name && <small>{email}</small>}
          </div>
          <button className="account-signout" type="button" role="menuitem" onClick={() => void onSignOut()}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`wordmark wordmark-${size}`} role="img" aria-label="AquaDirect">
      <span className="wm-aqua" aria-hidden="true">Aqua</span>
      <span className="wm-direct" aria-hidden="true">Direct</span>
    </span>
  );
}

const wavePath = "M0 80 Q100 40 200 80 T400 80 T600 80 T800 80 T1000 80 T1200 80 T1400 80 T1600 80 V200 H0 Z";
const wavePathBack = "M0 100 Q100 140 200 100 T400 100 T600 100 T800 100 T1000 100 T1200 100 T1400 100 T1600 100 V200 H0 Z";

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <div className="auth-brand">
          <Wordmark size="lg" />
          <span className="brand-divider" />
          <span className="brand-muted">Seller portal</span>
        </div>
        <div className="aside-copy">
          <h2>Run your water station from one place.</h2>
          <p>List your gallons, set where you deliver, and reach customers nearby once your station is verified.</p>
          <ul className="aside-points">
            <li><span><Package size={18} /></span><div><strong>Set water and gallon pricing</strong><small>Keep refill and new-gallon prices and availability up to date.</small></div></li>
            <li><span><MapPin size={18} /></span><div><strong>Set your delivery area</strong><small>Choose your radius, fees and weekly hours.</small></div></li>
            <li><span><BadgeCheck size={18} /></span><div><strong>Get verified and go live</strong><small>Upload your documents and track the review.</small></div></li>
          </ul>
        </div>
        <div className="aside-waves" aria-hidden="true">
          <svg viewBox="0 0 1600 200" preserveAspectRatio="none"><path d={wavePathBack} /></svg>
          <svg viewBox="0 0 1600 200" preserveAspectRatio="none"><path d={wavePath} /></svg>
        </div>
      </aside>
      <section className="auth-main">
        <div className="auth-mobile-brand"><Wordmark /></div>
        <div className="auth-content">{children}</div>
        <p className="auth-footer">AquaDirect · Helping local stations grow</p>
      </section>
    </main>
  );
}

function AuthScreen({
  notice,
  onNotice,
}: {
  notice: Notice | null;
  onNotice: (value: Notice | null) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    onNotice(null);
    setBusy(true);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          onNotice({
            kind: "success",
            text: "Account created. Check your email to confirm your address, then sign in.",
          });
        } else {
          onNotice({ kind: "success", text: "Account created. Continue by adding your station." });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Could not complete authentication.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <div className="auth-card">
        <h1>{mode === "login" ? "Welcome back" : "Grow your station with us"}</h1>
        <p className="muted">
          {mode === "login"
            ? "Sign in to manage your water products and stock."
            : "Create an account, list your station, and share your products with customers nearby."}
        </p>

        {notice && <NoticeBanner notice={notice} onClose={() => onNotice(null)} />}
        <form className="stack-form" onSubmit={(event) => void submit(event)}>
          {mode === "signup" && (
            <label>
              Your name
              <input
                autoComplete="name"
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="e.g. Maria Santos"
              />
            </label>
          )}
          <label>
            Email address
            <input
              autoComplete="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@station.com"
            />
          </label>
          <div className="field">
            <label htmlFor="seller-password">Password</label>
            <div className="password-field">
              <input
                id="seller-password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                type={showPassword ? "text" : "password"}
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
              />
              <button
                className="password-toggle"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          <button className="button button-primary button-wide" type="submit" disabled={busy}>
            {busy ? <span className="spinner spinner-light" /> : null}
            {mode === "login" ? "Sign in" : "Create seller account"}
            {!busy && <ArrowRight size={17} />}
          </button>
        </form>
        <div className="auth-switch">
          {mode === "login" ? "New to AquaDirect?" : "Already have an account?"}
          <button
            type="button"
            onClick={() => {
              setMode((currentMode) => currentMode === "login" ? "signup" : "login");
              setEmail("");
              setPassword("");
              setFullName("");
              setShowPassword(false);
              onNotice(null);
            }}
          >
            {mode === "login" ? "Create account" : "Sign in"}
          </button>
        </div>
      </div>
    </AuthFrame>
  );
}

function SellerDashboard({
  session,
  notice,
  onNotice,
  onSignOut,
}: {
  session: Session;
  notice: Notice | null;
  onNotice: (value: Notice | null) => void;
  onSignOut: () => Promise<void>;
}) {
  const [section, setSection] = useState<PortalSection>("overview");
  const [application, setApplication] = useState<StationApplication | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [products, setProducts] = useState<StationProduct[]>([]);
  const [orders, setOrders] = useState<StationOrder[]>([]);
  const [analyticsOrders, setAnalyticsOrders] = useState<AnalyticsOrder[]>([]);
  const [analyticsItems, setAnalyticsItems] = useState<AnalyticsOrderItem[]>([]);
  const [previousAnalyticsOrders, setPreviousAnalyticsOrders] = useState<AnalyticsOrder[]>([]);
  const initialAnalyticsRange = useMemo(() => getDefaultAnalyticsRange(), []);
  const [analyticsStartDate, setAnalyticsStartDate] = useState(initialAnalyticsRange.startDate);
  const [analyticsEndDate, setAnalyticsEndDate] = useState(initialAnalyticsRange.endDate);
  const [riders, setRiders] = useState<StationRider[]>([]);
  const [waterTypes, setWaterTypes] = useState<WaterType[]>([]);
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [requirements, setRequirements] = useState<DocumentRequirement[]>([]);
  const [documents, setDocuments] = useState<StationDocument[]>([]);
  const [operatingHours, setOperatingHours] = useState<StationOperatingHour[]>([]);
  const [containerPolicies, setContainerPolicies] = useState<Array<{
    container_type_id: string;
    is_active: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hiddenOrderIds, setHiddenOrderIds] = useState<Set<string>>(new Set());
  const [restoredOrderId, setRestoredOrderId] = useState<string | null>(null);
  const pendingHides = useRef(new Map<string, number>());
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stockEditor, setStockEditor] = useState<StationProduct | null>(null);
  const online = useOnlineStatus();
  const wasOffline = useRef(false);
  const knownPaymentStatuses = useRef(new Map<string, string | null>());

  const load = useCallback(async (showRefresh = false) => {
    if (!supabase) return;
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const [
        applicationResult,
        waterTypesResult,
        containerTypesResult,
      ] = await Promise.all([
        supabase.from("station_applications")
          .select("id, owner_id, legal_business_name, display_name, phone, email, address_line, barangay, city, province, region, postal_code, latitude, longitude, application_status, verification_status, submitted_at, created_at")
          .eq("owner_id", session.user.id)
          .order("created_at", { ascending: false })
          .limit(1),
        supabase.from("water_types").select("id, name, description").eq("is_active", true).order("name"),
        supabase.from("container_types").select("id, name, volume_liters, description").eq("is_active", true).order("name"),
      ]);
      if (applicationResult.error) throw applicationResult.error;
      if (waterTypesResult.error) throw waterTypesResult.error;
      if (containerTypesResult.error) throw containerTypesResult.error;

      const currentApplication = (applicationResult.data?.[0] ?? null) as StationApplication | null;
      setApplication(currentApplication);
      setWaterTypes((waterTypesResult.data ?? []) as WaterType[]);
      setContainerTypes((containerTypesResult.data ?? []) as ContainerType[]);

      if (!currentApplication) {
        setStation(null);
        setProducts([]);
        setOrders([]);
        setAnalyticsOrders([]);
        setAnalyticsItems([]);
        setPreviousAnalyticsOrders([]);
        setRiders([]);
        setDocuments([]);
        setRequirements([]);
        setOperatingHours([]);
        setContainerPolicies([]);
        return;
      }

      const [stationResult, requirementsResult, documentsResult] = await Promise.all([
        supabase.from("stations")
          .select("id, application_id, display_name, description, logo_path, facebook_url, instagram_url, service_radius_km, verification_status, publication_status, operational_status, default_delivery_fee, minimum_order_amount, rating_average, rating_count")
          .eq("application_id", currentApplication.id)
          .maybeSingle(),
        supabase.from("station_document_requirements")
          .select("application_id, document_type, required")
          .eq("application_id", currentApplication.id)
          .order("document_type"),
        supabase.from("station_documents")
          .select("id, application_id, document_type, storage_path, review_status, review_notes, required_for_verification, is_current, expires_at, submitted_at")
          .eq("application_id", currentApplication.id)
          .eq("is_current", true)
          .order("document_type"),
      ]);
      if (stationResult.error) throw stationResult.error;
      if (requirementsResult.error) throw requirementsResult.error;
      if (documentsResult.error) throw documentsResult.error;
      const currentStation = (stationResult.data ?? null) as Station | null;
      setStation(currentStation);
      setRequirements((requirementsResult.data ?? []) as DocumentRequirement[]);
      setDocuments((documentsResult.data ?? []) as StationDocument[]);

      if (currentStation) {
        const selectedRange = getAnalyticsRangeBounds(analyticsStartDate, analyticsEndDate);
        const previousRange = getPreviousAnalyticsRange(analyticsStartDate, selectedRange.dayCount);
        const [
          productsResult,
          hoursResult,
          policiesResult,
          ordersResult,
          dismissalsResult,
          ridersResult,
          rangeAnalytics,
          previousRangeAnalytics,
        ] = await Promise.all([
          supabase.from("station_products")
            .select("id, station_id, water_type_id, container_type_id, name, description, refill_available, refill_price, new_container_available, new_container_price, deposit_amount, requires_empty_container, return_policy, stock_quantity, max_order_quantity, status, image_path, created_at")
            .eq("station_id", currentStation.id)
            .order("created_at", { ascending: false }),
          supabase.from("station_operating_hours")
            .select("id, station_id, weekday, opens_at, closes_at, is_closed")
            .eq("station_id", currentStation.id)
            .order("weekday"),
          supabase.from("container_policies")
            .select("container_type_id, is_active")
            .eq("station_id", currentStation.id),
          supabase.from("orders")
            .select("id, order_number, customer_id, status, payment_method, total, delivery_fee, address_snapshot, customer_notes, created_at, delivered_at, estimated_delivery_at")
            .eq("station_id", currentStation.id)
            .order("created_at", { ascending: false })
            .limit(100),
          supabase.from("station_order_dismissals")
            .select("order_id")
            .eq("user_id", session.user.id),
          supabase.from("station_riders")
            .select("id, station_id, rider_number, name, phone")
            .eq("station_id", currentStation.id)
            .order("rider_number"),
          fetchAnalyticsRange(
            currentStation.id,
            selectedRange.start,
            selectedRange.end,
          ),
          fetchAnalyticsRange(
            currentStation.id,
            previousRange.start,
            previousRange.end,
            false,
          ),
        ]);
        if (productsResult.error) throw productsResult.error;
        if (hoursResult.error) throw hoursResult.error;
        if (policiesResult.error) throw policiesResult.error;
        if (ordersResult.error) throw ordersResult.error;
        if (dismissalsResult.error) throw dismissalsResult.error;
        if (ridersResult.error) throw ridersResult.error;
        setAnalyticsOrders(rangeAnalytics.orders);
        setAnalyticsItems(rangeAnalytics.items);
        setPreviousAnalyticsOrders(previousRangeAnalytics.orders);
        setRiders((ridersResult.data ?? []) as StationRider[]);
        const dismissedOrderIds = new Set((dismissalsResult.data ?? []).map((item) => item.order_id));
        const currentOrders = (ordersResult.data ?? []).filter((order) => !dismissedOrderIds.has(order.id));
        const orderIds = currentOrders.map((order) => order.id);
        const [orderItemsResult, orderPaymentsResult, deliveriesResult] = orderIds.length
          ? await Promise.all([
              supabase.from("order_items")
              .select("order_id, product_name_snapshot, water_type_snapshot, container_type_snapshot, container_option, quantity, line_total")
              .in("order_id", orderIds)
              .order("created_at"),
              supabase.from("station_order_payment_status")
                .select("order_id, payment_status")
                .in("order_id", orderIds),
              supabase.from("deliveries")
                .select("order_id, rider_number, rider_name, rider_phone")
                .in("order_id", orderIds),
            ])
          : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
        if (orderItemsResult.error) throw orderItemsResult.error;
        if (orderPaymentsResult.error) throw orderPaymentsResult.error;
        if (deliveriesResult.error) throw deliveriesResult.error;
        const itemsByOrder = new Map<string, StationOrder["items"]>();
        for (const item of orderItemsResult.data ?? []) {
          const list = itemsByOrder.get(item.order_id) ?? [];
          list.push(item);
          itemsByOrder.set(item.order_id, list);
        }
        const paymentStatusByOrder = new Map<string, string>();
        for (const payment of orderPaymentsResult.data ?? []) {
          paymentStatusByOrder.set(payment.order_id, payment.payment_status);
        }
        const deliveryByOrder = new Map((deliveriesResult.data ?? []).map((delivery) => [
          delivery.order_id,
          delivery,
        ]));
        const newlyPaidOrders = currentOrders.filter((order) =>
          paymentStatusByOrder.get(order.id) === "paid" &&
          knownPaymentStatuses.current.has(order.id) &&
          knownPaymentStatuses.current.get(order.id) !== "paid"
        );
        if (newlyPaidOrders.length === 1) {
          onNotice({
            kind: "success",
            text: `PayMongo payment received for order #${newlyPaidOrders[0].order_number}.`,
          });
        } else if (newlyPaidOrders.length > 1) {
          onNotice({
            kind: "success",
            text: `PayMongo payments received for ${newlyPaidOrders.length} orders.`,
          });
        }
        for (const order of currentOrders) {
          knownPaymentStatuses.current.set(
            order.id,
            paymentStatusByOrder.get(order.id) ?? null,
          );
        }
        setOrders(currentOrders.map((order) => ({
          ...order,
          address_snapshot: order.address_snapshot && typeof order.address_snapshot === "object"
            ? order.address_snapshot as Record<string, unknown>
            : {},
          items: itemsByOrder.get(order.id) ?? [],
          payment_status: paymentStatusByOrder.get(order.id) ?? null,
          rider_number: deliveryByOrder.get(order.id)?.rider_number ?? null,
          rider_name: deliveryByOrder.get(order.id)?.rider_name ?? null,
          rider_phone: deliveryByOrder.get(order.id)?.rider_phone ?? null,
        })) as StationOrder[]);
        const products = (productsResult.data ?? []) as StationProduct[];
        const imageResult = products.length
          ? await supabase.from("station_product_images")
              .select("id, product_id, storage_path, alt_text, sort_order, created_at")
              .in("product_id", products.map((product) => product.id))
              .order("sort_order")
          : { data: [], error: null };
        if (imageResult.error) throw imageResult.error;
        const imagesByProduct = new Map<string, StationProductImage[]>();
        for (const image of (imageResult.data ?? []) as StationProductImage[]) {
          const images = imagesByProduct.get(image.product_id) ?? [];
          images.push(image);
          imagesByProduct.set(image.product_id, images);
        }
        setProducts(products.map((product) => ({
          ...product,
          images: imagesByProduct.get(product.id) ?? [],
        })));
        setOperatingHours((hoursResult.data ?? []) as StationOperatingHour[]);
        setContainerPolicies(policiesResult.data ?? []);
      } else {
        setProducts([]);
        setOrders([]);
        setAnalyticsOrders([]);
        setAnalyticsItems([]);
        setPreviousAnalyticsOrders([]);
        setRiders([]);
        setOperatingHours([]);
        setContainerPolicies([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load seller data.";
      setLoadError(message);
      onNotice({ kind: "error", text: message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [analyticsEndDate, analyticsStartDate, onNotice, session.user.id]);

  const unhideLocally = useCallback((orderId: string) => {
    setHiddenOrderIds((current) => {
      const next = new Set(current);
      next.delete(orderId);
      return next;
    });
  }, []);

  const commitHide = useCallback(async (orderId: string) => {
    pendingHides.current.delete(orderId);
    if (!supabase) return;
    const { error } = await supabase.from("station_order_dismissals").insert({
      user_id: session.user.id,
      order_id: orderId,
    });
    if (error) {
      unhideLocally(orderId);
      onNotice({ kind: "error", text: "Couldn't hide that order, so it's back in your list." });
      return;
    }
    setOrders((current) => current.filter((order) => order.id !== orderId));
    unhideLocally(orderId);
  }, [onNotice, session.user.id, unhideLocally]);
  const commitHideRef = useRef(commitHide);
  commitHideRef.current = commitHide;

  const undoHide = useCallback((orderId: string) => {
    const timer = pendingHides.current.get(orderId);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    pendingHides.current.delete(orderId);
    unhideLocally(orderId);
    setRestoredOrderId(orderId);
    window.setTimeout(() => setRestoredOrderId((current) => (current === orderId ? null : current)), 700);
  }, [unhideLocally]);

  // Hiding is applied after a short undo window; flush anything pending if the page closes.
  useEffect(() => {
    const pending = pendingHides.current;
    const flush = () => {
      for (const [orderId, timer] of [...pending]) {
        window.clearTimeout(timer);
        void commitHideRef.current(orderId);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const dismissOrder = useCallback((orderId: string) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order || !["delivered", "cancelled"].includes(order.status)) {
      onNotice({ kind: "error", text: "Only delivered or cancelled orders can be hidden." });
      return;
    }
    setHiddenOrderIds((current) => new Set(current).add(orderId));
    pendingHides.current.set(orderId, window.setTimeout(() => void commitHide(orderId), 5600));
    onNotice({
      kind: "success",
      text: `Order #${order.order_number} hidden`,
      duration: 5000,
      action: { label: "Undo", onClick: () => undoHide(orderId) },
    });
  }, [commitHide, onNotice, orders, undoHide]);

  const visibleOrders = useMemo(
    () => orders.filter((order) => !hiddenOrderIds.has(order.id)),
    [hiddenOrderIds, orders],
  );

  const updateOrderStatus = useCallback(async (order: StationOrder, status: string) => {
    if (!supabase) {
      onNotice({ kind: "error", text: "Supabase is not configured. The order status could not be updated." });
      return;
    }
    setUpdatingOrderId(order.id);
    onNotice(null);
    try {
      const { error } = await supabase.rpc("update_order_status", {
        p_order_id: order.id,
        p_status: status,
      });
      if (error) throw error;
      onNotice({ kind: "success", text: orderUpdateMessage(order.order_number, status) });
      await load(true);
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "The order status could not be updated.",
      });
    } finally {
      setUpdatingOrderId(null);
    }
  }, [load, onNotice]);

  const cancelStationOrder = useCallback(async (order: StationOrder, reason: string): Promise<boolean> => {
    if (!supabase) {
      onNotice({ kind: "error", text: "Supabase is not configured. The order could not be cancelled." });
      return false;
    }
    setUpdatingOrderId(order.id);
    onNotice(null);
    try {
      const { error } = await supabase.rpc("cancel_station_order", {
        p_order_id: order.id,
        p_reason: reason,
      });
      if (error) throw error;
      onNotice({ kind: "success", text: `Order #${order.order_number} cancelled` });
      await load(true);
      return true;
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "The order could not be cancelled.",
      });
      return false;
    } finally {
      setUpdatingOrderId(null);
    }
  }, [load, onNotice]);

  const saveRider = useCallback(async (
    riderId: string | null,
    name: string,
    phone: string,
  ): Promise<boolean> => {
    if (!supabase || !station) {
      onNotice({ kind: "error", text: "Your station is not available. The rider could not be saved." });
      return false;
    }
    try {
      const { error } = riderId
        ? await supabase.rpc("update_station_rider", {
            p_rider_id: riderId,
            p_name: name,
            p_phone: phone,
          })
        : await supabase.rpc("create_station_rider", {
            p_station_id: station.id,
            p_name: name,
            p_phone: phone,
          });
      if (error) throw error;
      onNotice({ kind: "success", text: riderId ? "Rider details updated." : "Rider added to your station." });
      await load(true);
      return true;
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "The rider could not be saved.",
      });
      return false;
    }
  }, [load, onNotice, station]);

  const deleteRider = useCallback(async (riderId: string) => {
    if (!supabase) {
      onNotice({ kind: "error", text: "Supabase is not configured. The rider could not be removed." });
      return;
    }
    try {
      const { error } = await supabase.rpc("delete_station_rider", { p_rider_id: riderId });
      if (error) throw error;
      onNotice({ kind: "success", text: "Rider removed from your station." });
      await load(true);
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "The rider could not be removed.",
      });
    }
  }, [load, onNotice]);

  const assignRider = useCallback(async (order: StationOrder, riderId: string): Promise<boolean> => {
    if (!supabase) {
      onNotice({ kind: "error", text: "Supabase is not configured. The rider could not be assigned." });
      return false;
    }
    setUpdatingOrderId(order.id);
    try {
      const { error } = await supabase.rpc("assign_station_rider", {
        p_order_id: order.id,
        p_rider_id: riderId,
      });
      if (error) throw error;
      onNotice({ kind: "success", text: `Rider assigned to order #${order.order_number}` });
      await load(true);
      return true;
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "The rider could not be assigned.",
      });
      return false;
    } finally {
      setUpdatingOrderId(null);
    }
  }, [load, onNotice]);

  const hasLoadedDashboard = useRef(false);
  useEffect(() => {
    const showRefresh = hasLoadedDashboard.current;
    hasLoadedDashboard.current = true;
    void load(showRefresh);
  }, [load]);

  useEffect(() => {
    if (!supabase || !station?.id) return;
    const client = supabase;
    const channel = client
      .channel(`station-orders-${station.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `station_id=eq.${station.id}`,
      }, () => {
        void load(true);
      })
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [load, station?.id]);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      void load(true);
    }
  }, [online, load]);

  const activeProducts = products.filter((product) => product.status === "active").length;
  const lowStockProducts = products.filter(
    (product) => product.stock_quantity !== null && product.stock_quantity <= 5,
  ).length;
  const metadataName = String(session.user.user_metadata.full_name ?? "").trim();
  const userName = metadataName || session.user.email || "Seller";
  const initials = userName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "S";

  const navigation: Array<{ id: PortalSection; label: string; icon: typeof Store }> = [
    { id: "overview", label: "Overview", icon: Store },
    { id: "orders", label: "Station orders", icon: ShoppingBag },
    { id: "products", label: "Water & Gallon Pricing", icon: Package },
    { id: "delivery", label: "Delivery setup", icon: MapPin },
    { id: "riders", label: "Delivery riders", icon: Users },
    { id: "application", label: "Station profile", icon: ClipboardList },
  ];

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Wordmark size="lg" />
          <span className="sidebar-tag">Seller portal</span>
        </div>
        <nav
          className="sidebar-nav"
          aria-label="Seller navigation"
          style={{ "--nav-index": Math.max(0, navigation.findIndex((item) => item.id === section)) } as CSSProperties}
        >
          <span className="nav-indicator" aria-hidden="true" />
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={`nav-link ${section === id ? "nav-link-active" : ""}`}
              key={id}
              type="button"
              onClick={() => setSection(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "products" && products.length > 0 && (
                <span className="nav-count">{products.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {station?.publication_status !== "published" && (
          <div className="help-card">
            <div className="help-icon"><FileCheck2 size={17} /></div>
            <strong>Need a hand?</strong>
            <p>Complete your station profile to get ready for review.</p>
            <button type="button" onClick={() => setSection("application")}>
              View checklist <ArrowRight size={14} />
            </button>
          </div>
          )}
          <button className="profile-menu" type="button" onClick={() => void onSignOut()}>
            <span className="avatar">{initials}</span>
            <span className="profile-info">
              <strong>{userName}</strong>
              <small>Sign out</small>
            </span>
            <LogOut size={16} className="signout-icon" />
          </button>
        </div>
      </aside>

      <main className="portal-main">
        <header className="topbar">
          <div className="mobile-brand"><Wordmark /></div>
          <div className="breadcrumb">Seller portal <span>/</span> {navigation.find((item) => item.id === section)?.label}</div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="Refresh seller data"
              disabled={refreshing || loading}
              onClick={() => void load(true)}
            >
              <RefreshCw size={17} className={refreshing ? "spin" : ""} />
            </button>
            <NotificationCenter
              userId={session.user.id}
              onNotice={onNotice}
              onOpenOrders={() => setSection("orders")}
            />
            <AccountMenu name={userName} email={session.user.email ?? ""} initials={initials} onSignOut={onSignOut} />
          </div>
        </header>

        <section className="content-area">
          {!online && (
            <div className="offline-strip" role="status">
              <WifiOff size={16} />
              <span>You’re offline. Changes can’t be saved until your connection is back.</span>
            </div>
          )}
          {notice && <NoticeBanner notice={notice} onClose={() => onNotice(null)} />}
          {loadError && (
            <div className="error-panel">
              <CircleAlert size={18} />
              <div><strong>Some seller data did not load.</strong><p>{loadError}</p></div>
              <button className="button button-secondary button-small" type="button" onClick={() => void load(true)}>Retry</button>
            </div>
          )}
          {loading ? (
            <DashboardSkeleton />
          ) : !application ? (
            <StationApplicationForm
              email={session.user.email ?? ""}
              onCreated={() => {
                onNotice({ kind: "success", text: "Station profile created. You can add water types and set pricing while preparing your application." });
                void load(true);
              }}
              onNotice={onNotice}
            />
          ) : (
            <div className="page" key={section}>
              {section === "overview" && (
                <OverviewSection
                  application={application}
                  station={station}
                  operatingHours={operatingHours}
                  products={products}
                  orders={orders}
                  analyticsOrders={analyticsOrders}
                  analyticsItems={analyticsItems}
                  previousAnalyticsOrders={previousAnalyticsOrders}
                  analyticsStartDate={analyticsStartDate}
                  analyticsEndDate={analyticsEndDate}
                  onAnalyticsRangeChange={(startDate, endDate) => {
                    setAnalyticsStartDate(startDate);
                    setAnalyticsEndDate(endDate);
                  }}
                  activeProducts={activeProducts}
                  lowStockProducts={lowStockProducts}
                  onNavigate={setSection}
                  onAddProduct={() => setSection("products")}
                  onStock={(product) => setStockEditor(product)}
                  onRefresh={() => void load(true)}
                  onNotice={onNotice}
                />
              )}
              {section === "orders" && (
                <StationOrdersSection
                  orders={visibleOrders}
                  stationName={station?.display_name ?? application.display_name}
                  onRefresh={() => void load(true)}
                  refreshing={refreshing}
                  restoredOrderId={restoredOrderId}
                  onDismissOrder={dismissOrder}
                  updatingOrderId={updatingOrderId}
                  onUpdateOrderStatus={(order, status) => void updateOrderStatus(order, status)}
                  onCancelOrder={cancelStationOrder}
                  riders={riders}
                  onAssignRider={assignRider}
                  onManageRiders={() => setSection("riders")}
                />
              )}
              {section === "riders" && (
                <DeliveryRidersSection
                  riders={riders}
                  onSave={saveRider}
                  onDelete={deleteRider}
                />
              )}
              {section === "products" && (
                <ProductsSection
                  station={station}
                  products={products}
                  waterTypes={waterTypes}
                  containerTypes={containerTypes}
                  onStock={(product) => setStockEditor(product)}
                  onRefresh={() => void load(true)}
                  onNotice={onNotice}
                />
              )}
              {section === "delivery" && !station && (
                <EmptyState
                  icon={<MapPin size={21} />}
                  title="Station record not found"
                  description="Delivery setup needs your station record. Refresh the page, or contact support if this keeps happening."
                  action={<button className="button button-secondary button-small" type="button" onClick={() => void load(true)}>Refresh</button>}
                />
              )}
              {section === "delivery" && station && (
                <DeliverySetupSection
                  station={station}
                  operatingHours={operatingHours}
                  onRefresh={() => void load(true)}
                  onNotice={onNotice}
                />
              )}
              {section === "application" && (
                <ApplicationSection
                  application={application}
                  station={station}
                  requirements={requirements}
                  documents={documents}
                  products={products}
                  operatingHours={operatingHours}
                  containerPolicies={containerPolicies}
                  onNavigate={setSection}
                  onRefresh={() => void load(true)}
                  onNotice={onNotice}
                />
              )}
            </div>
          )}
        </section>
      </main>

      {stockEditor && (
        <StockEditor
          product={stockEditor}
          onClose={() => setStockEditor(null)}
          onSaved={() => {
            setStockEditor(null);
            onNotice({ kind: "success", text: "Stock was updated and recorded in the inventory ledger." });
            void load(true);
          }}
          onNotice={onNotice}
        />
      )}
    </div>
  );
}

function StationApplicationForm({
  email,
  onCreated,
  onNotice,
}: {
  email: string;
  onCreated: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [streetEdited, setStreetEdited] = useState(false);
  const [provinces, setProvinces] = useState<PsgcDivision[]>([]);
  const [cities, setCities] = useState<PsgcDivision[]>([]);
  const [barangays, setBarangays] = useState<PsgcDivision[]>([]);
  const [regions, setRegions] = useState<PsgcDivision[]>([]);
  const [provinceCode, setProvinceCode] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [barangayCode, setBarangayCode] = useState("");
  const [addressListsBusy, setAddressListsBusy] = useState(true);
  const [citiesBusy, setCitiesBusy] = useState(false);
  const [barangaysBusy, setBarangaysBusy] = useState(false);
  const [addressListsError, setAddressListsError] = useState("");
  const [form, setForm] = useState({
    legalBusinessName: "",
    displayName: "",
    phone: "",
    email,
    addressLine: "",
    barangay: "",
    city: "",
    province: "",
    region: "",
    postalCode: "",
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetchPsgcDivisions("/provinces/", controller.signal),
      fetchPsgcDivisions("/regions/", controller.signal),
    ]).then(([provinceData, regionData]) => {
      setRegions(regionData);
      setProvinces([
        ...provinceData,
        { code: "130000000", name: "Metro Manila", regionCode: "130000000" },
      ].sort((a, b) => a.name.localeCompare(b.name)));
      setAddressListsError("");
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setAddressListsError(error instanceof Error ? error.message : "Could not load provinces and regions.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setAddressListsBusy(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!provinceCode) {
      setCities([]);
      return;
    }
    const controller = new AbortController();
    setCitiesBusy(true);
    const cityListPath = provinceCode === "130000000"
      ? "/regions/130000000/cities-municipalities/"
      : `/provinces/${encodeURIComponent(provinceCode)}/cities-municipalities/`;
    void fetchPsgcDivisions(
      cityListPath,
      controller.signal,
    ).then((cityData) => {
      setCities([...cityData].sort((a, b) => a.name.localeCompare(b.name)));
      setAddressListsError("");
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setAddressListsError(error instanceof Error ? error.message : "Could not load cities and municipalities.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setCitiesBusy(false);
    });
    return () => controller.abort();
  }, [provinceCode]);

  useEffect(() => {
    if (!cityCode) {
      setBarangays([]);
      return;
    }
    const controller = new AbortController();
    setBarangaysBusy(true);
    void fetchPsgcDivisions(
      `/cities-municipalities/${encodeURIComponent(cityCode)}/barangays/`,
      controller.signal,
    ).then((barangayData) => {
      setBarangays([...barangayData].sort((a, b) => a.name.localeCompare(b.name)));
      setAddressListsError("");
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setAddressListsError(error instanceof Error ? error.message : "Could not load barangays.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setBarangaysBusy(false);
    });
    return () => controller.abort();
  }, [cityCode]);

  function setField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectProvince(code: string) {
    const province = provinces.find((item) => item.code === code);
    const region = province
      ? regions.find((item) => item.code === province.regionCode)?.name ?? ""
      : "";
    setProvinceCode(code);
    setCityCode("");
    setBarangayCode("");
    setForm((current) => ({
      ...current,
      province: province?.name ?? "",
      region,
      city: "",
      barangay: "",
    }));
  }

  function selectCity(code: string) {
    const city = cities.find((item) => item.code === code);
    setCityCode(code);
    setBarangayCode("");
    setForm((current) => ({
      ...current,
      city: city?.name ?? "",
      barangay: "",
    }));
  }

  function selectBarangay(code: string) {
    const barangay = barangays.find((item) => item.code === code);
    setBarangayCode(code);
    setForm((current) => ({ ...current, barangay: barangay?.name ?? "" }));
  }

  function applyStreet(street: string, force: boolean) {
    setForm((current) => (force || !streetEdited || !current.addressLine.trim()
      ? { ...current, addressLine: street }
      : current));
    if (force) setStreetEdited(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    onNotice(null);
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!form.latitude.trim() || !form.longitude.trim() || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      onNotice({ kind: "error", text: "Drop a pin on the map to set your station's location." });
      return;
    }
    if (latitude < 4 || latitude > 22 || longitude < 116 || longitude > 128) {
      onNotice({ kind: "error", text: "This pin is outside the Philippines. Move it to your station's location." });
      return;
    }
    setBusy(true);
    try {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { error } = await supabase.rpc("start_station_application", {
        p_legal_business_name: form.legalBusinessName.trim(),
        p_display_name: form.displayName.trim(),
        p_phone: form.phone.trim(),
        p_address_line: form.addressLine.trim(),
        p_city: form.city.trim(),
        p_province: form.province.trim(),
        p_latitude: latitude,
        p_longitude: longitude,
        p_email: form.email.trim() || null,
        p_barangay: form.barangay.trim() || null,
        p_region: form.region.trim() || null,
        p_postal_code: form.postalCode.trim() || null,
      });
      if (error) throw error;
      onCreated();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Station profile could not be created." });
    } finally {
      setBusy(false);
    }
  }

  const manualAddress = !addressListsBusy && provinces.length === 0;

  return (
    <div className="welcome-layout">
      <div className="welcome-intro">
        <h1>Put your water station on the map.</h1>
        <p>
          Add your station details and location. You can add water types, pricing, and stock
          right away; customers can discover them after station review and publication.
        </p>
        <div className="welcome-points">
          <div><span><MapPin size={16} /></span><div><strong>Reach nearby customers</strong><small>Set accurate station coordinates and address.</small></div></div>
          <div><span><Package size={16} /></span><div><strong>Show what’s in stock</strong><small>List refill prices, new gallons, and availability.</small></div></div>
          <div><span><BadgeCheck size={16} /></span><div><strong>Get verified</strong><small>Upload required documents for station review.</small></div></div>
        </div>
      </div>
      <form
        className="panel application-form"
        onSubmit={(event) => void submit(event)}
        onInvalidCapture={() => onNotice({
          kind: "error",
          text: "Complete the highlighted required station details before saving.",
        })}
      >
        <div className="panel-heading">
          <div><h2>Station details</h2><p>These details are used for your station application.</p></div>
          <span className="step-badge">Step 1 of 2</span>
        </div>
        <div className="form-grid">
          <label className="field-span-2">Registered business name
            <input required value={form.legalBusinessName} onChange={(event) => setField("legalBusinessName", event.target.value)} placeholder="e.g. Santos Water Refilling" />
          </label>
          <label className="field-span-2">Station name customers will see
            <input required value={form.displayName} onChange={(event) => setField("displayName", event.target.value)} placeholder="e.g. Santos Water Station" />
          </label>
          <label>Contact phone
            <input required type="tel" value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="+63 9XX XXX XXXX" />
          </label>
          <label>Station email
            <input type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} placeholder="station@example.com" />
          </label>
          {manualAddress ? (
            <>
              <label>Province
                <input required value={form.province} onChange={(event) => setField("province", event.target.value)} placeholder="Province" />
              </label>
              <label>City / municipality
                <input required value={form.city} onChange={(event) => setField("city", event.target.value)} placeholder="City or municipality" />
              </label>
              <label>Barangay
                <input value={form.barangay} onChange={(event) => setField("barangay", event.target.value)} placeholder="Barangay" />
              </label>
              <label>Region
                <input value={form.region} onChange={(event) => setField("region", event.target.value)} placeholder="Region (optional)" />
              </label>
            </>
          ) : (
            <>
              <label>Province
                <select required value={provinceCode} onChange={(event) => selectProvince(event.target.value)} disabled={addressListsBusy || provinces.length === 0}>
                  <option value="">{addressListsBusy ? "Loading provinces…" : "Select province"}</option>
                  {provinces.map((province) => (
                    <option key={province.code} value={province.code}>
                      {province.code === "130000000" ? "Metro Manila (NCR)" : province.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>City / municipality
                <select required value={cityCode} onChange={(event) => selectCity(event.target.value)} disabled={!provinceCode || citiesBusy || cities.length === 0}>
                  <option value="">{citiesBusy ? "Loading cities/municipalities…" : "Select city / municipality"}</option>
                  {cities.map((city) => (
                    <option key={city.code} value={city.code}>{city.name}</option>
                  ))}
                </select>
              </label>
              <label>Barangay
                <select required value={barangayCode} onChange={(event) => selectBarangay(event.target.value)} disabled={!cityCode || barangaysBusy || barangays.length === 0}>
                  <option value="">{barangaysBusy ? "Loading barangays…" : "Select barangay"}</option>
                  {barangays.map((barangay) => (
                    <option key={barangay.code} value={barangay.code}>{barangay.name}</option>
                  ))}
                </select>
              </label>
              <label>Region
                <input readOnly value={form.region} placeholder="Set by province" />
              </label>
            </>
          )}
          <label>Postal code
            <input value={form.postalCode} onChange={(event) => setField("postalCode", event.target.value)} placeholder="Optional" />
          </label>
          {addressListsError && (
            <p className="field-span-2 address-lists-error" role="alert">
              {addressListsError} {manualAddress ? "Type your province, city and barangay instead." : "Check your connection and reload the page to try again."}
            </p>
          )}
          <div className="field-span-2">
            <LocationPicker
              latitude={form.latitude}
              longitude={form.longitude}
              areaQuery={[form.barangay, form.city, form.province].filter(Boolean).join(", ")}
              areaZoom={form.barangay ? 16 : form.city ? 13 : 10}
              selectedCity={form.city}
              onPin={(latitude, longitude) => setForm((current) => ({
                ...current,
                latitude: latitude.toFixed(6),
                longitude: longitude.toFixed(6),
              }))}
              onStreetSuggestion={applyStreet}
              onNotice={onNotice}
            />
          </div>
          <label className="field-span-2">Street address
            <input
              required
              value={form.addressLine}
              onChange={(event) => {
                setStreetEdited(true);
                setField("addressLine", event.target.value);
              }}
              placeholder="Street, building, purok/sitio or landmark"
            />
            <span className="field-hint">Filled in from your pin when possible. Edit it to add your building number or landmark.</span>
          </label>
          <div className="field-span-2 form-grid coordinates-grid">
            <label>Latitude
              <input inputMode="decimal" value={form.latitude} onChange={(event) => setField("latitude", event.target.value)} placeholder="Set by the pin" />
            </label>
            <label>Longitude
              <input inputMode="decimal" value={form.longitude} onChange={(event) => setField("longitude", event.target.value)} placeholder="Set by the pin" />
            </label>
          </div>
        </div>
        <div className="form-footer">
          <span className="muted-note"><CircleAlert size={15} /> You can add water types after saving.</span>
          <button className="button button-primary" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? <span className="spinner spinner-light" /> : null}
            {busy ? "Saving station details…" : "Save station details"}
            {!busy && <ArrowRight size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}

function OverviewSection({
  application,
  station,
  operatingHours,
  products,
  orders,
  analyticsOrders,
  analyticsItems,
  previousAnalyticsOrders,
  analyticsStartDate,
  analyticsEndDate,
  onAnalyticsRangeChange,
  activeProducts,
  lowStockProducts,
  onNavigate,
  onAddProduct,
  onStock,
  onRefresh,
  onNotice,
}: {
  application: StationApplication;
  station: Station | null;
  operatingHours: StationOperatingHour[];
  products: StationProduct[];
  orders: StationOrder[];
  analyticsOrders: AnalyticsOrder[];
  analyticsItems: AnalyticsOrderItem[];
  previousAnalyticsOrders: AnalyticsOrder[];
  analyticsStartDate: string;
  analyticsEndDate: string;
  onAnalyticsRangeChange: (startDate: string, endDate: string) => void;
  activeProducts: number;
  lowStockProducts: number;
  onNavigate: (section: PortalSection) => void;
  onAddProduct: () => void;
  onStock: (product: StationProduct) => void;
  onRefresh: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [draftStartDate, setDraftStartDate] = useState(analyticsStartDate);
  const [draftEndDate, setDraftEndDate] = useState(analyticsEndDate);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const maxAnalyticsDate = getManilaDateString();
  useEffect(() => {
    setDraftStartDate(analyticsStartDate);
    setDraftEndDate(analyticsEndDate);
    setRangeError(null);
  }, [analyticsEndDate, analyticsStartDate]);
  const selectedRange = getAnalyticsRangeBounds(analyticsStartDate, analyticsEndDate);
  const previousRange = getPreviousAnalyticsRange(analyticsStartDate, selectedRange.dayCount);
  const selectedRangeLabel = formatAnalyticsRange(analyticsStartDate, analyticsEndDate);
  const selectedDates = Array.from({ length: selectedRange.dayCount }, (_, index) =>
    addCalendarDays(analyticsStartDate, index)
  );
  const validAnalyticsOrders = analyticsOrders.filter((order) => !isCancelledOrder(order.status));
  const paidOrders = validAnalyticsOrders.filter((order) => order.payment_status === "paid");
  const previousPaidOrders = previousAnalyticsOrders.filter((order) =>
    !isCancelledOrder(order.status) && order.payment_status === "paid"
  );
  const analyticsOrderById = new Map(analyticsOrders.map((order) => [order.id, order]));
  const todayDate = getManilaDateString();
  const todayOrders = orders.filter((order) => {
    const { day, month, year } = getManilaDateParts(new Date(order.created_at));
    return `${year}-${month}-${day}` === todayDate && !isCancelledOrder(order.status);
  });
  const todayPaidOrders = todayOrders.filter((order) => order.payment_status === "paid");
  const todaySales = todayPaidOrders.reduce((total, order) => total + orderSalesAmount(order), 0);
  const todayDay = selectedRange.dayCount;
  const awaitingPaymentOrders = orders.filter((order) =>
    !isCancelledOrder(order.status)
    && ["pending", "processing"].includes(order.payment_status ?? "")
  );
  const dailySales = selectedDates.map((date, index) => ({
    day: index + 1,
    date,
    sales: 0,
  }));
  for (const order of paidOrders) {
    const { day, month, year } = getManilaDateParts(new Date(order.created_at));
    const date = `${year}-${month}-${day}`;
    const index = selectedDates.indexOf(date);
    if (index >= 0) dailySales[index].sales += orderSalesAmount(order);
  }
  const rangeSales = paidOrders.reduce((total, order) => total + orderSalesAmount(order), 0);
  const previousRangeSales = previousPaidOrders.reduce(
    (total, order) => total + orderSalesAmount(order),
    0,
  );
  const salesChangePercent = previousRangeSales > 0
    ? ((rangeSales - previousRangeSales) / previousRangeSales) * 100
    : null;
  const waterTypeSales = new Map<string, number>();
  for (const item of analyticsItems) {
    const order = analyticsOrderById.get(item.order_id);
    if (!order || isCancelledOrder(order.status)) continue;
    const waterType = item.water_type_snapshot.trim() || "Other";
    waterTypeSales.set(waterType, (waterTypeSales.get(waterType) ?? 0) + Number(item.quantity));
  }
  const topWaterTypes = [...waterTypeSales.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const topProductSizes = new Map<string, { waterType: string; containerType: string; quantity: number }>();
  for (const item of analyticsItems) {
    const order = analyticsOrderById.get(item.order_id);
    if (!order || isCancelledOrder(order.status)) continue;
    const waterType = item.water_type_snapshot.trim() || "Other";
    const containerType = item.container_type_snapshot.trim() || "Gallon";
    const key = `${waterType}\u0000${containerType}`;
    const current = topProductSizes.get(key) ?? { waterType, containerType, quantity: 0 };
    current.quantity += Number(item.quantity);
    topProductSizes.set(key, current);
  }
  const rankedProductSizes = [...topProductSizes.values()]
    .sort((left, right) => right.quantity - left.quantity)
    .slice(0, 5);
  const customerSales = new Map<string, { name: string; orders: number; sales: number }>();
  for (const order of paidOrders) {
    const customer = customerSales.get(order.customer_id) ?? {
      name: orderCustomerName(order.address_snapshot, order.order_number),
      orders: 0,
      sales: 0,
    };
    customer.orders += 1;
    customer.sales += orderSalesAmount(order);
    customerSales.set(order.customer_id, customer);
  }
  const topCustomers = [...customerSales.values()]
    .sort((left, right) => right.sales - left.sales)
    .slice(0, 5);
  const recentOrders = orders.slice(0, 5);
  const deliveredOrders = validAnalyticsOrders.filter((order) =>
    order.delivered_at && Number.isFinite(new Date(order.delivered_at).getTime())
  );
  const fulfillmentHours = deliveredOrders
    .map((order) => (
      new Date(order.delivered_at!).getTime() - new Date(order.created_at).getTime()
    ) / 3_600_000)
    .filter((hours) => hours >= 0);
  const averageFulfillmentHours = fulfillmentHours.length > 0
    ? fulfillmentHours.reduce((total, hours) => total + hours, 0) / fulfillmentHours.length
    : null;
  const lateOrders = orders.filter((order) =>
    !["delivered", "cancelled", "canceled"].includes(order.status.toLowerCase())
    && order.estimated_delivery_at !== null
    && new Date(order.estimated_delivery_at).getTime() < Date.now()
  );
  const lowStockList = products
    .filter((product) => product.status === "active" && product.stock_quantity !== null && product.stock_quantity <= 5)
    .sort((left, right) => (left.stock_quantity ?? 0) - (right.stock_quantity ?? 0))
    .slice(0, 4);
  const dailyOrders = Array.from({ length: selectedRange.dayCount }, () => 0);
  for (const order of validAnalyticsOrders) {
    const { day, month, year } = getManilaDateParts(new Date(order.created_at));
    const index = selectedDates.indexOf(`${year}-${month}-${day}`);
    if (index >= 0) dailyOrders[index] += 1;
  }
  const salesDays = dailySales.map((item, index) => ({
    day: item.day,
    date: item.date,
    sales: item.sales,
    orders: dailyOrders[index],
  }));
  const applyAnalyticsRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftStartDate || !draftEndDate || draftStartDate > draftEndDate) {
      setRangeError("Choose a valid start and end date.");
      return;
    }
    if (draftEndDate > maxAnalyticsDate) {
      setRangeError("The end date cannot be in the future.");
      return;
    }
    const dayCount = Math.floor(
      (new Date(`${draftEndDate}T00:00:00Z`).getTime()
        - new Date(`${draftStartDate}T00:00:00Z`).getTime())
        / 86_400_000,
    ) + 1;
    if (dayCount > 366) {
      setRangeError("Choose a range of up to 366 days.");
      return;
    }
    setRangeError(null);
    onAnalyticsRangeChange(draftStartDate, draftEndDate);
  };
  const applyPreset = (startDate: string, endDate: string) => {
    setDraftStartDate(startDate);
    setDraftEndDate(endDate);
    setRangeError(null);
    onAnalyticsRangeChange(startDate, endDate);
  };
  const previousDailySales = Array.from({ length: selectedRange.dayCount }, () => 0);
  for (const order of previousAnalyticsOrders) {
    if (isCancelledOrder(order.status) || order.payment_status !== "paid") continue;
    const { day, month, year } = getManilaDateParts(new Date(order.created_at));
    const orderDate = `${year}-${month}-${day}`;
    const index = Math.floor(
      (new Date(`${orderDate}T00:00:00Z`).getTime()
        - new Date(`${previousRange.start.slice(0, 10)}T00:00:00Z`).getTime())
        / 86_400_000,
    );
    if (index >= 0 && index < previousDailySales.length) {
      previousDailySales[index] += orderSalesAmount(order);
    }
  }
  const salesDelta: KpiDelta | null = salesChangePercent === null
    ? null
    : {
        text: `${salesChangePercent < 0 ? "−" : "+"}${Math.abs(salesChangePercent).toFixed(1)}%`,
        direction: salesChangePercent > 0.05 ? "up" : salesChangePercent < -0.05 ? "down" : "flat",
      };

  const totalWaterUnits = [...waterTypeSales.values()].reduce((total, quantity) => total + quantity, 0);
  const unitsLabel = (quantity: number) => `${quantity} unit${quantity === 1 ? "" : "s"}`;
  const waterTypeItems: RankItem[] = topWaterTypes.map(([name, quantity]) => ({
    key: name,
    label: name,
    value: quantity,
    valueLabel: unitsLabel(quantity),
    share: totalWaterUnits > 0 ? quantity / totalWaterUnits : undefined,
  }));
  const sizeItems: RankItem[] = rankedProductSizes.map((product) => ({
    key: `${product.waterType}-${product.containerType}`,
    label: product.waterType,
    sub: product.containerType,
    value: product.quantity,
    valueLabel: unitsLabel(product.quantity),
    share: totalWaterUnits > 0 ? product.quantity / totalWaterUnits : undefined,
  }));
  const customerItems: RankItem[] = topCustomers.map((customer, index) => ({
    key: `${customer.name}-${index}`,
    label: customer.name,
    sub: `${customer.orders} order${customer.orders === 1 ? "" : "s"}`,
    value: customer.sales,
    valueLabel: money(customer.sales),
    share: rangeSales > 0 ? customer.sales / rangeSales : undefined,
  }));

  const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekdayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Manila" });
  const weekdayCounts = weekdayNames.map(() => 0);
  for (const order of validAnalyticsOrders) {
    const index = weekdayNames.indexOf(weekdayFormat.format(new Date(order.created_at)));
    if (index >= 0) weekdayCounts[index] += 1;
  }
  const peakWeekdayCount = Math.max(...weekdayCounts, 0);
  const weekdayItems: ColumnItem[] = weekdayNames.map((name, index) => ({
    key: name,
    label: name,
    value: weekdayCounts[index],
    valueLabel: String(weekdayCounts[index]),
    detail: `order${weekdayCounts[index] === 1 ? "" : "s"} placed on ${name}s`,
    emphasis: peakWeekdayCount > 0 && weekdayCounts[index] === peakWeekdayCount,
  }));

  const deliveryBuckets = [
    { label: "<1h", under: 1 },
    { label: "1–2h", under: 2 },
    { label: "2–4h", under: 4 },
    { label: "4–8h", under: 8 },
    { label: "8–24h", under: 24 },
    { label: "24h+", under: Infinity },
  ];
  const deliveryCounts = deliveryBuckets.map(() => 0);
  for (const hours of fulfillmentHours) {
    const index = deliveryBuckets.findIndex((bucket) => hours < bucket.under);
    deliveryCounts[index] += 1;
  }
  const peakDeliveryCount = Math.max(...deliveryCounts, 0);
  const deliveryTimeItems: ColumnItem[] = deliveryBuckets.map((bucket, index) => ({
    key: bucket.label,
    label: bucket.label,
    value: deliveryCounts[index],
    valueLabel: String(deliveryCounts[index]),
    detail: `delivered order${deliveryCounts[index] === 1 ? "" : "s"} took ${bucket.label}`,
    emphasis: peakDeliveryCount > 0 && deliveryCounts[index] === peakDeliveryCount,
  }));
  const status = station?.publication_status === "published"
    ? "Live for customers"
    : readable(application.application_status);
  const stationStatusTone = station?.publication_status === "published" ? "green" : "blue";
  const draftCount = products.filter((product) => product.status !== "active").length;
  const deliveryConfigured = station?.service_radius_km !== null
    && station?.service_radius_km !== undefined
    && operatingHours.some((item) => !item.is_closed);
  const steps = [
    { done: true, icon: <Check size={14} />, title: "Station profile", subtitle: "Location and contact details saved" },
    { done: activeProducts > 0, icon: <Package size={14} />, title: "Set water and gallon pricing", subtitle: activeProducts > 0 ? `${activeProducts} active water option${activeProducts === 1 ? "" : "s"}` : products.length > 0 ? "Activate at least one water option" : "Add at least one water type" },
    { done: deliveryConfigured, icon: <MapPin size={14} />, title: "Delivery setup", subtitle: deliveryConfigured ? "Coverage and hours configured" : "Set delivery radius and at least one open day" },
    { done: application.application_status === "submitted" || application.application_status === "in_review" || application.application_status === "approved", icon: <FileCheck2 size={14} />, title: "Submit for review", subtitle: "Upload required documents" },
    { done: application.application_status === "approved" && station?.publication_status === "published", icon: <ExternalLink size={14} />, title: "Go live", subtitle: "Station verified and published" },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <>
      <PageTitle
        title={application.display_name}
        description={`${greetingForNow()}. Here’s how your station is doing.`}
        action={
          <button className="button button-secondary" type="button" onClick={() => onNavigate("application")}>
            <ClipboardList size={16} /> Application status
          </button>
        }
      />
      <div className="status-banner">
        <span className={`status-orb ${stationStatusTone}`}><Store size={17} /></span>
        <div className="status-copy">
          <strong>{station?.publication_status === "published" ? "Your station is visible to customers" : "Your station is not public yet"}</strong>
          <span>
            {station?.publication_status === "published"
              ? "Customers nearby can see active products and current prices."
              : "Complete required documents and wait for verification and publication before customers can find your listings."}
          </span>
        </div>
        <span className={`pill pill-${stationStatusTone}`}>{status}</span>
      </div>
      <section className="seller-analytics" aria-label="Sales analytics">
        <div className="analytics-title">
          <div>
            <h2>Sales analytics</h2>
            <p>Paid sales for {selectedRangeLabel}, excluding delivery fees and cancelled orders.</p>
          </div>
        </div>
        <form className="analytics-range-picker" onSubmit={applyAnalyticsRange}>
          <div className="analytics-range-inputs">
            <label>
              <span>From</span>
              <input
                type="date"
                value={draftStartDate}
                max={draftEndDate || maxAnalyticsDate}
                onChange={(event) => setDraftStartDate(event.target.value)}
                aria-label="Analytics start date"
              />
            </label>
            <span className="analytics-range-separator" aria-hidden="true">to</span>
            <label>
              <span>To</span>
              <input
                type="date"
                value={draftEndDate}
                min={draftStartDate}
                max={maxAnalyticsDate}
                onChange={(event) => setDraftEndDate(event.target.value)}
                aria-label="Analytics end date"
              />
            </label>
            <button className="button button-primary button-small" type="submit">
              <CalendarDays size={15} /> Apply range
            </button>
          </div>
          <div className="analytics-range-bottom">
            <div className="analytics-range-presets" aria-label="Quick date ranges">
              <button type="button" onClick={() => applyPreset(addCalendarDays(maxAnalyticsDate, -6), maxAnalyticsDate)}>Last 7 days</button>
              <button type="button" onClick={() => applyPreset(addCalendarDays(maxAnalyticsDate, -29), maxAnalyticsDate)}>Last 30 days</button>
              <button
                type="button"
                onClick={() => applyPreset(`${maxAnalyticsDate.slice(0, 7)}-01`, maxAnalyticsDate)}
              >This month</button>
            </div>
            <span className="analytics-range-hint">Up to 366 days · compares with the previous equal-length period</span>
          </div>
          {rangeError && <p className="analytics-range-error" role="alert">{rangeError}</p>}
        </form>
        <SectionNav items={analyticsSections} />

        <div className="viz-kpis">
          <KpiTile
            hero
            label="Paid sales in range"
            icon={<Wallet size={16} />}
            tone="green"
            value={<CountUp value={rangeSales} format={moneyWhole} />}
            delta={salesDelta}
            caption={salesChangePercent === null
              ? "No paid sales in the previous equal-length period"
              : "vs previous equal-length period"}
            spark={dailySales.map((item) => item.sales)}
            sparkLabel={`Daily paid sales, ${selectedRangeLabel}`}
          />
          <KpiTile
            label="Today's paid sales"
            icon={<Wallet size={16} />}
            tone="green"
            value={<CountUp value={todaySales} format={moneyWhole} />}
            caption={`from ${todayPaidOrders.length} paid order${todayPaidOrders.length === 1 ? "" : "s"} placed today`}
          />
          <KpiTile
            label="Orders today"
            icon={<ShoppingBag size={16} />}
            tone="blue"
            value={<CountUp value={todayOrders.length} format={wholeNumber} duration={600} />}
            caption="excluding cancelled orders"
            spark={dailyOrders}
            sparkLabel={`Orders placed per day, ${selectedRangeLabel}`}
          />
          <KpiTile
            label="Awaiting payment"
            icon={<Clock3 size={16} />}
            tone={awaitingPaymentOrders.length > 0 ? "amber" : "green"}
            value={<CountUp value={awaitingPaymentOrders.length} format={wholeNumber} duration={600} />}
            caption="among your latest 100 orders"
            action={awaitingPaymentOrders.length > 0 ? (
              <button className="text-link" type="button" onClick={() => onNavigate("orders")}>
                Review <ArrowRight size={14} />
              </button>
            ) : undefined}
          />
        </div>

        <div id="an-sales" className="viz-group">
          <SalesTrendChart
            days={salesDays}
            previousDaily={previousDailySales}
            todayDay={todayDay}
            rangeLabel={selectedRangeLabel}
            previousRangeLabel={formatAnalyticsRange(
              addCalendarDays(analyticsStartDate, -selectedRange.dayCount),
              addCalendarDays(analyticsStartDate, -1),
            )}
            previousStartDate={addCalendarDays(analyticsStartDate, -selectedRange.dayCount)}
            paidOrderCount={paidOrders.length}
            formatMoney={money}
            formatAxis={moneyCompact}
          />
        </div>

        <div id="an-products" className="viz-group">
          <div className="viz-group-head">
            <h3>Products and customers</h3>
            <p>What sells, when it sells, and who buys</p>
          </div>
          <div className="viz-pair">
            <section className="panel">
              <div className="panel-heading">
                <div><h2>Most sold water type</h2><p>Units ordered in selected range, with share of all units</p></div>
                <Droplets size={19} className="heading-icon" />
              </div>
              <RankBars items={waterTypeItems} emptyText="No water type sales in this range." />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div><h2>Popular product sizes</h2><p>Water type and gallon size combinations</p></div>
                <Package size={19} className="heading-icon" />
              </div>
              <RankBars items={sizeItems} emptyText="Product rankings will appear when customers order." />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div><h2>Orders by weekday</h2><p>When customers order most in this range</p></div>
                <ShoppingBag size={19} className="heading-icon" />
              </div>
              {validAnalyticsOrders.length === 0 ? (
                <p className="analytics-empty">Weekday patterns will appear when orders come in.</p>
              ) : (
                <MiniColumns items={weekdayItems} ariaLabel={`Orders placed per weekday, ${selectedRangeLabel}`} />
              )}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div><h2>Best customers</h2><p>Paid sales in selected range, with share of total</p></div>
                <Users size={19} className="heading-icon" />
              </div>
              <RankBars items={customerItems} emptyText="Customer rankings will appear when orders come in." />
            </section>
          </div>
        </div>

        <div id="an-delivery" className="viz-group">
          <div className="viz-group-head">
            <h3>Delivery and stock</h3>
            <p>How fast orders arrive and what needs restocking</p>
          </div>
          <div className="viz-pair">
            <section className="panel">
              <div className="panel-heading">
                <div><h2>Delivery performance</h2><p>Fulfillment time and overdue orders</p></div>
                <Truck size={19} className="heading-icon" />
              </div>
              <div className="viz-metrics">
                <div>
                  <span>Average time to deliver</span>
                  <strong>{averageFulfillmentHours === null ? "—" : `${averageFulfillmentHours.toFixed(1)} hr`}</strong>
                  <small>from order placed to delivered in selected range</small>
                </div>
                <div className={lateOrders.length > 0 ? "is-late" : ""}>
                  <span>Past estimated delivery</span>
                  <strong>{lateOrders.length}</strong>
                  <small>among your latest 100 orders</small>
                </div>
              </div>
              {fulfillmentHours.length === 0 ? (
                <p className="analytics-empty">Delivery times will appear after a delivered order in this range.</p>
              ) : (
                <>
                  <p className="viz-subtitle">Delivered orders by time taken</p>
                  <MiniColumns items={deliveryTimeItems} ariaLabel="Delivered orders grouped by delivery time" height={120} />
                </>
              )}
              {lateOrders.length > 0 && (
                <button className="text-link fulfillment-orders-link" type="button" onClick={() => onNavigate("orders")}>
                  Review overdue orders <ArrowRight size={15} />
                </button>
              )}
            </section>
            <section className="panel stock-watch-panel">
              <div className="panel-heading">
                <div><h2>Stock watch</h2><p>Active products with five or fewer units</p></div>
                <CircleAlert size={19} className="heading-icon" />
              </div>
              {lowStockList.length === 0 ? (
                <p className="analytics-empty">No active products need restocking right now.</p>
              ) : (
                <div className="stock-watch-list">
                  {lowStockList.map((product) => (
                    <div className="stock-watch-row" key={product.id}>
                      <span className="stock-watch-quantity">{product.stock_quantity}</span>
                      <strong>{product.name}</strong>
                      <button className="button button-secondary button-small" type="button" onClick={() => onStock(product)}>
                        Update stock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <div id="an-orders" className="viz-group">
          <div className="viz-group-head">
            <h3>Recent activity</h3>
            <p>Your latest customer orders</p>
          </div>
          <section className="panel recent-orders-panel">
            <div className="panel-heading">
              <div><h2>Recent orders</h2><p>Your latest customer activity</p></div>
              <button className="text-link" type="button" onClick={() => onNavigate("orders")}>
                View all <ArrowRight size={15} />
              </button>
            </div>
            {recentOrders.length === 0 ? (
              <div className="analytics-empty">New orders will show up here.</div>
            ) : (
              <div className="analytics-recent-list">
                {recentOrders.map((order) => (
                  <div className="analytics-recent-order" key={order.id}>
                    <span className="analytics-recent-icon"><ShoppingBag size={16} /></span>
                    <div className="analytics-recent-copy">
                      <strong>Order #{order.order_number}</strong>
                      <span>{orderCustomerName(order.address_snapshot, order.order_number)} · {timeAgo(order.created_at)}</span>
                    </div>
                    <span className={`pill pill-${statusTone(order.status)}`}>{readable(order.status)}</span>
                    <strong className="analytics-recent-total">{money(order.total)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
      <div className="stats-grid">
        <StatCard icon={<Package size={18} />} label="Water options" value={products.length} tone="blue" />
        <StatCard icon={<BadgeCheck size={18} />} label="Active water options" value={activeProducts} tone="green" />
        <StatCard icon={<CircleAlert size={18} />} label="Low stock" value={lowStockProducts} tone={lowStockProducts > 0 ? "amber" : "green"} />
        <StatCard icon={<Clock3 size={18} />} label="Draft / inactive" value={draftCount} tone="violet" />
      </div>
      {station && (
        <section className="panel seller-rating-summary" aria-label="Customer station ratings">
          <span className="seller-rating-icon"><Star size={20} fill="currentColor" /></span>
          <div className="seller-rating-copy">
            <span className="eyebrow">Customer station rating</span>
            <strong>
              {station.rating_count > 0
                ? `${Number(station.rating_average).toFixed(1)} / 5`
                : "No ratings yet"}
            </strong>
            <span>
              {station.rating_count} customer {station.rating_count === 1 ? "rating" : "ratings"}
            </span>
          </div>
          {station.rating_count > 0 && (
            <div className="seller-rating-stars" aria-label={`${Number(station.rating_average).toFixed(1)} out of 5 stars`}>
              {Array.from({ length: 5 }, (_, index) => (
                <Star
                  key={index}
                  size={19}
                  fill={index < Math.round(Number(station.rating_average)) ? "currentColor" : "none"}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {station && (
        <>
          <StationPhotoPanel station={station} onRefresh={onRefresh} onNotice={onNotice} />
          <StationDescriptionPanel station={station} onRefresh={onRefresh} onNotice={onNotice} />
          <StationSocialLinksPanel station={station} onRefresh={onRefresh} onNotice={onNotice} />
        </>
      )}
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Water & Gallon Pricing</h2><p>Set refill and new-gallon prices, and update availability.</p></div>
            <button className="button button-primary button-small" type="button" onClick={onAddProduct}><Package size={15} /> Set water pricing</button>
          </div>
          {products.length === 0 ? (
            <EmptyState
              icon={<Package size={21} />}
              title="No water options yet"
              description="Add a water type, set refill and new-gallon prices, and enter its starting stock."
              action={<button className="button button-primary button-small" type="button" onClick={onAddProduct}><Package size={15} /> Set water pricing</button>}
            />
          ) : (
            <ProductListPreview products={products.slice(0, 5)} onStock={onStock} onViewAll={() => onNavigate("products")} />
          )}
        </section>
        <section className="panel checklist-panel">
          <div className="panel-heading">
            <div><h2>Ready to go live?</h2><p>Finish these steps to be discoverable.</p></div>
            <span className="progress-count">{doneCount}/{steps.length}</span>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}>
            <span style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <div className="checklist">
            {steps.map((step) => (
              <ChecklistRow key={step.title} done={step.done} icon={step.icon} title={step.title} subtitle={step.subtitle} />
            ))}
          </div>
          <button className="text-link" type="button" onClick={() => onNavigate("application")}>Continue application <ArrowRight size={15} /></button>
        </section>
      </div>
      <section className="panel location-summary">
        <div className="location-illustration"><MapPin size={23} /></div>
        <div className="location-summary-copy">
          <span className="eyebrow">Station location</span>
          <strong>{application.address_line}</strong>
          <span>{[application.barangay, application.city, application.province].filter(Boolean).join(", ")}</span>
          {application.latitude !== null && application.longitude !== null && (
            <small>{application.latitude.toFixed(5)}, {application.longitude.toFixed(5)}</small>
          )}
        </div>
        <button className="button button-secondary button-small" type="button" onClick={() => onNavigate("application")}>View profile</button>
      </section>
    </>
  );
}

interface SizeDraft {
  enabled: boolean;
  refillPrice: string;
  newContainerAvailable: boolean;
  newContainerPrice: string;
  depositAmount: string;
  stockQuantity: string;
  maxOrderQuantity: string;
}

interface TypeDraft {
  offered: boolean;
  sizes: Record<string, SizeDraft>;
}

type PricingDrafts = Record<string, TypeDraft>;

const emptySizeDraft = (): SizeDraft => ({
  enabled: false,
  refillPrice: "",
  newContainerAvailable: false,
  newContainerPrice: "",
  depositAmount: "0",
  stockQuantity: "0",
  maxOrderQuantity: "10",
});

/** Builds the editable form state from the saved listings. */
function buildPricingDrafts(
  products: StationProduct[],
  waterTypes: WaterType[],
  containerTypes: ContainerType[],
): PricingDrafts {
  const drafts: PricingDrafts = {};
  for (const water of waterTypes) {
    const sizes: Record<string, SizeDraft> = {};
    let offered = false;
    for (const container of containerTypes) {
      const product = products.find(
        (item) => item.water_type_id === water.id && item.container_type_id === container.id,
      );
      if (!product) {
        sizes[container.id] = emptySizeDraft();
        continue;
      }
      const active = product.status === "active";
      if (active) offered = true;
      sizes[container.id] = {
        enabled: active,
        refillPrice: product.refill_price.toString(),
        newContainerAvailable: product.new_container_available,
        newContainerPrice: product.new_container_price?.toString() ?? "",
        depositAmount: product.deposit_amount?.toString() ?? "0",
        // Stock of an existing listing is changed with "Adjust", not here.
        stockQuantity: "",
        maxOrderQuantity: product.max_order_quantity.toString(),
      };
    }
    drafts[water.id] = { offered, sizes };
  }
  return drafts;
}

/**
 * Water & Gallon Pricing.
 * Water types and gallon sizes are platform catalogs. The owner first turns on
 * the water types the station sells, then prices each gallon size. Turning
 * something off pauses the listing (it is never deleted) so past orders and
 * carts keep working and the old prices come back if it is turned on again.
 */
function StationSocialLinksPanel({
  station,
  onRefresh,
  onNotice,
}: {
  station: Station;
  onRefresh: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [facebookUrl, setFacebookUrl] = useState(station.facebook_url ?? "");
  const [instagramUrl, setInstagramUrl] = useState(station.instagram_url ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFacebookUrl(station.facebook_url ?? "");
    setInstagramUrl(station.instagram_url ?? "");
  }, [station.facebook_url, station.instagram_url]);

  function validatedSocialUrl(value: string, platform: "facebook" | "instagram"): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error(`Enter a complete https:// ${platform} profile link.`);
    }
    const host = url.hostname.toLowerCase();
    const validHost = platform === "facebook"
      ? host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host.endsWith(".fb.com")
      : host === "instagram.com" || host.endsWith(".instagram.com");
    if (url.protocol !== "https:" || !validHost) {
      throw new Error(`Use a secure ${platform} profile link.`);
    }
    return url.toString();
  }

  async function saveSocialLinks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      onNotice({ kind: "error", text: "Supabase is not configured. Social links could not be saved." });
      return;
    }
    let facebook: string | null;
    let instagram: string | null;
    try {
      facebook = validatedSocialUrl(facebookUrl, "facebook");
      instagram = validatedSocialUrl(instagramUrl, "instagram");
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Check the social profile links." });
      return;
    }

    setSaving(true);
    onNotice(null);
    try {
      const { data, error } = await supabase
        .from("stations")
        .update({ facebook_url: facebook, instagram_url: instagram })
        .eq("id", station.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Social links were not saved. Check that you can manage this station.");
      onNotice({ kind: "success", text: "Station social links saved." });
      onRefresh();
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Station social links could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel station-description-panel">
      <div className="panel-heading">
        <div><h2>Station socials</h2><p>Add public Facebook or Instagram links for customers. Leave either field blank if you don’t use it.</p></div>
      </div>
      <form className="station-description-form" onSubmit={(event) => void saveSocialLinks(event)}>
        <label htmlFor="station-facebook">Facebook profile or page URL</label>
        <input
          id="station-facebook"
          type="url"
          inputMode="url"
          value={facebookUrl}
          onChange={(event) => setFacebookUrl(event.target.value)}
          placeholder="https://facebook.com/your-station"
          autoComplete="url"
        />
        <label htmlFor="station-instagram">Instagram profile URL</label>
        <input
          id="station-instagram"
          type="url"
          inputMode="url"
          value={instagramUrl}
          onChange={(event) => setInstagramUrl(event.target.value)}
          placeholder="https://instagram.com/your-station"
          autoComplete="url"
        />
        <div className="station-description-footer">
          <span className="field-hint">Customers will see these links on your public station screen.</span>
          <button className="button button-primary button-small" type="submit" disabled={saving} aria-busy={saving}>
            {saving ? <span className="spinner spinner-light" /> : null}
            {saving ? "Saving…" : "Save socials"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ProductsSection({
  station,
  products,
  waterTypes,
  containerTypes,
  onStock,
  onRefresh,
  onNotice,
}: {
  station: Station | null;
  products: StationProduct[];
  waterTypes: WaterType[];
  containerTypes: ContainerType[];
  onStock: (product: StationProduct) => void;
  onRefresh: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const initialKey = useMemo(
    () => JSON.stringify(buildPricingDrafts(products, waterTypes, containerTypes)),
    [products, waterTypes, containerTypes],
  );
  const [drafts, setDrafts] = useState<PricingDrafts>(() => JSON.parse(initialKey) as PricingDrafts);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(drafts) !== initialKey;

  // Reset the form whenever the saved data changes (after saving or refreshing).
  useEffect(() => {
    setDrafts(JSON.parse(initialKey) as PricingDrafts);
  }, [initialKey]);

  const productFor = (waterId: string, containerId: string) =>
    products.find((item) => item.water_type_id === waterId && item.container_type_id === containerId);

  function setOffered(waterId: string, offered: boolean) {
    setDrafts((current) => {
      const type = current[waterId];
      if (!type) return current;
      let sizes = type.sizes;
      const first = containerTypes[0];
      if (offered && first && !Object.values(sizes).some((size) => size.enabled)) {
        sizes = { ...sizes, [first.id]: { ...sizes[first.id], enabled: true } };
      }
      return { ...current, [waterId]: { offered, sizes } };
    });
  }

  function updateSize(waterId: string, containerId: string, patch: Partial<SizeDraft>) {
    setDrafts((current) => ({
      ...current,
      [waterId]: {
        ...current[waterId],
        sizes: {
          ...current[waterId].sizes,
          [containerId]: { ...current[waterId].sizes[containerId], ...patch },
        },
      },
    }));
  }

  function copyPrices(toWaterId: string, fromWaterId: string) {
    setDrafts((current) => {
      const source = current[fromWaterId];
      const target = current[toWaterId];
      if (!source || !target) return current;
      const sizes = { ...target.sizes };
      for (const container of containerTypes) {
        const from = source.sizes[container.id];
        if (!from.enabled) continue;
        const keepStock = productFor(toWaterId, container.id) ? "" : (sizes[container.id].stockQuantity || "0");
        sizes[container.id] = { ...from, enabled: true, stockQuantity: keepStock };
      }
      return { ...current, [toWaterId]: { offered: true, sizes } };
    });
  }

  async function save() {
    if (!supabase || !station) return;

    const writes: Array<{
      water: WaterType;
      container: ContainerType;
      draft: SizeDraft;
      existing: StationProduct | undefined;
      refillPrice: number;
      newContainerPrice: number;
      deposit: number;
      stock: number;
      maxOrder: number;
    }> = [];
    const pauseIds: string[] = [];

    for (const water of waterTypes) {
      const type = drafts[water.id];
      if (!type) continue;
      if (type.offered && !containerTypes.some((container) => type.sizes[container.id]?.enabled)) {
        onNotice({ kind: "error", text: `Choose at least one gallon size for ${water.name}, or turn it off.` });
        return;
      }
      for (const container of containerTypes) {
        const draft = type.sizes[container.id];
        const matches = products.filter(
          (item) => item.water_type_id === water.id && item.container_type_id === container.id,
        );
        const sell = type.offered && draft.enabled;
        if (!sell) {
          for (const item of matches) if (item.status !== "inactive") pauseIds.push(item.id);
          continue;
        }
        if (matches.length > 1) {
          onNotice({
            kind: "error",
            text: `More than one ${water.name} ${containerTypeLabel(container)} listing exists. Ask AquaDirect support to merge them before saving this size.`,
          });
          return;
        }
        const refillPrice = Number(draft.refillPrice);
        const newContainerPrice = Number(draft.newContainerPrice);
        const deposit = Number(draft.depositAmount);
        const stock = Number(draft.stockQuantity === "" ? "0" : draft.stockQuantity);
        const maxOrder = Number(draft.maxOrderQuantity);
        if (draft.refillPrice.trim() === ""
          || !Number.isFinite(refillPrice) || refillPrice < 0
          || (draft.newContainerAvailable
            && (draft.newContainerPrice.trim() === "" || !Number.isFinite(newContainerPrice) || newContainerPrice < 0))
          || !Number.isFinite(deposit) || deposit < 0
          || !Number.isInteger(stock) || stock < 0
          || !Number.isInteger(maxOrder) || maxOrder < 1 || maxOrder > 50) {
          onNotice({
            kind: "error",
            text: `Check the prices, stock and order limit for ${water.name} · ${containerTypeLabel(container)}.`,
          });
          return;
        }
        writes.push({ water, container, draft, existing: matches[0], refillPrice, newContainerPrice, deposit, stock, maxOrder });
      }
    }

    setBusy(true);
    onNotice(null);
    let saved = 0;
    try {
      for (const item of writes) {
        const { water, container, draft, existing, refillPrice, newContainerPrice, deposit, stock, maxOrder } = item;
        const requiresEmptyContainer = existing?.requires_empty_container ?? true;
        const returnPolicy = existing?.return_policy ?? null;
        const policy = await supabase.from("container_policies").upsert({
          station_id: station.id,
          container_type_id: container.id,
          requires_empty_return: requiresEmptyContainer,
          deposit_amount: deposit,
          return_policy: returnPolicy,
          is_active: true,
        }, { onConflict: "station_id,container_type_id" });
        if (policy.error) throw policy.error;

        const values = {
          station_id: station.id,
          water_type_id: water.id,
          container_type_id: container.id,
          name: `${water.name} ${containerTypeLabel(container)}`,
          description: existing?.description ?? null,
          refill_available: true,
          refill_price: refillPrice,
          new_container_available: draft.newContainerAvailable,
          new_container_price: draft.newContainerAvailable ? newContainerPrice : null,
          deposit_amount: deposit,
          requires_empty_container: requiresEmptyContainer,
          return_policy: returnPolicy,
          max_order_quantity: maxOrder,
          status: "active",
        };
        const result = existing
          ? await supabase.from("station_products").update(values).eq("id", existing.id).eq("station_id", station.id)
          : await supabase.from("station_products").insert({ ...values, stock_quantity: stock });
        if (result.error) throw result.error;
        saved++;
      }
      if (pauseIds.length > 0) {
        const paused = await supabase.from("station_products")
          .update({ status: "inactive" })
          .in("id", pauseIds)
          .eq("station_id", station.id);
        if (paused.error) throw paused.error;
      }
      onNotice({ kind: "success", text: "Water prices saved." });
      onRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Water pricing could not be saved.";
      onNotice({
        kind: "error",
        text: saved > 0
          ? `${saved} size${saved === 1 ? " was" : "s were"} saved before an error: ${message} Refresh, then save again.`
          : message,
      });
    } finally {
      setBusy(false);
    }
  }

  const activeListings = products.filter((item) => item.status === "active").length;
  const offeredTypes = waterTypes.filter((water) => drafts[water.id]?.offered);

  function typeSummary(water: WaterType) {
    const type = drafts[water.id];
    if (!type?.offered) return water.description ?? "Not offered";
    const enabled = containerTypes.filter((container) => type.sizes[container.id]?.enabled);
    const prices = enabled
      .map((container) => Number(type.sizes[container.id].refillPrice))
      .filter((value) => Number.isFinite(value) && value > 0);
    const count = `${enabled.length} size${enabled.length === 1 ? "" : "s"}`;
    return prices.length > 0 ? `${count} · from ${money(Math.min(...prices))}` : `${count} · set prices below`;
  }

  return (
    <>
      <PageTitle
        title="Water & Gallon Pricing"
        description="Choose the water you offer and set a refill price for each size. Optional new-gallon totals include the container charge and deposit."
      />
      {!station || station.publication_status !== "published" ? (
        <div className="info-strip"><CircleAlert size={17} /><span>
          {station?.verification_status === "verified"
            ? "Your station is approved, but it has not been published yet. An administrator must publish it before customers can see these prices."
            : "Your prices are saved, but customers will only see them after the station is approved and published."}
        </span></div>
      ) : null}

      {waterTypes.length === 0 || containerTypes.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={<Droplets size={21} />}
            title="Water types are not available yet"
            description="AquaDirect has not added water types or gallon sizes. Please contact support."
          />
        </section>
      ) : (
        <>
          <section className="panel offer-panel">
            <div className="panel-heading">
              <div>
                <h2><span className="step-dot">1</span> Water you offer</h2>
                <p>Turn on each type of water your station sells. Missing one? Ask AquaDirect to add it.</p>
              </div>
              <span className="pill pill-blue">{activeListings} live listing{activeListings === 1 ? "" : "s"}</span>
            </div>
            <div className="offer-grid">
              {waterTypes.map((water) => {
                const offered = drafts[water.id]?.offered ?? false;
                return (
                  <div className={`offer-card ${offered ? "offer-card-on" : ""}`} key={water.id}>
                    <span className="offer-icon"><Droplets size={19} /></span>
                    <div className="offer-copy"><strong>{water.name}</strong><small>{typeSummary(water)}</small></div>
                    <button
                      className="switch"
                      type="button"
                      role="switch"
                      aria-checked={offered}
                      aria-label={`Offer ${water.name}`}
                      onClick={() => setOffered(water.id, !offered)}
                    ><span /></button>
                  </div>
                );
              })}
            </div>
          </section>

          {offeredTypes.length === 0 ? (
            <section className="panel type-empty">
              <p><strong>2 · Set your prices</strong></p>
              <p className="muted">Turn on a water type above and its gallon sizes will appear here.</p>
            </section>
          ) : offeredTypes.map((water) => {
            const type = drafts[water.id];
            const others = offeredTypes.filter((item) => item.id !== water.id);
            return (
              <section className="panel type-panel" key={water.id}>
                <div className="type-head">
                  <div className="type-title">
                    <span className="offer-icon"><Droplets size={18} /></span>
                    <div><h2>{water.name}</h2><p>Set a refill price for each size you sell.</p></div>
                  </div>
                  {others.length > 0 && (
                    <label className="copy-from">
                      <span className="sr-only">Copy prices from another water type</span>
                      <select
                        value=""
                        onChange={(event) => {
                          if (event.target.value) copyPrices(water.id, event.target.value);
                        }}
                      >
                        <option value="">Copy prices from…</option>
                        {others.map((other) => <option key={other.id} value={other.id}>{other.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
                <div className="price-table-wrap">
                  <table className="price-table">
                    <thead>
                      <tr><th>Gallon size</th><th>Refill price</th><th>New gallon</th><th>Stock</th><th>Max per order</th></tr>
                    </thead>
                    <tbody>
                      {containerTypes.map((container) => {
                        const draft = type.sizes[container.id];
                        const existing = productFor(water.id, container.id);
                        const label = containerTypeLabel(container);
                        const off = !draft.enabled;
                        const hasNewGallonPrices =
                          draft.refillPrice.trim() !== ""
                          && draft.newContainerPrice.trim() !== ""
                          && Number.isFinite(Number(draft.refillPrice))
                          && Number.isFinite(Number(draft.newContainerPrice))
                          && Number.isFinite(Number(draft.depositAmount));
                        const newGallonTotal = Number(draft.refillPrice)
                          + Number(draft.newContainerPrice)
                          + Number(draft.depositAmount);
                        return (
                          <tr className={off ? "row-off" : ""} key={container.id}>
                            <td data-label="Gallon size">
                              <div className="size-cell">
                                <button
                                  className="switch"
                                  type="button"
                                  role="switch"
                                  aria-checked={draft.enabled}
                                  aria-label={`Sell ${water.name} in ${label}`}
                                  onClick={() => updateSize(water.id, container.id, { enabled: !draft.enabled })}
                                ><span /></button>
                                <span><strong>{label}</strong><small>{draft.enabled ? "On sale" : "Not sold"}</small></span>
                              </div>
                            </td>
                            <td data-label="Refill price">
                              <div className="input-prefix compact"><span>₱</span>
                                <input
                                  aria-label={`${water.name} ${label} refill price`}
                                  type="number" min="0" step="0.01" inputMode="decimal"
                                  disabled={off}
                                  value={draft.refillPrice}
                                  onChange={(event) => updateSize(water.id, container.id, { refillPrice: event.target.value })}
                                  placeholder="e.g. 35.00"
                                />
                              </div>
                            </td>
                            <td data-label="New gallon">
                              <label className="mini-check">
                                <input
                                  type="checkbox"
                                  disabled={off}
                                  checked={draft.newContainerAvailable}
                                  onChange={(event) => updateSize(water.id, container.id, { newContainerAvailable: event.target.checked })}
                                />
                                Offer a new gallon
                              </label>
                              {!off && draft.newContainerAvailable && (
                                <div className="new-gallon-inputs">
                                  <label className="mini-field"><small>Charge</small>
                                    <div className="input-prefix compact"><span>₱</span>
                                      <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`${water.name} ${label} new gallon charge`} value={draft.newContainerPrice} onChange={(event) => updateSize(water.id, container.id, { newContainerPrice: event.target.value })} placeholder="180" />
                                    </div>
                                  </label>
                                  <label className="mini-field"><small>Deposit</small>
                                    <div className="input-prefix compact"><span>₱</span>
                                      <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`${water.name} ${label} refundable deposit`} value={draft.depositAmount} onChange={(event) => updateSize(water.id, container.id, { depositAmount: event.target.value })} />
                                    </div>
                                  </label>
                                </div>
                              )}
                              {!off && draft.newContainerAvailable && (
                                <small className="new-gallon-total" aria-live="polite">
                                  {hasNewGallonPrices
                                    ? `Customer total: ${money(newGallonTotal)} per gallon`
                                    : "Customer total = refill price + container charge + deposit"}
                                </small>
                              )}
                            </td>
                            <td data-label="Stock">
                              {existing ? (
                                existing.stock_quantity === null ? <span className="stock-unlimited">Not tracked</span> : (
                                  <button className={`stock-value ${existing.stock_quantity === 0 ? "stock-out" : existing.stock_quantity <= 5 ? "stock-low" : ""}`} type="button" onClick={() => onStock(existing)}>
                                    <span className="stock-dot" />{existing.stock_quantity === 0 ? "Out of stock" : `${existing.stock_quantity} units`} <span className="stock-edit">Adjust</span>
                                  </button>
                                )
                              ) : (
                                <input
                                  className="compact-input"
                                  aria-label={`${water.name} ${label} starting stock`}
                                  type="number" min="0" step="1" inputMode="numeric"
                                  disabled={off}
                                  value={draft.stockQuantity}
                                  onChange={(event) => updateSize(water.id, container.id, { stockQuantity: event.target.value })}
                                  placeholder="Starting stock"
                                />
                              )}
                            </td>
                            <td data-label="Max per order">
                              <input
                                className="compact-input"
                                aria-label={`${water.name} ${label} maximum per order`}
                                type="number" min="1" max="50" step="1" inputMode="numeric"
                                disabled={off}
                                value={draft.maxOrderQuantity}
                                onChange={(event) => updateSize(water.id, container.id, { maxOrderQuantity: event.target.value })}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}

      <div className={`save-bar ${dirty ? "save-bar-visible" : ""}`} role="region" aria-label="Unsaved pricing changes">
        <p><span className="unsaved-dot" /> <strong>You have unsaved changes.</strong> <span className="muted">Customers see updates after you save.</span></p>
        <div className="save-bar-actions">
          <button className="button button-quiet" type="button" disabled={busy} onClick={() => setDrafts(JSON.parse(initialKey) as PricingDrafts)}>Discard</button>
          <button className="button button-primary" type="button" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? <span className="spinner spinner-light" /> : <Check size={16} />} Save changes
          </button>
        </div>
      </div>
    </>
  );
}

function DeliveryRidersSection({
  riders,
  onSave,
  onDelete,
}: {
  riders: StationRider[];
  onSave: (riderId: string | null, name: string, phone: string) => Promise<boolean>;
  onDelete: (riderId: string) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setPhone("");
  };

  const startEditing = (rider: StationRider) => {
    setEditingId(rider.id);
    setName(rider.name);
    setPhone(rider.phone);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await onSave(editingId, name.trim(), phone.trim());
      if (saved) resetForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageTitle
        title="Delivery riders"
        description="Save rider names and phone numbers for this station. Rider records do not create rider-app accounts or enable GPS tracking."
      />
      <section className="panel rider-form-panel">
        <div className="section-heading">
          <div>
            <h2>{editingId ? "Edit rider details" : "Add a delivery rider"}</h2>
            <p className="muted">Rider numbers are assigned automatically and stay with each station.</p>
          </div>
        </div>
        <form className="rider-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>Rider name</span>
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Full name"
            />
          </label>
          <label>
            <span>Phone number</span>
            <input
              required
              maxLength={32}
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="e.g. 09XXXXXXXXX"
            />
          </label>
          <div className="rider-form-actions">
            {editingId && (
              <button className="button button-secondary" type="button" onClick={resetForm} disabled={saving}>
                Cancel
              </button>
            )}
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? <span className="spinner spinner-light" /> : editingId ? <Save size={15} /> : <Plus size={16} />}
              {editingId ? "Save changes" : "Add rider"}
            </button>
          </div>
        </form>
      </section>
      {riders.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={<Users size={21} />}
            title="No delivery riders added"
            description="Add a rider here to make them available for assignment to ready orders."
          />
        </section>
      ) : (
        <div className="rider-list">
          {riders.map((rider) => (
            <article className="panel rider-card" key={rider.id}>
              <span className="rider-number">Rider {String(rider.rider_number).padStart(2, "0")}</span>
              <div className="rider-card-details">
                <strong>{rider.name}</strong>
                <a href={`tel:${rider.phone}`}><Phone size={14} />{rider.phone}</a>
              </div>
              <div className="rider-card-actions">
                <button className="button button-secondary button-small" type="button" onClick={() => startEditing(rider)}>
                  <Pencil size={14} /> Edit
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove Rider ${String(rider.rider_number).padStart(2, "0")}`}
                  title="Remove rider"
                  onClick={() => {
                    if (window.confirm(`Remove Rider ${String(rider.rider_number).padStart(2, "0")} from this station? Existing order delivery details will be retained.`)) {
                      void onDelete(rider.id);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

type OrderFilter = "active" | "completed" | "cancelled" | "all";

const orderFilterOptions: Array<{ value: OrderFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

const cancelReasons = [
  "Customer asked to cancel",
  "Out of stock",
  "Can't reach the customer",
  "Outside our delivery area",
];

function orderBucket(order: StationOrder): Exclude<OrderFilter, "all"> {
  if (order.status === "delivered") return "completed";
  if (order.status === "cancelled") return "cancelled";
  return "active";
}

const orderHasRider = (order: StationOrder) => Boolean(order.rider_name && order.rider_phone);

function riderLabelFor(order: StationOrder) {
  const number = order.rider_number === null ? "" : `Rider ${String(order.rider_number).padStart(2, "0")}`;
  return [number, order.rider_name].filter(Boolean).join(" · ") || "Your rider";
}

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "R";
}

function orderItemsSummary(order: StationOrder) {
  if (order.items.length === 0) return "Items not available";
  const first = `${order.items[0].quantity}× ${order.items[0].product_name_snapshot}`;
  return order.items.length > 1 ? `${first} +${order.items.length - 1} more` : first;
}

interface OrderStep {
  title: string;
  description: string;
  label: string;
  status: string | null;
  needsRider: boolean;
  waiting: boolean;
}

/** What the station admin should do next for an order, in plain words. */
function getOrderStep(order: StationOrder): OrderStep | null {
  const waiting = order.payment_method === "paymongo" && order.payment_status !== "paid";
  const hasRider = orderHasRider(order);
  switch (order.status) {
    case "pending":
      return waiting
        ? { title: "Waiting for payment", description: "You can confirm this order as soon as PayMongo confirms the payment.", label: "Confirm order", status: "confirmed", needsRider: false, waiting }
        : { title: "Confirm this order", description: "Check the items and delivery address, then confirm so the customer knows you have it.", label: "Confirm order", status: "confirmed", needsRider: false, waiting };
    case "confirmed":
      return { title: "Start preparing", description: "Fill and pack the containers for this order.", label: "Start preparing", status: "preparing", needsRider: false, waiting };
    case "preparing":
      return { title: "Mark it ready", description: "Once everything is packed and waiting to go out, mark it ready.", label: "Mark ready", status: "ready", needsRider: false, waiting };
    case "ready":
    case "rider_assigned":
      return hasRider
        ? { title: "Start the delivery", description: `${riderLabelFor(order)} will deliver this order. Start the delivery when they leave your station.`, label: "Start delivery", status: "out_for_delivery", needsRider: false, waiting }
        : { title: "Assign a rider", description: "Choose who will deliver this order. You'll start the delivery right after.", label: "Assign rider", status: null, needsRider: true, waiting };
    case "out_for_delivery":
      return {
        title: "On the way",
        description: order.payment_method === "cod"
          ? `Collect ${money(order.total)} in cash on delivery, then mark it delivered.`
          : "Mark it delivered once the customer has received the order.",
        label: "Mark delivered", status: "delivered", needsRider: false, waiting,
      };
    default:
      return null;
  }
}

function RiderPicker({
  riders,
  selectedId,
  onSelect,
  onManageRiders,
}: {
  riders: StationRider[];
  selectedId: string;
  onSelect: (riderId: string) => void;
  onManageRiders: () => void;
}) {
  if (riders.length === 0) {
    return (
      <div className="so-rider-empty">
        <span><Truck size={18} /></span>
        <div>
          <strong>No riders yet</strong>
          <p>Add a rider first, then come back to assign this order.</p>
        </div>
        <button className="button button-secondary button-small" type="button" onClick={onManageRiders}>Add a rider</button>
      </div>
    );
  }
  return (
    <div className="so-rider-list" role="radiogroup" aria-label="Choose a delivery rider">
      {riders.map((rider) => (
        <label className={`so-rider ${selectedId === rider.id ? "is-selected" : ""}`} key={rider.id}>
          <input type="radio" name="station-order-rider" value={rider.id} checked={selectedId === rider.id} onChange={() => onSelect(rider.id)} />
          <span className="so-rider-avatar">{initialsOf(rider.name)}</span>
          <span className="so-rider-info">
            <strong>{rider.name}</strong>
            <small>Rider {String(rider.rider_number).padStart(2, "0")} · {rider.phone}</small>
          </span>
          <span className="so-rider-check"><Check size={14} strokeWidth={3} /></span>
        </label>
      ))}
    </div>
  );
}

function CancelOrderDialog({
  order,
  busy,
  onConfirm,
  onClose,
}: {
  order: StationOrder;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<string>("");
  const [other, setOther] = useState("");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const reason = choice === "other" ? other.trim() : choice;
  return (
    <div className="modal-backdrop so-above" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal so-cancel" role="dialog" aria-modal="true" aria-label={`Cancel order ${order.order_number}`}>
        <header className="modal-header">
          <h2>Cancel order #{order.order_number}?</h2>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="so-cancel-body">
          <p>Pick a reason. It is saved with the cancellation, and the customer is told the order was cancelled.</p>
          <div className="so-reasons" role="radiogroup" aria-label="Cancellation reason">
            {[...cancelReasons, "other"].map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={choice === item}
                className={`so-reason ${choice === item ? "is-selected" : ""}`}
                onClick={() => setChoice(item)}
              >
                {item === "other" ? "Something else" : item}
              </button>
            ))}
          </div>
          {choice === "other" && (
            <textarea
              className="so-reason-text"
              rows={3}
              maxLength={240}
              autoFocus
              value={other}
              onChange={(event) => setOther(event.target.value)}
              placeholder="Tell us what happened"
              aria-label="Cancellation reason"
            />
          )}
        </div>
        <footer className="so-cancel-actions">
          <button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Keep order</button>
          <button className="button so-danger" type="button" disabled={!reason || busy} onClick={() => onConfirm(reason)}>
            {busy ? <span className="spinner spinner-light" /> : <X size={15} />} Cancel order
          </button>
        </footer>
      </section>
    </div>
  );
}

function StationOrdersSection({
  orders,
  stationName,
  riders,
  onRefresh,
  refreshing,
  restoredOrderId,
  onDismissOrder,
  updatingOrderId,
  onUpdateOrderStatus,
  onCancelOrder,
  onAssignRider,
  onManageRiders,
}: {
  orders: StationOrder[];
  stationName: string;
  riders: StationRider[];
  onRefresh: () => void;
  refreshing: boolean;
  restoredOrderId: string | null;
  onDismissOrder: (orderId: string) => void;
  updatingOrderId: string | null;
  onUpdateOrderStatus: (order: StationOrder, status: string) => void;
  onCancelOrder: (order: StationOrder, reason: string) => Promise<boolean>;
  onAssignRider: (order: StationOrder, riderId: string) => Promise<boolean>;
  onManageRiders: () => void;
}) {
  const [filter, setFilter] = useState<OrderFilter>("active");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<StationOrder | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const cancelOrder = cancelTarget ? orders.find((order) => order.id === cancelTarget.id) ?? null : null;

  const counts = useMemo(() => {
    const result = { active: 0, completed: 0, cancelled: 0, all: orders.length };
    for (const order of orders) result[orderBucket(order)] += 1;
    return result;
  }, [orders]);
  const needsYou = useMemo(
    () => orders.filter((order) => orderBucket(order) === "active" && !getOrderStep(order)?.waiting).length,
    [orders],
  );
  const visibleOrders = filter === "all" ? orders : orders.filter((order) => orderBucket(order) === filter);

  const hideOrder = (order: StationOrder) => {
    setSelectedOrderId(null);
    const card = listRef.current?.querySelector<HTMLElement>(`[data-order-id="${order.id}"]`);
    card?.style.setProperty("--so-h", `${card.offsetHeight}px`);
    setLeavingIds((current) => new Set(current).add(order.id));
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => {
      onDismissOrder(order.id);
      setLeavingIds((current) => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
    }, reduceMotion ? 0 : 400);
  };

  const emptyCopy: Record<OrderFilter, { title: string; description: string }> = {
    active: counts.all === 0
      ? { title: "No customer orders yet", description: "New orders show up here the moment a customer places one." }
      : { title: "You're all caught up", description: "Nothing needs your attention right now. Finished orders are under Completed." },
    completed: { title: "No completed orders", description: "Delivered orders will be listed here." },
    cancelled: { title: "No cancelled orders", description: "Cancelled and failed checkouts will be listed here." },
    all: { title: "No customer orders yet", description: "New orders show up here the moment a customer places one." },
  };

  return (
    <>
      <PageTitle
        title="Station orders"
        description={`Latest 100 orders for ${stationName}.`}
        action={
          <button className="button button-secondary" type="button" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? "spin" : ""} /> Refresh
          </button>
        }
      />

      <div className="so-toolbar">
        <div className="so-tabs" role="group" aria-label="Filter orders">
          {orderFilterOptions.map((option) => (
            <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>
              {option.label}<span>{counts[option.value]}</span>
            </button>
          ))}
        </div>
        <span className={`so-live ${needsYou > 0 ? "has-work" : ""}`}>
          <i />{needsYou > 0 ? `${needsYou} order${needsYou === 1 ? "" : "s"} need${needsYou === 1 ? "s" : ""} you` : "Live · up to date"}
        </span>
      </div>

      {visibleOrders.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={<ShoppingBag size={21} />}
            title={emptyCopy[filter].title}
            description={emptyCopy[filter].description}
            action={filter === "active" && counts.completed > 0
              ? <button className="button button-secondary button-small" type="button" onClick={() => setFilter("completed")}>View completed orders</button>
              : undefined}
          />
        </section>
      ) : (
        <div className="so-list" ref={listRef}>
          {visibleOrders.map((order) => {
            const address = order.address_snapshot ?? {};
            const customerName = typeof address.recipient_name === "string" && address.recipient_name.trim()
              ? address.recipient_name
              : "Customer";
            const bucket = orderBucket(order);
            const step = getOrderStep(order);
            const paymentLabel = order.payment_method === "cod"
              ? "Cash on delivery"
              : order.payment_method === "paymongo" ? "PayMongo" : readable(order.payment_method);
            const leaving = leavingIds.has(order.id);
            return (
              <article
                className={`panel so-card ${leaving ? "is-leaving" : ""} ${restoredOrderId === order.id ? "is-restored" : ""}`}
                data-order-id={order.id}
                data-bucket={bucket}
                key={order.id}
              >
                <button className="so-card-main" type="button" onClick={() => setSelectedOrderId(order.id)} aria-label={`Open order ${order.order_number} from ${customerName}`}>
                  <div className="so-card-top">
                    <div className="so-card-who">
                      <span className="so-card-num">Order #{order.order_number}</span>
                      <h2>{customerName}</h2>
                      <span className="so-card-time">{timeAgo(order.created_at)}</span>
                    </div>
                    <div className="so-card-money">
                      <strong>{money(order.total)}</strong>
                      <span className={`pill pill-${statusTone(order.status)}`}>{readable(order.status)}</span>
                    </div>
                  </div>
                  <p className="so-card-items"><Droplets size={14} /> {orderItemsSummary(order)}</p>
                  <div className="so-card-foot">
                    <span className="so-card-meta">
                      {paymentLabel}
                      <i />{order.delivery_fee === 0 ? "Free delivery" : `${money(order.delivery_fee)} delivery`}
                      {orderHasRider(order) && <><i /><Truck size={12} /> {riderLabelFor(order)}</>}
                    </span>
                    {step ? (
                      <span className={`so-card-next ${step.waiting ? "is-waiting" : step.needsRider ? "is-urgent" : ""}`}>
                        {step.waiting ? "Waiting for payment" : step.needsRider ? "Assign rider" : step.label}
                        <ArrowRight size={14} />
                      </span>
                    ) : (
                      <span className="so-card-next is-done"><Eye size={14} /> View details</span>
                    )}
                  </div>
                </button>
                {bucket !== "active" && (
                  <button
                    className="icon-button so-card-trash"
                    type="button"
                    aria-label={`Hide order ${order.order_number} from your list`}
                    title="Hide from my list"
                    disabled={leaving}
                    onClick={() => hideOrder(order)}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {selectedOrder && (
        <StationOrderDetailDrawer
          key={selectedOrder.id}
          order={selectedOrder}
          updating={updatingOrderId === selectedOrder.id}
          onClose={() => setSelectedOrderId(null)}
          onHide={() => hideOrder(selectedOrder)}
          onUpdateStatus={(status) => onUpdateOrderStatus(selectedOrder, status)}
          onRequestCancel={() => setCancelTarget(selectedOrder)}
          riders={riders}
          onAssignRider={(riderId) => onAssignRider(selectedOrder, riderId)}
          onManageRiders={onManageRiders}
        />
      )}
      {cancelOrder && (
        <CancelOrderDialog
          order={cancelOrder}
          busy={updatingOrderId === cancelOrder.id}
          onClose={() => setCancelTarget(null)}
          onConfirm={(reason) => {
            void onCancelOrder(cancelOrder, reason).then((cancelled) => {
              if (cancelled) setCancelTarget(null);
            });
          }}
        />
      )}
    </>
  );
}

const orderTrackerSteps = [
  { key: "pending", label: "Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "On the way" },
  { key: "delivered", label: "Delivered" },
] as const;

function StationOrderDetailDrawer({
  order,
  updating,
  onClose,
  onHide,
  onUpdateStatus,
  onRequestCancel,
  riders,
  onAssignRider,
  onManageRiders,
}: {
  order: StationOrder;
  updating: boolean;
  onClose: () => void;
  onHide: () => void;
  onUpdateStatus: (status: string) => void;
  onRequestCancel: () => void;
  riders: StationRider[];
  onAssignRider: (riderId: string) => Promise<boolean>;
  onManageRiders: () => void;
}) {
  const [changingRider, setChangingRider] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const address = order.address_snapshot ?? {};
  const customerName = typeof address.recipient_name === "string" && address.recipient_name.trim() ? address.recipient_name : "Customer";
  const customerPhone = typeof address.phone === "string"
    ? address.phone
    : typeof address.recipient_phone === "string" ? address.recipient_phone : "";
  const addressText = [
    address.address_line, address.barangay, address.city, address.province, address.region, address.postal_code,
  ].filter((part): part is string => typeof part === "string" && part.trim().length > 0).join(", ");
  const addressLabel = typeof address.label === "string" ? address.label.trim() : "";
  const landmark = typeof address.landmark === "string" ? address.landmark.trim() : "";
  const latitude = typeof address.latitude === "number" && Number.isFinite(address.latitude) && address.latitude >= -90 && address.latitude <= 90
    ? address.latitude : null;
  const longitude = typeof address.longitude === "number" && Number.isFinite(address.longitude) && address.longitude >= -180 && address.longitude <= 180
    ? address.longitude : null;
  const mapUrl = latitude !== null && longitude !== null
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` : null;
  const customerNotes = order.customer_notes?.trim() ?? "";

  const step = getOrderStep(order);
  const bucket = orderBucket(order);
  const hasRider = orderHasRider(order);
  const canCancel = ["pending", "confirmed", "preparing", "ready", "rider_assigned"].includes(order.status);
  const canChangeRider = hasRider && ["ready", "rider_assigned"].includes(order.status);
  const showPicker = Boolean(step?.needsRider) || changingRider;
  const progressStatus = order.status === "rider_assigned" ? "ready" : order.status;
  const currentIndex = orderTrackerSteps.findIndex((item) => item.key === progressStatus);
  const paymentText = order.payment_method === "cod"
    ? "Cash on delivery"
    : `${readable(order.payment_method)} · ${paymentStatusLabel(order.payment_status)}`;

  const assignSelected = () => {
    void onAssignRider(selectedRiderId).then((assigned) => {
      if (assigned) {
        setChangingRider(false);
        setSelectedRiderId("");
      }
    });
  };

  return (
    <div
      className="station-order-detail-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section className="station-order-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="station-order-detail-title">
        <header className="station-order-detail-header">
          <div>
            <span className="eyebrow">ORDER #{order.order_number}</span>
            <h2 id="station-order-detail-title">{customerName}</h2>
            <p>
              {new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.created_at))}
              <span className={`pill pill-${statusTone(order.status)}`}>{readable(order.status)}</span>
            </p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close order details"><X size={18} /></button>
        </header>

        <div className="station-order-detail-body">
          {bucket === "active" && step && (
            <section className={`so-next ${step.waiting ? "is-waiting" : ""}`} key={`${order.status}-${hasRider}-${showPicker}`} aria-live="polite">
              <div className="so-next-head">
                <span className="so-next-eyebrow">{step.waiting ? "On hold" : `Step ${Math.max(currentIndex, 0) + 1} of ${orderTrackerSteps.length}`}</span>
                <h3>{showPicker && hasRider ? "Change the rider" : step.title}</h3>
                <p>{showPicker && hasRider ? "Pick a different rider for this order." : step.description}</p>
              </div>

              {hasRider && !showPicker && (
                <div className="so-assigned">
                  <span className="so-rider-avatar">{initialsOf(order.rider_name ?? "R")}</span>
                  <div>
                    <strong>{order.rider_name}</strong>
                    <a href={`tel:${order.rider_phone}`}><Phone size={12} /> {order.rider_phone}</a>
                  </div>
                  {canChangeRider && (
                    <button className="text-link" type="button" onClick={() => setChangingRider(true)}>Change rider</button>
                  )}
                </div>
              )}

              {showPicker && (
                <RiderPicker riders={riders} selectedId={selectedRiderId} onSelect={setSelectedRiderId} onManageRiders={onManageRiders} />
              )}

              <div className="so-next-actions">
                {showPicker ? (
                  <>
                    <button className="button button-primary so-primary" type="button" disabled={!selectedRiderId || updating || riders.length === 0} onClick={assignSelected}>
                      {updating ? <span className="spinner spinner-light" /> : <Truck size={16} />} {hasRider ? "Switch rider" : "Assign rider"}
                    </button>
                    {changingRider && (
                      <button className="button button-secondary" type="button" onClick={() => { setChangingRider(false); setSelectedRiderId(""); }}>Keep current rider</button>
                    )}
                  </>
                ) : step.status && (
                  <button className="button button-primary so-primary" type="button" disabled={updating || step.waiting} onClick={() => onUpdateStatus(step.status!)}>
                    {updating ? <span className="spinner spinner-light" /> : <Check size={16} />} {step.label}
                  </button>
                )}
                {step.waiting && <span className="so-next-hint">Unlocks after payment is confirmed.</span>}
              </div>
            </section>
          )}

          {bucket === "completed" && (
            <section className="so-next so-next-done">
              <span className="so-done-icon"><Check size={20} strokeWidth={3} /></span>
              <div>
                <h3>Order completed</h3>
                <p>{order.delivered_at ? `Delivered ${formatDate(order.delivered_at)}.` : "This order was delivered."}</p>
              </div>
            </section>
          )}
          {bucket === "cancelled" && (
            <section className="so-next so-next-cancelled">
              <span className="so-done-icon"><X size={20} strokeWidth={3} /></span>
              <div>
                <h3>Order cancelled</h3>
                <p>This order was cancelled and will not be delivered.</p>
              </div>
            </section>
          )}

          {bucket !== "cancelled" && (
            <div className="order-stepper so-tracker" aria-label="Order progress">
              {orderTrackerSteps.map((item, index) => {
                const complete = currentIndex >= index;
                const active = currentIndex === index;
                return (
                  <div className={`order-step ${complete ? "is-complete" : ""} ${active ? "is-current" : ""}`} key={item.key}>
                    <div className="order-step-track">
                      <span className="order-step-dot">{complete && !active ? <Check size={13} strokeWidth={3} /> : index + 1}</span>
                      {index < orderTrackerSteps.length - 1 && <span className={`order-step-line ${currentIndex > index ? "is-complete" : ""}`} />}
                    </div>
                    <span className="order-step-label">{item.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          <section className="so-facts" aria-label="Payment and total">
            <div><span>Payment</span><strong>{paymentText}</strong></div>
            <div><span>Delivery fee</span><strong>{order.delivery_fee === 0 ? "Free" : money(order.delivery_fee)}</strong></div>
            <div><span>Total</span><strong className="so-facts-total">{money(order.total)}</strong></div>
          </section>

          <section className="station-order-detail-section">
            <div className="station-order-detail-section-title"><MapPin size={16} /><h3>Deliver to</h3></div>
            <dl className="station-order-detail-list">
              <div><dt>Customer</dt><dd>{customerName}</dd></div>
              <div><dt>Phone</dt><dd>{customerPhone ? <a href={`tel:${customerPhone}`}>{customerPhone}</a> : "Not provided"}</dd></div>
              <div className="is-wide"><dt>Address{addressLabel ? ` · ${addressLabel}` : ""}</dt><dd>{addressText || "Address not available"}</dd></div>
              {landmark && <div className="is-wide"><dt>Landmark</dt><dd>{landmark}</dd></div>}
              {customerNotes && <div className="is-wide"><dt>Customer notes</dt><dd>{customerNotes}</dd></div>}
              {mapUrl && <div className="is-wide"><dt>Map</dt><dd><a href={mapUrl} target="_blank" rel="noreferrer">Open pin in Google Maps <ExternalLink size={13} /></a></dd></div>}
            </dl>
          </section>

          <section className="station-order-detail-section">
            <div className="station-order-detail-section-title"><ShoppingBag size={16} /><h3>Items</h3><span className="station-order-item-count">{order.items.length} {order.items.length === 1 ? "item" : "items"}</span></div>
            <div className="station-order-detail-items">
              {order.items.map((item, index) => (
                <div className="station-order-detail-item" key={`${order.id}-${index}`}>
                  <div><strong>{item.product_name_snapshot}</strong><span>{item.water_type_snapshot} · {item.container_type_snapshot} · {readable(item.container_option)}</span></div>
                  <span className="station-order-item-quantity">×{item.quantity}</span>
                  <strong>{money(item.line_total)}</strong>
                </div>
              ))}
              {order.items.length === 0 && <p className="muted">Order items are not available.</p>}
            </div>
          </section>

          {(canCancel || bucket !== "active") && (
            <section className="so-quiet">
              {canCancel ? (
                <>
                  <div><strong>Can't fulfil this order?</strong><span>Cancel it and tell the customer why.</span></div>
                  <button className="button button-secondary button-small so-cancel-link" type="button" disabled={updating} onClick={onRequestCancel}><X size={14} /> Cancel order</button>
                </>
              ) : (
                <>
                  <div><strong>Done with this order?</strong><span>Hide it from your list. Order and payment records are kept.</span></div>
                  <button className="button button-secondary button-small" type="button" onClick={onHide}><Trash2 size={14} /> Hide from list</button>
                </>
              )}
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

interface SetupStep {
  id: string;
  group: "Profile" | "Delivery" | "Products" | "Documents";
  title: string;
  detail: string;
  section: PortalSection;
  done: boolean;
  documentType?: string;
}

const setupSectionLabel: Record<PortalSection, string> = {
  overview: "Overview",
  orders: "Orders",
  products: "Products",
  delivery: "Delivery setup",
  riders: "Riders",
  application: "Station details",
};

function ApplicationSection({
  application,
  station,
  requirements,
  documents,
  products,
  operatingHours,
  containerPolicies,
  onNavigate,
  onRefresh,
  onNotice,
}: {
  application: StationApplication;
  station: Station | null;
  requirements: DocumentRequirement[];
  documents: StationDocument[];
  products: StationProduct[];
  operatingHours: StationOperatingHour[];
  containerPolicies: Array<{ container_type_id: string; is_active: boolean }>;
  onNavigate: (section: PortalSection) => void;
  onRefresh: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [dragType, setDragType] = useState<string | null>(null);
  const permitDocument = documents.find((document) => document.document_type === "business_permit");
  const [permitExpiry, setPermitExpiry] = useState(
    permitDocument?.expires_at ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    setPermitExpiry(permitDocument?.expires_at ?? "");
  }, [permitDocument?.id, permitDocument?.expires_at]);
  const requiredTypes = requirements.filter((requirement) => requirement.required);
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const activeProducts = products.filter((product) => product.status === "active");
  const activePolicyTypes = new Set(
    containerPolicies.filter((policy) => policy.is_active).map((policy) => policy.container_type_id),
  );
  const openDays = operatingHours.filter((hour) =>
    !hour.is_closed && hour.opens_at && hour.closes_at && hour.opens_at.slice(0, 5) !== hour.closes_at.slice(0, 5),
  );

  // ---- every setup requirement as a step, done or not ----
  const steps: SetupStep[] = [];
  const profileComplete = Boolean(application.legal_business_name.trim()
    && application.display_name.trim()
    && application.phone.trim()
    && application.address_line.trim()
    && application.city.trim()
    && application.province.trim()
    && application.latitude !== null
    && application.longitude !== null);
  steps.push({
    id: "profile", group: "Profile", title: "Business and location details", section: "application", done: profileComplete,
    detail: "Business name, station name, phone, address and map pin are required.",
  });
  if (!station) {
    steps.push({
      id: "station", group: "Profile", title: "Station record", section: "application", done: false,
      detail: "The station record is missing. Refresh the page or contact support.",
    });
  }
  const radius = Number(station?.service_radius_km);
  const fee = Number(station?.default_delivery_fee);
  const minimum = Number(station?.minimum_order_amount);
  steps.push({
    id: "radius", group: "Delivery", title: "Delivery radius", section: "delivery",
    done: Boolean(station) && Number.isFinite(radius) && radius > 0,
    detail: "Enter a delivery radius greater than zero in Delivery setup.",
  });
  steps.push({
    id: "fees", group: "Delivery", title: "Delivery fee and minimum order", section: "delivery",
    done: Boolean(station) && Number.isFinite(fee) && fee >= 0 && Number.isFinite(minimum) && minimum >= 0,
    detail: "Delivery fee and minimum order must be amounts of zero or more.",
  });
  steps.push({
    id: "hours", group: "Delivery", title: "Operating hours", section: "delivery", done: openDays.length > 0,
    detail: "Add at least one open day with different opening and closing times.",
  });
  const missingPolicy = activeProducts.some((product) => !activePolicyTypes.has(product.container_type_id));
  steps.push({
    id: "products", group: "Products", title: "An active water product", section: "products",
    done: activeProducts.length > 0 && !missingPolicy,
    detail: activeProducts.length === 0
      ? "Add at least one active product with a price and starting stock."
      : "Edit and save each active product so its container return policy is saved.",
  });
  if (requiredTypes.length === 0) {
    steps.push({
      id: "no-requirements", group: "Documents", title: "Document requirements", section: "application", done: false,
      detail: "No document requirements were returned. Refresh or contact support before submitting.",
    });
  }
  for (const requirement of requiredTypes) {
    const document = documents.find((item) =>
      item.document_type === requirement.document_type && item.required_for_verification,
    );
    const name = readable(requirement.document_type);
    let done = false;
    let detail = `${name} is required and has not been uploaded.`;
    if (document) {
      if (document.review_status === "rejected" || document.review_status === "changes_requested") {
        detail = document.review_notes || `${name} was rejected. Upload a replacement before resubmitting.`;
      } else if (requirement.document_type === "business_permit") {
        if (!permitExpiry || permitExpiry < localToday) {
          detail = "Choose an expiry date that is today or later, then upload the updated permit to save it.";
        } else if (permitExpiry !== document.expires_at) {
          detail = "The new expiry date isn't saved yet. Upload the permit again to save it with the file.";
        } else if (!document.expires_at || document.expires_at < localToday) {
          detail = "The saved permit has expired. Upload a current permit with a future expiry date.";
        } else if (application.application_status === "approved" && document.review_status === "pending") {
          detail = "Renewed permit submitted. Waiting for administrator review.";
        } else {
          done = true;
        }
      } else if (document.expires_at !== null && document.expires_at < localToday) {
        detail = `${name} must have a future expiry date.`;
      } else {
        done = true;
      }
    }
    steps.push({
      id: `doc:${requirement.document_type}`, group: "Documents", title: name, section: "application", done, detail,
      documentType: requirement.document_type,
    });
  }
  const staleDocument = documents.find((document) =>
    !requiredTypes.some((requirement) => requirement.document_type === document.document_type)
    && document.expires_at !== null
    && document.expires_at < localToday,
  );
  if (staleDocument) {
    steps.push({
      id: `doc-stale:${staleDocument.id}`, group: "Documents", title: `Replace ${readable(staleDocument.document_type)}`, section: "application", done: false,
      detail: "Every current verification document must be unexpired.",
    });
  }

  const pending = steps.filter((item) => !item.done);
  const doneCount = steps.length - pending.length;
  const percent = steps.length === 0 ? 0 : Math.round((doneCount / steps.length) * 100);
  const nextStep = pending[0] ?? null;
  const canSubmit = application.application_status === "draft"
    || application.application_status === "changes_requested";
  const published = station?.publication_status === "published";
  const applicationComplete = published || application.application_status === "approved";
  const canRenewPermit = application.application_status === "approved"
    && permitDocument !== undefined
    && permitDocument.review_status !== "pending"
    && (
      !permitDocument.expires_at
      || permitDocument.expires_at < localToday
      || permitDocument.review_status === "rejected"
      || permitDocument.review_status === "changes_requested"
    );
  const groups = (["Profile", "Delivery", "Products", "Documents"] as const)
    .map((name) => {
      const items = steps.filter((item) => item.group === name);
      return { name, items, done: items.filter((item) => item.done).length };
    })
    .filter((group) => group.items.length > 0);

  const headline = published ? "Your station is live"
    : application.application_status === "approved" ? "Application approved"
      : application.application_status === "rejected" ? "Application not approved"
        : !canSubmit ? "Under review"
          : application.application_status === "changes_requested" ? "Changes requested"
            : pending.length > 0 ? `${pending.length} step${pending.length === 1 ? "" : "s"} left before you can submit`
              : "Ready to submit";
  const subline = published ? "Customers can find your station and order from you."
    : application.application_status === "approved" ? "Your documents were verified. Customers see your active products once the station is verified and published."
      : application.application_status === "rejected" ? "Contact AquaDirect support if you think this was a mistake."
        : !canSubmit ? "The AquaDirect team is reviewing your documents. Uploads are locked until they respond."
          : application.application_status === "changes_requested" ? "Check the notes on each document, fix what's flagged, then submit again."
            : pending.length > 0 ? "Finish each step below. We save your progress as you go."
              : "Everything checks out. Submit your station so the team can verify it.";

  function goTo(item: SetupStep) {
    if (item.documentType) {
      const card = window.document.getElementById(`doc-${item.documentType}`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
      card?.classList.add("is-flash");
      window.setTimeout(() => card?.classList.remove("is-flash"), 1400);
      return;
    }
    if (item.section === "application") {
      window.document.getElementById("station-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    onNavigate(item.section);
  }

  async function uploadDocument(documentType: string, file: File | undefined) {
    if (!supabase || !file) return;
    if (file.size > 20 * 1024 * 1024) {
      onNotice({ kind: "error", text: "Documents must be 20 MB or smaller." });
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      onNotice({ kind: "error", text: "Upload a PDF, JPEG, PNG, or WebP file." });
      return;
    }
    if (documentType === "business_permit" && (!permitExpiry || permitExpiry < localToday)) {
      onNotice({ kind: "error", text: "Choose a permit expiry date that is today or later first." });
      return;
    }
    if (!canSubmit && !(documentType === "business_permit" && canRenewPermit)) {
      onNotice({ kind: "error", text: "This document cannot be changed while the application is under review." });
      return;
    }
    setUploadingType(documentType);
    onNotice(null);
    const id = crypto.randomUUID();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${application.id}/${id}/${sanitizedName}`;
    try {
      const { error: storageError } = await supabase.storage.from("station-documents").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (storageError) throw storageError;
      const { error: metadataError } = await supabase.from("station_documents").insert({
        id,
        application_id: application.id,
        document_type: documentType,
        storage_path: path,
        submitted_by: application.owner_id,
        required_for_verification: true,
        is_current: true,
        expires_at: documentType === "business_permit" ? permitExpiry : null,
      });
      if (metadataError) {
        const { error: cleanupError } = await supabase.storage.from("station-documents").remove([path]);
        if (cleanupError) {
          throw new Error(`Document details could not be saved (${metadataError.message}), and the uploaded file could not be cleaned up (${cleanupError.message}).`);
        }
        throw metadataError;
      }
      onNotice({
        kind: "success",
        text: application.application_status === "approved" && documentType === "business_permit"
          ? "Renewed business permit submitted for administrator review."
          : `${readable(documentType)} uploaded`,
      });
      onRefresh();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Document could not be uploaded." });
    } finally {
      setUploadingType(null);
    }
  }

  async function submitApplication() {
    if (!supabase) return;
    if (pending.length > 0) {
      onNotice({ kind: "error", text: `Finish ${pending.length} more step${pending.length === 1 ? "" : "s"} before submitting.` });
      if (nextStep) goTo(nextStep);
      return;
    }
    setSubmitting(true);
    onNotice(null);
    const { error } = await supabase.rpc("submit_application", { p_application_id: application.id });
    setSubmitting(false);
    if (error) onNotice({ kind: "error", text: error.message });
    else {
      onNotice({ kind: "success", text: "Submitted for review" });
      onRefresh();
    }
  }

  return (
    <>
      <PageTitle
        title="Application & verification"
        description="Finish setup, upload your documents and submit your station for review."
        action={<span className={`pill pill-${published ? "green" : statusTone(application.application_status)}`}>{readable(application.application_status)}</span>}
      />

      <section className="panel setup-hero">
        <div className="setup-hero-top">
          <div className={`setup-ring ${percent === 100 ? "is-complete" : ""}`} style={{ "--p": percent } as CSSProperties} role="img" aria-label={`${doneCount} of ${steps.length} steps complete`}>
            <span><strong>{percent}%</strong><small>{doneCount}/{steps.length}</small></span>
          </div>
          <div className="setup-hero-copy">
            <span className="eyebrow">SETUP PROGRESS</span>
            <h2>{headline}</h2>
            <p>{subline}</p>
          </div>
          {canSubmit && (
            <div className="setup-hero-cta">
              {nextStep ? (
                <button className="button button-primary" type="button" onClick={() => goTo(nextStep)}>
                  {nextStep.documentType ? `Upload ${nextStep.title}` : `Continue: ${nextStep.title}`} <ArrowRight size={16} />
                </button>
              ) : (
                <button className="button button-primary" type="button" disabled={submitting} onClick={() => void submitApplication()}>
                  {submitting ? <span className="spinner spinner-light" /> : <BadgeCheck size={16} />} Submit for review
                </button>
              )}
            </div>
          )}
        </div>
        <div className="setup-groups">
          {groups.map((group) => {
            const complete = group.done === group.items.length;
            const firstOpen = group.items.find((item) => !item.done);
            return (
              <button
                key={group.name}
                type="button"
                className={`setup-group ${complete ? "is-complete" : ""}`}
                onClick={() => goTo(firstOpen ?? group.items[0])}
              >
                <span className="setup-group-icon">{complete ? <Check size={13} strokeWidth={3} /> : group.done}</span>
                <span><strong>{group.name}</strong><small>{group.done} of {group.items.length} done</small></span>
              </button>
            );
          })}
        </div>
        {application.application_status === "changes_requested" && (
          <div className="notice notice-warning"><CircleAlert size={17} /><span>The reviewer asked for changes. Notes appear on the documents that need attention.</span></div>
        )}
      </section>

      {canSubmit && pending.length > 0 && (
        <section className="panel setup-todo">
          <div className="panel-heading">
            <div><h2>What's left</h2><p>Do these in order. Each one takes you straight to the right place.</p></div>
          </div>
          <ol>
            {pending.map((item, index) => (
              <li key={item.id}>
                <span className="setup-todo-num">{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <button className="button button-secondary button-small" type="button" onClick={() => goTo(item)}>
                  {item.documentType ? "Upload" : `Open ${setupSectionLabel[item.section]}`} <ArrowRight size={14} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="setup-layout">
        <section className="panel" id="documents">
          <div className="panel-heading">
            <div><h2>Required documents</h2><p>PDF, JPG, PNG or WebP · up to 20 MB each</p></div>
            <FileUp size={19} className="heading-icon" />
          </div>
          {requiredTypes.length === 0 ? (
            <div className="notice notice-warning"><CircleAlert size={17} /><span>No document requirements were returned. Refresh or contact support before submitting.</span></div>
          ) : (
            <div className="doc-grid">
              {requiredTypes.map((requirement) => {
                const type = requirement.document_type;
                const document = documents.find((item) => item.document_type === type && item.required_for_verification);
                const step = steps.find((item) => item.documentType === type);
                const isPermit = type === "business_permit";
                const rejected = document?.review_status === "rejected";
                const needsFix = Boolean(document && step && !step.done);
                const renewalAwaitingReview = application.application_status === "approved"
                  && document?.review_status === "pending"
                  && Boolean(document.expires_at && document.expires_at >= localToday);
                const permitReady = !isPermit || Boolean(permitExpiry && permitExpiry >= localToday);
                const editable = (canSubmit || (isPermit && canRenewPermit)) && uploadingType === null;
                const uploadDisabled = !editable || !permitReady;
                const uploading = uploadingType === type;
                return (
                  <article
                    id={`doc-${type}`}
                    key={type}
                    className={`doc-card ${document && !needsFix ? "has-file" : ""} ${rejected || needsFix ? "needs-fix" : ""} ${dragType === type ? "is-drag" : ""}`}
                  >
                    <header>
                      <span className={`document-icon ${document && !needsFix ? "document-icon-done" : ""}`}>{document && !needsFix ? <Check size={16} /> : <FileCheck2 size={16} />}</span>
                      <div>
                        <strong>{readable(type)}</strong>
                        <div className="document-meta">
                          {document
                            ? <span className={`pill pill-${needsFix ? "amber" : statusTone(document.review_status)}`}>{renewalAwaitingReview ? "Renewal in review" : needsFix && !rejected ? "Needs update" : readable(document.review_status)}</span>
                            : <span className="pill pill-gray">Not uploaded</span>}
                          {isPermit && document?.expires_at && <small>Expires {formatDate(document.expires_at)}</small>}
                        </div>
                      </div>
                    </header>
                    {(rejected || needsFix) && step && <p className="doc-card-note"><CircleAlert size={14} /> {document?.review_notes || step.detail}</p>}
                    {isPermit && (
                      <label className="doc-expiry">
                        <span>Permit expiry date</span>
                        <input
                          type="date"
                          min={localToday}
                          value={permitExpiry}
                          disabled={!canSubmit && !(isPermit && canRenewPermit)}
                          onChange={(event) => setPermitExpiry(event.target.value)}
                          aria-label="Business permit expiration date"
                        />
                        <small>Saved together with the file you upload.</small>
                      </label>
                    )}
                    <label
                      className={`doc-drop ${uploadDisabled ? "is-disabled" : ""}`}
                      onDragOver={(event) => { if (!uploadDisabled) { event.preventDefault(); setDragType(type); } }}
                      onDragLeave={() => setDragType((current) => (current === type ? null : current))}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragType(null);
                        if (!uploadDisabled) void uploadDocument(type, event.dataTransfer.files?.[0]);
                      }}
                    >
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                        disabled={uploadDisabled}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          void uploadDocument(type, file);
                          event.currentTarget.value = "";
                        }}
                      />
                      {uploading ? (
                        <><span className="spinner" /><span><strong>Uploading…</strong></span></>
                      ) : (
                        <>
                          <FileUp size={18} />
                          <span>
                            <strong>{document ? "Replace file" : "Upload file"}</strong>
                            <small>{!editable ? "Locked while under review" : !permitReady ? "Choose the expiry date first" : application.application_status === "approved" && isPermit ? "Upload renewed permit for review" : "or drag it here"}</small>
                          </span>
                        </>
                      )}
                    </label>
                  </article>
                );
              })}
            </div>
          )}
          <div className="form-footer document-footer">
            <span className="muted-note">
              {application.application_status === "approved" && permitDocument?.review_status === "pending"
                ? "Renewed permit awaiting administrator review"
                : !canSubmit
                ? application.application_status === "approved"
                  ? "Your application is approved."
                  : application.application_status === "rejected"
                    ? "This application was not approved."
                    : "Under review. Documents unlock if the reviewer asks for changes."
                : pending.length > 0
                  ? `${pending.length} step${pending.length === 1 ? "" : "s"} left`
                  : "All steps complete"}
            </span>
            <button className="button button-primary" type="button" disabled={!canSubmit || pending.length > 0 || submitting} onClick={() => void submitApplication()}>
              {submitting ? <span className="spinner spinner-light" /> : applicationComplete ? <Check size={16} /> : null}
              {applicationComplete ? "Complete" : "Submit for review"}
              {!applicationComplete && <ArrowRight size={16} />}
            </button>
          </div>
        </section>

        <section className="panel" id="station-details">
          <div className="panel-heading">
            <div><h2>Station details</h2><p>What the review team sees.</p></div>
            <MapPin size={19} className="heading-icon" />
          </div>
          <dl className="detail-list">
            <DetailRow label="Station name" value={application.display_name} />
            <DetailRow label="Registered business" value={application.legal_business_name} />
            <DetailRow label="Contact" value={`${application.phone}${application.email ? ` · ${application.email}` : ""}`} />
            <DetailRow label="Address" value={[application.address_line, application.barangay, application.city, application.province, application.postal_code].filter(Boolean).join(", ")} />
            <DetailRow label="Map pin" value={application.latitude !== null && application.longitude !== null ? `${application.latitude}, ${application.longitude}` : "Not set"} />
            <DetailRow label="Status" value={`${readable(station?.verification_status ?? application.verification_status)} · ${readable(station?.publication_status ?? "unpublished")}`} />
          </dl>
          {steps.some((item) => item.done) && (
            <details className="setup-done">
              <summary>{doneCount} step{doneCount === 1 ? "" : "s"} completed</summary>
              <ul>
                {steps.filter((item) => item.done).map((item) => (
                  <li key={item.id}><Check size={13} strokeWidth={3} /> {item.title}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
      {!published && (
        <div className="info-strip">
          <CircleAlert size={17} />
          <span>
            Adding products doesn't publish your station. Customers see your active products only after verification and publication.
          </span>
        </div>
      )}
    </>
  );
}

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function DeliverySetupSection({
  station,
  operatingHours,
  onRefresh,
  onNotice,
}: {
  station: Station;
  operatingHours: StationOperatingHour[];
  onRefresh: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [serviceRadius, setServiceRadius] = useState(station.service_radius_km?.toString() ?? "");
  const [deliveryFee, setDeliveryFee] = useState(station.default_delivery_fee.toString());
  const [minimumOrder, setMinimumOrder] = useState(station.minimum_order_amount.toString());
  const [hours, setHours] = useState(() => weekdays.map((_, weekday) => {
    const saved = operatingHours.find((item) => item.weekday === weekday);
    return {
      weekday,
      isClosed: saved?.is_closed ?? true,
      opensAt: saved?.opens_at?.slice(0, 5) ?? "09:00",
      closesAt: saved?.closes_at?.slice(0, 5) ?? "17:00",
    };
  }));

  const snapshot = JSON.stringify({ serviceRadius, deliveryFee, minimumOrder, hours });
  const [baseline, setBaseline] = useState(snapshot);
  const dirty = snapshot !== baseline;
  const openCount = hours.filter((item) => !item.isClosed).length;
  const hasOvernight = hours.some((item) => !item.isClosed && item.opensAt && item.closesAt && item.closesAt < item.opensAt);

  function copyFirstOpenDay() {
    const source = hours.find((item) => !item.isClosed);
    if (!source) return;
    setHours((current) => current.map((item) =>
      item.isClosed ? item : { ...item, opensAt: source.opensAt, closesAt: source.closesAt },
    ));
  }

  function updateHours(weekday: number, field: "isClosed" | "opensAt" | "closesAt", value: boolean | string) {
    setHours((current) => current.map((item) =>
      item.weekday === weekday ? { ...item, [field]: value } : item,
    ));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const radius = Number(serviceRadius);
    const fee = Number(deliveryFee);
    const minimum = Number(minimumOrder);
    if (!Number.isFinite(radius) || radius <= 0
      || !Number.isFinite(fee) || fee < 0
      || !Number.isFinite(minimum) || minimum < 0
      || !hours.some((item) => !item.isClosed)
      || hours.some((item) => !item.isClosed && (!item.opensAt || !item.closesAt || item.opensAt === item.closesAt))) {
      onNotice({ kind: "error", text: "Enter a positive delivery radius, valid fees, and at least one valid open day." });
      return;
    }

    setBusy(true);
    onNotice(null);
    try {
      const { error: stationError } = await supabase.from("stations")
        .update({
          service_radius_km: radius,
          default_delivery_fee: fee,
          minimum_order_amount: minimum,
        })
        .eq("id", station.id);
      if (stationError) throw stationError;

      const { error: hoursError } = await supabase.from("station_operating_hours")
        .upsert(hours.map((item) => ({
          station_id: station.id,
          weekday: item.weekday,
          is_closed: item.isClosed,
          opens_at: item.isClosed ? null : item.opensAt,
          closes_at: item.isClosed ? null : item.closesAt,
        })), { onConflict: "station_id,weekday" });
      if (hoursError) {
        throw new Error(`Delivery coverage was saved, but operating hours could not be saved: ${hoursError.message}`);
      }
      setBaseline(snapshot);
      onNotice({ kind: "success", text: "Delivery coverage, fees, and operating hours saved." });
      onRefresh();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Delivery settings could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle
        title="Delivery setup"
        description="Set your delivery coverage, fees, and weekly business hours."
        action={<span className={`pill pill-${station.service_radius_km ? "green" : "amber"}`}>{station.service_radius_km ? "Coverage configured" : "Setup required"}</span>}
      />
      <form className="delivery-settings" onSubmit={(event) => void save(event)}>
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Delivery coverage & pricing</h2><p>Customers outside this radius will not see the station for delivery.</p></div>
            <MapPin size={19} className="heading-icon" />
          </div>
          <div className="form-grid">
            <label>Delivery radius
              <div className="input-suffix"><input required min="0.1" step="0.1" type="number" value={serviceRadius} onChange={(event) => setServiceRadius(event.target.value)} placeholder="e.g. 5" /><span>km</span></div>
            </label>
            <label>Default delivery fee
              <div className="input-prefix"><span>₱</span><input required min="0" step="0.01" type="number" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} /></div>
            </label>
            <label>Minimum order amount
              <div className="input-prefix"><span>₱</span><input required min="0" step="0.01" type="number" value={minimumOrder} onChange={(event) => setMinimumOrder(event.target.value)} /></div>
              <small className="field-hint">Enter 0 if you have no minimum.</small>
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div><h2>Weekly operating hours</h2><p>Open and close times use your station’s local time.</p></div>
            <button className="button button-secondary button-small" type="button" disabled={openCount < 2} onClick={copyFirstOpenDay}>
              Copy first open day to all
            </button>
          </div>
          <div className="hours-list">
            {hours.map((item) => (
              <div className="hours-row" key={item.weekday}>
                <strong>{weekdays[item.weekday]}</strong>
                <label className="checkbox-label hours-closed">
                  <input type="checkbox" checked={item.isClosed} onChange={(event) => updateHours(item.weekday, "isClosed", event.target.checked)} />
                  <span>Closed</span>
                </label>
                <input aria-label={`${weekdays[item.weekday]} opens at`} type="time" value={item.opensAt} disabled={item.isClosed} onChange={(event) => updateHours(item.weekday, "opensAt", event.target.value)} />
                <span className="hours-separator">to</span>
                <input aria-label={`${weekdays[item.weekday]} closes at`} type="time" value={item.closesAt} disabled={item.isClosed} onChange={(event) => updateHours(item.weekday, "closesAt", event.target.value)} />
              </div>
            ))}
          </div>
          {hasOvernight && <p className="field-hint hours-note">Days where closing is earlier than opening continue past midnight into the next day.</p>}
          <div className="delivery-save-row">
            <p className="muted"><strong className={dirty ? "unsaved" : ""}>{dirty ? "You have unsaved changes. " : "All changes saved. "}</strong>Station publication still requires AquaDirect verification and approval.</p>
            <button className="button button-primary" type="submit" disabled={busy || !dirty}>
              {busy ? <span className="spinner spinner-light" /> : null} Save delivery setup
            </button>
          </div>
        </section>
      </form>
    </>
  );
}

export function ProductEditor({
  station,
  product,
  waterTypes,
  containerTypes,
  onClose,
  onSaved,
  onRefresh,
  onNotice,
}: {
  station: Station;
  product: StationProduct | null;
  waterTypes: WaterType[];
  containerTypes: ContainerType[];
  onClose: () => void;
  onSaved: () => void;
  onRefresh: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<StationProductImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(Boolean(product));
  const [imageBusyId, setImageBusyId] = useState<string | null>(null);
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    waterTypeId: product?.water_type_id ?? waterTypes[0]?.id ?? "",
    containerTypeId: product?.container_type_id ?? containerTypes[0]?.id ?? "",
    refillAvailable: product?.refill_available ?? true,
    refillPrice: product?.refill_price?.toString() ?? "",
    newContainerAvailable: product?.new_container_available ?? false,
    newContainerPrice: product?.new_container_price?.toString() ?? "",
    depositAmount: product?.deposit_amount?.toString() ?? "0",
    stockQuantity: product?.stock_quantity?.toString() ?? "0",
    maxOrderQuantity: product?.max_order_quantity?.toString() ?? "10",
    requiresEmpty: product?.requires_empty_container ?? false,
    returnPolicy: product?.return_policy ?? "",
  });
  const setField = (field: keyof typeof form, value: string | boolean) =>
    setForm((current) => ({ ...current, [field]: value }));

  const loadImages = useCallback(async () => {
    if (!supabase || !product) {
      setImagesLoading(false);
      return;
    }
    setImagesLoading(true);
    const { data, error } = await supabase.from("station_product_images")
      .select("id, product_id, storage_path, alt_text, sort_order, created_at")
      .eq("product_id", product.id)
      .order("sort_order");
    if (error) {
      setImageNotice(`Product images could not be loaded: ${error.message}`);
    } else {
      setImages((data ?? []) as StationProductImage[]);
      setImageNotice(null);
    }
    setImagesLoading(false);
  }, [product]);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  async function uploadImage(file: File | undefined) {
    if (!supabase || !product || !file) return;
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = extensions[file.type];
    if (!extension) {
      setImageNotice("Choose a JPG, PNG, or WebP product image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImageNotice("Product images must be 10 MB or smaller.");
      return;
    }
    if (images.length >= 5) {
      setImageNotice("A product can have up to 5 images.");
      return;
    }

    setImageBusyId("upload");
    setImageNotice(null);
    const path = `${station.id}/products/${product.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from("station-assets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { error: metadataError } = await supabase
        .from("station_product_images")
        .insert({
          product_id: product.id,
          storage_path: path,
          alt_text: file.name.replace(/\.[^.]+$/, "").slice(0, 200) || product.name,
          sort_order: images.length,
        });
      if (metadataError) {
        const { error: cleanupError } = await supabase.storage
          .from("station-assets")
          .remove([path]);
        throw new Error(cleanupError
          ? `The image record could not be saved (${metadataError.message}), and its uploaded file could not be removed (${cleanupError.message}).`
          : `The image record could not be saved: ${metadataError.message}`);
      }
      await loadImages();
      onRefresh();
    } catch (error) {
      setImageNotice(error instanceof Error ? error.message : "The product image could not be uploaded.");
    } finally {
      setImageBusyId(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function removeImage(image: StationProductImage) {
    if (!supabase || !product) return;
    setImageBusyId(image.id);
    setImageNotice(null);
    try {
      const { error: metadataError } = await supabase
        .from("station_product_images")
        .delete()
        .eq("id", image.id)
        .eq("product_id", product.id);
      if (metadataError) throw metadataError;

      const { error: storageError } = await supabase.storage
        .from("station-assets")
        .remove([image.storage_path]);
      if (storageError) {
        setImageNotice(`Image record removed, but its stored file could not be deleted: ${storageError.message}`);
      }
      await loadImages();
      onRefresh();
    } catch (error) {
      setImageNotice(error instanceof Error ? error.message : "The product image could not be removed.");
    } finally {
      setImageBusyId(null);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const refillPrice = Number(form.refillPrice);
    const newPrice = Number(form.newContainerPrice);
    const deposit = Number(form.depositAmount);
    const stock = Number(form.stockQuantity);
    const maxOrder = Number(form.maxOrderQuantity);
    const selectedWaterType = waterTypes.find((water) => water.id === form.waterTypeId);
    const selectedContainerType = containerTypes.find(
      (container) => container.id === form.containerTypeId,
    );
    if (!selectedWaterType || !selectedContainerType) {
      onNotice({ kind: "error", text: "Choose a valid water type and gallon size." });
      return;
    }
    if ((!form.refillAvailable && !form.newContainerAvailable)
      || (form.refillAvailable && (!Number.isFinite(refillPrice) || refillPrice < 0))
      || (form.newContainerAvailable && (!Number.isFinite(newPrice) || newPrice < 0))
      || !Number.isFinite(deposit) || deposit < 0
      || (!product && (!Number.isInteger(stock) || stock < 0))
      || !Number.isInteger(maxOrder) || maxOrder < 1 || maxOrder > 50) {
      onNotice({ kind: "error", text: "Check the prices, available options, stock and quantity limit." });
      return;
    }
    setBusy(true);
    onNotice(null);
    const values = {
      station_id: station.id,
      water_type_id: form.waterTypeId,
      container_type_id: form.containerTypeId,
      name: `${selectedWaterType.name} ${containerTypeLabel(selectedContainerType)}`,
      description: product?.description ?? null,
      refill_available: form.refillAvailable,
      refill_price: form.refillAvailable ? refillPrice : 0,
      new_container_available: form.newContainerAvailable,
      new_container_price: form.newContainerAvailable ? newPrice : null,
      deposit_amount: deposit,
      requires_empty_container: form.requiresEmpty,
      return_policy: form.returnPolicy.trim() || null,
      max_order_quantity: maxOrder,
      status: product?.status ?? "active",
    };
    try {
      const { error: policyError } = await supabase.from("container_policies").upsert({
        station_id: station.id,
        container_type_id: form.containerTypeId,
        requires_empty_return: form.requiresEmpty,
        deposit_amount: deposit,
        return_policy: form.returnPolicy.trim() || null,
        is_active: true,
      }, { onConflict: "station_id,container_type_id" });
      if (policyError) {
        throw new Error(`The container return policy could not be saved, so the product was not changed: ${policyError.message}`);
      }

      if (product) {
        const { error } = await supabase.from("station_products")
          .update(values)
          .eq("id", product.id)
          .eq("station_id", station.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("station_products").insert({
          ...values,
          stock_quantity: stock,
        });
        if (error) throw error;
      }
      onSaved();
    } catch (error) {
      onNotice({ kind: "error", text: error instanceof Error ? error.message : "Product could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  const refillAmount = Number(form.refillPrice) || 0;
  const containerAmount = Number(form.newContainerPrice) || 0;
  const depositAmount = Number(form.depositAmount) || 0;
  const newGallonTotal = (form.refillAvailable ? refillAmount : 0) + containerAmount + depositAmount;

  return (
    <Modal title={product ? "Edit water pricing" : "Add water type"} onClose={onClose}>
      <form className="stack-form modal-form" onSubmit={(event) => void save(event)}>
        <div className="form-grid">
          <label>Water type
            <select required value={form.waterTypeId} onChange={(event) => setField("waterTypeId", event.target.value)}>
              <option value="" disabled>Select water type</option>
              {waterTypes.map((water) => <option key={water.id} value={water.id}>{water.name}</option>)}
            </select>
          </label>
          <label>Gallon size
            <select required value={form.containerTypeId} onChange={(event) => setField("containerTypeId", event.target.value)}>
              <option value="" disabled>Select gallon size</option>
              {containerTypes.map((container) => <option key={container.id} value={container.id}>{containerTypeLabel(container)}</option>)}
            </select>
          </label>
          {product ? (
            <section className="product-images-panel field-span-2" aria-label="Product images">
              <div className="product-images-heading">
                <div>
                  <strong>Product images</strong>
                  <small>Upload up to 5 JPG, PNG, or WebP images (10 MB max each).</small>
                </div>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  disabled={imageBusyId !== null || images.length >= 5}
                  onClick={() => imageInputRef.current?.click()}
                >
                  {imageBusyId === "upload" ? <span className="spinner" /> : <ImagePlus size={15} />}
                  Add image
                </button>
                <input
                  ref={imageInputRef}
                  className="station-photo-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Choose a product image"
                  disabled={imageBusyId !== null || images.length >= 5}
                  onChange={(event) => void uploadImage(event.target.files?.[0])}
                />
              </div>
              {imageNotice && <p className="product-image-notice" role="status">{imageNotice}</p>}
              {imagesLoading ? (
                <p className="field-hint">Loading product images…</p>
              ) : images.length ? (
                <div className="product-image-grid">
                  {images.map((image) => (
                    <div className="product-image-item" key={image.id}>
                      <img
                        src={supabase?.storage.from("station-assets").getPublicUrl(image.storage_path).data.publicUrl}
                        alt={image.alt_text ?? product.name}
                      />
                      <button
                        className="product-image-remove"
                        type="button"
                        aria-label={`Remove ${image.alt_text ?? "product"} image`}
                        title="Remove image"
                        disabled={imageBusyId !== null}
                        onClick={() => void removeImage(image)}
                      >
                        {imageBusyId === image.id ? <span className="spinner" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="field-hint">No product images uploaded yet.</p>
              )}
            </section>
          ) : (
            <p className="field-hint field-span-2">
              Save this product first, then edit it to add product images.
            </p>
          )}
          <div className="option-card">
            <label className="checkbox-label">
              <input type="checkbox" checked={form.refillAvailable} onChange={(event) => setField("refillAvailable", event.target.checked)} />
              <span><strong>Refill existing gallon</strong><small>Customer provides an empty container.</small></span>
            </label>
            {form.refillAvailable && <label>Refill price
              <div className="input-prefix"><span>₱</span><input required min="0" step="0.01" type="number" value={form.refillPrice} onChange={(event) => setField("refillPrice", event.target.value)} placeholder="35.00" /></div>
            </label>}
          </div>
          <div className="option-card">
            <label className="checkbox-label">
              <input type="checkbox" checked={form.newContainerAvailable} onChange={(event) => setField("newContainerAvailable", event.target.checked)} />
              <span><strong>New gallon</strong><small>Provide a filled new container.</small></span>
            </label>
            {form.newContainerAvailable && <div className="form-grid">
              <label>Container charge
                <div className="input-prefix"><span>₱</span><input required min="0" step="0.01" type="number" value={form.newContainerPrice} onChange={(event) => setField("newContainerPrice", event.target.value)} placeholder="180.00" /></div>
                <small className="field-hint">Added to the refill price for a new gallon.</small>
              </label>
              <label>Refundable deposit
                <div className="input-prefix"><span>₱</span><input min="0" step="0.01" type="number" value={form.depositAmount} onChange={(event) => setField("depositAmount", event.target.value)} /></div>
              </label>
            </div>}
          </div>
          {(form.refillAvailable || form.newContainerAvailable) && (
            <div className="price-summary field-span-2" aria-live="polite">
              <strong>What customers pay</strong>
              {form.refillAvailable && <div><span>Refill their own gallon</span><b>{money(refillAmount)}</b></div>}
              {form.newContainerAvailable && <div><span>New gallon{depositAmount > 0 ? ", deposit included" : ""}</span><b>{money(newGallonTotal)}</b></div>}
              <small>The delivery fee is added at checkout.</small>
            </div>
          )}
          {!product && <label className="field-span-2">Starting stock
            <input required min="0" step="1" type="number" value={form.stockQuantity} onChange={(event) => setField("stockQuantity", event.target.value)} />
            <small className="field-hint">Initial stock is added to the inventory ledger.</small>
          </label>}
          <label>Max units per order
            <input required min="1" max="50" type="number" value={form.maxOrderQuantity} onChange={(event) => setField("maxOrderQuantity", event.target.value)} />
          </label>
          <label className="checkbox-label checkbox-field">
            <input type="checkbox" checked={form.requiresEmpty} onChange={(event) => setField("requiresEmpty", event.target.checked)} />
            <span><strong>Require empty gallon return</strong><small>Applies to refill orders.</small></span>
          </label>
          {form.requiresEmpty && <label className="field-span-2">Return instructions
            <textarea rows={2} value={form.returnPolicy} onChange={(event) => setField("returnPolicy", event.target.value)} placeholder="Explain your empty gallon return policy" />
          </label>}
        </div>
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={busy || !waterTypes.length || !containerTypes.length}>
            {busy ? <span className="spinner spinner-light" /> : null} Save water pricing
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StockEditor({
  product,
  onClose,
  onSaved,
  onNotice,
}: {
  product: StationProduct;
  onClose: () => void;
  onSaved: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [targetStock, setTargetStock] = useState(String(product.stock_quantity ?? 0));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const target = Number(targetStock);
    const current = product.stock_quantity ?? 0;
    const change = target - current;
    if (!Number.isInteger(target) || target < 0) {
      onNotice({ kind: "error", text: "Stock must be a whole number greater than or equal to zero." });
      return;
    }
    if (change === 0) {
      onClose();
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("adjust_inventory", {
      p_product_id: product.id,
      p_quantity_change: change,
      p_movement_type: change > 0 ? "stock_in" : "adjustment",
      p_notes: note.trim() || "Seller portal stock adjustment",
    });
    setBusy(false);
    if (error) onNotice({ kind: "error", text: error.message });
    else onSaved();
  }

  const targetNumber = Number(targetStock);
  const delta = Number.isFinite(targetNumber) ? targetNumber - (product.stock_quantity ?? 0) : 0;
  const nudge = (amount: number) =>
    setTargetStock(String(Math.max(0, (Number.isFinite(targetNumber) ? targetNumber : 0) + amount)));

  return (
    <Modal title="Adjust product stock" onClose={onClose}>
      <form className="stack-form modal-form" onSubmit={(event) => void save(event)}>
        <div className="stock-product-banner">
          <span className="product-thumb"><Droplets size={17} /></span>
          <div><strong>{product.name}</strong><small>Current quantity: {product.stock_quantity ?? "Not tracked"}</small></div>
        </div>
        <label>New stock quantity
          <input autoFocus required min="0" step="1" type="number" value={targetStock} onChange={(event) => setTargetStock(event.target.value)} />
        </label>
        <div className="stock-quick">
          <button type="button" onClick={() => nudge(5)}>+5</button>
          <button type="button" onClick={() => nudge(10)}>+10</button>
          <button type="button" onClick={() => nudge(-5)}>−5</button>
          <span className={`stock-delta ${delta > 0 ? "is-up" : delta < 0 ? "is-down" : ""}`}>
            {delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${delta} units`}
          </span>
        </div>
        <label>Reason <span className="muted">(optional)</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. New delivery received" />
        </label>
        <div className="notice notice-info"><ClipboardList size={16} /><span>Stock changes are recorded in the inventory movement ledger.</span></div>
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? <span className="spinner spinner-light" /> : null}Save stock</button>
        </div>
      </form>
    </Modal>
  );
}

function StationPhotoPanel({
  station,
  onRefresh,
  onNotice,
}: {
  station: Station;
  onRefresh: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoUrl = station.logo_path
    ? supabase?.storage.from("station-assets").getPublicUrl(station.logo_path).data.publicUrl
    : null;

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    if (!supabase) {
      onNotice({ kind: "error", text: "Supabase is not configured. The station photo could not be uploaded." });
      return;
    }
    const supportedTypes: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    const extension = supportedTypes[file.type];
    if (!extension) {
      onNotice({ kind: "error", text: "Choose a JPG, PNG, or WebP image for your station photo." });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onNotice({ kind: "error", text: "The station photo must be 10 MB or smaller." });
      return;
    }

    setUploading(true);
    onNotice(null);
    const path = `${station.id}/station-photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from("station-assets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: updatedStation, error: updateError } = await supabase
        .from("stations")
        .update({ logo_path: path })
        .eq("id", station.id)
        .select("id")
        .maybeSingle();
      if (updateError) {
        const { error: cleanupError } = await supabase.storage.from("station-assets").remove([path]);
        throw new Error(cleanupError
          ? `The photo uploaded, but the station profile could not be updated (${updateError.message}); cleanup also failed (${cleanupError.message}).`
          : `The photo uploaded, but the station profile could not be updated: ${updateError.message}`);
      }
      if (!updatedStation) {
        const { error: cleanupError } = await supabase.storage.from("station-assets").remove([path]);
        throw new Error(cleanupError
          ? `The station profile was not updated, and the uploaded file could not be cleaned up: ${cleanupError.message}`
          : "The station profile was not updated. Check that you have permission to change this station.");
      }

      if (station.logo_path && station.logo_path.startsWith(`${station.id}/`)) {
        const { error: removeOldError } = await supabase.storage
          .from("station-assets")
          .remove([station.logo_path]);
        if (removeOldError) {
          onNotice({
            kind: "error",
            text: `Station photo was updated, but the previous image could not be removed: ${removeOldError.message}`,
          });
          onRefresh();
          return;
        }
      }

      onNotice({ kind: "success", text: "Station photo uploaded successfully." });
      onRefresh();
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "The station photo could not be uploaded.",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="panel station-photo-panel">
      <div className="panel-heading">
        <div><h2>Station photo</h2><p>Add a photo so customers can recognize your water station.</p></div>
        <ImagePlus size={20} color="var(--blue)" />
      </div>
      <div className="station-photo-content">
        {photoUrl ? (
          <img className="station-photo-preview" src={photoUrl} alt={`${station.display_name} station`} />
        ) : (
          <div className="station-photo-placeholder"><ImagePlus size={26} /><span>No station photo added yet</span></div>
        )}
        <div className="station-photo-actions">
          <p className="field-hint">JPG, PNG, or WebP; maximum file size 10 MB.</p>
          <input
            ref={fileInputRef}
            className="station-photo-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose a water station photo"
            disabled={uploading}
            onChange={(event) => void uploadPhoto(event.target.files?.[0])}
          />
          <button
            className="button button-secondary button-small"
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <span className="spinner" /> : <FileUp size={15} />}
            {uploading ? "Uploading…" : photoUrl ? "Replace photo" : "Upload station photo"}
          </button>
        </div>
      </div>
    </section>
  );
}

function StationDescriptionPanel({
  station,
  onRefresh,
  onNotice,
}: {
  station: Station;
  onRefresh: () => void;
  onNotice: (notice: Notice | null) => void;
}) {
  const [description, setDescription] = useState(station.description ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDescription(station.description ?? "");
  }, [station.description]);

  async function saveDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      onNotice({ kind: "error", text: "Supabase is not configured. The station description could not be saved." });
      return;
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription.length > 500) {
      onNotice({ kind: "error", text: "The station description must be 500 characters or fewer." });
      return;
    }

    setSaving(true);
    onNotice(null);
    try {
      const { data, error } = await supabase
        .from("stations")
        .update({ description: trimmedDescription || null })
        .eq("id", station.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Station description was not updated. Check that you can manage this station.");
      onNotice({ kind: "success", text: "Station description saved successfully." });
      onRefresh();
    } catch (error) {
      onNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Station description could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel station-description-panel">
      <div className="panel-heading">
        <div><h2>About your station</h2><p>Tell customers what makes your water station special.</p></div>
      </div>
      <form className="station-description-form" onSubmit={(event) => void saveDescription(event)}>
        <label htmlFor="station-description">Station description</label>
        <textarea
          id="station-description"
          rows={4}
          maxLength={500}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Describe your water products, service, delivery, or what customers can expect."
        />
        <div className="station-description-footer">
          <small className="field-hint">{description.length}/500 characters. Customers can see this after your station is published.</small>
          <button className="button button-primary button-small" type="submit" disabled={saving || description === (station.description ?? "")}>
            {saving ? <span className="spinner spinner-light" /> : null}
            {saving ? "Saving…" : "Save description"}
          </button>
        </div>
      </form>
    </section>
  );
}

function ProductListPreview({
  products,
  onStock,
  onViewAll,
}: {
  products: StationProduct[];
  onStock: (product: StationProduct) => void;
  onViewAll: () => void;
}) {
  return (
    <div className="preview-list">
      {products.map((product) => (
        <div className="preview-row" key={product.id}>
          <span className="product-thumb"><Droplets size={17} /></span>
          <span className="preview-product-name"><strong>{product.name}</strong><small>{product.status === "active" ? money(product.refill_price) : readable(product.status)}</small></span>
          <button
            className={`stock-chip ${product.stock_quantity === 0 ? "stock-chip-out" : product.stock_quantity !== null && product.stock_quantity <= 5 ? "stock-chip-low" : ""}`}
            type="button"
            disabled={product.stock_quantity === null}
            onClick={() => onStock(product)}
          >
            {product.stock_quantity === null ? "Not tracked" : product.stock_quantity === 0 ? "Out of stock" : `${product.stock_quantity} in stock`}
          </button>
        </div>
      ))}
      <button className="text-link preview-link" type="button" onClick={onViewAll}>View all products <ArrowRight size={15} /></button>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon stat-icon-${tone}`}>{icon}</span>
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}

function ChecklistRow({
  done,
  icon,
  title,
  subtitle,
}: {
  done: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="checklist-row">
      <span className={`check-circle ${done ? "check-done" : ""}`}>{done ? <Check size={13} /> : icon}</span>
      <span><strong>{title}</strong><small>{subtitle}</small></span>
      {done && <BadgeCheck size={16} className="check-badge" />}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><dt>{label}</dt><dd>{value}</dd></div>;
}

function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div><h1>{title}</h1><p>{description}</p></div>
      {action}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

function NoticeBanner({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const Icon = notice.kind === "success" ? Check : CircleAlert;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const exitRef = useRef<() => void>(() => {});
  const [leaving, setLeaving] = useState(false);
  const duration = notice.duration ?? (notice.kind === "error" ? 7000 : 3800);
  useEffect(() => {
    setLeaving(false);
    let exitTimer = 0;
    const startExit = () => {
      setLeaving(true);
      exitTimer = window.setTimeout(() => closeRef.current(), 220);
    };
    exitRef.current = startExit;
    const timer = window.setTimeout(startExit, duration);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(exitTimer);
    };
  }, [notice, duration]);
  return (
    <div className="toast-layer">
      <div
        className={`toast toast-${notice.kind} ${leaving ? "is-leaving" : ""}`}
        role={notice.kind === "error" ? "alert" : "status"}
        style={{ "--toast-ms": `${duration}ms` } as CSSProperties}
      >
        <span className="toast-icon"><Icon size={13} strokeWidth={3} /></span>
        <span className="toast-text">{notice.text}</span>
        {notice.action && (
          <button
            className="toast-action"
            type="button"
            onClick={() => {
              notice.action?.onClick();
              exitRef.current();
            }}
          >
            {notice.action.label}
          </button>
        )}
        <button className="toast-close" type="button" aria-label="Dismiss message" onClick={() => exitRef.current()}><X size={14} /></button>
        <span className="toast-timer" />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="skeleton-page" aria-busy="true" aria-label="Loading your station">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-hero" />
      <div className="skeleton-row">
        <div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" />
      </div>
      <div className="skeleton skeleton-block" />
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (dialogRef.current && !dialogRef.current.contains(document.activeElement)) {
      dialogRef.current.focus();
    }
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header"><h2>{title}</h2><button className="icon-button" type="button" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
        {children}
      </section>
    </div>
  );
}

export default App;
