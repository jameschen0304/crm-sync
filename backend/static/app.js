const API_KEY = localStorage.getItem("crm_api_key") || "dev-key-change-me";
const HEADERS = { "Content-Type": "application/json", "X-API-Key": API_KEY };

const WORK_START = "09:00";
const WORK_END = "18:00";
const WORK_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
const FOLLOW_UP_STAGE_DAYS = {
  "新线索": 1,
  "已联系": 3,
  "需求确认": 3,
  "已报价": 2,
  "谈判中": 2,
  "成交": 30,
  "暂停": null,
};
/** 列表「跟进」按钮：每记一次自动推进到下一阶段（暂停不推进，成交保持） */
const FOLLOW_UP_STAGE_ORDER = ["新线索", "已联系", "需求确认", "已报价", "谈判中", "成交"];

function stageAfterFollowUpRecord(currentStage) {
  const cur = currentStage || "新线索";
  if (cur === "暂停") return "暂停";
  const idx = FOLLOW_UP_STAGE_ORDER.indexOf(cur);
  if (idx === -1) return cur;
  if (idx >= FOLLOW_UP_STAGE_ORDER.length - 1) return "成交";
  return FOLLOW_UP_STAGE_ORDER[idx + 1];
}
// 节假日（MM-DD）: 自动排期时会避开这些日期。
// 可按你的实际节假日维护这份列表。
const HOLIDAYS_MMDD = new Set([
  "01-01", // 元旦
  "05-01", // 劳动节
  "10-01", "10-02", "10-03", // 国庆常见公休
]);
const REGION_ORDER = ["东南亚", "南亚", "欧美澳", "中东", "中亚", "非洲", "中南美"];
const DAILY_SETTINGS_KEY = "crm_daily_settings";
const LOCAL_DATA_KEY = "crm_companies_local_v1";
const AUTO_SEED_FLAG_KEY = "crm_seed_imported_v1";
let USE_LOCAL_MODE = window.location.protocol === "file:";

// 选择国家后自动填默认时区（IANA）
// 说明：部分国家跨多个时区，这里填“最常用/首都时区”；你仍可手动改。
const COUNTRY_DEFAULT_TZ = {
  // 东南亚
  BN: "Asia/Brunei",
  KH: "Asia/Phnom_Penh",
  ID: "Asia/Jakarta",
  LA: "Asia/Vientiane",
  MY: "Asia/Kuala_Lumpur",
  MM: "Asia/Yangon",
  PH: "Asia/Manila",
  SG: "Asia/Singapore",
  TH: "Asia/Bangkok",
  TL: "Asia/Dili",
  VN: "Asia/Ho_Chi_Minh",
  // 南亚
  AF: "Asia/Kabul",
  BD: "Asia/Dhaka",
  BT: "Asia/Thimphu",
  IN: "Asia/Kolkata",
  MV: "Indian/Maldives",
  NP: "Asia/Kathmandu",
  PK: "Asia/Karachi",
  LK: "Asia/Colombo",
  // 中亚
  KZ: "Asia/Almaty",
  KG: "Asia/Bishkek",
  TJ: "Asia/Dushanbe",
  TM: "Asia/Ashgabat",
  UZ: "Asia/Tashkent",
  // 中东
  AE: "Asia/Dubai",
  BH: "Asia/Bahrain",
  EG: "Africa/Cairo",
  IR: "Asia/Tehran",
  IQ: "Asia/Baghdad",
  IL: "Asia/Jerusalem",
  JO: "Asia/Amman",
  KW: "Asia/Kuwait",
  LB: "Asia/Beirut",
  OM: "Asia/Muscat",
  PS: "Asia/Gaza",
  QA: "Asia/Qatar",
  SA: "Asia/Riyadh",
  SY: "Asia/Damascus",
  TR: "Europe/Istanbul",
  YE: "Asia/Aden",
  // 欧美澳（常用）
  US: "America/New_York",
  CA: "America/Toronto",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  PT: "Europe/Lisbon",
  GR: "Europe/Athens",
  RO: "Europe/Bucharest",
  HU: "Europe/Budapest",
  UA: "Europe/Kyiv",
  RU: "Europe/Moscow",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  // 非洲（常用）
  ZA: "Africa/Johannesburg",
  NG: "Africa/Lagos",
  KE: "Africa/Nairobi",
  MA: "Africa/Casablanca",
  TN: "Africa/Tunis",
  GH: "Africa/Accra",
  ET: "Africa/Addis_Ababa",
  DZ: "Africa/Algiers",
  AO: "Africa/Luanda",
  UG: "Africa/Kampala",
  TZ: "Africa/Dar_es_Salaam",
  // 中南美（常用）
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago",
  CO: "America/Bogota",
  PE: "America/Lima",
  VE: "America/Caracas",
  EC: "America/Guayaquil",
  UY: "America/Montevideo",
  PA: "America/Panama",
  CR: "America/Costa_Rica",
  DO: "America/Santo_Domingo",
  JM: "America/Jamaica",
  CU: "America/Havana",
  // 其他（东亚等）
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  MO: "Asia/Macau",
  TW: "Asia/Taipei",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  KP: "Asia/Pyongyang",
  MN: "Asia/Ulaanbaatar",
};

