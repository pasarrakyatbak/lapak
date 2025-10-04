// =================== Konfigurasi ===================
const API_URL = "https://script.google.com/macros/s/AKfycby4z2qZ24SrJkcyGpybH29lSUC_3_z1LG-7wSmTzpaOEXrwjXf0Cl3hqkg95qAxPj1-/exec";

let lapakData = [];
let filteredData = [];
let currentPage = 1;
let pageSize = "all";
let dotsInterval;

const API_TIDAK_HADIR_2X = `${API_URL}?action=lapakTidakHadir2x`;
const API_TIDAK_HADIR_3X = `${API_URL}?action=lapakTidakHadir3x`;
const API_REKAP_ABSENSI = `${API_URL}?action=lihatrekapperlapak`;
const API_IZIN = `${API_URL}?action=getIzin`;
const API_WAITING_LIST = `${API_URL}?action=waitingList`;

const loading = document.getElementById("loading");
const grid = document.getElementById("lapakGrid");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const rangeSelect = document.getElementById("rangeSelect");
const pageSizeSelect = document.getElementById("pageSizeSelect");
const paginationNav = document.getElementById("paginationNav");
const themeBtn = document.getElementById("toggleTheme");
const fab = document.getElementById("scrollToggle");
let scrollDown = true;
// =================== Caching ===================
const CACHE_KEY = "lapakDataCache";
const CACHE_EXP_KEY = "lapakDataCacheExp";
const CACHE_TTL = 5 * 60 * 1000; // 5 menit

function saveCache(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_EXP_KEY, Date.now() + CACHE_TTL);
    } catch (e) {
        console.warn("❌ Gagal simpan cache:", e);
    }
}

function loadCache() {
    try {
        const exp = localStorage.getItem(CACHE_EXP_KEY);
        if (!exp || Date.now() > parseInt(exp)) return null; // expired
        const data = JSON.parse(localStorage.getItem(CACHE_KEY));
        return Array.isArray(data) ? data : null;
    } catch (e) {
        console.warn("❌ Gagal baca cache:", e);
        return null;
    }
}

function clearCache() {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_EXP_KEY);
}

// =================== Utility ===================
function parseNamaBarang(rawNama) {
    if (!rawNama) return { nama: "-", barang: "-" };
    const match = rawNama.match(/^(.*?)\s*\((.*?)\)$/);
    if (match) return { nama: match[1].trim(), barang: match[2].trim() };
    return { nama: rawNama, barang: "-" };
}

function showLoading(state) {
    loading.classList.toggle("active", state);
    state ? startDots() : stopDots();
}

function startDots() {
    const dots = document.getElementById("dots");
    let count = 0;
    dotsInterval = setInterval(() => {
        count = (count + 1) % 4;
        dots.textContent = ".".repeat(count);
    }, 500);
}

function stopDots() {
    clearInterval(dotsInterval);
    document.getElementById("dots").textContent = "";
}

// =================== Toast ===================
function showToast(msg, retryCallback = null) {
    const toast = document.getElementById("toast");
    toast.innerHTML = "";
    toast.classList.remove("show");

    const isDark = document.body.classList.contains("dark");
    toast.style.background = isDark ? "rgba(50,50,50,0.9)" : "rgba(50,50,50,0.85)";
    toast.style.color = isDark ? "#eee" : "#fff";

    const text = document.createElement("span");
    text.textContent = msg;
    toast.appendChild(text);

    if (retryCallback) {
        const btn = document.createElement("button");
        btn.textContent = "🔄 Coba Lagi";
        btn.style.marginLeft = "10px";
        btn.style.border = "none";
        btn.style.background = "#2193b0";
        btn.style.color = "#fff";
        btn.style.padding = "0.2rem 0.5rem";
        btn.style.borderRadius = "0.4rem";
        btn.style.cursor = "pointer";
        btn.onclick = () => { retryCallback(); toast.classList.remove("show"); };
        toast.appendChild(btn);
    }

    toast.classList.add("show");
    if (!retryCallback) setTimeout(() => toast.classList.remove("show"), 5000);
}

