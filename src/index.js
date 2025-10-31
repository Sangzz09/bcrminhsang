// ========================================
// 🎲 API Baccarat Việt Hóa - Bản VIP+ Hoàn Chỉnh
// - Nhiều loại cầu & thuật toán nâng cao
// - Mỗi phiên chỉ dự đoán 1 lần / bàn
// - Tách bàn, thống kê thắng thua
// - Full tiếng Việt, có id @minhsangdangcap
// Dev: @minhsangdangcap
// ========================================

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const app = express();

const PORT = process.env.PORT || 3000;
const NGUON_DU_LIEU = "https://apibcr-hknam-mz95.onrender.com/data";
const FILE_LUU = path.join(__dirname, "data.json");

// ===== Bắt lỗi toàn cục để không crash =====
process.on("uncaughtException", (err) => console.error("Lỗi:", err));
process.on("unhandledRejection", (err) => console.error("Lỗi Promise:", err));

// ===== Hàm tiện ích =====
function locChuoi(s) {
  if (!s) return "";
  return s.toUpperCase().replace(/[^PBT]/g, "");
}
function layCuoi(s, n) {
  return (s || "").slice(-n);
}
function docFile() {
  try {
    if (!fs.existsSync(FILE_LUU)) fs.writeFileSync(FILE_LUU, JSON.stringify({}, null, 2));
    return JSON.parse(fs.readFileSync(FILE_LUU));
  } catch {
    return {};
  }
}
function luuFile(data) {
  try {
    fs.writeFileSync(FILE_LUU, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Lỗi khi lưu:", e.message);
  }
}
function ngayGioVN() {
  return new Date().toLocaleString("vi-VN");
}

// ===== Nhận dạng loại cầu =====
function nhanDangCau(s) {
  s = locChuoi(s);
  const cau = [];
  if (/(P){4,}/.test(s)) cau.push("Cầu bệt Con");
  if (/(B){4,}/.test(s)) cau.push("Cầu bệt Cái");
  if (/(PB){3,}/.test(s)) cau.push("Cầu đảo");
  if (/([PB])\1/.test(s)) cau.push("Cầu đôi");
  if (/([PB]){2,3}T/.test(s)) cau.push("Cầu có Hòa xen");
  if (/(PPBB|BBPP)/.test(s)) cau.push("Cầu 2-2");
  if (/(PBPB|BPBP)/.test(s)) cau.push("Cầu xen kẽ");
  if (cau.length === 0) cau.push("Không rõ");
  return cau;
}

// ===== Các thuật toán =====
function thuatToan_DaSo(s) {
  s = locChuoi(s);
  const p = (s.match(/P/g) || []).length;
  const b = (s.match(/B/g) || []).length;
  if (p > b) return { ten: "Đa số", duDoan: "Con (Player)" };
  if (b > p) return { ten: "Đa số", duDoan: "Cái (Banker)" };
  return { ten: "Đa số", duDoan: "Cân bằng" };
}

function thuatToan_Markov(s) {
  s = locChuoi(s);
  if (s.length < 3) return { ten: "Markov", duDoan: "Không đủ dữ liệu" };
  const map = { P: 0, B: 1, T: 2 };
  const inv = ["Con (Player)", "Cái (Banker)", "Hòa"];
  const count = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let i = 0; i < s.length - 1; i++) {
    const a = map[s[i]], b = map[s[i + 1]];
    count[a][b]++;
  }
  const last = map[s.at(-1)];
  const row = count[last];
  if (!row || row.every(v => v === 0)) return { ten: "Markov", duDoan: "Không đủ dữ liệu" };
  const idx = row.indexOf(Math.max(...row));
  return { ten: "Markov", duDoan: inv[idx] };
}

function thuatToan_XuHuong(s) {
  s = locChuoi(s);
  const last = s.at(-1);
  const p = (s.match(/P/g) || []).length;
  const b = (s.match(/B/g) || []).length;
  if (Math.abs(p - b) > 3) return { ten: "Xu hướng", duDoan: p > b ? "Con (Player)" : "Cái (Banker)" };
  return { ten: "Xu hướng", duDoan: last === "P" ? "Cái (Banker)" : "Con (Player)" };
}