// 国家/地区（按你指定的大区分组；不在这些分组内的放到“其他”避免漏项）
// 代码为 ISO-3166-1 alpha2（少量常用地区也包含在“其他”里）
const COUNTRY_GROUPS = [
  {
    group: "东南亚",
    items: [
      ["BN", "文莱"], ["KH", "柬埔寨"], ["ID", "印度尼西亚"], ["LA", "老挝"], ["MY", "马来西亚"],
      ["MM", "缅甸"], ["PH", "菲律宾"], ["SG", "新加坡"], ["TH", "泰国"], ["TL", "东帝汶"], ["VN", "越南"],
    ],
  },
  {
    group: "南亚",
    items: [
      ["AF", "阿富汗"], ["BD", "孟加拉国"], ["BT", "不丹"], ["IN", "印度"], ["MV", "马尔代夫"],
      ["NP", "尼泊尔"], ["PK", "巴基斯坦"], ["LK", "斯里兰卡"],
    ],
  },
  {
    group: "中亚",
    items: [
      ["KZ", "哈萨克斯坦"], ["KG", "吉尔吉斯斯坦"], ["TJ", "塔吉克斯坦"], ["TM", "土库曼斯坦"], ["UZ", "乌兹别克斯坦"],
    ],
  },
  {
    group: "中东",
    items: [
      ["AE", "阿联酋"], ["BH", "巴林"], ["EG", "埃及"], ["IR", "伊朗"], ["IQ", "伊拉克"], ["IL", "以色列"],
      ["JO", "约旦"], ["KW", "科威特"], ["LB", "黎巴嫩"], ["OM", "阿曼"], ["PS", "巴勒斯坦"], ["QA", "卡塔尔"],
      ["SA", "沙特阿拉伯"], ["SY", "叙利亚"], ["TR", "土耳其"], ["YE", "也门"],
    ],
  },
  {
    group: "欧美澳",
    items: [
      // 北美
      ["CA", "加拿大"], ["US", "美国"],
      // 欧洲（按常见国家覆盖，剩余会在“其他”里兜底）
      ["AL", "阿尔巴尼亚"], ["AD", "安道尔"], ["AT", "奥地利"], ["BE", "比利时"], ["BA", "波黑"], ["BG", "保加利亚"],
      ["BY", "白俄罗斯"], ["CH", "瑞士"], ["CY", "塞浦路斯"], ["CZ", "捷克"], ["DE", "德国"], ["DK", "丹麦"],
      ["EE", "爱沙尼亚"], ["ES", "西班牙"], ["FI", "芬兰"], ["FR", "法国"], ["GB", "英国"], ["GR", "希腊"],
      ["HR", "克罗地亚"], ["HU", "匈牙利"], ["IE", "爱尔兰"], ["IS", "冰岛"], ["IT", "意大利"], ["LT", "立陶宛"],
      ["LU", "卢森堡"], ["LV", "拉脱维亚"], ["MC", "摩纳哥"], ["MD", "摩尔多瓦"], ["ME", "黑山"], ["MK", "北马其顿"],
      ["MT", "马耳他"], ["NL", "荷兰"], ["NO", "挪威"], ["PL", "波兰"], ["PT", "葡萄牙"], ["RO", "罗马尼亚"],
      ["RS", "塞尔维亚"], ["RU", "俄罗斯"], ["SE", "瑞典"], ["SI", "斯洛文尼亚"], ["SK", "斯洛伐克"], ["SM", "圣马力诺"],
      ["UA", "乌克兰"], ["VA", "梵蒂冈"],
      // 澳新
      ["AU", "澳大利亚"], ["NZ", "新西兰"],
    ],
  },
  {
    group: "非洲",
    items: [
      ["DZ", "阿尔及利亚"], ["AO", "安哥拉"], ["BJ", "贝宁"], ["BW", "博茨瓦纳"], ["BF", "布基纳法索"], ["BI", "布隆迪"],
      ["CM", "喀麦隆"], ["CV", "佛得角"], ["CF", "中非"], ["TD", "乍得"], ["KM", "科摩罗"], ["CG", "刚果（布）"],
      ["CD", "刚果（金）"], ["CI", "科特迪瓦"], ["DJ", "吉布提"], ["ER", "厄立特里亚"], ["ET", "埃塞俄比亚"],
      ["GA", "加蓬"], ["GH", "加纳"], ["GM", "冈比亚"], ["GN", "几内亚"], ["GQ", "赤道几内亚"], ["GW", "几内亚比绍"],
      ["KE", "肯尼亚"], ["LR", "利比里亚"], ["LY", "利比亚"], ["LS", "莱索托"], ["MA", "摩洛哥"], ["MG", "马达加斯加"],
      ["ML", "马里"], ["MR", "毛里塔尼亚"], ["MU", "毛里求斯"], ["MW", "马拉维"], ["MZ", "莫桑比克"], ["NA", "纳米比亚"],
      ["NE", "尼日尔"], ["NG", "尼日利亚"], ["RW", "卢旺达"], ["SC", "塞舌尔"], ["SD", "苏丹"], ["SN", "塞内加尔"],
      ["SL", "塞拉利昂"], ["SO", "索马里"], ["SS", "南苏丹"], ["ST", "圣多美和普林西比"], ["SZ", "斯威士兰"],
      ["TG", "多哥"], ["TN", "突尼斯"], ["TZ", "坦桑尼亚"], ["UG", "乌干达"], ["ZA", "南非"], ["ZM", "赞比亚"], ["ZW", "津巴布韦"],
      ["EH", "西撒哈拉"],
    ],
  },
  {
    group: "中南美",
    items: [
      // 中美
      ["BZ", "伯利兹"], ["CR", "哥斯达黎加"], ["GT", "危地马拉"], ["HN", "洪都拉斯"], ["MX", "墨西哥"],
      ["NI", "尼加拉瓜"], ["PA", "巴拿马"], ["SV", "萨尔瓦多"],
      // 加勒比（归入中南美）
      ["CU", "古巴"], ["DO", "多米尼加"], ["HT", "海地"], ["JM", "牙买加"], ["TT", "特立尼达和多巴哥"],
      ["BB", "巴巴多斯"], ["BS", "巴哈马"], ["GD", "格林纳达"], ["KN", "圣基茨和尼维斯"], ["LC", "圣卢西亚"], ["VC", "圣文森特和格林纳丁斯"],
      ["AG", "安提瓜和巴布达"], ["DM", "多米尼克"],
      // 南美
      ["AR", "阿根廷"], ["BO", "玻利维亚"], ["BR", "巴西"], ["CL", "智利"], ["CO", "哥伦比亚"], ["EC", "厄瓜多尔"],
      ["GY", "圭亚那"], ["PE", "秘鲁"], ["PY", "巴拉圭"], ["SR", "苏里南"], ["UY", "乌拉圭"], ["VE", "委内瑞拉"],
    ],
  },
  {
    group: "其他",
    items: [
      // 东亚/东北亚等（你未单列，为避免缺失放这里）
      ["CN", "中国"], ["HK", "中国香港"], ["MO", "中国澳门"], ["TW", "中国台湾"], ["JP", "日本"], ["KR", "韩国"],
      ["KP", "朝鲜"], ["MN", "蒙古"], ["BN", "文莱"], //（占位避免重复，下面会去重）
      // 大洋洲小国/地区、欧洲遗漏、其他地区等常用项
      ["AM", "亚美尼亚"], ["AZ", "阿塞拜疆"], ["GE", "格鲁吉亚"],
      ["CL", "智利"], //（占位避免重复，下面会去重）
      ["FJ", "斐济"], ["PG", "巴布亚新几内亚"], ["SB", "所罗门群岛"], ["VU", "瓦努阿图"], ["WS", "萨摩亚"], ["TO", "汤加"],
      ["NR", "瑙鲁"], ["TV", "图瓦卢"], ["KI", "基里巴斯"], ["FM", "密克罗尼西亚联邦"], ["MH", "马绍尔群岛"], ["PW", "帕劳"],
      // 以防用户需要：仍可手动留空
    ],
  },
];

function initCountrySelect() {
  const sel = q("country_code");
  if (!sel) return;
  // 清空保留第一项
  const first = sel.querySelector("option[value='']") || null;
  sel.innerHTML = "";
  if (first) sel.appendChild(first);
  else {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— 请选择 —";
    sel.appendChild(opt);
  }

  const used = new Set();
  for (const g of COUNTRY_GROUPS) {
    const og = document.createElement("optgroup");
    og.label = g.group;
    const sortedItems = [...g.items].sort((a, b) => {
      const ca = String(a[0] || "").toUpperCase();
      const cb = String(b[0] || "").toUpperCase();
      if (ca < cb) return -1;
      if (ca > cb) return 1;
      return 0;
    });
    for (const [code, name] of sortedItems) {
      if (!code || used.has(code)) continue;
      used.add(code);
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = `${name} (${code})`;
      og.appendChild(opt);
    }
    sel.appendChild(og);
  }
}

