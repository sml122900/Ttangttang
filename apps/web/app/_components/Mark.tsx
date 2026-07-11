export function Mark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-tint font-extrabold text-brand"
      style={{ width: size, height: size, fontSize: size * 0.34, letterSpacing: "-0.02em" }}
    >
      땅땅
    </span>
  );
}
