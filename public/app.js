const STATUSES = [
  "Pending", "Follow-up sent", "Rejected-No response", "Rejected-No position",
  "Rejected-Weak background", "Positive-funded", "Positive-unfunded", "Withdrawn"
];
const STORAGE_KEY = "research-application-tracker-v1";
const API_URL = "/api/state";
const REMINDER_AFTER_DAYS = 7;
const EXCEL_HEADERS = ["Professor", "Email", "School", "Status", "Last Updated", "Research Field", "Notes", "Contact History", "Semester"];
const HEADER_ALIASES = {
  professor: ["professor", "professor name", "faculty", "faculty name", "pi", "advisor", "supervisor", "contact", "教授", "教授名", "导师"],
  email: ["email", "email address", "professor email", "faculty email", "contact email", "e-mail", "邮箱", "电子邮箱", "教授邮箱"],
  school: ["school", "institution", "university", "college", "affiliation", "学校", "院校", "大学"],
  status: ["status", "current status", "application status", "progress", "state", "状态", "当前状态", "进度"],
  updated: ["last updated", "updated", "update date", "last contact", "contact date", "date", "最近更新日期", "更新日期", "日期"],
  field: ["research field", "research area", "field", "area", "topic", "research interests", "研究领域", "研究方向", "方向"],
  notes: ["notes", "note", "comments", "comment", "remarks", "details", "备注", "记录"],
  contactHistory: ["contact history", "communication history", "interaction history", "联系记录", "联系历史"],
  semester: ["semester", "term", "cycle", "application term", "学期", "申请学期"]
};

const defaultState = () => ({
  activeSemesterId: "semester-1",
  semesters: [{ id: "semester-1", name: "Fall 2026", applications: [] }]
});

