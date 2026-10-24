"use client";

/**
 * Route error boundary (e.g. MongoDB is unreachable). Shows a fixed Korean message only: the
 * error's message, digest and stack are never rendered.
 */
export default function ErrorPage({ retry }: { error: unknown; retry: () => void; reset?: () => void }) {
  return (
    <section className="error-page">
      <h1>오류</h1>
      <p role="alert">문제가 발생했습니다. 잠시 후 다시 시도해 주세요.</p>
      <button type="button" onClick={() => retry()}>
        다시 시도
      </button>
    </section>
  );
}
