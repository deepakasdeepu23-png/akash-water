import { useEffect, useState } from 'react';

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function TextInput({ label, hint, value, onChange, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

export function Bottle() {
  return (
    <svg viewBox="0 0 100 120" aria-hidden="true">
      <rect x="42" y="5" width="16" height="10" rx="2" fill="var(--accent)" opacity=".85" />
      <path d="M42 15H58V25C58 28 65 32 75 38C80 41 82 45 82 50V105C82 112 76 118 70 118H30C24 118 18 112 18 105V50C18 45 20 41 25 38C35 32 42 28 42 25Z" fill="var(--accent)" opacity=".8" />
      <path d="M18 70Q35 60 50 70T82 70V105C82 112 76 118 70 118H30C24 118 18 112 18 105Z" fill="var(--accent)" />
      <path d="M18 75Q35 85 50 75T82 75" stroke="#fff" strokeWidth="2.5" fill="none" opacity=".6" />
    </svg>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.bad ? 'bad' : ''}`} role="status">{toast.text}</div>;
}

// Small helper for pages that show a short success/failure message
export function useToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  return [toast, (text, bad = false) => setToast({ text, bad })];
}
