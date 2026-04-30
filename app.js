/************************************************************
 * Vehicle Registration System
 * app.js
 ************************************************************/

/**
 * =========================
 * CONFIG
 * =========================
 */

const APP_CONFIG = {
  /**
   * เปลี่ยน URL นี้ให้เป็น Cloudflare Worker ของคุณ
   * ตัวอย่าง:
   * https://vehicle-register-api.somchaibutphon.workers.dev
   */
  API_BASE: "https://registercar.somchaibutphon.workers.dev",

  MAX_IMAGES: 3,

  IMAGE_MAX_WIDTH: 1280,
  IMAGE_MAX_HEIGHT: 1280,
  IMAGE_QUALITY: 0.82,/************************************************************
 * Vehicle Registration System
 * app.js v2
 ************************************************************/


/**
 * =========================
 * CONFIG
 * =========================
 */

const APP_CONFIG = {
  /**
   * แก้ URL นี้ให้เป็น Cloudflare Worker ของคุณ
   * ตัวอย่าง:
   * https://vehicle-register-api.smartdcs2026.workers.dev
   */
  API_BASE: "PASTE_YOUR_CLOUDFLARE_WORKER_URL_HERE",

  CONSENT_VERSION: "PDPA-VEHICLE-REG-001",

  MAX_VEHICLES: 3,
  MAX_VEHICLE_IMAGES: 3,

  IMAGE_MAX_WIDTH: 1280,
  IMAGE_MAX_HEIGHT: 1280,
  IMAGE_QUALITY: 0.78,
  IMAGE_OUTPUT_TYPE: "image/jpeg",

  OTHER_VALUE: "อื่นๆ",

  VALIDATION: {
    PLATE: /^[ก-ฮ0-9]+$/,
    EMPLOYEE_ID: /^[A-Z0-9]+$/,
    PHONE: /^[0-9+\-\s()]{6,20}$/
  }
};


/**
 * =========================
 * STATE
 * =========================
 */

const AppState = {
  consent: {
    accepted: false,
    acceptedAt: "",
    version: APP_CONFIG.CONSENT_VERSION
  },

  options: {},

  vehicles: [],

  camera: {
    stream: null,
    facingMode: "environment",
    target: null
  },

  isSubmitting: false
};


/**
 * =========================
 * DOM
 * =========================
 */

const DOM = {};

document.addEventListener("DOMContentLoaded", initApp);


/**
 * =========================
 * INIT
 * =========================
 */

async function initApp() {
  cacheDom();
  bindEvents();

  showConsentScreen();

  await checkApiHealth();
  await loadOptions();

  addVehicle();
}


function cacheDom() {
  DOM.consentScreen = document.getElementById("consentScreen");
  DOM.appScreen = document.getElementById("appScreen");
  DOM.consentCheck = document.getElementById("consentCheck");
  DOM.acceptConsentBtn = document.getElementById("acceptConsentBtn");
  DOM.consentVersionText = document.getElementById("consentVersionText");

  DOM.form = document.getElementById("vehicleForm");

  DOM.apiStatusDot = document.getElementById("apiStatusDot");
  DOM.apiStatusText = document.getElementById("apiStatusText");

  DOM.addVehicleBtn = document.getElementById("addVehicleBtn");
  DOM.vehicleList = document.getElementById("vehicleList");
  DOM.vehicleCardTemplate = document.getElementById("vehicleCardTemplate");

  DOM.imageItemTemplate = document.getElementById("imageItemTemplate");
  DOM.bookImageItemTemplate = document.getElementById("bookImageItemTemplate");

  DOM.resetBtn = document.getElementById("resetBtn");
  DOM.submitBtn = document.getElementById("submitBtn");

  DOM.cameraModal = document.getElementById("cameraModal");
  DOM.cameraVideo = document.getElementById("cameraVideo");
  DOM.cameraCanvas = document.getElementById("cameraCanvas");
  DOM.closeCameraBtn = document.getElementById("closeCameraBtn");
  DOM.switchCameraBtn = document.getElementById("switchCameraBtn");
  DOM.captureBtn = document.getElementById("captureBtn");

  DOM.personSelects = Array.from(document.querySelectorAll("select[data-option-key]"))
    .filter(function (select) {
      return !select.closest(".vehicleCard");
    });
}


function bindEvents() {
  DOM.consentVersionText.textContent = APP_CONFIG.CONSENT_VERSION;

  DOM.consentCheck.addEventListener("change", function () {
    DOM.acceptConsentBtn.disabled = !DOM.consentCheck.checked;
  });

  DOM.acceptConsentBtn.addEventListener("click", acceptConsent);

  DOM.form.addEventListener("submit", handleSubmit);
  DOM.resetBtn.addEventListener("click", handleReset);
  DOM.addVehicleBtn.addEventListener("click", addVehicle);

  DOM.closeCameraBtn.addEventListener("click", closeCamera);
  DOM.switchCameraBtn.addEventListener("click", switchCamera);
  DOM.captureBtn.addEventListener("click", captureCameraImage);

  DOM.personSelects.forEach(function (select) {
    select.addEventListener("change", function () {
      handlePersonSelectOther(select);
    });
  });

  document.getElementById("employeeId").addEventListener("input", function (event) {
    event.target.value = normalizeEmployeeInput(event.target.value);
    validateSingleInput(event.target, APP_CONFIG.VALIDATION.EMPLOYEE_ID);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !DOM.cameraModal.classList.contains("hidden")) {
      closeCamera();
    }
  });
}


/**
 * =========================
 * CONSENT
 * =========================
 */

function showConsentScreen() {
  DOM.consentScreen.classList.remove("hidden");
  DOM.appScreen.classList.add("hidden");
}


function acceptConsent() {
  if (!DOM.consentCheck.checked) return;

  AppState.consent = {
    accepted: true,
    acceptedAt: getLocalDateTimeString(),
    version: APP_CONFIG.CONSENT_VERSION
  };

  DOM.consentScreen.classList.add("hidden");
  DOM.appScreen.classList.remove("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/**
 * =========================
 * API
 * =========================
 */

function getApiBase() {
  const base = String(APP_CONFIG.API_BASE || "").trim().replace(/\/+$/, "");

  if (!base || base === "PASTE_YOUR_CLOUDFLARE_WORKER_URL_HERE") {
    throw new Error("ยังไม่ได้ตั้งค่า APP_CONFIG.API_BASE ในไฟล์ app.js");
  }

  return base;
}


async function apiGet(path) {
  const response = await fetch(getApiBase() + path, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  return parseApiResponse(response);
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

  return parseApiResponse(response);
}


async function parseApiResponse(response) {
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("API ตอบกลับไม่ใช่ JSON: " + text.slice(0, 200));
  }

  if (!response.ok) {
    throw new Error(data.message || "API error: " + response.status);
  }

  return data;
}


async function checkApiHealth() {
  setApiStatus("checking", "กำลังตรวจสอบระบบ...");

  try {
    const data = await apiGet("/health");

    if (data && data.ok) {
      setApiStatus("online", "ระบบพร้อมใช้งาน");
    } else {
      setApiStatus("offline", "ระบบไม่พร้อมใช้งาน");
    }

  } catch (err) {
    setApiStatus("offline", err.message || "เชื่อมต่อระบบไม่ได้");
  }
}


async function loadOptions() {
  try {
    setPersonSelectsLoading(true);

    const data = await apiGet("/api/options");

    if (!data || !data.ok || !data.options) {
      throw new Error(data.message || "โหลดตัวเลือกไม่สำเร็จ");
    }

    AppState.options = data.options;

    renderPersonOptions();
    renderVehicles();

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "โหลดตัวเลือกไม่สำเร็จ",
      text: err.message || "กรุณาตรวจสอบ Worker หรือ Apps Script"
    });

    setPersonSelectsError();

  } finally {
    setPersonSelectsLoading(false);
  }
}


function setApiStatus(status, text) {
  DOM.apiStatusDot.classList.remove("statusChecking", "statusOnline", "statusOffline");

  if (status === "online") {
    DOM.apiStatusDot.classList.add("statusOnline");
  } else if (status === "offline") {
    DOM.apiStatusDot.classList.add("statusOffline");
  } else {
    DOM.apiStatusDot.classList.add("statusChecking");
  }

  DOM.apiStatusText.textContent = text;
}


/**
 * =========================
 * OPTIONS
 * =========================
 */

function renderPersonOptions() {
  DOM.personSelects.forEach(function (select) {
    const key = select.dataset.optionKey;
    renderSelectOptions(select, AppState.options[key] || []);
    handlePersonSelectOther(select);
  });
}


