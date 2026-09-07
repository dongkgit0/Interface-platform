let environments = [];
let interfaces = [];
let mode = "single";
let history = JSON.parse(localStorage.getItem("apitest_history") || "[]");

const $ = (id) => document.getElementById(id);

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("未登录");
  }
  return res.json();
}

// ---------------- load ----------------

async function loadAll() {
  environments = await api("/api/environments");
  interfaces = await api("/api/interfaces");
  renderRail();
  renderSelects();
  renderHistory();
  onIfaceChange();
  loadCurrentUser();
}

async function loadCurrentUser() {
  const user = await api("/api/me");
  $("avatarName").textContent = user.username;
  $("drawerUsername").value = user.username;
  $("drawerPassword").value = user.password || "";
  applyAvatar(user);
}

function applyAvatar(user) {
  const letter = (user.username || "?").charAt(0).toUpperCase();
  const url = user.avatar_url;
  const setCircle = (circleId) => {
    const circle = $(circleId);
    if (url) {
      circle.style.backgroundImage = `url("${url}?t=${Date.now()}")`;
      circle.textContent = "";
    } else {
      circle.style.backgroundImage = "";
      circle.textContent = letter;
    }
  };
  setCircle("avatarCircle");
  setCircle("drawerAvatar");
}

function renderRail() {
  const envList = $("envList");
  envList.innerHTML = "";
  environments.forEach((e) => {
    const el = document.createElement("div");
    el.className = "rail-item";
    el.innerHTML = `
      <div>
        <div class="rail-item-name">${escapeHtml(e.name)}</div>
        <div class="rail-item-sub">${escapeHtml(e.base_url)}</div>
      </div>
      <div class="rail-item-actions">
        <button data-act="edit">✎</button>
        <button data-act="del">✕</button>
      </div>`;
    el.querySelector('[data-act="edit"]').onclick = () => openEnvModal(e);
    el.querySelector('[data-act="del"]').onclick = async () => {
      if (confirm(`删除环境「${e.name}」？`)) {
        await api(`/api/environments/${e.id}`, { method: "DELETE" });
        loadAll();
      }
    };
    el.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return; // 点编辑/删除按钮时不触发选中
      markSelected(envList, el);
      selectEnv(e.id);
    });
    envList.appendChild(el);
  });

  const ifaceList = $("ifaceList");
  ifaceList.innerHTML = "";
  interfaces.forEach((i) => {
    const el = document.createElement("div");
    el.className = "rail-item has-check";
    if (batchSelected.has(i.id)) el.classList.add("batch-selected");
    el.innerHTML = `
      <label class="rail-check"><input type="checkbox" data-batch="${escapeHtml(i.id)}"></label>
      <div>
        <div class="rail-item-name">${escapeHtml(i.name)}</div>
        <div class="rail-item-sub">${escapeHtml(i.path)}</div>
      </div>
      <div class="rail-item-actions">
        <button data-act="edit">✎</button>
        <button data-act="del">✕</button>
      </div>`;
    el.querySelector('[data-act="edit"]').onclick = () => openIfaceModal(i);
    el.querySelector('[data-act="del"]').onclick = async () => {
      if (confirm(`删除接口「${i.name}」？`)) {
        batchSelected.delete(i.id);
        updateBatchBtn();
        await api(`/api/interfaces/${i.id}`, { method: "DELETE" });
        loadAll();
      }
    };
    el.querySelector("input[data-batch]").onchange = (ev) => {
      if (ev.target.checked) batchSelected.add(i.id);
      else batchSelected.delete(i.id);
      el.classList.toggle("batch-selected", ev.target.checked);
      updateBatchBtn();
    };
    el.addEventListener("click", (ev) => {
      // 点编辑/删除/勾选时不触发选中
      if (ev.target.closest("button") || ev.target.closest("input") || ev.target.closest("label")) return;
      markSelected(ifaceList, el);
      selectIface(i.id);
    });
    ifaceList.appendChild(el);
  });
  updateBatchBtn();
}

function markSelected(listEl, itemEl) {
  listEl.querySelectorAll(".rail-item").forEach((it) => it.classList.remove("selected"));
  itemEl.classList.add("selected");
}

function selectIface(id) {
  $("ifaceSelect").value = id;
  $("ifaceSelectC").value = id;
  onIfaceChange();
}

function selectEnv(id) {
  $("envSelect").value = id;
  $("envSelectA").value = id;
  updateUrlPreview();
  updateEnvLabels();
}

function renderSelects() {
  const fillSelect = (sel, items, labelFn) => {
    sel.innerHTML = items.map((it) => `<option value="${it.id}">${escapeHtml(labelFn(it))}</option>`).join("");
  };
  fillSelect($("ifaceSelect"), interfaces, (i) => i.name);
  fillSelect($("ifaceSelectC"), interfaces, (i) => i.name);
  fillSelect($("envSelect"), environments, (e) => e.name);
  fillSelect($("envSelectA"), environments, (e) => e.name);
  fillSelect($("envSelectB"), environments, (e) => e.name);
  if (environments.length > 1) $("envSelectB").selectedIndex = 1;
}

// ---------------- mode + iface/env change ----------------

$("modeToggle").addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  mode = btn.dataset.mode;
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.toggle("active", b === btn));
  $("singleConfig").style.display = mode === "single" ? "flex" : "none";
  $("compareConfig").style.display = mode === "compare" ? "flex" : "none";
  $("singleEditorBlock").style.display = mode === "single" ? "block" : "none";
  $("compareEditorBlock").style.display = mode === "compare" ? "grid" : "none";
  updateUrlPreview();
  updateEnvLabels();
});

$("ifaceSelect").addEventListener("change", onIfaceChange);
$("ifaceSelectC").addEventListener("change", onIfaceChange);
$("envSelect").addEventListener("change", updateUrlPreview);
$("envSelectA").addEventListener("change", updateEnvLabels);
$("envSelectB").addEventListener("change", updateEnvLabels);

function currentIface() {
  const id = mode === "single" ? $("ifaceSelect").value : $("ifaceSelectC").value;
  return interfaces.find((i) => i.id === id);
}

function onIfaceChange() {
  const iface = currentIface();
  if (!iface) return;
  $("bodyEditor").value = JSON.stringify(iface.body_template, null, 2);
  $("bodyEditorA").value = JSON.stringify(iface.body_template, null, 2);
  $("bodyEditorB").value = JSON.stringify(iface.body_template_b || iface.body_template, null, 2);
  updateUrlPreview();
  updateEnvLabels();
  syncIfaceRailSelection(iface.id);
}

