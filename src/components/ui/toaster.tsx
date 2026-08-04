"use client";

import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast, type ToastVariant } from "@/hooks/use-toast";

const ICONS: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
};

const ICON_CLASS: Record<ToastVariant, string> = {
  default: "text-primary",
  success: "text-emerald-600",
  warning: "text-amber-600",
  destructive: "text-destructive",
};

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider duration={5000}>
      {toasts.map(({ id, title, description, variant = "default" }) => {
        const Icon = ICONS[variant];
        return (
          <Toast key={id} variant={variant} onOpenChange={(open) => !open && dismiss(id)}>
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ICON_CLASS[variant]}`} />
            <div className="min-w-0 flex-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