// =================== Fetch Data ===================
async function fetchLapak() {
    showLoading(true);
    try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error("Gagal ambil data dari server");
        const json = await res.json();
        lapakData = Array.isArray(json.data) ? json.data : [];
        if (lapakData.length > 0) generateRangeOptions();
        filteredData = [...lapakData];
        renderGrid();
        saveCache(lapakData);
    } catch (err) {
        showToast("❌ " + err.message, fetchLapak);
    } finally {
        showLoading(false);
    }
}

// =================== Render ===================
function renderLapakCard(item) {
    const { nama, barang } = parseNamaBarang(item.nama);
    let statusClass = "status-default";
    let statusText = "-";

    if (item.status === "kosong") {
        statusClass = "status-kosong";
        statusText = "Kosong";
    } else if (item.status === "terisi") {
        const bayar = item.bayar === true || item.bayar === "true";
        statusClass = bayar ? "status-terisi" : "status-belumbayar";
        statusText = bayar ? "Sudah Bayar Pendaftaran" : "Proses Pembayaran Pendaftaran";
    }

    return `
    <div class="card">
        <div class="status-badge ${statusClass}">${statusText}</div>
        <h3>Lapak ${item.no || "-"}</h3>
        <p>👤 <span class="nama">${nama}</span></p>
        <hr>
        <p>🛒 <span class="barang">${barang}</span></p>
        <button class="btn" onclick="openDetailModal('${item.no || ""}')">📄 Detail</button>
    </div>
    `;
}

// =================== Placeholder Dinamis ===================
function renderPlaceholderByCategory(filter) {
    let message = "Belum ada data 😔";

    switch (filter) {
        case "waitinglist":
            message = "Tidak ada Waiting List saat ini.";
            break;
        case "izin":
            if (new Date().getDay() !== 0) {
                // kalau bukan Minggu
                message = "Hari ini tidak ada data izin (hanya muncul setiap hari Minggu).";
            } else {
                // kalau Minggu tapi kosong
                message = "Lapak sedang tidak ada yang izin.";
            }
            break;
        case "2x":
            message = "Tidak ada lapak absen 2x berturut-turut.";
            break;
        case "3x":
            message = "Tidak ada lapak absen 3x berturut-turut.";
            break;
        case "kosong":
            message = "Semua lapak sudah penuh.";
            break;
        case "terisi-lunas":
            message = "Belum ada pelapak yang lunas.";
            break;
        case "terisi-belumbayar":
            message = "Semua pelapak sudah bayar.";
            break;
        case "all":
            message = "Data gagal dimuat. Coba refresh.";
            break;
    }

    // ✅ hentikan loading kalau placeholder dipanggil
    showLoading(false);
    grid.innerHTML = `
        <div class="placeholder-card">
            <p>${message}</p>
        </div>
    `;
    paginationNav.innerHTML = "";
}

