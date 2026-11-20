import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const NS = "com.fatecore.dice";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sgn = n => (n >= 0 ? "+" : "") + n;
const LADDER = { 8: "Legendary", 7: "Epic", 6: "Fantastic", 5: "Superb", 4: "Great", 3: "Good", 2: "Fair", 1: "Average", 0: "Mediocre", "-1": "Poor", "-2": "Terrible" };
const ladName = n => LADDER[n] ?? (n > 8 ? "Beyond Legendary" : "Abysmal");
const DIST = [1, 4, 10, 16, 19, 16, 10, 4, 1]; // 4dF: ผลรวม -4..+4 จากทั้งหมด 81

const ACT = {
  overcome: { name: "Overcome", th: "ฝ่าอุปสรรค" },
  advantage: { name: "Create Advantage", th: "สร้างความได้เปรียบ" },
  attack: { name: "Attack", th: "โจมตี" },
  defend: { name: "Defend", th: "ป้องกัน" },
  free: { name: "อื่น ๆ", th: "ทอดอิสระ" },
};
const OUT = {
  overcome: { fail: "ล้มเหลว (หรือสำเร็จโดยแลกต้นทุนหนัก)", tie: "สำเร็จ แต่มีต้นทุนเล็กน้อย", success: "สำเร็จ", style: "สำเร็จอย่างโดดเด่น ได้ boost เพิ่ม" },
  advantage: { fail: "ล้มเหลว (หรือได้ aspect แต่ศัตรูใช้ฟรี 1 ครั้ง)", tie: "ได้ boost (ใช้ฟรี 1 ครั้ง)", success: "ได้ aspect ใช้ฟรี 1 ครั้ง", style: "ได้ aspect ใช้ฟรี 2 ครั้ง" },
  attack: { fail: "พลาด", tie: "ไม่โดน แต่ได้ boost", success: "โดน! stress = shifts", style: "โดน! stress = shifts (ลด 1 เพื่อรับ boost ได้)" },
  defend: { fail: "ป้องกันไม่สำเร็จ", tie: "ฝ่ายตรงข้ามได้ผลระดับเสมอ", success: "ป้องกันสำเร็จ", style: "ป้องกันสำเร็จ + ได้ boost" },
  free: { fail: "ต่ำกว่าเป้า", tie: "เท่าเป้า", success: "สูงกว่าเป้า", style: "สูงกว่าเป้า 3+" },
};

let me = { id: "", name: "", color: "#888", role: "PLAYER" };
let party = [];
let history = [];
let mine = null;
let sheet = { fp: 3, refresh: 3, hc: "", trouble: "", aspects: "", phys: [0, 0], ment: [0, 0], cons: { mild: "", mod: "", sev: "" } };
let dmode = "3d";
try { dmode = localStorage.getItem(NS + "/dmode") || "3d"; } catch (e) {}
const st = { action: "overcome", skill: 2, label: "", opp: "2", free: 0, paid: 0, mods: [] };

/* ---------- ลูกเต๋า ---------- */
const rnd = n => Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296) * n);
const rollDice = () => Array.from({ length: 4 }, () => rnd(3) - 1);
const modSum = () => st.mods.filter(m => m.on).reduce((a, m) => a + m.v, 0);
const pct = need => Math.round((DIST.reduce((a, v, i) => a + (i - 4 >= need ? v : 0), 0) / 81) * 100);

function calc(r) {
  r.sum = r.dice.reduce((a, b) => a + b, 0);
  r.total = r.sum + r.skill + r.mods.reduce((a, m) => a + m.v, 0) + 2 * (r.free + r.paid);
  if (r.opp != null) {
    r.shifts = r.total - r.opp;
    r.res = r.shifts < 0 ? "fail" : r.shifts === 0 ? "tie" : r.shifts < 3 ? "success" : "style";
  }
  return r;
}
const send = r => OBR.broadcast.sendMessage(NS + "/roll", calc(r), { destination: "ALL" });
const err = m => OBR.notification.show(m, "ERROR");