function countryToRegion(code) {
  if (!code) return "";
  for (const g of COUNTRY_GROUPS) {
    if (g.group === "其他") continue;
    if (g.items.some(([c]) => c === code)) return g.group;
  }
  return "";
}

function initTimezoneDatalist() {
  const dl = document.getElementById("tzlist");
  if (!dl) return;
  dl.innerHTML = "";
  // Chrome/Edge 支持：Intl.supportedValuesOf('timeZone')
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  for (const tz of supported) {
    const opt = document.createElement("option");
    opt.value = tz;
    dl.appendChild(opt);
  }
}

function trySetTimezoneFromCountry() {
  const code = (q("country_code").value || "").trim();
  if (!code) return;

  // 自动填地区标签
  const region = countryToRegion(code);
  if (region) q("region").value = region;

  const tz = COUNTRY_DEFAULT_TZ[code];
  if (!tz) {
    setMsg("该国家可能有多个时区：请在“时区”里从下拉列表选择一个。", "error");
    return;
  }

  q("timezone").value = tz;
  // 验证 tz 是否被当前浏览器支持
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    setMsg("已按国家自动填写时区（可手动修改）。", "ok");
  } catch {
    setMsg("已填写默认时区，但浏览器不支持该时区：请手动选择。", "error");
  }
}

function timeToSec(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 3600 + m * 60;
}
const WORK_START_SEC = timeToSec(WORK_START);
const WORK_END_SEC = timeToSec(WORK_END);

function getLocalParts(timezone, now = new Date()) {
  const fmtTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const fmtWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const fmtDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const timeStr = fmtTime.format(now);
  const weekday = fmtWeekday.format(now);
  const dateStr = fmtDate.format(now);

  const [h, m, s] = timeStr.split(":").map(Number);
  const sec = h * 3600 + m * 60 + (s || 0);

  return { sec, weekday, dateStr };
}

function isWorkingNow(timezone, now = new Date()) {
  const { sec, weekday } = getLocalParts(timezone, now);
  return WORK_DAYS.has(weekday) && sec >= WORK_START_SEC && sec < WORK_END_SEC;
}

function remindedKey(companyId, localDateStr) {
  return `worktime-reminded:${companyId}:${localDateStr}`;
}

async function enableNotifications() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}

function notify(company) {
  // 已按需求关闭“客户上班时间”通知
  void company;
}

function notifyFollowUp(company, dueAt) {
  const dueText = dueAt ? new Date(dueAt).toLocaleString() : "现在";
  const body = `${company.name} 需要跟进（阶段：${company.follow_up_stage || "未设置"}，到期：${dueText}）`;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("客户跟进提醒", { body });
  } else {
    alert(body);
  }
}

let companies = [];
let reminderTimer = null;
const prevWorking = new Map();
let listViewMode = "detailed";
const expandedRegions = new Set();
let currentDetailId = null;

function loadDailySettings() {
  try {
    const raw = localStorage.getItem(DAILY_SETTINGS_KEY);
    if (!raw) return { ownerName: "", dailyTarget: 5 };
    const data = JSON.parse(raw);
    return {
      ownerName: String(data.ownerName || ""),
      dailyTarget: Math.max(1, Number(data.dailyTarget || 5)),
    };
  } catch {
    return { ownerName: "", dailyTarget: 5 };
  }
}

