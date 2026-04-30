/************************************************************
 * Vehicle Registration System
 * vehicle.js v3
 *
 * Safe DOM version:
 * - ไม่พังถ้า vehicle.html ขาดบาง id
 * - แสดงข้อมูลเจ้าของรถ + ข้อมูลรถ + รูปรถ + ภาพเล่มรถ
 ************************************************************/

const VEHICLE_CONFIG = {
  API_BASE: "https://registercar.somchaibutphon.workers.dev",
  TOKEN_PARAM: "v",
  PIN_REGEX: /^[0-9]{6}$/,
  API_TIMEOUT_MS: 60000
};

const VehicleState = {
  token: ""
};

const VehicleDOM = {};

document.addEventListener("DOMContentLoaded", initVehiclePage);

function initVehiclePage() {
  cacheVehicleDom();
  bindVehicleEvents();

  VehicleState.token = getVehicleTokenFromUrl();

  if (!VehicleState.token) {
    showError("ไม่พบรหัสรถในลิงก์ QR Code กรุณาตรวจสอบ QR Code อีกครั้ง");
    setElementDisabled(VehicleDOM.verifyBtn, true);
    setElementDisabled(VehicleDOM.pinInput, true);
    return;
  }

  if (VehicleDOM.pinInput) {
    VehicleDOM.pinInput.focus();
  }
}

function cacheVehicleDom() {
  VehicleDOM.pinForm = byId("pinForm");
  VehicleDOM.pinInput = byId("pinInput");
  VehicleDOM.verifyBtn = byId("verifyBtn");
  VehicleDOM.errorBox = byId("errorBox");
  VehicleDOM.resultPanel = byId("resultPanel");

  VehicleDOM.stickerNo = byId("stickerNo");
  VehicleDOM.plateNumber = byId("plateNumber");
  VehicleDOM.province = byId("province");

  VehicleDOM.dc = byId("dc");
VehicleDOM.timestamp = byId("timestamp");
VehicleDOM.fullName = byId("fullName");
VehicleDOM.employeeId = byId("employeeId");
VehicleDOM.phone = byId("phone");
VehicleDOM.department = byId("department");
VehicleDOM.company = byId("company");

  VehicleDOM.vehicleType = byId("vehicleType");
  VehicleDOM.brand = byId("brand");
  VehicleDOM.carColor = byId("carColor");
  VehicleDOM.status = byId("status");
  VehicleDOM.vehicleId = byId("vehicleId");
  VehicleDOM.registrationId = byId("registrationId");

  VehicleDOM.vehicleImages = byId("vehicleImages");
  VehicleDOM.bookImageBox = byId("bookImageBox");

 logMissingElements([
  "pinForm",
  "pinInput",
  "verifyBtn",
  "errorBox",
  "resultPanel",
  "stickerNo",
  "plateNumber",
  "province",
  "timestamp",
  "dc",
  "fullName",
  "employeeId",
  "phone",
  "department",
  "company",
  "vehicleType",
  "brand",
  "carColor",
  "status",
  "vehicleId",
  "registrationId",
  "vehicleImages",
  "bookImageBox"
]);
}

function bindVehicleEvents() {
  if (VehicleDOM.pinForm) {
    VehicleDOM.pinForm.addEventListener("submit", handleVerifySubmit);
  }

  if (VehicleDOM.pinInput) {
    VehicleDOM.pinInput.addEventListener("input", function () {
      VehicleDOM.pinInput.value = String(VehicleDOM.pinInput.value || "")
        .replace(/[^0-9]/g, "")
        .slice(0, 6);

      hideError();
    });
  }
}

