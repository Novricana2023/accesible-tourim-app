import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-normal rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-fg [@media(hover:hover)]:hover:bg-primary-hover",
        secondary:
          "border border-border bg-surface text-fg [@media(hover:hover)]:hover:bg-surface-hover",
        danger: "bg-stop text-stop-fg [@media(hover:hover)]:hover:bg-stop-hover",
        ghost:
          "bg-transparent text-primary shadow-none underline-offset-4 [@media(hover:hover)]:hover:bg-surface-hover",
      },
      size: {
        default: "min-h-12 min-w-12 px-5 py-3 text-lg",
        large: "min-h-14 w-full px-6 py-4 text-xl",
        compact: "min-h-12 px-5 py-2.5 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant, size, asChild = false, type, ...props },
    ref,
  ) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      />
    );
  },
);
