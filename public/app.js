const state = {
  lessons: [],
  currentLesson: null,
  editingId: null,
  filter: "all",
  query: ""
};

const els = {
  createLessonBtn: document.querySelector("#createLessonBtn"),
  emptyCreateBtn: document.querySelector("#emptyCreateBtn"),
  lessonGrid: document.querySelector("#lessonGrid"),
  emptyState: document.querySelector("#emptyState"),
  lessonCount: document.querySelector("#lessonCount"),
  exampleCount: document.querySelector("#exampleCount"),
  questionCount: document.querySelector("#questionCount"),
  categoryList: document.querySelector("#categoryList"),
  searchInput: document.querySelector("#searchInput"),
  dashboardView: document.querySelector("#dashboardView"),
  lessonView: document.querySelector("#lessonView"),
  editorView: document.querySelector("#editorView"),
  backToDashboardBtn: document.querySelector("#backToDashboardBtn"),
  cancelEditorBtn: document.querySelector("#cancelEditorBtn"),
  editLessonBtn: document.querySelector("#editLessonBtn"),
  deleteLessonBtn: document.querySelector("#deleteLessonBtn"),
  lessonForm: document.querySelector("#lessonForm"),
  editorMode: document.querySelector("#editorMode"),
  titleInput: document.querySelector("#titleInput"),
  categoryInput: document.querySelector("#categoryInput"),
  contentEditor: document.querySelector("#contentEditor"),
  examplesList: document.querySelector("#examplesList"),
  questionsList: document.querySelector("#questionsList"),
  addExampleBtn: document.querySelector("#addExampleBtn"),
  addQuestionBtn: document.querySelector("#addQuestionBtn"),
  readerTitle: document.querySelector("#readerTitle"),
  readerCategory: document.querySelector("#readerCategory"),
  readerMeta: document.querySelector("#readerMeta"),
  readerContent: document.querySelector("#readerContent"),
  readerExamples: document.querySelector("#readerExamples"),
  readerQuestions: document.querySelector("#readerQuestions"),
  toast: document.querySelector("#toast")
};

const allowedTags = new Set([
  "B",
  "I",
  "STRONG",
  "EM",
  "P",
  "BR",
  "UL",
  "OL",
  "LI",
  "H2",
  "H3",
  "PRE",
  "BLOCKQUOTE"
]);

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.add("hidden"), 2400);
}

function showView(name) {
  [els.dashboardView, els.lessonView, els.editorView].forEach(view => {
    view.classList.toggle("active", view.id === name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetLibraryView() {
  state.filter = "all";
  state.query = "";
  els.searchInput.value = "";
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.filter === "all");
  });
}

async function goToDashboard(options = {}) {
  state.currentLesson = null;
  state.editingId = null;
  if (options.resetLibrary) {
    resetLibraryView();
  }
  await loadLessons();
  showView("dashboardView");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textFromHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return div.textContent.replace(/\s+/g, " ").trim();
}

function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html || "";

  template.content.querySelectorAll("*").forEach(node => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    [...node.attributes].forEach(attribute => node.removeAttribute(attribute.name));
  });

  return template.innerHTML.trim();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Something went wrong");
  }
  return payload;
}

async function loadLessons() {
  const search = state.query ? `?q=${encodeURIComponent(state.query)}` : "";
  state.lessons = await api(`/api/lessons${search}`);
  renderDashboard();
}

