/* Bill PDF builder + helpers (works in the browser and in Node for testing).
   Layout is a port of the desktop (Python) Vetri Travels bill. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BillPDF = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var RUPEE = "₹";
  var FONT_BUMP = 1; // same "+1 font" the desktop version uses

  // ------------------------------------------------------------ helpers
  function num(s) {
    var n = parseFloat(String(s == null ? "" : s).replace(/,/g, "").trim());
    return isFinite(n) ? n : 0;
  }
  function g(n) { return String(Math.round(n * 1e6) / 1e6); } // like Python's {:g}

  function inr(n) {
    var neg = n < 0;
    var parts = Math.abs(n).toFixed(2).split(".");
    var whole = parts[0], dec = parts[1];
    if (whole.length > 3) {
      var head = whole.slice(0, -3), tail = whole.slice(-3), out = [];
      while (head.length > 2) { out.unshift(head.slice(-2)); head = head.slice(0, -2); }
      if (head) out.unshift(head);
      whole = out.concat([tail]).join(",");
    }
    return (neg ? "-" : "") + whole + "." + dec;
  }

  var ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
    "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  var TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  function below100(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""); }
  function below1000(n) {
    var out = [];
    if (n >= 100) { out.push(ONES[Math.floor(n / 100)] + " Hundred"); n %= 100; }
    if (n) out.push(below100(n));
    return out.join(" ");
  }
  function amountInWords(amount) {
    var rupees = Math.floor(amount + 1e-9);
    var paise = Math.round((amount - rupees) * 100);
    if (paise === 100) { rupees += 1; paise = 0; }
    var text;
    if (rupees === 0) text = "Zero";
    else {
      var parts = [], units = [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"]];
      for (var i = 0; i < units.length; i++) {
        if (rupees >= units[i][0]) {
          parts.push(below100(Math.floor(rupees / units[i][0])) + " " + units[i][1]);
          rupees %= units[i][0];
        }
      }
      if (rupees) parts.push(below1000(rupees));
      text = parts.join(" ");
    }
    text += " Rupees";
    if (paise) text += " and " + below100(paise) + " Paise";
    return text + " Only";
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmtDate(s) {
    s = String(s || "").trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return pad2(m[3]) + " " + MONTHS[+m[2] - 1] + " " + m[1];
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (m) return pad2(m[1]) + " " + MONTHS[+m[2] - 1] + " " + m[3];
    return s;
  }
  function pad2(x) { x = String(x); return x.length < 2 ? "0" + x : x; }

  function nowStamp() {
    var d = new Date(), h = d.getHours(), ap = h >= 12 ? "pm" : "am";
    h = h % 12; if (h === 0) h = 12;
    return d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear() + ", " +
      h + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + " " + ap;
  }

  function computeTotals(b) {
    var base = Math.round(num(b.km) * num(b.rate) * 100) / 100;
    var allowance = num(b.allowance), other = num(b.other);
    var total = Math.round((base + allowance + other) * 100) / 100;
    return { base: base, allowance: allowance, other: other, total: total };
  }

  // ------------------------------------------------------------ PDF
  function rgb(c) { return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)]; }

  /**
   * opts: { jsPDF, fonts: {regular: base64, bold: base64}, logo: dataURL|null }
   * returns the jsPDF document
   */
  function buildPdf(bill, biz, opts) {
    var doc = new opts.jsPDF({ unit: "pt", format: [595, 842], compress: true });
    doc.addFileToVFS("NotoSans-Regular.ttf", opts.fonts.regular);
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    doc.addFileToVFS("NotoSans-Bold.ttf", opts.fonts.bold);
    doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
    doc.setLineCap("round");
    doc.setLineJoin("round");

    var GOLD = [0.88, 0.68, 0.06], DARK = [0.12, 0.12, 0.12], GREY = [0.45, 0.45, 0.45],
      LINE = [0.85, 0.85, 0.85], YELLOW = [0.93, 0.70, 0.05], RED = [0.90, 0.22, 0.22],
      WHITE = [1, 1, 1];
    var L = 30, R = 565;

    // ---- drawing primitives
    function fillRect(x0, y0, x1, y1, color, r) {
      doc.setFillColor.apply(doc, rgb(color));
      var w = x1 - x0, h = y1 - y0;
      if (r) { var rr = r * Math.min(w, h); doc.roundedRect(x0, y0, w, h, rr, rr, "F"); }
      else doc.rect(x0, y0, w, h, "F");
    }
    function stroke(color, width) { doc.setDrawColor.apply(doc, rgb(color)); doc.setLineWidth(width); }
    function poly(pts, closed) {
      for (var i = 0; i < pts.length - 1; i++) doc.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (closed) doc.line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]);
    }
    function textWidth(s, size, bold) {
      doc.setFont("NotoSans", bold ? "bold" : "normal");
      doc.setFontSize(size + FONT_BUMP);
      return doc.getTextWidth(s);
    }
    function text(x, y, s, size, bold, color, align) {
      var w = textWidth(s, size, bold);
      if (align === "r") x -= w; else if (align === "c") x -= w / 2;
      doc.setTextColor.apply(doc, rgb(color || DARK));
      doc.text(String(s), x, y);
    }
    function wrap(s, size, maxw, bold) {
      var lines = [], paras = String(s).split("\n");
      for (var p = 0; p < paras.length; p++) {
        var cur = "", words = paras[p].split(/\s+/).filter(Boolean);
        for (var i = 0; i < words.length; i++) {
          var test = (cur + " " + words[i]).trim();
          if (textWidth(test, size, bold) <= maxw || !cur) cur = test;
          else { lines.push(cur); cur = words[i]; }
        }
        if (cur) lines.push(cur);
      }
      return lines;
    }

    // ---- icons (vector)
    function iconPin(cx, cy, c) {
      stroke(c, 1.1); doc.setFillColor.apply(doc, rgb(WHITE));
      doc.circle(cx, cy - 1.5, 3.6, "S");
      doc.setFillColor.apply(doc, rgb(c)); doc.circle(cx, cy - 1.5, 1.2, "F");
      poly([[cx - 3.1, cy + 0.4], [cx, cy + 5.4], [cx + 3.1, cy + 0.4]]);
    }
    function iconCalendar(cx, cy, c) {
      stroke(c, 1);
      doc.roundedRect(cx - 5, cy - 4, 10, 9, 1.4, 1.4, "S");
      doc.line(cx - 5, cy - 1, cx + 5, cy - 1);
      doc.line(cx - 2.5, cy - 5.5, cx - 2.5, cy - 2.8);
      doc.line(cx + 2.5, cy - 5.5, cx + 2.5, cy - 2.8);
    }
    function iconClock(cx, cy, c) {
      stroke(c, 1); doc.circle(cx, cy, 5, "S");
      poly([[cx, cy - 3], [cx, cy], [cx + 2.5, cy + 1.2]]);
    }
    function iconCar(cx, cy, c) {
      stroke(c, 1);
      poly([[cx - 6, cy + 2.5], [cx - 6, cy], [cx - 4, cy - 0.5], [cx - 2.5, cy - 3.5], [cx + 2.5, cy - 3.5],
        [cx + 4, cy - 0.5], [cx + 6, cy], [cx + 6, cy + 2.5]], true);
      doc.setFillColor.apply(doc, rgb(WHITE));
      doc.circle(cx - 3.2, cy + 3, 1.5, "FD");
      doc.circle(cx + 3.2, cy + 3, 1.5, "FD");
    }
    function iconPerson(cx, cy, c) {
      stroke(c, 1); doc.circle(cx, cy - 2.5, 2.3, "S");
      poly([[cx - 4.5, cy + 5], [cx - 4, cy + 2], [cx, cy + 0.6], [cx + 4, cy + 2], [cx + 4.5, cy + 5]]);
    }
    function iconPhone(cx, cy, c) {
      stroke(c, 1); doc.roundedRect(cx - 3, cy - 5, 6, 10, 1.5, 1.5, "S");
      doc.line(cx - 1, cy + 3, cx + 1, cy + 3);
    }
    function arrow(x, y, len, c) { // small right arrow, vertically centred on y
      stroke(c, 0.9);
      doc.line(x, y, x + len, y);
      doc.line(x + len - 3, y - 2.6, x + len, y);
      doc.line(x + len - 3, y + 2.6, x + len, y);
    }

    // ---- page + card
    fillRect(0, 0, 595, 842, [0.98, 0.98, 0.98]);
    fillRect(15, 20, 580, 720, WHITE, 0.02);

    // ---- header band
    fillRect(L, 35, R, 145, GOLD);
    var tx = 48;
    if (opts.logo) {
      try { doc.addImage(opts.logo, "PNG", 44, 50, 62, 62); tx = 122; } catch (e) { /* logo optional */ }
    }
    text(tx, 72, String(biz.name || "").toUpperCase(), 19, true, DARK);
    var y = 91;
    [biz.address1, biz.address2].forEach(function (ln) {
      if (ln && String(ln).trim()) { text(tx, y, String(ln).trim(), 9, false, DARK); y += 12; }
    });
    if (biz.phone) {
      iconPhone(tx + 3, y + 4, DARK);
      text(tx + 12, y + 7, biz.phone, 9, false, DARK);
    }
    fillRect(R - 50, 46, R - 14, 62, [0.93, 0.93, 0.93], 0.5);
    text(R - 32, 57.5, "Bill", 8, false, GREY, "c");
    text(R - 14, 92, bill.bill_no, 15, true, DARK, "r");
    text(R - 14, 118, bill.stamp, 9.5, false, DARK, "r");

    // ---- bill to
    text(48, 178, "BILL TO", 8, true, GREY);
    y = 199;
    wrap(String(bill.cust_name || "").toUpperCase(), 11.5, 215).forEach(function (ln) {
      text(48, y, ln, 11.5, false, DARK); y += 16;
    });
    var addr = [bill.cust_address, bill.cust_address2].map(function (s) { return String(s || "").trim(); })
      .filter(Boolean).join("\n");
    wrap(addr.toUpperCase(), 8.5, 225).forEach(function (ln) {
      text(48, y, ln, 8.5, false, GREY); y += 13;
    });
    if (bill.cust_phone) {
      iconPhone(51, y + 2, GREY);
      text(60, y + 5, bill.cust_phone, 8.5, false, GREY);
      y += 16;
    }
    var leftEnd = y;

    // ---- trip details
    var X_ICON = 292, X_TXT = 308, ty = 199;
    text(285, 178, "TRIP DETAILS", 8, true, GREY);
    function tripRow(icon, color, label, value, extra) {
      icon(X_ICON, ty - 3.5, color);
      var x = X_TXT;
      if (label) { text(x, ty, label, 10, false, GREY); x += textWidth(label, 10); }
      text(x, ty, value, 10, false, DARK);
      if (extra) text(x + textWidth(value + " ", 10), ty, extra, 10, false, GREY);
      ty += 21;
    }
    tripRow(iconPin, YELLOW, "From: ", String(bill.from || "").toUpperCase());
    tripRow(iconPin, RED, "To: ", String(bill.to || "").toUpperCase());
    // date row with a drawn arrow
    iconCalendar(X_ICON, ty - 3.5, GREY);
    var d1 = fmtDate(bill.start_date), d2 = fmtDate(bill.end_date), dx = X_TXT;
    text(dx, ty, d1, 10, false, DARK); dx += textWidth(d1, 10) + 5;
    arrow(dx, ty - 3.4, 11, DARK); dx += 11 + 5;
    text(dx, ty, d2, 10, false, DARK);
    ty += 21;
    tripRow(iconClock, GREY, "", bill.time || "");
    tripRow(iconCar, GREY, "", bill.vehicle_type || "", bill.vehicle_no ? "(" + bill.vehicle_no + ")" : "");
    tripRow(iconPerson, GREY, "Driver: ", String(bill.driver || "").toUpperCase());

    y = Math.max(leftEnd, ty) + 6;
    stroke(LINE, 0.8); doc.line(L, y, R, y);
    y += 30;

    // ---- fare breakdown
    text(48, y, "FARE BREAKDOWN", 8, true, GREY);
    y += 28;
    var t = computeTotals(bill);
    function moneyRow(label, amount, yy) {
      text(48, yy, label, 10.5, false, GREY);
      text(R - 20, yy, RUPEE + inr(amount), 10.5, false, DARK, "r");
      stroke(LINE, 0.5); doc.setLineDashPattern([2, 2], 0);
      doc.line(48, yy + 9, R - 20, yy + 9);
      doc.setLineDashPattern([], 0);
    }
    moneyRow("Base Fare (" + g(num(bill.km)) + " km × " + RUPEE + g(num(bill.rate)) + "/km)", t.base, y);
    y += 28;
    moneyRow("Driver Allowance", t.allowance, y);
    y += 28;
    if (t.other) { moneyRow(bill.other_label || "Other Charges", t.other, y); y += 28; }
    text(48, y, "Subtotal", 10.5, false, DARK);
    text(R - 20, y, RUPEE + inr(t.total), 10.5, true, DARK, "r");
    y += 22;

    fillRect(48, y, R - 20, y + 40, [1.0, 0.96, 0.88], 0.2);
    text(62, y + 25, "Total Amount", 12.5, true, DARK);
    text(R - 34, y + 26, RUPEE + inr(t.total), 15, true, DARK, "r");
    y += 54;

    fillRect(48, y, R - 20, y + 44, [0.96, 0.95, 0.93], 0.15);
    text(60, y + 16, "AMOUNT IN WORDS:", 7.5, false, GREY);
    text(60, y + 33, amountInWords(t.total), 10, false, DARK);
    y += 64;

    // ---- footer
    fillRect(L, y, R, y + 32, [0.97, 0.97, 0.95]);
    text(48, y + 20, "Thank you for choosing " + (biz.name || "") + "!", 8.5, false, GREY);
    text(R - 36, y + 20, "Safe travels!", 8.5, false, GREY, "r");
    iconCar(R - 22, y + 16, YELLOW);

    return doc;
  }

  return {
    RUPEE: RUPEE, num: num, inr: inr, amountInWords: amountInWords, fmtDate: fmtDate,
    nowStamp: nowStamp, computeTotals: computeTotals, buildPdf: buildPdf
  };
});
