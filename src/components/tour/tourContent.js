// What the guided tour says about each module, per dashboard.
//
// Keyed by the same ids the dashboards use in `navItems`, so a module added to
// a dashboard shows up in the tour automatically (with a generic line) even
// before someone writes its entry here. `body` says what the module is;
// `press` completes the sentence "Press <module> …" — it is the "when would I
// want this" half, which is what makes the tour read as a walkthrough rather
// than a feature list.

export const ROLE_INTRO = {
  admin: "manage your school's people, campuses, settings and subscription",
  head: "run the school day to day: classes, staff, timetable, discipline and fees",
  teacher: "plan lessons, take registers, enter marks and stay in touch with parents",
  bursar: "collect fees, issue receipts and keep track of what the school spends",
  director: "keep an eye on every campus in the group",
};

export const TOUR_CONTENT = {
  admin: {
    overview: {
      body: "Your school at a glance: the headline numbers for learners, staff and recent activity.",
      press: "whenever you want to get back to the summary.",
    },
    users: {
      body: "Create and manage staff accounts (teachers, head teachers, bursars, directors). You choose each person's role and which campus they work at.",
      press: "when a new member of staff joins, or someone needs different access.",
    },
    campuses: {
      body: "Where your school's sites are created and named. A campus has to exist here before staff or learners can be placed at it.",
      press: "when you open a new campus or need to rename one.",
    },
    transfers: {
      body: "Learners moving from one campus to another arrive here as requests for you to approve or reject.",
      press: "when a transfer is waiting for your decision.",
    },
    students: {
      body: "The learner register: enrol learners, update their details and request a transfer to another campus.",
      press: "to add a learner or look one up.",
    },
    settings: {
      body: "Your school profile, the current term, whether you have boarders, and other settings that every other module relies on.",
      press: "at the start of a term, or when something about the school changes.",
    },
    billing: {
      body: "What your school owes for the platform, worked out from how many learners are enrolled.",
      press: "to see the current amount or check what has been billed.",
    },
    announcements: {
      body: "Write a notice for the school community.",
      press: "when there is something staff or parents need to know.",
    },
    audit: {
      body: "A record of who changed what, and when.",
      press: "when something looks wrong and you need to trace it back.",
    },
  },

  head: {
    overview: {
      body: "Today's picture of your school: the numbers that tell you whether the day is running well.",
      press: "to come back to the summary.",
    },
    students: {
      body: "Look up any learner, see their details and reach their guardians.",
      press: "when you need a learner's record or a guardian's number.",
    },
    classes: {
      body: "Create classes and streams, assign class teachers, and see each class's activity channel.",
      press: "to set up a new class or change who teaches it.",
    },
    messages: {
      body: "Conversations with parents and guardians. Reply straight from here.",
      press: "when a parent has written to the school.",
    },
    timetable: {
      body: "The weekly timetable: which teacher takes which class in which period.",
      press: "to build the timetable or check who should be where.",
    },
    lessonplans: {
      body: "Read the lesson plans your teachers have written. Filter by teacher, class, subject or status.",
      press: "when you want to see what is being taught, and how it has been prepared.",
    },
    classmonitor: {
      body: "Compares the timetable with teachers' clock-ins, so you can see whether lessons are actually being taken.",
      press: "to check today's lessons as they happen.",
    },
    attendance: {
      body: "Attendance across every class, drawn from the registers teachers take.",
      press: "to spot classes or learners with a pattern of absence.",
    },
    performance: {
      body: "Marks and grades by class and subject, on each section's own grading scale.",
      press: "when you want to see how a class or subject is performing.",
    },
    discipline: {
      body: "Discipline cases logged by teachers, ready for you to review and follow up.",
      press: "when a case needs your attention.",
    },
    reports: {
      body: "Generate reports and export them.",
      press: "when you need something to print, share or file.",
    },
    staff: {
      body: "Your teachers and head teachers, with their classes and subjects.",
      press: "to see who teaches what or update a teacher's assignments.",
    },
    announcements: {
      body: "Write a notice for staff and parents.",
      press: "when there is news the whole school should hear.",
    },
    calendar: {
      body: "Term dates and school events in one calendar.",
      press: "to plan ahead or add an event.",
    },
    readiness: {
      body: "Which learners are ready to sit exams.",
      press: "as exams approach, to find who still has something to sort out.",
    },
    arrears: {
      body: "Who owes fees, and for how long. The bursar supplies the balances; you decide whether a learner may still sit exams.",
      press: "when a learner's fees are affecting their exam entry.",
    },
    admissions: {
      body: "Applications from prospective learners and where each one has got to.",
      press: "to review an application or admit a new learner.",
    },
    boarding: {
      body: "Your hostels and the learners who board.",
      press: "to see who sleeps where.",
    },
    inventory: {
      body: "Track the school's stock and equipment.",
      press: "to record what has come in or gone out.",
    },
  },

  teacher: {
    overview: {
      body: "Your day at a glance: today's lessons, and what still needs doing.",
      press: "to come back to your summary.",
    },
    myclasses: {
      body: "Write your lesson plans here. Give it a class, subject and topic and the assistant can draft the objectives, resources and assessment for you to edit. Your head teacher can read what you write.",
      press: "when you are preparing a lesson.",
    },
    timetable: {
      body: "Your weekly timetable, and where you clock in when a lesson starts and out when it ends.",
      press: "to check your next lesson or to clock in.",
    },
    attendance: {
      body: "Mark each learner present or absent for your class and save the register.",
      press: "at the start of every lesson.",
    },
    marks: {
      body: "Enter learners' assessment scores. Grades follow the school's grading scale for the class.",
      press: "after a test, assignment or exam.",
    },
    discipline: {
      body: "Log a discipline case for one of your learners and follow it up.",
      press: "when something happens that should be on record.",
    },
    students: {
      body: "The learners in the classes you teach.",
      press: "to look up a learner or a guardian's contact.",
    },
    Homework: {
      body: "Set homework with a due date. Parents can see what is coming up.",
      press: "when you want to give your class work to take home.",
    },
    classes: {
      body: "Class Activity: the staffroom, plus a channel for each class, for sharing updates with colleagues.",
      press: "to catch up on what is happening in a class.",
    },
    messages: {
      body: "Conversations with parents and guardians.",
      press: "when a parent has written to you.",
    },
  },

  bursar: {
    overview: {
      body: "Fees collected, fees outstanding and where the money stands this term.",
      press: "to come back to the summary.",
    },
    "fee-structure": {
      body: "Set what each class or category of learner pays, and for which term.",
      press: "at the start of a term, or when a fee changes.",
    },
    "student-fees": {
      body: "Each learner's fees, what has been paid and what is left, with a progress bar per learner.",
      press: "when you need one learner's position.",
    },
    payments: {
      body: "Record a payment against a learner.",
      press: "each time money comes in.",
    },
    receipts: {
      body: "Every receipt issued, ready to print.",
      press: "when a parent asks for proof of payment.",
    },
    arrears: {
      body: "Who owes, and for how long. You supply the balances; the head teacher decides what it means for exam entry.",
      press: "to chase overdue fees.",
    },
    sponsors: {
      body: "Sponsors and bursaries: who is paying for which learner, and whether the money has arrived.",
      press: "to check that a sponsored learner is covered.",
    },
    expenses: {
      body: "What the school has spent, set beside what it has taken in.",
      press: "to record spending or see the term's position.",
    },
    reports: {
      body: "Finance reports: collections, outstanding balances and a class-by-class breakdown.",
      press: "when you need figures for the head teacher or the board.",
    },
  },

  director: {
    overview: {
      body: "How the whole group is doing, and which campus needs you.",
      press: "to come back to the summary.",
    },
    campuses: {
      body: "Every campus side by side.",
      press: "to compare sites or find the one that is struggling.",
    },
    transfers: {
      body: "Learners moving between campuses. You and the school admin approve them.",
      press: "when a transfer is waiting for a decision.",
    },
    finance: {
      body: "The fee position across the group: billed, collected and still owed, campus by campus.",
      press: "to see where the money stands.",
    },
    billing: {
      body: "The school's platform subscription.",
      press: "to see what is billed and when.",
    },
  },
};