let state = defaultState();
let dataReady = false;
let persistQueue = Promise.resolve();
let semesterMode = "add";
let draftContactHistory = [];
const el = id => document.getElementById(id);

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.semesters)) return saved;
  } catch (_) {}
  return defaultState();
}
function saveState(message) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  queuePersistence();
  if (message) toast(message);
}
function queuePersistence() {
  const snapshot = JSON.stringify(state);
  el("syncStatus").textContent = "Saving…";
  persistQueue = persistQueue.then(async () => {
    const response = await fetch(API_URL, { method:"PUT", headers:{"content-type":"application/json"}, body:JSON.stringify({state:JSON.parse(snapshot)}) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not save your data.");
    el("syncStatus").textContent = "Saved to your account";
  }).catch(error => {
    console.error(error);
    el("syncStatus").textContent = "Save failed — changes remain on this device";
  });
}
async function initializeAccount() {
  try {
    const response = await fetch(API_URL, { cache:"no-store" });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "Could not load your data.");
    const payload = await response.json();
    const local = loadLocalState();
    if (payload.exists && payload.state && Array.isArray(payload.state.semesters)) {
      state = payload.state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      el("syncStatus").textContent = "Saved to your account";
    } else {
      state = local;
      el("syncStatus").textContent = "Moving this device’s data to your account…";
      queuePersistence();
    }
  } catch (error) {
    console.error(error);
    state = loadLocalState();
    el("syncStatus").textContent = "Offline mode — changes remain on this device";
  }
  dataReady = true;
  render();
  showLoginReminders();
}
function activeSemester() {
  return state.semesters.find(s => s.id === state.activeSemesterId) || state.semesters[0] || null;
}
function slugStatus(status) { return "status-" + status.toLowerCase().replace(/[^a-z]+/g,"-").replace(/(^-|-$)/g,""); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(value + "T00:00:00Z"));
}
function today() { return new Date().toLocaleDateString("en-CA"); }
function daysSince(value) {
  if (!value) return 0;
  const then = new Date(`${value}T00:00:00`);
  const now = new Date(`${today()}T00:00:00`);
  return Math.max(0, Math.floor((now - then) / 86400000));
}
function latestActivityDate(application) {
  const dates = [application.updated, ...(application.contactHistory || []).map(item => item.date)].filter(Boolean).sort();
  return dates.at(-1) || application.updated || today();
}
function dueReminders() {
  return state.semesters.flatMap(semester => semester.applications
    .filter(application => ["Pending", "Follow-up sent"].includes(application.status))
    .map(application => ({ semester, application, days:daysSince(latestActivityDate(application)) }))
    .filter(item => item.days >= REMINDER_AFTER_DAYS))
    .sort((a,b) => b.days - a.days);
}
function showLoginReminders() {
  const reminders = dueReminders();
  const panel = el("reminderPanel");
  if (!reminders.length) { panel.hidden = true; return; }
  el("reminderTitle").textContent = `${reminders.length} ${reminders.length === 1 ? "application needs" : "applications need"} attention`;
  el("reminderList").innerHTML = reminders.map(({semester,application,days}) => `<button class="reminder-item" type="button" data-semester-id="${semester.id}" data-application-id="${application.id}"><span><strong>${escapeHtml(application.professor)}</strong><small>${escapeHtml(semester.name)} · ${escapeHtml(application.school)}</small></span><span class="reminder-age">${days}d</span></button>`).join("");
  panel.hidden = false;
}
function serializeContactHistory(history = []) {
  return history.map(item => `${item.date || ""} | ${item.type || "Other"} | ${item.summary || ""}`).join("\n");
}
function parseContactHistory(value) {
  return String(value ?? "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [date,type,...summary] = line.split("|").map(part => part.trim());
    return { id:crypto.randomUUID(), date:normalizeExcelDate(date), type:type || "Other", summary:summary.join(" | ") || line };
  });
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_\-–—./\\()[\]:]+/g, "");
}
const NORMALIZED_ALIASES = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, values]) => [key, values.map(normalizeHeader)]));
function looksLikeResearchFieldHeader(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const tokens = text.split(/[^a-z0-9\u3400-\u9fff]+/).filter(Boolean);
  const hasResearch = tokens.some(token => token === "research" || token.startsWith("research") || token.includes("研究"));
  const meaningTokens = new Set(tokens.filter(token => ["field","area","fit","interest","interests","topic","focus","domain","specialty","specialisation","specialization"].includes(token) || /领域|方向|兴趣|主题|匹配/.test(token)));
  return (hasResearch && meaningTokens.size >= 1) || meaningTokens.size >= 2 || /研究(领域|方向|兴趣|主题|匹配)/.test(text);
}
function mapHeaderRow(row) {
  const mapping = {};
  row.forEach((value, index) => {
    const normalized = normalizeHeader(value);
    for (const [field, aliases] of Object.entries(NORMALIZED_ALIASES)) {
      if (mapping[field] === undefined && aliases.includes(normalized)) mapping[field] = index;
    }
  });
  if (mapping.field === undefined) {
    const fieldIndex = row.findIndex(looksLikeResearchFieldHeader);
    if (fieldIndex >= 0) mapping.field = fieldIndex;
  }
  return mapping;
}
function findHeader(rows) {
  let best = null;
  rows.slice(0, 20).forEach((row, index) => {
    const mapping = mapHeaderRow(row);
    const score = Object.keys(mapping).length;
    if (!best || score > best.score) best = { index, mapping, score };
  });
  return best && best.score >= 2 && (best.mapping.professor !== undefined || best.mapping.school !== undefined) ? best : null;
}
function normalizeStatus(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { value: "Pending", defaulted: false };
  const compact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const exact = STATUSES.find(status => status.toLowerCase().replace(/[^a-z0-9]+/g, "") === compact);
  if (exact) return { value: exact, defaulted: false };
  if (raw.includes("放弃") || compact.includes("withdraw") || compact.includes("abandon") || compact.includes("cancelled") || compact.includes("canceled")) return { value: "Withdrawn", defaulted: false };
  if (compact.includes("followup")) return { value: "Follow-up sent", defaulted: false };
  if (compact.includes("noresponse") || compact.includes("ghost")) return { value: "Rejected-No response", defaulted: false };
  if (compact.includes("noposition") || compact.includes("noopening") || compact.includes("unavailable")) return { value: "Rejected-No position", defaulted: false };
  if (compact.includes("weak") || compact.includes("background") || compact.includes("qualification")) return { value: "Rejected-Weak background", defaulted: false };
  if (compact.includes("unfunded") || (compact.includes("positive") && compact.includes("nofund"))) return { value: "Positive-unfunded", defaulted: false };
  if (compact.includes("funded") || compact.includes("offer")) return { value: "Positive-funded", defaulted: false };
  if (compact.includes("reject") || compact.includes("declin")) return { value: "Rejected-No response", defaulted: false };
  if (compact.includes("pending") || compact.includes("wait") || compact.includes("sent")) return { value: "Pending", defaulted: false };
  return { value: "Pending", defaulted: true };
}
function normalizeExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toLocaleDateString("en-CA");
  if (typeof value === "number" && window.XLSX) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2,"0")}-${String(parsed.d).padStart(2,"0")}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return today();
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? today() : parsed.toLocaleDateString("en-CA");
}
function safeSheetName(name, used) {
  const base = String(name || "Applications").replace(/[\\/?*:[\]]/g, " ").trim().slice(0,31) || "Applications";
  let candidate = base, counter = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${counter++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}
function ensureXlsx() {
  if (window.XLSX) return true;
  alert("Excel support could not load. Please refresh the page and try again.");
  return false;
}
function exportExcel() {
  if (!ensureXlsx()) return;
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set();
  state.semesters.forEach(semester => {
    const rows = semester.applications.map(app => ({
      "Professor": app.professor,
      "Email": app.email || "",
      "School": app.school,
      "Status": app.status,
      "Last Updated": app.updated ? new Date(`${app.updated}T00:00:00`) : "",
      "Research Field": app.field,
      "Notes": app.notes || "",
      "Contact History": serializeContactHistory(app.contactHistory),
      "Semester": semester.name
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { header: EXCEL_HEADERS });
    sheet["!cols"] = [{wch:24},{wch:30},{wch:28},{wch:28},{wch:15},{wch:28},{wch:45},{wch:55},{wch:16}];
    if (sheet["!ref"]) {
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      for (let row = 1; row <= range.e.r; row++) {
        const cell = sheet[XLSX.utils.encode_cell({r:row,c:4})];
        if (cell?.v instanceof Date) cell.z = "yyyy-mm-dd";
      }
    }
    XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(semester.name, usedNames));
  });
  XLSX.writeFile(workbook, `research-applications-${today()}.xlsx`, { compression:true, cellDates:true });
  toast("Excel workbook exported");
}
function applicationMatchKey(application) {
  return [application.professor, application.school].map(value => String(value || "").trim().toLowerCase().replace(/\s+/g," ")).join("::");
}
async function importExcel(file) {
  if (!ensureXlsx()) return;
  const targetSemester = activeSemester();
  if (!targetSemester) {
    alert("Create or select a term before importing applications.");
    return;
  }
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:true });
    const parsedSheets = [];
    workbook.SheetNames.forEach(sheetName => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header:1, defval:"", raw:true });
      const header = findHeader(rows);
      if (header) parsedSheets.push({ sheetName, rows, header });
    });
    if (!parsedSheets.length) {
      alert("No application table was found. Include headers such as Professor, School, Status, Last Updated, Research Field, and Notes.");
      return;
    }
    const records = [];
    let defaultedStatuses = 0;
    parsedSheets.forEach(({sheetName,rows,header}) => {
      rows.slice(header.index + 1).forEach(row => {
        const read = key => header.mapping[key] === undefined ? "" : row[header.mapping[key]];
        const rawValues = ["professor","email","school","status","updated","field","notes","contactHistory"].map(read);
        if (!rawValues.some(value => String(value ?? "").trim())) return;
        const status = normalizeStatus(read("status"));
        if (status.defaulted) defaultedStatuses++;
        records.push({
          application: {
            id:crypto.randomUUID(),
            professor:String(read("professor") ?? "").trim() || "Unknown professor",
            email:String(read("email") ?? "").trim(),
            school:String(read("school") ?? "").trim() || "Unknown school",
            status:status.value,
            updated:normalizeExcelDate(read("updated")),
            field:String(read("field") ?? "").trim() || "Not specified",
            notes:String(read("notes") ?? "").trim(),
            contactHistory:parseContactHistory(read("contactHistory"))
          }
        });
      });
    });
    if (!records.length) { alert("The workbook contains headers but no application rows."); return; }
    const warning = defaultedStatuses ? `\n${defaultedStatuses} unrecognized status value(s) will be set to Pending.` : "";
    if (!confirm(`Import ${records.length} application(s) into “${targetSemester.name}”? Existing matches will be enriched instead of duplicated.${warning}`)) return;
    let added = 0, enriched = 0;
    records.forEach(record => {
      const applications = targetSemester.applications;
      const existing = applications.find(application => applicationMatchKey(application) === applicationMatchKey(record.application));
      if (!existing) {
        applications.push(record.application);
        added++;
        return;
      }
      let changed = false;
      if ((!existing.field || existing.field === "Not specified") && record.application.field !== "Not specified") {
        existing.field = record.application.field;
        changed = true;
      }
      if (!existing.notes && record.application.notes) {
        existing.notes = record.application.notes;
        changed = true;
      }
      if (!existing.email && record.application.email) {
        existing.email = record.application.email;
        changed = true;
      }
      if ((!existing.contactHistory || !existing.contactHistory.length) && record.application.contactHistory.length) {
        existing.contactHistory = record.application.contactHistory;
        changed = true;
      }
      if (changed) enriched++;
    });
    saveState(`${added} added${enriched ? `, ${enriched} updated` : ""} from Excel`);
  } catch (error) {
    console.error(error);
    alert("The Excel file could not be read. Please check that it is a valid workbook and try again.");
  }
}