/* ---------- Sheet (เก็บใน player metadata) ---------- */
let tm;
function saveSheet() {
  clearTimeout(tm);
  tm = setTimeout(() => OBR.player.setMetadata({ [NS + "/sheet"]: sheet }), 250);
  renderParty();
}
function spendFp(n) {
  if (n > sheet.fp) { err(`Fate Point ไม่พอ (มี ${sheet.fp})`); return false; }
  sheet.fp -= n; saveSheet();
  const el = $("#fpn"); if (el) el.textContent = sheet.fp;
  return true;
}

/* ---------- แท็บทอด ---------- */
function buildRoll() {
  const skills = []; for (let n = 8; n >= -2; n--) skills.push(`<option value="${n}" ${n === 2 ? "selected" : ""}>${sgn(n)} ${ladName(n)}</option>`);
  $("#roll").innerHTML = `
  <label>เต๋าบนหน้าจอ (เห็นเมื่อมีคนทอด)</label>
  <select id="scr"><option value="1">เปิด</option><option value="0">ปิด</option></select>
  <label>รูปแบบลูกเต๋าในแผงนี้</label>
  <select id="dmode"><option value="2d">2D (แบน)</option><option value="3d">3D (ลูกบาศก์)</option></select>
  <label>แอ็กชัน</label>
  <select id="act">${Object.entries(ACT).map(([k, v]) => `<option value="${k}">${v.name} (${v.th})</option>`).join("")}</select>
  <div class="row">
    <div><label>ข้อความ / ชื่อทักษะ</label><input id="lbl" placeholder="เช่น Fight, Notice"></div>
    <div class="fix" style="width:150px"><label>ระดับทักษะ</label><select id="skill">${skills.join("")}</select></div>
  </div>
  <div class="row">
    <div><label>Opposition (ว่าง = ไม่เทียบ)</label><input id="opp" type="number" value="2"></div>
    <div><label>Invoke ฟรี (+2)</label><input id="free" type="number" min="0" value="0"></div>
    <div><label>Invoke ใช้ FP (+2)</label><input id="paid" type="number" min="0" value="0"></div>
  </div>
  <label>Modifier</label>
  <div class="row">
    <input id="mn" placeholder="ชื่อ เช่น ได้เปรียบ, ของดี">
    <input id="mv" class="fix" style="width:70px" type="number" value="1">
    <button class="btn fix" id="madd">เพิ่ม</button>
  </div>
  <div class="chips">${[-2, -1, 1, 2].map(v => `<span class="chip ${v > 0 ? "p" : "m"}" data-q="${v}">${sgn(v)}</span>`).join("")}<span class="chip" data-clear="1">ล้างทั้งหมด</span></div>
  <div class="chips" id="mchips"></div>
  <div class="odds" id="odds"></div>
  <button class="btn big" id="go">ทอด 4dF</button>
  <div id="last" style="margin-top:14px"></div>`;
  $("#dmode").value = dmode; try { $("#scr").value = localStorage.getItem(NS + "/screen") === "0" ? "0" : "1"; } catch (e) {} chips(); odds(); renderLast();
}
function chips() {
  $("#mchips").innerHTML = st.mods.map((m, i) => `<span class="chip ${m.v >= 0 ? "p" : "m"} ${m.on ? "" : "off"}" data-i="${i}">${esc(m.n)} ${sgn(m.v)}<i data-x="${i}">✕</i></span>`).join("");
  odds();
}
function odds() {
  const el = $("#odds"); if (!el) return;
  const opp = parseInt(st.opp, 10);
  const base = st.skill + modSum() + 2 * ((+st.free || 0) + (+st.paid || 0));
  let t = `ค่ารวมก่อนทอด ${sgn(base)}`;
  if (!isNaN(opp)) t += ` · ทอดให้ได้ ≥${opp - base} จะเสมอ (${pct(opp - base)}%) · ชนะ (${pct(opp - base + 1)}%) · สไตล์ (${pct(opp - base + 3)}%)`;
  el.textContent = t;
}
function doRoll() {
  const free = Math.max(0, +st.free || 0), paid = Math.max(0, +st.paid || 0);
  if (!spendFp(paid)) return;
  const opp = parseInt(st.opp, 10);
  const r = { id: crypto.randomUUID(), pid: me.id, who: me.name, color: me.color, label: st.label, action: st.action, skill: st.skill,
    mods: st.mods.filter(m => m.on).map(({ n, v }) => ({ n, v })), free, paid, rr: 0, dice: rollDice(), opp: isNaN(opp) ? null : opp };
  st.free = st.paid = 0; $("#free").value = 0; $("#paid").value = 0; odds();
  send(r);
}
function post(kind) {
  if (!mine) return;
  const r = structuredClone(mine);
  if (kind === "invFree") r.free++;
  if (kind === "invFp") { if (!spendFp(1)) return; r.paid++; }
  if (kind === "rrFree") { r.dice = rollDice(); r.rr++; }
  if (kind === "rrFp") { if (!spendFp(1)) return; r.dice = rollDice(); r.rr++; }
  send(r);
}

