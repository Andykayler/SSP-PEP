# Campuses, and who can see across them

## The problem

A Malawian school group is frequently one legal school teaching from two or
three sites. Before this, the only unit in the product was `schoolCode`, so
those sites had two options and both were wrong:

- **Register separately** — and lose the shared board, shared billing and any
  report that covers the group.
- **Share one school code** — and have every class list, register and fee ledger
  silently mix children who have never met.

## The model

The school stays the unit of *ownership*. The campus is the unit of
*operation*.

```
schools/{schoolCode}
  └── campuses/{campusId}        { schoolCode, name, code, isPrimary, status }
       ├── students              student.campusId
       ├── staff                 user.campusIds[] / user.allCampuses
       └── everything they touch — classes, registers, marks, fee records
```

- A campus belongs to exactly one school and cannot be moved.
- The **first** campus created is the primary site. Anything with no `campusId`
  — every record that predates this feature — is attributed to it, so no
  school's history silently vanishes from its own totals.
- Campuses are **archived**, never deleted. Attendance, marks and payments all
  carry a `campusId`; removing the document they point at would turn years of
  records into rows labelled "Unknown campus".

### Staff scope

Two fields, because *"all"* and *"these three"* are different claims:

| Field | Meaning |
|---|---|
| `allCampuses: true` | Sees every campus, **including any opened later** |
| `campusIds: [a, b]` | Sees exactly those, and does not silently gain a new one |

Set in **Admin → User Management**, where the picker only appears once a school
actually runs more than one site. A director is always school-wide — that is
what the role is — so the control is shown ticked and disabled for them.

Someone with no campus assigned falls back to the primary site rather than to
nothing. An unassigned teacher seeing an empty product looks like a bug.

### Moving a student between campuses

Not a field edit. A request, then a decision:

1. Anyone on staff raises it (Admin → Students → the transfer icon).
2. It sits in **Campus Transfers** as `pending`. Nothing about the student
   changes.
3. An **administrator or director** approves or declines it. Only those two
   roles: the whole point is that someone with sight of *both* campuses signs it
   off, and a head teacher runs one site.
4. On approval the student's `campusId` moves **and their class placement is
   cleared** — class names repeat across campuses ("Form 2A" exists on both), so
   carrying the old value over would list a child in a register taken by
   different staff for different children. The receiving campus places them.

Firestore rules enforce this: a request can only be created `pending`, only the
status fields may change afterwards, and the director's single write permission
on `students` is narrowed to the campus fields.

### Why campus scoping is enforced in the app, not in rules

The **school** boundary is a security boundary and is enforced in
`firestore.rules` on every collection — one school must never read another's
children.

The **campus** boundary inside a school is operational: everyone on either side
is staff of the same school, under the same head. Enforcing it in rules would
cost a `users/{uid}` read per row on every list query, against a hard budget of
ten document accesses per query — a list of twenty students would be refused
outright — and would break every list the moment a campus was reassigned
mid-session, indistinguishably from a permissions bug.

The exception is the *move*, which is a real authority question and **is**
enforced in rules. See the CAMPUS SCOPING note at the foot of `firestore.rules`.

---

## The director role

A director sits above the head teachers: they own the school as an institution
rather than any one of its campuses. Schools were handing them an administrator
login, which gave them power to create accounts, edit rolls and delete records —
none of which they want, and all of which they would later be signing off on.

**Portal:** `/director` — created like any other account, in
**Admin → User Management → Role → Director**.

| Screen | What it does |
|---|---|
| School Overview | Group totals, per-campus comparison, establishment, what needs them |
| Campuses | The same measures per site, ranked, against the group average |
| Campus Transfers | The one decision they own |
| Fee Position | Billed / collected / outstanding, per campus |
| Subscription | What the group pays Acalink — and pays it |

Beyond those five, the portal lists **every module the school runs** — Students,
Classes, Attendance, Homework, Results & Performance, Exams, Report Cards,
Timetable, Discipline, Student Fees, Payments, Receipts, Arrears, Expenses,
Staff, Health, Boarding, Library, Audit Log and the rest — all view-only. The
staff modules are the real ones shown through `<ViewOnly>`
(`src/components/ui/ViewOnly.jsx`), which hides controls that add, edit,
delete, approve or send. That wrapper is a courtesy; the control is
`firestore.rules`: `canOversee()` lets a director *read* what a head teacher
reads, and `!isDirector()` is on every create/update/delete rule for the
records staff keep (attendance, marks, homework, lesson plans, discipline,
boarding, sick bay, inventory). Pinned by
`tests/rules/director-oversight.rules.test.js`.

Everything else is read-only by design. A director who can quietly change a roll
or a balance while also being the person who signs off on them is an audit
finding waiting to happen. In `firestore.rules`, `isDirector()` is deliberately
kept **out** of `isAdminOrHead()`, which grants write access to students, marks
and registers; where a director genuinely needs to write, the rule says so.

Figures are read live from the school's own collections. There is no nightly
summary document, because a stale summary is how leadership dashboards fail: the
number on the director's screen and the number in the bursar's ledger disagree,
and nobody can say which is right.

## Setting a school up

**Admin → first sign-in** now asks three questions instead of two:

1. Day, boarding, or both.
2. Which term is running.
3. **How many sites the school teaches from**, and their names.

The campus question is asked at setup and not left to settings because campuses
have to exist before the first student is enrolled. A school that registers
eight hundred children and *then* splits into two sites has to move eight
hundred records, each one through an approval.

A single-campus school never sees a campus picker anywhere in the product. Add a
second site under **Admin → Campuses** and scoping switches on across the board;
existing students and staff stay on the main campus until they are moved.

---

## The parent app

`Student` now carries `campusId` and `campusName`, read from the same record the
admin panel writes. Both are empty for every child enrolled before campuses
existed and for any single-campus school, so **read `""` as "the main campus",
never as an error**.

The only place it surfaces is the student picker, where the card shows the
campus in place of the school name when one is recorded — a guardian with
children at the town and rural sites of the same school otherwise sees two
identical cards. Campus search matches on it too.

Nothing else in the app is campus-scoped, and nothing should be: a guardian sees
one child at a time, and that child is on exactly one campus. The scoping that
matters is on the staff side, where someone can be responsible for a roll they
should not see.
