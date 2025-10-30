// ========================================
// 🎲 API Baccarat Việt Hóa - Phiên bản VIP+
// - Nhiều loại cầu & thuật toán nâng cao
// - Markov cấp cao, thống kê thắng thua
// - Không có "Thông báo", full tiếng Việt
// Dev: @minhsangdangcap (bản VIP+ by GPT-5)
// ========================================

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const app = express();

const PORT = process.env.PORT || 3000;
const NGUON_DU_LIEU = "https://apibcr-hknam-mz95.onrender.com/data";
const FILE_LUU = "data.json";

// ================== ⚙️ HÀM TIỆN ÍCH ==================
function ngayGioVN() {
  return new Date().toLocaleString("vi-VN");
}
function locChuoi(s) {
  if (!s) return "";
  return s.toString().toUpperCase().replace(/[^PBT]/g, "");
}
function layCuoi(str, n) {
  return str.slice(-n);
}
function docFile() {
  try {
    if (fs.existsSync(FILE_LUU)) {
      return JSON.parse(fs.readFileSync(FILE_LUU, "utf8") || "{}");
    }
    return {};
  } catch {
    return {};
  }
}
function luuFile(obj) {
  try {
    fs.writeFileSync(FILE_LUU, JSON.stringify(obj, null, 2), "utf8");
  } catch (e) {
    console.error("Lỗi lưu file:", e.message);
  }
}

// ================== 🎯 NHẬN DẠNG CẦU NÂNG CẤP ==================
function nhanDangCau(raw) {
  const s = locChuoi(raw);
  if (!s) return ["Không xác định"];
  const loai = new Set();
  const cuoi = s.slice(-12);

  if (/(P){4,}/.test(cuoi)) loai.add("Cầu bệt Con");
  if (/(B){4,}/.test(cuoi)) loai.add("Cầu bệt Cái");
  if (/(PB){3,}|(BP){3,}/.test(cuoi)) loai.add("Cầu đảo 3");
  if (/(PBPBPB|BPBPBP)/.test(cuoi)) loai.add("Cầu xen 3");
  if (/(PPBB|BBPP){2,}/.test(cuoi)) loai.add("Cầu xen 4");
  if (/([PB])\1/.test(cuoi)) loai.add("Cầu đôi");
  if (/([PB]){2,3}T/.test(cuoi)) loai.add("Cầu có Hòa xen");
  if (/([PB])\1{3,}/.test(cuoi)) loai.add("Cầu rồng");
  if (/PBPB.{1,2}PP/.test(cuoi)) loai.add("Cầu biến thể xen lặp");
  if (/BPPB/.test(cuoi)) loai.add("Cầu 2-2");
  if (/BPB/.test(cuoi)) loai.add("Cầu 1-1-1");
  if (/(PPBP|BBPB|PPBP)/.test(cuoi)) loai.add("Cầu nghiêng Con");
  if (/(BBPB|PPBB)/.test(cuoi)) loai.add("Cầu lệch");
  if (/([PB]){5,6}$/.test(cuoi)) loai.add("Cầu chuỗi dài");
  if (/(T){2,}/.test(cuoi)) loai.add("Cầu Hòa lặp");
  if (/([PB]).{1,3}\1/.test(cuoi)) loai.add("Cầu gương");
  if (loai.size === 0) loai.add("Cầu hỗn hợp / không rõ");
  return Array.from(loai);
}

// ================== 🤖 THUẬT TOÁN NÂNG CAO ==================
function thuatToan_DaSo(s) {
  s = locChuoi(s);
  const cuoi = layCuoi(s, 6);
  const p = (cuoi.match(/P/g) || []).length;
  const b = (cuoi.match(/B/g) || []).length;
  if (p > b) return { ten: "Đa số", duDoan: "Con (Player)" };
  if (b > p) return { ten: "Đa số", duDoan: "Cái (Banker)" };
  return { ten: "Đa số", duDoan: "Cân bằng" };
}
function thuatToan_ChuoiCuoi(s) {
  s = locChuoi(s);
  const m = s.match(/(P+|B+|T+)$/);
  if (!m) return { ten: "Chuỗi cuối", duDoan: "Cân bằng" };
  const kyTu = m[0][0];
  return { ten: "Chuỗi cuối", duDoan: kyTu === "P" ? "Con (Player)" : kyTu === "B" ? "Cái (Banker)" : "Hòa" };
}
function thuatToan_XenKe(s) {
  s = locChuoi(s);
  const cuoi = layCuoi(s, 10);
  if (/(PB){3,}|(BP){3,}/.test(cuoi)) return { ten: "Xen kẽ", duDoan: s.slice(-1) === "P" ? "Cái (Banker)" : "Con (Player)" };
  return { ten: "Xen kẽ", duDoan: "Không chắc" };
}
function thuatToan_KhoiDoi(s) {
  s = locChuoi(s);
  const cuoi = layCuoi(s, 12);
  if (/(BBPP|PPBB)/.test(cuoi)) {
    const block = /(BBPP|PPBB)/.exec(cuoi)[0];
    return { ten: "Khối đôi", duDoan: block.startsWith("BB") ? "Cái (Banker)" : "Con (Player)" };
  }
  return { ten: "Khối đôi", duDoan: "Không chắc" };
}
function thuatToan_TanSuat(s) {
  s = locChuoi(s);
  const cuoi = layCuoi(s, 20);
  const p = (cuoi.match(/P/g) || []).length;
  const b = (cuoi.match(/B/g) || []).length;
  if (p > b) return { ten: "Tần suất", duDoan: "Con (Player)" };
  if (b > p) return { ten: "Tần suất", duDoan: "Cái (Banker)" };
  return { ten: "Tần suất", duDoan: "Cân bằng" };
}
function thuatToan_Markov(s) {
  s = locChuoi(s);
  if (s.length < 3) return { ten: "Markov cấp cao", duDoan: "Không đủ dữ liệu" };
  const map = { P: 0, B: 1, T: 2 };
  const inv = ["Con (Player)", "Cái (Banker)", "Hòa"];
  const counts = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let i = 0; i < s.length - 1; i++) counts[map[s[i]]][map[s[i + 1]]]++;
  const last = map[s.slice(-1)];
  const idx = counts[last].indexOf(Math.max(...counts[last]));
  return { ten: "Markov cấp cao", duDoan: inv[idx] };
}
function thuatToan_Trend(s) {
  s = locChuoi(s);
  const cuoi = layCuoi(s, 10);
  const last = s.slice(-1);
  const countP = (cuoi.match(/P/g) || []).length;
  const countB = (cuoi.match(/B/g) || []).length;
  if (Math.abs(countP - countB) >= 3) return { ten: "Xu hướng", duDoan: countP > countB ? "Con (Player)" : "Cái (Banker)" };
  return { ten: "Xu hướng", duDoan: last === "P" ? "Cái (Banker)" : "Con (Player)" };
}

