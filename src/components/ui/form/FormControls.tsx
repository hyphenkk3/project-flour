import {
  cloneElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
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
  fieldErrorClass: "text-status-danger text-sm font-normal leading-relaxed",
  invalidControlClass: "border-red-300",
} as const;

export function RequiredAsterisk() {
  return (
    <span aria-hidden="true" className="text-status-danger">
      {" *"}
    </span>
  );
}

export function FormRequiredLegend({ className = "" }: { className?: string }) {
  return (
    <p className={`text-skyline text-sm ${className}`.trim()}>
      <span aria-hidden="true">*</span> Required fields
    </p>
  );
}

type FormFieldProps = {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  required?: boolean;
  error?: string | null;
  children: ReactNode;
  className?: string;
};

function withFieldAccessibility(
  children: ReactNode,
  input: {
    required: boolean;
    error: string | null;
    helpId?: string;
    errorId?: string;
  },
): ReactNode {
  if (!isValidElement(children)) {
    return children;
  }
  const child = children as ReactElement<{
    required?: boolean;
    className?: string;
    "aria-invalid"?: boolean;
    "aria-required"?: boolean;
    "aria-describedby"?: string;
  }>;
  const describedBy = [
    child.props["aria-describedby"],
    input.helpId,
    input.error ? input.errorId : null,
  ]
    .filter(Boolean)
    .join(" ");
  return cloneElement(child, {
    "aria-required": input.required || child.props["aria-required"] || undefined,
    "aria-invalid": input.error ? true : child.props["aria-invalid"],
    "aria-describedby": describedBy || undefined,
    className: input.error
      ? `${child.props.className ?? ""} ${formStyles.invalidControlClass}`.trim()
      : child.props.className,
  });
}

export function FormField({
  label,
  htmlFor,
  help,
  required = false,
  error = null,
  children,
  className = "",
}: FormFieldProps) {
  const helpId = htmlFor && help ? `${htmlFor}-help` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  return (
    <label
      className={`${formStyles.labelClass} ${className}`.trim()}
      htmlFor={htmlFor}
    >
      <span data-field-label="">
        {label}
        {required ? <RequiredAsterisk /> : null}
      </span>
      {help ? (
        <span className={formStyles.helpClass} data-field-help="" id={helpId}>
          {help}
        </span>
      ) : null}
      {withFieldAccessibility(children, {
        required,
        error,
        helpId,
        errorId,
      })}
      {error ? (
        <span className={formStyles.fieldErrorClass} id={errorId} role="alert">
          {error}
        </span>
      ) : null}
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
  error?: string | null;
  markRequired?: boolean;
};

export function FormCheckbox({
  label,
  help,
  error = null,
  markRequired = false,
  className = "",
  required,
  ...props
}: FormCheckboxProps) {
  const describedName = props.id ?? props.name;
  const helpId = describedName && help ? `${describedName}-help` : undefined;
  const errorId = describedName ? `${describedName}-error` : undefined;
  const describedBy = [helpId, error && errorId ? errorId : null]
    .filter(Boolean)
    .join(" ");
  return (
    <label
      className={`border-fog text-ink flex min-h-12 items-center gap-3 rounded-lg border bg-white px-3 text-sm ${className}`.trim()}
    >
      <input
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className="size-4 accent-[var(--color-signal)]"
        required={required}
        type="checkbox"
        {...props}
      />
      <span>
        <span data-field-label="">
          {label}
          {markRequired ? <RequiredAsterisk /> : null}
        </span>
        {help ? (
          <span
            className={`${formStyles.helpClass} mt-0.5 block`}
            data-field-help=""
            id={helpId}
          >
            {help}
          </span>
        ) : null}
        {error ? (
          <span
            className={`${formStyles.fieldErrorClass} mt-0.5 block`}
            id={errorId}
            role="alert"
          >
            {error}
          </span>
        ) : null}
      </span>
    </label>
  );
}

type FormRadioOption = {
  value: string;
  label: string;
};

type FormRadioGroupProps = {
  name: string;
  legend: string;
  help?: string;
  value: string;
  required?: boolean;
  error?: string | null;
  options: readonly FormRadioOption[];
  onChange: (value: string) => void;
};

export function FormRadioGroup({
  name,
  legend,
  help,
  value,
  required = false,
  error = null,
  options,
  onChange,
}: FormRadioGroupProps) {
  const helpId = help ? `${name}-help` : undefined;
  const errorId = `${name}-error`;
  const describedBy = [helpId, error ? errorId : null].filter(Boolean).join(" ");
  return (
    <fieldset
      aria-describedby={describedBy || undefined}
      aria-invalid={error ? true : undefined}
      className="space-y-2"
    >
      <legend className="text-ink text-sm font-medium" data-field-label="">
        {legend}
        {required ? <RequiredAsterisk /> : null}
      </legend>
      {help ? (
        <p className={formStyles.helpClass} data-field-help="" id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className={formStyles.fieldErrorClass} id={errorId} role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option, index) => (
          <label
            className="border-fog text-ink flex min-h-12 items-center gap-3 rounded-lg border bg-white px-3 text-sm"
            key={option.value}
          >
            <input
              checked={value === option.value}
              className="size-4 accent-[var(--color-signal)]"
              name={name}
              onChange={() => onChange(option.value)}
              required={required && index === 0}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type FormSubmitButtonProps = {
  children: ReactNode;
  pending?: boolean;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  type?: "submit" | "button";
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
};

export function FormSubmitButton({
  children,
  pending = false,
  pendingLabel = "Saving…",
  className = "",
  disabled,
  type = "submit",
  onClick,
}: FormSubmitButtonProps) {
  return (
    <button
      className={`bg-ink text-mist hover:bg-skyline min-h-12 cursor-pointer rounded-lg px-5 text-sm font-medium transition disabled:opacity-60 ${className}`.trim()}
      disabled={disabled || pending}
      onClick={onClick}
      type={type}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
