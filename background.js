import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm";

const NS = "com.fatecore.dice";
const MODAL_ID = NS + "/screen-roll";
const BASE = new URL(".", location.href).href;
const seen = new Map(); // roll id -> ผลเต๋าล่าสุด (กัน Invoke ทำให้เต๋ากลิ้งซ้ำ)
let timer;

OBR.onReady(() => {
  OBR.broadcast.onMessage(NS + "/roll", async ev => {
    const r = ev.data;
    const key = r.dice.join();
    if (seen.get(r.id) === key) return;
    seen.set(r.id, key);
    if (seen.size > 100) seen.delete(seen.keys().next().value);

    try { if (localStorage.getItem(NS + "/screen") === "0") return; } catch (e) {}

    const q = new URLSearchParams({ d: key, t: r.total, n: r.who || "", c: r.color || "" });
    clearTimeout(timer);
    try {
      await OBR.modal.close(MODAL_ID);
      await OBR.modal.open({
        id: MODAL_ID,
        url: BASE + "dice.html?" + q,
        fullScreen: true,
        hideBackdrop: true,
        hidePaper: true,
        disablePointerEvents: true,
      });
      timer = setTimeout(() => OBR.modal.close(MODAL_ID), 6500);
    } catch (e) { console.error("dice overlay", e); }
  });
});
