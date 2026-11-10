import React from "react";
export default function AccountChip({ accountId, label, onOpen }) {
  return (
    <button
      type="button"
      className="account-chip"
      disabled={!accountId || !onOpen}
      title={"عرض حساب الأستاذ الكامل — " + label}
      aria-label={"حساب الأستاذ: " + label}
      onClick={() => onOpen(accountId)}
    >
      {label}
    </button>
  );
}
