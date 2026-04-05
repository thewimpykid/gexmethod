"use client";

const SYMBOLS = ["QQQ", "SPY", "SPX", "IWM"];

interface Props {
  selected: string;
  onChange: (symbol: string) => void;
}

export default function SymbolSelector({ selected, onChange }: Props) {
  return (
    <div className="flex gap-2">
      {SYMBOLS.map((sym) => (
        <button
          key={sym}
          onClick={() => onChange(sym)}
          className={`px-3 py-1.5 rounded text-sm font-mono font-semibold transition-colors ${
            selected === sym
              ? "bg-sky-500 text-white"
              : "bg-[#161b22] text-[#8b949e] border border-[#30363d] hover:border-sky-500 hover:text-sky-400"
          }`}
        >
          {sym}
        </button>
      ))}
    </div>
  );
}
