import React from "react";

import { cn } from "@/lib/utils";

type BackgroundProps = {
  children: React.ReactNode;
  variant?: "top" | "bottom";
  className?: string;
  "data-ds"?: string;
};

export const Background = ({
  children,
  className,
  "data-ds": outer,
}: BackgroundProps) => {
  return (
    <div
      className={cn("relative", className)}
      data-ds={outer ? `${outer} Background` : "Background"}
    >
      {children}
    </div>
  );
};
