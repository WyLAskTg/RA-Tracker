const STATUSES = [
  "Pending", "Follow-up sent", "Rejected-No response", "Rejected-No position",
  "Rejected-Weak background", "Positive-funded", "Positive-unfunded"
];
const STORAGE_KEY = "research-application-tracker-v1";
const EXCEL_HEADERS = ["Professor", "School", "Status", "Last Updated", "Research Field", "Notes", "Semester"];
const HEADER_ALIASES = {
  professor: ["professor", "professor name", "faculty", "faculty name", "pi", "advisor", "supervisor", "contact", "教授", "教授名", "导师"],
  school: ["school", "institution", "university", "college", "affiliation", "学校", "院校", "大学"],
  status: ["status", "current status", "application status", "progress", "state", "状态", "当前状态", "进度"],
  updated: ["last updated", "updated", "update date", "last contact", "contact date", "date", "最近更新日期", "更新日期", "日期"],
  field: ["research field", "research area", "field", "area", "topic", "research interests", "研究领域", "研究方向", "方向"],
  notes: ["notes", "note", "comments", "comment", "remarks", "details", "备注", "记录"],
  semester: ["semester", "term", "cycle", "application term", "学期", "申请学期"]
};

const defaultState = () => ({
  activeSemesterId: "semester-1",
  semesters: [{ id: "semester-1", name: "Fall 2026", applications: [] }]
});

