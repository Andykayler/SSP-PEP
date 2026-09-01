// src/components/activity/ActivityFeed.jsx
// Threaded discussion for a class / stream — the "Activity" tab inside
// Classes & Streams. Post a topic, reply to it, quote a specific reply,
// @-mention a colleague (which pings their notification bell), react, pin
// and resolve.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare, Send, Reply, Pin, PinOff, CheckCircle2, Trash2, X,
  Smile, AtSign, Filter, Loader2, CornerDownRight, Users, Paperclip,
  FileText, FileSpreadsheet, FileImage, File, Download, AlertTriangle,
} from "lucide-react";
import {
  subscribeThreads, subscribeReplies, createThread, addReply, toggleReaction,
  setThreadFlag, deleteThread, deleteReply, renderTokens, REACTIONS,
  uploadAttachments, validateAttachments, formatBytes, describeError,
  MAX_ATTACHMENTS,
} from "../../services/activity";
import { relativeTime } from "../../services/notifications";
import "./activity.css";

// ─── Mention plumbing ────────────────────────────────────────────────────────
// The textarea holds friendly text ("@Grace Banda"), not storage tokens. Only
// members the author actually picked from the dropdown are converted to
// `@[Name](uid)` on submit, so typing "@lunch" never accidentally pings anyone.
function serializeMentions(text, picked) {
  let out = text;
  [...picked]
    .sort((a, b) => b.name.length - a.name.length)
    .forEach((m) => {
      out = out.split(`@${m.name}`).join(`@[${m.name}](${m.id})`);
    });
  return out;
}

function roleLabel(role) {
  if (role === "head_teacher") return "Head Teacher";
  if (role === "class_teacher") return "Teacher";
  if (role === "bursar") return "Bursar";
  if (role === "admin") return "Admin";
  return role || "Staff";
}

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

