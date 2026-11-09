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
} from "./accounting";
import {
  cloud,
  client,
  readData,
  saveData,
  upload,
  openAttachment,
} from "./store";
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
    setFilter({
      from: "",
      to: today(),
      centerId: "",
      accountId: "",
      search: "",
    });
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
  const visibleEntries = data.entries
    .filter(
      (e) =>
        (!filter.from || e.date >= filter.from) &&
        (!filter.to || e.date <= filter.to) &&
        (!filter.centerId ||
          e.lines.some((l) => l.centerId === filter.centerId)) &&
        (!filter.search ||
          `${e.number} ${e.description}`.includes(filter.search)),
    )
    .sort((a, b) => b.number - a.number);
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
  function exportRows() {
    let values;
    if (page === "entries")
      values = [
        ["الرقم", "التاريخ", "البيان", "المدين", "الدائن"],
        ...visibleEntries.map((e) => [
          e.number,
          e.date,
          e.description,
          money(e.lines.reduce((s, l) => s + l.debit, 0)),
          money(e.lines.reduce((s, l) => s + l.credit, 0)),
        ]),
      ];
    else if (page === "ledger")
      values = [
        ["التاريخ", "رقم القيد", "البيان", "مدين", "دائن", "الرصيد"],
        ...ledger(data, filter).map((r) => [
          r.date,
          r.number,
          r.description,
          money(r.debit),
          money(r.credit),
          money(r.balance),
        ]),
      ];
    else
      values = [
        ["الكود", "الحساب", "رصيد أول المدة", "مدين", "دائن", "الرصيد"],
        ...rows
          .filter(
            (r) => page !== "income" || ["revenue", "expense"].includes(r.type),
          )
          .map((r) => [
            r.code,
            r.name,
            money(r.opening),
            money(r.debit),
            money(r.credit),
            money(r.closing),
          ]),
      ];
    const csv =
      "\ufeff" +
      values
        .map((r) =>
          r
            .map(
              (v) =>
                '"' +
                String(v)
                  .replace(/^[=+@-]/, "'$&")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ghaith-${page}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="app">
      <aside className={side ? "open" : ""}>
        <a className="brand" onClick={() => nav("dashboard")}>
          <span className="brand-mark">غ</span>
          <div>
            غيث<span>النظام المحاسبي</span>
          </div>
        </a>
        <div className="workspace">
          <span className="workspace-icon">غ</span>
          <div>
            غيث للتعليم<small>المساحة المحاسبية</small>
          </div>
          <span className="dot" />
        </div>
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
          <div className="currency">
            ر.س{" "}
            <span>
              الريال السعودي<small>العملة الأساسية</small>
            </span>
          </div>
          <p>غيث للمحاسبة · الإصدار الأول</p>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            <button className="icon mobile" onClick={() => setSide(!side)}>
              <Menu />
            </button>
            المساحة المحاسبية <ChevronLeft size={14} />
            <strong>{pages.find((p) => p[0] === page)?.[1]}</strong>
          </div>
          <div className="profile">
            <span className={"mode " + (!cloud ? "demo" : "")}>
              {cloud ? "متصل بالسحابة" : "وضع تجريبي محلي"}
            </span>
            <span className="avatar">G</span>
            <span>
              ghaith<small>محاسب</small>
            </span>
            <button
              className="icon"
              title="تسجيل الخروج"
              onClick={() =>
                action(async () => {
                  if (cloud) await client.auth.signOut();
                  setSession(null);
                })
              }
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main>
          {!cloud && (
            <div className="demo-banner">
              <AlertCircle size={16} /> نسخة تجريبية: البيانات محفوظة في هذا
              المتصفح فقط. المشاركة والمرفقات تتطلب ربط Supabase.
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
              <h1>{pages.find((p) => p[0] === page)?.[1]}</h1>
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
            <div className="actions">
              {["entries", "accounts"].includes(page) && (
                <button
                  onClick={() => {
                    setError("");
                    setModal({
                      kind: "import",
                      mode: page === "accounts" ? "accounts" : "entries",
                      value: {},
                    });
                  }}
                >
                  <Upload size={17} />
                  استيراد Excel
                </button>
              )}
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
                    تصدير Excel (CSV)
                  </button>
                </>
              )}
            </div>
          </div>
          {page === "dashboard" ? (
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
                    data.entries.length,
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
                    entries={visibleEntries.slice(0, 5)}
                    open={(e) => setModal({ kind: "view", value: e })}
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
              {["entries", "ledger", "trial", "income"].includes(page) && (
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
                <section className="card">
                  <div className="card-title">
                    <h2>
                      سجل القيود{" "}
                      <span className="count">{visibleEntries.length}</span>
                    </h2>
                    <button onClick={exportRows}>
                      <Download size={15} />
                      تصدير
                    </button>
                  </div>
                  <EntryTable
                    entries={visibleEntries}
                    open={(e) => setModal({ kind: "view", value: e })}
                  />
                </section>
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
                                    setModal({
                                      kind: "view",
                                      value: data.entries.find(
                                        (e) => e.id === r.entryId,
                                      ),
                                    })
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
          <footer>
            غيث للنظام المحاسبي <span>جميع المبالغ بالريال السعودي · SAR</span>
          </footer>
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
                      import: "استيراد القيود وشجرة الحسابات",
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
                initialMode={modal.mode}
                onSave={(next, summary) =>
                  action(async () => {
                    await persist(next);
                    setModal(null);
                    setToast(
                      summary.accountsOnly
                        ? "تمت إضافة شجرة الحسابات"
                        : `تم استيراد ${summary.entries} قيد بنجاح`,
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
                onSave={(entry, files) =>
                  action(async () => {
                    validateEntry(entry, data.accounts, data.centers);
                    const attachments = [];
                    try {
                      for (const file of files)
                        attachments.push(await upload(file));
                      await persist({
                        ...data,
                        entries: [
                          ...data.entries,
                          {
                            ...entry,
                            number:
                              Math.max(
                                0,
                                ...data.entries.map((e) => e.number),
                              ) + 1,
                            attachments,
                            createdAt: new Date().toISOString(),
                          },
                        ],
                      });
                    } catch (e) {
                      if (cloud && attachments.length)
                        await client.storage
                          .from("attachments")
                          .remove(attachments.map((a) => a.path));
                      throw e;
                    }
                    setModal(null);
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
function EntryTable({ entries, open }) {
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
              <td className="numeric">
                {money(e.lines.reduce((s, l) => s + l.debit, 0))}
              </td>
              <td>
                <span className="badge">متوازن</span>
              </td>
              <td>{e.attachments?.length || "—"}</td>
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
      <span className="report-logo">غيث</span>
      <h2>{title}</h2>
      <p>
        {filter.from || "بداية التسجيل"} — {filter.to || "حتى الآن"} · العملة:
        الريال السعودي (SAR)
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
function EntryForm({ entry, data, readOnly, busy, onSave }) {
  const [v, setV] = useState(readOnly ? entry : { ...entry }),
    [files, setFiles] = useState([]),
    [err, setErr] = useState("");
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
              lines: v.lines.map((l) => ({
                ...l,
                debit: cents(l.debit || "0"),
                credit: cents(l.credit || "0"),
              })),
            },
            files,
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
                      required
                      disabled={readOnly}
                      value={l.accountId}
                      onChange={(e) => change(i, "accountId", e.target.value)}
                    >
                      <option value="">اختر الحساب</option>
                      {data.accounts
                        .filter(
                          (a) =>
                            !data.accounts.some((b) => b.parentId === a.id),
                        )
                        .map((a) => (
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
          <span className="muted">يُحفظ القيد بكامل أطرافه في عملية واحدة</span>
          <button className="primary" disabled={busy}>
            <Save size={17} />
            {busy ? "جاري الحفظ…" : "حفظ القيد"}
          </button>
        </div>
      )}
    </form>
  );
}
function Login({ onDemo, onError, error }) {
  const [user, setUser] = useState("ghaith"),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="login-card">
        <div className="login-logo">
          غيث<span>النظام المحاسبي</span>
        </div>
        <h1>أهلًا بعودتك</h1>
        <p>مساحتك البسيطة لإدارة حسابات نشاطك التعليمي</p>
        {error && <div className="error">{error}</div>}
        {cloud ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const { error } = await client.auth.signInWithPassword({
                email: user.includes("@") ? user : `${user}@ghaith.local`,
                password,
              });
              if (error)
                onError(
                  "تعذر الدخول. تحقق من بيانات الحساب أو إعدادات الخدمة.",
                );
              setBusy(false);
            }}
          >
            <Field label="اسم المستخدم">
              <input
                autoComplete="username"
                required
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
            </Field>
            <Field label="كلمة المرور">
              <input
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <button className="primary" disabled={busy}>
              {busy ? "جاري الدخول…" : "تسجيل الدخول"}
            </button>
          </form>
        ) : (
          <>
            <div className="demo-note">
              الربط السحابي لم يُفعّل بعد. يمكنك استكشاف النظام ببيانات تجريبية
              محفوظة في متصفحك.
            </div>
            <button className="primary" onClick={onDemo}>
              استكشاف النسخة التجريبية <ChevronLeft size={17} />
            </button>
          </>
        )}
        <small>الحسابات العامة · مراكز التكلفة · التقارير المالية</small>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
