"use client";
import React from "react";

// ---- Badge ----
type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger" | "outline";
const BADGE_CLS: Record<BadgeVariant, string> = {
  default: "bg-ink/10 text-ink",
  accent: "bg-accent text-white",
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  outline: "border border-ink/20 text-ink/70",
};
export function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE_CLS[variant]}`}>
      {children}
    </span>
  );
}

// ---- Button ----
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
const BUTTON_CLS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent/90 disabled:opacity-50",
  secondary: "bg-ink/10 text-ink hover:bg-ink/15 disabled:opacity-50",
  ghost: "bg-transparent text-ink hover:bg-ink/5 disabled:opacity-50",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50",
};
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}
export function Button({ variant = "primary", loading, children, className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${BUTTON_CLS[variant]} ${className}`}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

// ---- Spinner ----
export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-3 w-3" : size === "lg" ? "h-8 w-8" : "h-5 w-5";
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${s}`} aria-label="loading" />;
}

// ---- Card ----
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-ink/10 bg-white shadow-sm ${className}`}>{children}</div>
  );
}
export function CardHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border-b border-ink/10 px-5 py-4 ${className}`}>{children}</div>;
}
export function CardBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

// ---- EmptyState ----
export function EmptyState({ icon = "📭", title, description, action }: {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-ink/20 bg-paper/50 px-6 py-14 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="text-base font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-ink/60">{description}</p>}
      {action}
    </div>
  );
}

// ---- Feature status badge ----
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  new: "outline",
  discovery: "warning",
  prd_ready: "default",
  planning: "default",
  in_progress: "accent",
  review: "warning",
  approval: "success",
  shipped: "success",
  closed_duplicate: "outline",
};
const STATUS_LABEL: Record<string, string> = {
  new: "New",
  discovery: "Discovery",
  prd_ready: "PRD Ready",
  planning: "Planning",
  in_progress: "In Progress",
  review: "Review",
  approval: "Approval",
  shipped: "Shipped ✓",
  closed_duplicate: "Duplicate",
};
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "default"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

// ---- Review severity badge ----
export function SeverityBadge({ severity }: { severity: string }) {
  const v: BadgeVariant = severity === "blocking" ? "danger" : severity === "non_blocking" ? "warning" : "outline";
  const label = severity === "blocking" ? "🛑 Blocking" : severity === "non_blocking" ? "⚠️ Non-blocking" : "ℹ️ Info";
  return <Badge variant={v}>{label}</Badge>;
}

// ---- Section heading ----
export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink/60">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
