import { useState, useEffect } from "react";
import "./staff-management.css";
import { db } from "../../../firebase";
import {
  collection, query, where, getDocs, doc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import {
  cleanAssignments, fetchSchoolClasses, pruneStaleAssignments, registeredSubjects,
} from "../../../services/staffAssignments";
import {
  BookOpen,
  Eye,
  X,
  Check,
  LayoutGrid,
  Search,
  RefreshCw,
} from "lucide-react";
import { isDeactivated } from "../../../services/staffAccountCore";

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function Spinner() {
  return <div className="spinner" />;
}

function Tag({ label, color = "tag--blue" }) {
  return <span className={`tag ${color}`}>{label}</span>;
}

function StatusPill({ status = "active" }) {
  const isActive = status === "active";
  return (
    <span className={`status-pill ${isActive ? "status-pill--active" : "status-pill--suspended"}`}>
      <span className="status-dot" />
      {isActive ? "Active" : "Suspended"}
    </span>
  );
}

function CheckboxGroup({ items, selected = [], onChange }) {
  const toggle = (item) => {
    if (selected.includes(item)) {
      onChange(selected.filter((x) => x !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  if (items.length === 0) {
    return <p className="empty-assignments">Nothing available to assign</p>;
  }

  return (
    <div className="checkbox-group">
      {items.map((item) => {
        const isSelected = selected.includes(item);
        return (
          <label
            key={item}
            className={`checkbox-label ${isSelected ? "checkbox-label--selected" : ""}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggle(item)}
            />
            <span>{item}</span>
          </label>
        );
      })}
    </div>
  );
}

function AssignModal({ member, allClasses, onSave, onClose }) {
  // Start from what the school still has — a class that has since closed must
  // not ride along unseen and be written back on save.
  const initial = cleanAssignments(member, allClasses);
  const [assignedClasses, setAssignedClasses] = useState(initial.classes);
  const [assignedSubjects, setAssignedSubjects] = useState(initial.subjects);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState("classes");

  const allSubjects = registeredSubjects(allClasses);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await onSave(member.id, assignedClasses, assignedSubjects);
      onClose();
    } catch (err) {
      console.error("Save error:", err);
      if (err.code === "permission-denied") {
        setSaveError(
          "Permission denied. Check that your Firestore security rules allow this role to update assignments."
        );
      } else {
        setSaveError("Failed to save assignments. Please try again.");
      }
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <div>
            <h3>Assign Classes & Subjects</h3>
            <p>{member.name}</p>
          </div>
          <button onClick={onClose} className="modal-close">
            <X size={24} />
          </button>
        </div>

        <div className="modal-tabs">
          <button
            onClick={() => setActiveTab("classes")}
            className={`modal-tab ${activeTab === "classes" ? "modal-tab--active" : ""}`}
          >
            Classes ({assignedClasses.length})
          </button>
          <button
            onClick={() => setActiveTab("subjects")}
            className={`modal-tab ${activeTab === "subjects" ? "modal-tab--active" : ""}`}
          >
            Subjects ({assignedSubjects.length})
          </button>
        </div>

        <div className="modal-body">
          {saveError && <div className="error-message">{saveError}</div>}
          {activeTab === "classes" ? (
            <>
              <p className="text-muted">Select classes this staff member will be responsible for. Only classes registered in School Settings are listed.</p>
              <CheckboxGroup
                items={allClasses.map((c) => c.name)}
                selected={assignedClasses}
                onChange={setAssignedClasses}
              />
            </>
          ) : (
            <>
              <p className="text-muted">Select subjects this staff member teaches. Only subjects offered by a registered class are listed.</p>
              <CheckboxGroup
                items={allSubjects}
                selected={assignedSubjects}
                onChange={setAssignedSubjects}
              />
            </>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn-cancel">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-save">
            {saving ? <Spinner /> : <Check size={18} />}
            Save Assignments
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StaffManagement({ schoolCode, schoolName = "Your School" }) {
  const [staff, setStaff] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("staff");
  const [modal, setModal] = useState(null);
  // What the last load removed from staff records because the class or
  // subject is no longer registered, so the head teacher knows it happened.
  const [cleanupNote, setCleanupNote] = useState("");

  useEffect(() => {
    if (schoolCode) {
      fetchAllData();
    } else {
      setError("School code is missing. Please sign out and sign back in.");
      setLoading(false);
    }
  }, [schoolCode]);

  async function fetchAllData() {
    setLoading(true);
    setError("");
    try {
      const staffSnap = await getDocs(
        query(
          collection(db, "users"),
          where("schoolCode", "==", schoolCode),
          where("role", "in", ["head_teacher", "class_teacher"])
        )
      );
      const rawStaff = staffSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const classes = await fetchSchoolClasses(schoolCode);
      setAllClasses(classes);

      // Show only what the school still has, whether or not the clean-up
      // write below goes through.
      setStaff(rawStaff.filter((m) => !isDeactivated(m)).map((m) => {
        const r = cleanAssignments(m, classes);
        return { ...m, assignedClasses: r.classes, assignedSubjects: r.subjects };
      }));

      try {
        const removed = await pruneStaleAssignments(rawStaff, classes);
        if (removed.length > 0) {
          const gone = [...new Set(removed.flatMap((r) => [...r.staleClasses, ...r.staleSubjects]))];
          setCleanupNote(
            `Removed ${gone.join(", ")} from ${removed.length} staff record${removed.length !== 1 ? "s" : ""} — no longer registered at this school.`
          );
        }
      } catch (err) {
        console.error("Stale assignment clean-up failed:", err);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      if (err.code === "permission-denied") {
        setError("Permission denied loading staff data. Check your Firestore security rules.");
      } else {
        setError("Failed to load data. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const saveAssignments = async (userId, pickedClasses, pickedSubjects) => {
    const { classes: assignedClasses, subjects: assignedSubjects } = cleanAssignments(
      { assignedClasses: pickedClasses, assignedSubjects: pickedSubjects },
      allClasses
    );
    await updateDoc(doc(db, "users", userId), {
      assignedClasses,
      assignedSubjects,
      updatedAt: serverTimestamp(),
    });
    setStaff((prev) =>
      prev.map((m) =>
        m.id === userId ? { ...m, assignedClasses, assignedSubjects } : m
      )
    );
  };

  const filteredStaff = staff.filter((m) => {
    const matchesSearch =
      !search ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const stats = {
    total: staff.length,
    teachers: staff.filter((s) => s.role === "class_teacher").length,
    active: staff.filter((s) => s.status === "active").length,
    covered: new Set(staff.flatMap((s) => s.assignedClasses || [])).size,
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2>Staff Management</h2>
          <p className="text-muted">View staff and assign classes & subjects</p>
        </div>
        <button onClick={fetchAllData} className="btn-refresh">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__value">{stats.total}</div>
          <div className="stat-card__label">Total Staff</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--accent">{stats.teachers}</div>
          <div className="stat-card__label">Teachers</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--success">{stats.active}</div>
          <div className="stat-card__label">Active</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--warning">{stats.covered}</div>
          <div className="stat-card__label">Classes Covered</div>
        </div>
      </div>

      <div className="tab-bar">
        {["staff", "assignments"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab ${activeTab === tab ? "tab--active" : ""}`}
          >
            {tab === "staff" ? "Staff List" : "Class Assignments"}
          </button>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}
      {cleanupNote && <div className="alert alert--info">{cleanupNote}</div>}
      {saveError && <div className="error-message">{saveError}</div>}

      {activeTab === "staff" && (
        <>
          <div className="filter-group">
            {["all", "head_teacher", "class_teacher"].map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`filter-btn ${roleFilter === role ? "filter-btn--active" : ""}`}
              >
                {role === "all" ? "All Staff" : role === "head_teacher" ? "Head Teachers" : "Class Teachers"}
                {" "}({role === "all" ? staff.length : staff.filter((s) => s.role === role).length})
              </button>
            ))}
          </div>

          <div className="search-wrapper">
            <Search className="search-icon" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="search-input"
            />
          </div>

          <div className="data-table-wrap">
            {loading ? (
              <div className="empty-state">
                <Spinner />
                <p className="empty-state__sub">Loading staff...</p>
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__sub">No staff found</p>
              </div>
            ) : (
              <table className="data-table data-table--stack">
                <thead>
                  <tr>
                    <th>STAFF</th>
                    <th>ROLE</th>
                    <th>CLASSES</th>
                    <th>SUBJECTS</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((member) => (
                    <tr key={member.id}>
                      <td data-label="STAFF">
                        <div className="flex items-center gap-4">
                          <div className="assignment-avatar">{initials(member.name)}</div>
                          <div>
                            <p className="truncate" style={{ fontWeight: 500 }}>{member.name}</p>
                            <p className="text-muted" style={{ fontSize: "0.7rem" }}>{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td data-label="ROLE">
                        {member.role === "head_teacher" ? "Head Teacher" : "Class Teacher"}
                      </td>
                      <td data-label="CLASSES">
                        {member.assignedClasses?.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {member.assignedClasses.map((c) => (
                              <Tag key={c} label={c} color="tag--blue" />
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td data-label="SUBJECTS">
                        {member.assignedSubjects?.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {member.assignedSubjects.slice(0, 3).map((s) => (
                              <Tag key={s} label={s} color="tag--green" />
                            ))}
                            {member.assignedSubjects.length > 3 && (
                              <Tag label={`+${member.assignedSubjects.length - 3}`} color="tag--neutral" />
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td data-label="STATUS">
                        <StatusPill status={member.status} />
                      </td>
                      <td data-label="ACTIONS">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setModal({ mode: "view", member })}
                            className="icon-btn"
                            title="View"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            onClick={() => setModal({ mode: "assign", member })}
                            className="icon-btn icon-btn--assign"
                            title="Assign classes & subjects"
                          >
                            <BookOpen size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {activeTab === "assignments" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loading ? (
            <div className="col-span-2 empty-state">
              <Spinner />
              <p className="empty-state__sub">Loading classes...</p>
            </div>
          ) : allClasses.length === 0 ? (
            <div className="col-span-2 empty-state">
              <LayoutGrid className="empty-state__icon" size={48} />
              <p className="empty-state__title">No classes found</p>
              <p className="empty-state__sub">Create classes in the Admin Dashboard first</p>
            </div>
          ) : (
            allClasses.map((cls) => {
              const assigned = staff.filter((t) => t.assignedClasses?.includes(cls.name));
              return (
                <div key={cls.id} className="assignment-card">
                  <div className="assignment-card__header">
                    <div>
                      <h3 className="assignment-card__title">{cls.name}</h3>
                      <p className="text-muted">{cls.subjects?.length || 0} subjects</p>
                    </div>
                    <span className="assignment-card__count">
                      {assigned.length} teacher{assigned.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="assignment-list">
                    {assigned.length > 0 ? (
                      assigned.map((teacher) => (
                        <div key={teacher.id} className="assignment-item">
                          <div className="flex items-center gap-4">
                            <div className="assignment-avatar">{initials(teacher.name)}</div>
                            <div>
                              <p style={{ fontWeight: 500 }}>{teacher.name}</p>
                              <p className="text-muted">{teacher.assignedSubjects?.length || 0} subjects</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setModal({ mode: "assign", member: teacher })}
                            className="icon-btn icon-btn--assign"
                            title="Edit assignments"
                          >
                            <BookOpen size={18} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="empty-assignments">No teachers assigned yet</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {modal?.mode === "assign" && (
        <AssignModal
          member={modal.member}
          allClasses={allClasses}
          onSave={saveAssignments}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}