function renderSelectOptions(select, values, selectedValue) {
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "กรุณาเลือก";
  select.appendChild(placeholder);

  values.forEach(function (value) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;

    if (selectedValue && selectedValue === value) {
      option.selected = true;
    }

    select.appendChild(option);
  });
}


function setPersonSelectsLoading(isLoading) {
  DOM.personSelects.forEach(function (select) {
    select.disabled = isLoading;

    if (isLoading) {
      select.innerHTML = '<option value="">กำลังโหลดข้อมูล...</option>';
    }
  });
}


function setPersonSelectsError() {
  DOM.personSelects.forEach(function (select) {
    select.innerHTML = '<option value="">โหลดข้อมูลไม่สำเร็จ</option>';
    select.disabled = true;
  });
}


function handlePersonSelectOther(select) {
  const targetId = select.dataset.otherTarget;
  if (!targetId) return;

  const otherInput = document.getElementById(targetId);
  if (!otherInput) return;

  const isOther = select.value === APP_CONFIG.OTHER_VALUE;

  otherInput.classList.toggle("hidden", !isOther);
  otherInput.required = isOther;

  if (!isOther) {
    otherInput.value = "";
    otherInput.classList.remove("invalidField", "validField");
  }
}


function getPersonSelectFinalValue(selectId, otherId) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);

  if (!select) return "";

  if (select.value === APP_CONFIG.OTHER_VALUE) {
    return normalizeText(other ? other.value : "");
  }

  return normalizeText(select.value);
}


/**
 * =========================
 * VEHICLE STATE
 * =========================
 */

function createEmptyVehicle() {
  return {
    id: createLocalId("veh"),
    vehicleType: "",
    vehicleTypeOther: "",
    brand: "",
    brandOther: "",
    carColor: "",
    carColorOther: "",
    plateNumber: "",
    province: "",
    provinceOther: "",
    vehicleImages: [],
    bookImage: createEmptyImage("book")
  };
}


function createEmptyImage(prefix) {
  return {
    id: createLocalId(prefix || "img"),
    fileName: "",
    mimeType: "",
    base64: "",
    previewUrl: ""
  };
}


function addVehicle() {
  if (AppState.vehicles.length >= APP_CONFIG.MAX_VEHICLES) {
    Swal.fire({
      icon: "warning",
      title: "เพิ่มรถไม่ได้",
      text: "เพิ่มรถได้สูงสุด " + APP_CONFIG.MAX_VEHICLES + " คันต่อการบันทึก"
    });
    return;
  }

  const vehicle = createEmptyVehicle();
  vehicle.vehicleImages.push(createEmptyImage("car"));

  AppState.vehicles.push(vehicle);
  renderVehicles();
}


function removeVehicle(vehicleId) {
  if (AppState.vehicles.length <= 1) {
    Swal.fire({
      icon: "warning",
      title: "ลบรถไม่ได้",
      text: "ต้องมีข้อมูลรถอย่างน้อย 1 คัน"
    });
    return;
  }

  const vehicle = getVehicleById(vehicleId);

  if (vehicle) {
    revokeVehicleObjectUrls(vehicle);
  }

  AppState.vehicles = AppState.vehicles.filter(function (vehicle) {
    return vehicle.id !== vehicleId;
  });

  renderVehicles();
}


function getVehicleById(vehicleId) {
  return AppState.vehicles.find(function (vehicle) {
    return vehicle.id === vehicleId;
  });
}


function updateVehicleField(vehicleId, field, value) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) return;

  if (field === "plateNumber") {
    vehicle[field] = normalizePlateInput(value);
  } else {
    vehicle[field] = normalizeText(value);
  }
}


function addVehicleImage(vehicleId) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) return;

  if (vehicle.vehicleImages.length >= APP_CONFIG.MAX_VEHICLE_IMAGES) {
    Swal.fire({
      icon: "warning",
      title: "เพิ่มรูปรถไม่ได้",
      text: "รูปรถเพิ่มได้สูงสุด " + APP_CONFIG.MAX_VEHICLE_IMAGES + " รูปต่อคัน"
    });
    return;
  }

  vehicle.vehicleImages.push(createEmptyImage("car"));
  renderVehicles();
}


function removeVehicleImage(vehicleId, imageId) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) return;

  if (vehicle.vehicleImages.length <= 1) {
    Swal.fire({
      icon: "warning",
      title: "ลบรูปไม่ได้",
      text: "ต้องมีช่องรูปรถอย่างน้อย 1 ช่อง"
    });
    return;
  }

  const image = vehicle.vehicleImages.find(function (img) {
    return img.id === imageId;
  });

  revokeImageObjectUrl(image);

  vehicle.vehicleImages = vehicle.vehicleImages.filter(function (img) {
    return img.id !== imageId;
  });

  renderVehicles();
}


function clearBookImage(vehicleId) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) return;

  revokeImageObjectUrl(vehicle.bookImage);
  vehicle.bookImage = createEmptyImage("book");

  renderVehicles();
}


function updateImageData(vehicleId, imageType, imageId, patch) {
  const vehicle = getVehicleById(vehicleId);
  if (!vehicle) return;

  if (imageType === "book") {
    revokeImageObjectUrl(vehicle.bookImage);

    vehicle.bookImage = {
      ...vehicle.bookImage,
      ...patch
    };

    return;
  }

  vehicle.vehicleImages = vehicle.vehicleImages.map(function (image) {
    if (image.id !== imageId) return image;

    if (image.previewUrl && patch.previewUrl && image.previewUrl !== patch.previewUrl) {
      URL.revokeObjectURL(image.previewUrl);
    }

    return {
      ...image,
      ...patch
    };
  });
}


function revokeVehicleObjectUrls(vehicle) {
  if (!vehicle) return;

  vehicle.vehicleImages.forEach(revokeImageObjectUrl);
  revokeImageObjectUrl(vehicle.bookImage);
}


function revokeImageObjectUrl(image) {
  if (image && image.previewUrl) {
    URL.revokeObjectURL(image.previewUrl);
  }
}


/**
 * =========================
 * RENDER VEHICLES
 * =========================
 */

function renderVehicles() {
  DOM.vehicleList.innerHTML = "";

  AppState.vehicles.forEach(function (vehicle, index) {
    const node = DOM.vehicleCardTemplate.content.firstElementChild.cloneNode(true);

    node.dataset.vehicleId = vehicle.id;

    node.querySelector(".vehicleCardTitle").textContent = "รถคันที่ " + (index + 1);

    const removeVehicleBtn = node.querySelector(".removeVehicleBtn");
    removeVehicleBtn.disabled = AppState.vehicles.length <= 1;
    removeVehicleBtn.addEventListener("click", function () {
      removeVehicle(vehicle.id);
    });

    bindVehicleFields(node, vehicle);
    renderVehicleImages(node, vehicle);
    renderBookImage(node, vehicle);

    const addImageBtn = node.querySelector(".addVehicleImageBtn");
    addImageBtn.disabled = vehicle.vehicleImages.length >= APP_CONFIG.MAX_VEHICLE_IMAGES;
    addImageBtn.addEventListener("click", function () {
      addVehicleImage(vehicle.id);
    });

    DOM.vehicleList.appendChild(node);
  });

  DOM.addVehicleBtn.disabled = AppState.vehicles.length >= APP_CONFIG.MAX_VEHICLES;
}


function bindVehicleFields(node, vehicle) {
  const selects = Array.from(node.querySelectorAll("select.vehicleInput"));
  const inputs = Array.from(node.querySelectorAll("input.vehicleInput"));

  selects.forEach(function (select) {
    const field = select.dataset.field;
    const optionKey = select.dataset.optionKey;

    renderSelectOptions(select, AppState.options[optionKey] || [], vehicle[field]);

    const otherInput = node.querySelector('[data-field="' + field + 'Other"]');

    if (vehicle[field] === APP_CONFIG.OTHER_VALUE) {
      otherInput.classList.remove("hidden");
      otherInput.required = true;
      otherInput.value = vehicle[field + "Other"] || "";
    } else {
      otherInput.classList.add("hidden");
      otherInput.required = false;
      otherInput.value = "";
    }

    select.addEventListener("change", function () {
      updateVehicleField(vehicle.id, field, select.value);

      if (select.value !== APP_CONFIG.OTHER_VALUE) {
        updateVehicleField(vehicle.id, field + "Other", "");
      }

      renderVehicles();
    });
  });

  inputs.forEach(function (input) {
    const field = input.dataset.field;
    input.value = vehicle[field] || "";

    input.addEventListener("input", function () {
      if (field === "plateNumber") {
        input.value = normalizePlateInput(input.value);
        validateSingleInput(input, APP_CONFIG.VALIDATION.PLATE);
      }

      updateVehicleField(vehicle.id, field, input.value);
    });
  });

  Array.from(node.querySelectorAll(".vehicleOtherInput")).forEach(function (input) {
    const field = input.dataset.field;
    input.value = vehicle[field] || "";

    input.addEventListener("input", function () {
      updateVehicleField(vehicle.id, field, input.value);
    });
  });
}


