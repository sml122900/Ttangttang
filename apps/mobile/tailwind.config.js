// 색상 값은 packages/tokens/src/index.ts 와 동일하게 유지할 것 (tailwind.config.js는
// Node에서 바로 require되므로 TS 소스를 직접 가져올 수 없어 값을 복제한다).
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: "#4059C8",
        "brand-press": "#3348A8",
        "brand-tint": "#EEF1FC",
        point: "#0BA05C",
        "point-tint": "#E8F7F0",
        ink: "#191F28",
        "ink-2": "#333D4B",
        sub: "#6B7684",
        "sub-2": "#8B95A1",
        line: "#E5E8EB",
        "line-soft": "#F2F4F6",
        "surface-warm": "#FDFBF7",
        "surface-money": "#FFFFFF",
        danger: "#E5503C",
      },
      borderRadius: {
        card: "14px",
        sheet: "22px",
      },
    },
  },
  plugins: [],
};
