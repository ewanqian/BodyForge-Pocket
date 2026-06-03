const STORAGE_KEY = "bodyforge.online.v1";

const defaultState = {
  profile: {
    proteinMin: 100,
    proteinMax: 125,
    weightKg: 62.5,
    beginnerMode: true
  },
  inventory: ["鸡蛋", "牛奶", "鸡腿", "米饭", "青菜", "香蕉", "酸奶", "豆腐"],
  github: {
    owner: "ewanqian",
    repo: "BodyForge",
    workerUrl: ""
  },
  days: {}
};

const foodProtein = [
  ["鸡腿", 28],
  ["鸡胸", 30],
  ["鸡肉", 30],
  ["牛肉", 25],
  ["鱼", 24],
  ["虾", 20],
  ["鸡蛋", 12],
  ["蛋", 12],
  ["牛奶", 16],
  ["酸奶", 12],
  ["豆腐", 18],
  ["豆", 14],
  ["金枪鱼", 25],
  ["乳清", 24]
];

const carbWords = ["米", "饭", "面", "面包", "土豆", "红薯", "燕麦", "香蕉"];
const fiberWords = ["菜", "青菜", "西兰花", "番茄", "黄瓜", "胡萝卜", "蘑菇", "水果"];
const safetyTerms = ["头晕", "胸痛", "异常气短", "气短", "濒晕", "严重头痛", "血压异常"];

const muscleLabels = {
  chest: "胸",
  shoulders: "肩",
  back: "背",
  legs: "腿",
  arms: "手臂",
  core: "核心"
};

const completionItems = [
  ["firstMeal", "吃到第一顿含蛋白正餐"],
  ["mealPlan", "选择并执行一个饮食方案"],
  ["training", "完成训练或最低限度活动"],
  ["review", "睡前写下三行复盘"]
];

let state = loadState();
let today = localDate();
let day = ensureDay(today);
let githubToken = "";
let deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);