/* ---------- ลูกเต๋า 2D / 3D ---------- */
const FACE_OF = { 1: ["front", "top"], "-1": ["back", "bottom"], 0: ["right", "left"] };
const SHOW = { front: [0, 0], back: [0, -180], right: [0, -90], left: [0, 90], top: [-90, 0], bottom: [90, 0] };
const FACE_T = { front: "rotateY(0deg)", back: "rotateY(180deg)", right: "rotateY(90deg)", left: "rotateY(-90deg)", top: "rotateX(90deg)", bottom: "rotateX(-90deg)" };
const SYM = d => (d > 0 ? "+" : d < 0 ? "−" : "○");
const CLS = d => (d > 0 ? "p" : d < 0 ? "m" : "z");
function die(d, anim) {
  if (dmode !== "3d") return `<div class="die ${CLS(d)} ${anim ? "spin" : ""}">${SYM(d)}</div>`;
  const pick = FACE_OF[d][rnd(2)];
  const [x, y] = SHOW[pick];
  const faces = Object.entries(FACE_OF).flatMap(([v, names]) => names.map(n => `<div class="face ${CLS(+v)}" style="transform:${FACE_T[n]} translateZ(22px)">${SYM(+v)}</div>`)).join("");
  return `<div class="scene"><div class="tilt"><div class="cube" data-x="${x}" data-y="${y}" data-a="${anim ? 1 : 0}" style="transform:rotateX(${x}deg) rotateY(${y}deg)">${faces}</div></div></div>`;
}
function animate3d() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll('.cube[data-a="1"]').forEach(c => {
    const x = +c.dataset.x, y = +c.dataset.y;
    c.dataset.a = "0";
    c.style.transition = "none";
    c.style.transform = `rotateX(${x - 360 * (2 + rnd(2))}deg) rotateY(${y - 360 * (2 + rnd(2))}deg)`;
    c.getBoundingClientRect();
    c.style.transition = `transform ${0.8 + rnd(5) / 10}s cubic-bezier(.15,.7,.2,1)`;
    c.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
  });
}

