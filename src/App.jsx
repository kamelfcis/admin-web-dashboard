import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LogOut,
  LayoutGrid,
  RefreshCcw,
  Shield,
  Stethoscope,
  Table2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { MEDLINK_LOGO_URL, supabase } from "./lib/supabase";

const ROLE_SUPER = "super_admin";
const ROLE_HOSPITAL = "hospital_admin";
const PAGE_DASHBOARD = "dashboard";
const PAGE_SPECIALIZATIONS = "specializations";
const PAGE_HOSPITAL = "hospital";

const cx = (...v) => v.filter(Boolean).join(" ");

const uiStateKey = "medlink-admin-ui-state";
const CHART_COLORS = ["#22d3ee", "#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#fb7185", "#f97316"];

function loadUiState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(uiStateKey) || "{}");
    const validPages = [PAGE_DASHBOARD, PAGE_SPECIALIZATIONS, PAGE_HOSPITAL];
    return {
      collapsed: Boolean(parsed.collapsed),
      page: validPages.includes(parsed.page) ? parsed.page : PAGE_DASHBOARD,
    };
  } catch {
    return { collapsed: false, page: PAGE_DASHBOARD };
  }
}

function saveUiState(next) {
  localStorage.setItem(uiStateKey, JSON.stringify(next));
}

function extractObjectPath(bucket, rawValue) {
  const raw = (rawValue || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("http://") && !raw.startsWith("https://")) {
    return raw.startsWith(`${bucket}/`) ? raw.slice(bucket.length + 1) : raw;
  }
  try {
    const uri = new URL(raw);
    const parts = uri.pathname.split("/").filter(Boolean);
    const publicMarker = ["storage", "v1", "object", "public", bucket];
    const signMarker = ["storage", "v1", "object", "sign", bucket];
    const indexOfMarker = (marker) => {
      for (let i = 0; i <= parts.length - marker.length; i += 1) {
        if (marker.every((value, idx) => parts[i + idx] === value)) {
          return i + marker.length;
        }
      }
      return -1;
    };
    const fromPublic = indexOfMarker(publicMarker);
    if (fromPublic >= 0) return parts.slice(fromPublic).join("/");
    const fromSign = indexOfMarker(signMarker);
    if (fromSign >= 0) return parts.slice(fromSign).join("/");
    const bucketIndex = parts.indexOf(bucket);
    if (bucketIndex >= 0) return parts.slice(bucketIndex + 1).join("/");
    return null;
  } catch {
    return null;
  }
}

async function resolveSignedUrl(bucket, rawValue) {
  const path = extractObjectPath(bucket, rawValue);
  if (!path) return rawValue || null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) return rawValue || null;
  return data?.signedUrl ?? rawValue ?? null;
}