function render() {
  const semester = activeSemester();
  el("semesterSelect").innerHTML = state.semesters.map(s => `<option value="${s.id}" ${s.id===semester?.id?"selected":""}>${escapeHtml(s.name)}</option>`).join("");
  el("addSemesterBtn").disabled = !dataReady;
  el("semesterSelect").disabled = !semester || !dataReady;
  el("renameSemesterBtn").disabled = !semester || !dataReady;
  el("deleteSemesterBtn").disabled = !semester || !dataReady;
  el("addApplicationBtn").disabled = !semester || !dataReady;
  el("importExcelInput").disabled = !semester || !dataReady;
  el("importExcelLabel").classList.toggle("disabled", !semester || !dataReady);
  el("searchInput").disabled = !semester || !dataReady;
  el("statusFilter").disabled = !semester || !dataReady;
  el("sortSelect").disabled = !semester || !dataReady;
  renderStats(semester?.applications || []);
  renderRows(semester?.applications || [], !semester);
}
function renderStats(apps) {
  const positive = apps.filter(a => a.status.startsWith("Positive")).length;
  const waiting = apps.filter(a => ["Pending","Follow-up sent"].includes(a.status)).length;
  const rejected = apps.filter(a => a.status.startsWith("Rejected") || a.status === "Withdrawn").length;
  el("stats").innerHTML = [
    [apps.length,"Total applications"], [waiting,"Awaiting response"], [positive,"Positive replies"], [rejected,"Closed / rejected"]
  ].map(([value,label]) => `<div class="stat"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`).join("");
}
function renderRows(apps, noSemester = false) {
  const query = el("searchInput").value.trim().toLowerCase();
  const filter = el("statusFilter").value;
  const sort = el("sortSelect").value;
  let visible = apps.filter(a => {
    const historyText = (a.contactHistory || []).map(item => `${item.type} ${item.summary}`).join(" ");
    const haystack = [a.professor,a.email,a.school,a.field,a.notes,historyText].join(" ").toLowerCase();
    return (!query || haystack.includes(query)) && (filter === "all" || a.status === filter);
  });
  visible.sort((a,b) => {
    if (sort === "updated-asc") return a.updated.localeCompare(b.updated);
    if (sort === "professor") return a.professor.localeCompare(b.professor);
    if (sort === "school") return a.school.localeCompare(b.school);
    return b.updated.localeCompare(a.updated);
  });
  el("applicationRows").innerHTML = visible.map(a => `<tr>
    <td data-label="Professor"><div class="person">${escapeHtml(a.professor)}</div></td>
    <td data-label="Email">${a.email ? `<a class="email-link" href="mailto:${escapeHtml(a.email)}">${escapeHtml(a.email)}</a>` : "—"}</td>
    <td data-label="Institution">${escapeHtml(a.school)}</td>
    <td data-label="Status"><span class="badge ${slugStatus(a.status)}">${escapeHtml(a.status)}</span></td>
    <td data-label="Last updated">${formatDate(a.updated)}</td>
    <td data-label="Research field">${escapeHtml(a.field)}</td>
    <td data-label="Notes" class="notes-cell">${a.notes ? escapeHtml(a.notes) : "—"}</td>
    <td data-label="Actions"><div class="row-actions"><button class="row-button history-button" data-id="${a.id}" title="Contact history" aria-label="Contact history for ${escapeHtml(a.professor)}">◷</button><button class="row-button edit-button" data-id="${a.id}" title="Edit" aria-label="Edit ${escapeHtml(a.professor)}">✎</button><button class="row-button delete-button" data-id="${a.id}" title="Delete" aria-label="Delete ${escapeHtml(a.professor)}">⊗</button></div></td>
  </tr>`).join("");
  const isActuallyEmpty = apps.length === 0;
  el("emptyState").hidden = visible.length !== 0;
  el("emptyState").querySelector("h2").textContent = noSemester ? "No term yet" : isActuallyEmpty ? "No applications yet" : "No matching applications";
  el("emptyState").querySelector("p").textContent = noSemester ? "Create a term before adding or importing applications." : isActuallyEmpty ? "Start this term by adding your first professor." : "Try changing your search or status filter.";
  el("emptyState").querySelector("button").hidden = noSemester || !isActuallyEmpty;
}

