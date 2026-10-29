import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cx } from "../../utils/format";

type Variant = "primary" | "secondary" | "ghost" | "inverse" | "accent" | "outline-dark";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold tracking-[-0.005em] rounded-[7px] " +
  "transition-[background-color,border-color,color,box-shadow] duration-200 ease-out active:translate-y-px " +
  "disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0 select-none";

// solid, restrained actions: no gradients, glows or shine
const variants: Record<Variant, string> = {
  primary: "bg-ink text-ivory hover:bg-ink-3",
  secondary: "bg-surface text-fg border border-line-strong hover:border-ink/45",
  ghost: "text-fg hover:bg-paper-2",
  inverse: "bg-ivory text-ink hover:bg-white",
  // on night surfaces: the one teal action, and a quiet outlined companion
  accent: "bg-teal-bright text-night hover:bg-[#8af7e2]",
  "outline-dark": "border border-ivory/25 text-ivory hover:border-ivory/60 hover:bg-ivory/[0.05]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-11 px-4 text-[14px]",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(base, variants[variant], sizes[size], extra);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? (
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({ variant = "primary", size = "md", icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className as string)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
