interface Props {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  id?: string;
  placeholder?: string;
}

/** Dollar amount field: numeric keypad on mobile, digits and one decimal point only, max 2 decimals. */
export default function MoneyInput({ value, onChange, required, id, placeholder = "0.00" }: Props) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden>$</span>
      <input
        id={id}
        className="input pl-7"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        pattern="^\d+(\.\d{1,2})?$"
        title="Enter an amount like 125 or 125.50"
        value={value}
        required={required}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^\d.]/g, "");
          const [whole, ...rest] = cleaned.split(".");
          onChange(rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole);
        }}
        onBlur={() => {
          if (value && /^\d+\.?$/.test(value)) onChange(`${value.replace(/\.$/, "")}.00`);
          else if (/^\d+\.\d$/.test(value)) onChange(`${value}0`);
        }}
      />
    </div>
  );
}