// =================== Render Grid ===================
async function renderGrid() {
    grid.innerHTML = "";
    const searchTerm = searchInput.value.toLowerCase();
    const statusFilter = filterSelect.value.toLowerCase();

    showLoading(true);

    try {
        let arr = [];

        // ======= Waiting List =======
        if (statusFilter === "waitinglist") {
            const res = await fetch(API_WAITING_LIST);
            if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
            const json = await res.json();
            const data = Array.isArray(json.data) ? json.data : [];

            // filter hanya waiting & done
            arr = data.filter(l => {
                const status = (l.status || "").toLowerCase();
                return status === "waiting" || status === "done";
            });
        }

        // ======= Tidak Hadir (2x / 3x) =======
        else if (["2x", "3x"].includes(statusFilter)) {
            const url = statusFilter === "2x" ? API_TIDAK_HADIR_2X : API_TIDAK_HADIR_3X;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
            const json = await res.json();
            arr = Array.isArray(json.data) ? json.data : [];
        }

        // ======= Izin =======
        else if (statusFilter === "izin") {
            if (new Date().getDay() !== 0) {
                return renderPlaceholderByCategory("izin");
            }

            const res = await fetch(API_IZIN);
            if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
            const json = await res.json();

            if (!json.success) {
                arr = [];
            } else {
                if (json.message && json.data.length === 0) {
                    showToast(json.message);
                }
                arr = Array.isArray(json.data) ? json.data : [];
            }
        }

        // ======= Filter Lokal (Kosong / Terisi) =======
        else {
            arr = lapakData.filter(l => {
                const nama = (l.nama || "").toLowerCase();
                const noStr = l.no ? l.no.toString() : "";
                let match = searchTerm ? (nama.includes(searchTerm) || noStr.includes(searchTerm)) : true;

                if (statusFilter && statusFilter !== "all") {
                    const bayar = l.bayar === true || l.bayar === "true";
                    match = match && (
                        (statusFilter === "kosong" && l.status === "kosong") ||
                        (statusFilter === "terisi-lunas" && l.status === "terisi" && bayar) ||
                        (statusFilter === "terisi-belumbayar" && l.status === "terisi" && !bayar)
                    );
                }

                if (rangeSelect.value !== "all" && l.no) {
                    const [start, end] = rangeSelect.value.split("-").map(Number);
                    const no = parseInt(l.no);
                    if (!isNaN(no)) match = match && no >= start && no <= end;
                }

                return match;
            });
        }

        // ======= Filter Search =======
        filteredData = arr.filter(l => {
            const nama = (l.nama || "").toLowerCase();
            const noStr = (l.noLapak || l.no || "").toString();
            return searchTerm.trim() !== "" ? (nama.includes(searchTerm) || noStr.includes(searchTerm)) : true;
        });

        if (!filteredData.length) return renderPlaceholderByCategory(statusFilter);

        // ======= Render Cards =======
        filteredData.forEach((l, idx) => {
            const temp = document.createElement("div");
            let html = "";

            if (statusFilter === "waitinglist") {
                // tentukan badge sesuai status
                let badgeClass = "status-belumbayar"; // default kuning
                let badgeText = "Waiting ⏳";

                if (l.status && l.status.toLowerCase() === "done") {
                    badgeClass = "status-done"; // hijau
                    badgeText = "Done ✅";
                }

                html = `
        <div class="card">
            <div class="status-badge ${badgeClass}">${badgeText}</div>
            <h3>Antrian ${l.no || "-"}</h3>
            <p>👤 <span class="nama">${l.nama}</span></p>
            <p>📍 ${l.alamat || "-"}</p>
            <hr>
            <p>🛒 <span class="barang">${l.jualan || "-"}</span></p>
        </div>
    `;

            } else if (["2x", "3x"].includes(statusFilter)) {
                html = renderTidakHadirCardNew(l);
            } else if (statusFilter === "izin") {
                html = renderTidakHadirCardNew(l, "izin");
            }
            else {
                html = renderLapakCard(l);
            }

            temp.innerHTML = html;
            const card = temp.firstElementChild;
            card.style.animationDelay = `${idx * 0.05}s`;
            grid.appendChild(card);
        });

        paginationNav.innerHTML = "";
        renderPagination();
        showLoading(false);

    } catch (err) {
        showLoading(false);
        showToast(`❌ Gagal memuat data: ${err.message}`, renderGrid);
        renderPlaceholderByCategory(statusFilter);
    }
}
// =================== Render Tidak Hadir Card (2x / 3x) ===================
function renderTidakHadirCardNew(l, type = "default") {
    const { nama, barang } = parseNamaBarang(l.nama || "");
    const riwayat = l.riwayat || [];

    let label = "-";
    let badgeClass = "status-lain";

    if (type === "izin") {
        // Card khusus untuk izin
        const tanggal = l.tanggal || (riwayat[0]?.tanggal || "-");
        label = "📝 Izin";
        badgeClass = "status-izin";

        return `
        <div class="card">
            <div class="status-badge ${badgeClass}">${label}</div>
            <h3>Lapak ${l.noLapak || "-"}</h3>
            <p>👤 <span class="nama">${nama}</span></p>
            <hr>
            <p>🛒 <span class="barang">${barang || l.kategori_jualan || "-"}</span></p>
            <p>📅 Tanggal: ${tanggal}</p>
            </div>
        `;
    }

    // ======= Hitung streak untuk 2x / 3x =======
    let streak = 0;
    let maxStreak = 0;

    for (let i = 0; i < riwayat.length; i++) {
        const status = riwayat[i].status;

        if (status === "tanpa_keterangan" || status === "izin") {
            streak++;
        } else if (status === "hadir" || status === "belum_mulai") {
            if (streak < 3) streak = 0;
        }

        if (streak > maxStreak) maxStreak = streak;
    }

    if (maxStreak >= 3) label = `❌ Hangus (${maxStreak}x Berturut)`;
    else if (maxStreak === 2) label = `⚠️ Warning (2x Berturut)`;

    if (label.includes("Hangus")) badgeClass = "status-tidakhadir3x";
    else if (label.includes("2x")) badgeClass = "status-tidakhadir2x";

    const riwayatList = riwayat
        .map(r => {
            let statusLabel = r.status;
            if (statusLabel === "tanpa_keterangan") statusLabel = "❌ Tanpa Keterangan";
            if (statusLabel === "hadir") statusLabel = "✅ Hadir";
            if (statusLabel === "izin") statusLabel = "📝 Izin";
            if (statusLabel === "belum_mulai") statusLabel = "⏳ Belum Mulai";
            return `<li>${r.tanggal} → ${statusLabel}</li>`;
        })
        .join("");

    return `
    <div class="card">
        <div class="status-badge ${badgeClass}">${label}</div>
        <h3>Lapak ${l.noLapak || "-"}</h3>
        <p>👤 <span class="nama">${nama}</span></p>
        <hr>
        <p>🛒 <span class="barang">${barang || l.kategori_jualan || "-"}</span></p>
        ${l.totalTanpaKeterangan !== undefined
            ? `<p><strong>Total Tanpa Keterangan:</strong> ${l.totalTanpaKeterangan}</p>`
            : ""}
        ${riwayatList ? `<ul class="riwayat-list">${riwayatList}</ul>` : ""}
    </div>
    `;
}




