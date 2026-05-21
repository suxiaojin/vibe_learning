"use client";

import type { ReactNode } from "react";

type ConfirmSubmitButtonProps = {
  className: string;
  form: string;
  message: string;
  children: ReactNode;
};

export function ConfirmSubmitButton({ className, form, message, children }: ConfirmSubmitButtonProps) {
  return (
    <button
      className={className}
      form={form}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
