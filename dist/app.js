const STATUSES = [
  "Pending", "Follow-up sent", "Rejected-No response", "Rejected-No position",
  "Rejected-Weak background", "Positive-funded", "Positive-unfunded"
];
const STORAGE_KEY = "research-application-tracker-v1";

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
    <td data-label="Professor"><div class="person">${escapeHtml(a.professor)}</div>${a.notes?`<div class="notes-preview" title="${escapeHtml(a.notes)}">${escapeHtml(a.notes)}</div>`:""}</td>
    <td data-label="Institution">${escapeHtml(a.school)}</td>
    <td data-label="Status"><span class="badge ${slugStatus(a.status)}">${escapeHtml(a.status)}</span></td>
    <td data-label="Last updated">${formatDate(a.updated)}</td>
    <td data-label="Research field">${escapeHtml(a.field)}</td>
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
el("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="research-application-tracker.json"; a.click(); URL.revokeObjectURL(url); toast("Data exported");
});
el("importInput").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try { const imported=JSON.parse(await file.text()); if (!imported.semesters?.length) throw new Error(); if (confirm("Replace your current tracker with this imported data?")) { state=imported; saveState("Data imported"); } } catch (_) { alert("This file is not a valid Research Tracker export."); }
  event.target.value="";
});
document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("click", e => { if (e.target===dialog) dialog.close(); }));
render();
