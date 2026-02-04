/* --- KONFIGURASI UTAMA --- */
// 1. TAMPAL URL YANG ANDA SALIN DARI LANGKAH 1 DI SINI
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbw3PpcWE8-q413p0GI2l2WcCeLanSw3rlmpY_4u3_gK6N4t3mnLf6rrqCRVSo8Bml0/exec";
// 2. PASSWORD UNTUK MASUK KE BUILDER (Mesti sama dengan dalam Google Script)
const ADMIN_PASSWORD = "JERSYX2024";

/* --- Utility Function --- */
function fmt(n) {
	return Number(n || 0).toLocaleString('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
}

const ITEMS_LIST = document.getElementById('itemsList');
const INVOICE_ROOT = document.getElementById('invoiceRoot');
const LOGO_DATA_URL = 'https://i.postimg.cc/BQ23Nf9X/logo-jersyx-01.png';
const STAMP_DATA_URL = 'https://i.postimg.cc/JhLhF5xc/SIGN-RARA-JA-01.png';

const INPUT_FIELDS = {
	fInvoiceNo: 'invoiceInput',
	fCustomer: 'customer',
	fAddress: 'address',
	fPhone: 'phone',
	fPaymentStatus: 'status',
	fDeposit: 'deposit',
	fDesign: 'designCharge',
	fDiscount: 'discount',
	fPaid: 'paid',
	fIssuedBy: 'issuedBy',
	fAcceptedBy: 'acceptedBy'
};

/* --- SISTEM LOGIN & VIEW-ONLY MODE --- */
/* --- KONFIGURASI SESI --- */
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 Jam dalam milliseconds

window.onload = async function() {
	const loadingOverlay = document.getElementById('loadingOverlay');
	const token = window.location.hash.substring(1);

	try {
		if (token && token.length > 5) {
			// MOD CUSTOMER
			showAppMode('customer');
			await loadInvoiceFromCloud(token);
		} else {
			// MOD ADMIN / LOGIN
			const loginTime = localStorage.getItem('jersyx_login_time');
			const isSessionValid = loginTime && (Date.now() - loginTime < 8 * 60 * 60 * 1000);

			if (isSessionValid) {
				showAppMode('admin');
				await populateCloudDropdown();
				await autoGenerateInvoiceNo();
			} else {
				showAppMode('login');
			}
		}
	} catch (error) {
		console.error("Error loading app:", error);
	} finally {
		// HANYA SELEPAS SEMUA SIAP, BUANG LOADING OVERLAY
		if (loadingOverlay) {
			loadingOverlay.style.transition = "opacity 0.5s";
			loadingOverlay.style.opacity = "0";
			setTimeout(() => {
				loadingOverlay.style.display = "none";
			}, 500);
		}
	}
};

function checkLogin() {
	const pass = document.getElementById('adminPass').value;
	if (pass === ADMIN_PASSWORD) {
		// Simpan waktu login
		localStorage.setItem('jersyx_login_time', Date.now());

		showAppMode('admin');
		populateCloudDropdown();
		generatePreview();

		// TAMBAH INI: Jana no invoice secara automatik
		autoGenerateInvoiceNo();
	} else {
		document.getElementById('loginMsg').innerText = "Password Salah!";
	}
}

function showAppMode(mode) {
	const loginOverlay = document.getElementById('loginOverlay');
	const mainApp = document.getElementById('mainApp');

	// ... elemen lain sama seperti sebelum ini ...

	// Sorok semua dulu untuk keselamatan
	loginOverlay.style.display = 'none';
	mainApp.style.display = 'none';

	if (mode === 'login') {
		loginOverlay.style.display = 'flex';
	} else {
		mainApp.style.display = 'block';
		if (mode === 'admin') {
			// Tunjukkan elemen admin
			document.querySelector('.topbar').style.display = 'flex';
			document.querySelector('.topbarCust').style.display = 'none';
			document.querySelector('.col.form').style.display = 'block';
			document.querySelector('.col.preview').style.width = '';
		} else if (mode === 'customer') {
			// Sembunyikan elemen admin secara total
			document.querySelector('.topbar').style.display = 'none';
			document.querySelector('.topbarCust').style.display = 'flex';
			document.querySelector('.col.form').style.display = 'none';
			document.querySelector('.col.preview').style.width = '100%';
			document.querySelector('.col.preview').style.margin = '0 auto';
			if (document.getElementById('shareSection')) document.getElementById('shareSection').style.display = 'none';
		}
	}
}

// Fungsi Logout Manual (Jika perlu)
function logout() {
	localStorage.removeItem('jersyx_login_time');
	window.location.reload();
}

/* --- FUNGSI SAVE & DELETE (CLOUDSYNC) --- */

async function saveToCloud() {
	const btn = document.getElementById('btnSave');
	const originalText = btn.innerText;
	btn.innerText = "Saving...";
	btn.disabled = true;

	const data = getInvoiceFormData();
	data.action = "save";

	try {
		await fetch(WEB_APP_URL, {
			method: 'POST',
			mode: 'no-cors',
			headers: {
				'Content-Type': 'text/plain'
			},
			body: JSON.stringify(data)
		});

		// Simpan ke LocalStorage
		localStorage.setItem(data.invNo, JSON.stringify(data));

		// Paparkan bahagian Share terus tanpa perlu Load semula
		// Kita gunakan format link berdasarkan data yang kita baru hantar
		prepareShareSectionDirect(data.invNo);

		alert("Invoice Berjaya Disimpan & Link Share Telah Dijana!");

		// Update dropdown di belakang tabir
		populateCloudDropdown();

	} catch (e) {
		alert("Ralat: " + e.message);
	} finally {
		btn.innerText = originalText;
		btn.disabled = false;
	}
}

async function prepareShareSectionDirect(invNo) {
	const section = document.getElementById('shareSection');
	const input = document.getElementById('shareUrl');

	// Kita cuba cari token yang baru disimpan tadi dari Google Sheets
	try {
		const response = await fetch(`${WEB_APP_URL}?action=list`);
		const invoices = await response.json();

		// Cari invoice yang baru kita simpan tadi dalam senarai
		const found = invoices.find(i => i.invNo === invNo);

		if (found) {
			const fullUrl = window.location.origin + window.location.pathname + "#" + found.token;
			input.value = fullUrl;
			section.style.display = 'block';
		} else {
			// Jika Google Sheets lambat update, kita tunggu 2 saat dan cuba lagi sekali
			setTimeout(() => prepareShareSectionDirect(invNo), 2000);
		}
	} catch (e) {
		console.log("Menunggu token dari Cloud...");
	}
}

async function deleteInvoice() {
	const invNo = `INV-${document.getElementById('fInvoiceNo').value}`;

	// Jangan bagi padam kalau No Invoice kosong
	if (invNo === "INV-") {
		alert("Sila load invoice terlebih dahulu sebelum padam.");
		return;
	}

	if (!confirm(`Padam invoice ${invNo} secara kekal dari Cloud?`)) return;

	const btn = document.getElementById('btnClear'); // Butang padam anda
	const originalText = btn.innerText;
	btn.innerText = "Deleting...";
	btn.disabled = true;

	try {
		// Hantar request padam ke Google Script
		await fetch(WEB_APP_URL, {
			method: 'POST',
			mode: 'no-cors', // Guna no-cors untuk Google Script
			headers: {
				'Content-Type': 'text/plain'
			},
			body: JSON.stringify({
				action: "delete",
				invNo: invNo
			})
		});

		// Padam dari backup LocalStorage
		localStorage.removeItem(invNo);

		alert(`Invoice ${invNo} telah dipadam dari Cloud.`);

		// KEKAL DALAM SISTEM: Kita cuma kosongkan borang, bukan reload page
		resetFormOnly();

		// Update semula dropdown supaya nama yang dipadam hilang
		await populateCloudDropdown();

	} catch (e) {
		alert("Ralat teknikal: " + e.message);
	} finally {
		btn.innerText = originalText;
		btn.disabled = false;
	}
}

// Fungsi baharu untuk kosongkan borang tanpa logout
function resetFormOnly() {
	document.getElementById('fInvoiceNo').value = '';
	document.getElementById('fCustomer').value = '';
	document.getElementById('fAddress').value = '';
	document.getElementById('fPhone').value = '';
	document.getElementById('fDeposit').value = 0;
	document.getElementById('fDesign').value = 0;
	document.getElementById('fPaid').value = 0;
	ITEMS_LIST.innerHTML = '';
	addItem('SUBLIMATION JERSEY ROUNDNECK S/S', 1, 40.00); // Reset item asal
	generatePreview();
}

/* --- SISTEM LOAD DARI CLOUD --- */

// 1. Fungsi untuk isi dropdown dengan senarai nama dari Google Sheet
async function populateCloudDropdown() {
	const select = document.getElementById('fLoadInvoiceSelect');
	if (!select) return;

	try {
		const response = await fetch(`${WEB_APP_URL}?action=list`);
		const invoices = await response.json();

		select.innerHTML = '<option value="">-- Pilih Invoice --</option>';

		invoices.reverse().forEach(inv => {
			const opt = document.createElement('option');
			opt.value = inv.token; // Guna token sebagai kunci rahsia
			opt.textContent = `${inv.invNo} - ${inv.customer}`;
			select.appendChild(opt);
		});
	} catch (e) {
		console.error("Gagal ambil senarai:", e);
		select.innerHTML = '<option value="">Gagal muat data cloud</option>';
	}
}

// 2. Fungsi untuk tarik data penuh bila butang Load ditekan
async function handleLoadButtonClick() {
	const select = document.getElementById('fLoadInvoiceSelect');
	const token = select.value;

	if (!token) {
		alert("Sila pilih invoice dari senarai dahulu.");
		return;
	}

	const btn = document.getElementById('btnLoadCloud');
	btn.innerText = "Loading...";
	btn.disabled = true;

	try {
		const response = await fetch(`${WEB_APP_URL}?token=${token}`);
		const data = await response.json();

		if (data && data !== "Not Found") {
			// Masukkan data ke dalam borang
			document.getElementById('fInvoiceNo').value = data.invNo.replace('INV-', '');
			document.getElementById('fCustomer').value = data.customer;
			document.getElementById('fAddress').value = data.address;
			document.getElementById('fPhone').value = data.phone;
			document.getElementById('fPaymentStatus').value = data.status;
			document.getElementById('fDeposit').value = data.deposit;
			document.getElementById('fDesign').value = data.designCharge;
			document.getElementById('fPaid').value = data.paid;
			document.getElementById('fIssuedBy').value = data.issuedBy;
			document.getElementById('fAcceptedBy').value = data.acceptedBy;

			// Kosongkan item lama dan masukkan item baharu
			ITEMS_LIST.innerHTML = '';
			data.items.forEach(it => addItem(it.desc, it.qty, it.price));

			// Update preview di sebelah kanan
			generatePreview();
			alert("Data berjaya di-load!");
		}
	} catch (e) {
		alert("Ralat memuatkan data: " + e.message);
	} finally {
		btn.innerText = "Load Data";
		btn.disabled = false;
	}
}

// 3. Sambungkan butang dengan fungsi (PENTING!)
document.getElementById('btnLoadCloud').addEventListener('click', handleLoadButtonClick);

// Tambah event listener untuk dropdown
document.getElementById('fLoadInvoiceSelect').addEventListener('change', async (e) => {
	const token = e.target.value;
	if (token) {
		await loadInvoiceFromCloud(token);
	}
});

async function loadInvoiceFromCloud(token) {
	try {
		const response = await fetch(`${WEB_APP_URL}?token=${token}`);
		const data = await response.json();

		if (data && data !== "Not Found") {
			// Isi maklumat asas
			document.getElementById('fInvoiceNo').value = data.invNo.replace('INV-', '');
			document.getElementById('fCustomer').value = data.customer;
			document.getElementById('fAddress').value = data.address;
			document.getElementById('fPhone').value = data.phone;
			document.getElementById('fPaymentStatus').value = data.status;
			document.getElementById('fDeposit').value = data.deposit;
			document.getElementById('fDesign').value = data.designCharge;
			document.getElementById('fDiscount').value = data.discount;
			document.getElementById('fPaid').value = data.paid;
			document.getElementById('fIssuedBy').value = data.issuedBy;
			document.getElementById('fAcceptedBy').value = data.acceptedBy;

			// Kosongkan item lama dan masukkan item baharu
			ITEMS_LIST.innerHTML = '';
			data.items.forEach(it => addItem(it.desc, it.qty, it.price));

			// Update preview
			generatePreview();
		}
	} catch (e) {
		alert("Gagal memuatkan data.");
	}
	// ... dalam fungsi loadInvoiceFromCloud ...
	prepareShareSection(token);
}

/* --- LOGIK ASAL ANDA (DIKEKALKAN) --- */

function createItemRow(desc = '', qty = 1, price = 0) {
	const wrapper = document.createElement('div');
	wrapper.className = 'item-row';
	wrapper.innerHTML = `
        <input type="text" class="i-desc" placeholder="Description" value="${desc}">
        <input type="number" class="i-qty" min="0" value="${qty}">
        <input type="number" class="i-price" min="0" step="0.01" value="${price}">
        <button type="button" class="btn remove" style="padding:6px 8px">✕</button>
    `;
	wrapper.querySelector('.remove').addEventListener('click', () => {
		wrapper.remove();
		generatePreview();
	});
	wrapper.querySelectorAll('input').forEach(input => {
		input.addEventListener('change', generatePreview);
	});
	return wrapper;
}

function addItem(desc = '', qty = 1, price = 0) {
	ITEMS_LIST.appendChild(createItemRow(desc, qty, price));
}

function gatherItems() {
	const rows = [];
	ITEMS_LIST.querySelectorAll('.item-row').forEach(r => {
		const desc = r.querySelector('.i-desc')?.value.trim();
		const qty = parseFloat(r.querySelector('.i-qty')?.value) || 0;
		const price = parseFloat(r.querySelector('.i-price')?.value) || 0;
		if (desc || qty || price) {
			rows.push({
				desc,
				qty,
				price,
				amount: qty * price
			});
		}
	});
	return rows;
}

function getInvoiceFormData() {
	const data = {};
	for (const [id, key] of Object.entries(INPUT_FIELDS)) {
		const input = document.getElementById(id);
		if (input) {
			data[key] = input.type === 'number' ? parseFloat(input.value) || 0 : input.value.trim();
		}
	}

	const rawVal = data.invoiceInput || 'TEMP';
	const invNo = rawVal.startsWith("INV-") ? rawVal : `INV-${rawVal}`;
	const items = gatherItems();

	const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

	// LOGIK BARU: Tolak Discount & Deposit, Tambah Design Charge
	const grand = subtotal - (data.discount || 0) - (data.deposit || 0) + (data.designCharge || 0);
	const balance = grand - (data.paid || 0);

	return {
		...data,
		invNo,
		items,
		subtotal,
		grand,
		balance
	};
}

function generatePreview() {
	// 1. Ambil data terkini (sama ada dari taipan manual atau hasil LOAD dari Cloud)
	const data = getInvoiceFormData();

	// Destructuring data supaya pembolehubah di bawah (invNo, customer, dll) berfungsi
	const {
		invNo,
		customer,
		address,
		phone,
		status,
		paid,
		balance,
		items,
		subtotal,
		deposit,
		designCharge,
		grand,
		issuedBy,
		acceptedBy
	} = data;

	// 2. Kekalkan logik warna status asal anda
	const statusClass = `status-${status}`;

	// 3. Bina baris item (Table Rows)
	const itemsHtml = items.map((it, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${it.desc}</td>
          <td class="right">${it.qty}</td>
          <td class="right">${fmt(it.price)}</td>
          <td class="right">${fmt(it.amount)}</td>
        </tr>
    `).join('');

	// 4. Masukkan Template HTML Asal v1 anda
	INVOICE_ROOT.innerHTML = `
        <div class="header">
          <div class="logo-block">
            <img src="${LOGO_DATA_URL}" alt="logo">
            <div>
              <div class="company-name">JERSYX APPAREL</div>
              <div style="font-size:12px;" class="muted">(003771902-W)</div>
              <div style="font-size:12px; margin-top:6px" class="muted">
                No. 53, Kampung Masjid Lama,<br>
                Mukim Lepai, 05350 Alor Setar, Kedah<br>
                Phone: 011-6241 5446 | Email: jersyxapparel@gmail.com
              </div>
            </div>
          </div>
          <div class="meta">
            <div style="font-size:20px; font-weight:700;">INVOICE</div>
            <div>No. Inv: ${invNo}</div>
            <div>By: ${issuedBy}</div>
            <div class="muted">${new Date().toLocaleDateString('en-GB')}</div>
          </div>
        </div>

        <hr class="sep">

        <div class="cust-pay">
          <div class="cust">
            <div style="font-weight:700">Customer</div>
            <div class="muted">${customer || '-'}</div>
            <div class="muted" style="margin-top:6px; white-space: pre-wrap;">${address || '-'}</div>
            <div class="muted" style="margin-top:6px">${phone || '-'}</div>
          </div>
          <div class="pay">
            <div style="font-weight:700">Payment Status</div>
            <div class="${statusClass}" style="font-size:20px; font-weight:700; margin-top:6px">${status}</div>
            <div style="margin-top:6px" class="muted"><strong>Total Paid:</strong> RM ${fmt(paid)}</div>
            <div style="margin-top:6px" class="muted"><strong>Balance:</strong> RM ${fmt(balance)}</div>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th style="width:6%">#</th>
              <th>Description</th>
              <th style="width:12%" class="right">Qty</th>
              <th style="width:15%" class="right">Unit (RM)</th>
              <th style="width:15%" class="right">Amount (RM)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          <table>
            <tr><td class="muted">Subtotal</td><td class="right">${fmt(subtotal)}</td></tr>
            <tr><td class="muted">Deposit</td><td class="right">-${fmt(deposit)}</td></tr>
            <tr><td class="muted">Design Charge</td><td class="right">${fmt(designCharge)}</td></tr>
            ${data.discount > 0 ? `<tr><td class="muted">Discount</td><td class="right">- ${fmt(data.discount)}</td></tr>` : ''}
            <tr><td style="font-weight:700; padding-top:8px">Grand Total</td><td class="right" style="font-weight:700; padding-top:8px">RM ${fmt(grand)}</td></tr>
          </table>
        </div>

        <div class="footer" style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div class="footer-column" style="width:48%; text-align:left; margin-left:30px;">
            <p>Issued By:</p>
            <div class="stamp">
              <img src="${STAMP_DATA_URL}" alt="Company Stamp">
            </div>
          </div>
          <div class="footer-column" style="width:48%; text-align:right; margin-right:80px;">
            <p>Accepted By:</p>
            <p>${acceptedBy}</p>
            <br>
          </div>
        </div>
    `;
}

function clearInvoice() {
	window.location.reload();
}

/* --- EVENT LISTENERS --- */
document.getElementById('addItemBtn').addEventListener('click', () => {
	addItem();
	generatePreview();
});
document.getElementById('btnSave').addEventListener('click', saveToCloud);
document.getElementById('btnClear').addEventListener('click', deleteInvoice); // Ganti Clear dengan Delete
document.getElementById('btnGenerate').addEventListener('click', generatePreview);
document.getElementById('btnGenerate2').addEventListener('click', generatePreview);
document.getElementById('btnPrint').addEventListener('click', () => window.print());
document.getElementById("btnPdf").addEventListener("click", downloadPDF);
document.getElementById('btnPrint2').addEventListener('click', () => window.print());
document.getElementById("btnPdf2").addEventListener("click", downloadPDF);

// --- 2. DOWNLOAD PDF (VERSI PALING SIMPLE) ---
function downloadPDF() {
	const element = document.querySelector('.col.preview');
	if (!element) return alert("Preview tak jumpa");

	const opt = {
		margin: 0.3,
		filename: `Invoice_${document.getElementById('fInvoiceNo').value}.pdf`,
		image: {
			type: 'jpeg',
			quality: 0.98
		},
		html2canvas: {
			scale: 2,
			useCORS: true
		},
		jsPDF: {
			unit: 'in',
			format: 'a4',
			orientation: 'portrait'
		}
	};
	html2pdf().set(opt).from(element).save();
}

// Initial Item
addItem('SUBLIMATION JERSEY ROUNDNECK S/S', 1, 40.00);

// Fungsi dipanggil secara automatik bila invoice di-load
function prepareShareSection(token) {

	// Cek jika kita sedang dalam mod customer (URL ada hash token)
	const isCustomer = window.location.hash.length > 5;

	if (isCustomer) return; // Berhenti di sini, jangan buat apa-apa
	const section = document.getElementById('shareSection');
	const input = document.getElementById('shareUrl');

	if (token) {
		const fullUrl = window.location.origin + window.location.pathname + "#" + token;
		input.value = fullUrl;
		section.style.display = 'block';
	} else {
		section.style.display = 'none';
	}
}

// Fungsi Copy ke Clipboard
function copyLink() {
	const copyText = document.getElementById("shareUrl");
	copyText.select();
	copyText.setSelectionRange(0, 99999); // Untuk mobile
	navigator.clipboard.writeText(copyText.value);
	alert("Link telah di-copy!");
}

// Fungsi WhatsApp
function shareWhatsapp() {
	const url = document.getElementById("shareUrl").value;
	const invNo = document.getElementById('fInvoiceNo').value;
	const customer = document.getElementById('fCustomer').value;

	const message = `Salam Tuan/Puan, berikut adalah link invoice (INV-${invNo}) daripada JERSYX APPAREL: \n\n${url}\n\nTerima kasih!`;
	const encodedMsg = encodeURIComponent(message);

	window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
}

async function autoGenerateInvoiceNo() {
	const field = document.getElementById('fInvoiceNo');
	const today = new Date();

	// Ambil tahun semasa (Contoh: 2026)
	const currentYear = today.getFullYear().toString();

	try {
		// Tanya Google Sheets untuk No Invoice terakhir
		const response = await fetch(`${WEB_APP_URL}?action=getLastInv`);
		const lastInv = await response.text();

		let newSerial = "0001"; // Default jika tahun baru atau belum ada data

		// Logik: Jika ada data DAN data itu adalah dari tahun yang sama
		if (lastInv !== "none" && lastInv.includes(currentYear)) {
			// Kita pecahkan INV-20260005 kepada ["INV-", "0005"] menggunakan tahun sebagai pemisah
			const parts = lastInv.split(currentYear);
			if (parts.length > 1) {
				const lastSerialNum = parseInt(parts[1]); // Tukar "0005" jadi 5
				newSerial = (lastSerialNum + 1).toString().padStart(4, '0'); // Jadi "0006"
			}
		}

		// Set nilai ke input: TAHUN + 4 DIGIT SIRI (Contoh: 20260001)
		field.value = `${currentYear}${newSerial}`;

		generatePreview();

	} catch (e) {
		console.error("Gagal jana no invoice:", e);
		// Fallback: Tahun sekarang + 0001
		field.value = `${currentYear}0001`;
	}
}