"use client";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-ink group-[.toaster]:border-ink/10 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-ink/60",
          actionButton: "group-[.toast]:bg-accent group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-ink/10 group-[.toast]:text-ink",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
