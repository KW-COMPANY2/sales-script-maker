const WORKER_URL = "https://sales-script-maker.skunkonsen.workers.dev";

// 直近の生成結果を一時保存
let lastResult = { A: null, B: null, inputs: null };

// ========== 金額 補助UI ==========
const PRICE_LABELS = ["月額", "初期費用", "年額", "買い切り", "オプション", "その他"];
// クイックボタン（表示ラベル : 加算する円）
const QUICK_STEPS = [
  { label: "＋1千", value: 1000 },
  { label: "＋5千", value: 5000 },
  { label: "＋1万", value: 10000 },
  { label: "＋5万", value: 50000 },
  { label: "＋10万", value: 100000 },
  { label: "＋100万", value: 1000000 },
];

function formatYen(n) {
  return Number(n || 0).toLocaleString("ja-JP");
}

function createPriceRow() {
  const row = document.createElement("div");
  row.className = "price-row";

  // 上段：ラベル / 金額表示 / 単位 / 削除
  const top = document.createElement("div");
  top.className = "price-row-top";

  const labelSel = document.createElement("select");
  labelSel.className = "p-label";
  PRICE_LABELS.forEach((l) => {
    const o = document.createElement("option");
    o.textContent = l;
    labelSel.appendChild(o);
  });

  const amount = document.createElement("input");
  amount.type = "number";
  amount.min = "0";
  amount.step = "1000";
  amount.className = "p-amount price-amount";
  amount.value = 0;
  amount.placeholder = "金額";

  const unitSel = document.createElement("select");
  unitSel.className = "p-unit";
  ["円（税抜）", "円（税込）", "円/月", "円/年"].forEach((u) => {
    const o = document.createElement("option");
    o.textContent = u;
    unitSel.appendChild(o);
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => row.remove());

  top.append(labelSel, amount, unitSel, removeBtn);

  // 下段：クイックボタン群
  const quick = document.createElement("div");
  quick.className = "quick-btns";
  QUICK_STEPS.forEach((step) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = step.label;
    b.addEventListener("click", () => {
      amount.value = Number(amount.value || 0) + step.value;
    });
    quick.appendChild(b);
  });
  // クリアボタン
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "btn-clear";
  clearBtn.textContent = "クリア";
  clearBtn.addEventListener("click", () => (amount.value = 0));
  quick.appendChild(clearBtn);

  row.append(top, quick);
  return row;
}

document.getElementById("add-price").addEventListener("click", () => {
  document.getElementById("price-list").appendChild(createPriceRow());
});

// 金額行を文章化（例：「月額 9,800円/月・初期費用 0円（税抜）」）
function collectPrice() {
  const rows = document.querySelectorAll("#price-list .price-row");
  const parts = [];
  rows.forEach((row) => {
    const label = row.querySelector(".p-label").value;
    const amount = Number(row.querySelector(".p-amount").value || 0);
    const unit = row.querySelector(".p-unit").value;
    if (amount > 0) parts.push(`${label} ${formatYen(amount)}${unit}`);
  });
  return parts.join("・");
}

// ========== キャンペーン動的フィールド ==========
const CAMPAIGN_TYPES = ["値引き", "期間限定", "特典付与", "今だけ", "先着限定", "無料トライアル", "その他"];

function createCampaignRow() {
  const row = document.createElement("div");
  row.className = "campaign-row";

  const typeSel = document.createElement("select");
  typeSel.className = "c-type";
  CAMPAIGN_TYPES.forEach((t) => {
    const o = document.createElement("option");
    o.textContent = t;
    typeSel.appendChild(o);
  });

  const deadline = document.createElement("input");
  deadline.type = "date";
  deadline.className = "c-deadline";

  const detail = document.createElement("input");
  detail.type = "text";
  detail.className = "c-detail";
  detail.placeholder = "内容（例：初月無料・20%OFF）";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "×";
  removeBtn.addEventListener("click", () => row.remove());

  row.append(typeSel, deadline, detail, removeBtn);
  return row;
}

document.getElementById("add-campaign").addEventListener("click", () => {
  document.getElementById("campaign-list").appendChild(createCampaignRow());
});