/* ---------- การ์ดผลทอด ---------- */
function card(r, acts, anim) {
  const dice = r.dice.map(d => die(d, anim)).join("");
  const parts = [`${esc(r.label) || ACT[r.action].name} ${sgn(r.skill)} ${ladName(r.skill)}`, ...r.mods.map(m => `${esc(m.n)} ${sgn(m.v)}`)];
  if (r.free + r.paid) parts.push(`invoke ×${r.free + r.paid} +${2 * (r.free + r.paid)}`);
  const res = r.res ? `<div class="${r.res === "fail" ? "bad" : "good"}"><b>${sgn(r.shifts)} shifts</b> — ${OUT[r.action][r.res]}</div>` : "";
  return `<div class="card">
    <div class="who"><span><span class="dot" style="background:${esc(r.color)}"></span><b>${esc(r.who)}</b> <span class="mu">${ACT[r.action].name}</span></span>
    <span class="mu">${r.opp != null ? "vs " + sgn(r.opp) : ""}${r.rr ? " · reroll ×" + r.rr : ""}</span></div>
    <div class="dice">${dice}<div style="flex:1"></div><div class="tot">${sgn(r.total)}</div></div>
    <div class="mu">${parts.join(" · ")} = ${sgn(r.total)} ${ladName(r.total)}</div>${res}
    ${acts ? `<div class="acts"><button class="btn sm" data-p="invFree">+2 Invoke ฟรี</button><button class="btn sm" data-p="invFp">+2 Invoke <span class="fp">(FP)</span></button><button class="btn sm" data-p="rrFree">Reroll ฟรี</button><button class="btn sm" data-p="rrFp">Reroll <span class="fp">(FP)</span></button></div>` : ""}</div>`;
}
function renderLast(anim) { const el = $("#last"); if (el) el.innerHTML = mine ? card(mine, true, anim) : `<div class="mu">ยังไม่ได้ทอด</div>`; animate3d(); }
function renderLog(animId) { $("#log").innerHTML = history.length ? history.map(r => card(r, false, r.id === animId)).join("") : `<div class="mu">ยังไม่มีการทอดในห้องนี้ (ประวัติเริ่มนับเมื่อคุณเปิด extension)</div>`; animate3d(); }

function onRoll(r) {
  const prev = history.find(x => x.id === r.id);
  const isNew = !prev;
  const rolled = !prev || prev.dice.join() !== r.dice.join();
  history = [r, ...history.filter(x => x.id !== r.id)].slice(0, 50);
  if (r.pid === me.id) mine = r;
  renderLast(rolled && r.pid === me.id); renderLog(rolled ? r.id : null);
  const s = r.dice.map(d => (d > 0 ? "+" : d < 0 ? "−" : "○")).join(" ");
  OBR.notification.show(`${r.who}: [${s}] = ${sgn(r.total)} ${ladName(r.total)}${r.res ? ` · ${sgn(r.shifts)} shifts` : ""}${isNew ? "" : " (อัปเดต)"}`, r.res === "fail" ? "WARNING" : r.res ? "SUCCESS" : "DEFAULT");
}

/* ---------- แท็บตัวละคร ---------- */
const boxes = (arr, k, ro) => `<div class="boxes">${arr.map((b, i) => `<button class="box ${b ? "x" : ""}" ${ro ? "disabled" : `data-st="${k}" data-i="${i}"`}></button>`).join("")}${ro ? "" : `<button class="btn sm" data-sz="${k}" data-d="1">+</button><button class="btn sm" data-sz="${k}" data-d="-1">−</button>`}</div>`;
function renderSheet() {
  const s = sheet;
  $("#sheet").innerHTML = `
  <div class="card"><div class="who"><div><b>Fate Points</b><div class="mu">เริ่มเซสชัน: Refresh</div></div>
    <div class="row fix" style="align-items:center"><button class="btn sm" data-fp="-1">−</button><div class="fpn" id="fpn">${s.fp}</div><button class="btn sm" data-fp="1">+</button></div></div>
    <div class="row" style="margin-top:8px"><button class="btn" id="rf">Refresh (→ ${Math.max(s.refresh, s.fp)})</button>
    <div class="fix" style="width:90px"><input data-k="refresh" type="number" min="0" value="${s.refresh}" title="ค่า Refresh"></div></div></div>
  <h3>Aspects</h3>
  <input data-k="hc" placeholder="High Concept" value="${esc(s.hc)}" style="margin-bottom:6px">
  <input data-k="trouble" placeholder="Trouble" value="${esc(s.trouble)}" style="margin-bottom:6px">
  <textarea data-k="aspects" placeholder="Aspects อื่น ๆ (บรรทัดละอัน)">${esc(s.aspects)}</textarea>
  <h3>Physical Stress</h3>${boxes(s.phys, "phys")}
  <h3>Mental Stress</h3>${boxes(s.ment, "ment")}
  <div style="margin-top:8px"><button class="btn sm" id="clr">ล้าง Stress (จบฉาก)</button></div>
  <h3>Consequences</h3>
  <input data-k="cons.mild" placeholder="Mild (−2)" value="${esc(s.cons.mild)}" style="margin-bottom:6px">
  <input data-k="cons.mod" placeholder="Moderate (−4)" value="${esc(s.cons.mod)}" style="margin-bottom:6px">
  <input data-k="cons.sev" placeholder="Severe (−6)" value="${esc(s.cons.sev)}">`;
}