function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return saved ? mergeState(defaultState, saved) : structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function mergeState(base, saved) {
  return {
    ...base,
    ...saved,
    profile: { ...base.profile, ...(saved.profile || {}) },
    github: { ...base.github, ...(saved.github || {}) },
    inventory: Array.isArray(saved.inventory) ? saved.inventory : base.inventory,
    days: saved.days || {}
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  $("saveState").textContent = "已本地保存";
  window.clearTimeout(saveState.timer);
  saveState.timer = window.setTimeout(() => {
    $("saveState").textContent = "浏览器本地";
  }, 1400);
}

function ensureDay(date) {
  state.days[date] ||= {
    checkin: {
      wakeTime: "",
      sleepHours: 7,
      energy: 6,
      trainingMinutes: 45,
      symptoms: []
    },
    selectedMealOption: "",
    selectedWorkout: "",
    completed: {},
    muscleFocus: [],
    review: ""
  };
  return state.days[date];
}

function classifyInventory() {
  const foods = state.inventory.map((name) => name.trim()).filter(Boolean);
  const proteins = foods
    .map((name) => ({ name, protein: estimateProtein(name) }))
    .filter((item) => item.protein > 0);
  const carbs = foods.filter((name) => carbWords.some((word) => name.includes(word)));
  const fibers = foods.filter((name) => fiberWords.some((word) => name.includes(word)));
  return { foods, proteins, carbs, fibers };
}

function estimateProtein(name) {
  const match = foodProtein.find(([word]) => name.includes(word));
  return match ? match[1] : 0;
}

function pick(list, fallback, index = 0) {
  return list[index] || list[0] || fallback;
}

function buildMealOptions() {
  const { proteins, carbs, fibers } = classifyInventory();
  const proteinNames = proteins.map((item) => item.name);
  const totalProtein = proteins.reduce((sum, item) => sum + item.protein, 0);
  const proteinTarget = `${state.profile.proteinMin}-${state.profile.proteinMax}g`;
  const gap = Math.max(0, state.profile.proteinMin - totalProtein);

  return [
    {
      id: "steady",
      title: "正常版本",
      badge: proteinTarget,
      tags: ["三餐", "蛋白+主食+蔬菜"],
      meals: [
        `第一餐：${pick(proteinNames, "鸡蛋/牛奶")} + ${pick(carbs, "米饭/面包")}。`,
        `第二餐：${pick(proteinNames, "鸡肉/豆腐", 1)} + ${pick(carbs, "米饭")} + ${pick(fibers, "青菜")}。`,
        `第三餐：${pick(proteinNames, "鱼/鸡蛋/豆腐", 2)} + 主食 + ${pick(fibers, "蔬菜/水果")}。`
      ],
      note: gap > 0 ? `估算还缺 ${gap}g 左右，晚上补酸奶、牛奶或鸡蛋。` : "蛋白大致够，重点是别漏餐。"
    },
    {
      id: "low-energy",
      title: "最省事版本",
      badge: "不烹饪也能吃",
      tags: ["两顿也行", "低决策"],
      meals: [
        `第一餐：${pick(proteinNames, "牛奶/酸奶/鸡蛋")} + 香蕉/面包。`,
        `第二餐：${pick(proteinNames, "豆腐/鸡蛋/鸡肉", 1)} + 米饭/面。`,
        `加餐：睡前不空腹，补一份牛奶或酸奶。`
      ],
      note: "今天先守住两顿含蛋白正餐，不追求完美。"
    },
    {
      id: "training",
      title: "增肌补足版本",
      badge: "训练前后",
      tags: ["训练后补", "别空腹硬扛"],
      meals: [
        `训练前：${pick(carbs, "香蕉/面包/米饭")} + 少量 ${pick(proteinNames, "牛奶/酸奶")}。`,
        `训练后：${pick(proteinNames, "鸡腿/鸡胸/豆腐", 1)} + ${pick(carbs, "米饭")} + ${pick(fibers, "青菜")}。`,
        `晚餐：${pick(proteinNames, "鸡蛋/鱼/豆腐", 2)} + 主食 + 蔬菜。`
      ],
      note: "训练日不要只练不吃，蛋白和主食都要落地。"
    }
  ];
}

function hasSafetyAlert() {
  return day.checkin.symptoms.some((item) => safetyTerms.includes(item));
}

function buildWorkoutOptions() {
  if (hasSafetyAlert()) {
    return [
      {
        id: "rest",
        title: "安全休息",
        badge: "取消力量",
        muscles: [],
        steps: ["不做力量训练。", "症状轻微且已缓解时，只做轻走。", "症状严重、反复或担心时，优先寻求医疗帮助。"],
        note: "身体警报优先级高于训练计划。"
      }
    ];
  }

  const low = Number(day.checkin.sleepHours) < 6 || Number(day.checkin.energy) <= 4 || Number(day.checkin.trainingMinutes) < 25;
  return [
    {
      id: "A",
      title: low ? "低能量 A" : "正式 A",
      badge: low ? "降组数" : "全身基础",
      muscles: ["legs", "chest", "back", "shoulders", "core"],
      steps: ["腿推/深蹲：2-3x8-12", "胸推/俯卧撑：2-3x8-12", "高位下拉：2-3x8-12", "侧平举：2x12-15", "核心：2 组"],
      note: "保留 2-3 次余力，不测试极限重量。"
    },
    {
      id: "B",
      title: low ? "低能量 B" : "正式 B",
      badge: "推拉平衡",
      muscles: ["legs", "chest", "back", "arms", "core"],
      steps: ["腿推/弓步：2-3x8-12", "胸推变化：2-3x8-12", "坐姿划船：2-3x8-12", "弯举/下压：2x10-15", "核心：2 组"],
      note: "如果睡眠不足，所有动作只做 2 组。"
    },
    {
      id: "minimum",
      title: "最低限度",
      badge: "20 分钟",
      muscles: ["legs", "chest", "back"],
      steps: ["腿推/深蹲：2x10", "推：2x8-12", "拉：2x8-12", "快走：10 分钟"],
      note: "适合很忙、很晚、或只想不断线的日子。"
    }
  ];
}

function render() {
  $("todayChip").textContent = today;
  $("wakeTime").value = day.checkin.wakeTime || "";
  $("sleepHours").value = day.checkin.sleepHours;
  $("energy").value = day.checkin.energy;
  $("energyValue").textContent = `${day.checkin.energy}/10`;
  $("trainingMinutes").value = day.checkin.trainingMinutes;
  $("inventoryText").value = state.inventory.join("\n");
  $("reviewText").value = day.review || "";
  $("githubOwner").value = state.github.owner;
  $("githubRepo").value = state.github.repo;
  $("workerUrl").value = state.github.workerUrl || "";

  document.querySelectorAll(".tap").forEach((button) => {
    const symptom = button.dataset.symptom;
    button.classList.toggle("active", symptom === "none" ? day.checkin.symptoms.length === 0 : day.checkin.symptoms.includes(symptom));
  });

  renderMealOptions();
  renderWorkoutOptions();
  renderCompletion();
  renderMuscles();
}

function renderMealOptions() {
  const container = $("mealOptions");
  container.innerHTML = "";
  buildMealOptions().forEach((option) => {
    const card = document.createElement("article");
    card.className = `meal-card ${day.selectedMealOption === option.id ? "selected" : ""}`;
    card.innerHTML = `
      <div class="card-head">
        <h3>${option.title}</h3>
        <span>${option.badge}</span>
      </div>
      <div class="tag-row">${option.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</div>
      <ul>${option.meals.map((meal) => `<li>${meal}</li>`).join("")}</ul>
      <p class="quiet">${option.note}</p>
      <button class="primary" type="button">${day.selectedMealOption === option.id ? "已选择" : "选这个"}</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      day.selectedMealOption = option.id;
      day.completed.mealPlan = true;
      saveState();
      render();
    });
    container.appendChild(card);
  });
}

function renderWorkoutOptions() {
  const container = $("workoutOptions");
  container.innerHTML = "";
  buildWorkoutOptions().forEach((option) => {
    const card = document.createElement("article");
    card.className = `workout-card ${day.selectedWorkout === option.id ? "selected" : ""}`;
    card.innerHTML = `
      <div class="card-head">
        <h3>${option.title}</h3>
        <span>${option.badge}</span>
      </div>
      <div class="tag-row">${option.muscles.map((muscle) => `<span class="tag">${muscleLabels[muscle]}</span>`).join("") || '<span class="tag">休息</span>'}</div>
      <ol>${option.steps.map((step) => `<li>${step}</li>`).join("")}</ol>
      <p class="quiet">${option.note}</p>
      <button class="primary" type="button">${day.selectedWorkout === option.id ? "已选择" : "选这个"}</button>
    `;
    card.querySelector("button").addEventListener("click", () => {
      day.selectedWorkout = option.id;
      day.muscleFocus = option.muscles;
      day.completed.training = true;
      saveState();
      render();
    });
    container.appendChild(card);
  });
}

function renderCompletion() {
  const container = $("completionList");
  container.innerHTML = "";
  completionItems.forEach(([key, label]) => {
    const row = document.createElement("label");
    row.className = "check-item";
    row.innerHTML = `<input type="checkbox" ${day.completed[key] ? "checked" : ""}><span>${label}</span>`;
    row.querySelector("input").addEventListener("change", (event) => {
      day.completed[key] = event.target.checked;
      saveState();
      renderCompletion();
    });
    container.appendChild(row);
  });
  const done = completionItems.filter(([key]) => day.completed[key]).length;
  const isComplete = done === completionItems.length;
  $("completionScore").textContent = `${done}/${completionItems.length}`;
  $("doneBanner").classList.toggle("hidden", !isComplete);
  $("reviewPanel").classList.toggle("complete", isComplete);
}

function renderMuscles() {
  document.querySelectorAll(".muscle").forEach((button) => {
    button.classList.toggle("active", day.muscleFocus.includes(button.dataset.muscle));
  });
  if (day.muscleFocus.length === 0) {
    $("muscleSummary").textContent = "今天还没选择训练";
  } else {
    $("muscleSummary").textContent = day.muscleFocus.map((key) => muscleLabels[key]).join(" / ");
  }
}

function updateCheckinFromInputs() {
  day.checkin.wakeTime = $("wakeTime").value;
  day.checkin.sleepHours = Number($("sleepHours").value || 0);
  day.checkin.energy = Number($("energy").value || 5);
  day.checkin.trainingMinutes = Number($("trainingMinutes").value || 0);
  saveState();
  render();
}

function makeMarkdown() {
  const meal = buildMealOptions().find((option) => option.id === day.selectedMealOption);
  const workout = buildWorkoutOptions().find((option) => option.id === day.selectedWorkout);
  const symptoms = day.checkin.symptoms.length ? day.checkin.symptoms.join("、") : "无明显警报";
  const muscleText = day.muscleFocus.length ? day.muscleFocus.map((key) => muscleLabels[key]).join("、") : "未选择";
  return [
    `# BodyForge Daily — ${today}`,
    "",
    "## 早上打卡",
    `- 起床：${day.checkin.wakeTime || ""}`,
    `- 睡眠：${day.checkin.sleepHours} 小时`,
    `- 精神：${day.checkin.energy}/10`,
    `- 训练窗口：${day.checkin.trainingMinutes} 分钟`,
    `- 安全状态：${symptoms}`,
    "",
    "## 今日饮食选择",
    meal ? `### ${meal.title}\n${meal.meals.map((item) => `- ${item}`).join("\n")}\n- ${meal.note}` : "- 未选择",
    "",
    "## 今日训练选择",
    workout ? `### ${workout.title}\n${workout.steps.map((item) => `- ${item}`).join("\n")}\n- 肌肉焦点：${muscleText}\n- ${workout.note}` : "- 未选择",
    "",
    "## 完成情况",
    ...completionItems.map(([key, label]) => `- ${day.completed[key] ? "[x]" : "[ ]"} ${label}`),
    "",
    "## 晚上复盘",
    day.review || "",
    ""
  ].join("\n");
}

function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function workerHealthUrl(workerUrl) {
  if (!workerUrl) return "";
  try {
    const url = new URL(workerUrl);
    url.pathname = url.pathname.replace(/\/issue\/?$/, "/health");
    if (!url.pathname.endsWith("/health")) {
      url.pathname = "/health";
    }
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

async function testWorkerConnection() {
  const workerUrl = $("workerUrl").value.trim();
  const healthUrl = workerHealthUrl(workerUrl);
  state.github.workerUrl = workerUrl;
  saveState();

  if (!healthUrl) {
    $("workerStatus").textContent = "请先填写有效 Worker URL";
    $("workerStatus").className = "status-bad";
    return;
  }

  $("workerStatus").textContent = "正在测试...";
  $("workerStatus").className = "";
  const response = await fetch(healthUrl, { method: "GET" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    $("workerStatus").textContent = `连接失败：${data.error || response.status}`;
    $("workerStatus").className = "status-bad";
    return;
  }

  $("workerStatus").textContent = "Worker 在线";
  $("workerStatus").className = "status-good";
  $("syncStatus").textContent = "Cloudflare Worker 已连通，可以使用 Worker 模式提交 Issue。";
}

async function sendGitHubIssue() {
  const owner = $("githubOwner").value.trim();
  const repo = $("githubRepo").value.trim();
  const workerUrl = $("workerUrl").value.trim();
  const workerKey = $("workerKey").value.trim();
  githubToken = $("githubToken").value.trim();
  state.github.owner = owner;
  state.github.repo = repo;
  state.github.workerUrl = workerUrl;
  saveState();

  if (workerUrl) {
    $("syncStatus").textContent = "正在通过 Cloudflare Worker 提交...";
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerKey ? { "X-BodyForge-Key": workerKey } : {})
      },
      body: JSON.stringify({
        title: `BodyForge Daily Log — ${today}`,
        body: makeMarkdown(),
        labels: ["bodyforge-log"]
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      $("syncStatus").textContent = `Worker 提交失败：${data.error || response.status}`;
      return;
    }
    $("syncStatus").innerHTML = `已通过 Worker 提交：<a href="${data.issue.url}" target="_blank" rel="noreferrer">Issue #${data.issue.number}</a>`;
    return;
  }

  if (!owner || !repo || !githubToken) {
    $("syncStatus").textContent = "请先填写 Cloudflare Worker URL，或填写 owner、repo 和临时 token。";
    return;
  }

  $("syncStatus").textContent = "正在提交到 GitHub Issue...";
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${githubToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      title: `BodyForge Daily Log — ${today}`,
      body: makeMarkdown(),
      labels: ["bodyforge-log"]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    $("syncStatus").textContent = `GitHub 提交失败：${response.status} ${text.slice(0, 120)}`;
    return;
  }

  const issue = await response.json();
  $("syncStatus").innerHTML = `已提交：<a href="${issue.html_url}" target="_blank" rel="noreferrer">Issue #${issue.number}</a>`;
}

function bindEvents() {
  ["wakeTime", "sleepHours", "energy", "trainingMinutes"].forEach((id) => {
    $(id).addEventListener("input", updateCheckinFromInputs);
  });
  $("inventoryText").addEventListener("input", () => {
    state.inventory = $("inventoryText").value.split("\n").map((item) => item.trim()).filter(Boolean);
    saveState();
    renderMealOptions();
  });
  $("reviewText").addEventListener("input", () => {
    day.review = $("reviewText").value;
    day.completed.review = day.review.trim().length > 0;
    saveState();
    renderCompletion();
  });
  $("resetInventory").addEventListener("click", () => {
    state.inventory = [...defaultState.inventory];
    saveState();
    render();
  });
  document.querySelectorAll(".tap").forEach((button) => {
    button.addEventListener("click", () => {
      const symptom = button.dataset.symptom;
      if (symptom === "none") {
        day.checkin.symptoms = [];
      } else if (day.checkin.symptoms.includes(symptom)) {
        day.checkin.symptoms = day.checkin.symptoms.filter((item) => item !== symptom);
      } else {
        day.checkin.symptoms.push(symptom);
      }
      day.selectedWorkout = "";
      day.muscleFocus = [];
      saveState();
      render();
    });
  });
  document.querySelectorAll(".muscle").forEach((button) => {
    button.addEventListener("click", () => {
      const muscle = button.dataset.muscle;
      day.muscleFocus = day.muscleFocus.includes(muscle)
        ? day.muscleFocus.filter((item) => item !== muscle)
        : [...day.muscleFocus, muscle];
      saveState();
      renderMuscles();
    });
  });
  $("downloadMarkdown").addEventListener("click", () => download(`bodyforge-${today}.md`, makeMarkdown(), "text/markdown"));
  $("downloadJson").addEventListener("click", () => download(`bodyforge-data-${today}.json`, JSON.stringify(state, null, 2), "application/json"));
  $("copyMarkdown").addEventListener("click", async () => {
    await navigator.clipboard.writeText(makeMarkdown());
    $("syncStatus").textContent = "Markdown 已复制。";
  });
  $("testWorker").addEventListener("click", () => {
    testWorkerConnection().catch((error) => {
      $("workerStatus").textContent = `连接失败：${error.message}`;
      $("workerStatus").className = "status-bad";
    });
  });
  $("sendIssue").addEventListener("click", () => {
    sendGitHubIssue().catch((error) => {
      $("syncStatus").textContent = `GitHub 提交失败：${error.message}`;
    });
  });
  $("installApp").addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      $("syncStatus").textContent = "当前浏览器暂未提供安装入口，可用浏览器菜单添加到主屏幕。";
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => ({ outcome: "dismissed" }));
    deferredInstallPrompt = null;
    $("installApp").classList.add("hidden");
    $("syncStatus").textContent = choice.outcome === "accepted" ? "已开始安装 BodyForge Pocket。" : "已取消安装。";
  });
}

bindEvents();
render();
saveState();

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("installApp").classList.remove("hidden");
  $("syncStatus").textContent = "可以把 BodyForge Pocket 安装到桌面或主屏幕。";
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  $("installApp").classList.add("hidden");
  $("syncStatus").textContent = "BodyForge Pocket 已安装。";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      $("syncStatus").textContent = "离线缓存注册失败，但本地保存仍可用。";
    });
  });
}
