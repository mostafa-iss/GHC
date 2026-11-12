import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  FolderOpen,
  FileText,
  ChevronLeft,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Search,
  ArrowRight,
  Pencil,
  Trash2,
  Download,
  Printer,
  BookOpen,
  GitBranch,
  X,
} from "lucide-react";
import { money, types } from "./accounting.js";
import { normalizeSearch } from "./journals.js";
import { chartModel, accountPath, accountMovement } from "./chart.js";
import { isReportDate } from "./financialReports.js";
import { exportReport } from "./exports.js";
import BrandLogo from "./BrandLogo";

export default function ChartOfAccounts({
  data,
  onAdd,
  onEdit,
  onDelete,
  onNewEntry,
  onJournalOpen,
  onLedgerOpen,
  busy,
}) {
  const model = useMemo(() => chartModel(data), [data]);
  const [selectedId, setSelectedId] = useState(""),
    [expanded, setExpanded] = useState(
      () => new Set((model.children.get("") || []).map((a) => a.id)),
    ),
    [search, setSearch] = useState(""),
    [showZero, setShowZero] = useState(true),
    [menu, setMenu] = useState(null),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [treeOpen, setTreeOpen] = useState(false);
  const tree = useRef(null);
  const selected = model.byId.get(selectedId),
    path = accountPath(data.accounts, selectedId),
    isFolder = !selected || model.children.has(selected.id),
    query = normalizeSearch(search),
    matching = data.accounts.filter((a) =>
      normalizeSearch(a.code + " " + a.name).includes(query),
    ),
    visible = new Set(
      matching.flatMap((a) =>
        accountPath(data.accounts, a.id).map((p) => p.id),
      ),
    ),
    children = query ? matching : model.children.get(selected?.id || "") || [],
    listed = children.filter((a) => showZero || model.balances.get(a.id) !== 0),
    periodError =
      (from && !isReportDate(from)) || (to && !isReportDate(to))
        ? "اختر تاريخًا صحيحًا لعرض الحركات"
        : from && to && from > to
          ? "تاريخ البداية يجب أن يسبق تاريخ النهاية"
          : "",
    movement = useMemo(
      () =>
        selected && !isFolder && !periodError
          ? accountMovement(data, selected.id, { from, to })
          : null,
      [data, selected?.id, isFolder, from, to, periodError],
    );
  useEffect(() => {
    if (!menu) return;
    const close = (e) => {
      if (
        e.type === "keydown"
          ? e.key === "Escape"
          : !e.target.closest(".chart-more")
      )
        setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  function select(a) {
    setSelectedId(a?.id || "");
    setSearch("");
    setMenu(null);
    setFrom("");
    setTo("");
    setError("");
    setTreeOpen(false);
    setExpanded(
      (prev) =>
        new Set([
          ...prev,
          ...accountPath(data.accounts, a?.id).map((p) => p.id),
        ]),
    );
  }
  function toggle(id) {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function treeKey(e, a) {
    if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      const items = [...tree.current.querySelectorAll('[role="treeitem"]')],
        i = items.indexOf(e.currentTarget);
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? items.length - 1
            : Math.max(
                0,
                Math.min(
                  items.length - 1,
                  i + (e.key === "ArrowDown" ? 1 : -1),
                ),
              );
      items[next]?.focus();
    }
    if (e.key === "ArrowRight" && model.children.has(a.id)) {
      e.preventDefault();
      setExpanded((prev) => new Set([...prev, a.id]));
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (expanded.has(a.id)) toggle(a.id);
      else
        tree.current
          .querySelector(`[data-account-id="${CSS.escape(a.parentId)}"]`)
          ?.focus();
    }
  }
  function node(a, level = 1) {
    const folder = model.children.has(a.id),
      open = Boolean(query) || expanded.has(a.id),
      Icon = folder ? (open ? FolderOpen : Folder) : FileText;
    if (query && !visible.has(a.id)) return null;
    return (
      <div key={a.id} className="chart-node" role="none">
        <div
          className="chart-tree-line"
          style={{ paddingInlineStart: (level - 1) * 17 + 8 }}
        >
          {folder ? (
            <button
              className="chart-expander"
              aria-label={(open ? "طي " : "فتح ") + a.name}
              aria-expanded={open}
              onClick={() => toggle(a.id)}
              disabled={Boolean(query)}
            >
              <ChevronDown size={14} className={open ? "" : "closed"} />
            </button>
          ) : (
            <span className="chart-expander-space" />
          )}
          <button
            role="treeitem"
            aria-level={level}
            aria-selected={selected?.id === a.id}
            aria-expanded={folder ? open : undefined}
            data-account-id={a.id}
            className="chart-tree-name"
            onClick={() => select(a)}
            onKeyDown={(e) => treeKey(e, a)}
          >
            <Icon size={19} />
            <span>{a.name}</span>
            <small>{a.code}</small>
          </button>
        </div>
        {folder && open && (
          <div role="group">
            {model.children.get(a.id).map((c) => node(c, level + 1))}
          </div>
        )}
      </div>
    );
  }
  const balance = (amount, a) => {
    const side =
      amount === 0
        ? a?.normalBalance ||
          (["asset", "expense"].includes(a?.type) ? "debit" : "credit")
        : amount > 0
          ? "debit"
          : "credit";
    return (
      <div className="chart-balance">
        <strong className="numeric">{money(Math.abs(amount))}</strong>
        <span>{side === "debit" ? "مدين" : "دائن"}</span>
      </div>
    );
  };
  async function download() {
    setExporting(true);
    setError("");
    try {
      if (movement && !query)
        await exportReport({
          title: "حساب الأستاذ — " + selected.name,
          subtitle: `${selected.code} · ${from || "بداية التسجيل"} — ${to || "كل الفترات"} · SAR`,
          headers: ["التاريخ", "رقم القيد", "البيان", "مدين", "دائن", "الرصيد"],
          rows: [
            ["", "", "رصيد أول المدة", "", "", movement.opening / 100],
            ...movement.rows.map((r) => [
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
              movement.debit / 100,
              movement.credit / 100,
              movement.closing / 100,
            ],
          ],
          filename: `ghc-ledger-${selected.code}.xlsx`,
        });
      else
        await exportReport({
          title: "دليل الحسابات",
          subtitle: query
            ? `نتائج البحث: ${search}`
            : selected?.name || "جميع الحسابات الرئيسية",
          headers: [
            "الكود",
            "اسم الحساب",
            "التصنيف",
            "الرصيد المدين",
            "الرصيد الدائن",
          ],
          rows: listed.map((a) => {
            const b = model.balances.get(a.id);
            return [
              a.code,
              a.name,
              types[a.type],
              Math.max(b, 0) / 100,
              Math.max(-b, 0) / 100,
            ];
          }),
          filename: "ghc-chart-of-accounts.xlsx",
        });
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="chart-workspace">
      <div className="chart-toolbar">
        <div className="chart-breadcrumb" aria-label="مسار الحساب">
          <button onClick={() => select(null)}>
            <GitBranch size={16} />
            دليل الحسابات
          </button>
          {path.map((a) => (
            <React.Fragment key={a.id}>
              <ChevronLeft size={14} />
              <button
                onClick={() => select(a)}
                aria-current={a.id === selected?.id ? "page" : undefined}
              >
                {a.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="actions">
          <button
            disabled={exporting || Boolean(periodError)}
            onClick={download}
          >
            <Download size={16} />
            {exporting ? "جاري التصدير…" : "تصدير Excel"}
          </button>
          <button
            disabled={Boolean(periodError)}
            onClick={() => window.print()}
          >
            <Printer size={16} />
            طباعة / PDF
          </button>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="chart-layout">
        <section className={"chart-tree-panel " + (treeOpen ? "is-open" : "")}>
          <button
            className="chart-mobile-toggle"
            aria-expanded={treeOpen}
            onClick={() => setTreeOpen(!treeOpen)}
          >
            <GitBranch size={18} />
            تصفح شجرة الحسابات
            <ChevronDown size={16} />
          </button>
          <div className="chart-tree-body">
            <label className="chart-search">
              <Search size={17} />
              <input
                aria-label="بحث في شجرة الحسابات"
                placeholder="ابحث باسم الحساب أو الكود"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setMenu(null);
                }}
              />
              {search && (
                <button
                  aria-label="مسح بحث الحسابات"
                  onClick={() => setSearch("")}
                >
                  <X size={15} />
                </button>
              )}
            </label>
            <div className="chart-tree-caption">
              <span>شجرة الحسابات</span>
              <button onClick={() => setExpanded(new Set())}>طي الكل</button>
            </div>
            <div
              className="chart-tree"
              role="tree"
              aria-label="تصفح الحسابات"
              ref={tree}
            >
              {(model.children.get("") || []).map((a) => node(a))}
            </div>
          </div>
        </section>
        <section className="chart-content">
          <div className="chart-content-heading">
            <div>
              <span className="chart-account-code">
                {selected
                  ? `#${selected.code} · ${types[selected.type]}`
                  : "دليل الحسابات"}
              </span>
              <h2>
                {query ? "نتائج البحث" : selected?.name || "الحسابات الرئيسية"}
              </h2>
              <p>
                {query
                  ? `${listed.length} نتيجة`
                  : isFolder
                    ? `${children.length} حساب · الأرصدة من القيود المرحّلة`
                    : "حركة الحساب من القيود المرحّلة"}
              </p>
            </div>
            {selected && balance(model.balances.get(selected.id), selected)}
          </div>
          <div className="chart-content-actions">
            {selected && (
              <button onClick={() => select(model.byId.get(selected.parentId))}>
                <ArrowRight size={16} />
                رجوع
              </button>
            )}
            {isFolder || query ? (
              <label className="chart-zero">
                <input
                  type="checkbox"
                  checked={showZero}
                  onChange={(e) => setShowZero(e.target.checked)}
                />
                إظهار الأرصدة الصفرية
              </label>
            ) : (
              <button onClick={() => onLedgerOpen(selected.id)}>
                <BookOpen size={16} />
                حساب الأستاذ الكامل
              </button>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                isFolder ? onAdd(selected) : onNewEntry(selected.id)
              }
            >
              <Plus size={17} />
              {isFolder ? "أضف حساب" : "قيد جديد"}
            </button>
            {selected && (
              <button disabled={busy} onClick={() => onEdit(selected)}>
                <Pencil size={15} />
                تعديل الحساب
              </button>
            )}
          </div>
          {isFolder || query ? (
            <>
              <div className="chart-account-list">
                {listed.map((a) => {
                  const folder = model.children.has(a.id),
                    Icon = folder ? Folder : FileText;
                  return (
                    <div className="chart-account-row" key={a.id}>
                      <button
                        className="chart-account-open"
                        onClick={() => select(a)}
                        aria-label={"فتح حساب " + a.name}
                      >
                        <Icon size={28} />
                        <div>
                          <strong>{a.name}</strong>
                          <small>
                            #{a.code}
                            {query && a.parentId
                              ? " · " + model.byId.get(a.parentId)?.name
                              : ""}
                          </small>
                        </div>
                        {folder && <ChevronLeft size={18} />}
                      </button>
                      {balance(model.balances.get(a.id), a)}
                      <div className="chart-more">
                        <button
                          aria-label={"إجراءات " + a.name}
                          aria-expanded={menu === a.id}
                          onClick={() => setMenu(menu === a.id ? null : a.id)}
                          disabled={busy}
                        >
                          <MoreHorizontal size={20} />
                        </button>
                        {menu === a.id && (
                          <div className="chart-menu">
                            <button
                              onClick={() => {
                                onEdit(a);
                                setMenu(null);
                              }}
                            >
                              <Pencil size={15} />
                              تعديل الحساب
                            </button>
                            <button
                              onClick={() => {
                                onLedgerOpen(a.id);
                                setMenu(null);
                              }}
                            >
                              <BookOpen size={15} />
                              حساب الأستاذ
                            </button>
                            {folder && (
                              <button
                                onClick={() => {
                                  onAdd(a);
                                  setMenu(null);
                                }}
                              >
                                <Plus size={15} />
                                أضف حساب فرعي
                              </button>
                            )}
                            <button
                              className="danger"
                              onClick={() => {
                                onDelete(a);
                                setMenu(null);
                              }}
                            >
                              <Trash2 size={15} />
                              حذف الحساب
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!listed.length && (
                <div className="chart-empty">
                  <Search size={26} />
                  <h3>لا توجد حسابات مطابقة</h3>
                  <p>
                    {query
                      ? "جرّب اسمًا أو كودًا آخر"
                      : "غيّر فلتر الأرصدة لعرض كل الحسابات"}
                  </p>
                </div>
              )}
              <button
                className="chart-add-link"
                disabled={busy}
                onClick={() =>
                  onAdd(isFolder ? selected : model.byId.get(selected.parentId))
                }
              >
                <Plus size={17} />
                أضف حساب
              </button>
            </>
          ) : (
            <>
              <div className="chart-period">
                <label className="field">
                  من تاريخ
                  <input
                    aria-label="حركات الحساب من تاريخ"
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="field">
                  إلى تاريخ
                  <input
                    aria-label="حركات الحساب إلى تاريخ"
                    type="date"
                    min="0001-01-01"
                    max="9999-12-31"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <button
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                >
                  كل الفترات
                </button>
              </div>
              {periodError ? (
                <div className="error" role="alert">
                  {periodError}
                </div>
              ) : (
                <div className="chart-ledger">
                  <div className="chart-print-title">
                    <BrandLogo />
                    <h2>حساب الأستاذ — {selected.name}</h2>
                    <p>
                      {from || "بداية التسجيل"} — {to || "كل الفترات"} · SAR
                    </p>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>التاريخ / القيد</th>
                          <th>البيان</th>
                          <th>مدين</th>
                          <th>دائن</th>
                          <th>الرصيد بعد</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="group-row">
                          <td colSpan="4">رصيد أول المدة</td>
                          <td className="numeric">{money(movement.opening)}</td>
                        </tr>
                        {movement.rows.map((r, i) => (
                          <tr key={r.entryId + "-" + i}>
                            <td>
                              <span className="chart-movement-date">
                                {r.date}
                              </span>
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
                          <td colSpan="2">الإجمالي</td>
                          <td className="numeric">{money(movement.debit)}</td>
                          <td className="numeric">{money(movement.credit)}</td>
                          <td className="numeric">{money(movement.closing)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {!movement.rows.length && (
                    <div className="chart-empty">
                      <BookOpen size={26} />
                      <p>لا توجد حركات مرحّلة خلال الفترة المحددة</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