/* ---------- แท็บปาร์ตี้ ---------- */
function renderParty() {
  const el = $("#party"); if (!el) return;
  const list = [{ id: me.id, name: me.name + " (คุณ)", color: me.color, s: sheet }, ...party.map(p => ({ id: p.id, name: p.name, color: p.color, s: p.metadata?.[NS + "/sheet"] }))];
  el.innerHTML = list.map(p => {
    const s = p.s; if (!s) return `<div class="card"><span class="dot" style="background:${esc(p.color)}"></span><b>${esc(p.name)}</b> <span class="mu">ยังไม่มีข้อมูล</span></div>`;
    const cons = [s.cons?.mild && "Mild: " + s.cons.mild, s.cons?.mod && "Moderate: " + s.cons.mod, s.cons?.sev && "Severe: " + s.cons.sev].filter(Boolean);
    const gm = me.role === "GM" && p.id !== me.id ? `<button class="btn sm" data-g="${p.id}" data-d="-1">−FP</button> <button class="btn sm" data-g="${p.id}" data-d="1">+FP</button>` : "";
    return `<div class="card"><div class="who"><span><span class="dot" style="background:${esc(p.color)}"></span><b>${esc(p.name)}</b></span><span><span class="fp"><b>${s.fp}</b> FP</span> ${gm}</span></div>
      ${s.hc ? `<div class="mu">${esc(s.hc)}${s.trouble ? " · " + esc(s.trouble) : ""}</div>` : ""}
      <div class="mu" style="margin-top:6px">Physical</div>${boxes(s.phys || [], "", true)}
      <div class="mu" style="margin-top:6px">Mental</div>${boxes(s.ment || [], "", true)}
      ${cons.length ? `<div class="mu" style="margin-top:6px">${cons.map(esc).join("<br>")}</div>` : ""}</div>`;
  }).join("");
}

