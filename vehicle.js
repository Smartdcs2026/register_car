/************************************************************
 * Vehicle Access Page
 * vehicle.js v1
 ************************************************************/

const VEHICLE_CONFIG = {
  API_BASE: "https://registercar.somchaibutphon.workers.dev",
  TOKEN_PARAM: "v",
  PIN_REGEX: /^[0-9]{6}$/
};

const VehicleDOM = {};

document.addEventListener("DOMContentLoaded", initVehiclePage);

function initVehiclePage() {
  cacheVehicleDom();
  bindVehicleEvents();

  const token = getVehicleTokenFromUrl();

  if (!token) {
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
  VehicleDOM.department = document.getElementById("department");
  VehicleDOM.company = document.getElementById("company");
  VehicleDOM.vehicleType = document.getElementById("vehicleType");
  VehicleDOM.brand = document.getElementById("brand");
  VehicleDOM.carColor = document.getElementById("carColor");
  VehicleDOM.status = document.getElementById("status");
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

  const token = getVehicleTokenFromUrl();
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
    });

    if (!result || !result.ok) {
      throw new Error(result && result.message ? result.message : "ไม่สามารถเปิดข้อมูลรถได้");
    }

    renderVehicleResult(result.vehicle || {});
    VehicleDOM.resultPanel.classList.add("show");

    Swal.fire({
      icon: "success",
      title: "เปิดข้อมูลรถสำเร็จ",
      text: "ระบบแสดงข้อมูลรถตาม QR Code แล้ว",
      timer: 1400,
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
  VehicleDOM.department.textContent = valueOrDash(vehicle.department);
  VehicleDOM.company.textContent = valueOrDash(vehicle.company);

  VehicleDOM.vehicleType.textContent = valueOrDash(vehicle.vehicleType);
  VehicleDOM.brand.textContent = valueOrDash(vehicle.brand);
  VehicleDOM.carColor.textContent = valueOrDash(vehicle.carColor);
  VehicleDOM.status.textContent = valueOrDash(vehicle.status);
}

async function apiPost(path, body) {
  const response = await fetch(getApiBase() + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Accept": "application/json"
    },
    body: JSON.stringify(body || {})
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("API ตอบกลับไม่ใช่ JSON: " + text.slice(0, 180));
  }

  if (!response.ok) {
    throw new Error(data.message || "API error: " + response.status);
  }

  return data;
}

function getApiBase() {
  return String(VEHICLE_CONFIG.API_BASE || "").replace(/\/+$/, "");
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
