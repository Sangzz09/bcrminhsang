// ========================================
// API Baccarat Việt Hóa - Mỗi phiên chỉ dự đoán 1 lần
// Dev: @minhsangdangcap (bản hoàn chỉnh by GPT-5)
// ========================================

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const app = express();

const PORT = process.env.PORT || 3000;
const SOURCE_URL = "https://apibcr-hknam-mz95.onrender.com/data";
const DATA_FILE = "data.json";

// ========== ⚙️ UTILITIES ==========
function nowVN() {
  return new Date().toLocaleString("vi-VN");
}
function sanitizeResult(s) {
  if (!s) return "";
  return s.toString().toUpperCase().replace(/[^PBT]/g, "");
}
function lastN(str, n) {
  return str.slice(-n);
}
function readDataFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
    }
    return [];
  } catch {
    return [];
  }
}
function saveDataFile(arr) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), "utf8");
  } catch (e) {
    console.error("Lỗi lưu file:", e.message);
  }
}

// ========== 🎲 NHẬN DẠNG LOẠI CẦU ==========
function detectRoadTypes(raw) {
  const chuoi = sanitizeResult(raw);
  if (!chuoi) return ["Không xác định"];

  const out = new Set();
  const last8 = lastN(chuoi, 8);
  const last12 = lastN(chuoi, 12);

  if (/(P){4,}/.test(last12)) out.add("Cầu bệt Con");
  if (/(B){4,}/.test(last12)) out.add("Cầu bệt Cái");
  if (/^(?:PB){3,}$/.test(last8) || /^(?:BP){3,}$/.test(last8) || /(PBPB|BPBP)/.test(last12)) out.add("Cầu đảo");
  if (/(BBPP){1,}/.test(last12) || /(PPBB){1,}/.test(last12)) out.add("Cầu xen");
  if (/(PP|BB){2,}/.test(last12)) out.add("Cầu đôi");
  if (chuoi.length <= 10) out.add("Cầu ngắn / ít dữ liệu");
  const demT = (chuoi.match(/T/g) || []).length;
  if (demT >= 2) out.add("Cầu Hòa lặp");
  if (/([PB]).{1,3}\1/.test(last12)) out.add("Cầu mirror");
  if (out.size === 0) out.add("Cầu hỗn hợp / không rõ");

  return Array.from(out);
}

// ========== 🧠 THUẬT TOÁN DỰ ĐOÁN ==========
function algo_simpleMajority(chuoi) {
  const s = sanitizeResult(chuoi);
  if (s.length < 5) return { name: "SimpleMajority", prediction: "Không đủ dữ liệu", score: 0 };
  const last6 = lastN(s, 6);
  const p = (last6.match(/P/g) || []).length;
  const b = (last6.match(/B/g) || []).length;
  const t = (last6.match(/T/g) || []).length;
  let pred = "Cân bằng";
  if (t >= 2 && t > p && t > b) pred = "Hòa";
  else if (p > b) pred = "Con (Player)";
  else if (b > p) pred = "Cái (Banker)";
  return { name: "SimpleMajority", prediction: pred, score: 0.6 + Math.abs(p - b) * 0.05 };
}

function algo_lastStreak(chuoi) {
  const s = sanitizeResult(chuoi);
  const m = s.match(/(P+|B+|T+)$/);
  if (!m) return { name: "LastStreak", prediction: "Cân bằng", score: 0.4 };
  const seq = m[0];
  const len = seq.length;
  const sym = seq[0];
  const pred = sym === "P" ? "Con (Player)" : sym === "B" ? "Cái (Banker)" : "Hòa";
  return { name: "LastStreak", prediction: pred, score: 0.5 + len * 0.1 };
}

function algo_alternationMomentum(chuoi) {
  const s = sanitizeResult(chuoi);
  const last10 = lastN(s, 10);
  const isAlt = /(PB){3,}|(BP){3,}/.test(last10);
  if (isAlt) {
    const last = s.slice(-1);
    const pred = last === "P" ? "Cái (Banker)" : "Con (Player)";
    return { name: "Alternation", prediction: pred, score: 0.8 };
  }
  return { name: "Alternation", prediction: "Không chắc", score: 0.2 };
}

