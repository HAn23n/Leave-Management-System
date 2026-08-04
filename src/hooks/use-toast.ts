"use client";

import { useEffect, useState } from "react";

const TOAST_LIMIT = 3;
const TOAST_DURATION_MS = 5000;

export type ToastVariant = "default" | "success" | "warning" | "destructive";

export interface ToasterToast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

type Listener = (state: ToasterToast[]) => void;

let memoryState: ToasterToast[] = [];
const listeners: Listener[] = [];

function emit() {
  listeners.forEach((listener) => listener(memoryState));
}

function dismissToast(id: string) {
  memoryState = memoryState.filter((t) => t.id !== id);
  emit();
}

let counter = 0;

export function toast(props: Omit<ToasterToast, "id">) {
  const id = `${Date.now()}-${counter++}`;
  memoryState = [{ ...props, id }, ...memoryState].slice(0, TOAST_LIMIT);
  emit();
  setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
  return id;
}

export function useToast() {
  const [state, setState] = useState<ToasterToast[]>(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const i = listeners.indexOf(setState);
      if (i > -1) listeners.splice(i, 1);
    };
  }, []);

  return { toasts: state, dismiss: dismissToast };
}