// =================== Pagination ===================
function renderPagination() {
    paginationNav.innerHTML = "";
    if (pageSize === "all") return;
    const totalPages = Math.ceil(filteredData.length / pageSize);
    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;
        btn.className = i === currentPage ? "active" : "";
        btn.onclick = () => { currentPage = i; renderGrid(); };
        paginationNav.appendChild(btn);
    }
}

// =================== Modal ===================
async function openDetailModal(noLapak) {
    const modal = document.getElementById("detailModal");
    const body = document.getElementById("detailBody");
    const title = document.getElementById("detailTitle");

    // Cari data lapak di array global
    const lapak = lapakData.find(l => l.no === noLapak);

    // Set judul modal: Lapak X - Nama Pedagang
    title.textContent = lapak ? `Lapak ${lapak.no} - ${lapak.nama}` : `Lapak ${noLapak}`;

    // isi body sementara → spinner + teks
    body.innerHTML = `
        <div style="text-align:center; padding:1rem;">
            <div class="spinner" style="
                width:40px;
                height:40px;
                border:4px solid #ccc;
                border-top:4px solid #2193b0;
                border-radius:50%;
                margin:0 auto 1rem;
                animation: spin 1s linear infinite;
            "></div>
            <p>Sedang memuat data...</p>
        </div>
    `;

    modal.classList.add("show");

    try {
        const resAbsensi = await fetch(`${API_URL}?action=lihatrekapperlapak&period=1_tahun&noLapak=${noLapak}`);
        const dataAbsensi = await resAbsensi.json();

        // validasi respon
        if (!dataAbsensi.success || !Array.isArray(dataAbsensi.detail)) {
            body.innerHTML = `<p style="color:red;">❌ ${dataAbsensi.message || "Data absensi tidak ditemukan."}</p>`;
            return;
        }

        const detail = dataAbsensi.detail[0];
        if (!detail || !detail.riwayat || detail.riwayat.length === 0) {
            body.innerHTML = `<p>📭 Belum ada riwayat absensi untuk lapak ini.</p>`;
            return;
        }

        let riwayat = detail.riwayat.sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

        const totalHadir = riwayat.filter(r => r.status === "hadir").length;
        const totalIzin = riwayat.filter(r => r.status === "izin").length;
        const totalTidak = riwayat.filter(r => r.status === "tanpa_keterangan" || r.status === "tidak_hadir").length;
        const totalBelumMulai = riwayat.filter(r => r.status === "belum_mulai").length;

        body.innerHTML = `
            <div class="absensi-summary">
                <span class="badge status-hadir">✅ Hadir: ${totalHadir}</span>
                <span class="badge status-izin">📄 Izin: ${totalIzin}</span>
                <span class="badge status-tidak">❌ Tidak Hadir: ${totalTidak}</span>
                <span class="badge status-belum">⏳ Belum Mulai: ${totalBelumMulai}</span>
            </div>

            <h4 style="margin-top:1rem;">📅 Riwayat Absensi</h4>
            <table class="absensi-table">
                <thead>
                    <tr>
                        <th>Tanggal</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${riwayat.map(r => `
                        <tr>
                            <td>${r.tanggal}</td>
                            <td class="${r.status === "hadir" ? "status-hadir"
                : r.status === "izin" ? "status-izin"
                    : r.status === "belum_mulai" ? "status-belum"
                        : "status-tidak"}">
                                ${r.status === "hadir" ? "Hadir"
                : r.status === "izin" ? "Izin"
                    : r.status === "belum_mulai" ? "Belum Mulai"
                        : "Tidak Hadir"}
                            </td>
                        </tr>`).join("")}
                </tbody>
            </table>
               <!-- Aturan tambahan -->
    <div class="rules-text" style="margin-top:1.5rem; text-align:left;">
        <h4>📌 Ketentuan Lapak</h4>
       <ul>
                    <li>
                        <strong>Absen 3x berturut-turut</strong> + <strong>tidak bayar retribusi minimal 1x</strong>
                        → <em>Lapak dianggap hangus</em>.
                        📌 <u>Alasan:</u> untuk memberi kesempatan kepada pelapak lain yang lebih aktif.
                        ⚡ <u>Konsekuensi:</u> lapak langsung <em>dialihkan ke calon pelapak dalam waiting list</em>.
                    </li>
                    <li>
                        <strong>Izin 3x berturut-turut</strong> + <strong>tidak bayar retribusi minimal 1x</strong>  
                        → <em>Lapak dianggap hangus</em>.  
                        📌 <u>Alasan:</u> supaya lapak tidak kosong terus-menerus dan bisa dipakai oleh pelapak lain yang sudah antre di <em>waiting list</em>.  
                        ⚡ <u>Konsekuensi:</u> hak atas lapak dicabut dan langsung <em>dialihkan ke calon pelapak waiting list</em>.
                    </li>
                    <li>
                        <strong>Lapak dipakai orang lain</strong> tanpa izin resmi panitia
                        → tetap <em>dianggap tidak hadir</em> bagi pemilik asli.
                        📌 <u>Alasan:</u> untuk menjaga ketertiban dan kejelasan kepemilikan lapak.
                        ⚡ <u>Konsekuensi:</u> pemilik lapak bisa kehilangan hak atas lapak jika pelanggaran berulang.
                    </li>

                    <li>
                        <strong>Tidak ikut Jumpa Pelapak sebanyak 3x</strong>
                        → mendapat <em>sanksi langsung dari ketua panitia</em>.
                        📌 <u>Alasan:</u> Jumpa Pelapak adalah forum komunikasi penting.
                        ⚡ <u>Konsekuensi:</u> sanksi bisa berupa teguran lisan maupun tertulis, atau evaluasi
                        keanggotaan pelapak.
                    </li>

                    <li>
                        <strong>Lapak hangus</strong> → untuk daftar ulang dikenakan biaya
                        <strong>Rp30.000 per lapak (180 cm)</strong>.
                        ⚠️ <em>Tidak otomatis kembali ke tempat lama</em>.
                        📌 <u>Alasan:</u> untuk mengatur ulang posisi, menjaga keadilan, dan memberi kesempatan pelapak baru.  
                        ⚡ <u>Konsekuensi:</u> 
                              - Lokasi lama bisa ditempati orang lain.  
                              - Jika ingin jualan lagi, pelapak wajib masuk <em>waiting list</em> dan menunggu ada lapak kosong/hangus.
                    <li>
                        <strong>Dilarang parkir di area lapak kosong</strong>.
                        📌 <u>Alasan:</u> area kosong disiapkan untuk calon pelapak baru atau keperluan panitia.
                        ⚡ <u>Konsekuensi:</u> kendaraan wajib dipindahkan ke <em>parkir resmi panitia</em>, jika
                        melanggar bisa kena teguran.
                    </li>
                </ul>
    </div>
        `;
    } catch (err) {
        console.error("Gagal memuat data modal:", err);
        body.innerHTML = `<p style="color:red;">❌ Gagal memuat data. Silakan coba lagi nanti.</p>`;
        showToast("Gagal memuat data absensi", () => openDetailModal(noLapak));
    }
}