function algo_pairBlock(chuoi) {
  const s = sanitizeResult(chuoi);
  const last12 = lastN(s, 12);
  if (/(BBPP|PPBB)/.test(last12)) {
    const block = /(BBPP|PPBB)/.exec(last12)[0];
    const pred = block.startsWith("BB") ? "Cái (Banker)" : "Con (Player)";
    return { name: "PairBlock", prediction: pred, score: 0.7 };
  }
  return { name: "PairBlock", prediction: "Không chắc", score: 0.2 };
}

function algo_markov1(chuoi) {
  const s = sanitizeResult(chuoi);
  if (s.length < 4) return { name: "Markov1", prediction: "Không đủ dữ liệu", score: 0 };
  const map = { P: 0, B: 1, T: 2 };
  const inv = ["Con (Player)", "Cái (Banker)", "Hòa"];
  const counts = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < s.length - 1; i++) {
    const a = map[s[i]], b = map[s[i + 1]];
    counts[a][b]++;
  }
  const last = map[s.slice(-1)];
  const row = counts[last];
  const max = Math.max(...row);
  const idx = row.indexOf(max);
  return { name: "Markov1", prediction: inv[idx], score: 0.4 + max / (s.length || 1) };
}

function algo_freqWeighted(chuoi) {
  const s = sanitizeResult(chuoi);
  const last20 = lastN(s, 20);
  const p = (last20.match(/P/g) || []).length;
  const b = (last20.match(/B/g) || []).length;
  let pred = p > b ? "Con (Player)" : b > p ? "Cái (Banker)" : "Cân bằng";
  return { name: "FreqWeighted", prediction: pred, score: 0.5 + Math.abs(p - b) * 0.02 };
}

function algo_entropySwitch(chuoi) {
  const s = sanitizeResult(chuoi);
  const last10 = lastN(s, 10);
  const p = (last10.match(/P/g) || []).length;
  const b = (last10.match(/B/g) || []).length;
  const t = (last10.match(/T/g) || []).length;
  const total = p + b + t || 1;
  const ps = [p, b, t].map(x => (x / total) || 0.001);
  const H = -ps.map(x => x * Math.log2(x)).reduce((a, b) => a + b, 0);
  const last = s.slice(-1);
  if (H < 0.9) {
    return { name: "EntropySwitch", prediction: last === "P" ? "Con (Player)" : "Cái (Banker)", score: 0.7 };
  } else {
    return { name: "EntropySwitch", prediction: last === "P" ? "Cái (Banker)" : "Con (Player)", score: 0.6 };
  }
}

function algo_heuristicScore(chuoi) {
  const s = sanitizeResult(chuoi);
  const last10 = lastN(s, 10);
  let scoreVal = 0;
  for (const c of last10) scoreVal += c === "P" ? 1 : c === "B" ? -1 : 0;
  const pred = scoreVal > 0 ? "Con (Player)" : scoreVal < 0 ? "Cái (Banker)" : "Cân bằng";
  return { name: "HeuristicScore", prediction: pred, score: 0.5 + Math.abs(scoreVal) * 0.05 };
}

// ========== 🔮 TỔNG HỢP ==========
function runAllAlgos(chuoi) {
  const algos = [
    algo_simpleMajority,
    algo_lastStreak,
    algo_alternationMomentum,
    algo_pairBlock,
    algo_markov1,
    algo_freqWeighted,
    algo_entropySwitch,
    algo_heuristicScore,
  ];
  const results = algos.map(fn => fn(chuoi));
  const tally = {};
  for (const r of results) tally[r.prediction] = (tally[r.prediction] || 0) + 1;
  const top = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0] || ["Không xác định", 0];
  const confidence = Math.round((top[1] / results.length) * 100);
  return { results, ensemble: { prediction: top[0], votes: top[1], total: results.length, confidence: `${confidence}%` } };
}