function renderContactHistory() {
  const sorted = [...draftContactHistory].sort((a,b) => (b.date || "").localeCompare(a.date || ""));
  el("contactHistoryList").innerHTML = sorted.length ? sorted.map(item => `<div class="history-item">
    <div class="history-date">${formatDate(item.date)}</div><div class="history-type">${escapeHtml(item.type)}</div>
    <div class="history-summary">${escapeHtml(item.summary)}</div>
    <button class="history-remove" type="button" data-history-id="${item.id}" aria-label="Remove contact entry">×</button>
  </div>`).join("") : `<div class="history-empty">No contact history yet.</div>`;
}
function openApplication(id = null, focusHistory = false) {
  const semester = activeSemester();
  if (!semester) return;
  const app = id ? semester.applications.find(a => a.id === id) : null;
  el("applicationDialogTitle").textContent = app ? "Edit application" : "Add application";
  el("applicationId").value = app?.id || "";
  el("professorInput").value = app?.professor || "";
  el("schoolInput").value = app?.school || "";
  el("emailInput").value = app?.email || "";
  el("applicationStatus").value = app?.status || "Pending";
  el("dateInput").value = app?.updated || today();
  el("fieldInput").value = app?.field || "";
  el("notesInput").value = app?.notes || "";
  draftContactHistory = (app?.contactHistory || []).map(item => ({...item}));
  el("contactComposer").hidden = true;
  renderContactHistory();
  el("applicationDialog").showModal();
  setTimeout(() => focusHistory ? el("historyTitle").scrollIntoView({behavior:"smooth",block:"start"}) : el("professorInput").focus(), 50);
}
function toast(message) {
  el("toast").textContent = message;
  el("toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el("toast").classList.remove("show"), 2200);
}

STATUSES.forEach(status => {
  el("applicationStatus").add(new Option(status,status));
  el("statusFilter").add(new Option(status,status));
});
el("addApplicationBtn").addEventListener("click", () => openApplication());
document.querySelector(".add-from-empty").addEventListener("click", () => openApplication());
el("applicationForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const semester = activeSemester();
  if (!semester) return;
  const id = el("applicationId").value;
  const record = { id:id || crypto.randomUUID(), professor:el("professorInput").value.trim(), email:el("emailInput").value.trim(), school:el("schoolInput").value.trim(), status:el("applicationStatus").value, updated:el("dateInput").value, field:el("fieldInput").value.trim(), notes:el("notesInput").value.trim(), contactHistory:draftContactHistory };
  const apps = semester.applications;
  const index = apps.findIndex(a => a.id === id);
  if (index >= 0) apps[index] = record; else apps.push(record);
  el("applicationDialog").close();
  saveState(index >= 0 ? "Application updated" : "Application added");
});
el("applicationRows").addEventListener("click", event => {
  const semester = activeSemester();
  if (!semester) return;
  const edit = event.target.closest(".edit-button");
  const history = event.target.closest(".history-button");
  const remove = event.target.closest(".delete-button");
  if (edit) openApplication(edit.dataset.id);
  if (history) openApplication(history.dataset.id, true);
  if (remove) {
    const app = semester.applications.find(a => a.id === remove.dataset.id);
    if (app && confirm(`Delete the application for ${app.professor}?`)) {
      semester.applications = semester.applications.filter(a => a.id !== app.id);
      saveState("Application deleted");
    }
  }
});
el("showContactComposerBtn").addEventListener("click", () => {
  el("contactComposer").hidden = false;
  el("contactDateInput").value = today();
  el("contactTypeInput").value = "Initial email";
  el("contactSummaryInput").value = "";
  el("contactSummaryInput").focus();
});
el("cancelContactBtn").addEventListener("click", () => { el("contactComposer").hidden = true; });
el("addContactBtn").addEventListener("click", () => {
  const date = el("contactDateInput").value;
  const summary = el("contactSummaryInput").value.trim();
  if (!date || !summary) { alert("Add a date and a short summary for this contact."); return; }
  draftContactHistory.push({ id:crypto.randomUUID(), date, type:el("contactTypeInput").value, summary });
  el("contactComposer").hidden = true;
  renderContactHistory();
});
el("contactHistoryList").addEventListener("click", event => {
  const remove = event.target.closest(".history-remove");
  if (!remove) return;
  draftContactHistory = draftContactHistory.filter(item => item.id !== remove.dataset.historyId);
  renderContactHistory();
});
["searchInput","statusFilter","sortSelect"].forEach(id => el(id).addEventListener(id==="searchInput"?"input":"change", () => renderRows(activeSemester()?.applications || [], !activeSemester())));
el("semesterSelect").addEventListener("change", event => { state.activeSemesterId = event.target.value; saveState(); });
el("addSemesterBtn").addEventListener("click", () => { semesterMode="add"; el("semesterDialogTitle").textContent="New term"; el("semesterNameInput").value=""; el("semesterDialog").showModal(); });
el("renameSemesterBtn").addEventListener("click", () => { const semester=activeSemester(); if (!semester) return; semesterMode="rename"; el("semesterDialogTitle").textContent="Rename term"; el("semesterNameInput").value=semester.name; el("semesterDialog").showModal(); });
el("semesterForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const name = el("semesterNameInput").value.trim();
  if (semesterMode === "rename") { const semester=activeSemester(); if (!semester) return; semester.name = name; }
  else { const semester={id:crypto.randomUUID(),name,applications:[]}; state.semesters.push(semester); state.activeSemesterId=semester.id; }
  el("semesterDialog").close(); saveState(semesterMode === "rename" ? "Term renamed" : "Term added");
});
el("deleteSemesterBtn").addEventListener("click", () => {
  const semester = activeSemester();
  if (!semester) return;
  if (confirm(`Delete ${semester.name} and all ${semester.applications.length} of its applications?`)) {
    state.semesters = state.semesters.filter(s => s.id !== semester.id); state.activeSemesterId=state.semesters[0]?.id || null; saveState("Term deleted");
  }
});
el("importExcelInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (file) await importExcel(file);
  event.target.value = "";
});
document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("click", e => { if (e.target===dialog) dialog.close(); }));
document.querySelectorAll(".dialog-close").forEach(button => button.addEventListener("click", () => {
  button.closest("dialog")?.close("cancel");
}));
el("closeReminderBtn").addEventListener("click", () => { el("reminderPanel").hidden = true; });
el("reminderList").addEventListener("click", event => {
  const item = event.target.closest(".reminder-item");
  if (!item) return;
  state.activeSemesterId = item.dataset.semesterId;
  render();
  el("reminderPanel").hidden = true;
  openApplication(item.dataset.applicationId, true);
});
render();
initializeAccount();
