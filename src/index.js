// ========================================
// 🎲 API Baccarat Việt Hóa - Full hoàn chỉnh (Debug-ready)
// - Nhiều loại cầu & thuật toán nâng cao (Markov ...)
// - Lưu kết quả thực tế & trạng thái Thắng/Thua/Hòa
// - Mỗi phiên chỉ dự đoán 1 lần / bàn
// - Tách bàn, full tiếng Việt, có id @minhsangdangcap
// - Bắt lỗi global, endpoint /diag để chẩn đoán
// Dev: @minhsangdangcap
// ========================================

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const app = express();

const PORT = process.env.PORT || 3000;
const NGUON_DU_LIEU = process.env.SOURCE_URL || "https://apibcr-hknam-mz95.onrender.com/data";
const FILE_LUU = path.join(__dirname, "data.json");

// ===== Global error handlers (ghi log rõ ràng) =====
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT_EXCEPTION:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED_REJECTION:", err && (err.stack || err.message) ? (err.stack || err.message) : err);
});

// ===== Helpers =====
function nowVN() { return new Date().toLocaleString("vi-VN"); }
function locChuoi(s){ if(!s) return ""; return s.toString().toUpperCase().replace(/[^PBT]/g,""); }
function layCuoi(s,n){ return (s||"").slice(-n); }

// Ensure data.json exists and valid
function ensureDataFile(){
  try{
    if(!fs.existsSync(FILE_LUU)){
      fs.writeFileSync(FILE_LUU, JSON.stringify({}, null, 2), "utf8");
      return {};
    }
    const raw = fs.readFileSync(FILE_LUU, "utf8") || "{}";
    const parsed = JSON.parse(raw);
    if(typeof parsed !== "object" || Array.isArray(parsed)){
      fs.writeFileSync(FILE_LUU, JSON.stringify({}, null, 2), "utf8");
      return {};
    }
    return parsed;
  }catch(e){
    console.error("ERR ensureDataFile:", e && e.message ? e.message : e);
    try { fs.writeFileSync(FILE_LUU, JSON.stringify({}, null, 2), "utf8"); } catch(_) {}
    return {};
  }
}
function readFileSafe(){ return ensureDataFile(); }
function writeFileSafe(obj){
  try { fs.writeFileSync(FILE_LUU, JSON.stringify(obj, null, 2), "utf8"); }
  catch(e){ console.error("ERR writeFileSafe:", e && e.message ? e.message : e); }
}

// ===== Road detection (nhận dạng loại cầu) =====
function nhanDangCau(raw){
  const s = locChuoi(raw);
  if(!s) return ["Không xác định"];
  const out = new Set();
  const cuoi = layCuoi(s,12);
  if (/(P){4,}/.test(cuoi)) out.add("Cầu bệt Con");
  if (/(B){4,}/.test(cuoi)) out.add("Cầu bệt Cái");
  if (/(PB){3,}|(BP){3,}/.test(cuoi)) out.add("Cầu đảo 3");
  if (/(PBPBPB|BPBPBP)/.test(cuoi)) out.add("Cầu xen 3");
  if (/(PPBB|BBPP){2,}/.test(cuoi)) out.add("Cầu xen 4");
  if (/([PB])\1/.test(cuoi)) out.add("Cầu đôi");
  if (/([PB]){2,3}T/.test(cuoi)) out.add("Cầu có Hòa xen");
  if (/([PB])\1{3,}/.test(cuoi)) out.add("Cầu rồng");
  if (/PBPB.{1,2}PP/.test(cuoi)) out.add("Cầu biến thể xen lặp");
  if (/BPPB/.test(cuoi)) out.add("Cầu 2-2");
  if (/BPB/.test(cuoi)) out.add("Cầu 1-1-1");
  if (/(PPBP|BBPB|PPBP)/.test(cuoi)) out.add("Cầu nghiêng Con");
  if (/(BBPB|PPBB)/.test(cuoi)) out.add("Cầu lệch");
  if (/([PB]){5,6}$/.test(cuoi)) out.add("Cầu chuỗi dài");
  if (/(T){2,}/.test(cuoi)) out.add("Cầu Hòa lặp");
  if (/([PB]).{1,3}\1/.test(cuoi)) out.add("Cầu gương");
  if (out.size === 0) out.add("Cầu hỗn hợp / không rõ");
  return Array.from(out);
}