// Deterministic avatar tint so the same person keeps the same colour.
const AVATAR_TINTS = ["#4f6ef7", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6"];
function tintFor(id = "") {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

function Avatar({ name, id, size = 32 }) {
  return (
    <span
      className="act-avatar"
      style={{ width: size, height: size, background: tintFor(id), fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

// Icon per file family. Everything unrecognised falls back to a generic page
// rather than guessing wrong.
function iconForType(type = "", name = "") {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (type.startsWith("image/")) return FileImage;
  if (type === "application/pdf" || ext === "pdf") return FileText;
  if (type.includes("sheet") || ["xls", "xlsx", "csv"].includes(ext)) return FileSpreadsheet;
  if (type.includes("word") || ["doc", "docx"].includes(ext)) return FileText;
  return File;
}

function AttachmentList({ attachments }) {
  if (!attachments?.length) return null;
  return (
    <div className="act-files">
      {attachments.map((a) => {
        const Icon = iconForType(a.type, a.name);
        const isImage = a.type?.startsWith("image/");
        return (
          <a
            key={a.path || a.url}
            className={`act-file ${isImage ? "act-file--image" : ""}`}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`${a.name} · ${formatBytes(a.size)}`}
          >
            {isImage ? (
              <img className="act-file__thumb" src={a.url} alt={a.name} loading="lazy" />
            ) : (
              <span className="act-file__icon"><Icon size={16} /></span>
            )}
            <span className="act-file__meta">
              <span className="act-file__name">{a.name}</span>
              <span className="act-file__size">{formatBytes(a.size)}</span>
            </span>
            <Download size={13} className="act-file__dl" />
          </a>
        );
      })}
    </div>
  );
}

function RichBody({ body, currentUserId }) {
  return (
    <p className="act-body">
      {renderTokens(body).map((t, i) => (
        t.type === "mention" ? (
          <span
            key={`m${i}`}
            className={`act-mention ${t.id === currentUserId ? "act-mention--me" : ""}`}
          >
            @{t.value}
          </span>
        ) : (
          <span key={`t${i}`}>{t.value}</span>
        )
      ))}
    </p>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────
function Composer({
  members, currentUser, schoolCode, placeholder, withTitle = false,
  autoFocus = false, submitLabel = "Post", onSubmit, onCancel, replyingTo,
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState([]);
  const [menu, setMenu] = useState(null); // { query, from }
  const [busy, setBusy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState("");
  const areaRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (autoFocus) areaRef.current?.focus();
  }, [autoFocus]);

  // Opens the mention menu when the caret sits inside a fresh "@word".
  const syncMentionMenu = (value, caret) => {
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return setMenu(null);
    const fragment = upto.slice(at + 1);
    // A mention fragment is a short run without a newline; a space is allowed
    // so "@Grace Ban" still matches a two-word name.
    if (fragment.includes("\n") || fragment.length > 24) return setMenu(null);
    if (at > 0 && !/[\s(]/.test(value[at - 1])) return setMenu(null);
    setMenu({ query: fragment.toLowerCase(), from: at });
  };

  const handleChange = (e) => {
    const { value, selectionStart } = e.target;
    setText(value);
    syncMentionMenu(value, selectionStart);
  };

  const candidates = useMemo(() => {
    if (!menu) return [];
    return members
      .filter((m) => m.id !== currentUser.id)
      .filter((m) => !menu.query || m.name.toLowerCase().includes(menu.query))
      .slice(0, 6);
  }, [menu, members, currentUser.id]);

  const pick = (member) => {
    if (!menu) return;
    const before = text.slice(0, menu.from);
    const after = text.slice(areaRef.current?.selectionStart ?? text.length);
    const next = `${before}@${member.name} ${after}`;
    setText(next);
    setPicked((prev) => (prev.some((p) => p.id === member.id) ? prev : [...prev, member]));
    setMenu(null);
    requestAnimationFrame(() => {
      const caret = before.length + member.name.length + 2;
      areaRef.current?.focus();
      areaRef.current?.setSelectionRange(caret, caret);
    });
  };

  const insert = (chunk) => {
    setText((t) => t + chunk);
    setShowEmoji(false);
    areaRef.current?.focus();
  };

  const addFiles = (picked_) => {
    const next = [...files, ...picked_];
    const problem = validateAttachments(next);
    if (problem) { setFileError(problem); return; }
    setFileError("");
    setFiles(next);
  };

  const handlePick = (e) => {
    addFiles(Array.from(e.target.files || []));
    // Reset so picking the same file twice in a row still fires onChange.
    e.target.value = "";
  };

  // A post with only files and no words is still worth sending.
  const canSubmit = (text.trim() || files.length > 0) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setFileError("");
    try {
      const attachments = await uploadAttachments(files, {
        schoolCode,
        authorId: currentUser.id,
      });
      await onSubmit({
        title: title.trim(),
        body: serializeMentions(text.trim(), picked),
        attachments,
      });
      setTitle("");
      setText("");
      setPicked([]);
      setFiles([]);
    } catch (err) {
      console.error("[activity] post failed:", err);
      setFileError(
        err.code === "storage/unauthorized"
          ? "Upload refused — the Storage rules for activity/ need deploying."
          : `Could not post: ${err.message}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e) => {
    if (menu && candidates.length && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      pick(candidates[0]);
      return;
    }
    if (e.key === "Escape" && menu) { setMenu(null); return; }
    // Ctrl/Cmd+Enter sends, plain Enter keeps making paragraphs.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
  };

  return (
    <div className={`act-composer ${replyingTo ? "act-composer--reply" : ""}`}>
      {replyingTo && (
        <div className="act-quote">
          <CornerDownRight size={13} />
          <span className="act-quote__who">{replyingTo.authorName}</span>
          <span className="act-quote__text">{replyingTo.excerpt}</span>
          <button type="button" className="act-quote__x" onClick={onCancel} aria-label="Cancel reply">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="act-composer__row">
        <Avatar name={currentUser.name} id={currentUser.id} size={30} />
        <div className="act-composer__fields">
          {withTitle && (
            <input
              className="act-title-input"
              placeholder="Topic (e.g. Form 2A end-of-term revision plan)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          )}
          <div className="act-area-wrap">
            <textarea
              ref={areaRef}
              className="act-area"
              placeholder={placeholder}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              rows={withTitle ? 3 : 2}
            />
            {menu && candidates.length > 0 && (
              <div className="act-mention-menu" role="listbox">
                <div className="act-mention-menu__head">
                  <AtSign size={11} /> Mention someone
                </div>
                {candidates.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="act-mention-opt"
                    onMouseDown={(e) => { e.preventDefault(); pick(m); }}
                  >
                    <Avatar name={m.name} id={m.id} size={22} />
                    <span className="act-mention-opt__name">{m.name}</span>
                    <span className="act-mention-opt__role">{roleLabel(m.role)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div className="act-pending">
              {files.map((f, i) => {
                const Icon = iconForType(f.type, f.name);
                return (
                  <span className="act-pending__chip" key={`${f.name}-${i}`}>
                    <Icon size={13} />
                    <span className="act-pending__name">{f.name}</span>
                    <span className="act-pending__size">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {fileError && <div className="act-inline-error">{fileError}</div>}

          <div className="act-composer__foot">
            <div className="act-composer__tools">
              <button
                type="button"
                className="act-tool"
                title="Mention someone"
                onClick={() => insert("@")}
              >
                <AtSign size={14} />
              </button>
              <button
                type="button"
                className="act-tool"
                title={`Attach a document (up to ${MAX_ATTACHMENTS} files)`}
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip size={14} />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={handlePick}
              />
              <div className="act-emoji-wrap">
                <button
                  type="button"
                  className="act-tool"
                  title="Add emoji"
                  onClick={() => setShowEmoji((v) => !v)}
                >
                  <Smile size={14} />
                </button>
                {showEmoji && (
                  <div className="act-emoji-pop">
                    {["👍", "🎉", "✅", "⚠️", "📌", "🙏", "😊", "🔥"].map((e) => (
                      <button key={e} type="button" onClick={() => insert(e)}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
              {picked.length > 0 && (
                <span className="act-composer__pinged">
                  Will notify {picked.map((p) => p.name.split(" ")[0]).join(", ")}
                </span>
              )}
            </div>
            <div className="act-composer__actions">
              {onCancel && (
                <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
                  Cancel
                </button>
              )}
              <button
                type="button"
                className="btn btn--accent btn--sm"
                onClick={submit}
                disabled={!canSubmit}
              >
                {busy ? <Loader2 size={13} className="act-spin" /> : <Send size={13} />}
                {busy && files.length > 0 ? "Uploading…" : submitLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Reactions ───────────────────────────────────────────────────────────────
function ReactionBar({ reactions = {}, onToggle, currentUserId }) {
  const [open, setOpen] = useState(false);
  const active = Object.entries(reactions).filter(([, users]) => (users || []).length > 0);

  return (
    <div className="act-reactions">
      {active.map(([emoji, users]) => {
        const mine = (users || []).includes(currentUserId);
        return (
          <button
            key={emoji}
            type="button"
            className={`act-reaction ${mine ? "act-reaction--mine" : ""}`}
            onClick={() => onToggle(emoji, mine)}
            title={mine ? "Remove your reaction" : "React"}
          >
            <span>{emoji}</span>
            <span className="act-reaction__n">{users.length}</span>
          </button>
        );
      })}
      <div className="act-emoji-wrap">
        <button
          type="button"
          className="act-reaction act-reaction--add"
          onClick={() => setOpen((v) => !v)}
          aria-label="Add reaction"
        >
          <Smile size={13} />
        </button>
        {open && (
          <div className="act-emoji-pop">
            {REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  onToggle(e, (reactions[e] || []).includes(currentUserId));
                  setOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── One thread ──────────────────────────────────────────────────────────────
function ThreadCard({ thread, schoolCode, currentUser, members, expanded, onToggleExpand }) {
  // `null` means the first snapshot has not arrived yet, which is what the
  // spinner keys off — deriving it avoids a setState inside the effect body.
  const [replies, setReplies] = useState(null);
  const [replyError, setReplyError] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);

  useEffect(() => {
    if (!expanded) return undefined;
    const unsub = subscribeReplies(
      { threadId: thread.id, schoolCode },
      setReplies,
      setReplyError,
    );
    return () => unsub();
  }, [expanded, thread.id, schoolCode]);

  const loadingReplies = replies === null && !replyError;
  const replyList = replies || [];
  // The thread's own counter is the honest cross-check: if it says there are
  // replies but none came back, the read was refused rather than empty.
  const missingReplies =
    !loadingReplies && !replyError &&
    replyList.length === 0 && (thread.replyCount || 0) > 0;

  const canModerate = currentUser.role === "head_teacher" || currentUser.id === thread.authorId;

  const postReply = async ({ body, attachments }) => {
    await addReply({
      schoolCode,
      threadId: thread.id,
      thread,
      body,
      author: currentUser,
      replyTo: replyingTo,
      attachments,
    });
    setReplyingTo(null);
  };

  const watchers = (thread.participants || []).length;

  return (
    <article className={`act-thread ${thread.resolved ? "act-thread--resolved" : ""}`}>
      <header className="act-thread__head">
        <Avatar name={thread.authorName} id={thread.authorId} size={36} />
        <div className="act-thread__ident">
          <div className="act-thread__line">
            <span className="act-thread__author">{thread.authorName}</span>
            <span className="act-role-chip">{roleLabel(thread.authorRole)}</span>
            <span className="act-thread__time">{relativeTime(thread.createdAtDate)}</span>
            {thread.pinned && <span className="act-flag act-flag--pin"><Pin size={10} /> Pinned</span>}
            {thread.resolved && <span className="act-flag act-flag--done"><CheckCircle2 size={10} /> Resolved</span>}
          </div>
          {thread.title && <h4 className="act-thread__title">{thread.title}</h4>}
        </div>

        <div className="act-thread__tools">
          {canModerate && (
            <>
              <button
                type="button"
                className="act-tool"
                title={thread.pinned ? "Unpin" : "Pin to top"}
                onClick={() => setThreadFlag(thread.id, { pinned: !thread.pinned })}
              >
                {thread.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              <button
                type="button"
                className="act-tool"
                title={thread.resolved ? "Reopen" : "Mark resolved"}
                onClick={() => setThreadFlag(thread.id, { resolved: !thread.resolved })}
              >
                <CheckCircle2 size={14} />
              </button>
              <button
                type="button"
                className="act-tool act-tool--danger"
                title="Delete discussion"
                onClick={() => {
                  if (window.confirm("Delete this discussion and all its replies?")) {
                    deleteThread(thread.id);
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </header>

      <RichBody body={thread.body} currentUserId={currentUser.id} />
      <div className="act-thread__files">
        <AttachmentList attachments={thread.attachments} />
      </div>

      <footer className="act-thread__foot">
        <ReactionBar
          reactions={thread.reactions}
          currentUserId={currentUser.id}
          onToggle={(emoji, active) =>
            toggleReaction({ threadId: thread.id, emoji, userId: currentUser.id, active })}
        />
        <button type="button" className="act-linkbtn" onClick={onToggleExpand}>
          <MessageSquare size={13} />
          {thread.replyCount || 0} {thread.replyCount === 1 ? "reply" : "replies"}
        </button>
        {watchers > 1 && (
          <span className="act-watchers">
            <Users size={12} /> {watchers} in thread
          </span>
        )}
        {thread.lastActivityBy && thread.replyCount > 0 && (
          <span className="act-thread__last">
            Last: {thread.lastActivityBy} · {relativeTime(thread.lastActivityDate)}
          </span>
        )}
      </footer>

      {expanded && (
        <div className="act-replies">
          {loadingReplies && (
            <div className="act-replies__loading"><Loader2 size={14} className="act-spin" /> Loading replies…</div>
          )}
          {(replyError || missingReplies) && (
            <div className="act-inline-error act-inline-error--block">
              <AlertTriangle size={14} />
              <span>
                {replyError
                  ? describeError(replyError)
                  : `This discussion has ${thread.replyCount} repl${thread.replyCount === 1 ? "y" : "ies"} that could not be loaded. Firestore rules do not cascade into subcollections — activity_threads/{id}/replies needs its own match block.`}
              </span>
            </div>
          )}
          {replyList.map((r) => (
            <div key={r.id} className="act-reply">
              <Avatar name={r.authorName} id={r.authorId} size={26} />
              <div className="act-reply__body">
                <div className="act-thread__line">
                  <span className="act-thread__author act-thread__author--sm">{r.authorName}</span>
                  <span className="act-role-chip">{roleLabel(r.authorRole)}</span>
                  <span className="act-thread__time">{relativeTime(r.createdAtDate)}</span>
                </div>
                {r.replyToId && (
                  <div className="act-quote act-quote--static">
                    <CornerDownRight size={12} />
                    <span className="act-quote__who">{r.replyToAuthor}</span>
                    <span className="act-quote__text">{r.replyToExcerpt}</span>
                  </div>
                )}
                <RichBody body={r.body} currentUserId={currentUser.id} />
                <AttachmentList attachments={r.attachments} />
                <div className="act-reply__foot">
                  <ReactionBar
                    reactions={r.reactions}
                    currentUserId={currentUser.id}
                    onToggle={(emoji, active) =>
                      toggleReaction({ threadId: thread.id, replyId: r.id, emoji, userId: currentUser.id, active })}
                  />
                  <button
                    type="button"
                    className="act-linkbtn"
                    onClick={() => setReplyingTo({
                      id: r.id,
                      authorId: r.authorId,
                      authorName: r.authorName,
                      body: r.body,
                      excerpt: r.body.slice(0, 90),
                    })}
                  >
                    <Reply size={12} /> Reply
                  </button>
                  {(currentUser.role === "head_teacher" || currentUser.id === r.authorId) && (
                    <button
                      type="button"
                      className="act-linkbtn act-linkbtn--danger"
                      onClick={() => deleteReply(thread.id, r.id)}
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <Composer
            members={members}
            currentUser={currentUser}
            schoolCode={schoolCode}
            placeholder={replyingTo ? `Reply to ${replyingTo.authorName}…` : "Write a reply… use @ to tag a colleague, 📎 to attach"}
            submitLabel="Reply"
            autoFocus={!!replyingTo}
            replyingTo={replyingTo}
            onCancel={replyingTo ? () => setReplyingTo(null) : undefined}
            onSubmit={postReply}
          />
        </div>
      )}
    </article>
  );
}

// ─── Feed ────────────────────────────────────────────────────────────────────
const FILTERS = [
  { id: "open", label: "Open" },
  { id: "all", label: "All" },
  { id: "mine", label: "Mentions me" },
  { id: "resolved", label: "Resolved" },
];

export default function ActivityFeed({
  schoolCode,
  scopeId,
  scopeName,
  scopeType = "class",
  currentUser,
  members = [],
  compact = false,
}) {
  // Same "first snapshot" trick as the reply list. The parent gives this
  // component a key per channel, so switching channels remounts it and the
  // spinner comes back rather than briefly showing the previous channel.
  const [threads, setThreads] = useState(null);
  const [threadError, setThreadError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState("open");
  const [composing, setComposing] = useState(!compact);

  useEffect(() => {
    if (!schoolCode || !scopeId) return undefined;
    const unsub = subscribeThreads({ schoolCode, scopeId }, setThreads, setThreadError);
    return () => unsub();
  }, [schoolCode, scopeId]);

  const loading = schoolCode && scopeId ? threads === null && !threadError : false;
  const threadList = useMemo(() => threads || [], [threads]);

  const post = useCallback(async ({ title, body, attachments }) => {
    await createThread({
      schoolCode,
      scopeId,
      scopeName,
      scopeType,
      title,
      body,
      attachments,
      author: currentUser,
      // Everyone assigned to this scope hears about a new topic even if they
      // were not tagged, which is what makes the space feel alive.
      notifyTargets: members.map((m) => m.id),
    });
    setComposing(!compact);
  }, [schoolCode, scopeId, scopeName, scopeType, currentUser, members, compact]);

  const visible = useMemo(() => threadList.filter((t) => {
    if (filter === "open") return !t.resolved;
    if (filter === "resolved") return t.resolved;
    if (filter === "mine") {
      return (t.mentions || []).includes(currentUser.id)
        || (t.participants || []).includes(currentUser.id);
    }
    return true;
  }), [threadList, filter, currentUser.id]);

  const openCount = threadList.filter((t) => !t.resolved).length;
  const messageCount = threadList.reduce((n, t) => n + 1 + (t.replyCount || 0), 0);

  return (
    <section className="act-feed">
      <header className="act-feed__head">
        <div>
          <div className="act-feed__eyebrow">
            <MessageSquare size={13} /> Activity
          </div>
          <h3 className="act-feed__title">{scopeName || "Discussion"}</h3>
          <p className="act-feed__sub">
            {messageCount} message{messageCount !== 1 ? "s" : ""} · {openCount} open
            {" · "}tag colleagues with @ to notify them instantly
          </p>
        </div>
        <div className="act-filters">
          <Filter size={12} className="act-filters__icon" />
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`act-filter ${filter === f.id ? "act-filter--on" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {composing ? (
        <Composer
          members={members}
          currentUser={currentUser}
          schoolCode={schoolCode}
          withTitle
          placeholder="Start a discussion for this class… use @ to tag a colleague, 📎 to attach"
          submitLabel="Post"
          onSubmit={post}
          onCancel={compact ? () => setComposing(false) : undefined}
        />
      ) : (
        <button type="button" className="act-newbtn" onClick={() => setComposing(true)}>
          <MessageSquare size={14} /> Start a discussion
        </button>
      )}

      {threadError && (
        <div className="act-inline-error act-inline-error--block">
          <AlertTriangle size={14} />
          <span>{describeError(threadError)}</span>
        </div>
      )}

      {loading ? (
        <div className="act-state"><Loader2 size={18} className="act-spin" /> Loading activity…</div>
      ) : visible.length === 0 ? (
        <div className="act-state act-state--empty">
          <MessageSquare size={26} />
          <p className="act-state__title">
            {filter === "open" ? "No open discussions yet" : "Nothing here"}
          </p>
          <p className="act-state__sub">
            Post a topic above to start the conversation for {scopeName || "this class"}.
          </p>
        </div>
      ) : (
        <div className="act-threads">
          {visible.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              schoolCode={schoolCode}
              currentUser={currentUser}
              members={members}
              expanded={expandedId === t.id}
              onToggleExpand={() => setExpandedId((cur) => (cur === t.id ? null : t.id))}
            />
          ))}
        </div>
      )}
    </section>
  );
}
