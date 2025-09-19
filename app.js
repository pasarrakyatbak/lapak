// =================== Konfigurasi ===================
const API_URL = "https://script.google.com/macros/s/AKfycbwnf3IcLzgMNXFGAYF8NK4B9rRqd9HkXFuMXFi9de_F0g1GB2KpOq0OS08elQZMBF02nQ/exec";

let lapakData = [];
let tidakHadir2x = [];
let tidakHadir3x = [];
let currentPage = 1;
let pageSize = Infinity;
let loadingInterval;

// Elemen UI
const scrollBtn = document.getElementById("scrollToggle");
const iconUp = document.getElementById("iconUp");
const iconDown = document.getElementById("iconDown");
const toggleTheme = document.getElementById('toggleTheme');
const scrollFab = document.querySelector('.scroll-fab');


// =================== Load Data ===================
async function loadData() {
    try {
        showLoading(true);
        const res = await fetch(API_URL + "?action=listLapak"); // tambahkan action eksplisit
        if (!res.ok) {
            showToast(`Gagal konek ke server (${res.status})`, "error");
            return;
        }

        const data = await res.json();  // langsung parse JSON
        console.log("Respon server:", data);

        // Pastikan bentuk sesuai
        lapakData = Array.isArray(data.data) ? data.data : [];
        pageSize = lapakData.length || 1;

        const pageSizeSelect = document.getElementById("pageSizeSelect");
        if (pageSizeSelect) pageSizeSelect.value = "all";

        await loadTidakHadirData();
        generateRangeOptions();
        renderGrid();

    } catch (err) {
        console.error(err);
        showToast("Terjadi kesalahan koneksi!", "error");
    } finally {
        showLoading(false);
    }
}

async function loadTidakHadirData() {
    try {
        const [res2x, res3x] = await Promise.all([
            fetch(API_URL + "?action=lapakTidakHadir2x"),
            fetch(API_URL + "?action=lapakTidakHadir3x")
        ]);

        tidakHadir2x = res2x.ok ? (await res2x.json()).lapakTidakHadir2x || [] : [];
        tidakHadir3x = res3x.ok ? (await res3x.json()).lapakTidakHadir3x || [] : [];

    } catch (e) {
        console.error("Gagal fetch data tidak hadir:", e);
        tidakHadir2x = [];
        tidakHadir3x = [];
    }
}

// =================== Loading Spinner ===================
function showLoading(show) {
    const loader = document.getElementById("loading");
    const text = document.getElementById("loadingText");

    if (show) {
        loader.style.display = "flex";
        let dots = 0;
        loadingInterval = setInterval(() => {
            dots = (dots + 1) % 4;
            text.textContent = "Sedang memuat data" + ".".repeat(dots);
        }, 500);
    } else {
        loader.style.display = "none";
        clearInterval(loadingInterval);
        text.textContent = "Sedang memuat data";
    }
}

// =================== Generate Range ===================
function generateRangeOptions() {
    const rangeSelect = document.getElementById("rangeSelect");
    rangeSelect.innerHTML = "";
    rangeSelect.appendChild(new Option("Semua Nomor", "all"));

    let maxNo = lapakData.length > 0 ? lapakData[lapakData.length - 1].no : 0;
    let step = 50;

    for (let start = 1; start <= maxNo; start += step) {
        let end = Math.min(start + step - 1, maxNo);
        rangeSelect.appendChild(new Option(`${start} - ${end}`, `${start}-${end}`));
    }
}
function renderGrid() {
    const grid = document.getElementById("lapakGrid");
    const search = document.getElementById("searchInput").value.toLowerCase();
    const filter = document.getElementById("filterSelect").value;
    const range = document.getElementById("rangeSelect").value;

    grid.innerHTML = "";

    // Filter data
    const filtered = lapakData.filter(({ no, nama, status, bayar }) => {
        if (filter === "kosong" && status !== "kosong") return false;
        if (filter === "terisi" && status !== "terisi") return false;
        if (filter === "belumbayar" && bayar !== false) return false;
        if (filter === "tidakhadir2" && !tidakHadir2x.some(l => l.noLapak == no)) return false;
        if (filter === "tidakhadir3" && !tidakHadir3x.some(l => l.noLapak == no)) return false;
        if (!no.toString().includes(search) && !nama.toLowerCase().includes(search)) return false;

        if (range !== "all") {
            const [start, end] = range.split("-").map(Number);
            if (no < start || no > end) return false;
        }
        return true;
    });

    const safePageSize = pageSize > 0 ? pageSize : filtered.length || 1;
    const totalPages = Math.ceil(filtered.length / safePageSize);
    if (currentPage > totalPages) currentPage = totalPages || 1;
    const startIdx = (currentPage - 1) * safePageSize;
    const pageData = filtered.slice(startIdx, startIdx + safePageSize);

    pageData.forEach(({ no, nama, status, bayar }) => {
        const div = document.createElement("div");
        div.classList.add("lapak", status);

        if (bayar === false) div.classList.add("belumbayar");
        if (tidakHadir3x.some(l => l.noLapak == no)) {
            div.classList.add("tidakhadir3x");
            div.innerHTML += `
                <div class="status-icon" title="Tidak Hadir 3x Berturut-turut">❌</div>
                <div class="warning-text">❌ Lapak ini sudah 3x tidak hadir berturut-turut, lapak bisa hangus!</div>
            `;
        } else if (tidakHadir2x.some(l => l.noLapak == no)) {
            div.classList.add("tidakhadir2x");
            div.innerHTML += `
                <div class="status-icon" title="Tidak Hadir 2x Berturut-turut">⚠️</div>
                <div class="warning-text">⚠️ Lapak ini sudah 2x tidak hadir berturut-turut, harap diperhatikan!</div>
            `;
        }

        div.dataset.no = no;
        div.dataset.nama = nama;

        let insideText = "";
        const match = nama.match(/\((.*?)\)/);
        if (match) {
            insideText = `<hr class="lapak-separator" /><div class="lapak-inside">${match[1]}</div>`;
        }

        div.innerHTML += `
            <div class="lapak-info">
                <div class="lapak-no">Lapak: <span class="number">${no}</span></div>
                <hr class="lapak-separator" />
                <div class="lapak-nama">${nama.replace(/\(.*?\)/g, '')}</div>
                ${insideText}
            </div>
        `;

        div.onclick = () => openDetailModal({ noLapak: no, nama, status, bayar });

        if (bayar === false && document.body.classList.contains("dark")) {
            div.style.backgroundColor = "#f1c40f";
            div.style.color = "#000";
            const elems = div.querySelectorAll(".lapak-no, .lapak-nama, .lapak-inside");
            elems.forEach(el => el.style.color = "#1a1a1a");
        }

        grid.appendChild(div);
    });

    renderPagination(totalPages);
}