async function getPublicShareMeta(token) {
  const { data, error } = await supabase.rpc("get_public_share_link_meta", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

async function getPublicPatientProfile(token) {
  const { data, error } = await supabase.rpc("public_get_patient_profile_overview", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0) return null;
  const row = data[0];
  const renderProfileImageUrl = await resolveSignedUrl("profile-images", row.profile_image_url);
  return { ...row, render_profile_image_url: renderProfileImageUrl };
}

async function listPublicPatientTimeline(token) {
  const { data, error } = await supabase.rpc("public_get_patient_timeline_overview", {
    p_token: token,
  });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return Promise.all(
    rows.map(async (row) => {
      if (!row.attachment_url || !row.attachment_bucket) {
        return { ...row, render_attachment_url: null };
      }
      const signed = await resolveSignedUrl(row.attachment_bucket, row.attachment_url);
      return { ...row, render_attachment_url: signed };
    }),
  );
}

async function getSessionContext() {
  const { data, error } = await supabase.rpc("admin_get_session_context");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No admin profile found for this account.");
  }
  return data[0];
}

async function listSpecializations(searchText) {
  const { data, error } = await supabase.rpc("admin_list_specializations", {
    search_text: searchText?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return Promise.all(
    rows.map(async (item) => {
      const path = extractObjectPath("profile-images", item.image_url);
      if (!path) return { ...item, render_image_url: null };
      const { data: signed } = await supabase.storage
        .from("profile-images")
        .createSignedUrl(path, 60 * 60);
      return { ...item, render_image_url: signed?.signedUrl ?? null };
    }),
  );
}

async function listHospitalDoctors(searchText) {
  const { data, error } = await supabase.rpc("admin_list_hospital_doctors", {
    search_text: searchText?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return Promise.all(
    rows.map(async (item) => {
      const path = extractObjectPath("profile-images", item.profile_image_url);
      if (!path) return { ...item, render_profile_image_url: null };
      const { data: signed } = await supabase.storage
        .from("profile-images")
        .createSignedUrl(path, 60 * 60);
      return { ...item, render_profile_image_url: signed?.signedUrl ?? null };
    }),
  );
}

async function listSignupDoctors(searchText) {
  const { data, error } = await supabase.rpc("admin_list_signup_doctors", {
    search_text: searchText?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return Promise.all(
    rows.map(async (item) => {
      const path = extractObjectPath("profile-images", item.profile_image_url);
      if (!path) return { ...item, render_profile_image_url: null };
      const { data: signed } = await supabase.storage
        .from("profile-images")
        .createSignedUrl(path, 60 * 60);
      return { ...item, render_profile_image_url: signed?.signedUrl ?? null };
    }),
  );
}

async function listHospitals() {
  const { data, error } = await supabase.rpc("admin_list_hospitals");
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listHospitalsForManagement(searchText) {
  const { data, error } = await supabase.rpc("admin_list_hospitals_manage", {
    search_text: searchText?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getDashboardStats() {
  const { data, error } = await supabase.rpc("admin_dashboard_stats");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function StatCard({ title, value, hint, icon: Icon, tone = "cyan" }) {
  const toneClass =
    tone === "emerald"
      ? "from-emerald-500/30 via-emerald-400/10 to-transparent border-emerald-300/35"
      : tone === "violet"
        ? "from-violet-500/30 via-violet-400/10 to-transparent border-violet-300/35"
        : tone === "amber"
          ? "from-amber-500/30 via-amber-400/10 to-transparent border-amber-300/35"
          : tone === "rose"
            ? "from-rose-500/30 via-rose-400/10 to-transparent border-rose-300/35"
            : "from-cyan-500/30 via-cyan-400/10 to-transparent border-cyan-300/35";
  return (
    <article className={cx("glass-panel rounded-2xl border bg-gradient-to-br p-4", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-cyan-200/80">{title}</p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-300">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-2 text-cyan-100">
            <Icon size={18} />
          </span>
        ) : null}
      </div>
    </article>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <article className="glass-panel rounded-3xl p-4">
      <h3 className="text-base font-semibold text-cyan-100">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-slate-300">{subtitle}</p> : null}
      <div className="mt-4 h-[260px]">{children}</div>
    </article>
  );
}

function SimpleTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-cyan-300/30 bg-slate-950/90 px-3 py-2 text-xs text-slate-100">
      {label ? <p className="mb-1 font-semibold text-cyan-100">{label}</p> : null}
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {toNumber(entry.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
}

async function uploadToProfileImages(userId, file, folder) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectPath = `${userId}/${folder}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage
    .from("profile-images")
    .upload(objectPath, file, { upsert: false, cacheControl: "3600" });
  if (error) throw new Error(error.message);
  return objectPath;
}

function SkeletonTable() {
  return (
    <div className="space-y-3 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-11 w-full" />
      ))}
    </div>
  );
}

function PublicPatientProfilePageShell({ token }) {
  const metaQuery = useQuery({
    queryKey: ["public-share-meta", token],
    queryFn: () => getPublicShareMeta(token),
    enabled: Boolean(token),
  });

  const profileQuery = useQuery({
    queryKey: ["public-patient-profile", token],
    queryFn: () => getPublicPatientProfile(token),
    enabled: Boolean(token),
  });

  const timelineQuery = useQuery({
    queryKey: ["public-patient-timeline", token],
    queryFn: () => listPublicPatientTimeline(token),
    enabled: Boolean(token),
  });

  const groupedTimeline = useMemo(() => {
    const buckets = {
      medical_record: [],
      prescription: [],
      lab_test: [],
      scan: [],
      allergy: [],
      chronic_condition: [],
    };
    (timelineQuery.data ?? []).forEach((item) => {
      const key = item.entry_type;
      if (buckets[key]) {
        buckets[key].push(item);
      }
    });
    return buckets;
  }, [timelineQuery.data]);

  const typeTitles = {
    medical_record: "Medical Records",
    prescription: "Prescriptions",
    lab_test: "Lab Tests",
    scan: "Scans",
    allergy: "Allergies",
    chronic_condition: "Chronic Conditions",
  };

  const meta = metaQuery.data;
  const allowedSections = {
    medical_record: Boolean(meta?.show_medical_records),
    prescription: Boolean(meta?.show_prescriptions),
    lab_test: Boolean(meta?.show_lab_tests),
    scan: Boolean(meta?.show_scans),
    allergy: Boolean(meta?.show_allergies),
    chronic_condition: Boolean(meta?.show_chronic_conditions),
  };

  const isLoading = metaQuery.isLoading || profileQuery.isLoading || timelineQuery.isLoading;
  const errorText = metaQuery.error?.message || profileQuery.error?.message || timelineQuery.error?.message;
  const profile = profileQuery.data;
  const isValidLink = Boolean(meta?.valid);

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl px-3 py-5 sm:px-5 sm:py-7">
      <section className="glass-panel relative overflow-hidden rounded-3xl border border-cyan-300/35 bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-violet-500/20 p-5 sm:p-7">
        <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-violet-400/10 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/90">MedLink Secure Share</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-cyan-50 sm:text-3xl">Patient Timeline Snapshot</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-200 sm:text-base">
              Premium read-only health summary shared by patient consent.
            </p>
            {meta?.expires_at ? (
              <p className="mt-3 inline-flex rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-100">
                Expires at: {new Date(meta.expires_at).toLocaleString()}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-cyan-300/25 bg-white/10 px-3 py-2">
            <img
              src={MEDLINK_LOGO_URL}
              alt="MedLink"
              className="h-14 w-14 rounded-xl border border-cyan-300/25 bg-white/10 p-1 object-contain"
            />
            <div>
              <p className="text-sm font-semibold tracking-wide text-cyan-50">MED LINK</p>
              <p className="text-xs text-slate-300">Healthcare Platform</p>
            </div>
          </div>
        </div>
      </section>
      {isLoading && (
        <div className="mt-4 glass-panel rounded-3xl p-4">
          <SkeletonTable />
        </div>
      )}
      {errorText && !isLoading && (
        <div className="mt-4 glass-panel rounded-3xl border border-rose-300/30 bg-rose-500/10 p-4 text-rose-200">
          {errorText}
        </div>
      )}

      {!isLoading && !errorText && !isValidLink && (
        <div className="mt-4 glass-panel rounded-3xl border border-amber-300/30 bg-amber-500/10 p-5">
          <h2 className="text-lg font-semibold text-amber-100">Link Expired or Invalid</h2>
          <p className="mt-2 text-sm text-amber-50">
            This secure QR link is no longer available. Ask the patient to generate a new QR share.
          </p>
        </div>
      )}

      {!isLoading && !errorText && isValidLink && (
        <>
          <section className="mt-4 grid gap-4 xl:grid-cols-[380px,1fr]">
            <article className="glass-panel rounded-3xl p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-cyan-100">Patient Profile</h2>
              {!meta?.show_profile_basic ? (
                <p className="mt-3 text-sm text-slate-300">Profile section hidden by patient share settings.</p>
              ) : (
                <>
                  <div className="mt-3 flex items-center gap-3">
                    {profile?.render_profile_image_url ? (
                      <img
                        src={profile.render_profile_image_url}
                        alt={profile.full_name || "Patient"}
                        className="h-20 w-20 rounded-2xl border border-cyan-300/25 object-cover sm:h-24 sm:w-24"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-300/25 bg-white/10 text-cyan-100 sm:h-24 sm:w-24">
                        <Users size={28} />
                      </div>
                    )}
                    <div>
                      <p className="text-lg font-semibold text-cyan-50 sm:text-xl">{profile?.full_name || "Patient"}</p>
                      <p className="text-xs text-slate-300">Patient health summary</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <p className="rounded-xl border border-cyan-300/20 bg-white/5 px-3 py-2 text-slate-100">
                      Phone: <span className="text-cyan-100">{profile?.phone_number || "-"}</span>
                    </p>
                    <p className="rounded-xl border border-cyan-300/20 bg-white/5 px-3 py-2 text-slate-100">
                      Insurance: <span className="text-cyan-100">{profile?.insurance_provider || "-"}</span>
                    </p>
                    <p className="rounded-xl border border-cyan-300/20 bg-white/5 px-3 py-2 text-slate-100">
                      National ID: <span className="text-cyan-100">{profile?.national_id || "-"}</span>
                    </p>
                  </div>
                </>
              )}
            </article>

            <article className="glass-panel rounded-3xl p-4 sm:p-5">
              <h2 className="text-lg font-semibold text-cyan-100">Timeline Overview</h2>
              <p className="mt-1 text-sm text-slate-300">
                Full patient timeline including medical records, prescriptions, lab tests, scans, allergies, and chronic conditions.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(typeTitles)
                  .filter(([key]) => allowedSections[key])
                  .map(([key, label]) => (
                  <div key={key} className="rounded-xl border border-cyan-300/20 bg-white/5 px-3 py-2 text-sm backdrop-blur-sm">
                    <span className="text-slate-200">{label}</span>
                    <span className="ml-2 rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs text-cyan-100">
                      {(groupedTimeline[key] || []).length}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="mt-4 space-y-4">
            {Object.entries(typeTitles)
              .filter(([key]) => allowedSections[key])
              .map(([key, label]) => {
              const entries = groupedTimeline[key] || [];
              return (
                <article key={key} className="glass-panel rounded-3xl p-4 sm:p-5">
                  <h3 className="text-base font-semibold text-cyan-100">{label}</h3>
                  {entries.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">No entries.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {entries.map((entry) => (
                        <div
                          key={`${entry.entry_id}-${entry.entry_type}`}
                          className="rounded-xl border border-cyan-300/20 bg-white/5 p-3 transition hover:border-cyan-300/40 hover:bg-white/10"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-cyan-50">{entry.title}</p>
                              <p className="mt-1 text-sm text-slate-200">{entry.subtitle}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}
                              </p>
                              {(entry.doctor_name || entry.specialization_name) && (
                                <p className="mt-1 text-xs text-cyan-200">
                                  {entry.doctor_name || "Doctor"}
                                  {entry.specialization_name ? ` • ${entry.specialization_name}` : ""}
                                </p>
                              )}
                            </div>
                            {entry.render_attachment_url ? (
                              <a
                                href={entry.render_attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className="med-btn-secondary px-3 py-1.5 text-xs"
                              >
                                Open Attachment
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

function DataTable({ columns, data, emptyText = "No data found." }) {
  const [sorting, setSorting] = useState([]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-auto rounded-2xl border border-cyan-300/20">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-white/5">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="cursor-pointer border-b border-cyan-300/10 px-3 py-3 text-left font-semibold text-cyan-100"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td className="px-3 py-7 text-center text-slate-300" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-cyan-300/10 hover:bg-white/5">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-3 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: async () => {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw new Error(signInError.message);
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);
      if (!data.session) throw new Error("No session returned.");
      return data.session;
    },
    onSuccess: (session) => {
      setError("");
      onLoggedIn(session);
    },
    onError: (err) => setError(err.message || "Login failed."),
  });

  return (
    <section className="mx-auto mt-20 w-full max-w-md rounded-3xl glass-panel p-8 shadow-glow">
      <div className="mx-auto mb-4 h-24 w-24 rounded-full border border-cyan-300/20 bg-white/10 p-2">
        <img src={MEDLINK_LOGO_URL} alt="MedLink" className="h-full w-full rounded-full object-contain" />
      </div>
      <h1 className="text-center text-3xl font-bold tracking-tight">MedLink Admin</h1>
      <p className="mt-2 text-center text-sm text-slate-300">
        Futuristic control center for super admins and hospital admins.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          loginMutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-cyan-100">Email</label>
          <input
            className="med-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@medlink.com"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-cyan-100">Password</label>
          <div className="relative">
            <input
              className="med-input pr-11"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-100/90"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {error && <p className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
        <button className="med-btn-primary w-full" disabled={loginMutation.isPending} type="submit">
          {loginMutation.isPending ? "Signing in..." : "Login"}
        </button>
      </form>
    </section>
  );
}

function AppShell({
  session,
  context,
  activePage,
  setActivePage,
  collapsed,
  setCollapsed,
  onLogout,
}) {
  const [specializationSearch, setSpecializationSearch] = useState("");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [signupDoctorSearch, setSignupDoctorSearch] = useState("");
  const [hospitalSearch, setHospitalSearch] = useState("");
  const [specializationsViewMode, setSpecializationsViewMode] = useState("cards");
  const [hospitalDoctorsViewMode, setHospitalDoctorsViewMode] = useState("cards");
  const [signupDoctorsViewMode, setSignupDoctorsViewMode] = useState("cards");
  const [hospitalsManageViewMode, setHospitalsManageViewMode] = useState("cards");
  const [specName, setSpecName] = useState("");
  const [specActive, setSpecActive] = useState(true);
  const [specImage, setSpecImage] = useState(null);
  const [editingSpecId, setEditingSpecId] = useState(null);
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [hospitalPhone, setHospitalPhone] = useState("");
  const [editingHospitalId, setEditingHospitalId] = useState(null);
  const [doctorEmail, setDoctorEmail] = useState("");
  const [doctorLicense, setDoctorLicense] = useState("");
  const [doctorSpecializationId, setDoctorSpecializationId] = useState("");
  const [doctorVerified, setDoctorVerified] = useState(false);
  const [doctorImage, setDoctorImage] = useState(null);
  const [selectedHospitalByDoctor, setSelectedHospitalByDoctor] = useState({});

  const queryClient = useQueryClient();
  const canAccessSpecializations = context.role === ROLE_SUPER;
  const canAccessHospital = context.role === ROLE_HOSPITAL || context.role === ROLE_SUPER;
  const canAccessDashboard = canAccessHospital || canAccessSpecializations;
  const isDashboardPage = activePage === PAGE_DASHBOARD;
  const isHospitalPage = activePage === PAGE_HOSPITAL;

  const specializationsQuery = useQuery({
    queryKey: ["specializations", specializationSearch],
    queryFn: () => listSpecializations(specializationSearch),
    enabled: canAccessSpecializations || isHospitalPage,
  });

  const doctorsQuery = useQuery({
    queryKey: ["hospital-doctors", doctorSearch],
    queryFn: () => listHospitalDoctors(doctorSearch),
    enabled: canAccessHospital && (isHospitalPage || isDashboardPage),
  });

  const signupDoctorsQuery = useQuery({
    queryKey: ["signup-doctors", signupDoctorSearch],
    queryFn: () => listSignupDoctors(signupDoctorSearch),
    enabled: context.role === ROLE_SUPER && (isHospitalPage || isDashboardPage),
  });

  const hospitalsQuery = useQuery({
    queryKey: ["hospitals"],
    queryFn: listHospitals,
    enabled: canAccessHospital && (isHospitalPage || isDashboardPage),
  });

  const hospitalsManageQuery = useQuery({
    queryKey: ["hospitals-manage", hospitalSearch],
    queryFn: () => listHospitalsForManagement(hospitalSearch),
    enabled: context.role === ROLE_SUPER && isHospitalPage,
  });

  const dashboardStatsQuery = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: getDashboardStats,
    enabled: canAccessDashboard,
  });

  useEffect(() => {
    saveUiState({ collapsed, page: activePage });
  }, [collapsed, activePage]);

  const specializationMutation = useMutation({
    mutationFn: async () => {
      let imagePath = null;
      if (specImage) {
        imagePath = await uploadToProfileImages(session.user.id, specImage, "specializations");
      }
      const { error } = await supabase.rpc("admin_upsert_specialization", {
        p_id: editingSpecId,
        p_name: specName.trim(),
        p_active: specActive,
        p_image_url: imagePath,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setEditingSpecId(null);
      setSpecName("");
      setSpecActive(true);
      setSpecImage(null);
      queryClient.invalidateQueries({ queryKey: ["specializations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const deleteSpecializationMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc("admin_delete_specialization", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["specializations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const upsertHospitalMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("admin_upsert_hospital", {
        p_id: editingHospitalId,
        p_name: hospitalName.trim(),
        p_address: hospitalAddress.trim() || null,
        p_phone: hospitalPhone.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setEditingHospitalId(null);
      setHospitalName("");
      setHospitalAddress("");
      setHospitalPhone("");
      queryClient.invalidateQueries({ queryKey: ["hospitals"] });
      queryClient.invalidateQueries({ queryKey: ["hospitals-manage"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const deleteHospitalMutation = useMutation({
    mutationFn: async (hospitalId) => {
      const { error } = await supabase.rpc("admin_delete_hospital", {
        p_id: hospitalId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      if (editingHospitalId) {
        setEditingHospitalId(null);
        setHospitalName("");
        setHospitalAddress("");
        setHospitalPhone("");
      }
      queryClient.invalidateQueries({ queryKey: ["hospitals"] });
      queryClient.invalidateQueries({ queryKey: ["hospitals-manage"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["signup-doctors"] });
    },
  });

  const assignDoctorMutation = useMutation({
    mutationFn: async () => {
      const { data: found, error: findError } = await supabase.rpc("admin_find_doctor_by_email", {
        p_email: doctorEmail.trim().toLowerCase(),
      });
      if (findError) throw new Error(findError.message);
      if (!found?.length) throw new Error("Doctor account not found for this email.");

      let imagePath = null;
      if (doctorImage) {
        imagePath = await uploadToProfileImages(session.user.id, doctorImage, "doctor-profiles");
      }
      const doctorId = found[0].doctor_id;

      const { error: assignError } = await supabase.rpc("admin_assign_hospital_doctor", {
        p_doctor_id: doctorId,
      });
      if (assignError) throw new Error(assignError.message);

      const { error: updateError } = await supabase.rpc("admin_update_hospital_doctor", {
        p_doctor_id: doctorId,
        p_moh_license_number: doctorLicense.trim(),
        p_specialization_id: doctorSpecializationId || null,
        p_verified: doctorVerified,
        p_profile_image_url: imagePath,
      });
      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => {
      setDoctorEmail("");
      setDoctorLicense("");
      setDoctorSpecializationId("");
      setDoctorVerified(false);
      setDoctorImage(null);
      queryClient.invalidateQueries({ queryKey: ["hospital-doctors"] });
      queryClient.invalidateQueries({ queryKey: ["signup-doctors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["hospitals"] });
    },
  });

  const assignDoctorToHospitalMutation = useMutation({
    mutationFn: async ({ doctorId, hospitalId }) => {
      const { error } = await supabase.rpc("admin_assign_doctor_to_hospital", {
        p_doctor_id: doctorId,
        p_hospital_id: hospitalId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, vars) => {
      setSelectedHospitalByDoctor((prev) => ({ ...prev, [vars.doctorId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["hospital-doctors"] });
      queryClient.invalidateQueries({ queryKey: ["signup-doctors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["hospitals"] });
    },
  });

  const toggleSignupDoctorVerifiedMutation = useMutation({
    mutationFn: async ({ doctorId, verified }) => {
      const { error } = await supabase.rpc("admin_set_doctor_verified", {
        p_doctor_id: doctorId,
        p_verified: verified,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signup-doctors"] });
      queryClient.invalidateQueries({ queryKey: ["hospital-doctors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  const removeDoctorMutation = useMutation({
    mutationFn: async (doctorId) => {
      const { error } = await supabase.rpc("admin_remove_hospital_doctor", {
        p_doctor_id: doctorId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hospital-doctors"] });
      queryClient.invalidateQueries({ queryKey: ["signup-doctors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["hospitals"] });
    },
  });

  const specializationColumns = useMemo(
    () => [
      {
        header: "Image",
        cell: ({ row }) =>
          row.original.render_image_url ? (
            <a href={row.original.render_image_url} target="_blank" rel="noreferrer">
              <img
                src={row.original.render_image_url}
                alt={row.original.name}
                className="h-10 w-10 rounded-lg border border-cyan-300/30 object-cover"
              />
            </a>
          ) : (
            <span className="text-xs text-slate-400">No image</span>
          ),
      },
      { accessorKey: "name", header: "Name" },
      {
        accessorKey: "active",
        header: "Active",
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">ACTIVE</span>
          ) : (
            <span className="rounded-full bg-rose-500/20 px-2 py-1 text-xs text-rose-300">INACTIVE</span>
          ),
      },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              className="med-btn-secondary px-3 py-1.5 text-xs"
              onClick={() => {
                setEditingSpecId(row.original.id);
                setSpecName(row.original.name ?? "");
                setSpecActive(Boolean(row.original.active));
                setSpecImage(null);
              }}
            >
              Edit
            </button>
            <button
              className="med-btn-secondary border-rose-300/35 px-3 py-1.5 text-xs text-rose-100"
              onClick={() => {
                if (window.confirm("Delete this specialization?")) {
                  deleteSpecializationMutation.mutate(row.original.id);
                }
              }}
            >
              Delete
            </button>
          </div>
        ),
      },
    ],
    [deleteSpecializationMutation],
  );

  const doctorColumns = useMemo(
    () => [
      { accessorKey: "doctor_name", header: "Doctor" },
      { accessorKey: "doctor_email", header: "Email" },
      { accessorKey: "specialization_name", header: "Specialization" },
      { accessorKey: "moh_license_number", header: "MOH License" },
      {
        accessorKey: "verified",
        header: "Verified",
        cell: ({ row }) => {
          const doctorId = row.original.doctor_id;
          const isVerified = Boolean(row.original.verified);
          const isUpdating =
            toggleSignupDoctorVerifiedMutation.isPending &&
            toggleSignupDoctorVerifiedMutation.variables?.doctorId === doctorId;

          return (
            <button
              className={cx(
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition",
                isVerified
                  ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-200"
                  : "border-amber-300/40 bg-amber-500/20 text-amber-200",
                isUpdating && "cursor-not-allowed opacity-70",
              )}
              disabled={isUpdating}
              onClick={() =>
                toggleSignupDoctorVerifiedMutation.mutate({
                  doctorId,
                  verified: !isVerified,
                })
              }
              title="Toggle verification status"
            >
              {isUpdating ? "Updating..." : isVerified ? "Verified" : "Not verified"}
            </button>
          );
        },
      },
      {
        header: "Actions",
        cell: ({ row }) => (
          <button
            className="med-btn-secondary px-3 py-1.5 text-xs"
            disabled={context.role === ROLE_SUPER || removeDoctorMutation.isPending}
            onClick={() => {
              if (context.role === ROLE_SUPER) return;
              if (window.confirm("Remove this doctor from your hospital?")) {
                removeDoctorMutation.mutate(row.original.doctor_id);
              }
            }}
          >
            Remove
          </button>
        ),
      },
    ],
    [context.role, removeDoctorMutation],
  );

  const signupDoctorColumns = useMemo(
    () => [
      {
        header: "Image",
        cell: ({ row }) =>
          row.original.render_profile_image_url ? (
            <a href={row.original.render_profile_image_url} target="_blank" rel="noreferrer">
              <img
                src={row.original.render_profile_image_url}
                alt={row.original.doctor_name || "Doctor image"}
                className="h-10 w-10 rounded-lg border border-cyan-300/30 object-cover"
              />
            </a>
          ) : (
            <span className="text-xs text-slate-400">No image</span>
          ),
      },
      { accessorKey: "doctor_name", header: "Doctor" },
      { accessorKey: "doctor_email", header: "Email" },
      { accessorKey: "specialization_name", header: "Specialization" },
      { accessorKey: "moh_license_number", header: "MOH License" },
      {
        accessorKey: "verified",
        header: "Verified",
        cell: ({ getValue }) =>
          getValue() ? (
            <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">YES</span>
          ) : (
            <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-300">NO</span>
          ),
      },
      {
        header: "Assigned Hospitals",
        cell: ({ row }) => (
          <div className="max-w-[250px]">
            <p className="text-xs text-slate-200">{row.original.assigned_hospitals || "None yet"}</p>
            <p className="text-[11px] text-cyan-200/80">{toNumber(row.original.assigned_hospitals_count)} linked</p>
          </div>
        ),
      },
      {
        header: "Assign to Hospital",
        cell: ({ row }) => {
          const doctorId = row.original.doctor_id;
          const selectedHospitalId = selectedHospitalByDoctor[doctorId] ?? "";
          const isBusy = assignDoctorToHospitalMutation.isPending;
          return (
            <div className="flex min-w-[280px] items-center gap-2">
              <select
                className="med-input py-2 text-xs"
                value={selectedHospitalId}
                onChange={(e) =>
                  setSelectedHospitalByDoctor((prev) => ({
                    ...prev,
                    [doctorId]: e.target.value,
                  }))
                }
              >
                <option value="">Select hospital</option>
                {(hospitalsQuery.data ?? []).map((hospital) => (
                  <option key={hospital.hospital_id} value={hospital.hospital_id}>
                    {hospital.hospital_name}
                  </option>
                ))}
              </select>
              <button
                className="med-btn-primary px-3 py-2 text-xs"
                disabled={isBusy || !selectedHospitalId}
                onClick={() =>
                  assignDoctorToHospitalMutation.mutate({
                    doctorId,
                    hospitalId: selectedHospitalId,
                  })
                }
              >
                {isBusy ? "Assigning..." : "Assign"}
              </button>
            </div>
          );
        },
      },
    ],
    [
      assignDoctorToHospitalMutation,
      hospitalsQuery.data,
      selectedHospitalByDoctor,
      toggleSignupDoctorVerifiedMutation,
    ],
  );

  const hospitalManageColumns = useMemo(
    () => [
      { accessorKey: "hospital_name", header: "Hospital" },
      {
        accessorKey: "hospital_address",
        header: "Address",
        cell: ({ getValue }) => getValue() || "-",
      },
      {
        accessorKey: "hospital_phone",
        header: "Phone",
        cell: ({ getValue }) => getValue() || "-",
      },
      {
        accessorKey: "doctor_count",
        header: "Doctors",
        cell: ({ getValue }) => toNumber(getValue()).toLocaleString(),
      },
      {
        accessorKey: "hospital_admin_count",
        header: "Admins",
        cell: ({ getValue }) => toNumber(getValue()).toLocaleString(),
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ getValue }) => {
          const value = getValue();
          return value ? new Date(value).toLocaleDateString() : "-";
        },
      },
      {
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <button
              className="med-btn-secondary px-3 py-1.5 text-xs"
              onClick={() => {
                setEditingHospitalId(row.original.hospital_id);
                setHospitalName(row.original.hospital_name ?? "");
                setHospitalAddress(row.original.hospital_address ?? "");
                setHospitalPhone(row.original.hospital_phone ?? "");
              }}
            >
              Edit
            </button>
            <button
              className="med-btn-secondary border-rose-300/35 px-3 py-1.5 text-xs text-rose-100"
              onClick={() => {
                if (window.confirm("Delete this hospital?")) {
                  deleteHospitalMutation.mutate(row.original.hospital_id);
                }
              }}
            >
              Delete
            </button>
          </div>
        ),
      },
    ],
    [deleteHospitalMutation],
  );

  const dashboardStats = dashboardStatsQuery.data;
  const statsCards = useMemo(() => {
    if (!dashboardStats) return [];
    const isSuperScope = dashboardStats.scope === ROLE_SUPER;
    if (isSuperScope) {
      return [
        {
          title: "Total Doctors",
          value: toNumber(dashboardStats.total_doctors).toLocaleString(),
          hint: `${toNumber(dashboardStats.recent_doctor_signups_30d).toLocaleString()} joined in 30 days`,
          icon: Users,
          tone: "cyan",
        },
        {
          title: "Assigned Doctors",
          value: toNumber(dashboardStats.assigned_doctors).toLocaleString(),
          hint: `${toNumber(dashboardStats.unassigned_doctors).toLocaleString()} still unassigned`,
          icon: UserPlus,
          tone: "violet",
        },
        {
          title: "Verified Doctors",
          value: toNumber(dashboardStats.verified_doctors).toLocaleString(),
          hint: `${toNumber(dashboardStats.unverified_doctors).toLocaleString()} pending verification`,
          icon: UserCheck,
          tone: "emerald",
        },
        {
          title: "Hospitals",
          value: toNumber(dashboardStats.total_hospitals).toLocaleString(),
          hint: `${toNumber(dashboardStats.total_hospital_admins).toLocaleString()} hospital admins`,
          icon: Building2,
          tone: "amber",
        },
        {
          title: "Specializations",
          value: toNumber(dashboardStats.total_specializations).toLocaleString(),
          hint: "Active specializations in system",
          icon: Shield,
          tone: "rose",
        },
        {
          title: "Appointments",
          value: toNumber(dashboardStats.total_appointments).toLocaleString(),
          hint: `${toNumber(dashboardStats.recent_appointments_30d).toLocaleString()} in last 30 days`,
          icon: CalendarDays,
          tone: "cyan",
        },
      ];
    }
    return [
      {
        title: "My Hospital Doctors",
        value: toNumber(dashboardStats.total_doctors).toLocaleString(),
        hint: dashboardStats.hospital_name || "Current hospital",
        icon: Users,
        tone: "cyan",
      },
      {
        title: "Verified Doctors",
        value: toNumber(dashboardStats.verified_doctors).toLocaleString(),
        hint: `${toNumber(dashboardStats.unverified_doctors).toLocaleString()} pending verification`,
        icon: UserCheck,
        tone: "emerald",
      },
      {
        title: "Hospital Admins",
        value: toNumber(dashboardStats.total_hospital_admins).toLocaleString(),
        hint: "Admins linked to this hospital",
        icon: Shield,
        tone: "amber",
      },
      {
        title: "Covered Specializations",
        value: toNumber(dashboardStats.total_specializations).toLocaleString(),
        hint: "Distinct doctor specializations",
        icon: Stethoscope,
        tone: "violet",
      },
      {
        title: "Appointments",
        value: toNumber(dashboardStats.total_appointments).toLocaleString(),
        hint: `${toNumber(dashboardStats.recent_appointments_30d).toLocaleString()} in last 30 days`,
        icon: CalendarDays,
        tone: "rose",
      },
      {
        title: "New Doctor Signups (30d)",
        value: toNumber(dashboardStats.recent_doctor_signups_30d).toLocaleString(),
        hint: "Newly signed-up doctors linked to your hospital",
        icon: BarChart3,
        tone: "cyan",
      },
    ];
  }, [dashboardStats]);

  const chartDoctorRows = context.role === ROLE_SUPER ? signupDoctorsQuery.data ?? [] : doctorsQuery.data ?? [];
  const chartHospitalRows = hospitalsQuery.data ?? [];

  const verificationPieData = useMemo(
    () => [
      { name: "Verified", value: toNumber(dashboardStats?.verified_doctors) },
      { name: "Unverified", value: toNumber(dashboardStats?.unverified_doctors) },
    ],
    [dashboardStats],
  );

  const assignmentPieData = useMemo(
    () => [
      { name: "Assigned", value: toNumber(dashboardStats?.assigned_doctors) },
      { name: "Unassigned", value: toNumber(dashboardStats?.unassigned_doctors) },
    ],
    [dashboardStats],
  );

  const specializationBarData = useMemo(() => {
    const grouped = chartDoctorRows.reduce((acc, row) => {
      const key = row.specialization_name || "Unspecified";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [chartDoctorRows]);

  const hospitalBarData = useMemo(() => {
    return (chartHospitalRows || [])
      .map((h) => ({
        name: h.hospital_name || "Hospital",
        doctors: toNumber(h.doctor_count),
      }))
      .sort((a, b) => b.doctors - a.doctors)
      .slice(0, 8);
  }, [chartHospitalRows]);

  const lineTrendData = useMemo(() => {
    const recent = toNumber(dashboardStats?.recent_appointments_30d);
    const total = toNumber(dashboardStats?.total_appointments);
    const base = Math.max(0, total - recent);
    const monthShare = [12, 14, 15, 16, 20, 23];
    const labels = ["M-5", "M-4", "M-3", "M-2", "M-1", "Now"];
    return labels.map((label, i) => ({
      label,
      total: Math.round((base * (i + 1)) / labels.length + (recent * monthShare[i]) / 100),
      recent: Math.round((recent * monthShare[i]) / 100),
    }));
  }, [dashboardStats]);

  const radarData = useMemo(
    () => [
      { metric: "Doctors", value: toNumber(dashboardStats?.total_doctors) },
      { metric: "Verified", value: toNumber(dashboardStats?.verified_doctors) },
      { metric: "Hospitals", value: toNumber(dashboardStats?.total_hospitals) },
      { metric: "Specializations", value: toNumber(dashboardStats?.total_specializations) },
      { metric: "Appointments", value: toNumber(dashboardStats?.total_appointments) },
    ],
    [dashboardStats],
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-[1700px] gap-4 px-4 pb-4 pt-0">
      <aside
        className={cx(
          "glass-panel sticky top-0 h-screen rounded-b-3xl p-3 transition-all duration-200",
          collapsed ? "w-[88px]" : "w-[300px]",
        )}
      >
        <div className={cx("mb-4 flex items-center gap-3 border-b border-cyan-300/20 pb-4", collapsed && "justify-center")}>
          <img src={MEDLINK_LOGO_URL} alt="MedLink" className="h-12 w-12 rounded-xl border border-cyan-300/20 bg-white/10 p-1" />
          {!collapsed && (
            <div>
              <p className="font-semibold tracking-wide">MED LINK</p>
              <p className="text-xs text-slate-300">Admin Control Center</p>
            </div>
          )}
        </div>

        <nav className="space-y-2">
          <button
            className={cx(
              "w-full rounded-xl border px-3 py-2 text-left text-sm transition",
              activePage === PAGE_DASHBOARD
                ? "border-cyan-300/60 bg-cyan-400/15 shadow-glow"
                : "border-cyan-300/20 bg-white/5",
              !canAccessDashboard && "cursor-not-allowed opacity-40",
              collapsed && "flex justify-center px-0",
            )}
            onClick={() => canAccessDashboard && setActivePage(PAGE_DASHBOARD)}
          >
            <span className={cx("inline-flex items-center gap-2", collapsed && "justify-center")}>
              <BarChart3 size={16} />
              {!collapsed && "Dashboard"}
            </span>
          </button>
          <button
            className={cx(
              "w-full rounded-xl border px-3 py-2 text-left text-sm transition",
              activePage === PAGE_SPECIALIZATIONS
                ? "border-cyan-300/60 bg-cyan-400/15 shadow-glow"
                : "border-cyan-300/20 bg-white/5",
              !canAccessSpecializations && "cursor-not-allowed opacity-40",
              collapsed && "flex justify-center px-0",
            )}
            onClick={() => canAccessSpecializations && setActivePage(PAGE_SPECIALIZATIONS)}
          >
            <span className={cx("inline-flex items-center gap-2", collapsed && "justify-center")}>
              <Shield size={16} />
              {!collapsed && "Specializations"}
            </span>
          </button>
          <button
            className={cx(
              "w-full rounded-xl border px-3 py-2 text-left text-sm transition",
              activePage === PAGE_HOSPITAL
                ? "border-cyan-300/60 bg-cyan-400/15 shadow-glow"
                : "border-cyan-300/20 bg-white/5",
              !canAccessHospital && "cursor-not-allowed opacity-40",
              collapsed && "flex justify-center px-0",
            )}
            onClick={() => canAccessHospital && setActivePage(PAGE_HOSPITAL)}
          >
            <span className={cx("inline-flex items-center gap-2", collapsed && "justify-center")}>
              <Stethoscope size={16} />
              {!collapsed && "Hospital"}
            </span>
          </button>
        </nav>

        {!collapsed && (
          <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-slate-950/40 p-3">
            <p className="text-xs uppercase tracking-wider text-slate-400">Logged in</p>
            <p className="mt-1 truncate text-sm font-semibold">{session.user.email}</p>
            <p className="text-xs text-cyan-200">{context.role.replace("_", " ").toUpperCase()}</p>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        <header className="glass-panel sticky top-0 z-10 mb-4 rounded-b-3xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {activePage === PAGE_DASHBOARD
                  ? "Dashboard"
                  : activePage === PAGE_SPECIALIZATIONS
                    ? "Specializations"
                    : "Hospital Management"}
              </h1>
              <p className="text-sm text-slate-300">
                {activePage === PAGE_DASHBOARD
                  ? "High-level analytics for doctors, hospitals, and appointments."
                  : activePage === PAGE_SPECIALIZATIONS
                    ? "Manage medical specialties with premium workflows."
                    : "Manage hospitals and doctor assignments with premium workflows."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="med-btn-secondary px-3"
                onClick={() => setCollapsed((v) => !v)}
                title={collapsed ? "Expand menu" : "Collapse menu"}
              >
                {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
              </button>
              <button
                className="med-btn-secondary gap-2"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
                  queryClient.invalidateQueries({ queryKey: ["signup-doctors"] });
                  queryClient.invalidateQueries({ queryKey: ["hospitals"] });
                  queryClient.invalidateQueries({ queryKey: ["hospitals-manage"] });
                  queryClient.invalidateQueries({ queryKey: ["specializations"] });
                  queryClient.invalidateQueries({ queryKey: ["hospital-doctors"] });
                }}
              >
                <RefreshCcw size={16} /> Refresh
              </button>
              <button className="med-btn-secondary gap-2 border-rose-300/35 text-rose-100" onClick={onLogout}>
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        </header>

        {activePage === PAGE_DASHBOARD && (
          <section className="space-y-4">
            {dashboardStatsQuery.isLoading ? (
              <div className="glass-panel rounded-3xl p-4">
                <SkeletonTable />
              </div>
            ) : dashboardStatsQuery.isError ? (
              <div className="glass-panel rounded-3xl p-4">
                <p className="text-rose-200">{dashboardStatsQuery.error.message}</p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {statsCards.map((card) => (
                    <StatCard
                      key={card.title}
                      title={card.title}
                      value={card.value}
                      hint={card.hint}
                      icon={card.icon}
                      tone={card.tone}
                    />
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
                  <div className="glass-panel rounded-3xl border border-cyan-300/35 bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-violet-500/20 p-4">
                    <h2 className="text-lg font-semibold text-cyan-100">Quick Shortcuts</h2>
                    <p className="mt-1 text-sm text-slate-200">Jump quickly to major admin actions.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className="med-btn-primary px-3 py-2 text-xs" onClick={() => setActivePage(PAGE_HOSPITAL)}>
                        Hospital Management
                      </button>
                      <button
                        className="med-btn-secondary border-violet-300/45 bg-violet-500/15 px-3 py-2 text-xs"
                        onClick={() => setActivePage(PAGE_SPECIALIZATIONS)}
                        disabled={!canAccessSpecializations}
                      >
                        Specializations
                      </button>
                      <button
                        className="med-btn-secondary border-emerald-300/45 bg-emerald-500/15 px-3 py-2 text-xs"
                        onClick={() => {
                          queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
                          queryClient.invalidateQueries({ queryKey: ["hospitals"] });
                          queryClient.invalidateQueries({ queryKey: ["signup-doctors"] });
                          queryClient.invalidateQueries({ queryKey: ["hospital-doctors"] });
                        }}
                      >
                        Refresh Analytics
                      </button>
                    </div>
                  </div>
                  <div className="glass-panel rounded-3xl border border-emerald-300/35 bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-cyan-500/20 p-4">
                    <h2 className="text-lg font-semibold text-emerald-100">Scope Overview</h2>
                    <p className="mt-1 text-sm text-slate-200">
                      {dashboardStats?.scope === ROLE_SUPER
                        ? "Global system analytics."
                        : `${dashboardStats?.hospital_name || "Assigned hospital"} analytics.`}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-100">
                      <div className="rounded-xl border border-white/20 bg-white/10 p-2">
                        Hospitals: <span className="font-semibold">{toNumber(dashboardStats?.total_hospitals).toLocaleString()}</span>
                      </div>
                      <div className="rounded-xl border border-white/20 bg-white/10 p-2">
                        Admins: <span className="font-semibold">{toNumber(dashboardStats?.total_hospital_admins).toLocaleString()}</span>
                      </div>
                      <div className="rounded-xl border border-white/20 bg-white/10 p-2">
                        Doctors: <span className="font-semibold">{toNumber(dashboardStats?.total_doctors).toLocaleString()}</span>
                      </div>
                      <div className="rounded-xl border border-white/20 bg-white/10 p-2">
                        Appointments: <span className="font-semibold">{toNumber(dashboardStats?.total_appointments).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <ChartPanel title="Verification Split (Pie)" subtitle="Verified vs unverified doctors">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={verificationPieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} label>
                          {verificationPieData.map((entry, idx) => (
                            <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<SimpleTooltip />} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  <ChartPanel title="Assignment Split (Pie)" subtitle="Assigned vs unassigned doctors">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={assignmentPieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={88} label>
                          {assignmentPieData.map((entry, idx) => (
                            <Cell key={entry.name} fill={CHART_COLORS[(idx + 2) % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<SimpleTooltip />} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  <ChartPanel title="Appointments Trend (Line)" subtitle="Smoothed trend for total and recent appointments">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={lineTrendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="label" stroke="#cbd5e1" />
                        <YAxis stroke="#cbd5e1" />
                        <Tooltip content={<SimpleTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="total" stroke="#22d3ee" strokeWidth={3} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="recent" stroke="#a78bfa" strokeWidth={3} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  <ChartPanel title="Appointments Volume (Area)" subtitle="Filled area view of trend intensity">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={lineTrendData}>
                        <defs>
                          <linearGradient id="totalArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.45} />
                            <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.04} />
                          </linearGradient>
                          <linearGradient id="recentArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.45} />
                            <stop offset="95%" stopColor="#f97316" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="label" stroke="#cbd5e1" />
                        <YAxis stroke="#cbd5e1" />
                        <Tooltip content={<SimpleTooltip />} />
                        <Legend />
                        <Area type="monotone" dataKey="total" stroke="#22d3ee" fill="url(#totalArea)" />
                        <Area type="monotone" dataKey="recent" stroke="#f97316" fill="url(#recentArea)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  <ChartPanel title="Specialization Distribution (Bar)" subtitle="Top specializations by doctor count">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={specializationBarData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="name" stroke="#cbd5e1" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
                        <YAxis stroke="#cbd5e1" />
                        <Tooltip content={<SimpleTooltip />} />
                        <Bar dataKey="count" fill="#34d399" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartPanel>

                  <ChartPanel title="Hospital Capacity (Bar)" subtitle="Doctor count by hospital">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hospitalBarData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="name" stroke="#cbd5e1" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" />
                        <YAxis stroke="#cbd5e1" />
                        <Tooltip content={<SimpleTooltip />} />
                        <Bar dataKey="doctors" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartPanel>
                </div>

                <ChartPanel title="Operational Radar" subtitle="Relative strength across key metrics">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#475569" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                      <Tooltip content={<SimpleTooltip />} />
                      <Radar dataKey="value" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.4} />
                    </RadarChart>
                  </ResponsiveContainer>
                </ChartPanel>
              </>
            )}
          </section>
        )}

        {activePage === PAGE_SPECIALIZATIONS && (
          <section className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
              <div className="glass-panel rounded-3xl p-4">
                <div className="mb-3 flex items-center gap-2">
                  <input
                    className="med-input"
                    placeholder="Search specialization..."
                    value={specializationSearch}
                    onChange={(e) => setSpecializationSearch(e.target.value)}
                  />
                  <button
                    className="med-btn-secondary gap-2 px-3 py-2 text-xs"
                    onClick={() => setSpecializationsViewMode((prev) => (prev === "table" ? "cards" : "table"))}
                    title={specializationsViewMode === "table" ? "Switch to cards" : "Switch to table"}
                  >
                    {specializationsViewMode === "table" ? <LayoutGrid size={14} /> : <Table2 size={14} />}
                    {specializationsViewMode === "table" ? "Cards" : "Table"}
                  </button>
                </div>
                {specializationsQuery.isLoading ? (
                  <SkeletonTable />
                ) : specializationsViewMode === "table" ? (
                  <DataTable
                    columns={specializationColumns}
                    data={specializationsQuery.data ?? []}
                    emptyText="No specializations found."
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {(specializationsQuery.data ?? []).map((spec) => (
                      <article key={spec.id} className="rounded-2xl border border-cyan-300/20 bg-white/5 p-3">
                        <div className="mb-3 overflow-hidden rounded-xl border border-cyan-300/30 bg-slate-900/50">
                          {spec.render_image_url ? (
                            <img
                              src={spec.render_image_url}
                              alt={spec.name}
                              className="h-44 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-44 items-center justify-center text-xs text-slate-400">No image</div>
                          )}
                        </div>
                        <p className="text-base font-semibold text-cyan-100">{spec.name}</p>
                        <p className="mt-1 text-xs text-slate-300">{spec.active ? "Active specialization" : "Inactive specialization"}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            className="med-btn-secondary px-3 py-1.5 text-xs"
                            onClick={() => {
                              setEditingSpecId(spec.id);
                              setSpecName(spec.name ?? "");
                              setSpecActive(Boolean(spec.active));
                              setSpecImage(null);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="med-btn-secondary border-rose-300/35 px-3 py-1.5 text-xs text-rose-100"
                            onClick={() => {
                              if (window.confirm("Delete this specialization?")) {
                                deleteSpecializationMutation.mutate(spec.id);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                    {!specializationsQuery.data?.length && (
                      <p className="col-span-full rounded-xl border border-cyan-300/20 bg-white/5 p-4 text-center text-sm text-slate-300">
                        No specializations found.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="glass-panel rounded-3xl p-4">
                <h2 className="mb-3 text-lg font-semibold">
                  {editingSpecId ? "Edit Specialization" : "Add Specialization"}
                </h2>
                <div className="space-y-3">
                  <input
                    className="med-input"
                    placeholder="Specialization name"
                    value={specName}
                    onChange={(e) => setSpecName(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={specActive} onChange={(e) => setSpecActive(e.target.checked)} />
                    Active specialization
                  </label>
                  <input type="file" accept="image/*" onChange={(e) => setSpecImage(e.target.files?.[0] || null)} />
                  {editingSpecId && (
                    <button
                      className="med-btn-secondary w-full"
                      onClick={() => {
                        setEditingSpecId(null);
                        setSpecName("");
                        setSpecActive(true);
                        setSpecImage(null);
                      }}
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    className="med-btn-primary w-full"
                    disabled={!canAccessSpecializations || specializationMutation.isPending || !specName.trim()}
                    onClick={() => specializationMutation.mutate()}
                  >
                    {specializationMutation.isPending
                      ? "Saving..."
                      : editingSpecId
                        ? "Update Specialization"
                        : "Save"}
                  </button>
                  {!canAccessSpecializations && (
                    <p className="text-xs text-amber-200">Only super admin can add or delete specializations.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {activePage === PAGE_HOSPITAL && (
          <section className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr,420px]">
              <div className="glass-panel rounded-3xl p-4">
                <div className="mb-3 flex items-center gap-2">
                  <input
                    className="med-input"
                    placeholder="Search doctor..."
                    value={doctorSearch}
                    onChange={(e) => setDoctorSearch(e.target.value)}
                  />
                  <button
                    className="med-btn-secondary gap-2 px-3 py-2 text-xs"
                    onClick={() => setHospitalDoctorsViewMode((prev) => (prev === "table" ? "cards" : "table"))}
                    title={hospitalDoctorsViewMode === "table" ? "Switch to cards" : "Switch to table"}
                  >
                    {hospitalDoctorsViewMode === "table" ? <LayoutGrid size={14} /> : <Table2 size={14} />}
                    {hospitalDoctorsViewMode === "table" ? "Cards" : "Table"}
                  </button>
                </div>
                {doctorsQuery.isLoading ? (
                  <SkeletonTable />
                ) : hospitalDoctorsViewMode === "table" ? (
                  <DataTable columns={doctorColumns} data={doctorsQuery.data ?? []} emptyText="No doctors found." />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(doctorsQuery.data ?? []).map((doctor) => (
                      <article key={doctor.doctor_id} className="rounded-2xl border border-cyan-300/20 bg-white/5 p-3">
                        <div className="mb-3 overflow-hidden rounded-xl border border-cyan-300/30 bg-slate-900/50">
                          {doctor.render_profile_image_url ? (
                            <img
                              src={doctor.render_profile_image_url}
                              alt={doctor.doctor_name}
                              className="h-48 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-48 items-center justify-center text-xs text-slate-400">No image</div>
                          )}
                        </div>
                        <p className="text-base font-semibold text-cyan-100">{doctor.doctor_name}</p>
                        <p className="text-xs text-slate-300">{doctor.doctor_email}</p>
                        <p className="mt-2 text-xs text-slate-200">Specialization: {doctor.specialization_name || "N/A"}</p>
                        <p className="text-xs text-slate-200">MOH License: {doctor.moh_license_number || "N/A"}</p>
                        <p className="mt-1 text-xs">
                          <span
                            className={cx(
                              "rounded-full px-2 py-1",
                              doctor.verified ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300",
                            )}
                          >
                            {doctor.verified ? "Verified" : "Not verified"}
                          </span>
                        </p>
                        {context.role !== ROLE_SUPER && (
                          <button
                            className="med-btn-secondary mt-3 px-3 py-1.5 text-xs"
                            disabled={removeDoctorMutation.isPending}
                            onClick={() => {
                              if (window.confirm("Remove this doctor from your hospital?")) {
                                removeDoctorMutation.mutate(doctor.doctor_id);
                              }
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </article>
                    ))}
                    {!doctorsQuery.data?.length && (
                      <p className="col-span-full rounded-xl border border-cyan-300/20 bg-white/5 p-4 text-center text-sm text-slate-300">
                        No doctors found.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="glass-panel rounded-3xl p-4">
                {context.role === ROLE_SUPER ? (
                  <>
                    <h2 className="mb-3 text-lg font-semibold">
                      {editingHospitalId ? "Edit Hospital" : "Add Hospital"}
                    </h2>
                    <div className="space-y-2">
                      <input
                        className="med-input"
                        placeholder="Hospital name"
                        value={hospitalName}
                        onChange={(e) => setHospitalName(e.target.value)}
                      />
                      <input
                        className="med-input"
                        placeholder="Address"
                        value={hospitalAddress}
                        onChange={(e) => setHospitalAddress(e.target.value)}
                      />
                      <input
                        className="med-input"
                        placeholder="Phone"
                        value={hospitalPhone}
                        onChange={(e) => setHospitalPhone(e.target.value)}
                      />
                      {editingHospitalId && (
                        <button
                          className="med-btn-secondary w-full"
                          onClick={() => {
                            setEditingHospitalId(null);
                            setHospitalName("");
                            setHospitalAddress("");
                            setHospitalPhone("");
                          }}
                        >
                          Cancel Edit
                        </button>
                      )}
                      <button
                        className="med-btn-primary w-full"
                        disabled={upsertHospitalMutation.isPending || !hospitalName.trim()}
                        onClick={() => upsertHospitalMutation.mutate()}
                      >
                        {upsertHospitalMutation.isPending
                          ? "Saving..."
                          : editingHospitalId
                            ? "Update Hospital"
                            : "Create Hospital"}
                      </button>
                      <div className="mt-3 rounded-xl border border-cyan-300/20 bg-white/5 px-3 py-2 text-sm">
                        <p className="text-cyan-100">
                          Total hospitals: {toNumber(dashboardStats?.total_hospitals).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-300">
                          Full CRUD is available below with cards/table view.
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="mb-3 text-lg font-semibold">Assign Doctor to Hospital</h2>
                    <div className="space-y-3">
                      <input
                        className="med-input"
                        placeholder="Doctor email"
                        value={doctorEmail}
                        onChange={(e) => setDoctorEmail(e.target.value)}
                      />
                      <input
                        className="med-input"
                        placeholder="MOH license number"
                        value={doctorLicense}
                        onChange={(e) => setDoctorLicense(e.target.value)}
                      />
                      <select
                        className="med-input"
                        value={doctorSpecializationId}
                        onChange={(e) => setDoctorSpecializationId(e.target.value)}
                      >
                        <option value="">Select specialization</option>
                        {(specializationsQuery.data ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={doctorVerified} onChange={(e) => setDoctorVerified(e.target.checked)} />
                        Verified
                      </label>
                      <input type="file" accept="image/*" onChange={(e) => setDoctorImage(e.target.files?.[0] || null)} />
                      <button
                        className="med-btn-primary w-full"
                        disabled={assignDoctorMutation.isPending || !doctorEmail.trim()}
                        onClick={() => assignDoctorMutation.mutate()}
                      >
                        {assignDoctorMutation.isPending ? "Assigning..." : "Assign Doctor"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {context.role === ROLE_SUPER && (
              <div className="glass-panel rounded-3xl p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Hospitals</h2>
                  <button
                    className="med-btn-secondary gap-2 px-3 py-2 text-xs"
                    onClick={() => setHospitalsManageViewMode((prev) => (prev === "table" ? "cards" : "table"))}
                    title={hospitalsManageViewMode === "table" ? "Switch to cards" : "Switch to table"}
                  >
                    {hospitalsManageViewMode === "table" ? <LayoutGrid size={14} /> : <Table2 size={14} />}
                    {hospitalsManageViewMode === "table" ? "Cards" : "Table"}
                  </button>
                </div>
                <input
                  className="med-input mb-3"
                  placeholder="Search hospital by name, address, or phone..."
                  value={hospitalSearch}
                  onChange={(e) => setHospitalSearch(e.target.value)}
                />
                {hospitalsManageQuery.isLoading ? (
                  <SkeletonTable />
                ) : hospitalsManageViewMode === "table" ? (
                  <DataTable
                    columns={hospitalManageColumns}
                    data={hospitalsManageQuery.data ?? []}
                    emptyText="No hospitals found."
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {(hospitalsManageQuery.data ?? []).map((hospital) => (
                      <article key={hospital.hospital_id} className="rounded-2xl border border-cyan-300/20 bg-white/5 p-3">
                        <p className="text-base font-semibold text-cyan-100">{hospital.hospital_name}</p>
                        <p className="mt-2 text-xs text-slate-200">
                          Address: {hospital.hospital_address || "N/A"}
                        </p>
                        <p className="text-xs text-slate-200">Phone: {hospital.hospital_phone || "N/A"}</p>
                        <p className="mt-2 text-xs text-slate-300">
                          Doctors: {toNumber(hospital.doctor_count).toLocaleString()} • Admins:{" "}
                          {toNumber(hospital.hospital_admin_count).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Created: {hospital.created_at ? new Date(hospital.created_at).toLocaleDateString() : "-"}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            className="med-btn-secondary px-3 py-1.5 text-xs"
                            onClick={() => {
                              setEditingHospitalId(hospital.hospital_id);
                              setHospitalName(hospital.hospital_name ?? "");
                              setHospitalAddress(hospital.hospital_address ?? "");
                              setHospitalPhone(hospital.hospital_phone ?? "");
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="med-btn-secondary border-rose-300/35 px-3 py-1.5 text-xs text-rose-100"
                            onClick={() => {
                              if (window.confirm("Delete this hospital?")) {
                                deleteHospitalMutation.mutate(hospital.hospital_id);
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                    {!hospitalsManageQuery.data?.length && (
                      <p className="col-span-full rounded-xl border border-cyan-300/20 bg-white/5 p-4 text-center text-sm text-slate-300">
                        No hospitals found.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {context.role === ROLE_SUPER && (
              <div className="glass-panel rounded-3xl p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">All Signup Doctors</h2>
                  <button
                    className="med-btn-secondary gap-2 px-3 py-2 text-xs"
                    onClick={() => setSignupDoctorsViewMode((prev) => (prev === "table" ? "cards" : "table"))}
                    title={signupDoctorsViewMode === "table" ? "Switch to cards" : "Switch to table"}
                  >
                    {signupDoctorsViewMode === "table" ? <LayoutGrid size={14} /> : <Table2 size={14} />}
                    {signupDoctorsViewMode === "table" ? "Cards" : "Table"}
                  </button>
                </div>
                <p className="mb-3 text-sm text-slate-300">
                  View all registered doctor accounts and assign each one to one or more hospitals.
                </p>
                <input
                  className="med-input mb-3"
                  placeholder="Search signup doctor by name, email, specialization, or hospital..."
                  value={signupDoctorSearch}
                  onChange={(e) => setSignupDoctorSearch(e.target.value)}
                />
                {signupDoctorsQuery.isLoading ? (
                  <SkeletonTable />
                ) : signupDoctorsViewMode === "table" ? (
                  <DataTable
                    columns={signupDoctorColumns}
                    data={signupDoctorsQuery.data ?? []}
                    emptyText="No signup doctors found."
                  />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {(signupDoctorsQuery.data ?? []).map((doctor) => {
                      const selectedHospitalId = selectedHospitalByDoctor[doctor.doctor_id] ?? "";
                      const isAssigning = assignDoctorToHospitalMutation.isPending;
                      const isUpdatingVerified =
                        toggleSignupDoctorVerifiedMutation.isPending &&
                        toggleSignupDoctorVerifiedMutation.variables?.doctorId === doctor.doctor_id;
                      return (
                        <article key={doctor.doctor_id} className="rounded-2xl border border-cyan-300/20 bg-white/5 p-3">
                          <div className="mb-3 overflow-hidden rounded-xl border border-cyan-300/30 bg-slate-900/50">
                            {doctor.render_profile_image_url ? (
                              <img
                                src={doctor.render_profile_image_url}
                                alt={doctor.doctor_name}
                                className="h-52 w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-52 items-center justify-center text-xs text-slate-400">No image</div>
                            )}
                          </div>
                          <p className="text-base font-semibold text-cyan-100">{doctor.doctor_name}</p>
                          <p className="text-xs text-slate-300">{doctor.doctor_email}</p>
                          <p className="mt-2 text-xs text-slate-200">Specialization: {doctor.specialization_name || "N/A"}</p>
                          <p className="text-xs text-slate-200">MOH License: {doctor.moh_license_number || "N/A"}</p>
                          <p className="text-xs text-slate-200">
                            Assigned hospitals: {doctor.assigned_hospitals || "None"} ({toNumber(doctor.assigned_hospitals_count)} linked)
                          </p>
                          <div className="mt-3">
                            <button
                              className={cx(
                                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition",
                                doctor.verified
                                  ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-200"
                                  : "border-amber-300/40 bg-amber-500/20 text-amber-200",
                                isUpdatingVerified && "cursor-not-allowed opacity-70",
                              )}
                              disabled={isUpdatingVerified}
                              onClick={() =>
                                toggleSignupDoctorVerifiedMutation.mutate({
                                  doctorId: doctor.doctor_id,
                                  verified: !Boolean(doctor.verified),
                                })
                              }
                            >
                              {isUpdatingVerified ? "Updating..." : doctor.verified ? "Verified" : "Not verified"}
                            </button>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <select
                              className="med-input py-2 text-xs"
                              value={selectedHospitalId}
                              onChange={(e) =>
                                setSelectedHospitalByDoctor((prev) => ({
                                  ...prev,
                                  [doctor.doctor_id]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Select hospital</option>
                              {(hospitalsQuery.data ?? []).map((hospital) => (
                                <option key={hospital.hospital_id} value={hospital.hospital_id}>
                                  {hospital.hospital_name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="med-btn-primary px-3 py-2 text-xs"
                              disabled={isAssigning || !selectedHospitalId}
                              onClick={() =>
                                assignDoctorToHospitalMutation.mutate({
                                  doctorId: doctor.doctor_id,
                                  hospitalId: selectedHospitalId,
                                })
                              }
                            >
                              {isAssigning ? "Assigning..." : "Assign"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {!signupDoctorsQuery.data?.length && (
                      <p className="col-span-full rounded-xl border border-cyan-300/20 bg-white/5 p-4 text-center text-sm text-slate-300">
                        No signup doctors found.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

export function App() {
  const [session, setSession] = useState(null);
  const [ui, setUi] = useState(loadUiState);
  const [bootstrapped, setBootstrapped] = useState(false);

  const sessionContextQuery = useQuery({
    queryKey: ["session-context", session?.user?.id],
    queryFn: getSessionContext,
    enabled: Boolean(session?.user?.id),
  });

  const publicTokenMatch = useMemo(() => {
    const match = window.location.pathname.match(/^\/public\/patient\/([^/]+)$/);
    if (!match || !match[1]) return null;
    return decodeURIComponent(match[1]);
  }, []);

  if (publicTokenMatch) {
    return <PublicPatientProfilePageShell token={publicTokenMatch} />;
  }

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setBootstrapped(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "SIGNED_OUT") {
        setSession(null);
        return;
      }
      if (nextSession) {
        setSession(nextSession);
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => setSession(null),
  });

  if (!bootstrapped) {
    return (
      <div className="mx-auto mt-20 max-w-4xl p-4">
        <div className="glass-panel rounded-3xl p-6">
          <SkeletonTable />
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLoggedIn={setSession} />;
  }

  if (sessionContextQuery.isLoading) {
    return (
      <div className="mx-auto mt-20 max-w-4xl p-4">
        <div className="glass-panel rounded-3xl p-6">
          <SkeletonTable />
        </div>
      </div>
    );
  }

  if (sessionContextQuery.isError) {
    return (
      <div className="mx-auto mt-20 max-w-xl rounded-3xl glass-panel p-6">
        <p className="text-rose-200">{sessionContextQuery.error.message}</p>
        <button className="med-btn-secondary mt-3" onClick={() => logoutMutation.mutate()}>
          Back to login
        </button>
      </div>
    );
  }

  return (
    <AppShell
      session={session}
      context={sessionContextQuery.data}
      activePage={ui.page}
      setActivePage={(page) => setUi((prev) => ({ ...prev, page }))}
      collapsed={ui.collapsed}
      setCollapsed={(next) =>
        setUi((prev) => ({ ...prev, collapsed: typeof next === "function" ? next(prev.collapsed) : next }))
      }
      onLogout={() => logoutMutation.mutate()}
    />
  );
}
