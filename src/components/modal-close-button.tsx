import type { ButtonHTMLAttributes } from "react";

type ModalCloseButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual size: default matches modal headers */
  size?: "sm" | "md" | "lg";
};

/** Standard modal dismiss control — shows × instead of “Close” text. */
export function ModalCloseButton({
  size = "md",
  className,
  type = "button",
  title = "Close",
  "aria-label": ariaLabel = "Close",
  ...props
}: ModalCloseButtonProps) {
  const sizeClass =
    size === "sm"
      ? "h-10 w-10 text-xl"
      : size === "lg"
        ? "h-12 w-12 text-3xl"
        : "h-11 w-11 text-2xl";

  return (
    <button
      type={type}
      title={title}
      aria-label={ariaLabel}
      className={
        className ??
        `inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white leading-none text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60`
      }
      {...props}
    >
      ×
    </button>
  );
}
