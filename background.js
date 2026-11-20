import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const NS = "com.fatecore.dice";
const BASE = new URL(".", location.href).href;
const SHOW_MS = 8000;                // เวลาที่หน้าต่างเต๋าค้างอยู่
const DEBUG = true;                  // ตั้งเป็น false เมื่อใช้งานได้แล้ว
const seen = new Map();              // roll id -> ผลเต๋าล่าสุด (กัน Invoke ทำให้เต๋ากลิ้งซ้ำ)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = m => {
  if (!DEBUG) return;
  OBR.notification.show("[debug] " + m, "INFO");
  try { // เก็บล็อกถาวร ให้แผง Fate Dice เปิดอ่านได้
    const a = JSON.parse(localStorage.getItem(NS + "/dbg") || "[]");
    a.push(new Date().toLocaleTimeString() + " " + m);
    localStorage.setItem(NS + "/dbg", JSON.stringify(a.slice(-40)));
  } catch (e) {}
};

let slog = [], stimer = null, noSig = null;
let current = null, timer = null, counter = 0, queue = Promise.resolve();

async function closeCurrent() {
  clearTimeout(timer);
  if (!current) return;
  const old = current; current = null;
  try { await OBR.modal.close(old); } catch (e) { /* ปิดไปแล้ว */ }
  await sleep(300);                  // รอให้หน้าต่างเก่าหายจริงก่อนเปิดอันใหม่
}

async function show(r) {
  try { if (localStorage.getItem(NS + "/screen") === "0") { dbg("เต๋าบนหน้าจอถูกตั้งเป็น ปิด"); return; } } catch (e) {}
  await closeCurrent();
  const id = `${NS}/screen-roll-${++counter}`;   // ID ใหม่ทุกครั้ง
  dbg("กำลังเปิดหน้าต่าง " + id.split("-").pop() + " dice=" + r.dice.join());
  const q = new URLSearchParams({ d: r.dice.join(), t: r.total, n: r.who || "", c: r.color || "" });
  if (DEBUG) q.set("rep", "1");
  try {
    await OBR.modal.open({
      id,
      url: BASE + "dice.html?" + q,
      fullScreen: true,
      hideBackdrop: true,
      hidePaper: true,
      disablePointerEvents: true,
    });
    current = id;
    dbg("เปิดหน้าต่างเต๋าแล้ว");
    if (DEBUG) noSig = setTimeout(() => dbg("หน้าเต๋าไม่ส่งสัญญาณใน 5 วิ"), 5000);
    timer = setTimeout(() => { if (current === id) closeCurrent(); }, SHOW_MS);
  } catch (e) {
    console.error("[Fate Dice] overlay error", e);
    dbg("ERROR เปิดไม่ได้: " + (e?.message || e));
    OBR.notification.show("เต๋าบนหน้าจอเปิดไม่ได้: " + (e?.message || e), "ERROR");
  }
}

OBR.onReady(() => {
  dbg("background ทำงานแล้ว");
  OBR.broadcast.onMessage(NS + "/status", ev => {
    clearTimeout(noSig); slog.push(ev.data.t);
    clearTimeout(stimer); stimer = setTimeout(() => { dbg(slog.join(" | ")); slog = []; }, 900);
  });
  OBR.broadcast.onMessage(NS + "/roll", ev => {
    const r = ev.data, key = r.dice.join();
    dbg("ได้รับผลทอดจาก " + r.who);
    if (seen.get(r.id) === key) return;   // แค่ Invoke ไม่ต้องกลิ้งใหม่
    seen.set(r.id, key);
    if (seen.size > 100) seen.delete(seen.keys().next().value);
    queue = queue.then(() => show(r)).catch(() => {});   // จัดคิว ไม่ให้เปิดชนกัน
  });
});