function getCategoryCounts() {
  return state.lessons.reduce((counts, lesson) => {
    const category = lesson.category || "Uncategorized";
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
}

function filteredLessons() {
  const lessons = [...state.lessons];
  if (state.filter === "recent") {
    return lessons.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  if (state.filter === "uncategorized") {
    return lessons.filter(lesson => !lesson.category);
  }
  if (state.filter.startsWith("category:")) {
    const category = state.filter.replace("category:", "");
    return lessons.filter(lesson => (lesson.category || "Uncategorized") === category);
  }
  return lessons;
}

function renderStats() {
  const totalExamples = state.lessons.reduce((sum, lesson) => sum + (lesson.examples?.length || 0), 0);
  const totalQuestions = state.lessons.reduce((sum, lesson) => sum + (lesson.questions?.length || 0), 0);

  els.lessonCount.textContent = state.lessons.length;
  els.exampleCount.textContent = totalExamples;
  els.questionCount.textContent = totalQuestions;
}

function renderCategories() {
  const counts = getCategoryCounts();
  els.categoryList.innerHTML = "";

  Object.entries(counts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([category, count]) => {
      const chip = document.createElement("button");
      chip.className = "category-chip";
      chip.type = "button";
      chip.innerHTML = `<span>${escapeHtml(category)}</span><strong>${count}</strong>`;
      chip.addEventListener("click", () => {
        state.filter = `category:${category}`;
        document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
        goToDashboard();
      });
      els.categoryList.append(chip);
    });

  if (!els.categoryList.children.length) {
    els.categoryList.innerHTML = '<p class="soft-note">Categories appear after you save lessons.</p>';
  }
}

function renderDashboard() {
  const lessons = filteredLessons();
  renderStats();
  renderCategories();
  els.lessonGrid.innerHTML = "";
  els.emptyState.classList.toggle("hidden", lessons.length > 0);

  lessons.forEach(lesson => {
    const plainPreview = lesson.preview || textFromHtml(lesson.content);
    const card = document.createElement("button");
    card.className = "lesson-card";
    card.type = "button";
    card.innerHTML = `
      <div class="card-topline">
        <span class="category-pill">${escapeHtml(lesson.category || "Uncategorized")}</span>
        <span>${lesson.examples?.length || 0} ex</span>
      </div>
      <h3>${escapeHtml(lesson.title)}</h3>
      <p>${escapeHtml(plainPreview || "No notes yet. Open this lesson and start building it.")}</p>
      <div class="card-foot">
        <span>${lesson.questions?.length || 0} practice questions</span>
        <span>${escapeHtml(formatDate(lesson.updatedAt))}</span>
      </div>
    `;
    card.addEventListener("click", () => openLesson(lesson.id));
    els.lessonGrid.append(card);
  });
}

async function openLesson(id) {
  const lesson = await api(`/api/lessons/${id}`);
  state.currentLesson = lesson;
  els.readerTitle.textContent = lesson.title;
  els.readerCategory.textContent = lesson.category || "Uncategorized";
  els.readerMeta.textContent = `Created ${formatDate(lesson.createdAt)} | Updated ${formatDate(lesson.updatedAt)}`;
  els.readerContent.innerHTML = sanitizeHtml(lesson.content) || "<p>No lesson notes yet.</p>";

  renderReaderList(els.readerExamples, lesson.examples || [], "No structured examples yet.", item => `
    <strong>${escapeHtml(item.phrase)}</strong>
    <span>${escapeHtml(item.explanation)}</span>
  `);

  renderReaderList(els.readerQuestions, lesson.questions || [], "No practice questions yet.", item => `
    <strong>${escapeHtml(item.prompt)}</strong>
    <span>${escapeHtml(item.answer)}</span>
  `);

  showView("lessonView");
}

function renderReaderList(container, items, emptyMessage, template) {
  container.innerHTML = "";
  if (!items.length) {
    container.innerHTML = `<p class="soft-note">${emptyMessage}</p>`;
    return;
  }

  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "example-item";
    row.innerHTML = template(item);
    container.append(row);
  });
}

function resetEditor() {
  state.editingId = null;
  els.editorMode.textContent = "New lesson";
  els.lessonForm.reset();
  els.contentEditor.innerHTML = "";
  els.examplesList.innerHTML = "";
  els.questionsList.innerHTML = "";
  addExampleRow();
  addQuestionRow();
}

function openEditor(lesson = null) {
  resetEditor();
  if (lesson) {
    state.editingId = lesson.id;
    els.editorMode.textContent = "Editing lesson";
    els.titleInput.value = lesson.title;
    els.categoryInput.value = lesson.category || "";
    els.contentEditor.innerHTML = sanitizeHtml(lesson.content) || "";
    els.examplesList.innerHTML = "";
    els.questionsList.innerHTML = "";
    (lesson.examples?.length ? lesson.examples : [{}]).forEach(addExampleRow);
    (lesson.questions?.length ? lesson.questions : [{}]).forEach(addQuestionRow);
  }
  showView("editorView");
  els.titleInput.focus();
}

function addExampleRow(example = {}) {
  const row = createTwoFieldRow({
    className: "example-row",
    firstClass: "example-phrase",
    secondClass: "example-explanation",
    firstLabel: "Example sentence",
    secondLabel: "Explanation",
    firstPlaceholder: "She writes every day.",
    secondPlaceholder: "Simple present for a repeated action.",
    firstValue: example.phrase,
    secondValue: example.explanation,
    removeText: "Remove"
  });
  els.examplesList.append(row);
}

function addQuestionRow(question = {}) {
  const row = createTwoFieldRow({
    className: "question-row",
    firstClass: "question-prompt",
    secondClass: "question-answer",
    firstLabel: "Question",
    secondLabel: "Answer",
    firstPlaceholder: "Which word is the noun?",
    secondPlaceholder: "The noun is...",
    firstValue: question.prompt,
    secondValue: question.answer,
    removeText: "Remove"
  });
  els.questionsList.append(row);
}

function createTwoFieldRow(config) {
  const row = document.createElement("div");
  row.className = config.className;
  row.innerHTML = `
    <label>
      <span>${config.firstLabel}</span>
      <input class="${config.firstClass}" type="text" placeholder="${escapeHtml(config.firstPlaceholder)}" value="${escapeHtml(config.firstValue || "")}">
    </label>
    <label>
      <span>${config.secondLabel}</span>
      <input class="${config.secondClass}" type="text" placeholder="${escapeHtml(config.secondPlaceholder)}" value="${escapeHtml(config.secondValue || "")}">
    </label>
    <button class="remove-example" type="button">${config.removeText}</button>
  `;
  row.querySelector(".remove-example").addEventListener("click", () => {
    const container = row.parentElement;
    row.remove();
    if (container && !container.children.length) {
      if (config.className === "question-row") addQuestionRow();
      else addExampleRow();
    }
  });
  return row;
}

function collectRows(selector, firstSelector, secondSelector, firstKey, secondKey) {
  return [...document.querySelectorAll(selector)].map(row => ({
    [firstKey]: row.querySelector(firstSelector).value,
    [secondKey]: row.querySelector(secondSelector).value
  }));
}

async function saveLesson(event) {
  event.preventDefault();
  const isEditing = Boolean(state.editingId);
  const cleanContent = sanitizeHtml(els.contentEditor.innerHTML);
  const payload = {
    title: els.titleInput.value,
    category: els.categoryInput.value,
    content: cleanContent,
    examples: collectRows(".example-row", ".example-phrase", ".example-explanation", "phrase", "explanation"),
    questions: collectRows(".question-row", ".question-prompt", ".question-answer", "prompt", "answer")
  };

  const path = state.editingId ? `/api/lessons/${state.editingId}` : "/api/lessons";
  const method = state.editingId ? "PUT" : "POST";
  const lesson = await api(path, {
    method,
    body: JSON.stringify(payload)
  });

  showToast(isEditing ? "Lesson updated" : "Lesson created");
  if (!isEditing) {
    resetLibraryView();
  }
  await loadLessons();
  if (isEditing) {
    openLesson(lesson.id);
  } else {
    showView("dashboardView");
  }
}

async function deleteCurrentLesson() {
  if (!state.currentLesson) return;
  const confirmed = window.confirm(`Delete "${state.currentLesson.title}"?`);
  if (!confirmed) return;

  await api(`/api/lessons/${state.currentLesson.id}`, { method: "DELETE" });
  state.currentLesson = null;
  showToast("Lesson deleted");
  await goToDashboard({ resetLibrary: true });
}

function bindEvents() {
  els.createLessonBtn.addEventListener("click", () => openEditor());
  els.emptyCreateBtn.addEventListener("click", () => openEditor());
  els.backToDashboardBtn.addEventListener("click", () => goToDashboard({ resetLibrary: true }));
  els.cancelEditorBtn.addEventListener("click", () => goToDashboard());
  els.addExampleBtn.addEventListener("click", () => addExampleRow());
  els.addQuestionBtn.addEventListener("click", () => addQuestionRow());
  els.lessonForm.addEventListener("submit", saveLesson);
  els.deleteLessonBtn.addEventListener("click", deleteCurrentLesson);
  els.editLessonBtn.addEventListener("click", () => {
    if (state.currentLesson) openEditor(state.currentLesson);
  });

  document.querySelectorAll(".toolbar button").forEach(button => {
    button.addEventListener("click", () => {
      els.contentEditor.focus();
      document.execCommand(button.dataset.command, false, button.dataset.value || null);
    });
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      goToDashboard();
    });
  });

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim();
    window.clearTimeout(els.searchInput.timer);
    els.searchInput.timer = window.setTimeout(loadLessons, 180);
  });
}

bindEvents();
loadLessons().catch(error => showToast(error.message));
