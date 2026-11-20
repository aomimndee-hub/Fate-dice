import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const NS = "com.fatecore.dice";
const BASE = new URL(".", location.href).href;
const SHOW_MS = 6500;                // เวลาที่หน้าต่างเต๋าค้างอยู่
const DEBUG = false;                 // ตั้งเป็น true เพื่อดูแถบ debug
const seen = new Map();              // roll id -> ผลเต๋าล่าสุด (กัน Invoke ทำให้เต๋ากลิ้งซ้ำ)
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dbg = m => { if (DEBUG) OBR.notification.show("[debug] " + m, "INFO"); };

let current = null, timer = null, counter = 0, queue = Promise.resolve();

async function closeCurrent() {
  clearTimeout(timer);
  if (!current) return;
  const old = current; current = null;
  try { await OBR.modal.close(old); } catch (e) { /* ปิดไปแล้ว */ }
  await sleep(300);                  // รอให้หน้าต่างเก่าหายจริงก่อนเปิดอันใหม่
}

async function show(r) {
  try { if (localStorage.getItem(NS + "/screen") === "0") return; } catch (e) {}
  await closeCurrent();
  const id = `${NS}/screen-roll-${++counter}`;   // ID ใหม่ทุกครั้ง
  const q = new URLSearchParams({ d: r.dice.join(), t: r.total, n: r.who || "", c: r.color || "" });
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
    timer = setTimeout(() => { if (current === id) closeCurrent(); }, SHOW_MS);
  } catch (e) {
    console.error("[Fate Dice] overlay error", e);
    OBR.notification.show("เต๋าบนหน้าจอเปิดไม่ได้: " + (e?.message || e), "ERROR");
  }
}

OBR.onReady(() => {
  dbg("background ทำงานแล้ว");
  OBR.broadcast.onMessage(NS + "/roll", ev => {
    const r = ev.data, key = r.dice.join();
    if (seen.get(r.id) === key) return;   // แค่ Invoke ไม่ต้องกลิ้งใหม่
    seen.set(r.id, key);
    if (seen.size > 100) seen.delete(seen.keys().next().value);
    queue = queue.then(() => show(r)).catch(() => {});   // จัดคิว ไม่ให้เปิดชนกัน
  });
});
