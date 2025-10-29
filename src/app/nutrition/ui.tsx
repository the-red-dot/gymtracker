// gym-tracker-app\src\app\nutrition\ui.tsx

'use client';

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background">
      <div className="p-4 md:p-6 border-b border-black/10 dark:border-white/10">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{subtitle}</p>}
      </div>
      <div className="p-4 md:p-6">{children}</div>
    </section>
  );
}

export function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="opacity-70">{k}</span>
      <span className="font-medium">{v || '-'}</span>
    </div>
  );
}
export function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-semibold whitespace-nowrap">{children}</th>;
}
export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 whitespace-nowrap ${className}`}>{children}</td>;
}

export function DateTimeField({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-sm">{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-lg border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right
                   focus-visible:outline-none focus:ring-2 focus:ring-foreground/40"
      />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-sm">{label}</span>
      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-lg border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right
                   focus-visible:outline-none focus:ring-2 focus:ring-foreground/40"
      />
    </label>
  );
}

export function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      inputMode="decimal"
      type="number"
      step="0.01"
      value={Number.isFinite(value) ? String(value) : ''}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-24 rounded border border-black/10 dark:border-white/20 bg-transparent px-2 py-1 text-right"
    />
  );
}