function syncIfaceRailSelection(id) {
  const items = $("ifaceList").querySelectorAll(".rail-item");
  items.forEach((it, idx) => it.classList.toggle("selected", interfaces[idx] && interfaces[idx].id === id));
}

function updateEnvLabels() {
  const envA = environments.find((e) => e.id === $("envSelectA").value);
  const envB = environments.find((e) => e.id === $("envSelectB").value);
  $("envALabel").textContent = envA ? "（" + envA.name + "）" : "";
  $("envBLabel").textContent = envB ? "（" + envB.name + "）" : "";
  const items = $("envList").querySelectorAll(".rail-item");
  items.forEach((it, idx) => it.classList.toggle("selected", environments[idx] && environments[idx].id === envA?.id));
}

function updateUrlPreview() {
  const iface = currentIface();
  const env = environments.find((e) => e.id === $("envSelect").value);
  if (iface && env) {
    $("urlPreview").textContent = env.base_url.replace(/\/$/, "") + iface.path;
  } else {
    $("urlPreview").textContent = "—";
  }
}

$("resetBodyBtn").onclick = onIfaceChange;
$("resetBodyBtnA").onclick = () => {
  const iface = currentIface();
  if (iface) $("bodyEditorA").value = JSON.stringify(iface.body_template, null, 2);
};
$("resetBodyBtnB").onclick = () => {
  const iface = currentIface();
  if (iface) {
    $("bodyEditorB").value = JSON.stringify(iface.body_template_b || iface.body_template, null, 2);
  }
};

// ---------------- save 请求体为预设模板 ----------------

async function saveBodyTemplate(which) {
  const iface = currentIface();
  if (!iface) return;
  const hint = which === "single" ? $("bodyHint") : which === "A" ? $("bodyHintA") : $("bodyHintB");
  const editor = which === "single" ? $("bodyEditor") : which === "A" ? $("bodyEditorA") : $("bodyEditorB");
  hint.textContent = "";
  hint.style.color = "";
  let body;
  try {
    body = JSON.parse(editor.value);
  } catch (e) {
    hint.textContent = "不是合法 JSON，无法保存：" + e.message;
    return;
  }
  const payload = {
    id: iface.id,
    name: iface.name,
    path: iface.path,
  };
  if (which === "B") {
    payload.body_template = iface.body_template;   // 保存 B 不动 A 模板
    payload.body_template_b = body;
  } else {
    payload.body_template = body;
    if (iface.body_template_b) payload.body_template_b = iface.body_template_b;
  }
  try {
    const res = await api("/api/interfaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    Object.assign(iface, res); // 更新内存中的预设，保留其他编辑框内容
    hint.style.color = "var(--good)";
    hint.textContent = "已保存到接口预设模板";
  } catch (e) {
    hint.textContent = "保存失败：" + e.message;
  }
}

$("saveBodyBtn").onclick = () => saveBodyTemplate("single");
$("saveBodyBtnA").onclick = () => saveBodyTemplate("A");
$("saveBodyBtnB").onclick = () => saveBodyTemplate("B");

// ---------------- 保存双环境对比整体配置（接口 / 环境 A / 环境 B / 请求体） ----------------

const COMPARE_CONFIG_KEY = "apitest_compare_config";
let saveConfigTimer = null;

function flashSaveConfigBtn(text, isError) {
  const btn = $("saveCompareConfigBtn");
  clearTimeout(saveConfigTimer);
  btn.textContent = text;
  btn.style.color = isError ? "var(--bad)" : "var(--good)";
  btn.style.borderColor = isError ? "var(--bad)" : "var(--good)";
  saveConfigTimer = setTimeout(() => {
    btn.textContent = "保存配置";
    btn.style.color = "";
    btn.style.borderColor = "";
  }, 1600);
}

$("saveCompareConfigBtn").onclick = () => {
  const iface = interfaces.find((i) => i.id === $("ifaceSelectC").value);
  const envA = environments.find((e) => e.id === $("envSelectA").value);
  const envB = environments.find((e) => e.id === $("envSelectB").value);
  if (!iface || !envA || !envB) {
    flashSaveConfigBtn("配置不完整", true);
    return;
  }
  // 请求体必须是合法 JSON 才允许保存整份配置
  try {
    JSON.parse($("bodyEditorA").value);
    JSON.parse($("bodyEditorB").value);
  } catch (e) {
    flashSaveConfigBtn("请求体不是合法 JSON", true);
    return;
  }
  const config = {
    ifaceId: iface.id,
    envAId: envA.id,
    envBId: envB.id,
    bodyA: $("bodyEditorA").value,
    bodyB: $("bodyEditorB").value,
    savedAt: new Date().toLocaleString(),
  };
  localStorage.setItem(COMPARE_CONFIG_KEY, JSON.stringify(config));
  flashSaveConfigBtn("已保存配置");
};

// 页面加载时恢复上次保存的双环境对比配置（仅初始化时执行一次）
function restoreCompareConfig() {
  let config = null;
  try {
    config = JSON.parse(localStorage.getItem(COMPARE_CONFIG_KEY) || "null");
  } catch (e) {
    config = null;
  }
  if (!config) return;
  const ifaceOk = interfaces.some((i) => i.id === config.ifaceId);
  const envAOk = environments.some((e) => e.id === config.envAId);
  const envBOk = environments.some((e) => e.id === config.envBId);
  if (!ifaceOk || !envAOk || !envBOk) {
    // 配置中引用的接口/环境已被删除，清理过期配置
    localStorage.removeItem(COMPARE_CONFIG_KEY);
    return;
  }
  $("ifaceSelectC").value = config.ifaceId;
  $("envSelectA").value = config.envAId;
  $("envSelectB").value = config.envBId;
  $("bodyEditorA").value = config.bodyA;
  $("bodyEditorB").value = config.bodyB;
  updateEnvLabels();
  syncIfaceRailSelection(config.ifaceId);
}

// ---------------- fire request ----------------

$("fireBtn").addEventListener("click", async () => {
  const hint = $("bodyHint");
  const hintA = $("bodyHintA");
  const hintB = $("bodyHintB");
  hint.textContent = "";
  hintA.textContent = "";
  hintB.textContent = "";

  let body, bodyA, bodyB;
  if (mode === "single") {
    try {
      body = JSON.parse($("bodyEditor").value);
    } catch (e) {
      hint.textContent = "请求体不是合法 JSON：" + e.message;
      return;
    }
  } else {
    try {
      bodyA = JSON.parse($("bodyEditorA").value);
    } catch (e) {
      hintA.textContent = "请求体 A 不是合法 JSON：" + e.message;
      return;
    }
    try {
      bodyB = JSON.parse($("bodyEditorB").value);
    } catch (e) {
      hintB.textContent = "请求体 B 不是合法 JSON：" + e.message;
      return;
    }
  }

  const iface = currentIface();
  $("fireBtn").disabled = true;
  $("statusLine").textContent = "请求中…";

  try {
    if (mode === "single") {
      const env = environments.find((e) => e.id === $("envSelect").value);
      const result = await api("/api/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: env, path: iface.path, body }),
      });
      renderSingleResult(iface, env, result);
      pushHistory({ mode: "single", iface: iface.name, env: env.name, body, result });
    } else {
      const envA = environments.find((e) => e.id === $("envSelectA").value);
      const envB = environments.find((e) => e.id === $("envSelectB").value);
      const result = await api("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment_a: envA,
          environment_b: envB,
          path: iface.path,
          body_a: bodyA,
          body_b: bodyB,
        }),
      });
      renderCompareResult(iface, envA, envB, result);
      pushHistory({
        mode: "compare",
        iface: iface.name,
        env: `${envA.name} vs ${envB.name}`,
        body_a: bodyA,
        body_b: bodyB,
        result,
      });
    }
  } finally {
    $("fireBtn").disabled = false;
    $("statusLine").textContent = "完成 · " + new Date().toLocaleTimeString();
  }
});