function saveDailySettings() {
  const ownerName = q("ownerName").value.trim();
  const dailyTarget = Math.max(1, Number(q("dailyTarget").value || 5));
  localStorage.setItem(DAILY_SETTINGS_KEY, JSON.stringify({ ownerName, dailyTarget }));
  setMsg("已保存每日新增目标设置。", "ok");
  renderList();
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


function renderEmptyDetail() {
  const panel = q("detailPanel");
  const layout = q("listDetailLayout");
  panel.style.display = "none";
  layout.classList.remove("detail-open");
}

function startReminderLoop(intervalMs = 60000) {
  if (reminderTimer) clearInterval(reminderTimer);
  const tick = () => {
    const now = new Date();
    for (const c of companies) {
      let parts;
      try {
        parts = getLocalParts(c.timezone, now);
      } catch {
        // 时区不合法时不提醒也不点亮
        prevWorking.set(c.id, false);
        continue;
      }
      const working = WORK_DAYS.has(parts.weekday) && parts.sec >= WORK_START_SEC && parts.sec < WORK_END_SEC;
      const was = prevWorking.get(c.id) ?? false;

      if (!was && working) {
        const k = remindedKey(c.id, parts.dateStr);
        if (!localStorage.getItem(k)) {
          localStorage.setItem(k, "1");
          notify(c);
        }
      }
      if (c.next_follow_up_at) {
        const dueMs = new Date(c.next_follow_up_at).getTime();
        if (!Number.isNaN(dueMs) && dueMs <= now.getTime()) {
          const followKey = `followup-reminded:${c.id}:${new Date(c.next_follow_up_at).toISOString()}`;
          if (!localStorage.getItem(followKey)) {
            localStorage.setItem(followKey, "1");
            notifyFollowUp(c, c.next_follow_up_at);
          }
        }
      }
      prevWorking.set(c.id, working);
    }
    renderList();
  };

  tick();
  reminderTimer = setInterval(tick, intervalMs);
}

function q(id) {
  return document.getElementById(id);
}

function setMsg(text, type = "") {
  const el = q("formMsg");
  el.textContent = text || "";
  el.className = `msg ${type}`.trim();
}

function toDatetimeLocalValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(v) {
  if (!v) return null;
  const d = new Date(v);
  return d.toISOString();
}

function computeNextFollowUpISO(stage, fromDate = new Date()) {
  const days = FOLLOW_UP_STAGE_DAYS[stage];
  if (days === null || days === undefined) return null;
  const d = new Date(fromDate);
  let left = days;
  // 按“工作日”递增：跳过周末 + 节假日
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (isBusinessDay(d)) left -= 1;
  }
  // 若落在非工作日（比如手动触发场景），顺延到下一个工作日
  while (!isBusinessDay(d)) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function isBusinessDay(d) {
  const day = d.getDay(); // 0 Sun, 6 Sat
  if (day === 0 || day === 6) return false;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return !HOLIDAYS_MMDD.has(`${mm}-${dd}`);
}

/** 离线模式：历史客户补全跟进阶段与下次跟进时间（与后端启动迁移一致） */
function migrateLocalFollowUpDefaults() {
  const rows = localLoadCompanies();
  const validStages = new Set(Object.keys(FOLLOW_UP_STAGE_DAYS));
  const now = new Date();
  let changed = false;
  const out = rows.map((r) => {
    let stage = r.follow_up_stage;
    if (!stage || !String(stage).trim() || !validStages.has(stage)) {
      stage = "新线索";
    }
    let next = r.next_follow_up_at;
    if (stage === "暂停") {
      if (next != null && next !== "") {
        next = null;
      }
    } else if (!next) {
      next = computeNextFollowUpISO(stage, now);
    }
    const nextWas = r.next_follow_up_at;
    const same = stage === r.follow_up_stage && (next || null) === (nextWas || null);
    if (same) return r;
    changed = true;
    return {
      ...r,
      follow_up_stage: stage,
      next_follow_up_at: next,
      updated_at: new Date().toISOString(),
    };
  });
  if (changed) {
    localSaveCompanies(out);
  }
  return changed;
}

function askFollowUpChannel(defaultChannel = "") {
  const hint = `输入渠道编号：
1 领英私信
2 WhatsApp
3 邮件
4 电话
5 其他`;
  const map = { "1": "领英私信", "2": "WhatsApp", "3": "邮件", "4": "电话", "5": "其他" };
  const seed = defaultChannel
    ? Object.entries(map).find(([, v]) => v === defaultChannel)?.[0] || ""
    : "";
  const input = prompt(hint, seed);
  if (input === null) return null;
  const key = String(input).trim();
  return map[key] || defaultChannel || "其他";
}

function parseLastWonText(raw) {
  const text = (raw || "").trim();
  const out = { time: null, product: "", qty: "", unit_price: "", supplier: "" };
  if (!text) return out;

  // 1) 尝试解析时间（多种常见格式）
  const candidates = [
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
    /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/,
  ];
  for (const re of candidates) {
    const m = text.match(re);
    if (!m) continue;
    let y, mo, d, hh = 0, mm = 0, ss = 0;
    if (re === candidates[2]) {
      // MM/DD/YYYY
      mo = Number(m[1]); d = Number(m[2]); y = Number(m[3]);
    } else {
      y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
      if (m[4]) hh = Number(m[4]);
      if (m[5]) mm = Number(m[5]);
      if (m[6]) ss = Number(m[6]);
    }
    const dt = new Date(y, mo - 1, d, hh, mm, ss);
    if (!Number.isNaN(dt.getTime())) {
      out.time = dt;
      break;
    }
  }

  // 2) key:value/关键词提取（中英混合）
  const grab = (labelRe) => {
    const m = text.match(new RegExp(`${labelRe}\\s*[:：]?\\s*([^\\n，,;；]+)`, "i"));
    return m ? m[1].trim() : "";
  };
  out.supplier = grab("(供应商|supplier|vendor)");
  // 海关编码（HS code）：常见为 6-10 位数字
  const hsM =
    text.match(/\bHS\s*[:：]?\s*([0-9]{6,10})\b/i) ||
    text.match(/(海关编码|HS\s*CODE|HSCODE)\s*[:：]?\s*([0-9]{6,10})/i) ||
    text.match(/\b([0-9]{8,10})\b/);
  if (hsM) out.product = (hsM[1] || hsM[2] || "").trim();

  // 3) 数量：找 “数量/qty/吨/MT/kg”等
  const qtyM =
    text.match(/(数量|qty)\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z]{1,6}|吨|千克|公斤|克|MT|KG|kg|t)\b/i) ||
    text.match(/([0-9]+(?:\.[0-9]+)?)\s*(MT|KG|kg|吨|千克|公斤|克|t)\b/);
  if (qtyM) {
    const num = Number(qtyM[2] || qtyM[1]);
    const unit = String(qtyM[3] || qtyM[2] || "").toLowerCase();
    if (!Number.isNaN(num) && unit) {
      let ton = null;
      if (unit === "mt" || unit === "吨" || unit === "t") ton = num;
      if (unit === "kg" || unit === "公斤" || unit === "千克") ton = num / 1000;
      if (unit === "克") ton = num / 1_000_000;
      if (ton !== null) {
        const v = Math.round(ton * 1000) / 1000; // 3 位小数够用了
        out.qty = `${v}吨`;
      }
    }
  }

  // 4) 单价：找 “单价/price/US D/¥/$/CNY”等
  const priceM =
    text.match(/(单价|unit\s*price|price)\s*[:：]?\s*([^\n，,;；]+)/i) ||
    text.match(/([￥¥$]\s*[0-9]+(?:\.[0-9]+)?\s*(?:\/\s*[a-zA-Z]+|\/\s*吨|\/\s*MT|\/\s*kg)?)|([0-9]+(?:\.[0-9]+)?\s*(USD|CNY|RMB|EUR)\s*\/?\s*(MT|吨|kg)?)/i);
  if (priceM) {
    const rawPrice = String((priceM[2] || priceM[1] || priceM[0] || "")).trim();

    // 提取数值
    const numM = rawPrice.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
    const num = numM ? Number(numM[1]) : NaN;

    // 提取币种
    const cur =
      (rawPrice.match(/\bUSD\b/i) && "USD") ||
      (rawPrice.match(/\bEUR\b/i) && "EUR") ||
      (rawPrice.match(/\bCNY\b/i) && "CNY") ||
      (rawPrice.match(/\bRMB\b/i) && "CNY") ||
      (rawPrice.includes("$") && "USD") ||
      ((rawPrice.includes("¥") || rawPrice.includes("￥")) && "CNY") ||
      "";

    // 单位：/kg 或 /吨 或 /MT
    const perKg = /\/\s*kg\b/i.test(rawPrice) || /每\s*千克|每\s*公斤|\/\s*(千克|公斤)/.test(rawPrice);
    const perTon = /\/\s*(吨|mt|t)\b/i.test(rawPrice) || /每\s*吨/.test(rawPrice);

    if (!Number.isNaN(num) && perKg) {
      const perTonNum = Math.round(num * 1000 * 100) / 100; // 单价保留 2 位
      out.unit_price = `${perTonNum} ${cur || ""}/吨`.replace(/\s+/g, " ").trim();
    } else if (!Number.isNaN(num) && perTon) {
      out.unit_price = `${num} ${cur || ""}/吨`.replace(/\s+/g, " ").trim();
    } else {
      // 无法判断单位时保留原文
      out.unit_price = rawPrice;
    }
  }

  // 5) 供应商兜底（“from/供应/供货”）
  if (!out.supplier) {
    const m = text.match(/(from|供货|供应)\s*[:：]?\s*([^。\n，,;；]+)/i);
    if (m) out.supplier = m[2].trim();
  }

  return out;
}

function applyLastWonParsed(parsed) {
  if (parsed.time) q("last_won_time").value = toDatetimeLocalValue(parsed.time.toISOString());
  if (parsed.supplier && !q("last_won_supplier").value) q("last_won_supplier").value = parsed.supplier;
  if (parsed.product && !q("last_won_product").value) q("last_won_product").value = parsed.product;
  if (parsed.qty && !q("last_won_qty").value) q("last_won_qty").value = parsed.qty;
  if (parsed.unit_price && !q("last_won_unit_price").value) q("last_won_unit_price").value = parsed.unit_price;
}

