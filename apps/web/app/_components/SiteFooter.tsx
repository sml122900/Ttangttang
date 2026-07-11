import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-line-soft px-6 py-8 text-sm text-sub-2">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getUTCFullYear()} 땅땅</p>
        <nav className="flex gap-4">
          <Link href="/terms" className="hover:text-ink-2">
            이용약관
          </Link>
          <Link href="/privacy" className="hover:text-ink-2">
            개인정보처리방침
          </Link>
        </nav>
      </div>
    </footer>
  );
}