// ===== Algorithms =====
function algo_DaSo(s){
  s = locChuoi(s);
  const p = (s.match(/P/g)||[]).length;
  const b = (s.match(/B/g)||[]).length;
  if(p>b) return {ten:"Đa số", duDoan:"Con (Player)"};
  if(b>p) return {ten:"Đa số", duDoan:"Cái (Banker)"};
  return {ten:"Đa số", duDoan:"Cân bằng"};
}
function algo_Markov(s){
  s = locChuoi(s);
  if(s.length < 3) return {ten:"Markov cấp cao", duDoan:"Không đủ dữ liệu"};
  const map = {P:0,B:1,T:2};
  const inv = ["Con (Player)","Cái (Banker)","Hòa"];
  const counts = Array.from({length:3},()=>[0,0,0]);
  for(let i=0;i<s.length-1;i++){
    const a = map[s[i]], b = map[s[i+1]];
    if(a===undefined||b===undefined) continue;
    counts[a][b]++;
  }
  const last = map[s.slice(-1)];
  const row = counts[last];
  if(!row || row.reduce((a,b)=>a+b,0)===0) return {ten:"Markov cấp cao", duDoan:"Không đủ dữ liệu"};
  const idx = row.indexOf(Math.max(...row));
  return {ten:"Markov cấp cao", duDoan: inv[idx]};
}
function algo_Trend(s){
  s = locChuoi(s);
  const last = s.slice(-1);
  const p = (s.match(/P/g)||[]).length;
  const b = (s.match(/B/g)||[]).length;
  if(Math.abs(p-b) >= 3) return {ten:"Xu hướng", duDoan: p>b ? "Con (Player)" : "Cái (Banker)"};
  return {ten:"Xu hướng", duDoan: last === "P" ? "Cái (Banker)" : "Con (Player)"};
}

const DS_THUAT_TOAN = [algo_DaSo, algo_Markov, algo_Trend];

function duDoanTongHop(chuoi){
  const ketqua = DS_THUAT_TOAN.map(fn => { try { return fn(chuoi); } catch(e){ return {ten:"Lỗi", duDoan:"Không rõ"}; } });
  const dem = {};
  for(const r of ketqua) dem[r.duDoan] = (dem[r.duDoan]||0) + 1;
  const top = Object.entries(dem).sort((a,b)=>b[1]-a[1])[0] || ["Không xác định",0];
  return { tatCa: ketqua, tongHop: { duDoan: top[0] } };
}

// ===== Diagnostic endpoint =====
app.get("/diag", (req,res) => {
  try{
    const index_exists = fs.existsSync(path.join(__dirname,"index.js"));
    const data_exists = fs.existsSync(FILE_LUU);
    let data_preview = null;
    try { data_preview = JSON.parse(fs.readFileSync(FILE_LUU,"utf8")||"{}"); } catch(e) { data_preview = `Err:${e.message}`; }
    let pkg = null;
    try { pkg = JSON.parse(fs.readFileSync(path.join(__dirname,"package.json"),"utf8")||"{}"); } catch(e) { pkg = `Err:${e.message}`; }
    return res.json({
      node: process.version,
      platform: process.platform,
      cwd: __dirname,
      index_exists,
      data_exists,
      data_preview: typeof data_preview === "object" ? Object.keys(data_preview).slice(0,10) : data_preview,
      package: pkg && typeof pkg === "object" ? { name: pkg.name, version: pkg.version, scripts: pkg.scripts, engines: pkg.engines, dependencies: Object.keys(pkg.dependencies||{}) } : pkg,
      env: { PORT: process.env.PORT || null, SOURCE_URL: process.env.SOURCE_URL || null },
      now: nowVN()
    });
  }catch(e){
    console.error("ERR /diag:", e);
    return res.status(500).json({ error: e && e.message ? e.message : String(e) });
  }
});