function closeDetailModal() {
    document.getElementById("detailModal").classList.remove("show");
}
window.openDetailModal = openDetailModal;
window.closeDetailModal = closeDetailModal;


// Ambil semua tombol detail
document.querySelectorAll(".detail-btn").forEach(button => {
    button.addEventListener("click", function () {
        // Cari parent card
        const card = this.closest(".lapak-card");

        // Ambil data nomor lapak & nama pedagang
        const nomorLapak = card.querySelector(".lapak-number").textContent;
        const namaPedagang = card.querySelector(".nama-pedagang").textContent;

        // Set ke modal
        document.getElementById("modalTitle").textContent = `${nomorLapak} - ${namaPedagang}`;

        // Tampilkan modal
        document.getElementById("absensiModal").style.display = "block";
    });
});

// =================== Events ===================
searchInput.addEventListener("input", () => { currentPage = 1; renderGrid(); });
filterSelect.addEventListener("change", () => { currentPage = 1; renderGrid(); });
rangeSelect.addEventListener("change", () => { currentPage = 1; renderGrid(); });
pageSizeSelect.addEventListener("change", e => {
    pageSize = e.target.value === "all" ? "all" : parseInt(e.target.value);
    currentPage = 1;
    renderGrid();
});

// Dark Mode
themeBtn.addEventListener("click", () => {
    const dark = document.body.classList.toggle("dark");
    themeBtn.textContent = dark ? "☀️ Mode Terang" : "🌙 Mode Gelap";
});

