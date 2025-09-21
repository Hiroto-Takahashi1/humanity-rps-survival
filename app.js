// ===== FX engine (confetti & ripple) =====
const FX = (() => {
	const c = document.getElementById("fx");
	const ctx = c.getContext("2d");
	let w, h, parts = [], rings = [], raf;
	const TAU = Math.PI * 2;

	function resize() { w = c.width = innerWidth; h = c.height = innerHeight; }
	addEventListener("resize", resize); resize();

	function spawnConfetti(x, y, count = 140, power = 8, lifeScale = 1) {
		for (let i = 0; i < count; i++) {
			const a = Math.random() * TAU;
			const sp = (Math.random() * power) + 2;
			const vx = Math.cos(a) * sp;
			const vy = Math.sin(a) * sp - Math.random() * 2;
			const baseLife = 60 + Math.random() * 50;
			const life = baseLife * lifeScale;
			const size = 2 + Math.random() * 4;
			const hue = (Math.random() * 360) | 0;
			parts.push({ x, y, vx, vy, life, size, hue, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.2 });
		}
		if (!raf) loop();
	}
	function spawnRipple(x, y, r0 = 12, spread = 3, qty = 2) {
		for (let i = 0; i < qty; i++) rings.push({ x, y, r: r0 + i * 8, vr: spread, alpha: 0.35, va: -0.01 });
		if (!raf) loop();
	}
	function loop() {
		raf = requestAnimationFrame(loop);
		ctx.clearRect(0, 0, w, h);
		for (let i = parts.length - 1; i >= 0; i--) {
			const p = parts[i];
			p.life--;
			if (p.life <= 0) { parts.splice(i, 1); continue; }
			p.vy += 0.12; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
			ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
			ctx.fillStyle = `hsl(${p.hue} 80% 65% / .95)`; ctx.fillRect(-p.size, 0, p.size * 2, p.size);
			ctx.restore();
		}
		ctx.lineWidth = 2;
		for (let i = rings.length - 1; i >= 0; i--) {
			const r = rings[i];
			r.r += r.vr; r.alpha += r.va;
			if (r.alpha <= 0) { rings.splice(i, 1); continue; }
			ctx.beginPath(); ctx.strokeStyle = `rgba(234,179,8,${Math.max(0, r.alpha)})`;
			ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
		}
		if (parts.length === 0 && rings.length === 0) { cancelAnimationFrame(raf); raf = null; }
	}

	return {
		burst: (x = innerWidth / 2, y = innerHeight / 3, n = 140, power = 8, lifeScale = 1) => spawnConfetti(x, y, n, power, lifeScale),
		ripple: (x = innerWidth / 2, y = innerHeight * 0.35) => spawnRipple(x, y, 14, 3, 2)
	};
})();

// ===== Game state & helpers =====
const HANDS = ["Rock", "Scissors", "Paper"];
const BEATS = { "Rock": "Scissors", "Scissors": "Paper", "Paper": "Rock" };
const EMOJI = { "Rock": "✊", "Scissors": "✌️", "Paper": "🖐" };
const el = (id) => document.getElementById(id);
const screens = { setup: el("screen-setup"), game: el("screen-game"), result: el("screen-result"), victory: el("screen-victory") };
let total = 0, rivals = 0, round = 0, alive = false;

// Cheat mode toggle
let FORCE_WIN = false;

const fmt = (n) => n.toLocaleString("en-US");

// Badge order
const BADGE_ORDER = ["Defeated 100!", "City Champion!", "National Champion!", "World Champion!"];

function show(name) {
	Object.values(screens).forEach(s => s.classList.remove("active"));
	screens[name].classList.add("active");
}

function updateHUD(animated = false) {
	el("roundPill").textContent = `Round: ${round}`;
	const setVal = (node, val) => { node.textContent = fmt(val); node.classList.add("bump"); setTimeout(() => node.classList.remove("bump"), 230); };
	if (animated) { setVal(el("rivalsLbl"), rivals); setVal(el("rankPreviewLbl"), rivals + 1); }
	else { el("rivalsLbl").textContent = fmt(rivals); el("rankPreviewLbl").textContent = fmt(rivals + 1); }
	el("halvesLbl").style.opacity = rivals > 0 ? 1 : 0.5;
}

// ===== Best & Badges (localStorage) =====
const LS_KEYS = {
	bestRecord: "jg_best_record",
	bestRound: "jg_best_round",
	badges: "jg_badges",
	lastTotal: "jg_last_total"
};

function loadJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } }
function saveJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