async function handleVerifySubmit(event) {
  event.preventDefault();

  const token = VehicleState.token || getVehicleTokenFromUrl();
  const pin = String(VehicleDOM.pinInput ? VehicleDOM.pinInput.value : "").trim();

  if (!token) {
    showError("ไม่พบรหัสรถในลิงก์ QR Code");
    return;
  }

  if (!VEHICLE_CONFIG.PIN_REGEX.test(pin)) {
    showError("กรุณากรอก PIN เป็นตัวเลข 6 หลัก");
    if (VehicleDOM.pinInput) VehicleDOM.pinInput.focus();
    return;
  }

  setLoading(true);
  hideError();

  try {
    const result = await apiPost("/api/vehicle/access", {
      token: token,
      pin: pin
    }, VEHICLE_CONFIG.API_TIMEOUT_MS);

    if (!result || !result.ok) {
      throw new Error(result && result.message ? result.message : "ไม่สามารถเปิดข้อมูลรถได้");
    }

    renderVehicleResult(result.vehicle || {});

    if (VehicleDOM.resultPanel) {
      VehicleDOM.resultPanel.classList.add("show");
    }

    await Swal.fire({
      icon: "success",
      title: "เปิดข้อมูลรถสำเร็จ",
      text: "ระบบแสดงข้อมูลรถตาม QR Code แล้ว",
      timer: 1200,
      showConfirmButton: false
    });

  } catch (err) {
    showError(err.message || "ตรวจสอบ PIN ไม่สำเร็จ");

    if (VehicleDOM.resultPanel) {
      VehicleDOM.resultPanel.classList.remove("show");
    }

  } finally {
    setLoading(false);
  }
}

function renderVehicleResult(vehicle) {
  setText(VehicleDOM.stickerNo, vehicle.stickerLabel || vehicle.stickerNo);
  setText(VehicleDOM.plateNumber, vehicle.plateNumber);
  setText(VehicleDOM.province, vehicle.province);
 setText(VehicleDOM.timestamp, formatDisplayDateTime(vehicle.timestamp));
  setText(VehicleDOM.dc, vehicle.dc);
  setText(VehicleDOM.fullName, vehicle.fullName);
  setText(VehicleDOM.employeeId, vehicle.employeeId);
  setText(VehicleDOM.phone, vehicle.phone);
  setText(VehicleDOM.department, vehicle.department);
  setText(VehicleDOM.company, vehicle.company);

  setText(VehicleDOM.vehicleType, vehicle.vehicleType);
  setText(VehicleDOM.brand, vehicle.brand);
  setText(VehicleDOM.carColor, vehicle.carColor);
  setText(VehicleDOM.status, vehicle.status);
  setText(VehicleDOM.vehicleId, vehicle.vehicleId);
  setText(VehicleDOM.registrationId, vehicle.registrationId);

  renderVehicleImages(vehicle);
  renderBookImage(vehicle);
}

function renderVehicleImages(vehicle) {
  if (!VehicleDOM.vehicleImages) return;

  const images = normalizeImageList(
    vehicle.vehicleImages ||
    vehicle.vehicleImageData ||
    vehicle.vehicleImageIds
  );

  VehicleDOM.vehicleImages.innerHTML = "";

  if (!images.length) {
    VehicleDOM.vehicleImages.innerHTML = '<div class="emptyImageBox">ไม่พบรูปรถ</div>';
    return;
  }

  images.forEach(function (img, index) {
    const src = getImageSrc(img);
    if (!src) return;

    const card = document.createElement("div");
    card.className = "imageCard";

    const image = document.createElement("img");
    image.src = src;
    image.alt = "รูปรถที่ " + (index + 1);
    image.loading = "lazy";

    image.onerror = function () {
      card.remove();

      if (!VehicleDOM.vehicleImages.children.length) {
        VehicleDOM.vehicleImages.innerHTML = '<div class="emptyImageBox">โหลดรูปรถไม่สำเร็จ</div>';
      }
    };

    const caption = document.createElement("div");
    caption.className = "imageCaption";
    caption.textContent = "รูปรถที่ " + (index + 1);

    card.appendChild(image);
    card.appendChild(caption);
    VehicleDOM.vehicleImages.appendChild(card);
  });

  if (!VehicleDOM.vehicleImages.children.length) {
    VehicleDOM.vehicleImages.innerHTML = '<div class="emptyImageBox">ไม่พบรูปรถ</div>';
  }
}