// =================== Render Pagination ===================
function renderPagination(totalPages) {
    const nav = document.getElementById("paginationNav");
    nav.innerHTML = "";
    if (totalPages <= 1) return;

    nav.append(`Halaman ${currentPage} dari ${totalPages}`);

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "⬅ Prev";
    prevBtn.disabled = currentPage === 1;
    prevBtn.onclick = () => { currentPage--; renderGrid(); };
    nav.appendChild(prevBtn);

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next ➡";
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.onclick = () => { currentPage++; renderGrid(); };
    nav.appendChild(nextBtn);
}
function openDetailModal(lapak) {
    const modal = document.getElementById("detailModal");
    document.getElementById("detailTitle").textContent = `Detail Lapak ${lapak.noLapak}`;
    document.getElementById("detailBody").innerHTML = `
        <p><b>Nomor:</b> ${lapak.noLapak}</p>
        <p><b>Nama:</b> ${lapak.nama}</p>
        <p><b>Status:</b> ${lapak.status}</p>
    `;
    modal.dataset.lapakId = lapak.noLapak;
    modal.dataset.lapakName = lapak.nama;
    modal.style.display = "flex";
}

function closeDetailModal() {
    document.getElementById("detailModal").style.display = "none";
}

function closeRequestModal() {
    document.getElementById("requestModal").style.display = "none";
}

function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = "block";
    setTimeout(() => { toast.style.display = "none"; }, 3000);
}
// Debounce search input
let searchDebounce;
document.getElementById("searchInput").addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        currentPage = 1;
        renderGrid();
    }, 300);
});

document.getElementById("filterSelect").addEventListener("change", (e) => {
    currentPage = 1;
    renderGrid();

    const sel = e.target;
    const colors = {
        kosong: ["#2ecc71", "#000"],
        terisi: ["#ffffff", "#000"],
        belumbayar: ["#e74c3c", "#fff"],
        tidakhadir2: ["#f1c40f", "#000"],
        tidakhadir3: ["#c0392b", "#fff"]
    };
    const [bg, fg] = colors[sel.value] || ["", ""];
    sel.style.backgroundColor = bg;
    sel.style.color = fg;
});

document.getElementById("rangeSelect").addEventListener("change", () => {
    currentPage = 1;
    renderGrid();
});

document.getElementById("pageSizeSelect").addEventListener("change", (e) => {
    pageSize = e.target.value === "all" ? lapakData.length : parseInt(e.target.value);
    currentPage = 1;
    renderGrid();
});

document.getElementById("btnAbsensi").addEventListener("click", () => {
    const modal = document.getElementById("detailModal");
    openAbsensiModal(modal.dataset.lapakId, modal.dataset.lapakName);
});

scrollBtn.addEventListener("click", () => {
    if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 50) {
        window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
});

window.addEventListener("scroll", () => {
    scrollBtn.classList.toggle("show", window.scrollY > 200);
    const nearBottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - 50;
    iconDown.style.display = nearBottom ? "none" : "block";
    iconUp.style.display = nearBottom ? "block" : "none";
});

if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark");
    toggleTheme.textContent = "☀️";
    toggleTheme.setAttribute("data-tooltip", "Mode Terang");
} else {
    toggleTheme.textContent = "🌙";
    toggleTheme.setAttribute("data-tooltip", "Mode Gelap");
}

toggleTheme.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains("dark");
    toggleTheme.textContent = isDark ? "☀️" : "🌙";
    toggleTheme.setAttribute("data-tooltip", isDark ? "Mode Terang" : "Mode Gelap");
    localStorage.setItem("theme", isDark ? "dark" : "light");
});

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =================== Init ===================
showLoading(true);
loadData();