// ---------------- response 渲染（右侧面板） ----------------

let lastResponse = null;      // { tabs: null|["a","b"], items: {key: data} }
let formatPretty = true;

function makeResponseData(title, r) {
  const ok = r.success && r.status_code >= 200 && r.status_code < 300;
  return {
    title,
    ok,
    statusText: r.success ? `HTTP ${r.status_code}` : "请求失败",
    meta: `${r.url || ""} · ${r.elapsed_ms}ms`,
    obj: r.success ? r.response : null,
    rawText: r.success ? null : r.error,
  };
}

function renderResponseBodyText(data) {
  if (data.rawText !== null) return data.rawText;
  if (data.obj === null) return "无响应内容";
  const isRawWrap =
    data.obj && typeof data.obj === "object" && !Array.isArray(data.obj) &&
    "raw_text" in data.obj && "note" in data.obj;
  if (isRawWrap) {
    return formatPretty ? JSON.stringify(data.obj, null, 2) : data.obj.raw_text;
  }
  return formatPretty ? JSON.stringify(data.obj, null, 2) : JSON.stringify(data.obj);
}

function makeResponseColumn(data) {
  const col = document.createElement("div");
  col.className = "response-col";
  const head = document.createElement("div");
  head.className = "response-col-head";
  head.innerHTML = `
    <span class="response-title">${escapeHtml(data.title)}</span>
    <span class="badge ${data.ok ? "ok" : "err"}">${escapeHtml(data.statusText)}</span>
    <span class="response-meta">${escapeHtml(data.meta)}</span>
    <button class="ghost-btn col-copy">复制</button>`;
  const pre = document.createElement("pre");
  pre.className = "response-body";
  pre.textContent = renderResponseBodyText(data);
  head.querySelector(".col-copy").onclick = async () => {
    const ok = await copyText(pre.textContent);
    const btn = head.querySelector(".col-copy");
    btn.textContent = ok ? "已复制" : "失败";
    setTimeout(() => (btn.textContent = "复制"), 1200);
  };
  col.appendChild(head);
  col.appendChild(pre);
  return col;
}

function renderResponseColumns() {
  const grid = $("responseGrid");
  grid.innerHTML = "";
  const keys = lastResponse.tabs ? lastResponse.tabs : ["_"];
  grid.classList.toggle("cols-2", keys.length > 1);
  keys.forEach((key) => grid.appendChild(makeResponseColumn(lastResponse.items[key])));
}

function showSingleResponse(title, result) {
  $("batchPanel").style.display = "none";
  $("responsePanel").style.display = "flex";
  lastResponse = { tabs: null, items: { _: makeResponseData(title, result) } };
  renderResponseColumns();
  $("fieldCompare").style.display = "none";
}

function showCompareResponses(envA, envB, result) {
  $("batchPanel").style.display = "none";
  $("responsePanel").style.display = "flex";
  lastResponse = {
    tabs: ["a", "b"],
    items: {
      a: makeResponseData(envA.name, result.a),
      b: makeResponseData(envB.name, result.b),
    },
  };
  renderResponseColumns();
  renderFieldCompare(result.a, result.b, envA.name, envB.name);
  $("fieldCompare").style.display = "flex";
}

function renderSingleResult(iface, env, result) {
  showSingleResponse(`${iface.name} — ${env.name}`, result);
}

