import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // text-base no celular (16px) e text-sm do sm: para cima. Abaixo de
          // 16px o iOS dá zoom sozinho ao focar o campo, e o zoom NÃO volta:
          // depois do login o app inteiro fica cortado nas laterais.
          "flex h-10 w-full rounded-xl border border-border/70 bg-card px-3.5 py-2 text-base sm:text-sm ring-offset-background shadow-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 hover:border-primary/40",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
