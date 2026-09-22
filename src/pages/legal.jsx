// Terms of Service and Privacy Policy, at /terms and /privacy.
//
// Written to describe what the platform actually does: a school is the party
// that decides what to record about its learners, and Acalink processes that
// record on the school's behalf. The sections name the real third parties in
// the data path (Google Cloud/Firebase, Vercel, PayChangu, WaAPI/WhatsApp,
// Twilio) because a privacy policy that omits the messaging gateway is the one
// a school's own parents will ask about first.
//
// ── READ THIS BEFORE LAUNCH ─────────────────────────────────────────────────
// This is a careful draft, not legal advice. Have a Malawian lawyer review it —
// particularly the data-protection sections, since it covers children's records
// — and fill in the bracketed company details. Then set LEGAL_IS_DRAFT to false
// to remove the banner, and bump LEGAL_VERSION in services/legal.js so schools
// re-accept.
import { Link } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { BRAND } from "../components/brand";
import { LEGAL_UPDATED } from "../services/legal";

const LEGAL_IS_DRAFT = true;
const COMPANY = "[Acalink legal entity name]";
const CONTACT = "[Acalink support email or phone]";

const TERMS = [
  ["Who these terms are between", [
    `These terms are an agreement between ${COMPANY} ("${BRAND}", "we") and the school that registers for an account ("the school", "you"). By registering, or by using ${BRAND} on the school's behalf, you confirm you are authorised to accept them for the school.`,
  ]],
  ["What we provide", [
    `${BRAND} is a school management platform: registers, lesson plans, marks and report cards, fee records, timetables, messaging to guardians and staff, and related tools. It is provided over the internet and through a guardian mobile app.`,
  ]],
  ["Registration and approval", [
    "A new school is reviewed before it goes live. We may approve, decline or later suspend a school, for example if the details given are false, if the account is misused, or if fees are unpaid. If we decline or suspend a school we will say why.",
    "You must give accurate details and keep your sign-in details private. The school is responsible for everything done under its accounts, including those of the staff it adds.",
  ]],
  ["Free trial and fees", [
    "A school starts with a free trial (30 days from approval unless we tell you otherwise). After that, use of the platform requires a paid subscription, charged per learner per term as shown in Billing and on our pricing page, in Malawi Kwacha.",
    "If the trial or a paid period ends, we give a short grace period. After it, access is limited to renewing the subscription. The school's data is kept and access returns when the school subscribes.",
    "Payments are handled by PayChangu. We do not receive or store card or mobile-money PINs.",
  ]],
  ["The school's data", [
    "The school owns the data it puts into the platform, including its learners' records. We use it only to run the service for the school, as described in the Privacy Policy. The school can export its data at any time from Data & Backup.",
    "The school is responsible for having a proper basis to hold information about its learners, staff and guardians, for telling guardians how it is used, and for keeping it accurate.",
  ]],
  ["Messages to guardians and staff", [
    "The platform sends alerts (for example absences, results, fee balances and notices) by WhatsApp, in-app notification and, where the school has switched it on, SMS. The school decides which alerts are sent. A guardian can stop WhatsApp alerts at any time by replying STOP to any message.",
    "WhatsApp messages are sent through a third-party gateway. Delivery depends on WhatsApp and the recipient's phone, and we cannot guarantee that every message is delivered or read.",
  ]],
  ["Acceptable use", [
    "You must not use the platform to break the law, to harass or mislead anyone, to send unsolicited bulk messages, to attempt to access another school's data, or to disrupt the service. We may suspend an account that does.",
  ]],
  ["Availability and backups", [
    "We aim to keep the service available but do not promise it will be uninterrupted or error-free. Schools should use the export tools to keep their own copies of important records.",
  ]],
  ["Liability", [
    "To the extent the law allows, we are not liable for indirect or consequential loss, or for loss caused by events outside our control such as network or power failure or a third-party gateway going down. Our total liability for a claim is limited to the fees the school paid us in the three months before it arose.",
  ]],
  ["Ending the agreement", [
    "The school may stop using the platform at any time. We may end or suspend the agreement as described above. On request we will provide the school's data for export before deleting it.",
  ]],
  ["Changes and governing law", [
    "We may update these terms; we will tell schools about material changes and record which version each school accepted. These terms are governed by the laws of Malawi.",
  ]],
  ["Contact", [`Questions about these terms: ${CONTACT}.`]],
];

