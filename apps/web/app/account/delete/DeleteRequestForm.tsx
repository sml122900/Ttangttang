"use client";

import { useState } from "react";

// §5 돈 레지스터 — 계정 삭제는 되돌릴 수 없는 결정이라 위트 없이 건조하게.
export function DeleteRequestForm() {
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/account/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, note }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "요청 접수에 실패했어요");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-line bg-white px-5 py-5 text-sm leading-relaxed text-ink-2">
        요청이 접수됐어요. 본인 확인 후 처리하고 결과를 남겨드릴게요.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-line bg-white px-5 py-5">
      <div>
        <label className="mb-1.5 block text-[13.5px] font-semibold text-sub">
          가입 시 닉네임 또는 연락 가능한 이메일
        </label>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          maxLength={200}
          placeholder="예) 성수동감자, 또는 이메일 주소"
          className="w-full rounded-xl border border-line px-4 py-3 text-[15px] text-ink outline-none focus:border-brand"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[13.5px] font-semibold text-sub">참고 사항 (선택)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="본인 확인에 도움이 될 정보가 있다면 적어주세요"
          className="w-full rounded-xl border border-line px-4 py-3 text-[15px] text-ink outline-none focus:border-brand"
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="h-12 rounded-2xl bg-brand text-sm font-bold text-white disabled:opacity-60"
      >
        {status === "submitting" ? "접수하는 중…" : "삭제 요청 보내기"}
      </button>
    </form>
  );
}