function renderList() {
  const el = q("list");
  if (!companies.length) {
    el.innerHTML = `<div class="meta">暂无数据</div>`;
    q("statTotal").textContent = "0";
    q("statOverdue").textContent = "0";
    q("statToday").textContent = "0";
    q("statScheduled").textContent = "0";
    q("statTodayNew").textContent = "0";
    q("statGoalLeft").textContent = "0";
    q("dailyGoalHint").textContent = "";
    return;
  }

  const regionFilter = (q("regionFilter")?.value || "").trim();
  const followStatusFilter = (q("followStatusFilter")?.value || "").trim();
  const keyword = (q("search")?.value || "").trim().toLowerCase();

  const now = new Date();
  const workingMap = new Map();
  for (const c of companies) {
    let working = false;
    try {
      working = isWorkingNow(c.timezone, now);
    } catch {
      working = false;
    }
    workingMap.set(c.id, working);
  }
  const followStatusOf = (c) => {
    if (!c.next_follow_up_at) return "none";
    const dueMs = new Date(c.next_follow_up_at).getTime();
    if (Number.isNaN(dueMs)) return "none";
    const nowMs = now.getTime();
    if (dueMs <= nowMs) return "overdue";
    const due = new Date(c.next_follow_up_at);
    const sameDay =
      due.getFullYear() === now.getFullYear() &&
      due.getMonth() === now.getMonth() &&
      due.getDate() === now.getDate();
    if (sameDay) return "today";
    return "scheduled";
  };
  const filtered = companies.filter((c) => {
    const effectiveRegion = (c.region || countryToRegion(c.country_code || "") || "").trim();
    if (regionFilter && effectiveRegion !== regionFilter) return false;
    if (followStatusFilter && followStatusOf(c) !== followStatusFilter) return false;
    if (!keyword) return true;
    const hay = `${c.name || ""} ${c.email || ""} ${c.whatsapp || ""}`.toLowerCase();
    return hay.includes(keyword);
  });

  const allStats = companies.reduce(
    (acc, c) => {
      acc.total += 1;
      const s = followStatusOf(c);
      if (s === "overdue") acc.overdue += 1;
      else if (s === "today") acc.today += 1;
      else if (s === "scheduled") acc.scheduled += 1;
      return acc;
    },
    { total: 0, overdue: 0, today: 0, scheduled: 0 }
  );
  q("statTotal").textContent = String(allStats.total);
  q("statOverdue").textContent = String(allStats.overdue);
  q("statToday").textContent = String(allStats.today);
  q("statScheduled").textContent = String(allStats.scheduled);
  const ds = loadDailySettings();
  const today = new Date();
  const isSameDay = (d) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const todayNew = companies.filter((c) => {
    if (!c.created_at) return false;
    const d = new Date(c.created_at);
    return !Number.isNaN(d.getTime()) && isSameDay(d);
  }).length;
  const goalLeft = Math.max(0, ds.dailyTarget - todayNew);
  q("statTodayNew").textContent = String(todayNew);
  q("statGoalLeft").textContent = String(goalLeft);
  q("dailyGoalHint").textContent = `${ds.ownerName || "你"} 今日新增目标：${ds.dailyTarget}，当前已完成 ${todayNew}`;

  // 每天提醒一次：还没完成每日新增目标
  if (goalLeft > 0) {
    const dayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    const remindKey = `daily-new-reminded:${dayKey}`;
    if (!localStorage.getItem(remindKey)) {
      localStorage.setItem(remindKey, "1");
      const body = `${ds.ownerName || "你"}今天还差 ${goalLeft} 个新客户（目标 ${ds.dailyTarget}）`;
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("每日新增客户目标提醒", { body });
      }
    }
  }

  const renderRow = (c) => {
      let working = false;
      let dateStr = "";
      let timeStr = "";
      try {
        const parts = getLocalParts(c.timezone, now);
        working = workingMap.get(c.id) || false;
        dateStr = parts.dateStr;
        const h = String(Math.floor(parts.sec / 3600)).padStart(2, "0");
        const m = String(Math.floor((parts.sec % 3600) / 60)).padStart(2, "0");
        timeStr = `${h}:${m}`;
      } catch {
        working = false;
      }

      const dotClass = working ? "dot good" : "dot";
      const waLink = c.whatsapp ? whatsappToLink(c.whatsapp) : "";
      const links = [
        c.website_url ? `<a class="link" href="${c.website_url}" target="_blank" rel="noreferrer">官网</a>` : "",
        c.linkedin_url ? `<a class="link" href="${c.linkedin_url}" target="_blank" rel="noreferrer">LinkedIn</a>` : "",
        waLink ? `<a class="link" href="${waLink}" target="_blank" rel="noreferrer">WhatsApp</a>` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const linkedinTop = c.linkedin_url
        ? `<a class="link" href="${c.linkedin_url}" target="_blank" rel="noreferrer">LinkedIn</a>`
        : "—";

      const lastWonTime = c.last_won_time ? new Date(c.last_won_time).toLocaleString() : "—";
      const lastWonLine = [
        c.last_won_product ? `品种：${escapeHtml(c.last_won_product)}` : "",
        c.last_won_qty ? `数量：${escapeHtml(c.last_won_qty)}` : "",
        c.last_won_unit_price ? `单价：${escapeHtml(c.last_won_unit_price)}` : "",
        c.last_won_supplier ? `供应商：${escapeHtml(c.last_won_supplier)}` : "",
      ].filter(Boolean).join(" · ");

      const effectiveRegion = c.region || countryToRegion(c.country_code || "") || "";
      const regionChip = effectiveRegion ? `<span class="chip">${escapeHtml(effectiveRegion)}</span>` : "";
      const stageChip = c.follow_up_stage ? `<span class="chip">${escapeHtml(c.follow_up_stage)}</span>` : `<span class="chip">未设跟进</span>`;
      let followStatus = "未设置";
      let followStatusClass = "chip";
      if (c.next_follow_up_at) {
        const due = new Date(c.next_follow_up_at);
        const dueMs = due.getTime();
        const nowMs = now.getTime();
        if (!Number.isNaN(dueMs)) {
          if (dueMs <= nowMs) {
            followStatus = "逾期待跟进";
            followStatusClass = "chip chip-danger";
          } else if (
            due.getFullYear() === now.getFullYear() &&
            due.getMonth() === now.getMonth() &&
            due.getDate() === now.getDate()
          ) {
            followStatus = "今日待跟进";
            followStatusClass = "chip chip-warn";
          } else {
            followStatus = "已排期";
          }
        }
      }
      const hasLastWon = Boolean(c.last_won_time || c.last_won_product || c.last_won_qty || c.last_won_unit_price || c.last_won_supplier || c.last_won_raw);
      const followUpHistoryText = (c.follow_up_history || "").trim();
      const followUpPreview = followUpHistoryText || c.last_follow_up_note || "—";
      return `
        <div class="row">
          <div class="${dotClass}" title="${working ? "上班中" : "非上班时间"}"></div>
          <div>
            <div class="name"><button class="name-btn" data-open-detail="${c.id}">${escapeHtml(c.name)}</button> ${regionChip} ${stageChip}</div>
            <div class="meta">领英：${linkedinTop}</div>
            <div class="meta">${escapeHtml(c.timezone)} · ${escapeHtml(c.country_code || "—")} · 本地时间 ${escapeHtml(timeStr || "—")}（${escapeHtml(dateStr || "—")}）</div>
            <div class="meta">其他链接：${links || "—"}</div>
            <div class="meta">下次跟进：${c.next_follow_up_at ? escapeHtml(new Date(c.next_follow_up_at).toLocaleString()) : "—"} · 最近跟进：${c.last_follow_up_at ? escapeHtml(new Date(c.last_follow_up_at).toLocaleString()) : "—"} · <span class="${followStatusClass}">${followStatus}</span></div>
            <details class="mini-details">
              <summary>跟进记录（${escapeHtml(c.last_follow_up_channel || "—")}）</summary>
              <div class="mini-details-body">
                <div class="detail-value">${escapeHtml(followUpPreview)}</div>
              </div>
            </details>
          </div>
          <div class="meta">
            <details class="mini-details">
              <summary>最近成交：${hasLastWon ? "有" : "—"}</summary>
              <div class="mini-details-body">
                <div>时间：${escapeHtml(lastWonTime)}</div>
                <div>${lastWonLine || "—"}</div>
              </div>
            </details>
          </div>
          <div class="actions">
            <button class="btn" data-follow="${c.id}">已跟进</button>
            <button class="btn btn-secondary" data-edit="${c.id}">编辑</button>
            <button class="btn btn-secondary" data-del="${c.id}">删除</button>
          </div>
        </div>
      `;
  };

  const grouped = new Map();
  for (const name of REGION_ORDER) grouped.set(name, []);
  grouped.set("未分类", []);
  for (const c of filtered) {
    const region = (c.region || countryToRegion(c.country_code || "") || "").trim();
    if (grouped.has(region)) grouped.get(region).push(c);
    else grouped.get("未分类").push(c);
  }

  let html = "";
  if (regionFilter) {
    const arr = grouped.get(regionFilter) || [];
    html = arr.length
      ? arr.map((c) => renderRow(c)).join("")
      : `<div class="meta">该地区暂无客户</div>`;
  } else {
    for (const name of [...REGION_ORDER, "未分类"]) {
      const arr = grouped.get(name) || [];
      if (!arr.length) continue;
      const anyWorking = arr.some((c) => workingMap.get(c.id));
      const open = expandedRegions.has(name);
      html += `
        <div class="region-group">
          <button class="region-toggle" data-region-toggle="${escapeHtml(name)}">
            <span class="dot ${anyWorking ? "good" : ""}"></span>
            <span>${escapeHtml(name)}（${arr.length}）</span>
            <span>${open ? "收起" : "展开"}</span>
          </button>
          <div class="region-body" style="display:${open ? "grid" : "none"};">
            ${arr.map((c) => renderRow(c)).join("")}
          </div>
        </div>
      `;
    }
    if (!html) html = `<div class="meta">暂无匹配客户</div>`;
  }

  el.innerHTML = html;
  el.classList.toggle("compact", listViewMode === "compact");

  el.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-edit"));
      const c = companies.find((x) => x.id === id);
      if (!c) return;
      q("id").value = String(c.id);
      q("name").value = c.name || "";
      q("timezone").value = c.timezone || "";
      q("country_code").value = c.country_code || "";
      q("region").value = c.region || "";
      q("linkedin_url").value = c.linkedin_url || "";
      q("website_url").value = c.website_url || "";
      q("email").value = c.email || "";
      q("whatsapp").value = c.whatsapp || "";
      q("follow_up_stage").value = c.follow_up_stage || "新线索";
      q("next_follow_up_at").value = toDatetimeLocalValue(c.next_follow_up_at);
      q("last_follow_up_at").value = toDatetimeLocalValue(c.last_follow_up_at);
      q("last_follow_up_channel").value = c.last_follow_up_channel || "";
      q("last_follow_up_note").value = c.last_follow_up_note || "";
      q("last_won_raw").value = c.last_won_raw || "";
      q("last_won_time").value = toDatetimeLocalValue(c.last_won_time);
      q("last_won_product").value = c.last_won_product || "";
      q("last_won_qty").value = c.last_won_qty || "";
      q("last_won_unit_price").value = c.last_won_unit_price || "";
      q("last_won_supplier").value = c.last_won_supplier || "";
      currentDetailId = null;
      renderEmptyDetail();
      setMsg("已载入可编辑。", "ok");
      const editPanel = q("editPanel");
      editPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      editPanel.classList.add("panel-focus");
      setTimeout(() => editPanel.classList.remove("panel-focus"), 1400);
    });
  });

  el.querySelectorAll("[data-open-detail]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-open-detail"));
      const c = companies.find((x) => x.id === id);
      if (!c) return;
      currentDetailId = id;
      renderDetail(c);
    });
  });

  el.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-del"));
      const c = companies.find((x) => x.id === id);
      if (!c) return;
      if (!confirm(`确认删除：${c.name}？`)) return;
      await apiDelete(`/api/companies/${id}`);
      await refresh();
    });
  });

  el.querySelectorAll("[data-follow]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-follow"));
      const c = companies.find((x) => x.id === id);
      if (!c) return;
      const nextStage = stageAfterFollowUpRecord(c.follow_up_stage);
      const channel = askFollowUpChannel(c.last_follow_up_channel || "");
      if (channel === null) return;
      const note = prompt("请输入本次跟进备注（可空）：", c.last_follow_up_note || "");
      if (note === null) return;
      const nowIso = new Date().toISOString();
      const nextIso = computeNextFollowUpISO(nextStage, new Date());
      try {
        await apiPut(`/api/companies/${id}`, {
          ...c,
          follow_up_stage: nextStage,
          last_follow_up_at: nowIso,
          last_follow_up_channel: channel,
          last_follow_up_note: String(note || "").trim() || null,
          next_follow_up_at: nextIso,
        });
        setMsg(`已记录跟进：${c.name}，阶段已设为「${nextStage}」，并自动排期下一次。`, "ok");
        await refresh();
      } catch (e) {
        setMsg(`记录跟进失败：${String(e?.message || e)}`, "error");
      }
    });
  });

  el.querySelectorAll("[data-region-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const region = btn.getAttribute("data-region-toggle");
      if (!region) return;
      if (expandedRegions.has(region)) expandedRegions.delete(region);
      else expandedRegions.add(region);
      renderList();
    });
  });

  // 保持右侧详情和当前选中客户同步
  if (currentDetailId) {
    const selected = companies.find((x) => x.id === currentDetailId);
    if (selected) renderDetail(selected);
    else {
      currentDetailId = null;
      renderEmptyDetail();
    }
  } else {
    renderEmptyDetail();
  }
}

