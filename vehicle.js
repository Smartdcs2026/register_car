/************************************************************
 * Vehicle Registration System
 * vehicle.js v2
 *
 * ใช้สำหรับหน้า vehicle.html
 * เปิดข้อมูลรถจาก QR Code ด้วย Vehicle Token + PIN
 * แสดงข้อมูลเจ้าของรถ + ข้อมูลรถ + รูปรถ + ภาพสำเนาทะเบียน/เล่มรถ
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
    VehicleDOM.verifyBtn.disabled = true;
    VehicleDOM.pinInput.disabled = true;
    return;
  }

  VehicleDOM.pinInput.focus();
}


function cacheVehicleDom() {
  VehicleDOM.pinForm = document.getElementById("pinForm");
  VehicleDOM.pinInput = document.getElementById("pinInput");
  VehicleDOM.verifyBtn = document.getElementById("verifyBtn");
  VehicleDOM.errorBox = document.getElementById("errorBox");
  VehicleDOM.resultPanel = document.getElementById("resultPanel");

  VehicleDOM.stickerNo = document.getElementById("stickerNo");
  VehicleDOM.plateNumber = document.getElementById("plateNumber");
  VehicleDOM.province = document.getElementById("province");

  VehicleDOM.dc = document.getElementById("dc");
  VehicleDOM.fullName = document.getElementById("fullName");
  VehicleDOM.employeeId = document.getElementById("employeeId");
  VehicleDOM.phone = document.getElementById("phone");
  VehicleDOM.department = document.getElementById("department");
  VehicleDOM.company = document.getElementById("company");

  VehicleDOM.vehicleType = document.getElementById("vehicleType");
  VehicleDOM.brand = document.getElementById("brand");
  VehicleDOM.carColor = document.getElementById("carColor");
  VehicleDOM.status = document.getElementById("status");
  VehicleDOM.vehicleId = document.getElementById("vehicleId");
  VehicleDOM.registrationId = document.getElementById("registrationId");

  VehicleDOM.vehicleImages = document.getElementById("vehicleImages");
  VehicleDOM.bookImageBox = document.getElementById("bookImageBox");
}


function bindVehicleEvents() {
  VehicleDOM.pinForm.addEventListener("submit", handleVerifySubmit);

  VehicleDOM.pinInput.addEventListener("input", function () {
    VehicleDOM.pinInput.value = String(VehicleDOM.pinInput.value || "")
      .replace(/[^0-9]/g, "")
      .slice(0, 6);

    hideError();
  });
}


async function handleVerifySubmit(event) {
  event.preventDefault();

  const token = VehicleState.token || getVehicleTokenFromUrl();
  const pin = String(VehicleDOM.pinInput.value || "").trim();

  if (!token) {
    showError("ไม่พบรหัสรถในลิงก์ QR Code");
    return;
  }

  if (!VEHICLE_CONFIG.PIN_REGEX.test(pin)) {
    showError("กรุณากรอก PIN เป็นตัวเลข 6 หลัก");
    VehicleDOM.pinInput.focus();
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
    VehicleDOM.resultPanel.classList.add("show");

    await Swal.fire({
      icon: "success",
      title: "เปิดข้อมูลรถสำเร็จ",
      text: "ระบบแสดงข้อมูลรถตาม QR Code แล้ว",
      timer: 1200,
      showConfirmButton: false
    });

  } catch (err) {
    showError(err.message || "ตรวจสอบ PIN ไม่สำเร็จ");
    VehicleDOM.resultPanel.classList.remove("show");

  } finally {
    setLoading(false);
  }
}


function renderVehicleResult(vehicle) {
  VehicleDOM.stickerNo.textContent = valueOrDash(vehicle.stickerLabel || vehicle.stickerNo);
  VehicleDOM.plateNumber.textContent = valueOrDash(vehicle.plateNumber);
  VehicleDOM.province.textContent = valueOrDash(vehicle.province);

  VehicleDOM.dc.textContent = valueOrDash(vehicle.dc);
  VehicleDOM.fullName.textContent = valueOrDash(vehicle.fullName);
  VehicleDOM.employeeId.textContent = valueOrDash(vehicle.employeeId);
  VehicleDOM.phone.textContent = valueOrDash(vehicle.phone);
  VehicleDOM.department.textContent = valueOrDash(vehicle.department);
  VehicleDOM.company.textContent = valueOrDash(vehicle.company);

  VehicleDOM.vehicleType.textContent = valueOrDash(vehicle.vehicleType);
  VehicleDOM.brand.textContent = valueOrDash(vehicle.brand);
  VehicleDOM.carColor.textContent = valueOrDash(vehicle.carColor);
  VehicleDOM.status.textContent = valueOrDash(vehicle.status);
  VehicleDOM.vehicleId.textContent = valueOrDash(vehicle.vehicleId);
  VehicleDOM.registrationId.textContent = valueOrDash(vehicle.registrationId);

  renderVehicleImages(vehicle);
  renderBookImage(vehicle);
}


function renderVehicleImages(vehicle) {
  const images = normalizeImageList(vehicle.vehicleImages || vehicle.vehicleImageData || vehicle.vehicleImageIds);

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
  const src = getImageSrc(vehicle.vehicleBookImage || vehicle.bookImage || vehicle.vehicleBookImageDataUri || vehicle.vehicleBookImageUrl);

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
  VehicleDOM.verifyBtn.disabled = isLoading;
  VehicleDOM.pinInput.disabled = isLoading;
  VehicleDOM.verifyBtn.textContent = isLoading ? "กำลังตรวจสอบ..." : "ตรวจสอบ";
}


function showError(message) {
  VehicleDOM.errorBox.textContent = message || "เกิดข้อผิดพลาด";
  VehicleDOM.errorBox.classList.add("show");
}


function hideError() {
  VehicleDOM.errorBox.textContent = "";
  VehicleDOM.errorBox.classList.remove("show");
}


function valueOrDash(value) {
  const text = String(value == null ? "" : value).trim();
  return text || "-";
}
