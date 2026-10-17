export const ROLE_LABELS = { admin: "管理者", staff: "活動幹部", viewer: "唯讀" };

export function maskPhone(value = "") {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return value ? "***" : "";
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

export function maskEmail(value = "") {
  const [name, domain] = value.split("@");
  if (!name || !domain) return value ? "***" : "";
  return `${name.slice(0, 1)}***@${domain}`;
}

export function canViewPrivate(role) {
  return role === "admin";
}

export function visibleContact(contact, role) {
  if (canViewPrivate(role)) return { ...contact };
  return { ...contact, phone: maskPhone(contact.phone), email: maskEmail(contact.email) };
}

export function eventState(event, now = new Date()) {
  if (event.status === "cancelled") return "已取消";
  if (event.status === "draft") return "草稿";
  if (event.status === "completed") return "已結束";
  if (new Date(event.registration_deadline) < now) return "已截止";
  if ((event.registration_count || 0) >= event.capacity) return "已額滿";
  return "報名中";
}

export function campaignEligible(contact) {
  return Boolean(contact.line_user_id && contact.marketing_consent && contact.line_status === "active" && !contact.anonymized_at);
}

export function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns) {
  const head = columns.map(([label]) => csvEscape(label)).join(",");
  const body = rows.map(row => columns.map(([, key]) => csvEscape(row[key])).join(","));
  return [head, ...body].join("\r\n");
}

export function dashboardStats(events, registrations, contacts) {
  const active = registrations.filter(item => !item.cancelled_at);
  const attended = active.filter(item => item.attendance_status === "attended").length;
  const cancelled = registrations.filter(item => item.cancelled_at).length;
  return {
    events: events.length,
    registrations: active.length,
    attendanceRate: active.length ? Math.round((attended / active.length) * 100) : 0,
    cancellationRate: registrations.length ? Math.round((cancelled / registrations.length) * 100) : 0,
    contacts: contacts.filter(item => !item.anonymized_at).length
  };
}