function renderVehicleImages(node, vehicle) {
  const list = node.querySelector(".vehicleImagesList");
  list.innerHTML = "";

  vehicle.vehicleImages.forEach(function (image, index) {
    const imageNode = createImageItemNode({
      vehicleId: vehicle.id,
      image: image,
      imageType: "vehicle",
      label: "รูปรถที่ " + (index + 1),
      allowRemove: true,
      onRemove: function () {
        removeVehicleImage(vehicle.id, image.id);
      }
    });

    list.appendChild(imageNode);
  });
}


function renderBookImage(node, vehicle) {
  const slot = node.querySelector(".bookImageSlot");
  slot.innerHTML = "";

  const imageNode = createImageItemNode({
    vehicleId: vehicle.id,
    image: vehicle.bookImage,
    imageType: "book",
    label: "ภาพสำเนาทะเบียนรถ / เล่มรถ",
    allowRemove: false,
    isBook: true,
    onClear: function () {
      clearBookImage(vehicle.id);
    }
  });

  slot.appendChild(imageNode);
}


function createImageItemNode(config) {
  const template = config.isBook ? DOM.bookImageItemTemplate : DOM.imageItemTemplate;
  const node = template.content.firstElementChild.cloneNode(true);

  node.dataset.imageId = config.image.id;

  const label = node.querySelector(".imageLabel");
  const status = node.querySelector(".imageStatus");
  const preview = node.querySelector(".imagePreview");
  const emptyPreview = node.querySelector(".emptyPreview");
  const fileInput = node.querySelector(".imageFileInput");
  const cameraBtn = node.querySelector(".cameraOpenBtn");

  label.textContent = config.label;

  if (config.image.base64) {
    status.textContent = config.image.fileName || "เลือกรูปแล้ว";
    preview.src = config.image.previewUrl || config.image.base64;
    preview.classList.remove("hidden");
    emptyPreview.classList.add("hidden");
  } else {
    status.textContent = "ยังไม่ได้เลือกรูป";
    preview.removeAttribute("src");
    preview.classList.add("hidden");
    emptyPreview.classList.remove("hidden");
  }

  fileInput.addEventListener("change", function (event) {
    handleImageFileChange(event, {
      vehicleId: config.vehicleId,
      imageId: config.image.id,
      imageType: config.imageType
    });
  });

  cameraBtn.addEventListener("click", function () {
    openCamera({
      vehicleId: config.vehicleId,
      imageId: config.image.id,
      imageType: config.imageType
    });
  });

  const removeBtn = node.querySelector(".removeImageBtn");
  if (removeBtn) {
    removeBtn.addEventListener("click", config.onRemove);
  }

  const clearBtn = node.querySelector(".clearBookImageBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", config.onClear);
  }

  return node;
}


/**
 * =========================
 * IMAGE HANDLING
 * =========================
 */

async function handleImageFileChange(event, target) {
  const file = event.target.files && event.target.files[0];

  if (!file) return;

  if (!file.type || !file.type.startsWith("image/")) {
    await Swal.fire({
      icon: "error",
      title: "ไฟล์ไม่ถูกต้อง",
      text: "กรุณาเลือกไฟล์รูปภาพเท่านั้น"
    });

    event.target.value = "";
    return;
  }

  try {
    showLoading("กำลังประมวลผลรูปภาพ...");

    const compressed = await compressImageFile(file);

    updateImageData(target.vehicleId, target.imageType, target.imageId, {
      fileName: file.name || "image.jpg",
      mimeType: compressed.mimeType,
      base64: compressed.base64,
      previewUrl: compressed.previewUrl
    });

    renderVehicles();

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "อ่านรูปภาพไม่สำเร็จ",
      text: err.message || "กรุณาลองใหม่อีกครั้ง"
    });

  } finally {
    hideLoading();
    event.target.value = "";
  }
}


async function compressImageFile(file) {
  const imageBitmap = await loadImageBitmapFromFile(file);

  const size = calculateFitSize(
    imageBitmap.width,
    imageBitmap.height,
    APP_CONFIG.IMAGE_MAX_WIDTH,
    APP_CONFIG.IMAGE_MAX_HEIGHT
  );

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0, size.width, size.height);

  const blob = await canvasToBlob(
    canvas,
    APP_CONFIG.IMAGE_OUTPUT_TYPE,
    APP_CONFIG.IMAGE_QUALITY
  );

  const base64 = await blobToDataUrl(blob);
  const previewUrl = URL.createObjectURL(blob);

  if (imageBitmap.close) {
    imageBitmap.close();
  }

  return {
    mimeType: APP_CONFIG.IMAGE_OUTPUT_TYPE,
    base64: base64,
    previewUrl: previewUrl
  };
}


async function loadImageBitmapFromFile(file) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, {
      imageOrientation: "from-image"
    });
  }

  return loadImageElementFromFile(file);
}


function loadImageElementFromFile(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = function () {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("โหลดรูปภาพไม่สำเร็จ"));
    };

    img.src = url;
  });
}


function calculateFitSize(width, height, maxWidth, maxHeight) {
  let targetWidth = width;
  let targetHeight = height;

  if (targetWidth > maxWidth || targetHeight > maxHeight) {
    const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
    targetWidth = Math.round(targetWidth * ratio);
    targetHeight = Math.round(targetHeight * ratio);
  }

  return {
    width: targetWidth,
    height: targetHeight
  };
}


function canvasToBlob(canvas, mimeType, quality) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(
      function (blob) {
        if (!blob) {
          reject(new Error("สร้างไฟล์รูปภาพไม่สำเร็จ"));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}


function blobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.onload = function () {
      resolve(String(reader.result || ""));
    };

    reader.onerror = function () {
      reject(new Error("แปลงรูปภาพไม่สำเร็จ"));
    };

    reader.readAsDataURL(blob);
  });
}


/**
 * =========================
 * CAMERA
 * =========================
 */

async function openCamera(target) {
  AppState.camera.target = target;

  try {
    await startCamera();

    DOM.cameraModal.classList.remove("hidden");
    DOM.cameraModal.setAttribute("aria-hidden", "false");

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "เปิดกล้องไม่สำเร็จ",
      text: err.message || "กรุณาตรวจสอบสิทธิ์การใช้กล้อง"
    });

    await stopCamera();
  }
}


async function startCamera() {
  await stopCamera();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Browser นี้ไม่รองรับการเปิดกล้อง");
  }

  const constraints = {
    video: {
      facingMode: AppState.camera.facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  AppState.camera.stream = stream;
  DOM.cameraVideo.srcObject = stream;

  await DOM.cameraVideo.play();
}


async function stopCamera() {
  if (AppState.camera.stream) {
    AppState.camera.stream.getTracks().forEach(function (track) {
      track.stop();
    });
  }

  AppState.camera.stream = null;

  if (DOM.cameraVideo) {
    DOM.cameraVideo.srcObject = null;
  }
}


async function closeCamera() {
  DOM.cameraModal.classList.add("hidden");
  DOM.cameraModal.setAttribute("aria-hidden", "true");
  AppState.camera.target = null;

  await stopCamera();
}


async function switchCamera() {
  AppState.camera.facingMode =
    AppState.camera.facingMode === "environment" ? "user" : "environment";

  try {
    await startCamera();
  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "สลับกล้องไม่สำเร็จ",
      text: err.message || "กรุณาลองใหม่"
    });
  }
}


async function captureCameraImage() {
  const target = AppState.camera.target;

  if (!target) {
    await closeCamera();
    return;
  }

  const video = DOM.cameraVideo;
  const canvas = DOM.cameraCanvas;

  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;

  if (!width || !height) {
    await Swal.fire({
      icon: "error",
      title: "ถ่ายภาพไม่สำเร็จ",
      text: "ไม่พบขนาดภาพจากกล้อง"
    });
    return;
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, width, height);

  try {
    showLoading("กำลังบันทึกภาพจากกล้อง...");

    const blob = await canvasToBlob(canvas, APP_CONFIG.IMAGE_OUTPUT_TYPE, APP_CONFIG.IMAGE_QUALITY);
    const file = new File(
      [blob],
      "camera_" + formatDateForFileName(new Date()) + ".jpg",
      { type: APP_CONFIG.IMAGE_OUTPUT_TYPE }
    );

    const compressed = await compressImageFile(file);

    updateImageData(target.vehicleId, target.imageType, target.imageId, {
      fileName: file.name,
      mimeType: compressed.mimeType,
      base64: compressed.base64,
      previewUrl: compressed.previewUrl
    });

    renderVehicles();
    await closeCamera();

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "ประมวลผลภาพไม่สำเร็จ",
      text: err.message || "กรุณาลองใหม่อีกครั้ง"
    });

  } finally {
    hideLoading();
  }
}


