import React, { useState, useEffect, useId } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  BookOpen,
  GitBranch,
  Layers,
  FileBarChart,
  Plus,
  Search,
  Printer,
  Download,
  LogOut,
  Paperclip,
  Trash2,
  ChevronLeft,
  Menu,
  CheckCircle2,
  AlertCircle,
  Wallet,
  TrendingUp,
  TrendingDown,
  Scale,
  X,
  Save,
  Upload,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  types,
  money,
  cents,
  validateEntry,
  reportRows,
  ledger,
  seed,
  descendants,
  postingAccounts,
} from "./accounting";
import {
  cloud,
  client,
  readData,
  saveData,
  upload,
  openAttachment,
} from "./store";
import JournalFilters, { emptyJournalFilter } from "./JournalFilters";
import JournalList from "./JournalList";
import AccountChip from "./AccountChip";
import JournalDetail from "./JournalDetail";
import {
  allJournals,
  filterJournals,
  saveJournal,
  changeJournalState,
  resetJournals,
  validateDraft,
} from "./journals";
import { exportJournals } from "./journalExport";
import BrandLogo from "./BrandLogo";
import DocumentsField from "./DocumentsField";
import { entryDocuments, parseDocumentLinks } from "./documents";
import { logoBytes } from "./brand";
import { exportReport } from "./exports";
import { REMEMBER_KEY } from "./authStorage";
import ImportPanel from "./ImportPanel";
import { zipSync, strToU8 } from "fflate";
import "@fontsource/cairo/400.css";
import "@fontsource/cairo/600.css";
import "@fontsource/cairo/700.css";
import "@fontsource/cairo/800.css";
import "./style.css";
const today = () => new Date().toLocaleDateString("en-CA");
const blankLine = () => ({
  accountId: "",
  centerId: "",
  description: "",
  debit: "",
  credit: "",
});
const pages = [
  ["dashboard", "نظرة عامة", LayoutDashboard],
  ["entries", "القيود اليومية", BookOpen],
  ["accounts", "شجرة الحسابات", GitBranch],
  ["centers", "مراكز التكلفة", Layers],
  ["ledger", "حساب الأستاذ", FileBarChart],
  ["trial", "ميزان المراجعة", Scale],
  ["income", "قائمة الدخل", TrendingUp],
  ["audit", "سجل التعديلات", BookOpen],
];
function App() {
  const [session, setSession] = useState(null),
    [loading, setLoading] = useState(true),
    [data, setData] = useState(seed()),
    [version, setVersion] = useState(0),
    [page, setPage] = useState("dashboard"),
    [journalId, setJournalId] = useState(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState({
      from: "",
      to: today(),
      centerId: "",
      accountId: "",
      search: "",
    }),
    [side, setSide] = useState(false),
    [audits, setAudits] = useState([]),
    [collapsed, setCollapsed] = useState(new Set());
  useEffect(() => {
    if (!cloud) {
      setLoading(false);
      return;
    }
    client.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  async function refresh() {
    try {
      const r = await readData();
      setData(r.data);
      setVersion(r.version);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (session) refresh();
  }, [session]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  async function persist(next) {
    if (!cloud)
      next = {
        ...next,
        audit: [
          ...(data.audit || []),
          {
            at: new Date().toISOString(),
            actor: "ghaith",
            description: "تحديث البيانات المحاسبية",
          },
        ],
      };
    const v = await saveData(next, version);
    setData(next);
    setVersion(v);
    setToast("تم الحفظ بنجاح");
  }
  async function action(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
      if (cloud) await refresh();
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (page === "audit") {
      if (!cloud) setAudits(data.audit || []);
      else
        client
          .from("accounting_audit")
          .select("id,created_at,description")
          .order("id", { ascending: false })
          .limit(200)
          .then(({ data, error }) =>
            error ? setError(error.message) : setAudits(data),
          );
    }
  }, [page, data]);
  async function backup() {
    await action(async () => {
      const fresh = await readData();
      const files = {
        "accounting.json": strToU8(
          JSON.stringify(
            {
              format: "ghaith-backup-v1",
              exportedAt: new Date().toISOString(),
              ...fresh,
            },
            null,
            2,
          ),
        ),
      };
      for (const e of fresh.data.entries)
        for (const a of e.attachments || []) {
          if (!cloud) continue;
          const { data: file, error } = await client.storage
            .from("attachments")
            .download(a.path);
          if (error) throw error;
          files["attachments/" + a.path] = new Uint8Array(
            await file.arrayBuffer(),
          );
        }
      files["ghaith-logo.png"] = await logoBytes();
      const blob = new Blob([zipSync(files)]);
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = u;
      a.download = "ghaith-backup-" + today() + ".zip";
      a.click();
      URL.revokeObjectURL(u);
      setToast("تم تنزيل البيانات والمرفقات في نسخة احتياطية");
    });
  }
  const accountRows = [];
  function walkAccounts(parentId = "", depth = 0) {
    data.accounts
      .filter((a) => (a.parentId || "") === parentId)
      .sort((a, b) => a.code.localeCompare(b.code))
      .forEach((a) => {
        accountRows.push({ ...a, depth });
        if (!collapsed.has(a.id)) walkAccounts(a.id, depth + 1);
      });
  }
  walkAccounts();
  const name = (id) => data.accounts.find((a) => a.id === id)?.name || "—";
  const center = (id) => data.centers.find((a) => a.id === id)?.name || "—";
  function nav(id) {
    setPage(id);
    setSide(false);
    setFilter(
      id === "entries"
        ? { ...emptyJournalFilter }
        : { from: "", to: today(), centerId: "", accountId: "", search: "" },
    );
  }
  function openAccountLedger(accountId) {
    if (!data.accounts.some((a) => a.id === accountId)) return;
    setPage("ledger");
    setSide(false);
    setError("");
    setFilter({ from: "", to: "", accountId, centerId: "", search: "" });
  }
  function openJournal(e) {
    setJournalId(e.id);
    setPage("journal");
    setError("");
  }
  function editJournal(e) {
    action(async () => {
      let current = e;
      if (e.status === "posted") {
        if (
          !confirm(
            "سيُحوّل القيد إلى مسودة ويُستبعد مؤقتًا من الحسابات حتى ترحيله مرة أخرى. متابعة؟",
          )
        )
          return;
        const next = changeJournalState(data, e.id, "draft");
        await persist(next);
        current = allJournals(next).find((x) => x.id === e.id);
      }
      setModal({
        kind: "entry",
        value: {
          ...current,
          lines: current.lines.map((l) => ({
            ...l,
            debit: l.debit ? (l.debit / 100).toFixed(2) : "",
            credit: l.credit ? (l.credit / 100).toFixed(2) : "",
          })),
        },
      });
    });
  }
  async function cleanupJournalFiles(next, files) {
    if (!cloud) return;
    const used = new Set(
      allJournals(next).flatMap((e) =>
        (e.attachments || []).map((a) => a.path),
      ),
    );
    const orphan = [...new Set(files.map((a) => a.path))].filter(
      (p) => !used.has(p),
    );
    for (let i = 0; i < orphan.length; i += 100) {
      const { error } = await client.storage
        .from("attachments")
        .remove(orphan.slice(i, i + 100));
      if (error)
        throw Error(
          "تم حذف القيود، لكن تعذر تنظيف بعض المرفقات: " + error.message,
        );
    }
  }
  function journalAction(e, operation) {
    action(async () => {
      if (
        operation === "delete" &&
        !confirm(
          "حذف القيد " +
            (e.number ? "#" + e.number : "المسودة") +
            "؟ سيُحذف نهائيًا من القيود والحسابات مع الاحتفاظ بسجل العملية فقط.",
        )
      )
        return;
      if (
        operation === "draft" &&
        !confirm(
          "تحويل القيد إلى مسودة سيخرجه من الحسابات والتقارير حتى ترحيله مجددًا. متابعة؟",
        )
      )
        return;
      const next = changeJournalState(data, e.id, operation);
      await persist(next);
      if (operation === "delete") {
        nav("entries");
        await cleanupJournalFiles(next, e.attachments || []);
      }
      setToast(
        {
          post: "تم ترحيل القيد وإضافته للحسابات",
          draft: "تم تحويل القيد إلى مسودة واستبعاده من الحسابات",
          delete: "تم حذف القيد واستبعاده من الحسابات",
          restore: "تمت استعادة القيد",
        }[operation],
      );
    });
  }
  function downloadJournals(entries, title = "اليومية") {
    return action(() =>
      exportJournals(data, entries, {
        title,
        filename: "ghaith-journals-" + today() + ".xlsx",
      }),
    );
  }
  function newEntry() {
    setModal({
      kind: "entry",
      value: {
        id: crypto.randomUUID(),
        date: today(),
        description: "",
        attachments: [],
        lines: [blankLine(), blankLine()],
      },
    });
  }
  const rows = reportRows(data, filter);
  const visibleEntries = filterJournals(data, filter);
  const allEntries = allJournals(data);
  const currentJournal = allEntries.find((e) => e.id === journalId);
  const trialRows = rows.map((a) => {
    const ids = descendants(data.accounts, a.id);
    const items = rows.filter((r) => ids.has(r.id));
    return {
      ...a,
      opening: items.reduce((s, r) => s + r.opening, 0),
      debit: items.reduce((s, r) => s + r.debit, 0),
      credit: items.reduce((s, r) => s + r.credit, 0),
      closing: items.reduce((s, r) => s + r.closing, 0),
    };
  });
  const totals = rows.reduce(
    (t, r) => ({ debit: t.debit + r.debit, credit: t.credit + r.credit }),
    { debit: 0, credit: 0 },
  );
  async function exportRows() {
    if (page === "entries") return downloadJournals(visibleEntries);
    await action(async () => {
      const title = pages.find((p) => p[0] === page)?.[1] || "تقرير";
      const subtitle = `الفترة: ${!filter.from && !filter.to ? "جميع الفترات" : `${filter.from || "بداية التسجيل"} — ${filter.to || "بدون تاريخ نهاية"}`} · ${filter.accountId ? name(filter.accountId) : "جميع الحسابات"} · ${filter.centerId ? center(filter.centerId) : "جميع مراكز التكلفة"}`;
      let headers, values;
      if (page === "entries") {
        headers = [
          "رقم القيد",
          "التاريخ",
          "البيان",
          "مدين (SAR)",
          "دائن (SAR)",
          "روابط المستندات",
        ];
        values = visibleEntries.map((e) => [
          e.number,
          e.date,
          e.description,
          e.lines.reduce((s, l) => s + l.debit, 0) / 100,
          e.lines.reduce((s, l) => s + l.credit, 0) / 100,
          entryDocuments(e, data.entryDocuments?.[e.id])
            .map((d) => d.url)
            .join("\n"),
        ]);
      } else if (page === "ledger") {
        if (!filter.accountId) throw Error("اختر حسابًا قبل التصدير");
        headers = [
          "التاريخ",
          "رقم القيد",
          "البيان",
          "مدين (SAR)",
          "دائن (SAR)",
          "الرصيد (SAR)",
        ];
        const opening = rows.reduce((s, r) => s + r.opening, 0);
        values = [
          ["", "", "رصيد أول المدة", 0, 0, opening / 100],
          ...ledger(data, filter).map((r) => [
            r.date,
            r.number,
            r.description,
            r.debit / 100,
            r.credit / 100,
            r.balance / 100,
          ]),
          [
            "",
            "",
            "الإجمالي",
            totals.debit / 100,
            totals.credit / 100,
            rows.reduce((s, r) => s + r.closing, 0) / 100,
          ],
        ];
      } else if (page === "income") {
        headers = ["كود الحساب", "الحساب / البيان", "القيمة (SAR)"];
        values = [];
        for (const type of ["revenue", "expense"]) {
          values.push(["", types[type], ""]);
          for (const r of rows.filter(
            (r) =>
              r.type === type &&
              !data.accounts.some((a) => a.parentId === r.id),
          ))
            values.push([
              r.code,
              r.name,
              (type === "revenue" ? r.credit - r.debit : r.debit - r.credit) /
                100,
            ]);
          values.push([
            "",
            "إجمالي " + types[type],
            rows
              .filter((r) => r.type === type)
              .reduce(
                (s, r) =>
                  s +
                  (type === "revenue"
                    ? r.credit - r.debit
                    : r.debit - r.credit),
                0,
              ) / 100,
          ]);
        }
        values.push([
          "",
          "صافي الربح / الخسارة",
          rows.reduce(
            (s, r) =>
              s +
              (["revenue", "expense"].includes(r.type)
                ? r.credit - r.debit
                : 0),
            0,
          ) / 100,
        ]);
      } else {
        headers = [
          "الكود",
          "الحساب",
          "رصيد أول المدة — مدين",
          "رصيد أول المدة — دائن",
          "حركة الفترة — مدين",
          "حركة الفترة — دائن",
          "رصيد آخر المدة — مدين",
          "رصيد آخر المدة — دائن",
        ];
        values = trialRows.map((r) => [
          r.code,
          r.name,
          Math.max(r.opening, 0) / 100,
          Math.max(-r.opening, 0) / 100,
          r.debit / 100,
          r.credit / 100,
          Math.max(r.closing, 0) / 100,
          Math.max(-r.closing, 0) / 100,
        ]);
        values.push([
          "",
          "الإجمالي",
          ...Array.from(
            { length: 6 },
            (_, i) =>
              rows.reduce(
                (s, r) =>
                  s +
                  [
                    Math.max(r.opening, 0),
                    Math.max(-r.opening, 0),
                    r.debit,
                    r.credit,
                    Math.max(r.closing, 0),
                    Math.max(-r.closing, 0),
                  ][i],
                0,
              ) / 100,
          ),
        ]);
      }
      await exportReport({
        title,
        subtitle,
        headers,
        rows: values,
        filename: `ghaith-${page}-${today()}.xlsx`,
      });
    });
  }
  if (loading) return <div className="loading">جاري التحميل…</div>;
  if (!session)
    return (
      <Login
        onDemo={() => setSession({ demo: true })}
        onError={setError}
        error={error}
      />
    );
  return (
    <div
      className={
        "app " +
        (["entries", "journal"].includes(page) ? "journal-workspace" : "")
      }
    >
      <aside className={side ? "open" : ""}>
        <a className="brand" onClick={() => nav("dashboard")}>
          <BrandLogo className="sidebar-logo" />
        </a>
        <p className="nav-label">القائمة الرئيسية</p>
        <nav>
          {pages.map(([id, label, Icon], i) => (
            <React.Fragment key={id}>
              {i === 4 && <p className="nav-label">التقارير المالية</p>}
              <button
                className={page === id ? "active" : ""}
                onClick={() => nav(id)}
              >
                <Icon size={19} />
                {label}
                {page === id && <ChevronLeft size={15} />}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="backup-button" disabled={busy} onClick={backup}>
            <Download size={16} />
            تنزيل نسخة احتياطية
          </button>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            <button className="icon mobile" onClick={() => setSide(!side)}>
              <Menu />
            </button>
            غيث <ChevronLeft size={14} />
            <strong>
              {page === "journal"
                ? "قيد يومية"
                : pages.find((p) => p[0] === page)?.[1]}
            </strong>
          </div>
          <div className="profile">
            {!cloud && <span className="mode demo">وضع تجريبي محلي</span>}
            <span className="avatar">G</span>
            <span>
              ghaith<small>محاسب</small>
            </span>
            <button
              className="icon"
              title="تسجيل الخروج"
              onClick={() =>
                action(async () => {
                  if (cloud) await client.auth.signOut({ scope: "local" });
                  setSession(null);
                })
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          {!["ledger", "trial", "income", "journal"].includes(page) && (
            <div className="print-brand">
              <BrandLogo />
            </div>
          )}
          {!cloud && (
            <div className="demo-banner">
              <AlertCircle size={16} /> نسخة تجريبية: البيانات محفوظة في هذا
              المتصفح فقط. المشاركة والمرفقات تتطلب ربط Supabase.
            </div>
          )}
          {cloud && version > 0 && data.journalWorkflowVersion !== 2 && (
            <div className="error">
              تحديث قاعدة البيانات مطلوب لتفعيل المسودات والحذف وتصفير القيود
              القديمة.{" "}
              <a
                href="https://github.com/mostafaelramady05/Ghaith/blob/main/supabase/migrations/002_journal_workflow.sql"
                target="_blank"
                rel="noopener noreferrer"
              >
                ملف التحديث
              </a>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {toast && (
            <div className="toast" role="status">
              <CheckCircle2 size={18} />
              {toast}
            </div>
          )}
          {page !== "journal" && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  غيث /{" "}
                  {page === "dashboard"
                    ? "لوحة التحكم"
                    : ["ledger", "trial", "income"].includes(page)
                      ? "التقارير المالية"
                      : "الحسابات العامة"}
                </div>
                <h1>
                  {page === "journal"
                    ? "قيد يومية"
                    : pages.find((p) => p[0] === page)?.[1]}
                </h1>
                <p>
                  {
                    {
                      dashboard: "كل ما تحتاجه لمتابعة حسابات نشاطك التعليمي.",
                      entries:
                        "إدارة وتنظيم جميع الحركات المحاسبية في مكان واحد.",
                      accounts: "نظّم حساباتك المالية في شجرة واضحة ومرنة.",
                      centers: "تابع إيرادات ومصروفات كل دورة أو مجموعة.",
                      ledger: "تفاصيل حركة الحساب والرصيد خلال الفترة المحددة.",
                      trial: "مراجعة أرصدة الحسابات وحركاتها المدينة والدائنة.",
                      income: "متابعة الإيرادات والمصروفات وصافي نتائج النشاط.",
                      audit:
                        "سجل وقت التغييرات على البيانات باستخدام الحساب المشترك.",
                    }[page]
                  }
                </p>
              </div>
              <div
                className={
                  "actions " +
                  (page === "entries" ? "journal-generic-actions" : "")
                }
              >
                {["dashboard", "entries"].includes(page) ? (
                  <button className="primary" onClick={newEntry}>
                    <Plus size={18} />
                    إضافة قيد يومي
                  </button>
                ) : ["accounts", "centers"].includes(page) ? (
                  <button
                    className="primary"
                    onClick={() =>
                      setModal({
                        kind: page === "accounts" ? "account" : "center",
                        value: {
                          id: crypto.randomUUID(),
                          code: "",
                          name: "",
                          type: "asset",
                          parentId: "",
                        },
                      })
                    }
                  >
                    <Plus size={18} />
                    إضافة {page === "accounts" ? "حساب" : "مركز تكلفة"}
                  </button>
                ) : (
                  <>
                    <button onClick={() => window.print()}>
                      <Printer size={16} />
                      طباعة
                    </button>
                    <button onClick={exportRows}>
                      <Download size={16} />
                      تصدير Excel
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          {page === "journal" && currentJournal ? (
            <JournalDetail
              entry={currentJournal}
              data={data}
              onBack={() => nav("entries")}
              onEdit={editJournal}
              onState={journalAction}
              onAccountOpen={openAccountLedger}
              onExport={(e) => downloadJournals([e], "قيد يومية")}
              busy={busy}
            />
          ) : page === "dashboard" ? (
            <>
              <div className="stats">
                {[
                  [
                    "إجمالي الإيرادات",
                    rows
                      .filter((r) => r.type === "revenue")
                      .reduce((s, r) => s + r.credit - r.debit, 0),
                    TrendingUp,
                    "green",
                  ],
                  [
                    "إجمالي المصروفات",
                    rows
                      .filter((r) => r.type === "expense")
                      .reduce((s, r) => s + r.debit - r.credit, 0),
                    TrendingDown,
                    "orange",
                  ],
                  [
                    "صافي الدخل",
                    rows.reduce(
                      (s, r) =>
                        s +
                        (r.type === "revenue"
                          ? r.credit - r.debit
                          : r.type === "expense"
                            ? r.credit - r.debit
                            : 0),
                      0,
                    ),
                    Wallet,
                    "blue",
                  ],
                  [
                    "عدد القيود اليومية",
                    allEntries.filter((e) => e.status === "posted").length,
                    BookOpen,
                    "purple",
                  ],
                ].map(([label, value, Icon, color], i) => (
                  <div className="stat" key={label}>
                    <div className="stat-top">
                      {label}
                      <span className={"stat-icon " + color}>
                        <Icon size={20} />
                      </span>
                    </div>
                    <strong>
                      {i === 3 ? value : money(value)}{" "}
                      {i !== 3 && <small>ر.س</small>}
                    </strong>
                    <span className="stat-caption">
                      {i === 3 ? "قيود مسجلة في النظام" : "حتى " + today()}
                    </span>
                  </div>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="card">
                  <div className="card-title">
                    <h2>أحدث القيود اليومية</h2>
                    <button className="link" onClick={() => nav("entries")}>
                      عرض الكل <ChevronLeft size={14} />
                    </button>
                  </div>
                  <EntryTable
                    documents={data.entryDocuments}
                    accounts={data.accounts}
                    onAccountOpen={openAccountLedger}
                    entries={visibleEntries.slice(0, 5)}
                    open={openJournal}
                  />
                </section>
                <section className="card quick">
                  <div className="card-title">
                    <h2>الوصول السريع</h2>
                  </div>
                  {[
                    [
                      "entry",
                      "إضافة قيد يومي",
                      "سجّل حركة مالية جديدة",
                      BookOpen,
                    ],
                    ["trial", "ميزان المراجعة", "راجع أرصدة حساباتك", Scale],
                    ["income", "قائمة الدخل", "تابع نتائج نشاطك", TrendingUp],
                  ].map(([id, title, sub, Icon]) => (
                    <button
                      key={id}
                      onClick={() => (id === "entry" ? newEntry() : nav(id))}
                    >
                      <span className="quick-icon">
                        <Icon size={20} />
                      </span>
                      <span>
                        {title}
                        <small>{sub}</small>
                      </span>
                      <ChevronLeft size={16} />
                    </button>
                  ))}
                </section>
              </div>
              <div className="info-card">
                <span className="info-icon">
                  <CheckCircle2 />
                </span>
                <div>
                  <h3>حسابات واضحة، قرارات أفضل</h3>
                  <p>
                    ابدأ بإضافة مراكز التكلفة الخاصة بدوراتك، ثم سجّل قيودك
                    اليومية لمتابعة النتائج.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              {["ledger", "trial", "income"].includes(page) && (
                <section className="card filters">
                  <div className="filter-title">
                    <Search size={17} />
                    تصفية النتائج
                    <button
                      className="link"
                      onClick={() =>
                        setFilter({
                          from: "",
                          to: today(),
                          centerId: "",
                          accountId: "",
                          search: "",
                        })
                      }
                    >
                      إعادة تعيين
                    </button>
                  </div>
                  <div className="filter-grid">
                    <Field label="من تاريخ">
                      <input
                        type="date"
                        value={filter.from}
                        onChange={(e) =>
                          setFilter({ ...filter, from: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="إلى تاريخ">
                      <input
                        type="date"
                        value={filter.to}
                        onChange={(e) =>
                          setFilter({ ...filter, to: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="مركز التكلفة">
                      <select
                        value={filter.centerId}
                        onChange={(e) =>
                          setFilter({ ...filter, centerId: e.target.value })
                        }
                      >
                        <option value="">جميع مراكز التكلفة</option>
                        {data.centers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {page === "entries" ? (
                      <Field label="بحث في القيود">
                        <input
                          placeholder="رقم القيد أو البيان…"
                          value={filter.search}
                          onChange={(e) =>
                            setFilter({ ...filter, search: e.target.value })
                          }
                        />
                      </Field>
                    ) : page !== "income" ? (
                      <Field label="الحساب">
                        <select
                          value={filter.accountId}
                          onChange={(e) =>
                            setFilter({ ...filter, accountId: e.target.value })
                          }
                        >
                          <option value="">
                            {page === "ledger"
                              ? "اختر الحساب"
                              : "جميع الحسابات"}
                          </option>
                          {data.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : (
                      <Field label="عرض الحسابات">
                        <span className="field-static">
                          الإيرادات والمصروفات
                        </span>
                      </Field>
                    )}
                  </div>
                </section>
              )}
              {page === "audit" && (
                <section className="card">
                  <div className="card-title">
                    <h2>سجل التعديلات</h2>
                    <span className="muted">
                      الحساب مشترك · عرض أحدث 200 عملية بالسحابة
                    </span>
                  </div>
                  {!audits.length ? (
                    <Empty
                      text="لا توجد تعديلات مسجلة"
                      sub="تظهر عمليات الحفظ هنا بعد تسجيلها."
                    />
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>التاريخ والوقت</th>
                          <th>المستخدم</th>
                          <th>العملية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...audits]
                          .sort((a, b) =>
                            (b.created_at || b.at).localeCompare(
                              a.created_at || a.at,
                            ),
                          )
                          .map((a, i) => (
                            <tr key={a.id || i}>
                              <td>
                                {new Date(a.created_at || a.at).toLocaleString(
                                  "ar-SA",
                                  { calendar: "gregory" },
                                )}
                              </td>
                              <td>ghaith (حساب مشترك)</td>
                              <td>{a.description}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </section>
              )}
              {page === "entries" && (
                <>
                  <div className="journal-toolbar">
                    <button className="primary" onClick={newEntry}>
                      <Plus size={17} />
                      أضف قيد
                    </button>
                    <button
                      onClick={() => setModal({ kind: "import", value: {} })}
                    >
                      <Upload size={16} />
                      استيراد
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        downloadJournals(
                          allEntries.filter((e) => e.status !== "deleted"),
                        )
                      }
                    >
                      <Download size={16} />
                      تحميل كل القيود — Excel
                    </button>
                    <button onClick={exportRows}>
                      <Download size={16} />
                      تصدير نتائج البحث
                    </button>
                    <button
                      disabled={
                        busy ||
                        !visibleEntries.some((e) => e.status === "draft")
                      }
                      onClick={() =>
                        action(async () => {
                          const drafts = visibleEntries.filter(
                            (e) => e.status === "draft",
                          );
                          if (
                            !confirm(
                              `ترحيل ${drafts.length} مسودة مطابقة للبحث وإضافتها للحسابات؟`,
                            )
                          )
                            return;
                          let next = data;
                          for (const e of drafts) {
                            try {
                              next = changeJournalState(next, e.id, "post");
                            } catch (err) {
                              throw Error(
                                `القيد ${e.description}: ${err.message}`,
                              );
                            }
                          }
                          await persist(next);
                          setToast("تم ترحيل المسودات بنجاح");
                        })
                      }
                    >
                      ترحيل المسودات المطابقة (
                      {
                        visibleEntries.filter((e) => e.status === "draft")
                          .length
                      }
                      )
                    </button>
                    <span className="draft-count">
                      المسودات (
                      {allEntries.filter((e) => e.status === "draft").length})
                    </span>
                  </div>
                  <JournalFilters
                    filter={filter}
                    setFilter={setFilter}
                    data={data}
                  />
                  <div className="journal-reset">
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          if (
                            !confirm(
                              "حذف جميع القيود والمسودات نهائيًا والبدء من الصفر؟ ستبقى شجرة الحسابات ومراكز التكلفة.",
                            )
                          )
                            return;
                          const next = resetJournals(data);
                          await persist(next);
                          await cleanupJournalFiles(
                            next,
                            allEntries.flatMap((e) => e.attachments || []),
                          );
                          setToast("تم حذف جميع القيود والمسودات");
                        })
                      }
                    >
                      حذف جميع القيود والبدء من جديد
                    </button>
                  </div>
                  <JournalList
                    key={JSON.stringify(filter)}
                    entries={visibleEntries}
                    data={data}
                    open={openJournal}
                    onAccountOpen={openAccountLedger}
                    onState={journalAction}
                    busy={busy}
                  />
                </>
              )}
              {page === "accounts" && (
                <section className="card">
                  <div className="card-title">
                    <h2>
                      دليل الحسابات{" "}
                      <span className="count">{data.accounts.length}</span>
                    </h2>
                    <span className="muted">اضغط على الحساب لتعديله</span>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>كود الحساب</th>
                          <th>اسم الحساب</th>
                          <th>التصنيف</th>
                          <th>الحساب الرئيسي</th>
                          <th>الطبيعة</th>
                          <th>الإجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountRows.map((a) => (
                          <tr
                            key={a.id}
                            className={!a.parentId ? "group-row" : ""}
                          >
                            <td className="numeric">{a.code}</td>
                            <td
                              style={{ paddingInlineStart: 18 + a.depth * 18 }}
                            >
                              {data.accounts.some(
                                (x) => x.parentId === a.id,
                              ) && (
                                <button
                                  className="tree-toggle"
                                  aria-label={
                                    (collapsed.has(a.id) ? "فتح " : "طي ") +
                                    a.name
                                  }
                                  aria-expanded={!collapsed.has(a.id)}
                                  onClick={() =>
                                    setCollapsed((prev) => {
                                      const n = new Set(prev);
                                      if (n.has(a.id)) n.delete(a.id);
                                      else n.add(a.id);
                                      return n;
                                    })
                                  }
                                >
                                  {collapsed.has(a.id) ? "+" : "−"}
                                </button>
                              )}
                              <button
                                className="link"
                                onClick={() =>
                                  setModal({
                                    kind: "account",
                                    value: { ...a },
                                  })
                                }
                              >
                                <GitBranch size={15} />
                                {a.name}
                              </button>
                            </td>
                            <td>
                              <span className="badge neutral">
                                {types[a.type]}
                              </span>
                            </td>
                            <td>
                              {a.parentId ? name(a.parentId) : "حساب رئيسي"}
                            </td>
                            <td>
                              <button
                                className="icon danger"
                                title="حذف الحساب"
                                onClick={() =>
                                  action(async () => {
                                    if (
                                      data.accounts.some(
                                        (x) => x.parentId === a.id,
                                      ) ||
                                      data.entries.some((e) =>
                                        e.lines.some(
                                          (l) => l.accountId === a.id,
                                        ),
                                      )
                                    )
                                      throw Error(
                                        "لا يمكن حذف حساب له حسابات فرعية أو حركات",
                                      );
                                    if (confirm("حذف الحساب؟"))
                                      await persist({
                                        ...data,
                                        accounts: data.accounts.filter(
                                          (x) => x.id !== a.id,
                                        ),
                                      });
                                  })
                                }
                              >
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {page === "centers" && (
                <section className="card">
                  <div className="card-title">
                    <h2>
                      مراكز التكلفة{" "}
                      <span className="count">{data.centers.length}</span>
                    </h2>
                  </div>
                  {!data.centers.length ? (
                    <Empty
                      text="لم تُضف مراكز تكلفة بعد"
                      sub="أضف مركزًا لكل دورة أو مجموعة لمتابعة نتائجها بشكل مستقل."
                    />
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>الكود</th>
                            <th>مركز التكلفة</th>
                            <th>المركز الرئيسي</th>
                            <th>الحركات</th>
                            <th>الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.centers.map((c) => (
                            <tr key={c.id}>
                              <td>{c.code}</td>
                              <td>
                                <button
                                  className="link"
                                  onClick={() =>
                                    setModal({
                                      kind: "center",
                                      value: { ...c },
                                    })
                                  }
                                >
                                  {c.name}
                                </button>
                              </td>
                              <td>{center(c.parentId)}</td>
                              <td>
                                <button
                                  className="link"
                                  onClick={() => {
                                    nav("entries");
                                    setFilter((f) => ({
                                      ...f,
                                      centerId: c.id,
                                    }));
                                  }}
                                >
                                  عرض القيود
                                </button>
                              </td>
                              <td>
                                <button
                                  className="icon danger"
                                  onClick={() =>
                                    action(async () => {
                                      if (
                                        data.centers.some(
                                          (x) => x.parentId === c.id,
                                        ) ||
                                        data.entries.some((e) =>
                                          e.lines.some(
                                            (l) => l.centerId === c.id,
                                          ),
                                        )
                                      )
                                        throw Error(
                                          "لا يمكن حذف مركز مرتبط بحركات أو مراكز فرعية",
                                        );
                                      if (confirm("حذف المركز؟"))
                                        await persist({
                                          ...data,
                                          centers: data.centers.filter(
                                            (x) => x.id !== c.id,
                                          ),
                                        });
                                    })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
              {page === "ledger" && (
                <section className="card">
                  <ReportTitle title="حساب الأستاذ" filter={filter} />
                  {!filter.accountId ? (
                    <Empty
                      text="اختر حسابًا لعرض حركته"
                      sub="استخدم الفلاتر بالأعلى لتحديد الحساب والفترة ومركز التكلفة."
                    />
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>التاريخ</th>
                            <th>رقم القيد</th>
                            <th>البيان</th>
                            <th>مدين</th>
                            <th>دائن</th>
                            <th>الرصيد</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="group-row">
                            <td colSpan="5">رصيد أول المدة</td>
                            <td className="numeric">
                              {money(rows.reduce((s, r) => s + r.opening, 0))}
                            </td>
                          </tr>
                          {ledger(data, filter).map((r, i) => (
                            <tr key={i}>
                              <td>{r.date}</td>
                              <td>
                                <button
                                  className="link"
                                  onClick={() =>
                                    openJournal(
                                      allEntries.find(
                                        (e) => e.id === r.entryId,
                                      ),
                                    )
                                  }
                                >
                                  #{r.number}
                                </button>
                              </td>
                              <td>{r.description}</td>
                              <td className="numeric">{money(r.debit)}</td>
                              <td className="numeric">{money(r.credit)}</td>
                              <td className="numeric">{money(r.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan="3">الإجمالي</td>
                            <td>{money(totals.debit)}</td>
                            <td>{money(totals.credit)}</td>
                            <td>
                              {money(rows.reduce((s, r) => s + r.closing, 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </section>
              )}
              {page === "trial" && (
                <section className="card">
                  <ReportTitle
                    title="ميزان المراجعة — مجاميع وأرصدة"
                    filter={filter}
                  />
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th rowSpan="2">الحساب</th>
                          <th colSpan="2">رصيد أول المدة</th>
                          <th colSpan="2">حركة الفترة</th>
                          <th colSpan="2">رصيد آخر المدة</th>
                        </tr>
                        <tr>
                          {Array.from({ length: 3 }, (_, i) => (
                            <React.Fragment key={i}>
                              <th>مدين</th>
                              <th>دائن</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trialRows.map((r) => (
                          <tr
                            key={r.id}
                            className={!r.parentId ? "group-row" : ""}
                          >
                            <td>
                              {r.code} · {r.name}
                            </td>
                            {[
                              Math.max(r.opening, 0),
                              Math.max(-r.opening, 0),
                              r.debit,
                              r.credit,
                              Math.max(r.closing, 0),
                              Math.max(-r.closing, 0),
                            ].map((n, i) => (
                              <td className="numeric" key={i}>
                                {money(n)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td>الإجمالي</td>
                          {[
                            "openingD",
                            "openingC",
                            "debit",
                            "credit",
                            "closingD",
                            "closingC",
                          ].map((k, i) => (
                            <td key={k} className="numeric">
                              {money(
                                rows.reduce(
                                  (s, r) =>
                                    s +
                                    [
                                      Math.max(r.opening, 0),
                                      Math.max(-r.opening, 0),
                                      r.debit,
                                      r.credit,
                                      Math.max(r.closing, 0),
                                      Math.max(-r.closing, 0),
                                    ][i],
                                  0,
                                ),
                              )}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </section>
              )}
              {page === "income" && (
                <section className="card">
                  <ReportTitle title="قائمة الدخل" filter={filter} />
                  {["revenue", "expense"].map((type) => (
                    <div key={type}>
                      <h3 className="report-section">{types[type]}</h3>
                      <table>
                        <tbody>
                          {rows
                            .filter(
                              (r) =>
                                r.type === type &&
                                data.accounts.every((a) => a.parentId !== r.id),
                            )
                            .map((r) => (
                              <tr key={r.id}>
                                <td>
                                  {r.code} · {r.name}
                                </td>
                                <td className="numeric">
                                  {money(
                                    type === "revenue"
                                      ? r.credit - r.debit
                                      : r.debit - r.credit,
                                  )}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>إجمالي {types[type]}</td>
                            <td className="numeric">
                              {money(
                                rows
                                  .filter((r) => r.type === type)
                                  .reduce(
                                    (s, r) =>
                                      s +
                                      (type === "revenue"
                                        ? r.credit - r.debit
                                        : r.debit - r.credit),
                                    0,
                                  ),
                              )}{" "}
                              ر.س
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))}
                  <div className="net-income">
                    <strong>صافي الربح / الخسارة</strong>
                    <strong dir="ltr">
                      {money(
                        rows.reduce(
                          (s, r) =>
                            s +
                            (["revenue", "expense"].includes(r.type)
                              ? r.credit - r.debit
                              : 0),
                          0,
                        ),
                      )}{" "}
                      SAR
                    </strong>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
      {modal && (
        <div className="modal-backdrop">
          <section
            className={
              "modal " +
              (["entry", "view", "import"].includes(modal.kind) ? "wide" : "")
            }
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">الحسابات العامة</span>
                <h2>
                  {
                    {
                      import: "استيراد القيود اليومية",
                      entry: "إضافة قيد يومي",
                      view: `قيد يومي #${modal.value.number}`,
                      account: "بيانات الحساب",
                      center: "بيانات مركز التكلفة",
                    }[modal.kind]
                  }
                </h2>
              </div>
              <button className="icon" onClick={() => setModal(null)}>
                <X />
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {modal.kind === "import" ? (
              <ImportPanel
                data={data}
                busy={busy}
                onSave={(next, summary) =>
                  action(async () => {
                    await persist(next);
                    setModal(null);
                    setToast(
                      summary.entries
                        ? `تم استيراد ${summary.entries} ${summary.asDraft ? "مسودة" : "قيد مرحّل"} بنجاح`
                        : `تم استكمال روابط ${summary.linkUpdates} قيد`,
                    );
                  })
                }
              />
            ) : ["entry", "view"].includes(modal.kind) ? (
              <EntryForm
                entry={modal.value}
                data={data}
                readOnly={modal.kind === "view"}
                busy={busy}
                savedDocuments={data.entryDocuments?.[modal.value.id]}
                onSaveLinks={async (links) => {
                  setError("");
                  setBusy(true);
                  try {
                    await persist({
                      ...data,
                      entryDocuments: {
                        ...(data.entryDocuments || {}),
                        [modal.value.id]: links,
                      },
                    });
                  } catch (e) {
                    setError(e.message);
                    await refresh();
                    throw e;
                  } finally {
                    setBusy(false);
                  }
                }}
                onSave={(entry, files, post) =>
                  action(async () => {
                    if (post) validateEntry(entry, data.accounts, data.centers);
                    else validateDraft(entry, data.accounts, data.centers);
                    const uploaded = [];
                    try {
                      for (const file of files)
                        uploaded.push(await upload(file));
                      const next = saveJournal(
                        data,
                        {
                          ...entry,
                          attachments: [
                            ...(entry.attachments || []),
                            ...uploaded,
                          ],
                        },
                        { post },
                      );
                      if (data.entryDocuments?.[entry.id])
                        next.entryDocuments = {
                          ...(next.entryDocuments || {}),
                          [entry.id]: entry.documentLinks,
                        };
                      await persist(next);
                      setModal(null);
                      setToast(
                        post
                          ? "تم حفظ وترحيل القيد"
                          : "تم حفظ المسودة — لا تؤثر في الحسابات",
                      );
                    } catch (err) {
                      if (cloud && uploaded.length)
                        await client.storage
                          .from("attachments")
                          .remove(uploaded.map((a) => a.path));
                      throw err;
                    }
                  })
                }
              />
            ) : (
              <MasterForm
                kind={modal.kind}
                initial={modal.value}
                data={data}
                busy={busy}
                onSave={(value) =>
                  action(async () => {
                    const key =
                      modal.kind === "account" ? "accounts" : "centers";
                    if (!value.name.trim() || !value.code.trim())
                      throw Error("الاسم والكود مطلوبان");
                    if (
                      data[key].some(
                        (a) => a.id !== value.id && a.code === value.code,
                      )
                    )
                      throw Error("الكود مستخدم بالفعل");
                    const old = data[key].find((a) => a.id === value.id);
                    if (
                      key === "accounts" &&
                      old &&
                      old.type !== value.type &&
                      data.entries.some((e) =>
                        e.lines.some((l) => l.accountId === value.id),
                      )
                    )
                      throw Error("لا يمكن تغيير تصنيف حساب له حركات");
                    if (
                      key === "accounts" &&
                      value.parentId &&
                      data.entries.some((e) =>
                        e.lines.some((l) => l.accountId === value.parentId),
                      )
                    )
                      throw Error(
                        "لا يمكن إضافة حساب فرعي تحت حساب عليه حركات",
                      );
                    if (value.parentId) {
                      let p = value.parentId;
                      const visited = new Set([value.id]);
                      while (p) {
                        if (visited.has(p))
                          throw Error("التسلسل الرئيسي غير صالح");
                        visited.add(p);
                        p = data[key].find((a) => a.id === p)?.parentId;
                      }
                      if (
                        key === "accounts" &&
                        data.accounts.find((a) => a.id === value.parentId)
                          ?.type !== value.type
                      )
                        throw Error(
                          "الحساب الرئيسي يجب أن يكون من نفس التصنيف",
                        );
                    }
                    if (
                      key === "accounts" &&
                      data.accounts.some(
                        (a) => a.parentId === value.id && a.type !== value.type,
                      )
                    )
                      throw Error("تصنيف الحساب يجب أن يطابق حساباته الفرعية");
                    await persist({
                      ...data,
                      [key]: [
                        ...data[key].filter((a) => a.id !== value.id),
                        value,
                      ],
                    });
                    setModal(null);
                  })
                }
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Field({ label, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(children, { id })}
    </div>
  );
}
function Empty({
  text = "لا توجد قيود حتى الآن",
  sub = "ستظهر القيود المسجلة هنا. أضف أول قيد للبدء.",
}) {
  return (
    <div className="empty">
      <span>
        <BookOpen size={28} />
      </span>
      <h3>{text}</h3>
      <p>{sub}</p>
    </div>
  );
}
function EntryTable({
  entries,
  open,
  documents = {},
  accounts = [],
  onAccountOpen,
}) {
  return !entries.length ? (
    <Empty />
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>رقم القيد</th>
            <th>التاريخ</th>
            <th>البيان</th>
            <th>الحسابات</th>
            <th>القيمة (ر.س)</th>
            <th>الحالة</th>
            <th>مرفقات</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>
                <button className="link" onClick={() => open(e)}>
                  #{String(e.number).padStart(4, "0")}
                </button>
              </td>
              <td>{e.date}</td>
              <td>{e.description}</td>
              <td>
                <div className="dashboard-account-chips">
                  {[
                    ...new Set(e.lines.map((l) => l.accountId).filter(Boolean)),
                  ].map((id) => (
                    <AccountChip
                      key={id}
                      accountId={id}
                      label={
                        accounts.find((a) => a.id === id)?.name ||
                        "حساب غير محدد"
                      }
                      onOpen={onAccountOpen}
                    />
                  ))}
                </div>
              </td>
              <td className="numeric">
                {money(e.lines.reduce((s, l) => s + l.debit, 0))}
              </td>
              <td>
                <span className="badge">متوازن</span>
              </td>
              <td>
                {entryDocuments(e, documents[e.id]).length > 0 ? (
                  <button className="link" onClick={() => open(e)}>
                    {entryDocuments(e, documents[e.id]).length} رابط مستند
                  </button>
                ) : null}
                {e.attachments?.length > 0 ? (
                  <span> · {e.attachments.length} مرفق</span>
                ) : null}
                {!entryDocuments(e, documents[e.id]).length &&
                !e.attachments?.length
                  ? "—"
                  : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function ReportTitle({ title, filter }) {
  return (
    <div className="report-title">
      <BrandLogo className="report-logo" />
      <h2>{title}</h2>
      <p>
        {!filter.from && !filter.to
          ? "جميع الفترات"
          : `${filter.from || "بداية التسجيل"} — ${filter.to || "بدون تاريخ نهاية"}`}{" "}
        · العملة: الريال السعودي (SAR)
      </p>
    </div>
  );
}
function MasterForm({ kind, initial, data, onSave, busy }) {
  const [v, setV] = useState(initial);
  const list = kind === "account" ? data.accounts : data.centers;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <div className="form-body">
        <Field label="الاسم">
          <input
            required
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </Field>
        <Field label="الكود">
          <input
            required
            value={v.code}
            onChange={(e) => setV({ ...v, code: e.target.value })}
          />
        </Field>
        {kind === "account" && (
          <Field label="التصنيف">
            <select
              value={v.type}
              onChange={(e) =>
                setV({ ...v, type: e.target.value, parentId: "" })
              }
            >
              {Object.entries(types).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {kind === "account" && (
          <Field label="الطبيعة المحاسبية">
            <select
              value={
                v.normalBalance ||
                (["asset", "expense"].includes(v.type) ? "debit" : "credit")
              }
              onChange={(e) => setV({ ...v, normalBalance: e.target.value })}
            >
              <option value="debit">مدين</option>
              <option value="credit">دائن</option>
            </select>
          </Field>
        )}
        <Field
          label={
            kind === "account" ? "الحساب الرئيسي" : "المركز الرئيسي (اختياري)"
          }
        >
          <select
            value={v.parentId}
            onChange={(e) => setV({ ...v, parentId: e.target.value })}
          >
            <option value="">بدون</option>
            {list
              .filter(
                (a) =>
                  a.id !== v.id && (kind !== "account" || a.type === v.type),
              )
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="modal-footer">
        <button className="primary" disabled={busy}>
          <Save size={16} />
          {busy ? "جاري الحفظ…" : "حفظ البيانات"}
        </button>
      </div>
    </form>
  );
}
function EntryForm({
  entry,
  data,
  readOnly,
  busy,
  onSave,
  savedDocuments,
  onSaveLinks,
}) {
  const [v, setV] = useState(readOnly ? entry : { ...entry }),
    [files, setFiles] = useState([]),
    [err, setErr] = useState(""),
    [linksText, setLinksText] = useState(
      entryDocuments(entry, savedDocuments)
        .map((d) => d.url)
        .join("\n"),
    );
  const lines = readOnly
    ? v.lines.map((l) => ({
        ...l,
        debit: (l.debit / 100).toFixed(2),
        credit: (l.credit / 100).toFixed(2),
      }))
    : v.lines;
  function change(i, key, val) {
    setV({
      ...v,
      lines: v.lines.map((l, j) => (j === i ? { ...l, [key]: val } : l)),
    });
  }
  const d = lines.reduce(
      (s, l) => s + Math.round(Number(l.debit || 0) * 100),
      0,
    ),
    c = lines.reduce((s, l) => s + Math.round(Number(l.credit || 0) * 100), 0);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave(
            {
              ...v,
              documentLinks: parseDocumentLinks(linksText),
              lines: v.lines.map((l) => ({
                ...l,
                debit: cents(l.debit || "0"),
                credit: cents(l.credit || "0"),
              })),
            },
            files,
            e.nativeEvent.submitter?.value === "post",
          );
        } catch (e) {
          setErr(e.message);
        }
      }}
    >
      <div className="form-body">
        {readOnly && entry.importKey && (
          <details className="import-details">
            <summary>تفاصيل الاستيراد من Excel</summary>
            <p>
              الملف: {entry.sourceFile} · الورقة: {entry.sourceSheet} · الصفوف:{" "}
              {entry.sourceRows.join("، ")} · رقم القيد الأصلي:{" "}
              {entry.sourceNumber || "بدون رقم"}
            </p>
            {entry.lines.map((l, i) => (
              <p key={i}>
                صف {l.sourceRow}: {l.reference && `مرجع: ${l.reference} · `}
                {l.notes && `ملاحظات: ${l.notes} · `}القيم الأصلية: مدين{" "}
                {String(l.sourceDebit)} / دائن {String(l.sourceCredit)}
              </p>
            ))}
          </details>
        )}
        {(entry.importKey ||
          entryDocuments(entry, savedDocuments).length > 0) && (
          <DocumentsField
            readOnly={readOnly}
            links={entryDocuments(entry, savedDocuments)}
            textValue={linksText}
            onChange={setLinksText}
            onSave={onSaveLinks}
            busy={busy}
          />
        )}
        <div className="entry-top">
          <Field label="تاريخ القيد">
            <input
              required
              type="date"
              value={v.date}
              disabled={readOnly}
              onChange={(e) => setV({ ...v, date: e.target.value })}
            />
          </Field>
          <Field label="العملة">
            <input disabled value="ريال سعودي · SAR" />
          </Field>
          <Field label="بيان القيد">
            <input
              required
              placeholder="اكتب وصفًا للحركة المالية…"
              value={v.description}
              disabled={readOnly}
              onChange={(e) => setV({ ...v, description: e.target.value })}
            />
          </Field>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="table-scroll entry-lines">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الحساب</th>
                <th>البيان</th>
                <th>مركز التكلفة</th>
                <th>مدين (ر.س)</th>
                <th>دائن (ر.س)</th>
                {!readOnly && <th />}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <select
                      disabled={readOnly}
                      value={l.accountId}
                      onChange={(e) => change(i, "accountId", e.target.value)}
                    >
                      <option value="">اختر الحساب</option>
                      {postingAccounts(data.accounts).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      disabled={readOnly}
                      value={l.description}
                      placeholder="وصف السطر"
                      onChange={(e) => change(i, "description", e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      disabled={readOnly}
                      value={l.centerId}
                      onChange={(e) => change(i, "centerId", e.target.value)}
                    >
                      <option value="">بدون مركز</option>
                      {data.centers.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  {["debit", "credit"].map((k) => (
                    <td key={k}>
                      <input
                        aria-label={k === "debit" ? "مدين" : "دائن"}
                        className="numeric"
                        disabled={readOnly}
                        type="number"
                        min="0"
                        step="0.01"
                        value={l[k]}
                        placeholder="0.00"
                        onChange={(e) => change(i, k, e.target.value)}
                      />
                    </td>
                  ))}
                  {!readOnly && (
                    <td>
                      <button
                        type="button"
                        className="icon danger"
                        onClick={() =>
                          setV({
                            ...v,
                            lines: v.lines.filter((_, j) => i !== j),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="4">الإجمالي</td>
                <td className="numeric">{money(d)}</td>
                <td className="numeric">{money(c)}</td>
                {!readOnly && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="entry-tools">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setV({ ...v, lines: [...v.lines, blankLine()] })}
            >
              <Plus size={16} />
              إضافة سطر
            </button>
          )}
          <span className={d === c && d ? "balanced" : "unbalanced"}>
            {d === c && d
              ? "✓ القيد متوازن"
              : `الفرق: ${money(Math.abs(d - c))} ر.س`}
          </span>
        </div>
        {!readOnly ? (
          <label className="upload">
            <Paperclip size={22} />
            <strong>إرفاق مستندات القيد</strong>
            <span>
              صور أو PDF · حتى 5 ميجابايت لكل ملف
              {!cloud ? " · يتطلب الربط السحابي" : ""}
            </span>
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              disabled={!cloud || busy}
              onChange={(e) => setFiles(Array.from(e.target.files))}
            />
            {files.map((f, i) => (
              <small key={i}>{f.name}</small>
            ))}
          </label>
        ) : (
          <div className="attachments">
            {v.attachments?.map((a) => (
              <button
                key={a.path}
                type="button"
                onClick={() =>
                  openAttachment(a).catch((e) => setErr(e.message))
                }
              >
                <Paperclip size={16} />
                {a.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="modal-footer">
          <span className="muted">المسودة لا تؤثر في الحسابات حتى ترحيلها</span>
          <div className="entry-save-actions">
            <button type="submit" name="outcome" value="draft" disabled={busy}>
              <Save size={17} />
              {busy ? "جاري الحفظ…" : "حفظ مسودة"}
            </button>
            <button
              type="submit"
              name="outcome"
              value="post"
              className="primary"
              disabled={busy}
            >
              حفظ وترحيل
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
function Login({ onDemo, onError, error }) {
  const [user, setUser] = useState("ghaith"),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false),
    [remember, setRemember] = useState(
      localStorage.getItem(REMEMBER_KEY) !== "false",
    ),
    [notice, setNotice] = useState("");
  return (
    <div className="login">
      <div className="login-card">
        <BrandLogo className="login-logo" />
        <h1>سجّل الدخول إلى حسابك</h1>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="login-notice" role="status">
            {notice}
          </div>
        )}
        {cloud ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              onError("");
              localStorage.setItem(REMEMBER_KEY, String(remember));
              try {
                const { error } = await client.auth.signInWithPassword({
                  email: user.includes("@") ? user : `${user}@ghaith.local`,
                  password,
                });
                if (error)
                  onError("تعذر الدخول. تحقق من اسم المستخدم وكلمة المرور.");
              } catch {
                onError("تعذر الاتصال. حاول مرة أخرى.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="اسم المستخدم أو البريد الإلكتروني">
              <input
                autoComplete="username"
                required
                placeholder="اسم المستخدم أو البريد الإلكتروني"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </Field>
            <div className="password-field">
              <Field label="كلمة المرور">
                <input
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="كلمة المرور"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <button
                className="password-toggle"
                type="button"
                aria-label={
                  showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                }
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <div className="login-options">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                تذكرني
              </label>
              <button
                className="link"
                type="button"
                onClick={() =>
                  setNotice(
                    "لتغيير كلمة مرور الحساب المشترك، تواصل مع مسؤول النظام.",
                  )
                }
              >
                نسيت كلمة المرور؟
              </button>
            </div>
            <button className="primary" disabled={busy}>
              {busy ? "جاري الدخول…" : "تسجيل الدخول"}
            </button>
          </form>
        ) : (
          <>
            <div className="demo-note">
              نسخة تجريبية محلية؛ لا تحتوي على بيانات الحساب السحابي.
            </div>
            <button className="primary" onClick={onDemo}>
              استكشاف النسخة التجريبية <ChevronLeft size={17} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
