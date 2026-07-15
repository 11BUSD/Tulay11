import type { ReactNode } from "react";

/**
 * <AdminPageHeader> — the eyebrow + H1 + sub pattern used on every admin page
 * (see the design mockups' `.page-head`). `actions` render right-aligned.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end gap-4">
      <div>
        {eyebrow ? (
          <div className="text-[11px] font-bold uppercase tracking-widest text-admin">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-admin-ink">
          {title}
        </h1>
        {sub ? <div className="mt-1 text-[13px] text-admin-ink-2">{sub}</div> : null}
      </div>
      {actions ? (
        <div className="ml-auto flex gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