// FAB Scroll
fab.addEventListener("click", () => {
    if (scrollDown) {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
        fab.textContent = "⬆️";
    } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
        fab.textContent = "⬇️";
    }
    scrollDown = !scrollDown;
});

// Ripple effect
function createRipple(e) {
    Array.from(e.currentTarget.getElementsByClassName("ripple-effect")).forEach(r => r.remove());
    const circle = document.createElement("span");
    const diameter = Math.max(e.currentTarget.clientWidth, e.currentTarget.clientHeight);
    const radius = diameter / 2;
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${e.clientX - e.currentTarget.getBoundingClientRect().left - radius}px`;
    circle.style.top = `${e.clientY - e.currentTarget.getBoundingClientRect().top - radius}px`;
    circle.classList.add("ripple-effect");
    e.currentTarget.appendChild(circle);
}
document.querySelectorAll('.btn, .card').forEach(el => el.addEventListener("click", createRipple));

// =================== Range Options ===================
function generateRangeOptions() {
    rangeSelect.innerHTML = `<option value="all"># Semua Nomor</option>`;
    const nomorLapak = lapakData
        .map(l => parseInt(l.no))
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);

    if (!nomorLapak.length) return;
    const maxLapak = Math.max(...nomorLapak);
    const step = 10;
    for (let start = 1; start <= maxLapak; start += step) {
        const end = Math.min(start + step - 1, maxLapak);
        const opt = document.createElement("option");
        opt.value = `${start}-${end}`;
        opt.textContent = `# Lapak ${start}–${end}`;
        rangeSelect.appendChild(opt);
    }
}
// =================== Pull to Refresh ===================
let startY = 0;
let isRefreshing = false;

