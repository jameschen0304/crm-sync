const TODO_DATA_KEY = "crm_todo_items_v1";
let todoItems = [];
let editingTodoId = null;
const TODO_HOLIDAY_SEED_FLAG_KEY = "crm_todo_holiday_seeded_v1";

const HOLIDAY_EVENTS = [
  { m: 1, d: 1, name: "元旦 (New Year)", market: "全球", factory: "红厂", give: "12月29日" },
  { m: 2, d: 17, name: "中国春节", market: "全球", factory: "红厂", give: "2月14日" },
  { m: 3, d: 6, name: "加纳独立日", market: "西非", factory: "康宁", give: "3月3日" },
  { m: 3, d: 8, name: "妇女节", market: "全球", factory: "康宁", give: "3月5日" },
  { m: 3, d: 20, name: "开斋节", market: "中东/东南亚/伊朗", factory: "红厂", give: "3月17日" },
  { m: 3, d: 21, name: "诺鲁孜节 (波斯新年)", market: "中亚/土耳其/伊朗", factory: "康宁", give: "3月18日" },
  { m: 4, d: 13, name: "宋干节", market: "泰国", factory: "红厂", give: "4月10日" },
  { m: 5, d: 1, name: "国际劳动节", market: "全球", factory: "红厂", give: "4月28日" },
  { m: 5, d: 25, name: "非洲日 (Africa Day)", market: "全非洲", factory: "康宁", give: "5月22日" },
  { m: 6, d: 27, name: "古尔邦节 (Eid al-Adha)", market: "中东/东南亚/伊朗", factory: "红厂", give: "6月24日" },
  { m: 8, d: 15, name: "韩国光复节", market: "韩国", factory: "红厂", give: "8月12日" },
  { m: 9, d: 7, name: "巴西独立日", market: "拉美", factory: "康宁", give: "9月4日" },
  { m: 9, d: 23, name: "沙特国庆日", market: "中东(沙特)", factory: "康宁", give: "9月20日" },
  { m: 10, d: 1, name: "中国国庆日", market: "全球", factory: "钢铁", give: "9月28日" },
  { m: 10, d: 29, name: "土耳其共和国日", market: "土耳其", factory: "康宁", give: "10月26日" },
  { m: 11, d: 26, name: "感恩节 (Thanksgiving)", market: "北美/全球", factory: "红厂", give: "11月23日" },
  { m: 12, d: 2, name: "阿联酋国庆日", market: "中东", factory: "康宁", give: "11月29日" },
  { m: 12, d: 12, name: "肯尼亚独立日", market: "东非", factory: "康宁", give: "12月9日" },
  { m: 12, d: 22, name: "冬至 / 雅尔达之夜", market: "伊朗", factory: "康宁", give: "12月19日" },
  { m: 12, d: 25, name: "圣诞节 (Christmas)", market: "全球", factory: "红厂", give: "12月22日" },
];