// ========== 🌐 ENDPOINTS ==========
app.get("/apibcr", async (req, res) => {
  try {
    const { data } = await axios.get(SOURCE_URL);
    if (!Array.isArray(data)) return res.status(500).json({ Loi: "Nguồn không hợp lệ" });

    const stored = readDataFile();
    const existingRounds = new Set(stored.map(x => x.Phiên));

    const newEntries = [];

    for (const [idx, item] of data.entries()) {
      const round = item.round || idx + 1;
      if (existingRounds.has(round)) continue;

      const raw = item.result || "";
      const loaiCau = detectRoadTypes(raw);
      const algosRun = runAllAlgos(raw);

      const record = {
        Phiên: round,
        Bàn: item.table_name || `Bàn ${idx + 1}`,
        Lịch_sử: raw,
        Loại_cầu: loaiCau,
        Dự_đoán_theo_thuật_toán: algosRun.results,
        Dự_đoán_tổng_hợp: algosRun.ensemble,
        Thời_gian: nowVN(),
      };

      stored.push(record);
      newEntries.push(record);
    }

    if (newEntries.length > 0) saveDataFile(stored);

    res.json({
      Thông_báo: "API Baccarat Việt Hóa (mỗi phiên chỉ dự đoán 1 lần)",
      Cập_nhật: nowVN(),
      Phiên_mới_dự_đoán: newEntries.length,
      Tổng_số_trong_file: stored.length,
      Dữ_liệu_vừa_dự_đoán: newEntries,
    });
  } catch (err) {
    res.status(500).json({ Lỗi: err.message });
  }
});

app.get("/thongke", (req, res) => {
  try {
    const data = readDataFile();
    if (data.length === 0) return res.json({ Thông_báo: "Chưa có dữ liệu để thống kê" });

    const total = data.length;
    const dem = { Con: 0, Cái: 0, Hòa: 0 };
    const cau = {};
    for (const d of data) {
      const p = d.Dự_đoán_tổng_hợp.prediction;
      if (p.includes("Con")) dem.Con++;
      else if (p.includes("Cái")) dem.Cái++;
      else if (p.includes("Hòa")) dem.Hòa++;
      (d.Loại_cầu || []).forEach(c => (cau[c] = (cau[c] || 0) + 1));
    }

    res.json({
      Thông_báo: "Thống kê tổng hợp Baccarat",
      Tổng_số_bản_ghi: total,
      Tỷ_lệ: {
        Con: ((dem.Con / total) * 100).toFixed(1) + "%",
        Cái: ((dem.Cái / total) * 100).toFixed(1) + "%",
        Hòa: ((dem.Hòa / total) * 100).toFixed(1) + "%",
      },
      Loại_cầu_phổ_biến: cau,
      Cập_nhật: nowVN(),
    });
  } catch (err) {
    res.status(500).json({ Lỗi: err.message });
  }
});

app.get("/algos", (req, res) => {
  const list = [
    { id: "SimpleMajority", desc: "Đếm kết quả 6 gần nhất" },
    { id: "LastStreak", desc: "Dựa vào chuỗi kết quả cuối cùng" },
    { id: "Alternation", desc: "Phát hiện mẫu xen kẽ P-B-P-B" },
    { id: "PairBlock", desc: "Phát hiện block PPBB / BBPP" },
    { id: "Markov1", desc: "Tính xác suất chuyển trạng thái" },
    { id: "FreqWeighted", desc: "Tần suất trong 20 kết quả gần nhất" },
    { id: "EntropySwitch", desc: "Entropy thấp -> giữ, cao -> đảo" },
    { id: "HeuristicScore", desc: "Điểm P/B trong 10 ván gần nhất" },
  ];
  res.json({ Thuật_toán: list });
});

app.get("/", (req, res) => {
  res.json({
    Thông_báo: "✅ API Baccarat Việt Hóa hoạt động",
    Endpoints: {
      "/apibcr": "Lấy dữ liệu + dự đoán (1 lần/phiên)",
      "/thongke": "Thống kê tổng hợp",
      "/algos": "Danh sách thuật toán",
    },
    Nguồn: SOURCE_URL,
    Lưu_trữ: DATA_FILE,
  });
});

// ========== 🚀 START SERVER ==========
app.listen(PORT, () => {
  console.log(`✅ Server Baccarat đang chạy tại cổng ${PORT}`);
});
