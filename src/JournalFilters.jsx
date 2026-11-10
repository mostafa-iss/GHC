import React, { useState, useId } from "react";
import { SlidersHorizontal, Search, ChevronDown } from "lucide-react";
import { postingAccounts } from "./accounting";
export const emptyJournalFilter = {
  from: "",
  to: "",
  search: "",
  accountId: "",
  centerId: "",
  number: "",
  source: "",
  status: "",
  minAmount: "",
  maxAmount: "",
  createdFrom: "",
  createdTo: "",
};
export default function JournalFilters({ filter, setFilter, data }) {
  const [advanced, setAdvanced] = useState(false);
  const [period, setPeriod] = useState("all");
  const [expanded, setExpanded] = useState(
    () => !window.matchMedia("(max-width: 760px)").matches,
  );
  const bodyId = useId();
  const activeCount = Object.values(filter).filter(
    (value) => value !== "" && value != null,
  ).length;
  const set = (k, v) => setFilter({ ...filter, [k]: v });
  function dates(p) {
    setPeriod(p);
    const d = new Date(),
      y = d.getFullYear(),
      m = String(d.getMonth() + 1).padStart(2, "0"),
      today = `${y}-${m}-${String(d.getDate()).padStart(2, "0")}`;
    if (p === "all") setFilter({ ...filter, from: "", to: "" });
    if (p === "today") setFilter({ ...filter, from: today, to: today });
    if (p === "month")
      setFilter({ ...filter, from: `${y}-${m}-01`, to: today });
    if (p === "year") setFilter({ ...filter, from: `${y}-01-01`, to: today });
  }
  return (
    <section className="journal-filters">
      <button
        type="button"
        className="journal-panel-label"
        aria-label="بحث وتصفية القيود"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded(!expanded)}
      >
        <Search size={18} /> بحث وتصفية{" "}
        <small>
          {activeCount
            ? `${activeCount} فلاتر مفعّلة`
            : "كل القيود في مكان واحد"}
        </small>
        <ChevronDown
          size={17}
          className={expanded ? "filter-chevron expanded" : "filter-chevron"}
        />
      </button>
      <div id={bodyId} hidden={!expanded}>
        <div className="journal-filter-fields">
          <label>
            الحساب
            <select
              aria-label="تصفية القيود بالحساب"
              value={filter.accountId || ""}
              onChange={(e) => set("accountId", e.target.value)}
            >
              <option value="">أي حساب</option>
              {postingAccounts(data.accounts).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            الوصف
            <input
              aria-label="بحث بعنوان القيد"
              value={filter.search || ""}
              placeholder="اكتب أي كلمة أو حروف من عنوان القيد"
              onChange={(e) => set("search", e.target.value)}
            />
          </label>
          <label>
            التاريخ
            <div className="journal-date-range">
              <select
                aria-label="فترة القيود"
                value={period}
                onChange={(e) => dates(e.target.value)}
              >
                <option value="all">كل الفترات</option>
                <option value="today">اليوم</option>
                <option value="month">الشهر الحالي</option>
                <option value="year">السنة الحالية</option>
                <option value="custom">تخصيص</option>
              </select>
              <input
                aria-label="القيود من تاريخ"
                type="date"
                value={filter.from || ""}
                onChange={(e) => {
                  setPeriod("custom");
                  set("from", e.target.value);
                }}
              />
              <span>—</span>
              <input
                aria-label="القيود إلى تاريخ"
                type="date"
                value={filter.to || ""}
                onChange={(e) => {
                  setPeriod("custom");
                  set("to", e.target.value);
                }}
              />
            </div>
          </label>
          <label>
            المصدر
            <select
              aria-label="مصدر القيد"
              value={filter.source || ""}
              onChange={(e) => set("source", e.target.value)}
            >
              <option value="">أي مصدر</option>
              <option value="manual">إدخال يدوي</option>
              <option value="excel">استيراد Excel</option>
            </select>
          </label>
          <label>
            رقم
            <input
              aria-label="رقم القيد"
              value={filter.number || ""}
              onChange={(e) => set("number", e.target.value)}
            />
          </label>
          <label>
            حالة القيد
            <select
              aria-label="حالة القيد"
              value={filter.status || ""}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="">الكل</option>
              <option value="posted">مرحّل</option>
              <option value="draft">مسودة</option>
            </select>
          </label>
          {advanced && (
            <>
              <label>
                المبلغ أكبر من
                <input
                  aria-label="المبلغ أكبر من"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filter.minAmount || ""}
                  onChange={(e) => set("minAmount", e.target.value)}
                />
              </label>
              <label>
                المبلغ أقل من
                <input
                  aria-label="المبلغ أقل من"
                  type="number"
                  min="0"
                  step="0.01"
                  value={filter.maxAmount || ""}
                  onChange={(e) => set("maxAmount", e.target.value)}
                />
              </label>
              <label>
                مركز التكلفة
                <select
                  aria-label="مركز تكلفة القيود"
                  value={filter.centerId || ""}
                  onChange={(e) => set("centerId", e.target.value)}
                >
                  <option value="">كل المراكز</option>
                  {data.centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                تاريخ الإنشاء من
                <input
                  aria-label="تاريخ الإنشاء من"
                  type="date"
                  value={filter.createdFrom || ""}
                  onChange={(e) => set("createdFrom", e.target.value)}
                />
              </label>
              <label>
                تاريخ الإنشاء إلى
                <input
                  aria-label="تاريخ الإنشاء إلى"
                  type="date"
                  value={filter.createdTo || ""}
                  onChange={(e) => set("createdTo", e.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <div className="journal-filter-actions">
          <button
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
          >
            <SlidersHorizontal size={16} />
            بحث متقدم
          </button>
          <div>
            <span className="live-filter-hint">
              تتحدث النتائج أثناء الكتابة
            </span>
            <button
              disabled={!activeCount}
              onClick={() => {
                setFilter({ ...emptyJournalFilter });
                setPeriod("all");
              }}
            >
              إلغاء الفلتر
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
