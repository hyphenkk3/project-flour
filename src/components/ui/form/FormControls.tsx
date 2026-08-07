import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Shared control chrome for primary form fields (input + select).
 * Fixed height so native selects match text/date inputs visually.
 */
const controlBase =
  "box-border h-12 w-full rounded-lg border border-fog bg-white px-3 text-base font-normal leading-none text-ink outline-none transition-colors focus:border-signal disabled:cursor-not-allowed disabled:opacity-60";

const selectChevron =
  "appearance-none bg-[length:1rem_1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10 [background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")]";

export const formStyles = {
  fieldClass: controlBase,
  selectClass: `${controlBase} ${selectChevron}`,
  textareaClass:
    "box-border min-h-28 w-full resize-y rounded-lg border border-fog bg-white px-3 py-3 text-base font-normal leading-normal text-ink outline-none transition-colors focus:border-signal disabled:cursor-not-allowed disabled:opacity-60",
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
      className={`${formStyles.textareaClass} ${className}`.trim()}
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
      className={`${formStyles.selectClass} ${className}`.trim()}
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