document.addEventListener("touchstart", e => {
    if (window.scrollY === 0) { // hanya saat di atas halaman
        startY = e.touches[0].pageY;
    } else {
        startY = 0;
    }
});

document.addEventListener("touchmove", e => {
    if (startY > 0) {
        const currentY = e.touches[0].pageY;
        const diff = currentY - startY;

        if (diff > 80 && !isRefreshing) { // threshold tarik kebawah
            isRefreshing = true;
            clearCache(); // hapus cache lama
            fetchLapak(true).finally(() => {
                setTimeout(() => { isRefreshing = false; }, 1000);
            });

            // kasih feedback visual
            showToast("🔄 Memuat ulang data...");
        }
    }
});
// === Tombol Lihat Denah ===
document.addEventListener("DOMContentLoaded", function () {
    const denahBtn = document.querySelector(".btn-denah");
    if (denahBtn) {
        denahBtn.addEventListener("click", function (e) {
            e.preventDefault(); // cegah bug kalau ada form
            window.open("https://pasarrakyatbak.github.io/denah/", "_blank");
        });
    }
});
// ===== Rules Modal sebelum tabel =====
function openRulesModal() {
    const modal = document.getElementById("rulesModal");
    if (modal) modal.classList.add("show");
}

function closeRulesModal() {
    const modal = document.getElementById("rulesModal");
    if (modal) modal.classList.remove("show");
}

function initRulesModal() {
    const modal = document.getElementById("rulesModal");
    const confirmCheck = document.getElementById("confirmRules");
    const agreeBtn = document.getElementById("agreeRules");

    // ✅ Cek apakah user sudah pernah setuju
    const sudahSetuju = localStorage.getItem("rulesAgreed");

    if (sudahSetuju === "true") {
        // Kalau sudah setuju, langsung ambil data tanpa buka modal
        fetchLapak();
        return;
    }

    // Kalau belum setuju → tampilkan modal
    openRulesModal();

    if (confirmCheck && agreeBtn) {
        agreeBtn.disabled = true;

        confirmCheck.addEventListener("change", () => {
            agreeBtn.disabled = !confirmCheck.checked;
        });

        agreeBtn.addEventListener("click", () => {
            agreeBtn.disabled = true;
            const oldText = agreeBtn.textContent;
            agreeBtn.textContent = "⏳ Memuat...";

            closeRulesModal();
            showToast("✅ Anda setuju dengan ketentuan lapak");

            // ✅ Simpan ke localStorage supaya tidak muncul lagi
            localStorage.setItem("rulesAgreed", "true");

            fetchLapak().finally(() => {
                agreeBtn.textContent = oldText;
            });
        });
    }
}

function updateBadge(element, streak) {
    if (streak >= 3) {
        element.classList.remove('status-tidakhadir2x');
        element.classList.add('status-tidakhadir3x', 'pulse');
    } else if (streak === 2) {
        element.classList.remove('status-tidakhadir3x');
        element.classList.add('status-tidakhadir2x', 'pulse');
    }
    // Hapus kelas pulse setelah animasi selesai
    setTimeout(() => element.classList.remove('pulse'), 3000);
}

document.addEventListener("DOMContentLoaded", () => {
    initRulesModal();
});
