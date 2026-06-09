"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ConfirmSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  className: string;
  form: string;
  message: string;
  children: ReactNode;
};

export function ConfirmSubmitButton({ children, className, form, message, onClick, ...props }: ConfirmSubmitButtonProps) {
  return (
    <button
      {...props}
      className={className}
      form={form}
      type="submit"
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}