let state = loadState();
let semesterMode = "add";
const el = id => document.getElementById(id);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.semesters?.length) return saved;
  } catch (_) {}
  return defaultState();
}
function saveState(message) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
  if (message) toast(message);
}
function activeSemester() {
  return state.semesters.find(s => s.id === state.activeSemesterId) || state.semesters[0];
}
function slugStatus(status) { return "status-" + status.toLowerCase().replace(/[^a-z]+/g,"-").replace(/(^-|-$)/g,""); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}).format(new Date(value + "T00:00:00Z"));
}
function today() { return new Date().toLocaleDateString("en-CA"); }

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
      "School": app.school,
      "Status": app.status,
      "Last Updated": app.updated ? new Date(`${app.updated}T00:00:00`) : "",
      "Research Field": app.field,
      "Notes": app.notes || "",
      "Semester": semester.name
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { header: EXCEL_HEADERS });
    sheet["!cols"] = [{wch:24},{wch:28},{wch:28},{wch:15},{wch:28},{wch:45},{wch:16}];
    if (sheet["!ref"]) {
      const range = XLSX.utils.decode_range(sheet["!ref"]);
      for (let row = 1; row <= range.e.r; row++) {
        const cell = sheet[XLSX.utils.encode_cell({r:row,c:3})];
        if (cell?.v instanceof Date) cell.z = "yyyy-mm-dd";
      }
    }
    XLSX.utils.book_append_sheet(workbook, sheet, safeSheetName(semester.name, usedNames));
  });
  XLSX.writeFile(workbook, `research-applications-${today()}.xlsx`, { compression:true, cellDates:true });
  toast("Excel workbook exported");
}
function getOrCreateSemester(name) {
  const clean = String(name || activeSemester().name).trim() || activeSemester().name;
  let semester = state.semesters.find(item => item.name.toLowerCase() === clean.toLowerCase());
  if (!semester) {
    semester = { id:crypto.randomUUID(), name:clean.slice(0,60), applications:[] };
    state.semesters.push(semester);
  }
  return semester;
}
function applicationMatchKey(application) {
  return [application.professor, application.school].map(value => String(value || "").trim().toLowerCase().replace(/\s+/g," ")).join("::");
}
async function importExcel(file) {
  if (!ensureXlsx()) return;
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
        const rawValues = ["professor","school","status","updated","field","notes"].map(read);
        if (!rawValues.some(value => String(value ?? "").trim())) return;
        const status = normalizeStatus(read("status"));
        if (status.defaulted) defaultedStatuses++;
        let semesterName = String(read("semester") ?? "").trim();
        if (!semesterName && parsedSheets.length > 1) semesterName = sheetName;
        records.push({
          semesterName: semesterName || activeSemester().name,
          application: {
            id:crypto.randomUUID(),
            professor:String(read("professor") ?? "").trim() || "Unknown professor",
            school:String(read("school") ?? "").trim() || "Unknown school",
            status:status.value,
            updated:normalizeExcelDate(read("updated")),
            field:String(read("field") ?? "").trim() || "Not specified",
            notes:String(read("notes") ?? "").trim()
          }
        });
      });
    });
    if (!records.length) { alert("The workbook contains headers but no application rows."); return; }
    const semesterNames = [...new Set(records.map(record => record.semesterName))];
    const warning = defaultedStatuses ? `\n${defaultedStatuses} unrecognized status value(s) will be set to Pending.` : "";
    if (!confirm(`Import ${records.length} application(s) into ${semesterNames.length} semester(s)? Existing matches will be enriched instead of duplicated.${warning}`)) return;
    let added = 0, enriched = 0;
    records.forEach(record => {
      const applications = getOrCreateSemester(record.semesterName).applications;
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
  el("semesterSelect").innerHTML = state.semesters.map(s => `<option value="${s.id}" ${s.id===semester.id?"selected":""}>${escapeHtml(s.name)}</option>`).join("");
  renderStats(semester.applications);
  renderRows(semester.applications);
  el("deleteSemesterBtn").disabled = state.semesters.length === 1;
}
function renderStats(apps) {
  const positive = apps.filter(a => a.status.startsWith("Positive")).length;
  const waiting = apps.filter(a => ["Pending","Follow-up sent"].includes(a.status)).length;
  const rejected = apps.filter(a => a.status.startsWith("Rejected")).length;
  el("stats").innerHTML = [
    [apps.length,"Total applications"], [waiting,"Awaiting response"], [positive,"Positive replies"], [rejected,"Closed / rejected"]
  ].map(([value,label]) => `<div class="stat"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`).join("");
}
function renderRows(apps) {
  const query = el("searchInput").value.trim().toLowerCase();
  const filter = el("statusFilter").value;
  const sort = el("sortSelect").value;
  let visible = apps.filter(a => {
    const haystack = [a.professor,a.school,a.field,a.notes].join(" ").toLowerCase();
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
    <td data-label="Institution">${escapeHtml(a.school)}</td>
    <td data-label="Status"><span class="badge ${slugStatus(a.status)}">${escapeHtml(a.status)}</span></td>
    <td data-label="Last updated">${formatDate(a.updated)}</td>
    <td data-label="Research field">${escapeHtml(a.field)}</td>
    <td data-label="Notes" class="notes-cell">${a.notes ? escapeHtml(a.notes) : "—"}</td>
    <td data-label="Actions"><div class="row-actions"><button class="row-button edit-button" data-id="${a.id}" title="Edit" aria-label="Edit ${escapeHtml(a.professor)}">✎</button><button class="row-button delete-button" data-id="${a.id}" title="Delete" aria-label="Delete ${escapeHtml(a.professor)}">⊗</button></div></td>
  </tr>`).join("");
  const isActuallyEmpty = apps.length === 0;
  el("emptyState").hidden = visible.length !== 0;
  el("emptyState").querySelector("h2").textContent = isActuallyEmpty ? "No applications yet" : "No matching applications";
  el("emptyState").querySelector("p").textContent = isActuallyEmpty ? "Start this semester by adding your first professor." : "Try changing your search or status filter.";
  el("emptyState").querySelector("button").hidden = !isActuallyEmpty;
}

function openApplication(id = null) {
  const app = id ? activeSemester().applications.find(a => a.id === id) : null;
  el("applicationDialogTitle").textContent = app ? "Edit application" : "Add application";
  el("applicationId").value = app?.id || "";
  el("professorInput").value = app?.professor || "";
  el("schoolInput").value = app?.school || "";
  el("applicationStatus").value = app?.status || "Pending";
  el("dateInput").value = app?.updated || today();
  el("fieldInput").value = app?.field || "";
  el("notesInput").value = app?.notes || "";
  el("applicationDialog").showModal();
  setTimeout(() => el("professorInput").focus(), 50);
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
  const id = el("applicationId").value;
  const record = { id:id || crypto.randomUUID(), professor:el("professorInput").value.trim(), school:el("schoolInput").value.trim(), status:el("applicationStatus").value, updated:el("dateInput").value, field:el("fieldInput").value.trim(), notes:el("notesInput").value.trim() };
  const apps = activeSemester().applications;
  const index = apps.findIndex(a => a.id === id);
  if (index >= 0) apps[index] = record; else apps.push(record);
  el("applicationDialog").close();
  saveState(index >= 0 ? "Application updated" : "Application added");
});
el("applicationRows").addEventListener("click", event => {
  const edit = event.target.closest(".edit-button");
  const remove = event.target.closest(".delete-button");
  if (edit) openApplication(edit.dataset.id);
  if (remove) {
    const app = activeSemester().applications.find(a => a.id === remove.dataset.id);
    if (app && confirm(`Delete the application for ${app.professor}?`)) {
      activeSemester().applications = activeSemester().applications.filter(a => a.id !== app.id);
      saveState("Application deleted");
    }
  }
});
["searchInput","statusFilter","sortSelect"].forEach(id => el(id).addEventListener(id==="searchInput"?"input":"change", () => renderRows(activeSemester().applications)));
el("semesterSelect").addEventListener("change", event => { state.activeSemesterId = event.target.value; saveState(); });
el("addSemesterBtn").addEventListener("click", () => { semesterMode="add"; el("semesterDialogTitle").textContent="New semester"; el("semesterNameInput").value=""; el("semesterDialog").showModal(); });
el("renameSemesterBtn").addEventListener("click", () => { semesterMode="rename"; el("semesterDialogTitle").textContent="Rename semester"; el("semesterNameInput").value=activeSemester().name; el("semesterDialog").showModal(); });
el("semesterForm").addEventListener("submit", event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const name = el("semesterNameInput").value.trim();
  if (semesterMode === "rename") activeSemester().name = name;
  else { const semester={id:crypto.randomUUID(),name,applications:[]}; state.semesters.push(semester); state.activeSemesterId=semester.id; }
  el("semesterDialog").close(); saveState(semesterMode === "rename" ? "Semester renamed" : "Semester added");
});
el("deleteSemesterBtn").addEventListener("click", () => {
  if (state.semesters.length === 1) return;
  const semester = activeSemester();
  if (confirm(`Delete ${semester.name} and all ${semester.applications.length} of its applications?`)) {
    state.semesters = state.semesters.filter(s => s.id !== semester.id); state.activeSemesterId=state.semesters[0].id; saveState("Semester deleted");
  }
});
el("exportExcelBtn").addEventListener("click", exportExcel);
el("importExcelInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (file) await importExcel(file);
  event.target.value = "";
});
el("exportJsonBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="research-application-tracker.json"; a.click(); URL.revokeObjectURL(url); toast("Data exported");
});
el("importJsonInput").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try { const imported=JSON.parse(await file.text()); if (!imported.semesters?.length) throw new Error(); if (confirm("Replace your current tracker with this imported data?")) { state=imported; saveState("Data imported"); } } catch (_) { alert("This file is not a valid Research Tracker export."); }
  event.target.value="";
});
document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("click", e => { if (e.target===dialog) dialog.close(); }));
render();