/**
 * =========================
 * FORM PAYLOAD
 * =========================
 */

function collectPersonPayload() {
  return {
    dc: getPersonSelectFinalValue("dc", "dcOther"),
    fullName: normalizeText(document.getElementById("fullName").value),
    department: getPersonSelectFinalValue("department", "departmentOther"),
    company: getPersonSelectFinalValue("company", "companyOther"),
    phone: normalizeText(document.getElementById("phone").value),
    employeeId: normalizeEmployeeInput(document.getElementById("employeeId").value)
  };
}


function getVehicleFinalValue(vehicle, field) {
  const value = normalizeText(vehicle[field]);

  if (value === APP_CONFIG.OTHER_VALUE) {
    return normalizeText(vehicle[field + "Other"]);
  }

  return value;
}


function collectVehiclesPayload() {
  return AppState.vehicles.map(function (vehicle) {
    return {
      vehicleType: getVehicleFinalValue(vehicle, "vehicleType"),
      brand: getVehicleFinalValue(vehicle, "brand"),
      carColor: getVehicleFinalValue(vehicle, "carColor"),
      plateNumber: normalizePlateInput(vehicle.plateNumber),
      province: getVehicleFinalValue(vehicle, "province"),

      vehicleImages: vehicle.vehicleImages
        .filter(function (img) {
          return img && img.base64;
        })
        .map(function (img) {
          return {
            fileName: img.fileName || "vehicle_image.jpg",
            mimeType: img.mimeType || APP_CONFIG.IMAGE_OUTPUT_TYPE,
            base64: img.base64
          };
        }),

      bookImage: vehicle.bookImage && vehicle.bookImage.base64
        ? {
            fileName: vehicle.bookImage.fileName || "vehicle_book.jpg",
            mimeType: vehicle.bookImage.mimeType || APP_CONFIG.IMAGE_OUTPUT_TYPE,
            base64: vehicle.bookImage.base64
          }
        : null
    };
  });
}


function collectSavePayload() {
  return {
    consent: {
      accepted: AppState.consent.accepted,
      acceptedAt: AppState.consent.acceptedAt,
      version: AppState.consent.version
    },
    person: collectPersonPayload(),
    vehicles: collectVehiclesPayload(),
    userAgent: navigator.userAgent || ""
  };
}


/**
 * =========================
 * VALIDATION
 * =========================
 */

function validatePayload(payload) {
  clearInvalidFields();

  if (!payload.consent.accepted) {
    throw new Error("กรุณากดยินยอมในการจัดเก็บข้อมูลก่อนบันทึก");
  }

  const personRequired = [
    ["dc", "DC", "dc"],
    ["fullName", "ชื่อ-นามสกุล", "fullName"],
    ["department", "แผนก", "department"],
    ["company", "บริษัท", "company"],
    ["phone", "เบอร์โทร", "phone"],
    ["employeeId", "รหัสพนักงาน", "employeeId"]
  ];

  personRequired.forEach(function (item) {
    if (!payload.person[item[0]]) {
      markFieldInvalid(item[2]);
      throw new Error("กรุณากรอกข้อมูล: " + item[1]);
    }
  });

  if (!APP_CONFIG.VALIDATION.PHONE.test(payload.person.phone)) {
    markFieldInvalid("phone");
    throw new Error("รูปแบบเบอร์โทรไม่ถูกต้อง");
  }

  if (!APP_CONFIG.VALIDATION.EMPLOYEE_ID.test(payload.person.employeeId)) {
    markFieldInvalid("employeeId");
    throw new Error("รหัสพนักงานต้องเป็นภาษาอังกฤษตัวใหญ่ A-Z หรือตัวเลขเท่านั้น");
  }

  if (!payload.vehicles.length) {
    throw new Error("กรุณาเพิ่มข้อมูลรถอย่างน้อย 1 คัน");
  }

  if (payload.vehicles.length > APP_CONFIG.MAX_VEHICLES) {
    throw new Error("เพิ่มรถได้สูงสุด " + APP_CONFIG.MAX_VEHICLES + " คัน");
  }

  payload.vehicles.forEach(function (vehicle, index) {
    const label = "รถคันที่ " + (index + 1);

    if (!vehicle.vehicleType) throw new Error(label + ": กรุณาเลือกประเภทรถ");
    if (!vehicle.brand) throw new Error(label + ": กรุณาเลือกยี่ห้อรถ");
    if (!vehicle.carColor) throw new Error(label + ": กรุณาเลือกสีรถ");
    if (!vehicle.plateNumber) throw new Error(label + ": กรุณากรอกหมายเลขทะเบียน");
    if (!vehicle.province) throw new Error(label + ": กรุณาเลือกหมวดจังหวัด");

    if (!APP_CONFIG.VALIDATION.PLATE.test(vehicle.plateNumber)) {
      throw new Error(label + ": หมายเลขทะเบียนต้องเป็นตัวเลขหรืออักษรไทยเท่านั้น");
    }

    if (vehicle.vehicleImages.length > APP_CONFIG.MAX_VEHICLE_IMAGES) {
      throw new Error(label + ": รูปรถเพิ่มได้สูงสุด " + APP_CONFIG.MAX_VEHICLE_IMAGES + " รูป");
    }

    if (!vehicle.bookImage || !vehicle.bookImage.base64) {
      throw new Error(label + ": กรุณาแนบภาพสำเนาทะเบียนรถหรือเล่มรถ 1 ภาพ");
    }
  });
}


function markFieldInvalid(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.classList.add("invalidField");
  el.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  setTimeout(function () {
    try {
      el.focus();
    } catch (err) {
      // ignore
    }
  }, 220);
}


function clearInvalidFields() {
  Array.from(document.querySelectorAll(".invalidField")).forEach(function (el) {
    el.classList.remove("invalidField");
  });
}


function validateSingleInput(input, regex) {
  const value = normalizeText(input.value);

  input.classList.remove("invalidField", "validField");

  if (!value) return;

  if (regex.test(value)) {
    input.classList.add("validField");
  } else {
    input.classList.add("invalidField");
  }
}


/**
 * =========================
 * SUBMIT
 * =========================
 */

async function handleSubmit(event) {
  event.preventDefault();

  if (AppState.isSubmitting) return;

  try {
    const payload = collectSavePayload();
    validatePayload(payload);

    const confirmed = await showConfirmBeforeSave(payload);
    if (!confirmed) return;

    AppState.isSubmitting = true;
    setSubmitState(true);
    showLoading("กำลังบันทึกข้อมูล สร้าง QR Code และสร้าง PDF...");

    const result = await apiPost("/api/save", {
      payload: payload
    });

    if (!result || !result.ok) {
      throw new Error(result.message || "บันทึกข้อมูลไม่สำเร็จ");
    }

    await showSaveSuccess(result);
    resetFormAfterSave();

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "ไม่สามารถบันทึกข้อมูลได้",
      text: err.message || "กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง"
    });

  } finally {
    AppState.isSubmitting = false;
    setSubmitState(false);
    hideLoading();
  }
}


function setSubmitState(isSubmitting) {
  DOM.submitBtn.disabled = isSubmitting;
  DOM.resetBtn.disabled = isSubmitting;
  DOM.addVehicleBtn.disabled = isSubmitting || AppState.vehicles.length >= APP_CONFIG.MAX_VEHICLES;

  DOM.submitBtn.textContent = isSubmitting ? "กำลังบันทึก..." : "ตรวจสอบและบันทึก";
}


/**
 * =========================
 * CONFIRM / SUCCESS
 * =========================
 */

async function showConfirmBeforeSave(payload) {
  const result = await Swal.fire({
    title: "",
    html: buildConfirmHtml(payload),
    customClass: {
      popup: "vehicleSwalPopup",
      confirmButton: "vehicleConfirmBtn",
      cancelButton: "vehicleCancelBtn"
    },
    showCancelButton: true,
    confirmButtonText: "ยืนยันบันทึก",
    cancelButtonText: "กลับไปแก้ไข",
    reverseButtons: true,
    focusConfirm: false
  });

  return result.isConfirmed === true;
}


