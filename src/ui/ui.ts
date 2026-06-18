import { GameState } from "../state/GameState";
import { CROPS, CROP_BY_ID } from "../data/crops";
import { levelProgress } from "../data/levels";
import { CONFIG } from "../config";
import { Sound } from "../audio/sound";
import { QUEST_BY_ID, questText } from "../data/quests";
import type { FarmScene, Mode } from "../scenes/FarmScene";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmtTime(s: number): string {
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
}

/** DOM-based game UI (HUD, toolbar, menus). Native taps = reliable on mobile. */
class UIController {
  private farm?: FarmScene;
  private root!: HTMLElement;
  private coinsEl!: HTMLElement;
  private gemsEl!: HTMLElement;
  private badgeEl!: HTMLElement;
  private levelEl!: HTMLElement;
  private hoeBtn!: HTMLButtonElement;
  private seedsBtn!: HTMLButtonElement;
  private speedChip!: HTMLElement;
  private hintEl!: HTMLElement;
  private hintText!: HTMLElement;
  private backdrop!: HTMLElement;
  private sheet!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer = 0;

  init() {
    this.root = el("div");
    this.root.id = "ui";
    this.root.innerHTML = `
      <div id="hud" class="panel">
        <span class="stat coin"><span>🪙</span><span id="ui-coins">0</span></span>
        <span class="stat gem"><span>💎</span><span id="ui-gems">0</span></span>
        <span class="spacer"></span>
        <div class="badge" id="ui-badge"><div class="inner" id="ui-level">1</div></div>
      </div>
      <div id="chips-left">
        <div class="chip" id="ui-daily">🎁<span class="dot" id="ui-daily-dot"></span></div>
        <div class="chip" id="ui-quests">📋<span class="dot" id="ui-quests-dot"></span></div>
      </div>
      <div id="chips">
        <div class="chip" id="ui-mute">🔊</div>
        <div class="chip" id="ui-speed">1×</div>
        <div class="chip" id="ui-recenter">🎯</div>
      </div>
      <div id="hint"><span id="ui-hint-text"></span><span class="x" id="ui-hint-x">✕</span></div>
      <div id="toolbar">
        <button class="tool" id="ui-hoe"><span class="ico">🪓</span><span class="lbl">Hoe</span></button>
        <button class="tool" id="ui-seeds"><span class="ico">🌱</span><span class="lbl">Seeds</span></button>
        <button class="tool" id="ui-harvest"><span class="ico">🧺</span><span class="lbl">Harvest</span></button>
        <button class="tool" id="ui-shop"><span class="ico">🛒</span><span class="lbl">Shop</span></button>
      </div>
      <div id="backdrop"><div class="sheet" id="ui-sheet"></div></div>
      <div id="celebrate"></div>
      <div id="toast"></div>
    `;
    document.body.appendChild(this.root);

    this.coinsEl = this.byId("ui-coins");
    this.gemsEl = this.byId("ui-gems");
    this.badgeEl = this.byId("ui-badge");
    this.levelEl = this.byId("ui-level");
    this.hoeBtn = this.byId("ui-hoe") as HTMLButtonElement;
    this.seedsBtn = this.byId("ui-seeds") as HTMLButtonElement;
    this.speedChip = this.byId("ui-speed");
    this.hintEl = this.byId("hint");
    this.hintText = this.byId("ui-hint-text");
    this.backdrop = this.byId("backdrop");
    this.sheet = this.byId("ui-sheet");
    this.toastEl = this.byId("toast");

    // Wire controls.
    this.tap(this.hoeBtn, () => this.farm?.setMode(this.farm.mode === "hoe" ? "idle" : "hoe"));
    this.tap(this.seedsBtn, () => this.openSeedPicker());
    this.tap(this.byId("ui-shop"), () => this.openShop());
    this.tap(this.byId("ui-recenter"), () => this.farm?.recenterView());
    this.tap(this.speedChip, () => this.cycleSpeed());
    const muteChip = this.byId("ui-mute");
    muteChip.textContent = Sound.isMuted() ? "🔇" : "🔊";
    muteChip.classList.toggle("on", Sound.isMuted());
    this.tap(muteChip, () => {
      const m = !Sound.isMuted();
      Sound.setMuted(m);
      muteChip.textContent = m ? "🔇" : "🔊";
      muteChip.classList.toggle("on", m);
    });
    this.tap(this.byId("ui-hint-x"), () => this.farm?.setMode("idle"));
    this.tap(this.byId("ui-harvest"), () => this.farm?.harvestAll());
    this.tap(this.byId("ui-daily"), () => this.openDaily());
    this.tap(this.byId("ui-quests"), () => this.openQuests());
    this.tap(this.backdrop, (e) => {
      if (e.target === this.backdrop) this.closeSheet();
    });

    GameState.on("wallet", () => this.refresh(), this);
    GameState.on("xp", () => this.refresh(), this);
    GameState.on("owned", () => { this.refresh(); this.updateBadges(); }, this);
    GameState.on("quests", () => this.updateBadges(), this);
    GameState.on("daily", () => this.updateBadges(), this);
    GameState.on("levelup", (lvl: number, reward: any, unlocked: any[]) => this.onLevelUp(lvl, reward, unlocked), this);

    this.refresh();
  }

