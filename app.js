const WORKER_URL = "https://sales-script-maker.skunkonsen.workers.dev";

// 直近の生成結果を一時保存（フィードバック送信時に使う）
let lastResult = { A: null, B: null, inputs: null };

// --- 1. 生成ボタン ---
document.getElementById("generate-btn").addEventListener("click", async () => {
  const inputs = {
    product: document.getElementById("product").value,
    industry: document.getElementById("industry").value,
    role: document.getElementById("role").value,
    strength: document.getElementById("strength").value,
    tone: document.getElementById("tone").value,
  };

  if (!inputs.product) {
    alert("商材・サービス名を入力してください。");
    return;
  }

  document.getElementById("loading").hidden = false;
  document.getElementById("generate-btn").disabled = true;

  try {
    const res = await fetch(`${WORKER_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });
    const data = await res.json();

    document.getElementById("script-A").textContent = data.patternA;
    document.getElementById("script-B").textContent = data.patternB;
    document.getElementById("result-section").hidden = false;

    lastResult = { A: data.patternA, B: data.patternB, inputs };
    loadStats();
  } catch (e) {
    alert("生成に失敗しました。時間をおいて再度お試しください。");
    console.error(e);
  } finally {
    document.getElementById("loading").hidden = true;
    document.getElementById("generate-btn").disabled = false;
  }
});

// --- 2. フィードバック送信（Measure/Evaluate） ---
document.querySelectorAll(".btn-win, .btn-use").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    const pattern = e.target.dataset.pattern;
    const result = e.target.classList.contains("btn-win") ? "win" : "use";

    await fetch(`${WORKER_URL}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern,
        result,
        script: lastResult[pattern],
        inputs: lastResult.inputs,
      }),
    });

    alert(result === "win" ? "成約データを記録しました！AIが学習します。" : "使用データを記録しました。");
    loadStats();
  });
});

// --- 3. パターン登録（Learn用ナレッジ蓄積） ---
document.querySelectorAll(".btn-save").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    const pattern = e.target.dataset.pattern;
    const name = prompt("このパターンの名前を付けてください（例：製造業・社長向け）");
    if (!name) return;

    await fetch(`${WORKER_URL}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        script: lastResult[pattern],
        inputs: lastResult.inputs,
      }),
    });
    alert("登録しました。");
    loadSaved();
  });
});

// --- 4. 学習状況を表示 ---
async function loadStats() {
  try {
    const res = await fetch(`${WORKER_URL}/stats`);
    const data = await res.json();
    document.getElementById("stats-body").innerHTML = `
      <p>累計生成回数：<b>${data.totalGenerated}</b> 回</p>
      <p>累計成約数：<b>${data.totalWins}</b> 件</p>
      <p>蓄積された勝ちナレッジ：<b>${data.knowledgeCount}</b> 件</p>
      <p>現在の成約率：<b>${data.winRate}%</b></p>
    `;
  } catch (e) {
    document.getElementById("stats-body").textContent = "学習状況を取得できませんでした。";
  }
}

document.getElementById("refresh-stats").addEventListener("click", loadStats);

// --- 5. 登録済みパターン表示 ---
async function loadSaved() {
  try {
    const res = await fetch(`${WORKER_URL}/saved`);
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      document.getElementById("saved-list").textContent = "まだ登録がありません。";
      return;
    }
    document.getElementById("saved-list").innerHTML = data.items
      .map((it) => `<div class="card"><b>${it.name}</b><div class="script-body">${it.script}</div></div>`)
      .join("");
  } catch (e) {
    document.getElementById("saved-list").textContent = "登録一覧を取得できませんでした。";
  }
}

// --- 6. トレンドフック反映（Act Again） ---
document.getElementById("apply-trend").addEventListener("click", async () => {
  const trend = document.getElementById("trend-hook").value;
  if (!trend) { alert("トレンド・フックを入力してください。"); return; }

  document.getElementById("saved-list").textContent = "トレンドを反映中…";
  const res = await fetch(`${WORKER_URL}/apply-trend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trend }),
  });
  const data = await res.json();
  document.getElementById("saved-list").innerHTML = data.items
    .map((it) => `<div class="card"><b>${it.name}</b><div class="script-body">${it.script}</div></div>`)
    .join("");
  alert("登録パターンに最新トレンドを反映しました。");
});

// 初回読み込み
loadStats();
loadSaved();