function renderBookImage(vehicle) {
  if (!VehicleDOM.bookImageBox) return;

  const src = getImageSrc(
    vehicle.vehicleBookImage ||
    vehicle.bookImage ||
    vehicle.vehicleBookImageDataUri ||
    vehicle.vehicleBookImageUrl
  );

  VehicleDOM.bookImageBox.innerHTML = "";

  if (!src) {
    VehicleDOM.bookImageBox.innerHTML = '<div class="emptyImageBox">ไม่พบภาพสำเนาทะเบียนรถ / เล่มรถ</div>';
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "bookImageWrap";

  const image = document.createElement("img");
  image.src = src;
  image.alt = "ภาพสำเนาทะเบียนรถ / เล่มรถ";
  image.loading = "lazy";

  image.onerror = function () {
    VehicleDOM.bookImageBox.innerHTML = '<div class="emptyImageBox">โหลดภาพสำเนาทะเบียนรถ / เล่มรถ ไม่สำเร็จ</div>';
  };

  wrap.appendChild(image);
  VehicleDOM.bookImageBox.appendChild(wrap);
}

function normalizeImageList(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split("|")
      .map(function (item) {
        return item.trim();
      })
      .filter(Boolean);
  }

  return [];
}

function getImageSrc(image) {
  if (!image) return "";

  if (typeof image === "string") {
    if (/^data:image\//i.test(image)) return image;
    if (/^https?:\/\//i.test(image)) return image;
    return driveImageUrlFromId(image);
  }

  return image.dataUri ||
    image.dataUrl ||
    image.imageDataUri ||
    image.imageUrl ||
    image.url ||
    image.src ||
    (image.fileId ? driveImageUrlFromId(image.fileId) : "");
}

function driveImageUrlFromId(fileId) {
  const id = String(fileId || "").trim();
  if (!id) return "";
  return "https://lh5.googleusercontent.com/d/" + encodeURIComponent(id);
}

async function apiPost(path, body, timeoutMs) {
  const controller = new AbortController();

  const timeout = setTimeout(function () {
    controller.abort();
  }, timeoutMs || VEHICLE_CONFIG.API_TIMEOUT_MS);

  try {
    const response = await fetch(getApiBase() + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=utf-8",
        "Accept": "application/json"
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error("API ตอบกลับไม่ใช่ JSON: " + text.slice(0, 220));
    }

    if (!response.ok) {
      throw new Error(data.message || "API error: " + response.status);
    }

    return data;

  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("เชื่อมต่อระบบนานเกินไป กรุณาลองใหม่อีกครั้ง");
    }

    throw err;

  } finally {
    clearTimeout(timeout);
  }
}

function getApiBase() {
  const base = String(VEHICLE_CONFIG.API_BASE || "").trim().replace(/\/+$/, "");

  if (!base) {
    throw new Error("ยังไม่ได้ตั้งค่า API_BASE ใน vehicle.js");
  }

  return base;
}

function getVehicleTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get(VEHICLE_CONFIG.TOKEN_PARAM) || "").trim();
}

function setLoading(isLoading) {
  setElementDisabled(VehicleDOM.verifyBtn, isLoading);
  setElementDisabled(VehicleDOM.pinInput, isLoading);

  if (VehicleDOM.verifyBtn) {
    VehicleDOM.verifyBtn.textContent = isLoading ? "กำลังตรวจสอบ..." : "ตรวจสอบ";
  }
}

function showError(message) {
  if (!VehicleDOM.errorBox) {
    alert(message || "เกิดข้อผิดพลาด");
    return;
  }

  VehicleDOM.errorBox.textContent = message || "เกิดข้อผิดพลาด";
  VehicleDOM.errorBox.classList.add("show");
}

