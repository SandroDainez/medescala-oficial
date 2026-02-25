import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:shadow-md",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md",
        outline: "border border-border/70 bg-card/70 text-foreground hover:bg-accent/80 hover:text-accent-foreground hover:border-primary/35 shadow-xs",
        secondary: "bg-secondary text-secondary-foreground border border-border/70 hover:bg-secondary/85 shadow-xs hover:shadow-sm",
        ghost: "text-foreground/90 hover:bg-accent/70 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-primary text-primary-foreground shadow-sm hover:brightness-110 hover:shadow-md",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-11 px-6 text-base",
        xl: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
