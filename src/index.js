// ========================================
// 🎲 API Baccarat Việt Hóa - Full hoàn chỉnh (VIP+)
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

// ======= BẮT LỖI TOÀN CỤC =======
process.on("uncaughtException", err => console.error("Lỗi:", err));
process.on("unhandledRejection", err => console.error("Lỗi Promise:", err));

// ======= HÀM TIỆN ÍCH =======
function locChuoi(s) {
  if (!s) return "";
  return s.toUpperCase().replace(/[^PBT]/g, "");
}
function layCuoi(s, n) {
  return (s || "").slice(-n);
}
function docFile() {
  try {
    if (!fs.existsSync(FILE_LUU)) {
      fs.writeFileSync(FILE_LUU, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(FILE_LUU));
  } catch {
    return {};
  }
}
function luuFile(data) {
  fs.writeFileSync(FILE_LUU, JSON.stringify(data, null, 2));
}
function ngayGioVN() {
  return new Date().toLocaleString("vi-VN");
}

// ======= NHẬN DẠNG CẦU =======
function nhanDangCau(str) {
  const s = locChuoi(str);
  const cau = [];
  if (/(P){4,}/.test(s)) cau.push("Cầu bệt Con");
  if (/(B){4,}/.test(s)) cau.push("Cầu bệt Cái");
  if (/(PB){3,}/.test(s)) cau.push("Cầu đảo");
  if (/([PB])\1/.test(s)) cau.push("Cầu đôi");
  if (/([PB]){2,3}T/.test(s)) cau.push("Cầu có Hòa xen");
  if (cau.length === 0) cau.push("Không rõ");
  return cau;
}

// ======= THUẬT TOÁN =======
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
  const idx = count[last].indexOf(Math.max(...count[last]));
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

// ======= HÀM DỰ ĐOÁN =======
function duDoanTongHop(s) {
  const ketQua = DS_THUAT_TOAN.map(fn => fn(s));
  const dem = {};
  ketQua.forEach(k => dem[k.duDoan] = (dem[k.duDoan] || 0) + 1);
  const [duDoan] = Object.entries(dem).sort((a, b) => b[1] - a[1])[0] || ["Không rõ"];
  return { tatCa: ketQua, tongHop: { duDoan } };
}

// ======= API CHÍNH =======
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
      const duDoanKyTu = duDoan.tongHop.duDoan.includes("Con") ? "P" : duDoan.tongHop.duDoan.includes("Cái") ? "B" : "T";
      const trangThai = ketQua === duDoanKyTu ? "Thắng" : ketQua === "T" ? "Hòa" : "Thua";

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
  } catch (err) {
    res.status(500).json({ "Lỗi": err.message });
  }
});

app.get("/", (req, res) => {
  res.json({
    "Endpoints": ["/apibcr"],
    "Nguồn dữ liệu": NGUON_DU_LIEU,
    "id": "@minhsangdangcap"
  });
});

app.listen(PORT, () => console.log(`✅ Server VIP Baccarat đang chạy tại cổng ${PORT}`));