// 西方传统节日（当天提醒：T-0）
const WESTERN_SAME_DAY_EVENTS = [
  { m: 1, d: 26, name: "澳大利亚国庆日 (Australia Day)", market: "澳洲", factory: "红厂", give: "" },
  { m: 2, d: 14, name: "情人节 (Valentine's Day)", market: "欧美", factory: "康宁", give: "" },
  { m: 3, d: 17, name: "圣帕特里克节 (St. Patrick's Day)", market: "欧美", factory: "红厂", give: "" },
  { m: 7, d: 1, name: "加拿大国庆日 (Canada Day)", market: "加拿大", factory: "康宁", give: "" },
  { m: 7, d: 4, name: "美国独立日 (Independence Day)", market: "美国", factory: "红厂", give: "" },
  { m: 10, d: 31, name: "万圣节 (Halloween)", market: "欧美/全球", factory: "康宁", give: "" },
  { m: 11, d: 5, name: "盖伊福克斯之夜 (Guy Fawkes Night)", market: "英国", factory: "红厂", give: "" },
  { m: 11, d: 11, name: "第一次世界大战停战纪念日 (Remembrance Day)", market: "英联邦", factory: "康宁", give: "" },
  { m: 12, d: 26, name: "节礼日 (Boxing Day)", market: "英联邦", factory: "红厂", give: "" },
  { m: 12, d: 31, name: "新年前夜 (New Year's Eve)", market: "欧美/全球", factory: "康宁", give: "" },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateToStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(d, days) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

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

function seedHolidayTodos() {
  const existingKeys = new Set(todoItems.map((x) => x.key).filter(Boolean));
  const now = new Date().toISOString();

  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
  const curYear = today.getFullYear();

  // 从当前年份开始，只为“提醒日未过”的事件生成
  let nextId = todoItems.length ? Math.max(...todoItems.map((x) => Number(x.id) || 0)) + 1 : 1;
  let added = 0;

  for (const e of HOLIDAY_EVENTS) {
    for (let t = 3; t >= 1; t -= 1) {
      // t=3 代表“到期前三天”（提醒日=节日当天-3）
      // 找到第一年的提醒日未过
      let year = curYear;
      for (let safety = 0; safety < 3; safety += 1) {
        const holiday = new Date(year, e.m - 1, e.d, 12, 0, 0);
        const remind = addDays(holiday, -t);
        if (remind.getTime() >= todayMid.getTime()) {
          const due = dateToStr(remind);
          const key = `${year}-${e.m}-${e.d}-${e.name}-T${t}`;
          if (!existingKeys.has(key)) {
            const prefix = `节日节点：${e.name}`;
            const suffix = `（T-${t}）`;
            const baseText = `${prefix}${suffix} - ${e.market}`;
            const text = baseText.length > 160 ? baseText.slice(0, 157) + "..." : baseText;
            todoItems.unshift({
              id: nextId++,
              key,
              text,
              due_date: due,
              repeat: "none",
              priority: "medium",
              done: false,
              created_at: now,
              updated_at: now,
              meta: `给到日期：${e.give}；制作：${e.factory}`,
            });
            existingKeys.add(key);
            added += 1;
          }
          break;
        }
        year += 1;
      }
    }
  }

  if (added > 0) {
    saveTodoItems();
  }
  localStorage.setItem(TODO_HOLIDAY_SEED_FLAG_KEY, "1");
}

function seedWesternSameDayTodos() {
  const existingKeys = new Set(todoItems.map((x) => x.key).filter(Boolean));
  const now = new Date().toISOString();

  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0);
  const curYear = today.getFullYear();

  let nextId = todoItems.length ? Math.max(...todoItems.map((x) => Number(x.id) || 0)) + 1 : 1;
  let added = 0;

  for (const e of WESTERN_SAME_DAY_EVENTS) {
    for (let year = curYear; year <= curYear + 2; year += 1) {
      const holiday = new Date(year, e.m - 1, e.d, 12, 0, 0);
      if (holiday.getTime() < todayMid.getTime()) continue;

      const due = dateToStr(holiday);
      const key = `${year}-${e.m}-${e.d}-${e.name}-T0`;
      if (!existingKeys.has(key)) {
        const text = `西方节日当天提醒：${e.name}（${e.market}）`;
        const textTrim = text.length > 160 ? text.slice(0, 157) + "..." : text;
        todoItems.unshift({
          id: nextId++,
          key,
          text: textTrim,
          due_date: due,
          repeat: "none",
          priority: "medium",
          done: false,
          created_at: now,
          updated_at: now,
          meta: `制作：${e.factory}`,
        });
        existingKeys.add(key);
        added += 1;
      }
      break;
    }
  }

  if (added > 0) saveTodoItems();
}

function resetTodoForm() {
  q("todoForm").reset();
  q("todoRepeat").value = "none";
  q("todoPriority").value = "medium";
  editingTodoId = null;
  q("btnTodoAdd").textContent = "添加任务";
  const cancel = q("btnTodoCancelEdit");
  if (cancel) cancel.hidden = true;
  q("todoForm").classList.remove("is-editing");
}