function hideError() {
  if (!VehicleDOM.errorBox) return;

  VehicleDOM.errorBox.textContent = "";
  VehicleDOM.errorBox.classList.remove("show");
}

function valueOrDash(value) {
  const text = String(value == null ? "" : value).trim();
  return text || "-";
}

function setText(element, value) {
  if (!element) return;
  element.textContent = valueOrDash(value);
}

function setElementDisabled(element, disabled) {
  if (!element) return;
  element.disabled = !!disabled;
}

function byId(id) {
  return document.getElementById(id);
}

function logMissingElements(ids) {
  const missing = ids.filter(function (id) {
    return !document.getElementById(id);
  });

  if (missing.length) {
    console.warn("vehicle.html ขาด element id:", missing.join(", "));
  }
}
function formatDisplayDateTime(value) {
  const text = String(value == null ? "" : value).trim();

  if (!text) return "";

  const pad = function (n) {
    return String(n).padStart(2, "0");
  };

  /*
   * รูปแบบมาตรฐานที่ระบบต้องการ: dd/MM/yyyy HH:mm:ss
   * ถ้าเข้ามาเป็นแบบนี้อยู่แล้ว ให้คืนค่าเดิมทันที
   * ห้ามนำไป new Date() เพราะ browser อาจตีความเป็น MM/dd/yyyy
   */
  const ddmmyyyy = text.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (ddmmyyyy) {
    return text;
  }

  /*
   * กรณีข้อมูลเก่าหรือ Google Sheet ส่งมาเป็น MM/dd/yyyy HH:mm:ss
   * เช่น 04/01/2026 แต่ข้อมูลจริงควรเป็น 01/04/2026
   * ให้สลับกลับเป็น dd/MM/yyyy
   */
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (slashDate) {
    const first = Number(slashDate[1]);
    const second = Number(slashDate[2]);
    const year = slashDate[3];

    const hh = pad(slashDate[4] || "00");
    const mm = pad(slashDate[5] || "00");
    const ss = pad(slashDate[6] || "00");

    /*
     * ถ้าค่าแรกมากกว่า 12 = เป็นวันแน่นอน เช่น 25/04/2026
     * ถ้าค่าที่สองมากกว่า 12 = เป็นเดือน/วันแน่นอน เช่น 04/25/2026
     * ถ้าทั้งคู่ <= 12 และระบบเจอปัญหาสลับวันเดือน ให้ถือว่าค่าแรกคือเดือน ค่าที่สองคือวัน
     */
    if (first > 12 && second <= 12) {
      return pad(first) + "/" + pad(second) + "/" + year + " " + hh + ":" + mm + ":" + ss;
    }

    if (second > 12 && first <= 12) {
      return pad(second) + "/" + pad(first) + "/" + year + " " + hh + ":" + mm + ":" + ss;
    }

    return pad(second) + "/" + pad(first) + "/" + year + " " + hh + ":" + mm + ":" + ss;
  }

  /*
   * ISO จาก Google Sheet เช่น 2026-01-04T18:11:36.000Z
   * กรณีนี้มักเกิดจาก Sheet แปลง 01/04/2026 เป็น Date แบบ US แล้วส่งออกมาเป็น 2026-01-04
   * ดังนั้นให้สลับ month/day กลับ เพื่อให้ได้ 01/04/2026
   */
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (iso) {
    const year = iso[1];
    const monthFromIso = iso[2];
    const dayFromIso = iso[3];
    const hh = iso[4];
    const mm = iso[5];
    const ss = iso[6];

    return dayFromIso + "/" + monthFromIso + "/" + year + " " + hh + ":" + mm + ":" + ss;
  }

  /*
   * yyyy-MM-dd HH:mm:ss
   */
  const ymd = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (ymd) {
    return ymd[3] + "/" + ymd[2] + "/" + ymd[1] + " " + ymd[4] + ":" + ymd[5] + ":" + ymd[6];
  }

  return text;
}
