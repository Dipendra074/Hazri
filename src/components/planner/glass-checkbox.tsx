type Props = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  size?: number;
  className?: string;
  "aria-label"?: string;
};

export function GlassCheckbox({
  checked,
  onCheckedChange,
  size = 20,
  className = "",
  ...rest
}: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      onClick={() => onCheckedChange(!checked)}
      data-checked={checked ? "true" : "false"}
      style={{ width: size, height: size, minWidth: size }}
      className={`gl-checkbox__box ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="gl-checkbox__check"
        style={{ width: size * 0.6, height: size * 0.6 }}
        aria-hidden="true"
      >
        <path d="M5 12.5 10 17.5 19 7" />
      </svg>
    </button>
  );
}