function beginEditTodo(id) {
  const row = todoItems.find((x) => Number(x.id) === Number(id));
  if (!row) return;
  editingTodoId = Number(id);
  q("todoText").value = row.text || "";
  q("todoDueDate").value = row.due_date || "";
  const r = row.repeat || "none";
  q("todoRepeat").value = ["none", "daily", "workday", "weekly", "monthly"].includes(r) ? r : "none";
  const p = row.priority || "medium";
  q("todoPriority").value = ["high", "medium", "low"].includes(p) ? p : "medium";
  q("btnTodoAdd").textContent = "保存修改";
  const cancel = q("btnTodoCancelEdit");
  if (cancel) cancel.hidden = false;
  q("todoForm").classList.add("is-editing");
  q("todoText").focus();
  renderTodoList();
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
  const filter = (q("todoFilter")?.value || "today_do").trim();

  const stats = {
    total: todoItems.length,
    done: todoItems.filter((x) => x.done).length,
    overdue: todoItems.filter((x) => todoStatus(x, todayStr) === "overdue").length,
    today: todoItems.filter((x) => todoStatus(x, todayStr) === "today").length,
  };
  const pending = Math.max(0, stats.total - stats.done);
  statsEl.textContent = `总计 ${stats.total} · 待办 ${pending} · 今天到期 ${stats.today} · 逾期 ${stats.overdue} · 完成 ${stats.done}`;
  if (q("todoStatTotal")) q("todoStatTotal").textContent = String(stats.total);
  if (q("todoStatPending")) q("todoStatPending").textContent = String(pending);
  if (q("todoStatToday")) q("todoStatToday").textContent = String(stats.today);
  if (q("todoStatOverdue")) q("todoStatOverdue").textContent = String(stats.overdue);
  if (q("todoStatDone")) q("todoStatDone").textContent = String(stats.done);

  const filtered = todoItems.filter((item) => {
    const s = todoStatus(item, todayStr);
    if (filter === "today_do") {
      if (item.done) return false;
      if (!item.due_date) return true;
      return item.due_date <= todayStr;
    }
    if (filter === "all") return true;
    if (filter === "pending") return !item.done;
    if (filter === "done") return item.done;
    return s === filter;
  });

  if (!filtered.length) {
    const emptyHint =
      filter === "today_do"
        ? "今天没有待办。未来日期的任务请切换到「全部」或「待完成」查看。"
        : "暂无任务，先添加一条吧。";
    listEl.innerHTML = `<div class="todo-empty">${emptyHint}</div>`;
    return;
  }

  listEl.innerHTML = filtered.map((item) => {
    const s = todoStatus(item, todayStr);
    const dueText = item.due_date ? `截止：${escapeHtml(item.due_date)}` : "截止：未设置";
    const statusText = s === "overdue" ? "逾期" : s === "today" ? "今天到期" : item.done ? "已完成" : "待办";
    const repeatText = `重复：${todoRepeatLabel(item.repeat || "none")}`;
    const editingCls =
      editingTodoId != null && Number(item.id) === editingTodoId ? " editing" : "";
    return `
      <div class="todo-item ${item.done ? "done" : ""}${editingCls}">
        <input class="todo-check" type="checkbox" data-todo-toggle="${item.id}" ${item.done ? "checked" : ""} />
        <div class="todo-main">
          <div class="todo-text">${escapeHtml(item.text || "")}</div>
          <div class="todo-meta">${dueText} · ${repeatText} · 状态：${statusText} · 创建：${escapeHtml(String(item.created_at || "").slice(0, 10))}</div>
        </div>
        <div class="todo-actions">
          <span class="todo-priority ${item.priority || "medium"}">${todoPriorityLabel(item.priority)}</span>
          <button class="btn btn-secondary" type="button" data-todo-edit="${item.id}">编辑</button>
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

  listEl.querySelectorAll("[data-todo-edit]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.getAttribute("data-todo-edit"));
      beginEditTodo(id);
    });
  });

  listEl.querySelectorAll("[data-todo-del]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.getAttribute("data-todo-del"));
      if (editingTodoId === id) {
        resetTodoForm();
      }
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
  const normRepeat = ["none", "daily", "workday", "weekly", "monthly"].includes(repeat) ? repeat : "none";
  const normPriority = ["high", "medium", "low"].includes(priority) ? priority : "medium";
  const now = new Date().toISOString();

  if (editingTodoId != null) {
    const row = todoItems.find((x) => Number(x.id) === editingTodoId);
    if (row) {
      row.text = text;
      row.due_date = normalizedDue;
      row.repeat = normRepeat;
      row.priority = normPriority;
      row.updated_at = now;
    }
    saveTodoItems();
    resetTodoForm();
    renderTodoList();
    return;
  }

  const nextId = todoItems.length ? Math.max(...todoItems.map((x) => Number(x.id) || 0)) + 1 : 1;
  todoItems.unshift({
    id: nextId,
    text,
    due_date: normalizedDue,
    repeat: normRepeat,
    priority: normPriority,
    done: false,
    created_at: now,
    updated_at: now,
  });
  saveTodoItems();
  resetTodoForm();
  renderTodoList();
});

q("btnTodoCancelEdit").addEventListener("click", () => {
  resetTodoForm();
  renderTodoList();
});

q("todoFilter").addEventListener("change", renderTodoList);
q("btnTodoClearDone").addEventListener("click", () => {
  todoItems = todoItems.filter((x) => !x.done);
  saveTodoItems();
  renderTodoList();
});

todoItems = loadTodoItems();
seedHolidayTodos();
seedWesternSameDayTodos();
renderTodoList();
