const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
  ["second", 1000],
];

export function formatIntlDate(
  value: Date | string | number,
  localeCode: string,
  options: Intl.DateTimeFormatOptions
) {
  return new Intl.DateTimeFormat(localeCode, options).format(new Date(value));
}

export function formatRelativeTime(value: Date | string | number, localeCode: string) {
  const diff = new Date(value).getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(localeCode, { numeric: "auto" });
  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= unitMs || unit === "second") {
      return formatter.format(Math.round(diff / unitMs), unit);
    }
  }
  return formatter.format(0, "second");
}
