type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  variant?: "dark" | "light";
};

const sizeClasses: Record<NonNullable<BrandMarkProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function BrandMark({ size = "md", variant = "dark" }: BrandMarkProps) {
  const isLight = variant === "light";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl font-black tracking-tight shadow-sm ring-1 ${
        isLight
          ? "bg-white/10 text-white ring-white/20"
          : "bg-slate-900 text-white ring-slate-900/10"
      } ${sizeClasses[size]}`}
      aria-hidden="true"
    >
      QI
    </span>
  );
}

export function BrandLockup({
  variant = "dark",
  tagline = "Training & Compliance",
}: {
  variant?: "dark" | "light";
  tagline?: string;
}) {
  const isLight = variant === "light";
  return (
    <div className="flex items-center gap-3">
      <BrandMark variant={variant} />
      <div className="leading-tight">
        <p
          className={`text-sm font-bold tracking-tight ${
            isLight ? "text-white" : "text-slate-900"
          }`}
        >
          Quality International
        </p>
        <p
          className={`text-[11px] font-medium uppercase tracking-[0.18em] ${
            isLight ? "text-slate-300" : "text-slate-500"
          }`}
        >
          {tagline}
        </p>
      </div>
    </div>
  );
}
