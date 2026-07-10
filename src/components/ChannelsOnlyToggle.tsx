export function ChannelsOnlyToggle({
  active,
  onChange,
  disabled,
}: {
  active: boolean;
  onChange: (active: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      disabled={disabled}
      aria-pressed={active}
      title={disabled ? "Erst unter „Meine Kanäle“ Kanäle speichern" : undefined}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-accent bg-accent text-canvas"
          : "border-line bg-surface text-muted hover:text-ink"
      }`}
    >
      Nur meine Kanäle
    </button>
  );
}