(function migrateAndCleanup() {
	if (localStorage.getItem("jg_best_rank")) localStorage.removeItem("jg_best_rank");
	const rec = loadJSON(LS_KEYS.bestRecord, null);
	if (rec && (!rec.total || rec.total <= 0)) localStorage.removeItem(LS_KEYS.bestRecord);
})();

function betterRecord(a, b) { if (a.rank !== b.rank) return (a.rank < b.rank) ? a : b; return (a.total >= b.total) ? a : b; }
function saveBestRecord(total, rank) {
	const cur = loadJSON(LS_KEYS.bestRecord, null);
	const next = cur ? betterRecord(cur, { total, rank }) : { total, rank };
	saveJSON(LS_KEYS.bestRecord, next);
	return next;
}

function refreshBestUI(newly) {
	const rec = loadJSON(LS_KEYS.bestRecord, null);
	el("bestRankLbl").textContent = (rec && rec.total > 0) ? `${fmt(rec.total)} players: Rank ${fmt(rec.rank)}` : "—";

	const rd = localStorage.getItem(LS_KEYS.bestRound);
	el("bestRoundLbl").textContent = rd ? fmt(Number(rd)) : "—";

	const badges = loadJSON(LS_KEYS.badges, []);
	const listEl = el("badgeList");
	if (!badges.length) { listEl.textContent = "None"; return; }

	const sorted = BADGE_ORDER.filter(b => badges.includes(b));
	listEl.innerHTML = sorted
		.map(b => `<div class="badge-line sparkle${(newly && newly === b) ? ' celebrate' : ''}" data-badge="${b}">${b}</div>`)
		.join("");
}

function titleFor(total) {
	if (total >= 8000000000) return "World Champion!";
	if (total >= 1000000) return "National Champion!";
	if (total >= 10000) return "City Champion!";
	return "Defeated 100!";
}

function victoryCopy(total, round) {
	const winsNeeded = Math.ceil(Math.log2(Math.max(1, total)));
	if (total >= 8000000000) {
		return {
			title: "World Champion!",
			msg: `You kept winning until the last survivor. <b>You are the strongest human alive</b>.<br>Initial participants: <b>${fmt(total)}</b>, theoretical wins needed: <b>${fmt(winsNeeded)}</b>. You overcame them all.`,
			hashtag: "WorldChampion,RPS"
		};
	} else if (total >= 1000000) {
		return {
			title: "National Champion!",
			msg: `You reached the top of a one-million tournament. <b>The strongest in the nation</b> is proven.<br>Initial participants: <b>${fmt(total)}</b> (wins needed: <b>${fmt(winsNeeded)}</b>).`,
			hashtag: "NationalChampion,RPS"
		};
	} else if (total >= 10000) {
		return {
			title: "City Champion!",
			msg: `You rose above ten thousand challengers. <b>Champion of the metropolis</b>.<br>Wins needed: <b>${fmt(winsNeeded)}</b>. Both luck and skill aligned.`,
			hashtag: "CityChampion,RPS"
		};
	} else {
		return {
			title: "Defeated 100!",
			msg: `You conquered the 100-player stage. Earned the title of <b>Community Champion</b>.<br>Wins needed: <b>${fmt(winsNeeded)}</b>. Aim for the world next!`,
			hashtag: "Defeated100,RPS"
		};
	}
}

// ===== Core actions =====
function resetAndStart() {
	const modal = el("modal"); modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
	total = parseInt(el("population").value, 10);
	localStorage.setItem(LS_KEYS.lastTotal, String(total));
	rivals = Math.max(0, total - 1);
	round = 0; alive = true;
	el("lastInfo").textContent = "";
	document.querySelectorAll("[data-hand]").forEach(b => b.disabled = false);
	updateHUD(false);
	show("game");
	FX.ripple();
}
function returnToSetup() {
	const modal = el("modal"); modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
	show("setup"); alive = false;
}

function openRoundModal(type, enemy) {
	const banner = document.getElementById("roundBanner");
	banner.style.display = "block";
	banner.className = "result " + ((type === "Win" || type === "Victory") ? "win" : (type === "Lose" ? "lose" : "draw"));
	const extra = (type === "Victory") ? " → <b>World Champion!</b>" : ((type === "Win" && rivals === 0) ? " → <b>World Champion Next!</b>" : "");
	banner.innerHTML = `Result: <b>${type}</b><br>Opponent: ${EMOJI[enemy]} ${enemy} ／ Remaining Rivals: <b>${fmt(rivals)}</b>${extra}`;
	document.getElementById("nextRoundBtn").style.display = (type === "Win") ? "inline-block" : "none";
	document.getElementById("toResultBtn").style.display = (type === "Lose") ? "inline-block" : "none";
	document.getElementById("toVictoryBtn").style.display = (type === "Victory") ? "inline-block" : "none";
	const modal = document.getElementById("modal");
	modal.classList.add("open");
	modal.setAttribute("aria-hidden", "false");
}
function closeModal() { const m = el("modal"); m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); }
function goNextRound() { closeModal(); updateHUD(false); el("lastInfo").textContent = "— Choose your next move"; }