  bindFarm(farm: FarmScene) {
    this.farm = farm;
    farm.events.on("mode", (m: Mode, cropId?: string) => this.onMode(m, cropId));
    this.onMode(farm.mode, farm.selectedCropId);
    this.refresh(); // GameState is loaded by now
    this.updateBadges();
    if (GameState.dailyAvailable()) setTimeout(() => this.openDaily(), 700);
  }

  private updateBadges() {
    const dd = this.byId("ui-daily-dot");
    dd.style.display = GameState.dailyAvailable() ? "block" : "none";
    const qd = this.byId("ui-quests-dot");
    qd.style.display = GameState.questsClaimable() > 0 ? "block" : "none";
  }

  private byId(id: string) {
    return this.root.querySelector(`#${id}`) as HTMLElement;
  }

  /** Attach a tap handler that fires immediately on pointerup (snappy). */
  private tap(node: HTMLElement, fn: (e: Event) => void) {
    node.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      Sound.click();
      fn(e);
    });
  }

  // ---- State display -------------------------------------------------
  private refresh() {
    if (!GameState.data) return; // not loaded yet
    this.coinsEl.textContent = GameState.coins.toLocaleString();
    this.gemsEl.textContent = `${GameState.gems}`;
    const p = levelProgress(GameState.xp);
    this.levelEl.textContent = `${p.level}`;
    this.badgeEl.style.setProperty("--p", `${Math.round(p.ratio * 100)}`);
  }

  private onMode(mode: Mode, cropId?: string) {
    this.hoeBtn.classList.toggle("active", mode === "hoe");
    this.seedsBtn.classList.toggle("active", mode === "plant");
    const ico = this.seedsBtn.querySelector(".ico")!;
    ico.textContent = mode === "plant" && cropId ? CROP_BY_ID[cropId].emoji : "🌱";

    if (mode === "hoe") this.showHint("🪓 Tap your grass to till it into soil");
    else if (mode === "plant" && cropId) this.showHint(`🌱 Planting ${CROP_BY_ID[cropId].name} — tap a soil plot`);
    else this.hideHint();
  }

  private showHint(text: string) {
    this.hintText.textContent = text;
    this.hintEl.classList.add("show");
  }
  private hideHint() {
    this.hintEl.classList.remove("show");
  }

  private cycleSpeed() {
    const scales = [1, 60, 600];
    const next = scales[(scales.indexOf(GameState.timeScale) + 1) % scales.length];
    GameState.setTimeScale(next);
    this.speedChip.textContent = `${next}×`;
    this.speedChip.classList.toggle("on", next !== 1);
    this.toast(next === 1 ? "Real-time growth" : `Dev speed: ${next}×`);
  }

  // ---- Sheets --------------------------------------------------------
  isModalOpen() {
    return this.backdrop.classList.contains("show");
  }
  private openSheet(html: string) {
    this.sheet.innerHTML = `<div class="grab"></div>${html}`;
    this.backdrop.classList.add("show");
  }
  closeSheet() {
    this.backdrop.classList.remove("show");
  }

  openSeedPicker() {
    const level = GameState.level;
    const rows = CROPS.map((c) => {
      const unlocked = level >= c.unlockLevel;
      const right = unlocked
        ? `<button class="pick" data-crop="${c.id}">Select</button>`
        : `<span class="lock">🔒 Lvl ${c.unlockLevel}</span>`;
      return `<div class="seed ${unlocked ? "" : "locked"}">
        <span class="emoji">${c.emoji}</span>
        <span class="meta">
          <div class="name">${c.name}</div>
          <div class="sub">⏱ ${fmtTime(c.growSeconds)} · 🪙 ${c.seedCost} → ${c.sellPrice}</div>
        </span>${right}
      </div>`;
    }).join("");
    this.openSheet(`<h2>Choose a seed</h2>${rows}`);
    this.sheet.querySelectorAll<HTMLButtonElement>(".pick").forEach((btn) => {
      this.tap(btn, () => {
        this.farm?.setMode("plant", btn.dataset.crop);
        this.closeSheet();
      });
    });
  }

  promptBuy(cx: number, cy: number) {
    const cost = GameState.plotCost();
    const can = GameState.canAfford(cost);
    this.openSheet(`
      <h2>Buy this plot</h2>
      <p>Claim a ${CONFIG.chunkSize}×${CONFIG.chunkSize} patch of land to farm.</p>
      <button class="bigbtn" id="ui-buy" ${can ? "" : "disabled"}>
        ${can ? `Buy plot · 🪙 ${cost.toLocaleString()}` : `Need 🪙 ${cost.toLocaleString()}`}
      </button>
    `);
    const btn = this.byId("ui-buy");
    if (can) {
      this.tap(btn, () => {
        if (GameState.buyChunk(cx, cy)) {
          this.closeSheet();
          this.toast("🎉 New land claimed!");
          Sound.buy();
        }
      });
    }
  }

  openQuests() {
    const rewardStr = (rw: { coins?: number; gems?: number; xp?: number }) =>
      [rw.coins ? `🪙${rw.coins}` : "", rw.gems ? `💎${rw.gems}` : "", rw.xp ? `✨${rw.xp}` : ""].filter(Boolean).join("  ");
    const rows = GameState.data.quests
      .map((q, i) => {
        const def = QUEST_BY_ID[q.defId];
        if (!def) return "";
        const done = GameState.questDone(q);
        const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
        const right = done
          ? `<button class="pick" data-q="${i}">Claim</button>`
          : `<span class="qreward">${rewardStr(def.reward)}</span>`;
        return `<div class="quest ${done ? "done" : ""}">
          <span class="emoji">${def.icon}</span>
          <span class="meta">
            <div class="name">${questText(q)}</div>
            <div class="qbar"><div class="qfill" style="width:${pct}%"></div></div>
            <div class="sub">${q.progress} / ${q.target}</div>
          </span>${right}
        </div>`;
      })
      .join("");
    this.openSheet(`<h2>Goals</h2>${rows}`);
    this.sheet.querySelectorAll<HTMLElement>(".pick").forEach((btn) =>
      this.tap(btn, () => {
        const i = parseInt(btn.dataset.q || "-1", 10);
        if (GameState.claimQuest(i)) {
          Sound.buy();
          this.updateBadges();
          this.openQuests();
        }
      })
    );
  }

  openDaily() {
    const avail = GameState.dailyAvailable();
    let day = 1;
    if (avail) {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yKey = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
      const sAfter = GameState.data.daily.last === yKey ? GameState.data.daily.streak + 1 : 1;
      day = ((sAfter - 1) % 7) + 1;
    }
    const coins = 40 + day * 30;
    const gems = day === 7 ? 3 : 0;
    const strip = [1, 2, 3, 4, 5, 6, 7]
      .map((d) => `<div class="daybox ${avail && d === day ? "cur" : ""}">D${d}<br>${d === 7 ? "💎" : "🪙"}</div>`)
      .join("");
    const rewardStr = `🪙${coins}${gems ? `  💎${gems}` : ""}`;
    this.openSheet(`
      <h2>Daily Reward</h2>
      <p>Come back every day — the streak pays off!</p>
      <div class="daystrip">${strip}</div>
      <button class="bigbtn" id="ui-claim-daily" ${avail ? "" : "disabled"}>
        ${avail ? `Claim ${rewardStr}` : "Already claimed — see you tomorrow!"}
      </button>
    `);
    if (avail) {
      this.tap(this.byId("ui-claim-daily"), () => {
        const r = GameState.claimDaily();
        if (r) {
          Sound.buy();
          this.closeSheet();
          this.celebrate("🎁 Daily Reward!", `+${r.coins}🪙${r.gems ? `  +${r.gems}💎` : ""}  ·  Day ${r.day}`);
          this.updateBadges();
        }
      });
    }
  }

  private onLevelUp(lvl: number, reward: { coins: number; gems: number }, unlocked: { name: string; emoji: string }[]) {
    Sound.levelUp();
    this.celebrate(`⭐ Level ${lvl}!`, `+${reward.coins}🪙${reward.gems ? `  +${reward.gems}💎` : ""}`);
    if (unlocked && unlocked.length) {
      setTimeout(() => this.celebrate(`${unlocked[0].emoji} ${unlocked[0].name} unlocked!`, "New seed available in Seeds"), 1750);
    }
  }

  private celebrate(title: string, sub: string) {
    const el = this.byId("celebrate");
    el.innerHTML = `<div class="cel-card"><div class="cel-title">${title}</div><div class="cel-sub">${sub}</div></div>`;
    el.classList.remove("show");
    void el.offsetWidth; // restart animation
    el.classList.add("show");
    clearTimeout((this as any)._celTimer);
    (this as any)._celTimer = window.setTimeout(() => el.classList.remove("show"), 1700);
  }

  openShop() {
    this.openSheet(`
      <h2>Shop</h2>
      <p>🪓 Hoe grass into soil, 🌱 plant seeds,<br>then tap ripe crops to harvest.<br><br>
      Tap a glowing plot at the edge of your<br>farm to buy more land!<br><br>
      💎 Premium shop coming soon.</p>
    `);
  }

  // ---- Toast ---------------------------------------------------------
  toast(message: string) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("show"), 1500);
  }
}

export const UI = new UIController();
