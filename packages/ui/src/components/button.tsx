import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
};

export function Button({ className, variant = "primary", icon, children, ...props }: ButtonProps) {
  return (
    <button className={cx("btn", `btn-${variant}`, className)} {...props}>
      {icon}
      {children ? <span>{children}</span> : null}
    </button>
  );
}