function goResult() {
	closeModal();
	const finalRank = rivals + 1;
	el("finalRankLbl").textContent = fmt(finalRank);
	el("reachRoundLbl").textContent = fmt(round);
	el("totalLbl").textContent = fmt(total);
	el("finalNarrative").innerHTML =
		`That day, you were not chosen as the strongest human.<br>But finishing <b>${fmt(finalRank)}</b> out of <b>${fmt(total)}</b> is still your achievement.`;

	const text = `I joined the Global Rock-Paper-Scissors game. Result: Rank ${fmt(finalRank)} / ${fmt(total)} players. Try it yourself!`;
	const url = location.origin + location.pathname;
	el("shareBtn").href =
		`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=${encodeURIComponent("GlobalRPS,RPSChallenge")}`;

	saveBestRecord(total, finalRank);
	const bestRound = localStorage.getItem(LS_KEYS.bestRound);
	if (!bestRound || round > Number(bestRound)) localStorage.setItem(LS_KEYS.bestRound, String(round));
	refreshBestUI();
	show("result");
}

function goVictory() {
	closeModal();
	const vc = victoryCopy(total, round);
	el("victoryTitle").textContent = vc.title;
	el("victoryRankLbl").textContent = "1";
	el("victoryRoundLbl").textContent = fmt(round);
	el("victoryTotalLbl").textContent = fmt(total);
	el("victoryNarrative").innerHTML = vc.msg;

	const text = `I joined the Global Rock-Paper-Scissors game. Result: Rank 1 / ${fmt(total)} players! Try it yourself!`;
	const url = location.origin + location.pathname;
	el("victoryShareBtn").href =
		`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=${encodeURIComponent("GlobalRPS,RPSChallenge")}`;

	const t = titleFor(total);
	const badges = loadJSON(LS_KEYS.badges, []);
	let newly = null;
	if (!badges.includes(t)) { badges.push(t); saveJSON(LS_KEYS.badges, badges); newly = t; }

	saveBestRecord(total, 1);
	const bestRound = localStorage.getItem(LS_KEYS.bestRound);
	if (!bestRound || round > Number(bestRound)) localStorage.setItem(LS_KEYS.bestRound, String(round));

	refreshBestUI(newly);
	show("victory");

	FX.burst(innerWidth * 0.20, innerHeight * 0.25, 220, 8, 1.6);
	setTimeout(() => FX.burst(innerWidth * 0.80, innerHeight * 0.25, 240, 8, 1.6), 120);
	setTimeout(() => FX.burst(innerWidth * 0.50, innerHeight * 0.18, 260, 8, 1.6), 220);
}

function play(player) {
	if (!alive) return;
	const enemy = FORCE_WIN ? BEATS[player] : HANDS[Math.floor(Math.random() * 3)];

	if (player === enemy) {
		el("lastInfo").textContent = `— Draw (Opponent: ${EMOJI[enemy]}${enemy})`;
		FX.ripple(innerWidth / 2, innerHeight * 0.35);
		return;
	}

	round++;

	if (BEATS[player] === enemy) {
		rivals = Math.floor(rivals / 2);
		updateHUD(true);
		if (rivals === 0) {
			alive = false;
			document.querySelectorAll("[data-hand]").forEach(b => b.disabled = true);
			openRoundModal("Victory", enemy);
		} else {
			FX.burst(innerWidth / 2, innerHeight * 0.28, 140, 7, 0.5);
			openRoundModal("Win", enemy);
		}
	} else {
		alive = false;
		openRoundModal("Lose", enemy);
	}
}

// ===== Wiring =====
document.addEventListener("DOMContentLoaded", () => {
	refreshBestUI();
	show("setup");
	el("startBtn").addEventListener("click", resetAndStart);
	document.querySelectorAll("[data-hand]").forEach(btn => {
		btn.addEventListener("click", () => {
			btn.disabled = true; setTimeout(() => { btn.disabled = false; }, 150);
			play(btn.getAttribute("data-hand"));
		});
	});
	el("nextRoundBtn").addEventListener("click", goNextRound);
	el("toResultBtn").addEventListener("click", goResult);
	el("toVictoryBtn").addEventListener("click", goVictory);
	el("retryBtn").addEventListener("click", returnToSetup);
	el("victoryRetryBtn").addEventListener("click", returnToSetup);
});