const DS_THUAT_TOAN = [thuatToan_DaSo, thuatToan_Markov, thuatToan_XuHuong];

function duDoanTongHop(s) {
  const kq = DS_THUAT_TOAN.map(fn => fn(s));
  const dem = {};
  kq.forEach(k => (dem[k.duDoan] = (dem[k.duDoan] || 0) + 1));
  const [duDoan] = Object.entries(dem).sort((a, b) => b[1] - a[1])[0] || ["Không rõ"];
  return { tatCa: kq, tongHop: { duDoan } };
}

// ===== API /apibcr =====
app.get("/apibcr", async (req, res) => {
  try {
    const { data } = await axios.get(NGUON_DU_LIEU);
    const daLuu = docFile();

    for (const item of data) {
      const ban = item.table_name || "Bàn không xác định";
      const phien = item.round || Date.now();
      const lichSu = item.result || "";

      if (!daLuu[ban]) daLuu[ban] = [];
      if (daLuu[ban].some(p => p.Phiên === phien)) continue;

      const duDoan = duDoanTongHop(lichSu);
      const ketQua = locChuoi(lichSu).slice(-1);
      const duDoanKyTu = duDoan.tongHop.duDoan.includes("Con") ? "P" :
                         duDoan.tongHop.duDoan.includes("Cái") ? "B" : "T";
      const trangThai = ketQua === duDoanKyTu ? "Thắng" :
                        ketQua === "T" ? "Hòa" : "Thua";

      daLuu[ban].push({
        "Phiên": phien,
        "Lịch sử cầu": lichSu,
        "Loại cầu": nhanDangCau(lichSu),
        "Dự đoán tổng hợp": duDoan.tongHop.duDoan,
        "Chi tiết thuật toán": duDoan.tatCa,
        "Kết quả thực tế": ketQua,
        "Trạng thái": trangThai,
        "Thời gian": ngayGioVN()
      });
    }

    luuFile(daLuu);
    const hienThi = Object.keys(daLuu).map(b => ({
      "Bàn": b,
      "Số phiên": daLuu[b].length,
      "Danh sách": daLuu[b],
      "id": "@minhsangdangcap"
    }));
    res.json({ "Tổng bàn": hienThi.length, "Danh sách bàn": hienThi });
  } catch (e) {
    res.status(500).json({ "Lỗi": e.message });
  }
});

// ===== API /thongke =====
app.get("/thongke", (req, res) => {
  try {
    const duLieu = docFile();
    const tk = { Thắng: 0, Thua: 0, Hòa: 0, Tổng_bàn: 0, Tổng_phiên: 0 };
    for (const ban in duLieu) {
      tk.Tổng_bàn++;
      duLieu[ban].forEach(p => {
        tk.Tổng_phiên++;
        if (p.Trạng thái === "Thắng") tk.Thắng++;
        else if (p.Trạng thái === "Thua") tk.Thua++;
        else if (p.Trạng thái === "Hòa") tk.Hòa++;
      });
    }
    const tyle = tk.Tổng_phiên ? ((tk.Thắng / tk.Tổng_phiên) * 100).toFixed(1) + "%" : "0%";
    res.json({ "Thống kê": tk, "Tỷ lệ thắng": tyle, "id": "@minhsangdangcap" });
  } catch (e) {
    res.status(500).json({ "Lỗi": e.message });
  }
});

// ===== Root =====
app.get("/", (req, res) => {
  res.json({
    "Endpoints": ["/apibcr", "/thongke"],
    "Nguồn dữ liệu": NGUON_DU_LIEU,
    "id": "@minhsangdangcap"
  });
});

app.listen(PORT, () => console.log(`✅ Server VIP+ Baccarat đang chạy tại cổng ${PORT}`));

