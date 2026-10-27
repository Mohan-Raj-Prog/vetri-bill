(function () {
  "use strict";
  var B = window.BillPDF;
  var $ = function (id) { return document.getElementById(id); };

  // ------------------------------------------------------------ storage
  var K_BILLS = "vt_bills", K_PROFILE = "vt_profile", K_LOGO = "vt_logo", K_BACKUP = "vt_last_backup";
  var DEFAULT_PROFILE = {
    name: "VETRI TRAVELS",
    address1: "NO.5 Nadavazhi amman kovil street,",
    address2: "jeeva Nagar, Thorapadi vellore -632002",
    phone: "7010522022, 8056979626"
  };
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { toast("Could not save - phone storage is full or blocked"); return false; }
  }
  var profile = Object.assign({}, DEFAULT_PROFILE, lsGet(K_PROFILE, {}));
  var bills = lsGet(K_BILLS, []);
  var editingNo = null; // bill number being edited (null = new)

  // ------------------------------------------------------------ field definitions (icon, label, colour)
  var CUST = [
    ["bill_no", "🧾", "Bill No", "#1565C0", "text"],
    ["cust_name", "👤", "Bill To (name)", "#1565C0", "text"],
    ["cust_address", "🏠", "Customer address line 1", "#C62828", "text"],
    ["cust_address2", "🏠", "Customer address line 2", "#C62828", "text"],
    ["cust_phone", "📱", "Customer phone", "#2E7D32", "tel"]
  ];
  var TRIP = [
    ["from", "🚩", "From", "#F9A825", "text"],
    ["to", "📌", "To", "#D32F2F", "text"],
    ["start_date", "📅", "Start date", "#00838F", "date"],
    ["end_date", "📅", "End date", "#00838F", "date"],
    ["time", "⏰", "Time", "#EF6C00", "time"],
    ["vehicle_type", "🚗", "Vehicle type", "#455A64", "text"],
    ["vehicle_no", "🔢", "Vehicle number", "#455A64", "text"],
    ["driver", "🧑", "Driver", "#6A1B9A", "text"]
  ];
  var FARE = [
    ["km", "🛣️", "Total km", "#2E7D32", "number"],
    ["rate", "💰", "Rate per km", "#2E7D32", "number"],
    ["allowance", "💵", "Driver allowance", "#2E7D32", "number"],
    ["other_label", "➕", "Other charges label", "#EF6C00", "text"],
    ["other", "💸", "Other charges amount", "#EF6C00", "number"]
  ];
  var BIZ = [
    ["name", "🏢", "Travels name", "#B8860B", "text"],
    ["address1", "📍", "Address line 1", "#C62828", "text"],
    ["address2", "🏠", "Address line 2", "#C62828", "text"],
    ["phone", "📞", "Mobile numbers", "#2E7D32", "text"]
  ];
  var BILL_KEYS = [].concat(CUST, TRIP, FARE).map(function (f) { return f[0]; });

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function buildCard(container, title, color, fields, idPrefix, wide) {
    var card = el("div", "card"); card.style.setProperty("--c", color);
    card.appendChild(el("div", "card-title", title));
    var body = el("div", "card-body");
    fields.forEach(function (f) {
      var key = f[0], type = f[4];
      var lab = el("label", "field"); lab.style.setProperty("--fc", f[3]);
      lab.innerHTML = '<span class="lbl"><span class="ico">' + f[1] + "</span>" + esc(f[2]) + "</span>";
      var inp = el("input"); inp.type = type; inp.id = idPrefix + key; inp.autocomplete = "off";
      if (type === "number") { inp.inputMode = "decimal"; inp.step = "any"; inp.min = "0"; }
      if (type === "tel") inp.inputMode = "tel";
      if (["from", "to", "driver", "vehicle_type", "vehicle_no", "cust_name"].indexOf(key) >= 0) inp.setAttribute("list", "dl_" + key);
      lab.appendChild(inp); body.appendChild(lab);
    });
    card.appendChild(body); container.appendChild(card);
  }

  // ------------------------------------------------------------ build screens
  function buildScreens() {
    var fc = $("formCards");
    buildCard(fc, "🧾  Bill &amp; Customer", "#1565C0", CUST, "f_");
    buildCard(fc, "🚗  Trip Details", "#00838F", TRIP, "f_");
    buildCard(fc, "💰  Fare", "#2E7D32", FARE, "f_");
    ["from", "to", "driver", "vehicle_type", "vehicle_no", "cust_name"].forEach(function (k) {
      var dl = el("datalist"); dl.id = "dl_" + k; document.body.appendChild(dl);
    });
    buildCard($("settingsCards"), "🏢  Your Business (editable, saved)", "#B8860B", BIZ, "p_");
    var sc = $("settingsCards");
    var saveRow = el("div", "btn-row");
    saveRow.innerHTML = '<button class="btn green" id="btnSaveProfile" type="button">💾 Save business details</button>';
    sc.appendChild(saveRow);
    BIZ.forEach(function (f) { $("p_" + f[0]).value = profile[f[0]] || ""; });
  }

  function refreshSuggestions() {
    var map = { from: "from", to: "to", driver: "driver", vehicle_type: "vehicle_type", vehicle_no: "vehicle_no", cust_name: "cust_name" };
    var extra = { vehicle_type: ["Sedan", "SUV", "Innova", "Hatchback", "Tempo Traveller"] };
    Object.keys(map).forEach(function (k) {
      var seen = {}, vals = (extra[k] || []).slice();
      vals.forEach(function (v) { seen[v.toLowerCase()] = 1; });
      bills.slice().reverse().forEach(function (b) {
        var v = (b[k] || "").trim();
        if (v && !seen[v.toLowerCase()]) { seen[v.toLowerCase()] = 1; vals.push(v); }
      });
      $("dl_" + k).innerHTML = vals.slice(0, 40).map(function (v) { return '<option value="' + esc(v) + '">'; }).join("");
    });
  }

  // ------------------------------------------------------------ form helpers
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function nextBillNo() {
    var n = 0;
    bills.forEach(function (b) { var d = String(b.bill_no).replace(/\D/g, ""); if (d) n = Math.max(n, parseInt(d, 10)); });
    return "A" + ("00000" + (n + 1)).slice(-5);
  }
  function getForm() {
    var v = {}; BILL_KEYS.forEach(function (k) { v[k] = $("f_" + k).value.trim(); }); return v;
  }
  function setForm(v) { BILL_KEYS.forEach(function (k) { $("f_" + k).value = v[k] == null ? "" : v[k]; }); }
  function toIsoDate(s) { // old desktop bills used dd/mm/yyyy
    var m = String(s || "").match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    return m ? m[3] + "-" + pad(+m[2]) + "-" + pad(+m[1]) : s;
  }
  function newBill() {
    editingNo = null;
    setForm({ bill_no: nextBillNo(), start_date: today(), end_date: today(), vehicle_type: "Sedan" });
    $("editingNote").classList.add("hidden");
    updateTotal();
    window.scrollTo(0, 0);
  }
  function updateTotal() {
    var t = B.computeTotals(getForm());
    $("totalText").textContent = "Total: " + B.RUPEE + B.inr(t.total);
    $("totalWords").textContent = t.total ? B.amountInWords(t.total) : "";
  }

  // ------------------------------------------------------------ assets (fonts + logo)
  var fontCache = null, defaultLogoCache = null;
  function bufToB64(buf) {
    var bytes = new Uint8Array(buf), chunk = 0x8000, out = "";
    for (var i = 0; i < bytes.length; i += chunk) out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(out);
  }
  function loadFonts() {
    if (fontCache) return Promise.resolve(fontCache);
    return Promise.all([fetch("fonts/NotoSans-Regular.ttf"), fetch("fonts/NotoSans-Bold.ttf")]).then(function (rs) {
      return Promise.all(rs.map(function (r) { if (!r.ok) throw new Error("font"); return r.arrayBuffer(); }));
    }).then(function (bufs) { fontCache = { regular: bufToB64(bufs[0]), bold: bufToB64(bufs[1]) }; return fontCache; });
  }
  function blobToDataUrl(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  function loadLogo() {
    var custom = lsGet(K_LOGO, null);
    if (custom) return Promise.resolve(custom);
    if (defaultLogoCache) return Promise.resolve(defaultLogoCache);
    return fetch("logo.png").then(function (r) { return r.blob(); }).then(blobToDataUrl)
      .then(function (d) { defaultLogoCache = d; return d; }).catch(function () { return null; });
  }

  // ------------------------------------------------------------ PDF
  function makePdfBlob(bill) {
    return Promise.all([loadFonts(), loadLogo()]).then(function (a) {
      var doc = B.buildPdf(bill, profile, { jsPDF: window.jspdf.jsPDF, fonts: a[0], logo: a[1] });
      return doc.output("blob");
    });
  }
  var lastBlob = null, lastName = "", lastUrl = null;
  function showSheet(blob, bill) {
    lastBlob = blob; lastName = bill.bill_no + ".pdf";
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    $("sheetTitle").textContent = "✅ Bill " + bill.bill_no + " ready";
    $("sheetSub").textContent = (bill.cust_name || "") + "  •  " + B.RUPEE + B.inr(bill.total || 0);
    $("sheet").classList.remove("hidden");
  }
  function sharePdf() {
    if (!lastBlob) return;
    var file = new File([lastBlob], lastName, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: lastName }).catch(function (e) { if (e && e.name !== "AbortError") downloadPdf(); });
    } else { downloadPdf(); toast("Sharing not supported here - downloaded instead"); }
  }
  function downloadPdf() {
    if (!lastUrl) return;
    var a = document.createElement("a"); a.href = lastUrl; a.download = lastName; document.body.appendChild(a); a.click(); a.remove();
  }
  function openPdf() { if (lastUrl) window.open(lastUrl, "_blank"); }

  // ------------------------------------------------------------ save bill
  function saveBill() {
    var v = getForm();
    if (!v.bill_no) { toast("Bill No is required"); return; }
    if (!v.cust_name) { toast("Please enter the Bill To name"); $("f_cust_name").focus(); return; }
    var idx = -1;
    bills.forEach(function (b, i) { if (b.bill_no === v.bill_no) idx = i; });
    v.stamp = idx >= 0 ? bills[idx].stamp : B.nowStamp();
    v.total = B.computeTotals(v).total;
    var btn = $("btnSave"); btn.disabled = true;
    makePdfBlob(v).then(function (blob) {
      if (idx >= 0) bills[idx] = v; else bills.push(v);
      if (!lsSet(K_BILLS, bills)) { if (idx < 0) bills.pop(); return; }
      editingNo = v.bill_no;
      $("editingNote").textContent = "Editing bill " + v.bill_no + " - saving again updates the same bill. Tap ➕ New for a fresh one.";
      $("editingNote").classList.remove("hidden");
      refreshSuggestions(); renderHistory(); showSheet(blob, v);
    }).catch(function (e) { toast("Could not create PDF: " + (e && e.message ? e.message : e)); })
      .then(function () { btn.disabled = false; });
  }

  // ------------------------------------------------------------ history
  function renderHistory() {
    var q = $("searchBox").value.trim().toLowerCase();
    var list = $("historyList"); list.innerHTML = "";
    var items = bills.slice().reverse().filter(function (b) {
      if (!q) return true;
      return [b.bill_no, b.cust_name, b.from, b.to, b.driver, b.vehicle_no].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    $("historyEmpty").classList.toggle("hidden", bills.length > 0);
    items.forEach(function (b) {
      var d = el("div", "bill-item");
      d.innerHTML =
        '<div class="bill-top"><span class="bill-no">' + esc(b.bill_no) + '</span><span class="bill-amt">' + B.RUPEE + B.inr(b.total || 0) + "</span></div>" +
        '<div class="bill-mid">👤 ' + esc(b.cust_name) + "</div>" +
        '<div class="bill-sub">🚩 ' + esc(b.from) + " → 📌 " + esc(b.to) + "  •  📅 " + esc(B.fmtDate(toIsoDate(b.start_date))) + "</div>" +
        '<div class="bill-sub">🕒 Created ' + esc(b.stamp) + "</div>" +
        '<div class="bill-btns"><button class="btn small blue" data-a="edit" type="button">✏️ Edit</button>' +
        '<button class="btn small green" data-a="pdf" type="button">📄 PDF</button>' +
        '<button class="btn small red" data-a="del" type="button">🗑️</button></div>';
      d.querySelector('[data-a="edit"]').onclick = function () { loadBill(b); };
      d.querySelector('[data-a="pdf"]').onclick = function () {
        makePdfBlob(b).then(function (blob) { showSheet(blob, b); }).catch(function (e) { toast("PDF error: " + e.message); });
      };
      d.querySelector('[data-a="del"]').onclick = function () {
        if (confirm("Delete bill " + b.bill_no + "? This cannot be undone.")) {
          bills = bills.filter(function (x) { return x !== b; }); lsSet(K_BILLS, bills); renderHistory(); refreshSuggestions();
        }
      };
      list.appendChild(d);
    });
  }
  function loadBill(b) {
    var v = Object.assign({}, b);
    v.start_date = toIsoDate(v.start_date); v.end_date = toIsoDate(v.end_date);
    setForm(v); editingNo = b.bill_no; updateTotal();
    $("editingNote").textContent = "Editing bill " + b.bill_no + " - saving again updates the same bill. Tap ➕ New for a fresh one.";
    $("editingNote").classList.remove("hidden");
    switchView("new");
  }

  // ------------------------------------------------------------ settings
  function saveProfile() {
    var p = {}; BIZ.forEach(function (f) { p[f[0]] = $("p_" + f[0]).value.trim(); });
    if (!p.name) { toast("Travels name is required"); return; }
    profile = p; if (lsSet(K_PROFILE, p)) { updateBanner(); toast("Business details saved ✅"); }
  }
  function updateBanner() {
    $("bannerName").textContent = (profile.name || "").toUpperCase();
    loadLogo().then(function (d) { if (d) { $("bannerLogo").src = d; $("settingsLogo").src = d; } });
  }
  function resizeImage(file, max) {
    return blobToDataUrl(file).then(function (url) {
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () {
          var s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL("image/png"));
        };
        img.onerror = rej; img.src = url;
      });
    });
  }
  function backupInfo() {
    var t = lsGet(K_BACKUP, null);
    $("backupInfo").textContent = bills.length + " bill(s) stored. " + (t ? "Last backup: " + t : "No backup taken yet.");
  }
  function doBackup() {
    var data = { app: "vetri-bills", version: 1, exported: new Date().toISOString(), profile: profile, logo: lsGet(K_LOGO, null), bills: bills };
    var blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    var a = document.createElement("a"), d = new Date();
    a.href = URL.createObjectURL(blob); a.download = "vetri-bills-backup-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    lsSet(K_BACKUP, B.nowStamp()); backupInfo(); toast("Backup downloaded");
  }
  function doRestore(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var data = JSON.parse(fr.result);
        if (!data || !Array.isArray(data.bills)) throw new Error("bad file");
        if (!confirm("Restore " + data.bills.length + " bill(s)? Bills with the same number will be replaced.")) return;
        data.bills.forEach(function (nb) {
          var i = -1; bills.forEach(function (b, k) { if (b.bill_no === nb.bill_no) i = k; });
          if (i >= 0) bills[i] = nb; else bills.push(nb);
        });
        bills.sort(function (a, b) { return String(a.bill_no).localeCompare(String(b.bill_no)); });
        lsSet(K_BILLS, bills);
        if (data.profile) { profile = Object.assign({}, DEFAULT_PROFILE, data.profile); lsSet(K_PROFILE, profile); BIZ.forEach(function (f) { $("p_" + f[0]).value = profile[f[0]] || ""; }); }
        if (data.logo) lsSet(K_LOGO, data.logo);
        updateBanner(); renderHistory(); refreshSuggestions(); backupInfo(); newBill(); toast("Restore complete ✅");
      } catch (e) { toast("That file is not a valid backup"); }
    };
    fr.readAsText(file);
  }

  // ------------------------------------------------------------ misc UI
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.add("hidden"); }, 2600);
  }
  function switchView(name) {
    ["new", "history", "settings"].forEach(function (v) { $("view-" + v).classList.toggle("active", v === name); });
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) { t.classList.toggle("active", t.dataset.view === name); });
    document.body.classList.toggle("no-actions", name !== "new");
    if (name === "history") renderHistory();
    if (name === "settings") backupInfo();
    window.scrollTo(0, 0);
  }

  var deferredInstall = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferredInstall = e; $("btnInstall").classList.remove("hidden");
  });
  window.addEventListener("appinstalled", function () { $("installStatus").textContent = "Installed ✅"; $("btnInstall").classList.add("hidden"); });

  // ------------------------------------------------------------ init
  function init() {
    buildScreens();
    refreshSuggestions();
    newBill();
    updateBanner();
    backupInfo();

    ["km", "rate", "allowance", "other"].forEach(function (k) { $("f_" + k).addEventListener("input", updateTotal); });
    // fill address/phone from an earlier bill of the same customer
    $("f_cust_name").addEventListener("change", function () {
      var name = this.value.trim().toLowerCase(); if (!name) return;
      var prev = null; bills.forEach(function (b) { if ((b.cust_name || "").trim().toLowerCase() === name) prev = b; });
      if (prev && !$("f_cust_address").value && !$("f_cust_address2").value && !$("f_cust_phone").value) {
        $("f_cust_address").value = prev.cust_address || ""; $("f_cust_address2").value = prev.cust_address2 || ""; $("f_cust_phone").value = prev.cust_phone || "";
      }
    });

    $("btnSave").onclick = saveBill;
    $("btnNew").onclick = newBill;
    $("btnSaveProfile").onclick = saveProfile;
    $("searchBox").addEventListener("input", renderHistory);
    $("shShare").onclick = sharePdf; $("shDownload").onclick = downloadPdf; $("shOpen").onclick = openPdf;
    $("shClose").onclick = function () { $("sheet").classList.add("hidden"); };
    $("sheet").addEventListener("click", function (e) { if (e.target === $("sheet")) $("sheet").classList.add("hidden"); });
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) { t.onclick = function () { switchView(t.dataset.view); }; });
    $("btnBackup").onclick = doBackup;
    $("restoreFile").onchange = function () { if (this.files[0]) doRestore(this.files[0]); this.value = ""; };
    $("logoFile").onchange = function () {
      var f = this.files[0]; this.value = ""; if (!f) return;
      resizeImage(f, 300).then(function (d) { if (lsSet(K_LOGO, d)) { updateBanner(); toast("Logo updated ✅"); } })
        .catch(function () { toast("Could not read that image"); });
    };
    $("logoReset").onclick = function () { localStorage.removeItem(K_LOGO); updateBanner(); toast("Default logo restored"); };
    $("btnInstall").onclick = function () { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; $("btnInstall").classList.add("hidden"); } };

    var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    $("installStatus").textContent = standalone ? "Running as an installed app ✅" : "";

    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(function () {});
    loadFonts().catch(function () {}); // warm up so the first PDF is quick
  }
  init();
})();