function renderCompareResult(iface, envA, envB, result) {
  showCompareResponses(envA, envB, result);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

$("formatResultBtn").onclick = () => {
  formatPretty = !formatPretty;
  $("formatResultBtn").textContent = formatPretty ? "格式化" : "紧凑";
  if (lastResponse) renderResponseColumns();
};

// ---------------- 响应差异对比引擎 ----------------

function nodeType(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

// 递归对比两个 JSON，返回差异行：值不同/类型不同/环境缺少字段/数组数量不同/数组内容不同
function diffResponses(respA, respB, nameA, nameB) {
  const rows = [];
  const labelA = `${nameA}缺少字段`;
  const labelB = `${nameB}缺少字段`;

  const walk = (a, b, path, inArray) => {
    const tA = nodeType(a);
    const tB = nodeType(b);
    if (tA !== tB) {
      rows.push({ path: path || "(根)", kind: "type", typeA: tA, typeB: tB, label: "类型不同", cls: "type", valueA: a, valueB: b });
      return;
    }
    if (tA === "array") {
      if (a.length !== b.length) {
        rows.push({ path: path || "(根)", kind: "array-len", typeA: `array[${a.length}]`, typeB: `array[${b.length}]`, label: "数组数量不同", cls: "array-len", valueA: a, valueB: b });
      }
      const common = Math.min(a.length, b.length);
      for (let i = 0; i < common; i++) walk(a[i], b[i], `${path}[${i}]`, true);
      return;
    }
    if (tA === "object") {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        const p = path ? `${path}.${k}` : k;
        if (!(k in a)) {
          rows.push({ path: p, kind: "missing-a", typeA: null, typeB: nodeType(b[k]), label: labelA, cls: "missing-a", valueA: undefined, valueB: b[k] });
        } else if (!(k in b)) {
          rows.push({ path: p, kind: "missing-b", typeA: nodeType(a[k]), typeB: null, label: labelB, cls: "missing-b", valueA: a[k], valueB: undefined });
        } else {
          walk(a[k], b[k], p, inArray);
        }
      }
      return;
    }
    // 标量
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      if (inArray) {
        rows.push({ path: path || "(根)", kind: "array-content", typeA: tA, typeB: tB, label: "数组内容不同", cls: "array-content", valueA: a, valueB: b });
      } else {
        rows.push({ path: path || "(根)", kind: "value", typeA: tA, typeB: tB, label: "值不同", cls: "value", valueA: a, valueB: b });
      }
    }
  };

  walk(respA, respB, "", false);
  const kindOrder = { type: 0, "array-len": 1, "array-content": 2, "missing-a": 3, "missing-b": 4, value: 5 };
  rows.sort((x, y) => kindOrder[x.kind] - kindOrder[y.kind] || String(x.path).localeCompare(String(y.path)));
  return rows;
}

function diffStats(rows) {
  const stats = {};
  rows.forEach((r) => {
    stats[r.label] = (stats[r.label] || 0) + 1;
  });
  return stats;
}

function truncate(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// 表格单元格：显示 类型 / 实际值；缺失侧显示 缺失 / 存在
function diffCellText(row, side) {
  const isA = side === "a";
  const missing = isA ? row.kind === "missing-a" : row.kind === "missing-b";
  if (missing) return "缺失";
  const present = isA ? row.kind === "missing-b" : row.kind === "missing-a";
  if (present) return "存在";
  const t = isA ? row.typeA : row.typeB;
  const v = isA ? row.valueA : row.valueB;
  if (row.kind === "array-len") return t; // array[2] / array[3]
  if (v === undefined) return t;
  return `${t} / ${truncate(JSON.stringify(v), 48)}`;
}

function diffStatsHtml(rows, nameA, nameB) {
  const stats = diffStats(rows);
  const arrDiff = (stats["数组数量不同"] || 0) + (stats["数组内容不同"] || 0);
  return `
    <div class="diff-stats">
      <span class="diff-stat total"><b>响应差异</b> ${rows.length}处</span>
      <span class="diff-stat"><b>值不同</b> ${stats["值不同"] || 0}</span>
      <span class="diff-stat"><b>类型不同</b> ${stats["类型不同"] || 0}</span>
      <span class="diff-stat"><b>${escapeHtml(nameA)}缺少字段</b> ${stats[`${nameA}缺少字段`] || 0}</span>
      <span class="diff-stat"><b>${escapeHtml(nameB)}缺少字段</b> ${stats[`${nameB}缺少字段`] || 0}</span>
      <span class="diff-stat"><b>数组差异</b> ${arrDiff}</span>
    </div>`;
}

function diffTableHtml(rows, nameA, nameB) {
  if (!rows.length) {
    return `<div class="compare-note">✓ 两个环境的响应字段类型与结构完全一致</div>`;
  }
  return `
    ${diffStatsHtml(rows, nameA, nameB)}
    <table class="compare-table">
      <thead><tr><th>字段路径</th><th>${escapeHtml(nameA)}</th><th>${escapeHtml(nameB)}</th><th>差异类型</th></tr></thead>
      <tbody>
        ${rows.map((r, i) => `
        <tr data-i="${i}">
          <td class="cmp-path">${escapeHtml(r.path || "(根)")}</td>
          <td class="cmp-cell">${escapeHtml(diffCellText(r, "a"))}</td>
          <td class="cmp-cell">${escapeHtml(diffCellText(r, "b"))}</td>
          <td><span class="cmp-tag ${r.cls}">${escapeHtml(r.label)}</span></td>
        </tr>`).join("")}
      </tbody>
    </table>`;
}

function renderFieldCompare(resultA, resultB, nameA, nameB) {
  const body = $("fieldCompareBody");
  if (!resultA.success || !resultB.success) {
    const notes = [
      !resultA.success && `${nameA || "环境 A"} 请求失败，无法对比`,
      !resultB.success && `${nameB || "环境 B"} 请求失败，无法对比`,
    ].filter(Boolean);
    body.innerHTML = `<div class="compare-note">${escapeHtml(notes.join("；"))}</div>`;
    return;
  }
  body.innerHTML = diffTableHtml(diffResponses(resultA.response, resultB.response, nameA, nameB), nameA, nameB);
}

// ---------------- 批量执行 ----------------

let batchSelected = new Set();
let batchJob = null; // Map<ifaceId, {iface, compare, eval}>

function updateBatchBtn() {
  const n = batchSelected.size;
  const btn = $("batchRunBtn");
  btn.textContent = n ? `批量执行(${n})` : "批量执行";
  btn.disabled = n === 0;
}

$("batchRunBtn").onclick = runBatch;
$("closeBatchBtn").onclick = () => {
  $("batchPanel").style.display = "none";
  $("responsePanel").style.display = "flex";
};

function statusCls(s) {
  return { "通过": "ok", "失败": "fail", "存在差异": "diff", "执行中": "running", "待执行": "pending" }[s] || "pending";
}
function statusIcon(s) {
  return { "通过": "✓", "失败": "✗", "存在差异": "⚠", "执行中": "●", "待执行": "○" }[s] || "○";
}

// 业务失败识别：HTTP 200 但响应体里 error=8 / code!=0 等
function businessError(resp) {
  if (!resp || typeof resp !== "object" || Array.isArray(resp)) return null;
  const keys = ["success", "error", "errCode", "errorCode", "code", "retCode"];
  const scan = (obj) => {
    for (const k of keys) {
      if (!(k in obj)) continue;
      const v = obj[k];
      if (k === "success" && typeof v === "boolean" && !v) return { key: k, value: v };
      if (k === "error" && typeof v === "number" && v !== 0) return { key: k, value: v };
      if (k === "error" && typeof v === "string" && v && !["0", "success", "ok", "none", ""].includes(v.toLowerCase())) return { key: k, value: v };
      if (["errCode", "errorCode", "code", "retCode"].includes(k) && typeof v === "number" && v !== 0) return { key: k, value: v };
    }
    return null;
  };
  const direct = scan(resp);
  if (direct) return direct;
  for (const wrap of ["data", "result", "response"]) {
    const w = resp[wrap];
    if (w && typeof w === "object" && !Array.isArray(w)) {
      const found = scan(w);
      if (found) return { key: `${wrap}.${found.key}`, value: found.value };
    }
  }
  return null;
}

function evaluateEnvResult(r) {
  if (!r.success) return { ok: false, code: "请求失败", detail: r.error };
  if (r.status_code < 200 || r.status_code >= 300) return { ok: false, code: `HTTP ${r.status_code}`, detail: "HTTP 状态码异常" };
  const biz = businessError(r.response);
  if (biz) return { ok: false, code: `业务失败(${biz.key}=${biz.value})`, detail: `${biz.key}=${biz.value}` };
  return { ok: true, code: `HTTP ${r.status_code}`, detail: "" };
}

function evaluateCompareResult(compare, nameA, nameB) {
  const ea = evaluateEnvResult(compare.a);
  const eb = evaluateEnvResult(compare.b);
  let diff = [];
  if (ea.ok && eb.ok) diff = diffResponses(compare.a.response, compare.b.response, nameA, nameB);
  const status = !ea.ok || !eb.ok ? "失败" : diff.length ? "存在差异" : "通过";
  return { ea, eb, diff, status };
}

async function runBatch() {
  const ifaces = interfaces.filter((i) => batchSelected.has(i.id));
  if (!ifaces.length) return;
  const envA = environments.find((e) => e.id === $("envSelectA").value) || environments[0];
  const envB = environments.find((e) => e.id === $("envSelectB").value) || environments[1] || environments[0];
  if (!envA || !envB) {
    alert("环境不足，无法批量执行");
    return;
  }
  // 展示批量面板
  $("responsePanel").style.display = "none";
  $("batchPanel").style.display = "flex";
  $("batchEnvInfo").textContent = `${envA.name} vs ${envB.name}`;
  $("batchThA").textContent = envA.name;
  $("batchThB").textContent = envB.name;
  $("batchTableBody").innerHTML = ifaces
    .map((i) => `
      <tr data-id="${escapeHtml(i.id)}">
        <td><span class="bstatus pending" data-role="status">○ 待执行</span></td>
        <td>${escapeHtml(i.name)}</td>
        <td data-role="ea">—</td>
        <td data-role="eb">—</td>
        <td data-role="diff">—</td>
        <td><button class="ghost-btn" data-role="detail" disabled>查看详情</button></td>
      </tr>`)
    .join("");
  updateBatchOverview(ifaces.length, new Map(), 0);
  updateBatchProgress(0, ifaces.length);

  const started = Date.now();
  const results = new Map();
  let done = 0;

  for (const iface of ifaces) {
    const tr = $("batchTableBody").querySelector(`tr[data-id="${iface.id}"]`);
    setBatchStatusEl(tr, "执行中");
    let compare;
    try {
      compare = await api("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment_a: envA,
          environment_b: envB,
          path: iface.path,
          body_a: iface.body_template,
          body_b: iface.body_template_b || iface.body_template,
        }),
      });
    } catch (e) {
      compare = {
        a: { success: false, url: "", error: e.message, elapsed_ms: 0 },
        b: { success: false, url: "", error: e.message, elapsed_ms: 0 },
      };
    }
    const ev = evaluateCompareResult(compare, envA.name, envB.name);
    ev._name = iface.name;
    ev._path = iface.path;
    ev._compareA = compare.a;
    ev._compareB = compare.b;
    results.set(iface.id, { iface, compare, eval: ev });
    done++;
    setBatchRow(tr, ev);
    updateBatchProgress(done, ifaces.length);
    updateBatchOverview(ifaces.length, results, Date.now() - started);
  }

  const totalMs = Date.now() - started;
  $("batchProgressText").textContent = `执行完成 · 总耗时 ${(totalMs / 1000).toFixed(1)}s`;
  $("batchBarFill").style.width = "100%";
  batchJob = results;
}