function buildConfirmHtml(payload) {
  const person = payload.person;

  const vehicleHtml = payload.vehicles.map(function (vehicle, index) {
    return [
      '<div class="confirmVehicleCard">',
        '<div class="confirmVehicleHeader">รถคันที่ ', index + 1, '</div>',
        '<div class="platePreview">',
          '<div class="plateNumberPreview">', escapeHtml(vehicle.plateNumber), '</div>',
          '<div class="plateProvincePreview">', escapeHtml(vehicle.province), '</div>',
        '</div>',
        '<div class="vehicleDetailGrid">',
          detailRowHtml("ประเภทรถ", vehicle.vehicleType),
          detailRowHtml("ยี่ห้อ", vehicle.brand),
          detailRowHtml("สี", vehicle.carColor),
          detailRowHtml("รูปรถ", vehicle.vehicleImages.length + " รูป"),
          detailRowHtml("ภาพสำเนา/เล่มรถ", vehicle.bookImage ? "แนบแล้ว" : "ยังไม่แนบ"),
        '</div>',
      '</div>'
    ].join("");
  }).join("");

  return [
    '<div class="vehicleConfirmWrap">',
      '<h3 class="vehicleConfirmTitle">ตรวจสอบข้อมูลก่อนบันทึก</h3>',

      '<div class="confirmPersonBox">',
        '<h4>ข้อมูลผู้ลงทะเบียน</h4>',
        '<div class="vehicleDetailGrid">',
          detailRowHtml("DC", person.dc),
          detailRowHtml("ชื่อ-นามสกุล", person.fullName),
          detailRowHtml("รหัสพนักงาน", person.employeeId),
          detailRowHtml("แผนก", person.department),
          detailRowHtml("บริษัท", person.company),
          detailRowHtml("เบอร์โทร", person.phone),
        '</div>',
      '</div>',

      '<div class="confirmVehicleList">',
        vehicleHtml,
      '</div>',
    '</div>'
  ].join("");
}


function detailRowHtml(label, value) {
  return [
    '<div class="vehicleDetailLabel">', escapeHtml(label), '</div>',
    '<div class="vehicleDetailValue">', escapeHtml(value || "-"), '</div>'
  ].join("");
}


async function showSaveSuccess(result) {
  await Swal.fire({
    icon: "success",
    title: "บันทึกข้อมูลสำเร็จ",
    html: buildSaveSuccessHtml(result),
    width: 760,
    confirmButtonText: "ตกลง"
  });
}


function buildSaveSuccessHtml(result) {
  const vehicles = Array.isArray(result.vehicles) ? result.vehicles : [];

  const vehicleHtml = vehicles.map(function (vehicle) {
    return [
      '<div class="saveVehicleResultCard">',
        '<div class="saveVehicleResultHeader">',
          'รถคันที่ ', escapeHtml(vehicle.vehicleNo || "-"),
          ' : ', escapeHtml(vehicle.plateNumber || "-"),
          ' ', escapeHtml(vehicle.province || ""),
        '</div>',
        '<div class="saveVehicleResultBody">',
          '<p><b>Vehicle ID:</b> ', escapeHtml(vehicle.vehicleId || "-"), '</p>',
          '<p><b>PIN สำหรับเปิดข้อมูล:</b> <span class="pinBox">', escapeHtml(vehicle.accessPin || "-"), '</span></p>',
          '<p><b>ลิงก์ตรวจสอบรถ:</b><br>',
            '<a class="resultLink" href="', escapeAttribute(vehicle.vehiclePublicUrl || "#"), '" target="_blank" rel="noopener">',
              escapeHtml(vehicle.vehiclePublicUrl || "-"),
            '</a>',
          '</p>',
          '<p><b>QR Code:</b><br>',
            '<a class="resultLink" href="', escapeAttribute(vehicle.qrCodeImageUrl || "#"), '" target="_blank" rel="noopener">',
              'เปิดรูป QR Code',
            '</a>',
          '</p>',
        '</div>',
      '</div>'
    ].join("");
  }).join("");

  return [
    '<div class="saveResultWrap">',
      '<div class="saveResultSummary">',
        '<h4>ระบบสร้างข้อมูลเรียบร้อยแล้ว</h4>',
        '<p><b>Registration ID:</b> ', escapeHtml(result.registrationId || "-"), '</p>',
        '<p><b>Person ID:</b> ', escapeHtml(result.personId || "-"), '</p>',
        '<p><b>เวลาบันทึก:</b> ', escapeHtml(result.timestamp || "-"), '</p>',
        '<p><b>PDF:</b><br>',
          '<a class="resultLink" href="', escapeAttribute(result.pdfUrl || "#"), '" target="_blank" rel="noopener">',
            'เปิดไฟล์ PDF สรุปข้อมูล',
          '</a>',
        '</p>',
      '</div>',

      '<div class="saveVehicleResultList">',
        vehicleHtml,
      '</div>',

      '<p style="margin-top:12px;color:#dc2626;font-weight:800;">',
        'กรุณาจด PIN ของรถแต่ละคันไว้ เพราะต้องใช้คู่กับ QR Code เพื่อเปิดข้อมูลรถ',
      '</p>',
    '</div>'
  ].join("");
}


/**
 * =========================
 * RESET
 * =========================
 */

async function handleReset() {
  const result = await Swal.fire({
    icon: "question",
    title: "ล้างข้อมูลทั้งหมด?",
    text: "ข้อมูลที่กรอกและรูปภาพที่เลือกไว้จะถูกล้างออก",
    showCancelButton: true,
    confirmButtonText: "ล้างข้อมูล",
    cancelButtonText: "ยกเลิก",
    reverseButtons: true
  });

  if (result.isConfirmed) {
    resetFormAfterSave();
  }
}


function resetFormAfterSave() {
  DOM.form.reset();
  clearInvalidFields();

  DOM.personSelects.forEach(function (select) {
    handlePersonSelectOther(select);
  });

  AppState.vehicles.forEach(revokeVehicleObjectUrls);
  AppState.vehicles = [];

  addVehicle();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/**
 * =========================
 * LOADING
 * =========================
 */

function showLoading(text) {
  hideLoading();

  const overlay = document.createElement("div");
  overlay.id = "loadingOverlay";
  overlay.className = "loadingOverlay";

  overlay.innerHTML = [
    '<div class="loadingBox">',
      '<div class="spinner"></div>',
      '<div class="loadingText">', escapeHtml(text || "กำลังดำเนินการ..."), '</div>',
    '</div>'
  ].join("");

  document.body.appendChild(overlay);
}


function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");

  if (overlay) {
    overlay.remove();
  }
}


/**
 * =========================
 * UTILITIES
 * =========================
 */

function normalizeText(value) {
  return String(value == null ? "" : value)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function normalizePlateInput(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[^ก-ฮ0-9]/g, "");
}


function normalizeEmployeeInput(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}


function createLocalId(prefix) {
  return String(prefix || "id") + "_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}


function getLocalDateTimeString() {
  const d = new Date();
  const pad = function (n) {
    return String(n).padStart(2, "0");
  };

  return [
    d.getFullYear(),
    "-",
    pad(d.getMonth() + 1),
    "-",
    pad(d.getDate()),
    " ",
    pad(d.getHours()),
    ":",
    pad(d.getMinutes()),
    ":",
    pad(d.getSeconds())
  ].join("");
}


function formatDateForFileName(date) {
  const pad = function (n) {
    return String(n).padStart(2, "0");
  };

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}


function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
  IMAGE_OUTPUT_TYPE: "image/jpeg",

  OTHER_VALUE: "อื่นๆ",

  VALIDATION: {
    // ทะเบียน: ตัวเลข + อักษรไทยเท่านั้น ห้ามเว้นวรรค ห้ามอักขระพิเศษ
    PLATE: /^[ก-ฮ0-9]+$/,

    // รหัสพนักงาน: A-Z + 0-9 เท่านั้น
    EMPLOYEE_ID: /^[A-Z0-9]+$/,

    // เบอร์โทร: รองรับตัวเลข + เครื่องหมายพื้นฐาน
    PHONE: /^[0-9+\-\s()]{6,20}$/
  }
};


/**
 * =========================
 * STATE
 * =========================
 */

const AppState = {
  options: {},
  images: [],
  currentCameraImageId: null,
  cameraStream: null,
  cameraFacingMode: "environment",
  isSubmitting: false
};


/**
 * =========================
 * DOM
 * =========================
 */

const DOM = {};

document.addEventListener("DOMContentLoaded", initApp);


/**
 * =========================
 * INIT
 * =========================
 */

async function initApp() {
  cacheDom();
  bindEvents();
  initImageList();

  await checkApiHealth();
  await loadOptions();
}