const PRIVACY = [
  ["Who we are and our role", [
    `${COMPANY} ("${BRAND}") provides the platform. For learner, guardian and staff records, the school decides what is recorded and why, and ${BRAND} processes that information on the school's behalf. For the school's own account and billing details, ${BRAND} decides how they are used.`,
  ]],
  ["What information is held", [
    "Learners: name, class, admission details, guardian name and phone number, attendance, marks and report cards, discipline records, homework, fee balances, and, where the school records them, health information (allergies, conditions, sick-bay visits), boarding, transport and library records.",
    "Guardians: name, phone number, language preference, and the messages, payments and alerts exchanged with the school.",
    "Staff: name, email, phone number, role, classes taught, timetable, clock-in records, and leave requests.",
    "The school: name, district, address, contact details, subscription and payment records.",
    "Technical data: sign-in events, device tokens for app notifications, and delivery logs showing whether an alert was sent.",
  ]],
  ["Why we use it", [
    "To run the platform for the school: to record and show information to the people entitled to see it, to send the alerts the school chooses to send, to process payments, to keep the service secure, and to support schools that ask for help. We do not sell personal information and we do not use learners' records for advertising.",
  ]],
  ["Who else handles it", [
    "We use service providers to operate the platform: Google Cloud / Firebase (database, authentication and push notifications), Vercel (hosting), PayChangu (payment processing), a WhatsApp gateway (WaAPI) to deliver WhatsApp messages, and Twilio for SMS where a school switches that on. They handle information only to provide their service to us.",
    "Some of these providers process information outside Malawi. We choose providers that protect information to a reasonable standard.",
  ]],
  ["Who can see what", [
    "Access inside a school follows role: for example a class teacher sees their own classes, the head teacher sees the school, the bursar sees fees, and health information is visible to staff who need it to keep a child safe. One school cannot see another school's data. Acalink staff access school data only to run and support the service.",
  ]],
  ["Messages and opting out", [
    "Guardian phone numbers are used to send the alerts the school has chosen. A guardian can reply STOP to any WhatsApp message to stop them, and START to receive them again. A guardian who wants a record corrected or removed should ask the school.",
  ]],
  ["How long it is kept", [
    "School records are kept while the school uses the platform and are available for export. In-app notifications expire after 90 days and the outbox of sent messages after 14 days. When a school leaves, we delete its data after giving it the chance to export it, unless the law requires us to keep something.",
  ]],
  ["Children's information", [
    "Learners' records are held by the school and used only for the school's educational and administrative purposes. Health information is more sensitive and is shown only to staff who need it.",
  ]],
  ["Security", [
    "Access requires sign-in, is limited by role, and is separated between schools. Sensitive accounts can use a second step by WhatsApp code. No system is completely secure; if we learn of a breach affecting personal information we will tell the affected school promptly.",
  ]],
  ["Your rights", [
    "You can ask the school, and where the request concerns information we control, us, to see, correct or delete personal information, subject to legal limits. If you are unhappy with how information is handled you may complain to the relevant data-protection authority in Malawi.",
  ]],
  ["Changes and contact", [
    `We will update this policy when our practices change and show the date at the top. Questions: ${CONTACT}.`,
  ]],
];

function LegalPage({ title, sections, otherTo, otherLabel }) {
  return (
    <AuthLayout wide>
      <article className="la-card la-legal">
        {LEGAL_IS_DRAFT && (
          <p className="la-legal__draft">
            Draft: these documents are awaiting legal review and may change before launch.
          </p>
        )}
        <p className="lp-eyebrow">{BRAND}</p>
        <h1 className="form-heading">{title}</h1>
        <p className="form-hint">Last updated {LEGAL_UPDATED}</p>

        {sections.map(([heading, paras], i) => (
          <section key={heading}>
            <h2>{i + 1}. {heading}</h2>
            {paras.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}

        <p className="la-legal__more"><Link to={otherTo}>{otherLabel}</Link> · <Link to="/register">Register your school</Link></p>
      </article>
    </AuthLayout>
  );
}

export function Terms() {
  return <LegalPage title="Terms of Service" sections={TERMS} otherTo="/privacy" otherLabel="Read the Privacy Policy" />;
}

export function Privacy() {
  return <LegalPage title="Privacy Policy" sections={PRIVACY} otherTo="/terms" otherLabel="Read the Terms of Service" />;
}