function setBatchStatusEl(tr, status) {
  const st = tr.querySelector('[data-role="status"]');
  st.className = "bstatus " + statusCls(status);
  st.textContent = `${statusIcon(status)} ${status}`;
}

function setBatchRow(tr, ev) {
  setBatchStatusEl(tr, ev.status);
  tr.querySelector('[data-role="ea"]').innerHTML = `<span class="${ev.ea.ok ? "b-ok" : "b-bad"}">${escapeHtml(ev.ea.code)}</span>`;
  tr.querySelector('[data-role="eb"]').innerHTML = `<span class="${ev.eb.ok ? "b-ok" : "b-bad"}">${escapeHtml(ev.eb.code)}</span>`;
  const diffCell = tr.querySelector('[data-role="diff"]');
  if (!ev.ea.ok || !ev.eb.ok) {
    diffCell.textContent = "请求失败";
    diffCell.className = "b-bad";
  } else if (ev.diff.length) {
    diffCell.textContent = `${ev.diff.length}处差异`;
    diffCell.className = "b-warn";
  } else {
    diffCell.textContent = "一致";
    diffCell.className = "b-ok";
  }
  const btn = tr.querySelector('[data-role="detail"]');
  btn.disabled = false;
  btn.onclick = () => openBatchDetail(ev);
}

function updateBatchProgress(done, total) {
  $("batchProgressText").textContent = `正在执行 ${done}/${total}`;
  $("batchBarFill").style.width = total ? Math.round((done / total) * 100) + "%" : "0%";
}

function updateBatchOverview(total, resultsMap, totalMs) {
  let pass = 0, fail = 0, diff = 0;
  resultsMap.forEach((r) => {
    if (r.eval.status === "通过") pass++;
    else if (r.eval.status === "失败") fail++;
    else diff++;
  });
  const rate = total ? pass / total : 0;
  $("batchOverview").innerHTML = `
    <div class="batch-ov">
      <div class="ov-item"><span class="ov-num">${total}</span><span class="ov-label">总接口</span></div>
      <div class="ov-item ok"><span class="ov-num">${pass}</span><span class="ov-label">通过</span></div>
      <div class="ov-item bad"><span class="ov-num">${fail}</span><span class="ov-label">失败</span></div>
      <div class="ov-item warn"><span class="ov-num">${diff}</span><span class="ov-label">存在差异</span></div>
      <div class="ov-item"><span class="ov-num">${(rate * 100).toFixed(0)}%</span><span class="ov-label">通过率</span></div>
      <div class="ov-item"><span class="ov-num">${totalMs ? (totalMs / 1000).toFixed(1) + "s" : "—"}</span><span class="ov-label">总耗时</span></div>
    </div>`;
}