function cacheDom() {
  DOM.form = document.getElementById("vehicleForm");

  DOM.apiStatusDot = document.getElementById("apiStatusDot");
  DOM.apiStatusText = document.getElementById("apiStatusText");

  DOM.addImageBtn = document.getElementById("addImageBtn");
  DOM.imageList = document.getElementById("imageList");
  DOM.imageItemTemplate = document.getElementById("imageItemTemplate");

  DOM.resetBtn = document.getElementById("resetBtn");
  DOM.submitBtn = document.getElementById("submitBtn");

  DOM.cameraModal = document.getElementById("cameraModal");
  DOM.cameraVideo = document.getElementById("cameraVideo");
  DOM.cameraCanvas = document.getElementById("cameraCanvas");
  DOM.closeCameraBtn = document.getElementById("closeCameraBtn");
  DOM.switchCameraBtn = document.getElementById("switchCameraBtn");
  DOM.captureBtn = document.getElementById("captureBtn");

  DOM.selects = Array.from(document.querySelectorAll("select[data-option-key]"));
}


/**
 * =========================
 * EVENTS
 * =========================
 */

function bindEvents() {
  DOM.form.addEventListener("submit", handleSubmit);

  DOM.resetBtn.addEventListener("click", handleReset);
  DOM.addImageBtn.addEventListener("click", addImageItem);

  DOM.closeCameraBtn.addEventListener("click", closeCamera);
  DOM.switchCameraBtn.addEventListener("click", switchCamera);
  DOM.captureBtn.addEventListener("click", captureCameraImage);

  DOM.selects.forEach(function (select) {
    select.addEventListener("change", handleSelectOtherChange);
  });

  const plateInput = document.getElementById("plateNumber");
  const employeeInput = document.getElementById("employeeId");

  plateInput.addEventListener("input", function () {
    plateInput.value = normalizePlateInput(plateInput.value);
    validateSingleInput(plateInput, APP_CONFIG.VALIDATION.PLATE);
  });

  employeeInput.addEventListener("input", function () {
    employeeInput.value = normalizeEmployeeInput(employeeInput.value);
    validateSingleInput(employeeInput, APP_CONFIG.VALIDATION.EMPLOYEE_ID);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !DOM.cameraModal.classList.contains("hidden")) {
      closeCamera();
    }
  });
}


/**
 * =========================
 * API
 * =========================
 */

function getApiBase() {
  const base = String(APP_CONFIG.API_BASE || "").trim().replace(/\/+$/, "");

  if (!base || base === "PASTE_YOUR_CLOUDFLARE_WORKER_URL_HERE") {
    throw new Error("ยังไม่ได้ตั้งค่า APP_CONFIG.API_BASE ในไฟล์ app.js");
  }

  return base;
}


async function apiGet(path) {
  const url = getApiBase() + path;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });

  return parseApiResponse(response);
}


async function apiPost(path, data) {
  const url = getApiBase() + path;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Accept": "application/json"
    },
    body: JSON.stringify(data || {})
  });

  return parseApiResponse(response);
}


async function parseApiResponse(response) {
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("API ตอบกลับไม่ใช่ JSON: " + text.slice(0, 200));
  }

  if (!response.ok) {
    throw new Error(data.message || "API error: " + response.status);
  }

  return data;
}


async function checkApiHealth() {
  setApiStatus("checking", "กำลังตรวจสอบระบบ...");

  try {
    const data = await apiGet("/health");

    if (data && data.ok) {
      setApiStatus("online", "ระบบพร้อมใช้งาน");
    } else {
      setApiStatus("offline", "ระบบไม่พร้อมใช้งาน");
    }

  } catch (err) {
    setApiStatus("offline", err.message || "เชื่อมต่อระบบไม่ได้");
  }
}


async function loadOptions() {
  try {
    setSelectsLoading(true);

    const data = await apiGet("/api/options");

    if (!data || !data.ok || !data.options) {
      throw new Error(data.message || "ไม่พบข้อมูลตัวเลือก");
    }

    AppState.options = data.options;
    renderAllOptions(data.options);

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "โหลดตัวเลือกไม่สำเร็จ",
      text: err.message || "กรุณาตรวจสอบ API หรือ Google Apps Script"
    });

    setSelectsError();

  } finally {
    setSelectsLoading(false);
  }
}


function setApiStatus(status, text) {
  DOM.apiStatusDot.classList.remove("statusChecking", "statusOnline", "statusOffline");

  if (status === "online") {
    DOM.apiStatusDot.classList.add("statusOnline");
  } else if (status === "offline") {
    DOM.apiStatusDot.classList.add("statusOffline");
  } else {
    DOM.apiStatusDot.classList.add("statusChecking");
  }

  DOM.apiStatusText.textContent = text;
}


/**
 * =========================
 * OPTIONS / DROPDOWNS
 * =========================
 */

function renderAllOptions(options) {
  DOM.selects.forEach(function (select) {
    const optionKey = select.dataset.optionKey;
    const values = options[optionKey] || [];

    renderSelectOptions(select, values);
    handleSelectOtherChange({ currentTarget: select });
  });
}


function renderSelectOptions(select, values) {
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "กรุณาเลือก";
  select.appendChild(placeholder);

  values.forEach(function (value) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}


function setSelectsLoading(isLoading) {
  DOM.selects.forEach(function (select) {
    select.disabled = isLoading;

    if (isLoading) {
      select.innerHTML = '<option value="">กำลังโหลดข้อมูล...</option>';
    }
  });
}


function setSelectsError() {
  DOM.selects.forEach(function (select) {
    select.innerHTML = '<option value="">โหลดข้อมูลไม่สำเร็จ</option>';
    select.disabled = true;
  });
}


function handleSelectOtherChange(event) {
  const select = event.currentTarget;
  const targetId = select.dataset.otherTarget;

  if (!targetId) return;

  const otherInput = document.getElementById(targetId);
  if (!otherInput) return;

  const isOther = select.value === APP_CONFIG.OTHER_VALUE;

  otherInput.classList.toggle("hidden", !isOther);
  otherInput.required = isOther;

  if (!isOther) {
    otherInput.value = "";
    otherInput.classList.remove("invalidField", "validField");
  }
}


function getSelectFinalValue(selectId, otherInputId) {
  const select = document.getElementById(selectId);
  const otherInput = document.getElementById(otherInputId);

  if (!select) return "";

  if (select.value === APP_CONFIG.OTHER_VALUE) {
    return normalizeText(otherInput ? otherInput.value : "");
  }

  return normalizeText(select.value);
}


/**
 * =========================
 * IMAGE HANDLING
 * =========================
 */

function initImageList() {
  AppState.images = [];
  addImageItem();
}


function addImageItem() {
  if (AppState.images.length >= APP_CONFIG.MAX_IMAGES) {
    Swal.fire({
      icon: "warning",
      title: "เพิ่มรูปไม่ได้",
      text: "สามารถเพิ่มรูปภาพได้สูงสุด " + APP_CONFIG.MAX_IMAGES + " รูป"
    });
    return;
  }

  const imageId = createLocalImageId();

  AppState.images.push({
    id: imageId,
    fileName: "",
    mimeType: "",
    base64: "",
    previewUrl: ""
  });

  renderImageList();
}


function removeImageItem(imageId) {
  if (AppState.images.length <= 1) {
    Swal.fire({
      icon: "warning",
      title: "ลบรูปไม่ได้",
      text: "ต้องมีช่องรูปภาพอย่างน้อย 1 ช่อง"
    });
    return;
  }

  const image = AppState.images.find(function (item) {
    return item.id === imageId;
  });

  if (image && image.previewUrl) {
    URL.revokeObjectURL(image.previewUrl);
  }

  AppState.images = AppState.images.filter(function (item) {
    return item.id !== imageId;
  });

  renderImageList();
}


function renderImageList() {
  DOM.imageList.innerHTML = "";

  AppState.images.forEach(function (image, index) {
    const node = DOM.imageItemTemplate.content.firstElementChild.cloneNode(true);

    node.dataset.imageIndex = String(index + 1);
    node.dataset.imageId = image.id;

    const label = node.querySelector(".imageLabel");
    const status = node.querySelector(".imageStatus");
    const preview = node.querySelector(".imagePreview");
    const emptyPreview = node.querySelector(".emptyPreview");
    const fileInput = node.querySelector(".imageFileInput");
    const cameraBtn = node.querySelector(".cameraOpenBtn");
    const removeBtn = node.querySelector(".removeImageBtn");

    label.textContent = "รูปภาพที่ " + (index + 1);

    if (image.base64) {
      status.textContent = image.fileName || "เลือกรูปแล้ว";
      preview.src = image.previewUrl || image.base64;
      preview.classList.remove("hidden");
      emptyPreview.classList.add("hidden");
    } else {
      status.textContent = "ยังไม่ได้เลือกรูป";
      preview.removeAttribute("src");
      preview.classList.add("hidden");
      emptyPreview.classList.remove("hidden");
    }

    fileInput.addEventListener("change", function (event) {
      handleImageFileChange(event, image.id);
    });

    cameraBtn.addEventListener("click", function () {
      openCamera(image.id);
    });

    removeBtn.addEventListener("click", function () {
      removeImageItem(image.id);
    });

    DOM.imageList.appendChild(node);
  });

  DOM.addImageBtn.disabled = AppState.images.length >= APP_CONFIG.MAX_IMAGES;
}


async function handleImageFileChange(event, imageId) {
  const file = event.target.files && event.target.files[0];

  if (!file) return;

  if (!file.type || !file.type.startsWith("image/")) {
    await Swal.fire({
      icon: "error",
      title: "ไฟล์ไม่ถูกต้อง",
      text: "กรุณาเลือกไฟล์รูปภาพเท่านั้น"
    });
    event.target.value = "";
    return;
  }

  try {
    showLoading("กำลังประมวลผลรูปภาพ...");

    const compressed = await compressImageFile(file);

    updateImageData(imageId, {
      fileName: file.name || "upload.jpg",
      mimeType: compressed.mimeType,
      base64: compressed.base64,
      previewUrl: compressed.previewUrl
    });

    renderImageList();

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "อ่านรูปภาพไม่สำเร็จ",
      text: err.message || "กรุณาลองใหม่อีกครั้ง"
    });

  } finally {
    hideLoading();
    event.target.value = "";
  }
}