function collectCampaigns() {
  const rows = document.querySelectorAll("#campaign-list .campaign-row");
  const today = new Date().toISOString().slice(0, 10);
  const valid = [];
  const expired = [];
  rows.forEach((row) => {
    const type = row.querySelector(".c-type").value;
    const deadline = row.querySelector(".c-deadline").value;
    const detail = row.querySelector(".c-detail").value;
    if (!detail && !deadline) return;
    const c = { type, deadline, detail };
    if (deadline && deadline < today) expired.push(c);
    else valid.push(c);
  });
  return { valid, expired };
}

// ========== 個人情報チェック（送信前の一次防御） ==========
function detectSensitive(text) {
  if (!text) return [];
  const hits = [];
  if (/0\d{1,4}-?\d{1,4}-?\d{3,4}/.test(text)) hits.push("電話番号");
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text)) hits.push("メールアドレス");
  if (/(株式会社|有限会社|合同会社|\(株\)|㈱)/.test(text)) hits.push("会社名");
  return hits;
}

function checkAllInputs(inputs) {
  const found = new Set();
  const flat = [inputs.product, inputs.strength,
    ...(inputs.campaigns || []).map((c) => c.detail)];
  flat.forEach((v) => detectSensitive(v).forEach((h) => found.add(h)));
  return [...found];
}

// ========== 1. 生成ボタン ==========
document.getElementById("generate-btn").addEventListener("click", async () => {
  const { valid, expired } = collectCampaigns();

  if (expired.length > 0) {
    alert(
      `期限切れのキャンペーンが ${expired.length} 件あります。\n` +
        `これらは自動的に除外して生成します。`
    );
  }

  const priceText = collectPrice();

  const inputs = {
    product: document.getElementById("product").value,
    strength: document.getElementById("strength").value,
    price: priceText || "未設定",
    term: document.getElementById("term").value,
    tone: document.getElementById("tone").value,
    scene: document.getElementById("scene").value,
    campaigns: valid,
  };

  if (!inputs.product) {
    alert("商材・サービス名を入力してください。");
    document.getElementById("product").focus();
    return;
  }

  const sensitive = checkAllInputs(inputs);
  if (sensitive.length > 0) {
    const ok = confirm(
      `入力内容に「${sensitive.join("・")}」らしき情報が含まれています。\n` +
        `安全のため自動で伏字化して処理します。このまま続けますか？`
    );
    if (!ok) return;
  }

  document.getElementById("loading").hidden = false;
  document.getElementById("generate-btn").disabled = true;

  try {
    const res = await fetch(`${WORKER_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });

    // サーバーがエラーを返した場合を検知
    if (!res.ok) {
      throw new Error(`サーバー応答エラー（${res.status}）`);
    }

    const data = await res.json();

    // サーバー側のエラー内容を検知
    if (data.error) {
      throw new Error(`サーバー内部エラー：${data.error}`);
    }

    const a = data.patternA || "";
    const b = data.patternB || "";

    // 両方とも空・失敗文言のときは分かりやすく通知
    const looksFailed = (t) => !t || t.includes("生成に失敗");
    if (looksFailed(a) && looksFailed(b)) {
      throw new Error("AIから有効な結果が返りませんでした。時間をおいて再度お試しください。");
    }

    document.getElementById("script-A").textContent = a || "（このパターンは生成できませんでした）";
    document.getElementById("script-B").textContent = b || "（このパターンは生成できませんでした）";
    document.getElementById("result-section").hidden = false;
    document.getElementById("result-section").scrollIntoView({ behavior: "smooth" });

    lastResult = { A: a, B: b, inputs };
    loadStats();
  } catch (e) {
    // 原因を画面に表示（真っ白で止まらない）
    alert("生成に失敗しました。\n原因：" + e.message);
    console.error(e);
  } finally {
    document.getElementById("loading").hidden = true;
    document.getElementById("generate-btn").disabled = false;
  }
});

// ========== コピー ==========
document.querySelectorAll(".btn-copy").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    const pattern = e.target.dataset.pattern;
    const text = lastResult[pattern] || "";
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = "コピー済";
      setTimeout(() => (e.target.textContent = "コピー"), 1500);
    } catch {
      alert("コピーに失敗しました。手動で選択してください。");
    }
  });
});

// ========== 2. フィードバック（成約/使用/却下） ==========
document.querySelectorAll(".btn-win, .btn-use, .btn-reject").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    const pattern = e.target.dataset.pattern;
    if (!lastResult[pattern]) {
      alert("先にスクリプトを生成してください。");
      return;
    }
    let result = "use";
    if (e.target.classList.contains("btn-win")) result = "win";
    if (e.target.classList.contains("btn-reject")) result = "reject";

    let rejectReason = "";
    if (result === "reject") {
      rejectReason = prompt("却下理由（例：表現が固い・訴求が弱い）※AIが避けるべき点を学習します") || "";
    }

    try {
      await fetch(`${WORKER_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern,
          result,
          rejectReason,
          script: lastResult[pattern],
          inputs: lastResult.inputs,
        }),
      });

      const msg = {
        win: "成約データを記録しました！AIが学習します。",
        use: "使用データを記録しました。",
        reject: "却下理由を記録しました。次回以降、この傾向を避けます。",
      };
      alert(msg[result]);
      loadStats();
    } catch (err) {
      alert("記録に失敗しました。通信環境をご確認ください。");
      console.error(err);
    }
  });
});

