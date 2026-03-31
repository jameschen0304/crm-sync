const TODO_DATA_KEY = "crm_todo_items_v1";
let todoItems = [];

function q(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function loadTodoItems() {
  try {
    const raw = localStorage.getItem(TODO_DATA_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function saveTodoItems() {
  localStorage.setItem(TODO_DATA_KEY, JSON.stringify(todoItems));
}

function getTodayDateStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todoPriorityLabel(priority) {
  if (priority === "high") return "高优先级";
  if (priority === "low") return "低优先级";
  return "中优先级";
}

function todoRepeatLabel(repeat) {
  if (repeat === "daily") return "每天";
  if (repeat === "workday") return "工作日";
  if (repeat === "weekly") return "每周";
  if (repeat === "monthly") return "每月";
  return "不重复";
}

function nextDateByRepeat(dateStr, repeat) {
  if (!dateStr || !repeat || repeat === "none") return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  if (repeat === "daily") d.setDate(d.getDate() + 1);
  else if (repeat === "workday") {
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6);
  } else if (repeat === "weekly") d.setDate(d.getDate() + 7);
  else if (repeat === "monthly") d.setMonth(d.getMonth() + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todoStatus(item, todayStr) {
  if (item.done) return "done";
  if (!item.due_date) return "pending";
  if (item.due_date < todayStr) return "overdue";
  if (item.due_date === todayStr) return "today";
  return "pending";
}

function renderTodoList() {
  const listEl = q("todoList");
  const statsEl = q("todoStats");
  const todayStr = getTodayDateStr();
  const filter = (q("todoFilter")?.value || "all").trim();

  const stats = {
    total: todoItems.length,
    done: todoItems.filter((x) => x.done).length,
    overdue: todoItems.filter((x) => todoStatus(x, todayStr) === "overdue").length,
    today: todoItems.filter((x) => todoStatus(x, todayStr) === "today").length,
  };
  const pending = Math.max(0, stats.total - stats.done);
  statsEl.textContent = `总计 ${stats.total} · 待办 ${pending} · 今天到期 ${stats.today} · 逾期 ${stats.overdue} · 完成 ${stats.done}`;

  const filtered = todoItems.filter((item) => {
    const s = todoStatus(item, todayStr);
    if (filter === "all") return true;
    if (filter === "pending") return !item.done;
    if (filter === "done") return item.done;
    return s === filter;
  });

  if (!filtered.length) {
    listEl.innerHTML = `<div class="todo-empty">暂无任务，先添加一条吧。</div>`;
    return;
  }

  listEl.innerHTML = filtered.map((item) => {
    const s = todoStatus(item, todayStr);
    const dueText = item.due_date ? `截止：${escapeHtml(item.due_date)}` : "截止：未设置";
    const statusText = s === "overdue" ? "逾期" : s === "today" ? "今天到期" : item.done ? "已完成" : "待办";
    const repeatText = `重复：${todoRepeatLabel(item.repeat || "none")}`;
    return `
      <div class="todo-item ${item.done ? "done" : ""}">
        <input class="todo-check" type="checkbox" data-todo-toggle="${item.id}" ${item.done ? "checked" : ""} />
        <div class="todo-main">
          <div class="todo-text">${escapeHtml(item.text || "")}</div>
          <div class="todo-meta">${dueText} · ${repeatText} · 状态：${statusText} · 创建：${escapeHtml(String(item.created_at || "").slice(0, 10))}</div>
        </div>
        <div class="todo-actions">
          <span class="todo-priority ${item.priority || "medium"}">${todoPriorityLabel(item.priority)}</span>
          <button class="btn btn-secondary" type="button" data-todo-del="${item.id}">删除</button>
        </div>
      </div>
    `;
  }).join("");

  listEl.querySelectorAll("[data-todo-toggle]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = Number(el.getAttribute("data-todo-toggle"));
      const row = todoItems.find((x) => Number(x.id) === id);
      if (!row) return;
      const prevDone = !!row.done;
      row.done = !!el.checked;
      row.updated_at = new Date().toISOString();
      if (!prevDone && row.done && row.repeat && row.repeat !== "none") {
        const nextDue = nextDateByRepeat(row.due_date || getTodayDateStr(), row.repeat);
        const now = new Date().toISOString();
        const nextId = todoItems.length ? Math.max(...todoItems.map((x) => Number(x.id) || 0)) + 1 : 1;
        todoItems.unshift({
          id: nextId,
          text: row.text,
          due_date: nextDue,
          repeat: row.repeat,
          priority: row.priority || "medium",
          done: false,
          created_at: now,
          updated_at: now,
        });
      }
      saveTodoItems();
      renderTodoList();
    });
  });

  listEl.querySelectorAll("[data-todo-del]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.getAttribute("data-todo-del"));
      todoItems = todoItems.filter((x) => Number(x.id) !== id);
      saveTodoItems();
      renderTodoList();
    });
  });
}

q("todoForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const text = q("todoText").value.trim();
  if (!text) return;
  const dueDate = (q("todoDueDate").value || "").trim() || null;
  const repeat = (q("todoRepeat").value || "none").trim();
  const priority = (q("todoPriority").value || "medium").trim();
  const normalizedDue = repeat !== "none" ? (dueDate || getTodayDateStr()) : dueDate;
  const nextId = todoItems.length ? Math.max(...todoItems.map((x) => Number(x.id) || 0)) + 1 : 1;
  const now = new Date().toISOString();
  todoItems.unshift({
    id: nextId,
    text,
    due_date: normalizedDue,
    repeat: ["none", "daily", "workday", "weekly", "monthly"].includes(repeat) ? repeat : "none",
    priority: ["high", "medium", "low"].includes(priority) ? priority : "medium",
    done: false,
    created_at: now,
    updated_at: now,
  });
  saveTodoItems();
  q("todoForm").reset();
  q("todoRepeat").value = "none";
  q("todoPriority").value = "medium";
  renderTodoList();
});

q("todoFilter").addEventListener("change", renderTodoList);
q("btnTodoClearDone").addEventListener("click", () => {
  todoItems = todoItems.filter((x) => !x.done);
  saveTodoItems();
  renderTodoList();
});

todoItems = loadTodoItems();
renderTodoList();
