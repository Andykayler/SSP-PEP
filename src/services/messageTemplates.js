// src/services/messageTemplates.js
// ─────────────────────────────────────────────────────────────────────────────
// The wording of everything the school sends a guardian, in English and
// Chichewa, kept in one place so a school's language choice reaches every
// alert and nobody has to hunt through the modules to change a sentence.
//
// Each template returns { title, body, titleNy, bodyNy }. The in-app inbox
// always shows the English pair; the delivery function (functions/index.js)
// sends WhatsApp and SMS in the guardian's language — `students.guardianLanguage`
// ("ny" | "en"), falling back to the school's `defaultLanguage`.
//
// Chichewa is deliberately plain and short: these are read on a phone, often
// by someone reading in their second language of the day. The wording here was
// written by an English speaker and should be read over by a Chichewa speaker
// before it is relied on — see docs/whatsapp-first-notifications.md.
// ─────────────────────────────────────────────────────────────────────────────

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "ny", label: "Chichewa" },
];

const money = (n) => `MK ${Number(n || 0).toLocaleString()}`;

/** The name a message should use for a learner. */
export function learnerName(s) {
  return s?.fullName || s?.studentName || `${s?.firstName || ""} ${s?.lastName || ""}`.trim() || "your child";
}

export const tpl = {
  attendance(student, status, className, dateLabel) {
    const name = learnerName(student);
    const late = status === "Late";
    return {
      title: `${name} was marked ${status.toLowerCase()}`,
      body: `${className || "Class"} register for ${dateLabel}.`,
      titleNy: late ? `${name} anachedwa kufika ku sukulu lero` : `${name} sanabwere ku sukulu lero`,
      bodyNy: `Kalasi ${className || ""}, ${dateLabel}.${late ? "" : " Chonde tidziwitseni chifukwa."}`,
    };
  },

  marks({ subject, assessment, className, term }) {
    return {
      title: `New ${subject || "subject"} results available`,
      body: `${assessment || "Assessment"} marks for ${className || "your child's class"}${term ? ` · ${term}` : ""} have been published.`,
      titleNy: `Zotsatira zatsopano za ${subject || "phunziro"} zilipo`,
      bodyNy: `${assessment || "Mayeso"} a ${className || "kalasi"}${term ? ` · ${term}` : ""} atuluka.`,
    };
  },

  homework({ subject, title, dueLabel }) {
    return {
      title: `New homework: ${subject || "assignment"}`,
      body: `${title}${dueLabel ? ` — due ${dueLabel}` : ""}`,
      titleNy: `Homuweki yatsopano: ${subject || ""}`.trim(),
      bodyNy: `${title}${dueLabel ? ` — tsiku lomaliza ${dueLabel}` : ""}`,
    };
  },

  payment(student, { amount, method, receiptNumber, balance }) {
    const name = learnerName(student);
    const hasBal = balance !== undefined && balance !== null;
    return {
      title: `Payment received — ${money(amount)}`,
      body: `${method || "Payment"} for ${name}`
        + `${receiptNumber ? ` · Receipt ${receiptNumber}` : ""}`
        + `${hasBal ? ` · Balance ${money(balance)}` : ""}`,
      titleNy: `Talandira ${money(amount)}`,
      bodyNy: `${method || "Malipiro"} a ${name}`
        + `${receiptNumber ? ` · Risiti ${receiptNumber}` : ""}`
        + `${hasBal ? ` · Ndalama zotsala ${money(balance)}` : ""}. Zikomo.`,
    };
  },

  /** A request to pay, with the way to do it: reply in the same chat (see api/whatsapp/webhook.js). */
  payPrompt(student, { balance }) {
    const name = learnerName(student);
    return {
      title: `Fee balance for ${name}: ${money(balance)}`,
      body: `The balance owing is ${money(balance)}. To pay, reply "Make Payment" here on WhatsApp and pay with Airtel Money or TNM Mpamba.`,
      titleNy: `Ndalama zotsala za ${name}: ${money(balance)}`,
      bodyNy: `Ndalama zotsala ndi ${money(balance)}. Kuti mulipire, tumizani "Make Payment" pano pa WhatsApp ndipo mulipire ndi Airtel Money kapena TNM Mpamba.`,
    };
  },

  discipline(student, { offense, action }) {
    const name = learnerName(student);
    return {
      title: `Discipline record for ${name}`,
      body: `${offense}${action ? ` · Action: ${action}` : ""}`,
      titleNy: `Nkhani ya chilango yokhudza ${name}`,
      bodyNy: `${offense}${action ? ` · ${action}` : ""}. Chonde lankhulani ndi sukulu.`,
    };
  },

  report(student, { term }) {
    const name = learnerName(student);
    return {
      title: `${name}'s ${term || "term"} report is ready`,
      body: "Report cards have been issued. Contact the school to collect it.",
      titleNy: `Lipoti la ${name} lakonzeka`,
      bodyNy: `Lipoti la ${term || "nthawi"} latuluka. Chonde lankhulani ndi sukulu kuti mulitenge.`,
    };
  },

  examTimetable(student, { examName, firstDate, papers }) {
    const name = learnerName(student);
    return {
      title: `${examName}: timetable for ${name}`,
      body: `Starts ${firstDate}. ${papers}`,
      titleNy: `${examName}: ndandanda ya mayeso a ${name}`,
      bodyNy: `Ayamba ${firstDate}. ${papers}`,
    };
  },

  transportDelay(student, { route, minutes, note }) {
    const name = learnerName(student);
    return {
      title: `Bus delay — ${route}`,
      body: `${name}'s bus is running about ${minutes} minutes late.${note ? ` ${note}` : ""}`,
      titleNy: `Basi ikuchedwa — ${route}`,
      bodyNy: `Basi ya ${name} ikuchedwa pafupifupi mphindi ${minutes}.${note ? ` ${note}` : ""}`,
    };
  },

  sickbay(student, { complaint, action, sentHome }) {
    const name = learnerName(student);
    return {
      title: `${name} was seen at the sick bay`,
      body: `${complaint}${action ? ` · ${action}` : ""}${sentHome ? " · Please collect them." : ""}`,
      titleNy: `${name} anaonana ndi nesi ku sukulu`,
      bodyNy: `${complaint}${action ? ` · ${action}` : ""}${sentHome ? " · Chonde abwere kudzamutenga." : ""}`,
    };
  },

  libraryOverdue(student, { title, days }) {
    const name = learnerName(student);
    return {
      title: `Library book overdue — ${name}`,
      body: `"${title}" is ${days} day${days === 1 ? "" : "s"} overdue. Please return it to the school library.`,
      titleNy: `Buku la laibulale lachedwa — ${name}`,
      bodyNy: `"${title}" lachedwa masiku ${days}. Chonde libwezereni ku laibulale ya sukulu.`,
    };
  },

  atRisk(student, { reasons }) {
    const name = learnerName(student);
    return {
      title: `We'd like to talk about ${name}`,
      body: `${reasons} Please contact the school so we can help.`,
      titleNy: `Tikufuna kulankhula za ${name}`,
      bodyNy: `Chonde lankhulani ndi sukulu kuti tithandize ${name}.`,
    };
  },
};