/* ---------- Event ---------- */
function bind() {
  document.querySelectorAll("nav button").forEach(b => b.onclick = () => {
    document.querySelectorAll("nav button, section").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); $("#" + b.dataset.t).classList.add("on");
    if (b.dataset.t === "sheet") renderSheet();
    if (b.dataset.t === "party") renderParty();
  });

  const roll = $("#roll");
  roll.addEventListener("input", e => {
    const id = e.target.id; if (!id) return;
    if (id === "act") st.action = e.target.value;
    if (id === "lbl") st.label = e.target.value;
    if (id === "dmode") { dmode = e.target.value; try { localStorage.setItem(NS + "/dmode", dmode); } catch (e2) {} renderLast(); renderLog(); }
    if (id === "skill") st.skill = +e.target.value;
    if (id === "scr") { try { localStorage.setItem(NS + "/screen", e.target.value); } catch (e3) {} }
    if (["opp", "free", "paid"].includes(id)) st[id] = e.target.value;
    odds();
  });
  roll.addEventListener("click", e => {
    const t = e.target;
    if (t.id === "go") return doRoll();
    if (t.id === "madd") { const v = parseInt($("#mv").value, 10); if (!isNaN(v)) { st.mods.push({ n: $("#mn").value.trim() || "modifier", v, on: true }); $("#mn").value = ""; chips(); } return; }
    if (t.dataset.q) { st.mods.push({ n: "modifier", v: +t.dataset.q, on: true }); return chips(); }
    if (t.dataset.clear) { st.mods = []; return chips(); }
    if (t.dataset.x != null) { st.mods.splice(+t.dataset.x, 1); return chips(); }
    const chip = t.closest(".chip[data-i]"); if (chip) { const m = st.mods[+chip.dataset.i]; m.on = !m.on; return chips(); }
    const p = t.closest("[data-p]"); if (p) post(p.dataset.p);
  });

  const sh = $("#sheet");
  sh.addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.fp) { sheet.fp = Math.max(0, sheet.fp + +t.dataset.fp); saveSheet(); $("#fpn").textContent = sheet.fp; $("#rf").textContent = `Refresh (→ ${Math.max(sheet.refresh, sheet.fp)})`; }
    else if (t.id === "rf") { sheet.fp = Math.max(sheet.refresh, sheet.fp); saveSheet(); renderSheet(); }
    else if (t.id === "clr") { sheet.phys = sheet.phys.map(() => 0); sheet.ment = sheet.ment.map(() => 0); saveSheet(); renderSheet(); }
    else if (t.dataset.st) { const a = sheet[t.dataset.st], i = +t.dataset.i; a[i] = a[i] ? 0 : 1; saveSheet(); renderSheet(); }
    else if (t.dataset.sz) { const a = sheet[t.dataset.sz]; if (+t.dataset.d > 0) a.push(0); else if (a.length > 1) a.pop(); saveSheet(); renderSheet(); }
  });
  sh.addEventListener("input", e => {
    const k = e.target.dataset.k; if (!k) return;
    const v = e.target.type === "number" ? Math.max(0, +e.target.value || 0) : e.target.value;
    if (k.includes(".")) { const [a, b] = k.split("."); sheet[a][b] = v; } else sheet[k] = v;
    saveSheet();
  });

  $("#party").addEventListener("click", e => {
    const g = e.target.closest("[data-g]"); if (!g) return;
    OBR.broadcast.sendMessage(NS + "/fp", { to: g.dataset.g, delta: +g.dataset.d }, { destination: "ALL" });
  });
}

/* ---------- เริ่มต้น ---------- */
OBR.onReady(async () => {
  me = { id: await OBR.player.getId(), name: await OBR.player.getName(), color: await OBR.player.getColor(), role: await OBR.player.getRole() };
  const md = await OBR.player.getMetadata();
  const saved = md[NS + "/sheet"]; if (saved) sheet = { ...sheet, ...saved, cons: { ...sheet.cons, ...saved.cons } };
  const theme = th => document.documentElement.classList.toggle("light", th.mode === "LIGHT");
  theme(await OBR.theme.getTheme()); OBR.theme.onChange(theme);

  OBR.broadcast.onMessage(NS + "/roll", ev => onRoll(ev.data));
  OBR.broadcast.onMessage(NS + "/fp", ev => {
    if (ev.data.to !== me.id) return;
    sheet.fp = Math.max(0, sheet.fp + ev.data.delta); saveSheet(); renderSheet();
    OBR.notification.show(`GM ${ev.data.delta > 0 ? "ให้" : "หัก"} Fate Point ${Math.abs(ev.data.delta)} แต้ม (ตอนนี้ ${sheet.fp})`, "INFO");
  });
  OBR.player.onChange(p => { me.name = p.name; me.color = p.color; me.role = p.role; renderParty(); });
  party = await OBR.party.getPlayers();
  OBR.party.onChange(p => { party = p; renderParty(); });

  buildRoll(); renderSheet(); renderLog(); renderParty(); bind();
});