function updateImageData(imageId, patch) {
  AppState.images = AppState.images.map(function (image) {
    if (image.id !== imageId) return image;

    if (image.previewUrl && patch.previewUrl && image.previewUrl !== patch.previewUrl) {
      URL.revokeObjectURL(image.previewUrl);
    }

    return {
      ...image,
      ...patch
    };
  });
}


function getSelectedImages() {
  return AppState.images
    .filter(function (image) {
      return image && image.base64;
    })
    .map(function (image) {
      return {
        fileName: image.fileName || "vehicle_image.jpg",
        mimeType: image.mimeType || APP_CONFIG.IMAGE_OUTPUT_TYPE,
        base64: image.base64
      };
    });
}


function createLocalImageId() {
  return "img_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}


/**
 * =========================
 * CAMERA
 * =========================
 */

async function openCamera(imageId) {
  AppState.currentCameraImageId = imageId;

  try {
    await startCamera();

    DOM.cameraModal.classList.remove("hidden");
    DOM.cameraModal.setAttribute("aria-hidden", "false");

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "เปิดกล้องไม่สำเร็จ",
      text: err.message || "กรุณาตรวจสอบสิทธิ์การใช้กล้องของ Browser"
    });

    await stopCamera();
  }
}


async function startCamera() {
  await stopCamera();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Browser นี้ไม่รองรับการเปิดกล้อง");
  }

  const constraints = {
    video: {
      facingMode: AppState.cameraFacingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  AppState.cameraStream = stream;
  DOM.cameraVideo.srcObject = stream;

  await DOM.cameraVideo.play();
}


async function stopCamera() {
  if (AppState.cameraStream) {
    AppState.cameraStream.getTracks().forEach(function (track) {
      track.stop();
    });
  }

  AppState.cameraStream = null;

  if (DOM.cameraVideo) {
    DOM.cameraVideo.srcObject = null;
  }
}


async function closeCamera() {
  DOM.cameraModal.classList.add("hidden");
  DOM.cameraModal.setAttribute("aria-hidden", "true");
  AppState.currentCameraImageId = null;

  await stopCamera();
}


async function switchCamera() {
  AppState.cameraFacingMode =
    AppState.cameraFacingMode === "environment" ? "user" : "environment";

  try {
    await startCamera();
  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "สลับกล้องไม่สำเร็จ",
      text: err.message || "กรุณาลองใหม่อีกครั้ง"
    });
  }
}


async function captureCameraImage() {
  if (!AppState.currentCameraImageId) {
    await closeCamera();
    return;
  }

  const video = DOM.cameraVideo;
  const canvas = DOM.cameraCanvas;

  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;

  if (!width || !height) {
    await Swal.fire({
      icon: "error",
      title: "ถ่ายภาพไม่สำเร็จ",
      text: "ไม่พบขนาดภาพจากกล้อง"
    });
    return;
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, width, height);

  try {
    showLoading("กำลังบันทึกภาพจากกล้อง...");

    const blob = await canvasToBlob(canvas, APP_CONFIG.IMAGE_OUTPUT_TYPE, APP_CONFIG.IMAGE_QUALITY);
    const file = new File(
      [blob],
      "camera_" + formatDateForFileName(new Date()) + ".jpg",
      { type: APP_CONFIG.IMAGE_OUTPUT_TYPE }
    );

    const compressed = await compressImageFile(file);

    updateImageData(AppState.currentCameraImageId, {
      fileName: file.name,
      mimeType: compressed.mimeType,
      base64: compressed.base64,
      previewUrl: compressed.previewUrl
    });

    renderImageList();
    await closeCamera();

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "ประมวลผลภาพไม่สำเร็จ",
      text: err.message || "กรุณาลองใหม่อีกครั้ง"
    });

  } finally {
    hideLoading();
  }
}


/**
 * =========================
 * IMAGE COMPRESSION
 * =========================
 */

async function compressImageFile(file) {
  const imageBitmap = await loadImageBitmapFromFile(file);

  const size = calculateFitSize(
    imageBitmap.width,
    imageBitmap.height,
    APP_CONFIG.IMAGE_MAX_WIDTH,
    APP_CONFIG.IMAGE_MAX_HEIGHT
  );

  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0, size.width, size.height);

  const blob = await canvasToBlob(
    canvas,
    APP_CONFIG.IMAGE_OUTPUT_TYPE,
    APP_CONFIG.IMAGE_QUALITY
  );

  const base64 = await blobToDataUrl(blob);
  const previewUrl = URL.createObjectURL(blob);

  if (imageBitmap.close) {
    imageBitmap.close();
  }

  return {
    mimeType: APP_CONFIG.IMAGE_OUTPUT_TYPE,
    base64: base64,
    previewUrl: previewUrl
  };
}


async function loadImageBitmapFromFile(file) {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, {
      imageOrientation: "from-image"
    });
  }

  return loadImageElementFromFile(file);
}


function loadImageElementFromFile(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = function () {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error("โหลดรูปภาพไม่สำเร็จ"));
    };

    img.src = url;
  });
}


function calculateFitSize(width, height, maxWidth, maxHeight) {
  let targetWidth = width;
  let targetHeight = height;

  if (targetWidth > maxWidth || targetHeight > maxHeight) {
    const ratio = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
    targetWidth = Math.round(targetWidth * ratio);
    targetHeight = Math.round(targetHeight * ratio);
  }

  return {
    width: targetWidth,
    height: targetHeight
  };
}


