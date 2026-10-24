import type { Progress } from "@/lib/client/api";

export function ProgressBar({ progress, label }: { progress: Progress; label: string }) {
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${label} 진행률`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
      >
        <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <span className="progress-text">
        {progress.percent}% <small>({progress.done}/{progress.total})</small>
      </span>
    </div>
  );
}
