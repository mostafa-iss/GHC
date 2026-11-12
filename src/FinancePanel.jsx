import React, { useMemo, useState } from "react";
import {
  Landmark,
  CreditCard,
  Wallet,
  ArrowRight,
  Plus,
  Pencil,
  ExternalLink,
  FileText,
} from "lucide-react";
import { money, ledger, postingAccounts, reportRows } from "./accounting.js";
import AccountSelect from "./AccountSelect";
import { documentLink } from "./documents.js";
import driveLogo from "./assets/google-drive.svg";
const kindNames = { bank: "حساب بنكي", card: "بطاقة بنكية", cash: "خزينة" };
const KindIcon = ({ kind }) =>
  kind === "card" ? (
    <CreditCard size={22} />
  ) : kind === "cash" ? (
    <Wallet size={22} />
  ) : (
    <Landmark size={22} />
  );
export default function FinancePanel({
  data,
  onSave,
  onAccountOpen,
  onJournalOpen,
}) {
  const [selected, setSelected] = useState(null),
    [tab, setTab] = useState("statements"),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState(""),
    [form, setForm] = useState(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const accounts = data.financeAccounts || [],
    item = accounts.find((a) => a.id === selected),
    balances = useMemo(() => reportRows(data), [data]);
  const amount = (a) =>
    a.accountId ? balances.find((x) => x.id === a.accountId)?.closing : null;
  const allMovements = item?.accountId
    ? ledger(data, { accountId: item.accountId })
    : [];
  const movements = allMovements.filter(
    (r) => (!from || r.date >= from) && (!to || r.date <= to),
  );
  const opening = allMovements
    .filter((r) => from && r.date < from && (!to || r.date <= to))
    .reduce((s, r) => s + r.debit - r.credit, 0);
  const closing = movements.at(-1)?.balance ?? opening;
  async function save(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!form.name.trim()) throw Error("اسم الحساب المالي مطلوب");
      if (
        form.accountId &&
        !postingAccounts(data.accounts).some(
          (a) =>
            a.id === form.accountId && ["asset", "liability"].includes(a.type),
        )
      )
        throw Error("اختر حسابًا فرعيًا من الأصول أو الالتزامات");
      const next = {
        ...form,
        statementLinks: form.statementLinks
          .filter((l) => l.url.trim())
          .map((l) => documentLink(l)),
        name: form.name.trim(),
      };
      await onSave({
        ...data,
        financeAccounts: [...accounts.filter((a) => a.id !== next.id), next],
      });
      setForm(null);
      setSelected(next.id);
      setTab("statements");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  const start = (a) => {
    setError("");
    setForm(
      a
        ? structuredClone(a)
        : {
            id: crypto.randomUUID(),
            name: "",
            bankName: "",
            accountNumber: "",
            kind: "bank",
            accountId: "",
            statementLinks: [],
          },
    );
  };
  return (
    <div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {form ? (
        <form className="card finance-form" onSubmit={save}>
          <h2>
            {accounts.some((a) => a.id === form.id)
              ? "تعديل الحساب المالي"
              : "إضافة حساب مالي"}
          </h2>
          <div className="filter-grid">
            {[
              ["name", "الاسم"],
              ["bankName", "اسم البنك"],
              ["accountNumber", "رقم الحساب / IBAN (اختياري)"],
            ].map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  aria-label={label}
                  required={key === "name"}
                  value={form[key] || ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="field">
              النوع
              <select
                aria-label="نوع الحساب المالي"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                {Object.entries(kindNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              حساب الأستاذ المرتبط
              <AccountSelect
                label="حساب الأستاذ المرتبط"
                accounts={postingAccounts(data.accounts).filter((a) =>
                  ["asset", "liability"].includes(a.type),
                )}
                value={form.accountId}
                onChange={(id) => setForm({ ...form, accountId: id })}
                allowEmpty
              />
            </label>
          </div>
          <h3>روابط كشف حساب البنك</h3>
          {form.statementLinks.map((link, i) => (
            <div className="statement-link-editor" key={i}>
              <input
                aria-label={`اسم الكشف ${i + 1}`}
                placeholder="اسم الكشف"
                value={link.label}
                onChange={(e) =>
                  setForm({
                    ...form,
                    statementLinks: form.statementLinks.map((l, j) =>
                      j === i ? { ...l, label: e.target.value } : l,
                    ),
                  })
                }
              />
              <input
                aria-label={`رابط الكشف ${i + 1}`}
                placeholder="https://drive.google.com/…"
                dir="ltr"
                value={link.url}
                onChange={(e) =>
                  setForm({
                    ...form,
                    statementLinks: form.statementLinks.map((l, j) =>
                      j === i ? { ...l, url: e.target.value } : l,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="danger"
                onClick={() =>
                  setForm({
                    ...form,
                    statementLinks: form.statementLinks.filter(
                      (_, j) => j !== i,
                    ),
                  })
                }
              >
                إزالة
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                statementLinks: [
                  ...form.statementLinks,
                  { label: "كشف حساب البنك", url: "" },
                ],
              })
            }
          >
            <Plus size={16} />
            إضافة رابط كشف
          </button>
          <div className="modal-footer">
            <button
              type="button"
              disabled={saving}
              onClick={() => setForm(null)}
            >
              إلغاء
            </button>
            <button className="primary" disabled={saving}>
              {saving ? "جاري الحفظ…" : "حفظ الحساب المالي"}
            </button>
          </div>
        </form>
      ) : item ? (
        <>
          <button className="link" onClick={() => setSelected(null)}>
            <ArrowRight size={17} />
            خزائن وحسابات بنكية
          </button>
          <section className="card finance-heading">
            <div className="finance-identity">
              <span className="finance-icon">
                <KindIcon kind={item.kind} />
              </span>
              <div>
                <h2>{item.name}</h2>
                <p>{kindNames[item.kind]} · SAR</p>
                {item.accountId && (
                  <button
                    className="link"
                    onClick={() => onAccountOpen(item.accountId)}
                  >
                    حساب الأستاذ:{" "}
                    {data.accounts.find((a) => a.id === item.accountId)?.name}
                  </button>
                )}
              </div>
            </div>
            <div>
              <small>الرصيد الدفتري</small>
              <strong className="finance-balance numeric">
                {amount(item) == null ? "غير مرتبط" : money(amount(item))}
              </strong>
            </div>
            <button onClick={() => start(item)}>
              <Pencil size={16} />
              تعديل
            </button>
          </section>
          <section className="card">
            <div className="finance-tabs">
              {[
                ["details", "التفاصيل"],
                ["transactions", "معاملات النظام"],
                ["statements", "كشف حساب البنك"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? "selected" : ""}
                  aria-pressed={tab === id}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "details" ? (
              <dl className="finance-details">
                {[
                  ["الاسم", item.name],
                  ["البنك", item.bankName || "—"],
                  ["رقم الحساب / IBAN", item.accountNumber || "—"],
                  ["النوع", kindNames[item.kind]],
                  ["العملة", "الريال السعودي (SAR)"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : tab === "statements" ? (
              <div className="bank-statements">
                <div className="section-intro">
                  <FileText size={24} />
                  <div>
                    <h3>كشوف الحساب الصادرة من البنك</h3>
                    <p>
                      افتح الملفات الأصلية على Google Drive. الحركات المسجلة في
                      GHC Academy موجودة في «معاملات النظام».
                    </p>
                  </div>
                </div>
                {item.statementLinks?.length ? (
                  <div className="statement-grid">
                    {item.statementLinks.map((link, i) => {
                      let safe;
                      try {
                        safe = documentLink(link);
                      } catch {
                        return null;
                      }
                      return (
                        <a
                          className="statement-card"
                          key={i}
                          href={safe.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img src={driveLogo} alt="Google Drive" />
                          <strong>{safe.label}</strong>
                          <span>
                            فتح كشف الحساب <ExternalLink size={16} />
                          </span>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty">
                    <p>لا توجد روابط كشوف مضافة لهذا الحساب.</p>
                    <button onClick={() => start(item)}>إضافة كشف حساب</button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="finance-transaction-filters">
                  <label className="field">
                    من تاريخ
                    <input
                      type="date"
                      aria-label="معاملات البنك من تاريخ"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    إلى تاريخ
                    <input
                      type="date"
                      aria-label="معاملات البنك إلى تاريخ"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </label>
                </div>
                {item.accountId ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>التاريخ</th>
                          <th>القيد</th>
                          <th>البيان</th>
                          <th>مدين</th>
                          <th>دائن</th>
                          <th>الرصيد</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="group-row">
                          <td colSpan="5">رصيد أول المدة</td>
                          <td className="numeric">{money(opening)}</td>
                        </tr>
                        {movements.map((r, i) => (
                          <tr key={i}>
                            <td>{r.date}</td>
                            <td>
                              <button
                                className="link"
                                onClick={() =>
                                  onJournalOpen(
                                    data.entries.find(
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
                          <td colSpan="5">رصيد آخر المدة</td>
                          <td className="numeric">{money(closing)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="report-note">
                    اربط حساب الأستاذ من «تعديل» لعرض الحركات والرصيد.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="actions section-actions">
            <button className="primary" onClick={() => start()}>
              <Plus size={17} />
              إضافة حساب مالي
            </button>
          </div>
          <section className="card filters">
            <div className="filter-grid">
              <label className="field">
                الاسم
                <input
                  aria-label="بحث الحسابات المالية"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث عن البنك أو الخزينة…"
                />
              </label>
              <label className="field">
                النوع
                <select
                  aria-label="تصفية نوع الحساب المالي"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="">الكل</option>
                  {Object.entries(kindNames).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>النوع</th>
                    <th>حساب الأستاذ</th>
                    <th>الرصيد الدفتري (ر.س)</th>
                    <th>الكشوف</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts
                    .filter(
                      (a) =>
                        (!kind || a.kind === kind) && a.name.includes(search),
                    )
                    .map((a) => (
                      <tr key={a.id}>
                        <td>
                          <button
                            className="link"
                            onClick={() => {
                              setSelected(a.id);
                              setTab("statements");
                              setFrom("");
                              setTo("");
                            }}
                          >
                            <KindIcon kind={a.kind} />
                            {a.name}
                          </button>
                        </td>
                        <td>{kindNames[a.kind]}</td>
                        <td>
                          {data.accounts.find((x) => x.id === a.accountId)
                            ?.name || "غير مرتبط"}
                        </td>
                        <td className="numeric">
                          {amount(a) == null ? "—" : money(amount(a))}
                        </td>
                        <td>
                          <button
                            onClick={() => {
                              setSelected(a.id);
                              setTab("statements");
                            }}
                          >
                            {a.statementLinks?.length || 0} كشف
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!accounts.length && (
              <div className="empty">
                <Landmark size={32} />
                <h3>حساباتك البنكية وخزائنك</h3>
                <p>اربط حساب الأستاذ وأضف روابط كشوف الحساب الأصلية.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