// ---------------- 批量详情：JSON 查看器 & 差异详情 ----------------

function openBatchDetail(ev) {
  const nameA = $("batchEnvInfo").textContent.split(" vs ")[0] || "5.0环境";
  const nameB = $("batchEnvInfo").textContent.split(" vs ")[1] || "3.0环境";
  const diffCount = ev.diff.length;
  $("detailOverlay").classList.add("open");
  $("detailModalBody").innerHTML = `
    <div class="detail-head">
      <div class="detail-title">
        <div class="detail-name-row">
          <h3>${escapeHtml(ev._name || "接口详情")}</h3>
          <span class="bstatus ${statusCls(ev.status)}">${statusIcon(ev.status)} ${ev.status}</span>
          <span class="detail-diffcount ${diffCount ? "" : "ok"}">${diffCount ? `差异 ${diffCount} 处` : "无差异"}</span>
        </div>
        <div class="detail-path">${escapeHtml(ev._path || "")}</div>
      </div>
      <button class="icon-btn" id="detailCloseBtn" title="关闭">✕</button>
    </div>
    <div class="detail-body">
      <div class="detail-viewers">
        ${jsonViewerHtml("detailViewerA", nameA, ev.ea, ev._compareA)}
        ${jsonViewerHtml("detailViewerB", nameB, ev.eb, ev._compareB)}
      </div>
      <div class="detail-diff">
        <div class="field-compare-head">响应差异</div>
        <div class="field-compare-body" id="detailDiffBody"></div>
      </div>
    </div>`;
  $("detailCloseBtn").onclick = closeBatchDetail;
  $("detailOverlay").addEventListener("click", (e) => {
    if (e.target === $("detailOverlay")) closeBatchDetail();
  });
  initJsonViewer("detailViewerA", ev._compareA);
  initJsonViewer("detailViewerB", ev._compareB);
  renderDetailDiff(ev, nameA, nameB);
}

function closeBatchDetail() {
  $("detailOverlay").classList.remove("open");
}

function jsonViewerHtml(prefix, name, envEval, cr) {
  const time = cr && cr.elapsed_ms != null ? `${cr.elapsed_ms}ms` : "—";
  return `
    <div class="json-viewer" id="${prefix}">
      <div class="json-viewer-head">
        <div class="json-viewer-info">
          <span class="response-title">${escapeHtml(name)}</span>
          <span class="badge ${envEval.ok ? "ok" : "err"}">${escapeHtml(envEval.code)}</span>
          <span class="json-viewer-time">响应耗时：${time}</span>
        </div>
        <div class="json-viewer-actions">
          <button class="ghost-btn" data-act="format">格式化</button>
          <button class="ghost-btn" data-act="copy">复制</button>
          <button class="ghost-btn" data-act="search">搜索</button>
          <button class="ghost-btn" data-act="collapse">收起</button>
          <button class="ghost-btn" data-act="expand">展开</button>
        </div>
      </div>
      <div class="json-viewer-search" data-role="searchbar" style="display:none">
        <input type="text" data-role="search" placeholder="搜索 JSON…">
        <span class="json-search-info" data-role="searchinfo"></span>
        <button class="ghost-btn" data-act="prev" title="上一个">↑</button>
        <button class="ghost-btn" data-act="next" title="下一个">↓</button>
      </div>
      <pre class="json-viewer-body" data-role="body"></pre>
    </div>`;
}

