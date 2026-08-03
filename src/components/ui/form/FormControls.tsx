import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export const formStyles = {
  fieldClass:
    "w-full rounded-lg border border-fog bg-white px-3 py-3 text-base text-ink outline-none focus:border-signal min-h-12",
  labelClass: "flex flex-col gap-1.5 text-sm font-medium text-ink",
  helpClass: "text-skyline text-xs font-normal",
  errorClass:
    "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800",
} as const;

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  help?: string;
  children: ReactNode;
  className?: string;
};

export function FormField({
  label,
  htmlFor,
  help,
  children,
  className = "",
}: FormFieldProps) {
  return (
    <label
      className={`${formStyles.labelClass} ${className}`.trim()}
      htmlFor={htmlFor}
    >
      <span>{label}</span>
      {help ? <span className={formStyles.helpClass}>{help}</span> : null}
      {children}
    </label>
  );
}

type FormInputProps = InputHTMLAttributes<HTMLInputElement>;

export function FormInput({ className = "", ...props }: FormInputProps) {
  return (
    <input
      className={`${formStyles.fieldClass} ${className}`.trim()}
      {...props}
    />
  );
}

type FormTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function FormTextarea({ className = "", ...props }: FormTextareaProps) {
  return (
    <textarea
      className={`${formStyles.fieldClass} min-h-28 resize-y ${className}`.trim()}
      {...props}
    />
  );
}

type FormSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function FormSelect({
  className = "",
  children,
  ...props
}: FormSelectProps) {
  return (
    <select
      className={`${formStyles.fieldClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </select>
  );
}

type FormErrorProps = {
  message: string | null | undefined;
  children?: ReactNode;
};

export function FormError({ message, children }: FormErrorProps) {
  if (!message && !children) {
    return null;
  }

  return (
    <div className={formStyles.errorClass} role="alert">
      {message ? <p>{message}</p> : null}
      {children}
    </div>
  );
}

type FormActionsProps = {
  children: ReactNode;
  className?: string;
};

export function FormActions({ children, className = "" }: FormActionsProps) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`.trim()}>
      {children}
    </div>
  );
}

type FormCheckboxProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  help?: string;
};

export function FormCheckbox({
  label,
  help,
  className = "",
  ...props
}: FormCheckboxProps) {
  return (
    <label
      className={`border-fog text-ink flex min-h-12 items-center gap-3 rounded-lg border bg-white px-3 text-sm ${className}`.trim()}
    >
      <input
        className="size-4 accent-[var(--color-signal)]"
        type="checkbox"
        {...props}
      />
      <span>
        {label}
        {help ? (
          <span className={`${formStyles.helpClass} mt-0.5 block`}>{help}</span>
        ) : null}
      </span>
    </label>
  );
}

type FormSubmitButtonProps = {
  children: ReactNode;
  pending?: boolean;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function FormSubmitButton({
  children,
  pending = false,
  pendingLabel = "Saving…",
  className = "",
  disabled,
}: FormSubmitButtonProps) {
  return (
    <button
      className={`bg-ink text-mist hover:bg-skyline min-h-12 rounded-lg px-5 text-sm font-medium transition disabled:opacity-60 ${className}`.trim()}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
