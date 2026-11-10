import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import { normalizeSearch } from "./journals.js";

export default function AccountSelect({
  accounts,
  value,
  onChange,
  id,
  label = "الحساب",
  disabled = false,
  allowEmpty = false,
}) {
  const listId = useId(),
    input = useRef(null),
    popup = useRef(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    [position, setPosition] = useState({});
  const selected = accounts.find((a) => a.id === value);
  const options = useMemo(() => {
    const found = accounts.filter((a) =>
      normalizeSearch(`${a.code} ${a.name}`).includes(normalizeSearch(query)),
    );
    return allowEmpty
      ? [{ id: "", code: "", name: "بدون حساب مرتبط" }, ...found]
      : found;
  }, [accounts, query, allowEmpty]);
  function show() {
    const r = input.current.getBoundingClientRect(),
      height = Math.min(280, window.innerHeight - 24);
    const below = window.innerHeight - r.bottom;
    setPosition({
      position: "fixed",
      width: Math.min(Math.max(r.width, 280), window.innerWidth - 24),
      right: Math.max(12, window.innerWidth - r.right),
      ...(below > 180
        ? { top: r.bottom + 6, maxHeight: Math.min(height, below - 18) }
        : {
            bottom: window.innerHeight - r.top + 6,
            maxHeight: Math.min(height, r.top - 18),
          }),
    });
    setOpen(true);
    setActive(0);
  }
  function choose(a) {
    onChange(a.id);
    setOpen(false);
    setQuery("");
    input.current.focus();
  }
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (
        !input.current?.parentElement.contains(e.target) &&
        !popup.current?.contains(e.target)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    const scroll = (e) => {
      if (!popup.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("resize", scroll);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", scroll);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      popup.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  return (
    <div className="account-select">
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && options[active] ? `${listId}-${active}` : undefined
        }
        autoComplete="off"
        disabled={disabled}
        value={
          open ? query : selected ? `${selected.code} — ${selected.name}` : ""
        }
        placeholder="ابحث باسم الحساب أو الكود…"
        onFocus={(e) => e.target.select()}
        onClick={() => {
          setQuery("");
          show();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) show();
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onKeyDown={(e) => {
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            if (!open) {
              setQuery("");
              show();
            } else
              setActive((i) =>
                Math.max(
                  0,
                  Math.min(
                    options.length - 1,
                    i + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
          }
          if (e.key === "Enter" && open) {
            e.preventDefault();
            if (options[active]) choose(options[active]);
          }
          if (e.key === "Escape" && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setQuery("");
          }
        }}
      />
      <ChevronDown size={16} />
      {open &&
        createPortal(
          <div
            ref={popup}
            id={listId}
            role="listbox"
            aria-label="الحسابات المطابقة"
            className="account-options"
            style={position}
          >
            <div className="account-option-hint">
              <Search size={14} /> {options.length} حساب · ↑ ↓ للتنقّل
            </div>
            {options.map((a, i) => (
              <div
                key={a.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="account-option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(a);
                }}
              >
                <b>{a.code}</b>
                <span>{a.name}</span>
              </div>
            ))}
            {!options.length && (
              <p className="empty-option">لا يوجد حساب مطابق</p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