function initJsonViewer(prefix, cr) {
  const root = document.getElementById(prefix);
  const state = {
    obj: cr && cr.success ? cr.response : null,
    error: cr && !cr.success ? cr.error : null,
    pretty: true,
    collapsed: false,
    query: "",
    active: 0,
    marks: [],
  };
  root._viewer = state;

  const render = () => {
    let text;
    if (state.error !== null) text = state.error;
    else if (state.collapsed) text = collapseSummary(state.obj);
    else text = state.pretty ? JSON.stringify(state.obj, null, 2) : JSON.stringify(state.obj);
    state.text = text;
    const body = root.querySelector('[data-role="body"]');
    const info = root.querySelector('[data-role="searchinfo"]');
    if (state.query) {
      const escaped = escapeHtml(text);
      const q = escapeHtml(state.query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(q, "gi");
      const marks = [];
      body.innerHTML = escaped.replace(re, (m) => {
        marks.push(m);
        return `<mark class="hl">${m}</mark>`;
      });
      state.marks = marks;
      state.active = Math.min(state.active, Math.max(0, marks.length - 1));
      info.textContent = marks.length ? `${state.active + 1}/${marks.length}` : "无匹配";
      highlightActive(body, state.active);
    } else {
      body.innerHTML = escapeHtml(text);
      state.marks = [];
      info.textContent = "";
    }
    root.querySelector('[data-act="format"]').textContent = state.pretty ? "格式化" : "紧凑";
    root.querySelector('[data-act="collapse"]').disabled = state.error !== null || state.collapsed;
    root.querySelector('[data-act="expand"]').disabled = state.error !== null || !state.collapsed;
  };

  root.querySelector('[data-act="format"]').onclick = () => { state.pretty = !state.pretty; render(); };
  root.querySelector('[data-act="copy"]').onclick = async () => {
    const ok = await copyText(state.text);
    const btn = root.querySelector('[data-act="copy"]');
    btn.textContent = ok ? "已复制" : "失败";
    setTimeout(() => (btn.textContent = "复制"), 1200);
  };
  root.querySelector('[data-act="collapse"]').onclick = () => { state.collapsed = true; render(); };
  root.querySelector('[data-act="expand"]').onclick = () => { state.collapsed = false; render(); };
  const searchbar = root.querySelector('[data-role="searchbar"]');
  const searchBtn = root.querySelector('[data-act="search"]');
  searchBtn.onclick = () => {
    const show = searchbar.style.display !== "flex";
    searchbar.style.display = show ? "flex" : "none";
    searchBtn.classList.toggle("active", show);
    const input = root.querySelector('[data-role="search"]');
    if (show && input.focus) input.focus();
  };
  const input = root.querySelector('[data-role="search"]');
  input.oninput = () => { state.query = input.value; state.active = 0; render(); };
  root.querySelector('[data-act="prev"]').onclick = () => jumpSearch(root, state, -1);
  root.querySelector('[data-act="next"]').onclick = () => jumpSearch(root, state, 1);
  render();
}

function highlightActive(body, idx) {
  const marks = body.querySelectorAll("mark.hl");
  marks.forEach((m, i) => m.classList.toggle("active", i === idx));
  if (marks[idx] && marks[idx].scrollIntoView) marks[idx].scrollIntoView({ block: "center" });
}

function jumpSearch(root, state, delta) {
  if (!state.marks || !state.marks.length) return;
  state.active = (state.active + delta + state.marks.length) % state.marks.length;
  highlightActive(root.querySelector('[data-role="body"]'), state.active);
  root.querySelector('[data-role="searchinfo"]').textContent = `${state.active + 1}/${state.marks.length}`;
}

function collapseSummary(value, depth) {
  depth = depth || 0;
  if (Array.isArray(value)) return `[ ${value.length} 项 ]`;
  if (value && typeof value === "object") {
    if (depth > 0) return "{ … }";
    return Object.keys(value).map((k) => `${k}: ${collapseSummary(value[k], 1)}`).join("\n");
  }
  return JSON.stringify(value);
}

function detailValueText(row, side) {
  const isA = side === "a";
  if (isA ? row.kind === "missing-a" : row.kind === "missing-b") return "缺失";
  if (isA ? row.kind === "missing-b" : row.kind === "missing-a") return "存在";
  if (row.kind === "array-len") return `${(isA ? row.valueA : row.valueB).length} 项`;
  const v = isA ? row.valueA : row.valueB;
  return v === undefined ? "—" : JSON.stringify(v);
}

function toggleDiffDetail(tr, row, nameA, nameB) {
  const tbody = tr.parentElement;
  const next = tr.nextElementSibling;
  if (next && next.classList.contains("diff-detail-row")) {
    next.remove();
    return;
  }
  tbody.querySelectorAll(".diff-detail-row").forEach((r) => r.remove());
  const detail = document.createElement("tr");
  detail.className = "diff-detail-row";
  detail.innerHTML = `
    <td colspan="4">
      <div class="diff-detail">
        <div class="dd-field">字段路径：<code>${escapeHtml(row.path || "(根)")}</code></div>
        <div class="dd-grid">
          <div class="dd-col">
            <div class="dd-env">${escapeHtml(nameA)}</div>
            <div>类型：${escapeHtml(row.typeA || "—")}</div>
            <div>值：${escapeHtml(detailValueText(row, "a"))}</div>
          </div>
          <div class="dd-col">
            <div class="dd-env">${escapeHtml(nameB)}</div>
            <div>类型：${escapeHtml(row.typeB || "—")}</div>
            <div>值：${escapeHtml(detailValueText(row, "b"))}</div>
          </div>
        </div>
        <div class="dd-result">差异类型：<span class="cmp-tag ${row.cls}">${escapeHtml(row.label)}</span></div>
      </div>
    </td>`;
  tr.after(detail);
  highlightFieldInViewers(row.path);
}

function renderDetailDiff(ev, nameA, nameB) {
  const body = $("detailDiffBody");
  if (!ev.ea.ok || !ev.eb.ok) {
    const notes = [
      !ev.ea.ok && `${nameA} 请求失败，无法对比`,
      !ev.eb.ok && `${nameB} 请求失败，无法对比`,
    ].filter(Boolean);
    body.innerHTML = `<div class="compare-note">${escapeHtml(notes.join("；"))}</div>`;
    return;
  }
  if (!ev.diff.length) {
    body.innerHTML = `<div class="compare-note">✓ 两个环境的响应字段类型与结构完全一致</div>`;
    return;
  }
  body.innerHTML = diffTableHtml(ev.diff, nameA, nameB);
  body.querySelectorAll("tbody tr").forEach((tr) => {
    tr.classList.add("diff-row");
    tr.onclick = () => toggleDiffDetail(tr, ev.diff[+tr.dataset.i], nameA, nameB);
  });
}

function highlightFieldInViewers(path) {
  ["detailViewerA", "detailViewerB"].forEach((id) => {
    const root = document.getElementById(id);
    const state = root && root._viewer;
    if (!state) return;
    state.query = path;
    state.active = 0;
    const input = root.querySelector('[data-role="search"]');
    input.value = path;
    const body = root.querySelector('[data-role="body"]');
    const escaped = escapeHtml(state.text);
    const q = escapeHtml(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(q, "gi");
    const marks = [];
    body.innerHTML = escaped.replace(re, (m) => {
      marks.push(m);
      return `<mark class="hl">${m}</mark>`;
    });
    state.marks = marks;
    root.querySelector('[data-role="searchinfo"]').textContent = marks.length ? `1/${marks.length}` : "无匹配";
    highlightActive(body, 0);
  });
}

// ---------------- history ----------------

function pushHistory(entry) {
  entry.time = new Date().toLocaleString();
  history.unshift(entry);
  history = history.slice(0, 30);
  localStorage.setItem("apitest_history", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  const el = $("historyList");
  if (!history.length) {
    el.innerHTML = `<div class="history-empty">还没有测试记录</div>`;
    return;
  }
  el.innerHTML = history
    .map(
      (h, idx) => `
    <div class="history-item" data-idx="${idx}">
      <div class="history-left">
        <span class="history-name">${escapeHtml(h.iface)}</span>
        <span class="history-time">${escapeHtml(h.env)}</span>
      </div>
      <span class="history-time">${escapeHtml(h.time)}</span>
    </div>`
    )
    .join("");
  el.querySelectorAll(".history-item").forEach((item) => {
    item.onclick = () => {
      const h = history[item.dataset.idx];
      if (h.mode === "single") {
        $("bodyEditor").value = JSON.stringify(h.body, null, 2);
        showSingleResponse(`${h.iface} — ${h.env}`, h.result);
      } else {
        $("bodyEditorA").value = JSON.stringify(h.body_a || h.body, null, 2);
        $("bodyEditorB").value = JSON.stringify(h.body_b || h.body, null, 2);
        showCompareResponses({ name: "环境 A" }, { name: "环境 B" }, h.result);
      }
    };
  });
}

$("clearHistoryBtn").onclick = () => {
  history = [];
  localStorage.removeItem("apitest_history");
  renderHistory();
};

// ---------------- modals: environment ----------------

function openEnvModal(env) {
  const isNew = !env;
  env = env || { name: "", base_url: "", customer: "", api_key: "", auth_seq: "" };
  $("modalBody").innerHTML = `
    <h3>${isNew ? "新增环境" : "编辑环境"}</h3>
    <div class="field"><label>名称</label><input id="m_name" value="${attr(env.name)}"></div>
    <div class="field"><label>Base URL（如 http://172.16.10.151）</label><input id="m_base_url" value="${attr(env.base_url)}"></div>
    <div class="field"><label>customer</label><input id="m_customer" value="${attr(env.customer)}"></div>
    <div class="field"><label>api_key</label><input id="m_api_key" value="${attr(env.api_key)}"></div>
    <div class="field"><label>auth_seq</label><input id="m_auth_seq" value="${attr(env.auth_seq)}"></div>
    <div class="modal-actions">
      <button class="btn-cancel" id="m_cancel">取消</button>
      <button class="btn-primary" id="m_save">保存</button>
    </div>`;
  showModal();
  $("m_cancel").onclick = hideModal;
  $("m_save").onclick = async () => {
    const payload = {
      id: env.id,
      name: $("m_name").value.trim(),
      base_url: $("m_base_url").value.trim(),
      customer: $("m_customer").value.trim(),
      api_key: $("m_api_key").value.trim(),
      auth_seq: $("m_auth_seq").value.trim(),
    };
    if (!payload.name || !payload.base_url) return;
    await api("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    hideModal();
    loadAll();
  };
}

// ---------------- modals: interface ----------------

function openIfaceModal(iface) {
  const isNew = !iface;
  iface = iface || { name: "", path: "", body_template: {} };
  $("modalBody").innerHTML = `
    <h3>${isNew ? "新增接口预设" : "编辑接口预设"}</h3>
    <div class="field"><label>名称</label><input id="m_name" value="${attr(iface.name)}"></div>
    <div class="field"><label>接口路径（如 /openapi/V2.0.6/xxx）</label><input id="m_path" value="${attr(iface.path)}"></div>
    <div class="field"><label>request 默认模板（JSON）</label><textarea id="m_body">${attr(JSON.stringify(iface.body_template, null, 2))}</textarea></div>
    <div class="field"><label>request B 模板（JSON，可选；双环境对比时给环境 B 用，留空则跟随 request）</label><textarea id="m_body_b">${attr(iface.body_template_b ? JSON.stringify(iface.body_template_b, null, 2) : "")}</textarea></div>
    <div class="modal-actions">
      <button class="btn-cancel" id="m_cancel">取消</button>
      <button class="btn-primary" id="m_save">保存</button>
    </div>`;
  showModal();
  $("m_cancel").onclick = hideModal;
  $("m_save").onclick = async () => {
    let bodyTemplate;
    try {
      bodyTemplate = JSON.parse($("m_body").value);
    } catch (e) {
      alert("JSON 格式错误：" + e.message);
      return;
    }
    let bodyTemplateB = null;
    const bodyBText = $("m_body_b").value.trim();
    if (bodyBText) {
      try {
        bodyTemplateB = JSON.parse(bodyBText);
      } catch (e) {
        alert("request B JSON 格式错误：" + e.message);
        return;
      }
    }
    const payload = {
      id: iface.id,
      name: $("m_name").value.trim(),
      path: $("m_path").value.trim(),
      body_template: bodyTemplate,
    };
    if (bodyTemplateB !== null) payload.body_template_b = bodyTemplateB;
    if (!payload.name || !payload.path) return;
    await api("/api/interfaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    hideModal();
    await loadAll();
    selectIface(payload.id);
  };
}

$("addEnvBtn").onclick = () => openEnvModal(null);
$("addIfaceBtn").onclick = () => openIfaceModal(null);

function showModal() {
  $("modalOverlay").classList.add("open");
}
function hideModal() {
  $("modalOverlay").classList.remove("open");
}
$("modalOverlay").addEventListener("click", (e) => {
  if (e.target === $("modalOverlay")) hideModal();
});

// ---------------- user drawer (账号设置) ----------------

$("avatarBtn").onclick = () => openDrawer();
$("drawerCloseBtn").onclick = closeDrawer;
$("drawerOverlay").addEventListener("click", closeDrawer);

function openDrawer() {
  $("drawerOverlay").classList.add("open");
  $("userDrawer").classList.add("open");
}

function closeDrawer() {
  $("drawerOverlay").classList.remove("open");
  $("userDrawer").classList.remove("open");
}

$("drawerSaveBtn").onclick = async () => {
  const hint = $("drawerHint");
  hint.textContent = "";
  hint.style.color = "";
  const newPassword = $("drawerPassword").value;
  if (!newPassword) {
    hint.textContent = "密码不能为空";
    return;
  }
  try {
    const res = await api("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (res.ok) {
      hint.style.color = "var(--good)";
      hint.textContent = "已保存，下次登录请使用新密码";
    } else {
      hint.textContent = res.error || "保存失败";
    }
  } catch (e) {
    hint.textContent = "保存失败：" + e.message;
  }
};

// ---------------- avatar (修改头像) ----------------

$("changeAvatarBtn").onclick = () => $("avatarFileInput").click();

$("avatarFileInput").addEventListener("change", async () => {
  const hint = $("drawerHint");
  hint.textContent = "";
  hint.style.color = "";
  const file = $("avatarFileInput").files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    hint.textContent = "请选择图片文件";
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    hint.textContent = "图片不能超过 2MB";
    return;
  }
  try {
    const fd = new FormData();
    fd.append("avatar", file);
    const res = await api("/api/me/avatar", { method: "POST", body: fd });
    if (res.ok) {
      const user = await api("/api/me");
      applyAvatar(user);
      hint.style.color = "var(--good)";
      hint.textContent = "头像已更新";
    } else {
      hint.textContent = res.error || "上传失败";
    }
  } catch (e) {
    hint.textContent = "上传失败：" + e.message;
  } finally {
    $("avatarFileInput").value = "";
  }
});

// ---------------- utils ----------------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
function attr(str) {
  return escapeHtml(str);
}

loadAll().then(restoreCompareConfig);
