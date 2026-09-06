// src/pages/headteacher/modules/ExamReadiness.jsx
// How many candidates are on course for six credits, and which are not.
//
// The list is ordered worst-first and defaults to Form 3, because that is the
// year where the projection is still worth acting on. A Form 4 list in the
// third term tells a head teacher what is about to happen to them; a Form 3
// list tells them what they can still change.
import { useState, useEffect, useCallback, useMemo } from "react";
import { db } from "../../../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Award, RefreshCw, Search, AlertTriangle, BookOpen } from "lucide-react";
import {
  fetchMarkSheets, buildReadiness, subjectWeakness, summarise, bandMeta,
  formNumber, gradeFor, CREDITS_REQUIRED,
} from "../../../services/examReadiness";
import { subscribeSchoolSettings } from "../../../services/academicTerm";
import {
  Modal, Btn, IconBtn, Pill, EmptyState, StatGrid, StatCard, ModuleHeader,
  Notice, LoadingState, FilterBar, TableWrap,
} from "../../../components/ui/ModuleKit";
import "./staff-management.css";
import useLoader from "../../../hooks/useLoader";

export default function ExamReadiness({ schoolCode }) {
  const [students, setStudents] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [term, setTerm] = useState("");
  const [form, setForm] = useState(3);
  const [band, setBand] = useState("all");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    if (!schoolCode || !term) return;
    try {
      const [snap, marks] = await Promise.all([
        getDocs(query(collection(db, "students"), where("schoolCode", "==", schoolCode))),
        fetchMarkSheets(schoolCode, term),
      ]);
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSheets(marks);
    } catch (err) {
      console.error("[readiness] load failed:", err);
      setNotice({ tone: "danger", text: "Could not load marks: " + err.message });
      setStudents([]);
    }
  }, [schoolCode, term]);

  useLoader(load);

  useEffect(() => {
    if (!schoolCode) return;
    return subscribeSchoolSettings(schoolCode, (s) => setTerm(s?.currentTerm || ""));
  }, [schoolCode]);


  const formsPresent = useMemo(() => {
    const set = new Set((students || []).map((s) => formNumber(s.className)).filter(Boolean));
    return [...set].sort((a, b) => a - b);
  }, [students]);

  const rows = useMemo(
    () => buildReadiness({ students: students || [], sheets, formFilter: form }),
    [students, sheets, form],
  );

  const stats = useMemo(() => summarise(rows), [rows]);
  const weakness = useMemo(() => subjectWeakness(rows), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => band === "all" || r.band === band)
      .filter((r) => !q || r.fullName?.toLowerCase().includes(q));
  }, [rows, band, search]);

  if (!term) {
    return (
      <EmptyState
        icon={<Award size={28} />}
        title="No term is set"
        sub="Readiness is projected from the marks entered this term. Set the current term first."
      />
    );
  }
  if (students === null) return <LoadingState label="Projecting MSCE readiness…" />;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Exam Readiness"
        subtitle={`Projected against ${CREDITS_REQUIRED} credits including English · ${term}`}
        actions={[<IconBtn key="r" icon={<RefreshCw size={15} />} title="Refresh" onClick={load} />]}
      />

      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <Notice tone="warning">
        A projection from the marks entered so far, not a prediction of the examination. Where only
        part of the term has been assessed it is weighted on what exists — treat a low completeness
        figure as a rough signal rather than a verdict.
      </Notice>

      <StatGrid>
        <StatCard label="On track" value={stats.onTrack} tone="success"
          sub={`${stats.projectedPassRate}% of those assessed`} />
        <StatCard label="Borderline" value={stats.borderline} tone="warning"
          sub="Within two credits" />
        <StatCard label="At risk" value={stats.atRisk} tone="danger"
          sub="Three or more credits short" />
        <StatCard label="English only" value={stats.englishOnly}
          tone={stats.englishOnly ? "warning" : "success"}
          sub="Have the credits but not English" />
      </StatGrid>

      {stats.englishOnly > 0 && (
        <Notice tone="warning">
          {stats.englishOnly} candidate{stats.englishOnly === 1 ? " has" : "s have"} six or more
          credits but not in English, so {stats.englishOnly === 1 ? "they would" : "they would each"}
          {" "}leave without a certificate. This is the group where one subject changes the outcome.
        </Notice>
      )}

      <div className="filter-bar">
        <div className="search-wrapper">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="Search candidates…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <FilterBar
          value={form}
          onChange={setForm}
          options={formsPresent.map((f) => ({ id: f, label: `Form ${f}` }))}
        />
      </div>

      <FilterBar
        value={band}
        onChange={setBand}
        options={[
          { id: "all", label: "All", count: rows.length },
          { id: "atRisk", label: "At risk", count: stats.atRisk },
          { id: "borderline", label: "Borderline", count: stats.borderline },
          { id: "onTrack", label: "On track", count: stats.onTrack },
          { id: "noData", label: "No marks", count: stats.noData },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<Award size={28} />}
          title={rows.length === 0 ? `No students in Form ${form}` : "Nothing in this band"}
          sub={rows.length === 0
            ? "Check the class names — forms are read from names like “Form 3A”."
            : "Try another band or clear the search."}
        />
      ) : (
        <TableWrap>
          <table className="data-table">
            <thead>
              <tr>
                <th>Candidate</th><th>Class</th><th>Credits</th><th>English</th>
                <th>Weakest subjects</th><th>Standing</th><th>Marks in</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const meta = bandMeta(r.band);
                return (
                  <tr key={r.id} onClick={() => setDetail(r)} className="cursor-pointer">
                    <td><strong>{r.fullName}</strong></td>
                    <td className="text-muted">{r.className}</td>
                    <td>
                      <strong>{r.credits}</strong>
                      <span className="text-muted"> / {CREDITS_REQUIRED}</span>
                      {r.shortfall > 0 && (
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {r.shortfall} short
                        </div>
                      )}
                    </td>
                    <td>
                      {r.englishScore === null
                        ? <span className="text-muted">—</span>
                        : (
                          <Pill tone={r.englishCredit ? "success" : "danger"}>
                            {r.englishCredit ? "Credit" : `Grade ${gradeFor(r.englishScore)?.grade}`}
                          </Pill>
                        )}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {r.weakest.length === 0
                        ? "—"
                        : r.weakest.map((w) => `${w.subject} (${w.grade})`).join(", ")}
                    </td>
                    <td><Pill tone={meta.tone}>{meta.label}</Pill></td>
                    <td className="text-muted">{r.completeness}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      {/* ── Where the school loses credits ─────────────────────────────────── */}
      {weakness.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={18} />
            <h3 style={{ margin: 0 }}>Where Form {form} loses credits</h3>
          </div>
          <p className="text-muted mb-4" style={{ fontSize: 13 }}>
            The share of candidates reaching a credit in each subject. A subject near the bottom is a
            teaching or staffing question, not a run of individual failures.
          </p>
          <TableWrap>
            <table className="data-table">
              <thead>
                <tr><th>Subject</th><th>Credit rate</th><th>Average</th><th>Candidates</th></tr>
              </thead>
              <tbody>
                {weakness.map((w) => (
                  <tr key={w.subject}>
                    <td>{w.subject}</td>
                    <td>
                      <Pill tone={w.creditRate >= 60 ? "success" : w.creditRate >= 35 ? "warning" : "danger"}>
                        {w.creditRate}%
                      </Pill>
                    </td>
                    <td>{w.average}</td>
                    <td className="text-muted">{w.entered}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}

      {/* ── One candidate ─────────────────────────────────────────────────── */}
      {detail && (
        <Modal
          title={detail.fullName}
          subtitle={`${detail.className} · ${detail.credits} credit${detail.credits === 1 ? "" : "s"} · ${bandMeta(detail.band).label}`}
          onClose={() => setDetail(null)}
          footer={<Btn variant="secondary" onClick={() => setDetail(null)}>Close</Btn>}
        >
          {detail.englishOnly && (
            <Notice tone="warning">
              <AlertTriangle size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              Has the credits but not English. One subject stands between this candidate and a
              certificate.
            </Notice>
          )}
          <TableWrap>
            <table className="data-table">
              <thead>
                <tr><th>Subject</th><th>Score</th><th>Grade</th><th>Marks in</th></tr>
              </thead>
              <tbody>
                {Object.entries(detail.subjects)
                  .sort((a, b) => a[1].score - b[1].score)
                  .map(([subject, v]) => {
                    const g = gradeFor(v.score);
                    return (
                      <tr key={subject}>
                        <td>{subject}</td>
                        <td>{v.score}</td>
                        <td>
                          <Pill tone={g.grade <= 6 ? "success" : g.grade <= 8 ? "warning" : "danger"}>
                            {g.grade} · {g.remark}
                          </Pill>
                        </td>
                        <td className="text-muted">{v.completeness}%</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </TableWrap>
        </Modal>
      )}
    </div>
  );
}