// ===== Main endpoint /apibcr =====
app.get("/apibcr", async (req,res) => {
  try{
    const response = await axios.get(NGUON_DU_LIEU, { timeout: 10000 }).catch(e => { throw e; });
    const dataArray = Array.isArray(response && response.data ? response.data : response) ? (response.data || response) : (response.data || []);
    if(!Array.isArray(dataArray)) return res.status(500).json({ "Lỗi": "Dữ liệu nguồn không đúng định dạng (không phải danh sách)" });

    const store = readFileSafe();

    for(const item of dataArray){
      const ban = item && item.table_name ? String(item.table_name) : "Bàn không xác định";
      const phien = (item && (item.round !== undefined && item.round !== null)) ? item.round : `phien_${Date.now()}`;
      const lichSu = item && item.result ? String(item.result) : "";

      if(!store[ban]) store[ban] = [];
      const exist = store[ban].some(p => String(p.Phiên) === String(phien));
      if(exist) continue; // mỗi phiên chỉ dự đoán 1 lần

      const loaiCau = nhanDangCau(lichSu);
      const duDoan = duDoanTongHop(lichSu);
      const ketQuaThucTeSym = locChuoi(lichSu).slice(-1) || null;
      const duLabel = (duDoan && duDoan.tongHop && duDoan.tongHop.duDoan) ? duDoan.tongHop.duDoan : "Không xác định";
      const duSym = duLabel.includes("Con") ? "P" : duLabel.includes("Cái") ? "B" : duLabel.includes("Hòa") ? "T" : null;

      let trangThai = "Không có kết quả";
      if(ketQuaThucTeSym === null) trangThai = "Không có kết quả";
      else if(duSym && ketQuaThucTeSym === duSym) trangThai = "Thắng";
      else if(ketQuaThucTeSym === "T") trangThai = "Hòa";
      else trangThai = "Thua";

      const record = {
        "Phiên": phien,
        "Lịch sử cầu": lichSu,
        "Loại cầu": loaiCau,
        "Dự đoán tổng hợp": duLabel,
        "Chi tiết thuật toán": duDoan.tatCa,
        "Kết quả thực tế": ketQuaThucTeSym,
        "Trạng thái": trangThai,
        "Thời gian": nowVN()
      };

      store[ban].push(record);
    }

    writeFileSafe(store);

    const output = Object.keys(store).map(b => ({
      "Bàn": b,
      "Số phiên": store[b].length,
      "Danh sách": store[b],
      "id": "@minhsangdangcap"
    }));

    return res.json({ "Tổng bàn": output.length, "Danh sách bàn": output });
  }catch(e){
    console.error("ERR /apibcr:", e && (e.stack||e.message) ? (e.stack||e.message) : e);
    return res.status(500).json({ "Lỗi": e && e.message ? e.message : String(e) });
  }
});

// ===== /thongke =====
app.get("/thongke", (req,res) => {
  try{
    const store = readFileSafe();
    const stats = { "Tổng bàn":0, "Tổng phiên":0, "Thắng":0, "Thua":0, "Hòa":0 };
    const types = {};
    for(const b in store){
      stats["Tổng bàn"]++;
      for(const p of store[b]){
        stats["Tổng phiên"]++;
        if(p["Trạng thái"] === "Thắng") stats["Thắng"]++;
        else if(p["Trạng thái"] === "Thua") stats["Thua"]++;
        else if(p["Trạng thái"] === "Hòa") stats["Hòa"]++;
        (p["Loại cầu"]||[]).forEach(c => types[c] = (types[c]||0)+1);
      }
    }
    const rate = stats["Tổng phiên"] ? ((stats["Thắng"]/stats["Tổng phiên"])*100).toFixed(1)+"%" : "0%";
    return res.json({ "Tổng bàn": stats["Tổng bàn"], "Tổng phiên": stats["Tổng phiên"], "Kết quả": { "Thắng": stats["Thắng"], "Thua": stats["Thua"], "Hòa": stats["Hòa"], "Tỷ lệ thắng": rate }, "Loại cầu phổ biến": types, "id": "@minhsangdangcap" });
  }catch(e){
    console.error("ERR /thongke:", e);
    return res.status(500).json({ "Lỗi": e && e.message ? e.message : String(e) });
  }
});

// ===== root =====
app.get("/", (req,res) => {
  res.json({ "Endpoints": ["/apibcr","/diag","/thongke"], "id": "@minhsangdangcap" });
});

// ===== Start server =====
try{
  app.listen(PORT, () => console.log(`✅ Server VIP+ Baccarat đang chạy tại cổng ${PORT}`));
}catch(e){
  console.error("ERR khi start server:", e && e.message ? e.message : e);
  process.exit(1);
}
