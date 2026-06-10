// Instant feedback while a dashboard page renders on the server. Without
// this, nav clicks show nothing until the whole page is ready, which reads
// as the portal being frozen.
export default function DashboardLoading() {
  return (
    <div className="hq-page" aria-busy="true" aria-live="polite">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <div className="hq-skeleton hq-skeleton-eyebrow" />
          <div className="hq-skeleton hq-skeleton-title" />
          <div className="hq-skeleton hq-skeleton-subtitle" />
        </div>
      </section>
      <section className="hq-panel">
        <div className="hq-skeleton hq-skeleton-row" />
        <div className="hq-skeleton hq-skeleton-row" />
        <div className="hq-skeleton hq-skeleton-row hq-skeleton-row-short" />
      </section>
    </div>
  );
}