function renderDetail(c) {
  const panel = q("detailPanel");
  const layout = q("listDetailLayout");
  panel.style.display = "block";
  layout.classList.add("detail-open");
  const detail = q("detailContent");
  const linkList = [
    c.linkedin_url ? `<a class="link" href="${c.linkedin_url}" target="_blank" rel="noreferrer">LinkedIn</a>` : "",
    c.website_url ? `<a class="link" href="${c.website_url}" target="_blank" rel="noreferrer">官网</a>` : "",
    c.whatsapp ? `<a class="link" href="${whatsappToLink(c.whatsapp)}" target="_blank" rel="noreferrer">WhatsApp</a>` : "",
  ].filter(Boolean).join(" · ");
  detail.innerHTML = `
    <div class="detail-item"><div class="detail-label">公司</div><div class="detail-value">${escapeHtml(c.name || "—")}</div></div>
    <div class="detail-item"><div class="detail-label">地区 / 国家</div><div class="detail-value">${escapeHtml(c.region || countryToRegion(c.country_code || "") || "—")} / ${escapeHtml(c.country_code || "—")}</div></div>
    <div class="detail-item"><div class="detail-label">时区</div><div class="detail-value">${escapeHtml(c.timezone || "—")}</div></div>
    <div class="detail-item"><div class="detail-label">链接</div><div class="detail-value">${linkList || "—"}</div></div>
    <div class="detail-item"><div class="detail-label">跟进阶段</div><div class="detail-value">${escapeHtml(c.follow_up_stage || "—")}</div></div>
    <div class="detail-item"><div class="detail-label">下次跟进</div><div class="detail-value">${c.next_follow_up_at ? escapeHtml(new Date(c.next_follow_up_at).toLocaleString()) : "—"}</div></div>
    <div class="detail-item"><div class="detail-label">最近跟进渠道</div><div class="detail-value">${escapeHtml(c.last_follow_up_channel || "—")}</div></div>
    <div class="detail-item"><div class="detail-label">最近跟进备注</div><div class="detail-value">${escapeHtml(c.last_follow_up_note || "—")}</div></div>
    <div class="detail-item"><div class="detail-label">跟进历史</div><div class="detail-value">${escapeHtml((c.follow_up_history || "").trim() || "—").replace(/\n/g, "<br>")}</div></div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function whatsappToLink(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  const digits = v.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}`;
}

