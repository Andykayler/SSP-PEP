// src/pages/director/modules/CampusPerformance.jsx
// ─────────────────────────────────────────────────────────────────────────────
// One campus per card, ranked on whatever the director is worried about today.
//
// The overview table already lists every campus; this exists because a table
// is good at "what are the numbers" and bad at "which of these is the outlier".
// Sorting the same six measures and showing each site's standing against the
// group average turns six rows of figures into an answer.
//
// The group average, not a target. Nothing in the product knows what a good
// pupil-teacher ratio is for a particular school, and inventing a threshold
// would put a red badge on a campus for missing a number nobody set.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { Building2 } from "lucide-react";
import { ModuleHeader, FilterBar, EmptyState, StatGrid, StatCard, LoadingState } from "../../../components/ui/ModuleKit";
import { money } from "../../../components/ui/format";

const MEASURES = [
  { id: "learners",    label: "Roll size",       get: (c) => c.learners,        fmt: (v) => v.toLocaleString(), better: "high" },
  { id: "collection",  label: "Fee collection",  get: (c) => c.collectionRate,  fmt: (v) => (v === null ? "—" : `${v}%`), better: "high" },
  { id: "outstanding", label: "Arrears",         get: (c) => c.outstanding,     fmt: money, better: "low" },
  { id: "ratio",       label: "Pupil–teacher",   get: (c) => c.ratio,           fmt: (v) => (v === null ? "—" : `1:${v}`), better: "low" },
];

function average(values) {
  const real = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
  if (!real.length) return null;
  return real.reduce((a, b) => a + b, 0) / real.length;
}

export default function CampusPerformance({ overview, loading }) {
  const [measureId, setMeasureId] = useState("learners");

  if (loading) return <LoadingState label="Comparing campuses…" />;

  const campuses = overview?.campuses || [];
  const measure = MEASURES.find((m) => m.id === measureId) || MEASURES[0];
  const mean = average(campuses.map(measure.get));

  const ranked = [...campuses].sort((a, b) => {
    const av = measure.get(a);
    const bv = measure.get(b);
    // Campuses with nothing recorded sink to the bottom rather than topping a
    // "lowest arrears" ranking on the strength of having no data.
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return measure.better === "high" ? bv - av : av - bv;
  });

  if (campuses.length === 0) {
    return (
      <div className="space-y-5">
        <ModuleHeader title="Campuses" subtitle="Every site, compared on the same measures" />
        <EmptyState
          icon={<Building2 size={28} />}
          title="No campuses yet"
          sub="The administrator adds the school's sites under Campuses; they appear here as soon as they exist."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ModuleHeader
        title="Campuses"
        subtitle={`${campuses.length} site${campuses.length === 1 ? "" : "s"} under one school`}
      />

      <FilterBar
        options={MEASURES.map((m) => ({ id: m.id, label: m.label }))}
        value={measureId}
        onChange={setMeasureId}
      />

      <p className="text-muted" style={{ fontSize: 12.5 }}>
        Ranked by {measure.label.toLowerCase()}, {measure.better === "high" ? "highest" : "lowest"} first.
        Compared against the group average, which is what the campuses do — not a target
        anybody set.
      </p>

      <StatGrid>
        {ranked.map((c, i) => {
          const value = measure.get(c);
          const delta = mean !== null && typeof value === "number" ? value - mean : null;
          const good = delta === null ? null : measure.better === "high" ? delta >= 0 : delta <= 0;

          return (
            <StatCard
              key={c.campusId}
              label={`${i + 1}. ${c.campusName}${c.isPrimary ? " (main)" : ""}`}
              value={measure.fmt(value)}
              tone={good === null ? undefined : good ? "success" : "warning"}
              sub={
                delta === null
                  ? "Nothing recorded yet"
                  : `${delta >= 0 ? "+" : "−"}${measure.fmt(Math.abs(Math.round(delta)))} vs group average`
              }
            />
          );
        })}
      </StatGrid>

      <div className="card p-5 space-y-2">
        <p style={{ fontWeight: 600 }}>What each campus keeps to itself</p>
        <p className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          Students, classes, registers, marks and fee records belong to one campus and are not
          visible from another. Staff see only the campuses they are attached to; you and the
          administrator see all of them. A student moves between campuses only through an
          approved transfer, so the roll figures above cannot drift apart from what each site
          is actually teaching.
        </p>
      </div>
    </div>
  );
}