const DS_THUAT_TOAN = [
  thuatToan_DaSo,
  thuatToan_ChuoiCuoi,
  thuatToan_XenKe,
  thuatToan_KhoiDoi,
  thuatToan_TanSuat,
  thuatToan_Markov,
  thuatToan_Trend
];

// ================== DỰ ĐOÁN ==================
function duDoanTongHop(chuoi) {
  const kq = DS_THUAT_TOAN.map(fn => fn(chuoi));
  const dem = {};
  for (const r of kq) dem[r.duDoan] = (dem[r.duDoan] || 0) + 1;
  const [duDoan] = Object.entries(dem).sort((a, b) => b[1] - a[1])[0] || ["Không xác định"];
  return { tatCa: kq, tongHop: { duDoan } };
}

// ================== API CHÍNH ==================
app.get("/apibcr", async (req, res) => {
  try {
    const { data } = await axios.get(NGUON_DU_LIEU);
    const daLuu = docFile();

    for (const item of data) {
      const ban = item.table_name || "Bàn không xác định";
      const phien = item.round || "Không rõ";
      const lichSu = item.result || "";
      if (!daLuu[ban]) daLuu[ban] = [];
      const tonTai = daLuu[ban].some(p => p.Phiên === phien);
      if (tonTai) continue;

      const loaiCau = nhanDangCau(lichSu);
      const duDoan = duDoanTongHop(lichSu);
      const ketQua = locChuoi(lichSu).slice(-1);
      const duDoanKyTu = duDoan.tongHop.duDoan.includes("Con") ? "P" : duDoan.tongHop.duDoan.includes("Cái") ? "B" : "T";
      let trangThai = "Thua";
      if (ketQua === duDoanKyTu) trangThai = "Thắng";
      if (ketQua === "T") trangThai = "Hòa";

      daLuu[ban].push({
        "Phiên": phien,
        "Lịch sử cầu": lichSu,
        "Loại cầu": loaiCau,
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

// ================== THỐNG KÊ ==================
app.get("/thongke", (req, res) => {
  try {
    const duLieu = docFile();
    const tk = { Tổng_bàn: 0, Tổng_phiên: 0, Thắng: 0, Thua: 0, Hòa: 0 };
    const cauPhoBien = {};
    for (const ban in duLieu) {
      tk.Tổng_bàn++;
      duLieu[ban].forEach(p => {
        tk.Tổng_phiên++;
        if (p.Trạng thái === "Thắng") tk.Thắng++;
        else if (p.Trạng thái === "Thua") tk.Thua++;
        else if (p.Trạng thái === "Hòa") tk.Hòa++;
        p["Loại cầu"].forEach(c => cauPhoBien[c] = (cauPhoBien[c] || 0) + 1);
      });
    }
    const tyle = ((tk.Thắng / tk.Tổng_phiên) * 100 || 0).toFixed(1) + "%";
    res.json({
      "Tổng bàn": tk.Tổng_bàn,
      "Tổng phiên": tk.Tổng_phiên,
      "Kết quả": { "Thắng": tk.Thắng, "Thua": tk.Thua, "Hòa": tk.Hòa, "Tỷ lệ thắng": tyle },
      "Loại cầu phổ biến": cauPhoBien,
      "id": "@minhsangdangcap"
    });
  } catch (err) {
    res.status(500).json({ "Lỗi": err.message });
  }
});

app.get("/", (req, res) => {
  res.json({
    "Endpoints": ["/apibcr", "/thongke"],
    "Nguồn dữ liệu": NGUON_DU_LIEU,
    "id": "@minhsangdangcap"
  });
});

app.listen(PORT, () => console.log(`✅ Server VIP+ Baccarat đang chạy tại cổng ${PORT}`));