async function apiGet(path) {
  if (USE_LOCAL_MODE) {
    if (path === "/api/companies") return localListCompanies();
    throw new Error(`本地模式不支持 GET ${path}`);
  }
  const res = await fetch(path, { headers: HEADERS });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPost(path, body) {
  if (USE_LOCAL_MODE) {
    if (path === "/api/companies") return localCreateCompany(body);
    throw new Error(`本地模式不支持 POST ${path}`);
  }
  const res = await fetch(path, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiPut(path, body) {
  if (USE_LOCAL_MODE) {
    const m = String(path).match(/^\/api\/companies\/(\d+)$/);
    if (!m) throw new Error(`本地模式不支持 PUT ${path}`);
    return localUpdateCompany(Number(m[1]), body);
  }
  const res = await fetch(path, { method: "PUT", headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
async function apiDelete(path) {
  if (USE_LOCAL_MODE) {
    const m = String(path).match(/^\/api\/companies\/(\d+)$/);
    if (!m) throw new Error(`本地模式不支持 DELETE ${path}`);
    return localDeleteCompany(Number(m[1]));
  }
  const res = await fetch(path, { method: "DELETE", headers: HEADERS });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function localLoadCompanies() {
  try {
    const raw = localStorage.getItem(LOCAL_DATA_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function localSaveCompanies(rows) {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(rows));
}

function localListCompanies() {
  const rows = localLoadCompanies();
  rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return rows;
}

function localCreateCompany(payload) {
  const rows = localLoadCompanies();
  const name = String(payload.name || "").trim();
  if (rows.some((r) => String(r.name || "").trim() === name)) {
    throw new Error("Company name already exists");
  }
  const now = new Date().toISOString();
  const nextId = rows.length ? Math.max(...rows.map((x) => Number(x.id) || 0)) + 1 : 1;
  const row = { ...payload, id: nextId, created_at: now, updated_at: now };
  rows.push(row);
  localSaveCompanies(rows);
  return row;
}

function localUpdateCompany(id, payload) {
  const rows = localLoadCompanies();
  const idx = rows.findIndex((x) => Number(x.id) === Number(id));
  if (idx < 0) throw new Error("Not found");
  const exists = rows.find((x) => Number(x.id) !== Number(id) && String(x.name || "").trim() === String(payload.name || "").trim());
  if (exists) throw new Error("Company name already exists");
  const old = rows[idx];
  const row = {
    ...old,
    ...payload,
    id: Number(id),
    created_at: old.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const oldFollow = `${old.last_follow_up_at || ""}|${old.last_follow_up_channel || ""}|${old.last_follow_up_note || ""}`;
  const newFollow = `${row.last_follow_up_at || ""}|${row.last_follow_up_channel || ""}|${row.last_follow_up_note || ""}`;
  if (oldFollow !== newFollow && row.last_follow_up_at) {
    const dt = new Date(row.last_follow_up_at);
    const pad = (n) => String(n).padStart(2, "0");
    const followTime = Number.isNaN(dt.getTime())
      ? String(row.last_follow_up_at)
      : `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
    const followChannel = row.last_follow_up_channel || "未填写渠道";
    const followNote = row.last_follow_up_note || "（无备注）";
    const line = `[${followTime}] ${followChannel} | ${followNote}`;
    row.follow_up_history = row.follow_up_history ? `${row.follow_up_history}\n${line}` : line;
  }

  rows[idx] = row;
  localSaveCompanies(rows);
  return row;
}

function localDeleteCompany(id) {
  const rows = localLoadCompanies();
  const idx = rows.findIndex((x) => Number(x.id) === Number(id));
  if (idx < 0) throw new Error("Not found");
  rows.splice(idx, 1);
  localSaveCompanies(rows);
  return { ok: true };
}

async function tryAutoSeedFromHostedJSON() {
  const alreadySeeded = localStorage.getItem(AUTO_SEED_FLAG_KEY) === "1";
  if (alreadySeeded && localListCompanies().length > 0) return false;
  if (localListCompanies().length > 0) {
    localStorage.setItem(AUTO_SEED_FLAG_KEY, "1");
    return false;
  }
  try {
    const res = await fetch("./crm-recovered-data.json?v=20260331b");
    if (!res.ok) return false;
    const data = await res.json();
    const rows = Array.isArray(data) ? data : data?.rows;
    const normalized = normalizeImportedRows(rows);
    if (!normalized.length) return false;
    localSaveCompanies(normalized);
    localStorage.setItem(AUTO_SEED_FLAG_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

function normalizeImportedRows(rows) {
  if (!Array.isArray(rows)) return [];
  const now = new Date().toISOString();
  const out = [];
  let nextId = 1;
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = { ...item };
    row.id = Number(row.id) > 0 ? Number(row.id) : nextId;
    row.created_at = row.created_at || now;
    row.updated_at = now;
    if (!row.name || !row.timezone) continue;
    out.push(row);
    nextId = Math.max(nextId, row.id + 1);
  }
  return out;
}

function exportLocalData() {
  const rows = localListCompanies();
  const payload = {
    exported_at: new Date().toISOString(),
    version: 1,
    rows,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crm-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setMsg(`导出完成，共 ${rows.length} 条客户。`, "ok");
}

async function importLocalDataFromFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式不正确");
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  const normalized = normalizeImportedRows(rows);
  if (!normalized.length) throw new Error("文件中没有可导入的数据");
  localSaveCompanies(normalized);
  migrateLocalFollowUpDefaults();
  companies = localListCompanies();
  renderList();
  setMsg(`导入完成，共 ${normalized.length} 条客户。`, "ok");
}

async function refresh() {
  try {
    companies = await apiGet("/api/companies");
    if (USE_LOCAL_MODE) setMsg("当前为离线 HTML 模式：数据保存在本机浏览器。", "ok");
    else setMsg("");
    renderList();
    startReminderLoop(60000);
  } catch (e) {
    // 无法连接后端时，自动切换离线 HTML 模式，方便在其他电脑直接使用
    USE_LOCAL_MODE = true;
    const seeded = await tryAutoSeedFromHostedJSON();
    migrateLocalFollowUpDefaults();
    companies = localListCompanies();
    if (seeded) setMsg("已自动导入历史数据，并切换为离线 HTML 模式。", "ok");
    else setMsg("未连接到后端，已自动切换为离线 HTML 模式。", "ok");
    renderList();
    startReminderLoop(60000);
  }
}

q("btnEnableNotif").addEventListener("click", async () => {
  const ok = await enableNotifications();
  setMsg(ok ? "系统通知已开启（或已授权）。" : "系统通知未授权，将使用弹窗提醒。", ok ? "ok" : "error");
});
q("btnRefresh").addEventListener("click", refresh);
q("btnExportData").addEventListener("click", exportLocalData);
q("btnImportData").addEventListener("click", () => q("importDataFile").click());
q("importDataFile").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  ev.target.value = "";
  if (!file) return;
  try {
    USE_LOCAL_MODE = true;
    await importLocalDataFromFile(file);
  } catch (e) {
    setMsg(`导入失败：${String(e?.message || e)}`, "error");
  }
});
q("btnReset").addEventListener("click", () => {
  q("companyForm").reset();
  q("id").value = "";
  q("follow_up_stage").value = "新线索";
  q("last_follow_up_channel").value = "";
  q("last_follow_up_note").value = "";
  setMsg("");
});

q("last_won_raw").addEventListener("input", () => {
  // 每次输入都解析一次，但不覆盖你已手动填写的解析字段
  const parsed = parseLastWonText(q("last_won_raw").value);
  applyLastWonParsed(parsed);
});

q("companyForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = q("id").value ? Number(q("id").value) : null;
  const payload = {
    name: q("name").value.trim(),
    timezone: q("timezone").value.trim(),
    country_code: (q("country_code").value || "").trim() || null,
    region: (q("region").value || "").trim() || null,
    linkedin_url: q("linkedin_url").value.trim() || null,
    website_url: q("website_url").value.trim() || null,
    email: q("email").value.trim() || null,
    whatsapp: q("whatsapp").value.trim() || null,
    follow_up_stage: (q("follow_up_stage").value || "").trim() || null,
    next_follow_up_at: fromDatetimeLocalValue(q("next_follow_up_at").value),
    last_follow_up_at: fromDatetimeLocalValue(q("last_follow_up_at").value),
    last_follow_up_channel: (q("last_follow_up_channel").value || "").trim() || null,
    last_follow_up_note: q("last_follow_up_note").value.trim() || null,
    last_won_raw: q("last_won_raw").value.trim() || null,
    last_won_time: fromDatetimeLocalValue(q("last_won_time").value),
    last_won_product: q("last_won_product").value.trim() || null,
    last_won_qty: q("last_won_qty").value.trim() || null,
    last_won_unit_price: q("last_won_unit_price").value.trim() || null,
    last_won_supplier: q("last_won_supplier").value.trim() || null,
  };

  if (!payload.name || !payload.timezone) {
    setMsg("公司名字与时区必填。", "error");
    return;
  }

  if (!payload.next_follow_up_at && payload.follow_up_stage && payload.follow_up_stage !== "暂停") {
    payload.next_follow_up_at = computeNextFollowUpISO(payload.follow_up_stage, new Date());
  }

  try {
    if (id) {
      await apiPut(`/api/companies/${id}`, payload);
      setMsg("已更新。", "ok");
    } else {
      await apiPost("/api/companies", payload);
      setMsg("已创建。", "ok");
    }
    q("companyForm").reset();
    q("id").value = "";
    await refresh();
  } catch (e) {
    const msg = String(e?.message || e);
    setMsg(`保存失败：${msg}`, "error");
    console.error(e);
  }
});

initCountrySelect();
initTimezoneDatalist();
q("country_code").addEventListener("change", trySetTimezoneFromCountry);
q("follow_up_stage").addEventListener("change", () => {
  const stage = q("follow_up_stage").value;
  if (!q("next_follow_up_at").value && stage && stage !== "暂停") {
    const nextIso = computeNextFollowUpISO(stage, new Date());
    q("next_follow_up_at").value = toDatetimeLocalValue(nextIso);
  }
});
q("regionFilter").addEventListener("change", renderList);
q("followStatusFilter").addEventListener("change", renderList);
q("search").addEventListener("input", renderList);
q("btnViewDetailed").addEventListener("click", () => {
  listViewMode = "detailed";
  q("btnViewDetailed").classList.remove("btn-secondary");
  q("btnViewCompact").classList.add("btn-secondary");
  renderList();
});
q("btnViewCompact").addEventListener("click", () => {
  listViewMode = "compact";
  q("btnViewCompact").classList.remove("btn-secondary");
  q("btnViewDetailed").classList.add("btn-secondary");
  renderList();
});
q("btnSaveDailySettings").addEventListener("click", saveDailySettings);
const dsInit = loadDailySettings();
q("ownerName").value = dsInit.ownerName;
q("dailyTarget").value = String(dsInit.dailyTarget);
q("btnDetailEdit").addEventListener("click", () => {
  if (!currentDetailId) return;
  const c = companies.find((x) => x.id === currentDetailId);
  if (!c) return;
  const editBtn = document.querySelector(`[data-edit="${currentDetailId}"]`);
  if (editBtn) editBtn.click();
});
refresh();
