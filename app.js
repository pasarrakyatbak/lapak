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

// =================== Render Tidak Hadir ===================
function renderTidakHadirCard(item, type) {
    const { nama, barang } = parseNamaBarang(item.nama);

    // Tentukan badge berdasarkan tipe
    let badge = "";
    if (type === "tidakhadir2x") badge = "Tidak Hadir 2x";
    else if (type === "tidakhadir3x") badge = "Tidak Hadir 3x";
    else if (type === "izin") badge = "Izin";

    // Tentukan tanggal yang akan ditampilkan
    let tanggalDisplay = "-";
    if (type === "izin") {
        tanggalDisplay = item.tanggal1 || "-";
    } else {
        tanggalDisplay = `${item.tanggal1 || "-"}${item.tanggal2 ? " & " + item.tanggal2 : ""}${item.tanggal3 ? " & " + item.tanggal3 : ""}`;
    }

    return `
    <div class="card">
        <div class="status-badge status-belumbayar">${badge}</div>
        <h3>Lapak ${item.noLapak || "-"}</h3>
        <p>👤 <span class="nama">${nama}</span></p>
        <hr>
        <p>🛒 <span class="barang">${barang}</span></p>
        <p>📅 ${tanggalDisplay}</p>
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
            message = "Lapak sedang tidak ada yang izin.";
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

    // ======= Waiting List =======
    if (statusFilter === "waitinglist") {
        showLoading(true);
        try {
            const res = await fetch(API_WAITING_LIST);
            if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
            const json = await res.json();
            showLoading(false);

            const arr = Array.isArray(json.data) ? json.data : [];
            filteredData = arr.filter(l => {
                const nama = (l.nama || "").toLowerCase();
                const noStr = (l.no || "").toString();
                return searchTerm.trim() !== "" ? (nama.includes(searchTerm) || noStr.includes(searchTerm)) : true;
            });

            if (!filteredData.length) return renderPlaceholderByCategory("waitinglist");

            filteredData.forEach((l, idx) => {
                const temp = document.createElement("div");
                temp.innerHTML = `
        <div class="card">
            <div class="status-badge status-belumbayar">Waiting List</div>
            <h3>Antrian ${l.no || "-"}</h3>
            <p>👤 <span class="nama">${l.nama}</span></p>
            <hr>
            <p>🛒 <span class="barang">${l.jualan || "-"}</span></p>
        </div>
    `;
                const card = temp.firstElementChild;
                card.style.animationDelay = `${idx * 0.05}s`;
                grid.appendChild(card);
            });


            paginationNav.innerHTML = "";
        } catch (err) {
            showLoading(false);
            showToast("❌ Gagal memuat Waiting List: " + err.message, renderGrid);
            renderPlaceholderByCategory("waitinglist");
        }
        return;
    }

    // ======= Tidak Hadir =======
    if (["2x", "3x"].includes(statusFilter)) {
        const url = statusFilter === "2x" ? API_TIDAK_HADIR_2X : API_TIDAK_HADIR_3X;
        showLoading(true);
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
            const json = await res.json();
            showLoading(false);

            const arr = statusFilter === "2x"
                ? (Array.isArray(json.lapakTidakHadir2x) ? json.lapakTidakHadir2x : [])
                : (Array.isArray(json.lapakTidakHadir3x) ? json.lapakTidakHadir3x : []);

            filteredData = arr.filter(l => {
                const nama = (l.nama || "").toLowerCase();
                const noStr = (l.noLapak || "").toString();
                return searchTerm.trim() !== "" ? (nama.includes(searchTerm) || noStr.includes(searchTerm)) : true;
            });

            if (!filteredData.length) return renderPlaceholderByCategory(statusFilter);

            filteredData.forEach((l, idx) => {
                const temp = document.createElement("div");
                temp.innerHTML = renderTidakHadirCard(l, statusFilter === "2x" ? "tidakhadir2x" : "tidakhadir3x");
                const card = temp.firstElementChild;
                card.style.animationDelay = `${idx * 0.05}s`;
                grid.appendChild(card);
            });

            paginationNav.innerHTML = "";
        } catch (err) {
            showLoading(false);
            showToast("❌ Gagal memuat data tidak hadir: " + err.message, renderGrid);
            renderPlaceholderByCategory(statusFilter);
        }
        return;
    }

    // ======= Izin =======
    if (statusFilter === "izin") {
        showLoading(true);
        try {
            const res = await fetch(API_IZIN);
            if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
            const json = await res.json();
            showLoading(false);

            const arr = Array.isArray(json.data) ? json.data : [];
            filteredData = arr.filter(l => {
                const nama = (l.nama || "").toLowerCase();
                const noStr = (l.noLapak || "").toString();
                return searchTerm.trim() !== "" ? (nama.includes(searchTerm) || noStr.includes(searchTerm)) : true;
            });

            if (!filteredData.length) return renderPlaceholderByCategory("izin");

            filteredData.forEach((l, idx) => {
                const temp = document.createElement("div");
                temp.innerHTML = renderTidakHadirCard(
                    { noLapak: l.noLapak, nama: l.nama, tanggal1: l.tanggal },
                    "izin"
                );
                const card = temp.firstElementChild;
                card.style.animationDelay = `${idx * 0.05}s`;
                grid.appendChild(card);
            });

            paginationNav.innerHTML = "";
        } catch (err) {
            showLoading(false);
            showToast("❌ Gagal memuat izin: " + err.message, renderGrid);
            renderPlaceholderByCategory("izin");
        }
        return;
    }

    // ======= Filter Lokal =======
    filteredData = lapakData.filter(l => {
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

    let dataToShow = [...filteredData];
    if (pageSize !== "all") {
        const start = (currentPage - 1) * pageSize;
        dataToShow = dataToShow.slice(start, start + pageSize);
    }

    if (!dataToShow.length) return renderPlaceholderByCategory(statusFilter);

    dataToShow.forEach((l, idx) => {
        const temp = document.createElement("div");
        temp.innerHTML = renderLapakCard(l);
        const card = temp.firstElementChild;
        card.style.animationDelay = `${idx * 0.05}s`;
        grid.appendChild(card);
    });

    renderPagination();
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
    body.innerHTML = "";

    modal.classList.add("show");
    showLoading(true); // Tampilkan loading overlay

    try {
        // Ambil data absensi
        const resAbsensi = await fetch(`${API_URL}?action=lihatrekapperlapak&period=1_tahun&noLapak=${noLapak}`);
        const dataAbsensi = await resAbsensi.json();

        // Ambil data izin
        const resIzin = await fetch(`${API_URL}?action=izin`);
        const dataIzin = await resIzin.json();

        showLoading(false); // Sembunyikan loading

        // Validasi data absensi
        if (!dataAbsensi.success || !Array.isArray(dataAbsensi.detail)) {
            body.innerHTML = `<p style="color:red;">❌ ${dataAbsensi.message || "Data absensi tidak ditemukan."}</p>`;
            return;
        }

        const detail = dataAbsensi.detail[0];
        if (!detail || !detail.riwayat) {
            body.innerHTML = `<p>📭 Tidak ada data absensi untuk lapak ini.</p>`;
            return;
        }

        // Gabungkan riwayat absensi + izin
        let riwayat = detail.riwayat;
        const izinList = Array.isArray(dataIzin.izin)
            ? dataIzin.izin.filter(i => i.nomor_lapak == noLapak)
            : [];

        const izinRiwayat = izinList.map(i => ({
            tanggal: i.tanggal,
            hadir: false,
            izin: true
        }));

        riwayat = [...riwayat, ...izinRiwayat].sort((a, b) => new Date(a.tanggal) - new Date(b.tanggal));

        // Hitung total
        const totalHadir = riwayat.filter(r => r.hadir === true).length;
        const totalTidak = riwayat.filter(r => !r.hadir && !r.izin).length;
        const totalIzin = riwayat.filter(r => r.izin === true).length;

        // Isi modal
        body.innerHTML = `
            <div class="absensi-summary">
                <span class="badge status-hadir">✅ Hadir: ${totalHadir}</span>
                <span class="badge status-tidak">❌ Tidak Hadir: ${totalTidak}</span>
                <span class="badge status-izin">📄 Izin: ${totalIzin}</span>
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
                    ${riwayat.length > 0
                ? riwayat.map(r => `
                            <tr>
                                <td>${r.tanggal}</td>
                                <td class="${r.hadir ? 'status-hadir' : r.izin ? 'status-izin' : 'status-tidak'}">
                                    ${r.hadir ? 'Hadir' : r.izin ? 'Izin' : 'Tidak Hadir'}
                                </td>
                            </tr>
                          `).join("")
                : `<tr><td colspan="2">Tidak ada data</td></tr>`
            }
                </tbody>
            </table>
        `;
    } catch (err) {
        console.error("Gagal memuat data modal:", err);
        showLoading(false);
        body.innerHTML = `<p style="color:red;">❌ Gagal memuat data. Silakan coba lagi nanti.</p>`;
        showToast("Gagal memuat data absensi", () => openDetailModal(noLapak));
    }
}

function closeDetailModal() {
    document.getElementById("detailModal").classList.remove("show");
}
window.openDetailModal = openDetailModal;
window.closeDetailModal = closeDetailModal;

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
// =================== Init ===================
fetchLapak();
