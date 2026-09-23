// Wording helpers for the dashboard overviews.

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function todayLabel() {
  return new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function plural(n, word, suffix = "s") {
  return `${n} ${word}${n === 1 ? "" : suffix}`;
}