function canvasToBlob(canvas, mimeType, quality) {
  return new Promise(function (resolve, reject) {
    canvas.toBlob(
      function (blob) {
        if (!blob) {
          reject(new Error("สร้างไฟล์รูปภาพไม่สำเร็จ"));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}


function blobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.onload = function () {
      resolve(String(reader.result || ""));
    };

    reader.onerror = function () {
      reject(new Error("แปลงรูปภาพไม่สำเร็จ"));
    };

    reader.readAsDataURL(blob);
  });
}


/**
 * =========================
 * FORM SUBMIT
 * =========================
 */

async function handleSubmit(event) {
  event.preventDefault();

  if (AppState.isSubmitting) return;

  try {
    const payload = collectFormPayload();
    validatePayload(payload);

    const confirmed = await showVehicleConfirm(payload);

    if (!confirmed) return;

    AppState.isSubmitting = true;
    setSubmitState(true);
    showLoading("กำลังบันทึกข้อมูล...");

    const result = await apiPost("/api/save", {
      action: "save",
      payload: payload
    });

    if (!result || !result.ok) {
      throw new Error(result.message || "บันทึกข้อมูลไม่สำเร็จ");
    }

    await Swal.fire({
      icon: "success",
      title: "บันทึกข้อมูลสำเร็จ",
      html: buildSuccessHtml(result),
      confirmButtonText: "ตกลง"
    });

    resetForm();

  } catch (err) {
    await Swal.fire({
      icon: "error",
      title: "ไม่สามารถบันทึกข้อมูลได้",
      text: err.message || "กรุณาตรวจสอบข้อมูลและลองใหม่อีกครั้ง"
    });

  } finally {
    AppState.isSubmitting = false;
    setSubmitState(false);
    hideLoading();
  }
}


function collectFormPayload() {
  return {
    dc: getSelectFinalValue("dc", "dcOther"),
    vehicleType: getSelectFinalValue("vehicleType", "vehicleTypeOther"),
    fullName: normalizeText(document.getElementById("fullName").value),
    brand: getSelectFinalValue("brand", "brandOther"),
    carColor: getSelectFinalValue("carColor", "carColorOther"),
    plateNumber: normalizePlateInput(document.getElementById("plateNumber").value),
    province: getSelectFinalValue("province", "provinceOther"),
    department: getSelectFinalValue("department", "departmentOther"),
    company: getSelectFinalValue("company", "companyOther"),
    phone: normalizeText(document.getElementById("phone").value),
    employeeId: normalizeEmployeeInput(document.getElementById("employeeId").value),
    userAgent: navigator.userAgent || "",
    images: getSelectedImages()
  };
}


function validatePayload(payload) {
  clearInvalidFields();

  const requiredMap = [
    ["dc", "DC", "dc"],
    ["vehicleType", "ประเภทรถ", "vehicleType"],
    ["fullName", "ชื่อ-นามสกุล", "fullName"],
    ["brand", "ยี่ห้อรถ", "brand"],
    ["carColor", "สีรถ", "carColor"],
    ["plateNumber", "หมายเลขทะเบียน", "plateNumber"],
    ["province", "หมวดจังหวัด", "province"],
    ["department", "แผนก", "department"],
    ["company", "บริษัท", "company"],
    ["phone", "เบอร์โทร", "phone"],
    ["employeeId", "รหัสพนักงาน", "employeeId"]
  ];

  for (const item of requiredMap) {
    const key = item[0];
    const label = item[1];
    const elementId = item[2];

    if (!payload[key]) {
      markFieldInvalid(elementId);
      throw new Error("กรุณากรอกข้อมูล: " + label);
    }
  }

  if (!APP_CONFIG.VALIDATION.PLATE.test(payload.plateNumber)) {
    markFieldInvalid("plateNumber");
    throw new Error("หมายเลขทะเบียนต้องเป็นตัวเลขหรืออักษรไทยเท่านั้น และห้ามมีอักขระพิเศษ");
  }

  if (!APP_CONFIG.VALIDATION.EMPLOYEE_ID.test(payload.employeeId)) {
    markFieldInvalid("employeeId");
    throw new Error("รหัสพนักงานต้องเป็นภาษาอังกฤษตัวใหญ่ A-Z หรือตัวเลขเท่านั้น");
  }

  if (!APP_CONFIG.VALIDATION.PHONE.test(payload.phone)) {
    markFieldInvalid("phone");
    throw new Error("รูปแบบเบอร์โทรไม่ถูกต้อง");
  }

  if (payload.images.length > APP_CONFIG.MAX_IMAGES) {
    throw new Error("อัปโหลดรูปภาพได้สูงสุด " + APP_CONFIG.MAX_IMAGES + " รูป");
  }
}


function markFieldInvalid(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.classList.add("invalidField");
  el.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  setTimeout(function () {
    try {
      el.focus();
    } catch (err) {
      // ignore
    }
  }, 220);
}


function clearInvalidFields() {
  Array.from(document.querySelectorAll(".invalidField")).forEach(function (el) {
    el.classList.remove("invalidField");
  });
}


function validateSingleInput(input, regex) {
  const value = normalizeText(input.value);

  input.classList.remove("invalidField", "validField");

  if (!value) return;

  if (regex.test(value)) {
    input.classList.add("validField");
  } else {
    input.classList.add("invalidField");
  }
}


function setSubmitState(isSubmitting) {
  DOM.submitBtn.disabled = isSubmitting;
  DOM.resetBtn.disabled = isSubmitting;
  DOM.addImageBtn.disabled = isSubmitting || AppState.images.length >= APP_CONFIG.MAX_IMAGES;

  DOM.submitBtn.textContent = isSubmitting ? "กำลังบันทึก..." : "ตรวจสอบและบันทึก";
}


/**
 * =========================
 * SWEETALERT CONFIRM
 * =========================
 */

async function showVehicleConfirm(payload) {
  const html = buildVehicleConfirmHtml(payload);

  const result = await Swal.fire({
    title: "",
    html: html,
    customClass: {
      popup: "vehicleSwalPopup",
      confirmButton: "vehicleConfirmBtn",
      cancelButton: "vehicleCancelBtn"
    },
    showCancelButton: true,
    confirmButtonText: "ยืนยันบันทึก",
    cancelButtonText: "กลับไปแก้ไข",
    reverseButtons: true,
    focusConfirm: false
  });

  return result.isConfirmed === true;
}


function buildVehicleConfirmHtml(payload) {
  const imageCount = Array.isArray(payload.images) ? payload.images.length : 0;

  return [
    '<div class="vehicleConfirmWrap">',
      '<h3 class="vehicleConfirmTitle">ตรวจสอบข้อมูลก่อนบันทึก</h3>',

      '<div class="platePreview">',
        '<div class="plateNumberPreview">', escapeHtml(payload.plateNumber), '</div>',
        '<div class="plateProvincePreview">', escapeHtml(payload.province), '</div>',
      '</div>',

      '<div class="vehicleDetailGrid">',
        detailRowHtml("DC", payload.dc),
        detailRowHtml("ประเภทรถ", payload.vehicleType),
        detailRowHtml("ยี่ห้อรถ", payload.brand),
        detailRowHtml("สีรถ", payload.carColor),
        detailRowHtml("ชื่อ-นามสกุล", payload.fullName),
        detailRowHtml("แผนก", payload.department),
        detailRowHtml("บริษัท", payload.company),
        detailRowHtml("เบอร์โทร", payload.phone),
        detailRowHtml("รหัสพนักงาน", payload.employeeId),
        detailRowHtml("จำนวนรูปภาพ", imageCount + " รูป"),
      '</div>',
    '</div>'
  ].join("");
}


function detailRowHtml(label, value) {
  return [
    '<div class="vehicleDetailLabel">', escapeHtml(label), '</div>',
    '<div class="vehicleDetailValue">', escapeHtml(value || "-"), '</div>'
  ].join("");
}


function buildSuccessHtml(result) {
  return [
    '<div style="text-align:left;line-height:1.7">',
      '<b>Record ID:</b> ', escapeHtml(result.recordId || "-"), '<br>',
      '<b>เวลาบันทึก:</b> ', escapeHtml(result.timestamp || "-"), '<br>',
      '<b>จำนวนรูป:</b> ', Array.isArray(result.imageIds) ? result.imageIds.length : 0, ' รูป',
    '</div>'
  ].join("");
}


/**
 * =========================
 * RESET
 * =========================
 */

async function handleReset() {
  const result = await Swal.fire({
    icon: "question",
    title: "ล้างข้อมูลทั้งหมด?",
    text: "ข้อมูลที่กรอกและรูปภาพที่เลือกไว้จะถูกล้างออก",
    showCancelButton: true,
    confirmButtonText: "ล้างข้อมูล",
    cancelButtonText: "ยกเลิก",
    reverseButtons: true
  });

  if (result.isConfirmed) {
    resetForm();
  }
}


function resetForm() {
  DOM.form.reset();
  clearInvalidFields();

  DOM.selects.forEach(function (select) {
    handleSelectOtherChange({ currentTarget: select });
  });

  AppState.images.forEach(function (image) {
    if (image.previewUrl) {
      URL.revokeObjectURL(image.previewUrl);
    }
  });

  AppState.images = [];
  addImageItem();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/**
 * =========================
 * LOADING OVERLAY
 * =========================
 */

function showLoading(text) {
  hideLoading();

  const overlay = document.createElement("div");
  overlay.id = "loadingOverlay";
  overlay.className = "loadingOverlay";

  overlay.innerHTML = [
    '<div class="loadingBox">',
      '<div class="spinner"></div>',
      '<div class="loadingText">', escapeHtml(text || "กำลังดำเนินการ..."), '</div>',
    '</div>'
  ].join("");

  document.body.appendChild(overlay);
}


function hideLoading() {
  const overlay = document.getElementById("loadingOverlay");

  if (overlay) {
    overlay.remove();
  }
}


/**
 * =========================
 * UTILITIES
 * =========================
 */

function normalizeText(value) {
  return String(value == null ? "" : value)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function normalizePlateInput(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[^ก-ฮ0-9]/g, "");
}


function normalizeEmployeeInput(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
}


function formatDateForFileName(date) {
  const pad = function (n) {
    return String(n).padStart(2, "0");
  };

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}


function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
