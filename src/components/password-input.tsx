"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

// Masked by default (type=password), with a show/hide toggle so the user chooses
// whether the text is visible while typing.
export function PasswordInput({
  name,
  id,
  required,
  autoComplete,
  placeholder,
}: {
  name: string;
  id?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={`${inputClass} pr-16`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 px-3.5 text-sm font-medium text-ink-muted transition-colors duration-150 hover:text-ink"
      >
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}
