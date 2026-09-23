export function reportThesisPath(ticker: string, reportId: number): string {
  const params = new URLSearchParams({ symbol: ticker.trim(), report: String(reportId) });
  return `/research/reports?${params.toString()}`;
}

export function thesisAlertPath(thesis: { id: number; ticker: string; title: string }): string {
  const params = new URLSearchParams({
    new: '1',
    ticker: thesis.ticker.trim(),
    thesis: String(thesis.id),
    name: `${thesis.title.trim()} · 技术信号核验`,
  });
  return `/alerts?${params.toString()}`;
}
