import { mergeDocuments, entryDocuments } from "./documents.js";
import { brandedWorkbook, addReportTable, saveWorkbook } from "./exports.js";
import { types, validateEntry } from "./accounting.js";
export const normalizeName = (value) =>
  String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const groups = [
  ["11", "الأصول المتداولة", "asset", "1"],
  ["111", "النقدية والبنوك والمحافظ", "asset", "11"],
  ["112", "العهد والمدفوعات للغير", "asset", "11"],
  ["113", "المصروفات المدفوعة مقدمًا", "asset", "11"],
  ["12", "الأصول غير المتداولة", "asset", "1"],
  ["121", "البرامج والأنظمة", "asset", "12"],
  ["122", "المكتبات والتجهيزات", "asset", "12"],
  ["129", "مجمعات الإهلاك", "asset", "12"],
  ["21", "الالتزامات المتداولة", "liability", "2"],
  ["211", "مصروفات مستحقة الدفع", "liability", "21"],
  ["212", "حسابات جارية لأطراف أخرى", "liability", "21"],
  ["31", "رأس المال", "equity", "3"],
  ["311", "حسابات رأس المال", "equity", "31"],
  ["32", "جاري الشركاء", "equity", "3"],
  ["321", "حسابات الشركاء", "equity", "32"],
  ["33", "الأرباح والخسائر المحتجزة", "equity", "3"],
  ["331", "نتائج السنوات السابقة", "equity", "33"],
  ["34", "المسحوبات والتوزيعات", "equity", "3"],
  ["341", "توزيعات الشركاء", "equity", "34"],
  ["41", "إيرادات النشاط", "revenue", "4"],
  ["411", "إيرادات التعليم", "revenue", "41"],
  ["42", "إيرادات أخرى", "revenue", "4"],
  ["421", "فروق العملة الدائنة", "revenue", "42"],
  ["51", "تكاليف العاملين", "expense", "5"],
  ["511", "الأجور والرواتب", "expense", "51"],
  ["512", "المكافآت", "expense", "51"],
  ["52", "التسويق", "expense", "5"],
  ["521", "الإعلان والتسويق", "expense", "52"],
  ["53", "المصروفات الإدارية", "expense", "5"],
  ["531", "الرسوم الحكومية", "expense", "53"],
  ["532", "الاشتراكات والأنظمة", "expense", "53"],
  ["533", "المصروفات الإدارية الأخرى", "expense", "53"],
  ["54", "المصروفات المالية", "expense", "5"],
  ["541", "الرسوم والعمولات البنكية", "expense", "54"],
  ["55", "الإهلاك والاستهلاك", "expense", "5"],
  ["551", "مصروف الإهلاك", "expense", "55"],
  ["56", "مصروفات أخرى", "expense", "5"],
  ["561", "التعويضات", "expense", "56"],
];
export function classifyAccount(name) {
  const n = normalizeName(name);
  if (/مجمع.*اهلاك/.test(n))
    return {
      group: "129",
      normalBalance: "credit",
      note: "أصل مقابل ذو طبيعة دائنة؛ لا يُصنّف التزامًا",
    };
  if (/مستحق.*الدفع/.test(n)) return { group: "211", normalBalance: "credit" };
  if (/جاري.*(مركز|اكاديمي)/.test(n))
    return {
      group: "212",
      normalBalance: "credit",
      note: "حساب تسويات لأموال أطراف أخرى؛ راجع التصنيف إذا كان يمثل قرضًا مستحقًا للنشاط",
    };
  if (/جاري.*شريك/.test(n)) return { group: "321", normalBalance: "credit" };
  if (/توزيعات|مسحوبات/.test(n))
    return {
      group: "341",
      normalBalance: "debit",
      note: "مسحوبات ضمن حقوق الملكية، وليست مصروفًا",
    };
  if (/راس المال/.test(n)) return { group: "311", normalBalance: "credit" };
  if (/ارباح.*مرحله|ارباح.*مرحلة|خسائر.*مرحله|خسائر.*مرحلة/.test(n))
    return { group: "331", normalBalance: "credit" };
  if (/ايرادات.*فروق|فروق.*عمله/.test(n))
    return { group: "421", normalBalance: "credit" };
  if (/ايراد/.test(n)) return { group: "411", normalBalance: "credit" };
  if (/عمولات|رسوم.*بنكي/.test(n))
    return { group: "541", normalBalance: "debit" };
  if (/بنك|paypal|باي بال|صندوق|خزينه/.test(n))
    return { group: "111", normalBalance: "debit" };
  if (/مدفوع.*مقدم/.test(n)) return { group: "113", normalBalance: "debit" };
  if (/عهده|عهدة|مدفوعات للغير/.test(n))
    return { group: "112", normalBalance: "debit" };
  if (/سيستم/.test(n))
    return {
      group: "121",
      normalBalance: "debit",
      note: "تكلفة نظام مرسملة؛ اشتراكات التشغيل تُدرج بالمصروفات",
    };
  if (/مكتبه|مكتبة/.test(n))
    return {
      group: "122",
      normalBalance: "debit",
      note: "تجهيز مكتبة كأصل؛ يمكن تعديله قبل الاستيراد إذا كانت سياسة النشاط تحمل التكلفة كمصروف",
    };
  if (/رواتب|اجور/.test(n)) return { group: "511", normalBalance: "debit" };
  if (/مكاف/.test(n)) return { group: "512", normalBalance: "debit" };
  if (/اعلان|تسويق/.test(n)) return { group: "521", normalBalance: "debit" };
  if (/حكومي/.test(n)) return { group: "531", normalBalance: "debit" };
  if (/اشتراك|انظمه|انظمة/.test(n))
    return { group: "532", normalBalance: "debit" };
  if (/هداي|هدايا|مصروفات.*اداري/.test(n))
    return { group: "533", normalBalance: "debit" };
  if (/اهلاك/.test(n)) return { group: "551", normalBalance: "debit" };
  if (/تعويض/.test(n)) return { group: "561", normalBalance: "debit" };
  return { group: "", normalBalance: "", note: "يتطلب اختيار تصنيف قبل الحفظ" };
}
export const accountGroups = groups.map(([code, name, type]) => ({
  code,
  name,
  type,
}));
export function chartPlan(names, data, overrides = {}) {
  const accounts = data.accounts.map((a) => ({ ...a })),
    issues = [],
    items = [],
    byCode = new Map(accounts.map((a) => [a.code, a]));
  const usedIds = new Set(accounts.map((a) => a.id));
  const idFor = (code) => {
    let id = "chart-" + code;
    while (usedIds.has(id)) id += "x";
    usedIds.add(id);
    return id;
  };
  const roots = {};
  Object.entries(types).forEach(([type, name], i) => {
    let a = accounts.find(
      (a) => a.type === type && !a.parentId && a.code === String(i + 1),
    );
    if (!a) {
      const code = String(i + 1);
      if (byCode.has(code)) {
        issues.push("كود الحساب الرئيسي " + code + " مستخدم بالفعل");
        return;
      }
      a = { id: idFor(code), code, name, type, parentId: "" };
      accounts.push(a);
      byCode.set(code, a);
    }
    roots[type] = a;
  });
  function ensure(code) {
    if (code.length === 1)
      return Object.values(roots).find((a) => a?.code === code);
    const def = groups.find((g) => g[0] === code);
    if (!def) return null;
    const [, name, type, parentCode] = def;
    const p = ensure(parentCode);
    if (!p) return null;
    const existing = byCode.get(code);
    if (existing) {
      if (
        existing.type !== type ||
        existing.parentId !== p.id ||
        data.entries.some((e) =>
          e.lines.some((l) => l.accountId === existing.id),
        )
      ) {
        issues.push(
          "كود المجموعة " + code + " مستخدم بحساب مختلف أو عليه حركات",
        );
        return null;
      }
      return existing;
    }
    const a = {
      id: idFor(code),
      code,
      name,
      type,
      parentId: p.id,
      normalBalance:
        code === "129"
          ? "credit"
          : ["34", "341"].includes(code)
            ? "debit"
            : ["asset", "expense"].includes(type)
              ? "debit"
              : "credit",
    };
    accounts.push(a);
    byCode.set(code, a);
    return a;
  }
  const unique = [
    ...new Map(
      names
        .filter(Boolean)
        .map((n) => [normalizeName(n), String(n).replace(/\s+/g, " ").trim()]),
    ).values(),
  ];
  for (const name of unique) {
    const inferred = classifyAccount(name);
    const choice = { ...inferred, ...overrides[normalizeName(name)] };
    const matches = data.accounts.filter(
      (a) => normalizeName(a.name) === normalizeName(name),
    );
    // Root/group labels must not be reused as posting accounts.
    const usable = matches.filter(
      (a) => a.parentId && !data.accounts.some((x) => x.parentId === a.id),
    );
    if (usable.length > 1) {
      issues.push("اسم الحساب مكرر في الشجرة: " + name);
      continue;
    }
    const existing = usable[0];
    const def = groups.find((g) => g[0] === choice.group);
    if (
      def &&
      overrides[normalizeName(name)]?.group &&
      choice.group !== inferred.group
    )
      choice.normalBalance =
        choice.group === "129"
          ? "credit"
          : ["asset", "expense"].includes(def[2])
            ? "debit"
            : "credit";
    if (!def) {
      issues.push("حدد تصنيف الحساب: " + name);
      items.push({ name, ...choice });
      continue;
    }
    if (existing && existing.type !== def[2]) {
      issues.push("تصنيف الحساب الموجود يختلف عن المقترح: " + name);
      continue;
    }
    const parent = ensure(choice.group);
    if (!parent) continue;
    if (
      existing &&
      (data.entries.some((e) =>
        e.lines.some((l) => l.accountId === existing.id),
      ) ||
        existing.parentId === parent.id)
    ) {
      items.push({
        ...existing,
        ...choice,
        normalBalance: existing.normalBalance || choice.normalBalance,
        status: "existing",
      });
      continue;
    }
    let n = 1,
      code;
    do {
      code = choice.group + String(n++).padStart(3, "0");
    } while (byCode.has(code));
    const a = {
      id: existing?.id || idFor(code),
      code,
      name,
      type: def[2],
      parentId: parent.id,
      normalBalance:
        choice.normalBalance ||
        (["asset", "expense"].includes(def[2]) ? "debit" : "credit"),
    };
    if (existing) {
      const i = accounts.findIndex((x) => x.id === existing.id);
      accounts[i] = a;
      byCode.delete(existing.code);
    } else accounts.push(a);
    byCode.set(code, a);
    items.push({ ...a, ...choice, status: existing ? "existing" : "new" });
  }
  return {
    accounts,
    items,
    issues: [...new Set(issues)],
    added: accounts.length - data.accounts.length,
  };
}
function cellValue(cell) {
  const v = cell?.value;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("formula" in v || "sharedFormula" in v) return v.result ?? null;
    if ("text" in v) return v.text;
    if (v.richText) return v.richText.map((x) => x.text).join("");
    if (v.error) throw Error("خطأ في خلية Excel: " + v.error);
  }
  return v ?? null;
}
export async function readWorkbook(input) {
  if (input.size > 5 * 1024 * 1024)
    throw Error("حجم ملف Excel يجب ألا يتجاوز 5 ميجابايت");
  const mod = await import("exceljs");
  const ExcelJS = mod.default || mod;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await input.arrayBuffer());
  const sheets = {};
  for (const sheet of book.worksheets) {
    if (sheet.rowCount > 25000 || sheet.columnCount > 100)
      throw Error("الملف أكبر من حدود الاستيراد (25000 صف و100 عمود لكل ورقة)");
    const rows = [];
    sheet.eachRow({ includeEmpty: true }, (row, n) => {
      rows[n - 1] = Array.from(
        { length: Math.min(sheet.columnCount, 100) },
        (_, i) => cellValue(row.getCell(i + 1)),
      );
      rows[n - 1].hyperlinks = Array.from(
        { length: Math.min(sheet.columnCount, 100) },
        (_, i) => {
          const c = row.getCell(i + 1);
          if (c.hyperlink) return c.hyperlink;
          const formula = c.value?.formula;
          const match =
            typeof formula === "string" &&
            /^HYPERLINK\(\s*"((?:[^"]|"")*)"/i.exec(formula);
          return match ? match[1].replaceAll('""', '"') : null;
        },
      );
    });
    sheets[sheet.name] = rows;
  }
  return sheets;
}
export function extractWorkbook(sheets) {
  const directory = Object.entries(sheets).find(
    ([name]) => normalizeName(name) === "دليل الحسابات",
  );
  const journal = Object.entries(sheets).find(([, rows]) =>
    rows.some(
      (row) =>
        row?.some((c) => normalizeName(c) === "اسم الحساب") &&
        row.some((c) => normalizeName(c) === "مدين") &&
        row.some((c) => normalizeName(c) === "دائن"),
    ),
  );
  if (!journal)
    throw Error(
      "لم أجد جدول اليومية بعناوين: اسم الحساب، مدين، دائن، تاريخ، بيان، رقم القيد",
    );
  const [sheetName, allRows] = journal;
  const headerIndex = allRows.findIndex(
    (row) =>
      row?.some((c) => normalizeName(c) === "اسم الحساب") &&
      row.some((c) => normalizeName(c) === "مدين"),
  );
  const header = allRows[headerIndex].map(normalizeName);
  const col = (...names) =>
    header.findIndex((c) => names.map(normalizeName).includes(c));
  const cols = {
    debit: col("مدين"),
    credit: col("دائن"),
    account: col("اسم الحساب"),
    date: col("تاريخ", "التاريخ"),
    description: header.findIndex(
      (c) => c.replace(/[^\p{L}]/gu, "") === "بيان",
    ),
    number: col("رقم القيد"),
    currency: col("نوع العملة", "العملة"),
    reference: col("مرجع/فاتورة", "المرجع"),
    notes: col("ملاحظات"),
    center: col("مركز التكلفة"),
  };
  if (cols.date < 0) throw Error("عمود التاريخ مطلوب");
  const rows = allRows.slice(headerIndex + 1).map((values, i) => ({
    row: i + headerIndex + 2,
    documentLinks: mergeDocuments(
      [
        values?.hyperlinks?.[cols.reference],
        typeof values?.[cols.reference] === "string" &&
        /^https:\/\//i.test(values[cols.reference])
          ? values[cols.reference]
          : null,
      ].filter(Boolean),
    ),
    ...Object.fromEntries(
      Object.entries(cols).map(([key, j]) => [
        key,
        j < 0 ? null : (values?.[j] ?? null),
      ]),
    ),
  }));
  const names = directory
    ? directory[1]
        .slice(1)
        .map((r) => r?.[1])
        .filter((v) => typeof v === "string" && v.trim())
    : [];
  for (const r of rows) if (r.account) names.push(String(r.account));
  return { sheetName, rows, names };
}
function dateString(v) {
  if (v instanceof Date && !isNaN(v)) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const n = v.trim();
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(n) &&
      new Date(n + "T00:00:00Z").toISOString().slice(0, 10) === n
    )
      return n;
    const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(n);
    if (m)
      return dateString(
        `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`,
      );
  }
  throw Error("تاريخ مفقود أو غير صالح");
}
function amount(v) {
  if (v == null || v === "") return { raw: 0, cents: 0, rounded: false };
  const str = typeof v === "string" ? v.replace(/,/g, "").trim() : String(v);
  if (!/^\d+(\.\d+)?$/.test(str)) throw Error("مبلغ غير صالح أو سالب");
  const n = Number(str);
  if (!Number.isFinite(n) || !Number.isSafeInteger(Math.round(n * 100)))
    throw Error("المبلغ أكبر من الحد المسموح");
  const c = Math.round((n + Number.EPSILON) * 100);
  return { raw: n, cents: c, rounded: Math.abs(c / 100 - n) > 1e-8 };
}
async function digest(v) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function importPlan(extracted, data, overrides = {}) {
  const chart = chartPlan(extracted.names, data, overrides),
    groupsOut = [],
    groupsPending = [];
  let pending = [],
    rawBalance = 0,
    integerBalance = 0,
    explicit = "";
  function flush() {
    if (pending.length) groupsPending.push(pending);
    pending = [];
    rawBalance = 0;
    integerBalance = 0;
    explicit = "";
  }
  for (const row of extracted.rows) {
    if (
      ![
        row.debit,
        row.credit,
        row.account,
        row.description,
        row.number,
        row.reference,
        row.date,
        row.notes,
        row.center,
      ].some((v) => v !== null && v !== "")
    ) {
      flush();
      continue;
    }
    if (row.number != null && explicit && String(row.number) !== explicit)
      flush();
    if (row.number == null && explicit) flush();
    if (row.number != null) explicit = String(row.number);
    let parsed;
    try {
      const d = amount(row.debit),
        c = amount(row.credit);
      parsed = { ...row, d, c, dateValue: dateString(row.date) };
      if (!d.cents && !c.cents)
        throw Error("السطر يحتوي حسابًا أو بيانًا ولكن بلا مبالغ");
      if (d.cents && c.cents) throw Error("السطر يحتوي مدينًا ودائنًا معًا");
      if (!row.account) throw Error("اسم الحساب مفقود");
      if (
        row.currency &&
        !["ريال سعودي", "sar", "ر.س", "ريال"].includes(
          normalizeName(row.currency),
        )
      )
        throw Error("العملة يجب أن تكون الريال السعودي");
    } catch (e) {
      flush();
      groupsPending.push([{ ...row, error: e.message }]);
      continue;
    }
    pending.push(parsed);
    rawBalance += parsed.d.raw - parsed.c.raw;
    integerBalance += parsed.d.cents - parsed.c.cents;
    if (
      !explicit &&
      (integerBalance === 0 || Math.abs(rawBalance) < 0.005 - 1e-9)
    )
      flush();
  }
  flush();
  const occurrence = new Map();
  const existingKeys = new Set(
    data.entries.map((e) => e.importKey).filter(Boolean),
  );
  for (const group of groupsPending) {
    const errors = group.filter((r) => r.error).map((r) => r.error),
      warnings = [];
    const sourceRows = group.map((r) => r.row);
    let date = "",
      lines = [],
      entry = null,
      key = "";
    if (!errors.length) {
      const dates = [...new Set(group.map((r) => r.dateValue))];
      date = dates[0];
      if (dates.length !== 1)
        errors.push("أطراف القيد تحمل تواريخ مختلفة؛ صححها في Excel");
      if (group.some((r) => r.d.rounded || r.c.rounded))
        warnings.push(
          "تم تقريب مبالغ Excel إلى منزلتين عشريتين مع الاحتفاظ بالقيم الأصلية",
        );
      lines = group.map((r) => {
        const matches = chart.items.filter(
          (a) => normalizeName(a.name) === normalizeName(r.account),
        );
        const a = matches[0];
        if (!a?.id) errors.push("حساب يحتاج تصنيفًا: " + r.account);
        const center = r.center
          ? data.centers.filter(
              (c) => normalizeName(c.name) === normalizeName(r.center),
            )
          : [];
        if (r.center && center.length !== 1)
          errors.push("مركز تكلفة غير معروف أو مكرر: " + r.center);
        return {
          accountId: a?.id || "",
          centerId: center[0]?.id || "",
          description: String(r.description ?? "").trim(),
          debit: r.d.cents,
          credit: r.c.cents,
          documentLinks: r.documentLinks || [],
          reference: String(r.reference ?? ""),
          notes: String(r.notes ?? ""),
          sourceRow: r.row,
          sourceDebit: r.debit ?? "",
          sourceCredit: r.credit ?? "",
        };
      });
      entry = {
        id: "",
        date,
        description: [
          ...new Set(lines.map((l) => l.description).filter(Boolean)),
        ].join(" / "),
        lines,
        attachments: [],
        documentLinks: mergeDocuments(...lines.map((l) => l.documentLinks)),
        sourceRows,
        sourceSheet: extracted.sheetName,
        sourceNumber: String(group[0].number ?? ""),
        currency: "SAR",
      };
      try {
        validateEntry(entry, chart.accounts, data.centers);
      } catch (e) {
        errors.push(e.message);
      }
      const canonical = JSON.stringify({
        date,
        lines: group
          .map((r, i) => [
            normalizeName(r.account),
            lines[i].debit,
            lines[i].credit,
            normalizeName(lines[i].description),
            normalizeName(r.center),
          ])
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      });
      const hash = await digest(canonical);
      const count = (occurrence.get(hash) || 0) + 1;
      occurrence.set(hash, count);
      key = `excel-v1:${hash}:${count}`;
      entry.importKey = key;
    }
    groupsOut.push({
      entry,
      key,
      rows: sourceRows,
      errors: [...new Set(errors)],
      warnings,
      status: errors.length
        ? "error"
        : existingKeys.has(key)
          ? "duplicate"
          : "ready",
      debit: lines.reduce((s, l) => s + l.debit, 0),
      credit: lines.reduce((s, l) => s + l.credit, 0),
    });
  }
  return {
    chart,
    groups: groupsOut,
    ready: groupsOut.filter((g) => g.status === "ready"),
    errors: groupsOut.filter((g) => g.status === "error"),
    duplicates: groupsOut.filter((g) => g.status === "duplicate"),
    warnings: groupsOut.filter((g) => g.warnings.length),
    linked: groupsOut.filter((g) => g.entry?.documentLinks?.length),
    linkUpdates: groupsOut.filter((g) => {
      if (g.status !== "duplicate") return false;
      const existing = data.entries.find((e) => e.importKey === g.key);
      const current = entryDocuments(
        existing,
        data.entryDocuments?.[existing.id],
      );
      return (
        mergeDocuments(current, g.entry?.documentLinks).length > current.length
      );
    }),
  };
}
export function applyImport(
  plan,
  data,
  { accountsOnly = false, allowPartial = false, fileName = "" } = {},
) {
  if (plan.chart.issues.length) throw Error(plan.chart.issues.join("؛ "));
  if (!accountsOnly && plan.errors.length && !allowPartial)
    throw Error(
      "راجع الصفوف غير الصالحة أو اختر صراحةً استيراد القيود السليمة فقط",
    );
  let n = Math.max(0, ...data.entries.map((e) => e.number));
  const seen = new Set(data.entries.map((e) => e.importKey));
  const entries = [];
  if (!accountsOnly)
    for (const g of plan.ready) {
      if (seen.has(g.key)) continue;
      const e = {
        ...g.entry,
        id: crypto.randomUUID(),
        number: ++n,
        sourceFile: fileName,
        createdAt: new Date().toISOString(),
      };
      validateEntry(e, plan.chart.accounts, data.centers);
      entries.push(e);
      seen.add(g.key);
    }
  const entryDocumentsMap = { ...(data.entryDocuments || {}) };
  if (!accountsOnly)
    for (const g of plan.linkUpdates || []) {
      const existing = data.entries.find((e) => e.importKey === g.key);
      entryDocumentsMap[existing.id] = mergeDocuments(
        entryDocuments(existing, entryDocumentsMap[existing.id]),
        g.entry.documentLinks,
      );
    }
  return {
    ...data,
    ...(Object.keys(entryDocumentsMap).length
      ? { entryDocuments: entryDocumentsMap }
      : {}),
    accounts: plan.chart.accounts,
    entries: [...data.entries, ...entries],
  };
}
export async function downloadChart(plan) {
  const { book, sheet } = await brandedWorkbook({
    title: "شجرة الحسابات",
    subtitle: "دليل الحسابات والتصنيف والطبيعة المحاسبية",
  });
  addReportTable(
    sheet,
    ["الكود", "الحساب", "التصنيف", "الحساب الرئيسي", "الطبيعة"],
    plan.chart.accounts.map((a) => [
      a.code,
      a.name,
      types[a.type],
      plan.chart.accounts.find((x) => x.id === a.parentId)?.name || "",
      (a.normalBalance ||
        (["asset", "expense"].includes(a.type) ? "debit" : "credit")) ===
      "debit"
        ? "مدين"
        : "دائن",
    ]),
  );
  await saveWorkbook(book, "شجرة الحسابات المكودة.xlsx");
}
