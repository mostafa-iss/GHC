import React from "react";
import { ArrowUpDown } from "lucide-react";
export default function JournalSort({ sort, onChange }) {
  const numeric = sort.field === "number";
  return (
    <section className="journal-sort-controls" aria-label="ترتيب القيود">
      <div className="journal-sort-fields">
        <span className="journal-sort-label">
          <ArrowUpDown size={17} />
          ترتيب القيود
        </span>
        <label>
          ترتيب حسب
          <select
            aria-label="ترتيب القيود حسب"
            value={sort.field}
            onChange={(e) => onChange({ ...sort, field: e.target.value })}
          >
            <option value="date">تاريخ القيد</option>
            <option value="createdAt">تاريخ إنشاء القيد</option>
            <option value="number">رقم القيد</option>
          </select>
        </label>
        <label>
          الاتجاه
          <select
            aria-label="اتجاه ترتيب القيود"
            value={sort.direction}
            onChange={(e) => onChange({ ...sort, direction: e.target.value })}
          >
            <option value="desc">
              تنازلي — {numeric ? "الأكبر أولًا" : "الأحدث أولًا"}
            </option>
            <option value="asc">
              تصاعدي — {numeric ? "الأصغر أولًا" : "الأقدم أولًا"}
            </option>
          </select>
        </label>
      </div>
      <p>
        {sort.field === "createdAt"
          ? "تاريخ الإنشاء غير المسجل يظهر في النهاية. الأوقات المعروضة بتوقيت القاهرة."
          : numeric
            ? "تُرتّب المسودات برقم المسودة الخاص بها."
            : "الترتيب حسب التاريخ المحاسبي المُدخل للقيد."}{" "}
        ترتيب العرض لا يغير أرقام القيود أو تواريخها.
      </p>
    </section>
  );
}
