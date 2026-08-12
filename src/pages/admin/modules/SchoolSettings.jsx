import { useState, useEffect, useMemo } from "react";
import { db } from "../../../firebase";
import {
  doc, collection, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp, addDoc,
} from "firebase/firestore";

import { IC } from "./icons";
import { DISTRICTS, PRIMARY_SUBJECTS, SECONDARY_SUBJECTS } from "./constants";
import { normalisePhone } from "./helpers";
import { Modal, Input, Select, Textarea, Btn, EmptyState, ActionBtn } from "./ui";

// ─── MODULE 3: School Settings ────────────────────────────────────────────────
export default function SchoolSettings({ schoolCode, schoolData, onUpdate }) {
  const [form, setForm]             = useState({ name: "", district: "", address: "", phone: "", email: "" });
  const [classes, setClasses]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClass, setEditingClass]     = useState(null);
  const [classForm, setClassForm]   = useState({ name: "", level: "primary", subjects: [] });
  const [levelFilter, setLevelFilter] = useState("all");
  const [classSearch, setClassSearch] = useState("");

  useEffect(() => {
    if (schoolData) setForm({ name: schoolData.name||"", district: schoolData.district||"", address: schoolData.address||"", phone: schoolData.phone||"", email: schoolData.email||"" });
    fetchClasses();
  }, [schoolData]);

  async function fetchClasses() {
    try {
      const q = query(collection(db, "school_classes"), where("schoolCode", "==", schoolCode));
      const snap = await getDocs(q);
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.order - b.order));
    } catch (e) { setClasses([]); }
  }

  async function handleSaveSchool(e) {
    e.preventDefault(); setLoading(true); setError(""); setSaved(false);
    try {
      await updateDoc(doc(db, "schools", schoolCode), { ...form, name: form.name.trim(), address: form.address.trim(), phone: normalisePhone(form.phone), email: form.email.trim(), updatedAt: serverTimestamp() });
      setSaved(true); if (onUpdate) onUpdate({ ...schoolData, ...form });
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { setError("Save failed: " + err.message); }
    setLoading(false);
  }

  function openClassModal(cls = null) {
    if (cls) { setClassForm({ name: cls.name||"", level: cls.level||"primary", subjects: cls.subjects||[] }); setEditingClass(cls); }
    else { setClassForm({ name: "", level: "primary", subjects: [] }); setEditingClass(null); }
    setShowClassModal(true);
  }

  async function saveClass() {
    if (!classForm.name.trim()) { alert("Class name required"); return; }
    setLoading(true);
    try {
      const data = {
        name: classForm.name.trim(), level: classForm.level,
        subjects: classForm.subjects.length > 0 ? classForm.subjects : (classForm.level === "primary" ? PRIMARY_SUBJECTS : SECONDARY_SUBJECTS),
        schoolCode, order: classes.length + 1, updatedAt: serverTimestamp(),
      };
      if (editingClass) await updateDoc(doc(db, "school_classes", editingClass.id), data);
      else await addDoc(collection(db, "school_classes"), data);
      setShowClassModal(false); fetchClasses();
    } catch (err) { alert("Failed to save class"); }
    setLoading(false);
  }

  async function deleteClass(id) {
    if (!confirm("Delete this class?")) return;
    try { await deleteDoc(doc(db, "school_classes", id)); fetchClasses(); } catch (e) { console.error(e); }
  }

  function toggleSubject(subject) {
    setClassForm(prev => ({
      ...prev,
      subjects: prev.subjects.includes(subject) ? prev.subjects.filter(s => s !== subject) : [...prev.subjects, subject],
    }));
  }

  const stats = useMemo(() => {
    const primary = classes.filter(c => c.level === "primary");
    const secondary = classes.filter(c => c.level === "secondary");
    const uniqueSubjects = new Set(classes.flatMap(c => c.subjects || []));
    return {
      total: classes.length,
      primary: primary.length,
      secondary: secondary.length,
      subjects: uniqueSubjects.size,
    };
  }, [classes]);

  const filteredClasses = useMemo(() => {
    return classes.filter(c => {
      if (levelFilter !== "all" && c.level !== levelFilter) return false;
      if (classSearch.trim() && !c.name?.toLowerCase().includes(classSearch.trim().toLowerCase())) return false;
      return true;
    });
  }, [classes, levelFilter, classSearch]);

  return (
    <div className="space-y-8">
      <style>{`
        .ss-stat {
          position: relative; overflow: hidden; border-radius: 14px; padding: 18px 20px;
          background: linear-gradient(155deg, rgba(255,255,255,0.03), rgba(255,255,255,0));
          border: 1px solid rgba(255,255,255,0.08);
        }
        .ss-stat__accent { position:absolute; top:0; left:0; width:4px; height:100%; }
        .ss-stat__num { font-size: 26px; font-weight: 800; color: var(--text); line-height: 1; margin-bottom: 6px; }
        .ss-stat__label { font-family: var(--font-mono); font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--text3); }

        .ss-toolbar {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
          padding: 12px 14px; border-radius: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.07);
        }
        .ss-search {
          flex: 1 1 200px; min-width: 160px;
          background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.09);
          border-radius: 9px; padding: 9px 12px; color: var(--text);
          font-size: 13px; outline: none; transition: border-color .15s ease;
        }
        .ss-search:focus { border-color: rgba(240,185,11,0.55); }
        .ss-search::placeholder { color: var(--text3); }

        .ss-pill {
          font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.5px;
          padding: 7px 12px; border-radius: 20px; cursor: pointer; user-select: none;
          border: 1px solid rgba(255,255,255,0.1); color: var(--text2);
          background: rgba(255,255,255,0.02); transition: all .15s ease; white-space: nowrap;
        }
        .ss-pill:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }
        .ss-pill--active { background: rgba(240,185,11,0.14); border-color: rgba(240,185,11,0.5); color: #f0b90b; }

        .ss-class-card {
          border-radius: 16px; padding: 20px; overflow: hidden; position: relative;
          border: 1px solid var(--border); transition: border-color .15s ease, transform .15s ease, background .15s ease;
        }
        .ss-class-card:hover { border-color: rgba(255,255,255,0.22); transform: translateY(-1px); }
        .ss-class-card__bar { position:absolute; top:0; left:0; width:4px; height:100%; }
      `}</style>

      <div>
        <h2 className="module-title">School Settings</h2>
        <p className="module-sub">Manage your institution's profile, contact details, and class structure</p>
      </div>

      <div className="card" style={{ padding: 28 }}>
        {error && <div className="alert alert--error" style={{ marginBottom: 16 }}>{IC.warning}<span>{error}</span></div>}
        {saved && <div className="alert alert--success" style={{ marginBottom: 16 }}>{IC.check}<span>Settings saved successfully.</span></div>}
        <div className="space-y-4">
          <div className="grid-2">
            <Input label="School Name" required value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} />
            <Select label="District" required value={form.district} onChange={e => setForm(p => ({...p, district: e.target.value}))}>
              <option value="">Select district…</option>
              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <div className="grid-2">
            <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} />
            <Input label="Email Address" type="email" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} />
          </div>
          <Textarea label="Physical Address" value={form.address} onChange={e => setForm(p => ({...p, address: e.target.value}))} rows={2} />
          <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
            <Btn onClick={handleSaveSchool} loading={loading} variant="accent">Save School Info</Btn>
          </div>
        </div>
      </div>

      {/* Class stats */}
      {classes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
          <div className="ss-stat">
            <div className="ss-stat__accent" style={{ background: "#f0b90b" }} />
            <div className="ss-stat__num">{stats.total}</div>
            <div className="ss-stat__label">Total Classes</div>
          </div>
          <div className="ss-stat">
            <div className="ss-stat__accent" style={{ background: "#3b82f6" }} />
            <div className="ss-stat__num">{stats.primary}</div>
            <div className="ss-stat__label">Primary</div>
          </div>
          <div className="ss-stat">
            <div className="ss-stat__accent" style={{ background: "#14b8a6" }} />
            <div className="ss-stat__num">{stats.secondary}</div>
            <div className="ss-stat__label">Secondary</div>
          </div>
          <div className="ss-stat">
            <div className="ss-stat__accent" style={{ background: "#a855f7" }} />
            <div className="ss-stat__num">{stats.subjects}</div>
            <div className="ss-stat__label">Subjects Covered</div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", letterSpacing: 0.5 }}>Classes &amp; Subjects</p>
            <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Based on Malawi National Curriculum (Primary: Std 1–8 | Secondary: Form 1–4)</p>
          </div>
          <Btn onClick={() => openClassModal()} variant="gold" size="sm">{IC.plus} Add Class</Btn>
        </div>

        {classes.length > 0 && (
          <div style={{ padding: "16px 24px 0" }}>
            <div className="ss-toolbar">
              <input
                className="ss-search"
                placeholder="Search classes…"
                value={classSearch}
                onChange={e => setClassSearch(e.target.value)}
              />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["all", "primary", "secondary"].map(key => (
                  <span
                    key={key}
                    className={`ss-pill ${levelFilter === key ? "ss-pill--active" : ""}`}
                    onClick={() => setLevelFilter(key)}
                  >
                    {key === "all" ? "All Levels" : key === "primary" ? "Primary" : "Secondary"}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div style={{ padding: 24 }}>
          {classes.length === 0 ? (
            <EmptyState icon={IC.school} title="No classes defined yet" sub="Add classes per Malawian curriculum"
              action={<Btn onClick={() => openClassModal()} variant="gold">{IC.plus} Add First Class</Btn>}
            />
          ) : filteredClasses.length === 0 ? (
            <EmptyState icon={IC.warning} title="No matches" sub="Try adjusting your search or filter" />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
              {filteredClasses.map(cls => (
                <div key={cls.id} className="ss-class-card">
                  <div className="ss-class-card__bar" style={{ background: cls.level === "primary" ? "#3b82f6" : "#14b8a6" }} />
                  <div className="flex-between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                    <div className="flex-gap-3">
                      <span style={{ background: "var(--accent-pale)", color: "var(--accent-lt)", border: "1px solid var(--border)", fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, letterSpacing: 1, textTransform: "uppercase" }}>{cls.level}</span>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)" }}>{cls.name}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text3)" }}>· {(cls.subjects || []).length} subjects</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <ActionBtn onClick={() => openClassModal(cls)} icon={IC.edit} title="Edit class" />
                      <ActionBtn onClick={() => deleteClass(cls.id)} icon={IC.trash} title="Delete class" hoverBg="rgba(239,68,68,0.1)" />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {cls.subjects?.map((sub, i) => <span key={i} className="badge badge--teal">{sub}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showClassModal && (
        <Modal title={editingClass ? "Edit Class" : "Add New Class"} onClose={() => setShowClassModal(false)} size="lg">
          <div className="space-y-5">
            <div className="grid-2">
              <Input label="Class Name" required value={classForm.name} onChange={e => setClassForm(p => ({...p, name: e.target.value}))} placeholder={classForm.level === "primary" ? "Standard 5" : "Form 2"} />
              <Select label="Level" required value={classForm.level} onChange={e => setClassForm(p => ({...p, level: e.target.value, subjects: []}))}>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </Select>
            </div>
            <div>
              <label className="field__label">Subjects</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxHeight: 220, overflowY: "auto", padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg)", marginTop: 6 }}>
                {(classForm.level === "primary" ? PRIMARY_SUBJECTS : SECONDARY_SUBJECTS).map((subject, idx) => (
                  <label key={idx} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "7px 10px", borderRadius: 8, color: "var(--text2)" }}>
                    <input type="checkbox" checked={classForm.subjects.includes(subject)} onChange={() => toggleSubject(subject)} style={{ accentColor: "var(--accent)" }} />
                    <span>{subject}</span>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>Defaults applied if none selected.</p>
            </div>
            <div className="data-table__actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              <Btn variant="ghost" onClick={() => setShowClassModal(false)}>Cancel</Btn>
              <Btn onClick={saveClass} variant="gold" loading={loading}>{editingClass ? "Update Class" : "Add Class"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}