// ========== 3. パターン登録 ==========
document.querySelectorAll(".btn-save").forEach((btn) => {
  btn.addEventListener("click", async (e) => {
    const pattern = e.target.dataset.pattern;
    if (!lastResult[pattern]) {
      alert("先にスクリプトを生成してください。");
      return;
    }
    const name = prompt("このパターンの名前を付けてください（例：勤怠管理・月額プラン向け）");
    if (!name) return;

    try {
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
    } catch (err) {
      alert("登録に失敗しました。通信環境をご確認ください。");
      console.error(err);
    }
  });
});

// ========== 4. 学習状況 ==========
async function loadStats() {
  try {
    const res = await fetch(`${WORKER_URL}/stats`);
    const data = await res.json();
    document.getElementById("stats-body").innerHTML = `
      <p>累計生成回数：<b>${data.totalGenerated}</b> 回</p>
      <p>累計成約数：<b>${data.totalWins}</b> 件</p>
      <p>却下数（負例学習）：<b>${data.totalRejects}</b> 件</p>
      <p>蓄積された勝ちナレッジ：<b>${data.knowledgeCount}</b> 件</p>
      <p>現在の成約率：<b>${data.winRate}%</b></p>
    `;
  } catch (e) {
    document.getElementById("stats-body").textContent = "学習状況を取得できませんでした。";
  }
}

document.getElementById("refresh-stats").addEventListener("click", loadStats);

// ========== 5. 登録済みパターン ==========
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

// ========== 6. トレンドフック反映 ==========
document.getElementById("apply-trend").addEventListener("click", async () => {
  const trend = document.getElementById("trend-hook").value;
  if (!trend) { alert("トレンド・フックを入力してください。"); return; }

  document.getElementById("saved-list").textContent = "トレンドを反映中…（登録数により時間がかかります）";
  try {
    const res = await fetch(`${WORKER_URL}/apply-trend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trend }),
    });
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      document.getElementById("saved-list").textContent = "反映対象の登録パターンがありません。先にパターンを登録してください。";
      return;
    }
    document.getElementById("saved-list").innerHTML = data.items
      .map((it) => `<div class="card"><b>${it.name}</b><div class="script-body">${it.script}</div></div>`)
      .join("");
    alert("登録パターンに最新トレンドを反映しました。");
  } catch (err) {
    document.getElementById("saved-list").textContent = "トレンド反映に失敗しました。時間をおいて再度お試しください。";
    console.error(err);
  }
});

// 初回：金額行1つ・キャンペーン行1つを用意 + データ読み込み
document.getElementById("price-list").appendChild(createPriceRow());
document.getElementById("campaign-list").appendChild(createCampaignRow());
loadStats();
loadSaved();
