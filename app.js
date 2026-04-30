/************************************************************
 * Vehicle Registration System
 * app.js v6
 *
 * Version:
 * - Public user success screen
 * - Hide PDF URL / QR URL / PIN from normal users
 * - Show registration summary + Sticker No
 * - Show PDF / Email status with clear badge
 * - Fallback result fields to prevent "-" when backend sends nested data
 ************************************************************/


/**
 * =========================
 * CONFIG
 * =========================
 */

const APP_CONFIG = {
  API_BASE: "https://registercar.somchaibutphon.workers.dev",

  CONSENT_VERSION: "PDPA-VEHICLE-REG-001",

  MAX_VEHICLES: 3,
  MAX_VEHICLE_IMAGES: 3,

  IMAGE_MAX_WIDTH: 1280,
  IMAGE_MAX_HEIGHT: 1280,
  IMAGE_QUALITY: 0.78,
  IMAGE_OUTPUT_TYPE: "image/jpeg",

  OTHER_VALUE: "อื่นๆ",

  API_TIMEOUT_GET_MS: 60000,
  API_TIMEOUT_SAVE_MS: 240000,

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

  options: {
    dc: [],
    department: [],
    company: [],
    vehicleType: [],
    brand: [],
    carColor: [],
    province: []
  },

  vehicles: [],

  camera: {
    stream: null,
    facingMode: "environment",
    target: null
  },

  isSubmitting: false,
  optionsLoaded: false
};


/**
 * =========================
 * DOM CACHE
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
  assertRequiredDom();
  bindEvents();

  showConsentScreen();
  syncConsentButtonState();

  await checkApiHealth();
  await loadOptions();

  if (AppState.vehicles.length === 0) {
    addVehicle();
  }
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


function assertRequiredDom() {
  const required = [
    ["consentScreen", DOM.consentScreen],
    ["appScreen", DOM.appScreen],
    ["consentCheck", DOM.consentCheck],
    ["acceptConsentBtn", DOM.acceptConsentBtn],
    ["vehicleForm", DOM.form],
    ["apiStatusDot", DOM.apiStatusDot],
    ["apiStatusText", DOM.apiStatusText],
    ["addVehicleBtn", DOM.addVehicleBtn],
    ["vehicleList", DOM.vehicleList],
    ["vehicleCardTemplate", DOM.vehicleCardTemplate],
    ["imageItemTemplate", DOM.imageItemTemplate],
    ["bookImageItemTemplate", DOM.bookImageItemTemplate],
    ["resetBtn", DOM.resetBtn],
    ["submitBtn", DOM.submitBtn],
    ["cameraModal", DOM.cameraModal],
    ["cameraVideo", DOM.cameraVideo],
    ["cameraCanvas", DOM.cameraCanvas],
    ["closeCameraBtn", DOM.closeCameraBtn],
    ["switchCameraBtn", DOM.switchCameraBtn],
    ["captureBtn", DOM.captureBtn]
  ];

  const missing = required
    .filter(function (item) {
      return !item[1];
    })
    .map(function (item) {
      return item[0];
    });

  if (missing.length) {
    throw new Error("index.html ขาด element สำคัญ: " + missing.join(", "));
  }
}


function bindEvents() {
  if (DOM.consentVersionText) {
    DOM.consentVersionText.textContent = APP_CONFIG.CONSENT_VERSION;
  }

  DOM.consentCheck.addEventListener("change", syncConsentButtonState);
  DOM.consentCheck.addEventListener("input", syncConsentButtonState);

  DOM.acceptConsentBtn.addEventListener("click", function (event) {
    event.preventDefault();
    acceptConsent();
  });

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

  const employeeInput = document.getElementById("employeeId");
  if (employeeInput) {
    employeeInput.addEventListener("input", function (event) {
      event.target.value = normalizeEmployeeInput(event.target.value);
      validateSingleInput(event.target, APP_CONFIG.VALIDATION.EMPLOYEE_ID);
    });
  }

  const phoneInput = document.getElementById("phone");
  if (phoneInput) {
    phoneInput.addEventListener("input", function (event) {
      validateSingleInput(event.target, APP_CONFIG.VALIDATION.PHONE);
    });
  }

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


function syncConsentButtonState() {
  if (!DOM.consentCheck || !DOM.acceptConsentBtn) return;
  DOM.acceptConsentBtn.disabled = !DOM.consentCheck.checked;
}


function acceptConsent() {
  syncConsentButtonState();

  if (!DOM.consentCheck.checked) {
    Swal.fire({
      icon: "warning",
      title: "กรุณายืนยันความยินยอม",
      text: "ต้องติ๊กยินยอมก่อนจึงจะเข้าสู่ระบบลงทะเบียนได้"
    });
    return;
  }

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


async function apiGet(path, timeoutMs) {
  const controller = new AbortController();

  const timeout = setTimeout(function () {
    controller.abort();
  }, timeoutMs || APP_CONFIG.API_TIMEOUT_GET_MS);

  try {
    const response = await fetch(getApiBase() + path, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      },
      signal: controller.signal
    });

    return await parseApiResponse(response);

  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("เชื่อมต่อ API นานเกินไป กรุณาตรวจสอบ Worker หรือ Apps Script");
    }

    throw err;

  } finally {
    clearTimeout(timeout);
  }
}


async function apiPost(path, body, timeoutMs) {
  const controller = new AbortController();

  const timeout = setTimeout(function () {
    controller.abort();
  }, timeoutMs || APP_CONFIG.API_TIMEOUT_SAVE_MS);

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

    return await parseApiResponse(response);

  } catch (err) {
    if (err && err.name === "AbortError") {
      throw new Error("ระบบใช้เวลาบันทึกนานเกินไป กรุณาตรวจสอบขนาดรูปภาพ, Worker, Apps Script หรือขั้นตอนสร้าง PDF/ส่ง Email");
    }

    throw err;

  } finally {
    clearTimeout(timeout);
  }
}


async function parseApiResponse(response) {
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("API ตอบกลับไม่ใช่ JSON: " + text.slice(0, 300));
  }

  if (!response.ok) {
    throw new Error(data.message || "API error: " + response.status);
  }

  return data;
}


async function checkApiHealth() {
  setApiStatus("checking", "กำลังตรวจสอบระบบ...");

  try {
    const data = await apiGet("/health", APP_CONFIG.API_TIMEOUT_GET_MS);

    if (data && data.ok) {
      setApiStatus("online", "ระบบพร้อมใช้งาน");
    } else {
      setApiStatus("offline", data.message || "ระบบไม่พร้อมใช้งาน");
    }

  } catch (err) {
    setApiStatus("offline", err.message || "เชื่อมต่อระบบไม่ได้");
  }
}


async function loadOptions() {
  try {
    setPersonSelectsLoading(true);

    const data = await apiGet("/api/options", APP_CONFIG.API_TIMEOUT_GET_MS);

    if (!data || !data.ok || !data.options) {
      throw new Error(data.message || "โหลดตัวเลือกไม่สำเร็จ");
    }

    AppState.options = normalizeOptions(data.options);
    AppState.optionsLoaded = true;

    renderPersonOptions();
    renderVehicles();

  } catch (err) {
    AppState.optionsLoaded = false;

    await Swal.fire({
      icon: "error",
      title: "โหลดตัวเลือกไม่สำเร็จ",
      text: err.message || "กรุณาตรวจสอบ Cloudflare Worker หรือ Apps Script"
    });

    setPersonSelectsError();

  } finally {
    setPersonSelectsLoading(false);
  }
}


function normalizeOptions(options) {
  return {
    dc: ensureOtherOption(options.dc),
    department: ensureOtherOption(options.department),
    company: ensureOtherOption(options.company),
    vehicleType: ensureOtherOption(options.vehicleType),
    brand: ensureOtherOption(options.brand),
    carColor: ensureOtherOption(options.carColor),
    province: ensureOtherOption(options.province)
  };
}


function ensureOtherOption(values) {
  const arr = Array.isArray(values) ? values.map(normalizeText).filter(Boolean) : [];

  const withoutOther = arr.filter(function (value) {
    return value !== APP_CONFIG.OTHER_VALUE;
  });

  withoutOther.push(APP_CONFIG.OTHER_VALUE);
  return withoutOther;
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
 * OPTIONS / SELECT
 * =========================
 */

function renderPersonOptions() {
  DOM.personSelects.forEach(function (select) {
    const key = select.dataset.optionKey;
    const currentValue = select.value;

    renderSelectOptions(select, AppState.options[key] || [], currentValue);
    handlePersonSelectOther(select);
  });
}


function renderSelectOptions(select, values, selectedValue) {
  const current = selectedValue || "";
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "กรุณาเลือก";
  select.appendChild(placeholder);

  values.forEach(function (value) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;

    if (current && current === value) {
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
  revokeVehicleObjectUrls(vehicle);

  AppState.vehicles = AppState.vehicles.filter(function (item) {
    return item.id !== vehicleId;
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
    return;
  }

  vehicle[field] = normalizeText(value);
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
    image.previewUrl = "";
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

  DOM.addVehicleBtn.disabled =
    AppState.isSubmitting || AppState.vehicles.length >= APP_CONFIG.MAX_VEHICLES;
}


function bindVehicleFields(node, vehicle) {
  const selects = Array.from(node.querySelectorAll("select.vehicleInput"));
  const regularInputs = Array.from(node.querySelectorAll("input.vehicleInput"));
  const otherInputs = Array.from(node.querySelectorAll(".vehicleOtherInput"));

  selects.forEach(function (select) {
    const field = select.dataset.field;
    const optionKey = select.dataset.optionKey;
    const currentValue = vehicle[field] || "";

    renderSelectOptions(select, AppState.options[optionKey] || [], currentValue);

    const otherInput = node.querySelector('[data-field="' + field + 'Other"]');
    const isOther = currentValue === APP_CONFIG.OTHER_VALUE;

    if (otherInput) {
      otherInput.classList.toggle("hidden", !isOther);
      otherInput.required = isOther;
      otherInput.value = vehicle[field + "Other"] || "";
    }

    select.addEventListener("change", function () {
      updateVehicleField(vehicle.id, field, select.value);

      if (select.value !== APP_CONFIG.OTHER_VALUE) {
        updateVehicleField(vehicle.id, field + "Other", "");
      }

      renderVehicles();
    });
  });

  regularInputs.forEach(function (input) {
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

  otherInputs.forEach(function (input) {
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
      isBook: false,
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
      text: err.message || "กรุณาลองใหม่อีกครั้ง"
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

    const blob = await canvasToBlob(
      canvas,
      APP_CONFIG.IMAGE_OUTPUT_TYPE,
      APP_CONFIG.IMAGE_QUALITY
    );

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
 * PAYLOAD
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

  for (const item of personRequired) {
    const key = item[0];
    const label = item[1];
    const elementId = item[2];

    if (!payload.person[key]) {
      markFieldInvalid(elementId);
      throw new Error("กรุณากรอกข้อมูล: " + label);
    }
  }

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
    showLoading("กำลังบันทึกข้อมูล สร้างเอกสาร และส่ง Email...");

    const result = await apiPost("/api/save", {
      payload: payload
    }, APP_CONFIG.API_TIMEOUT_SAVE_MS);

    if (!result || !result.ok) {
      throw new Error(result && result.message ? result.message : "บันทึกข้อมูลไม่สำเร็จ");
    }

    hideLoading();

    await showSaveSuccess(result);
    resetFormAfterSave();

  } catch (err) {
    hideLoading();

    await Swal.fire({
      icon: "error",
      title: "ไม่สามารถบันทึกข้อมูลได้ครบถ้วน",
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
  DOM.addVehicleBtn.disabled =
    isSubmitting || AppState.vehicles.length >= APP_CONFIG.MAX_VEHICLES;

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
    title: "บันทึกข้อมูลเสร็จสิ้น",
    html: buildSaveSuccessHtml(result),
    width: 780,
    confirmButtonText: "ตกลง"
  });
}


function buildSaveSuccessHtml(result) {
  result = result || {};

  const vehicles = Array.isArray(result.vehicles) ? result.vehicles : [];

  const dc = pickFirstValue(result.dc, result.person && result.person.dc);
  const fullName = pickFirstValue(result.fullName, result.person && result.person.fullName);
  const employeeId = pickFirstValue(result.employeeId, result.person && result.person.employeeId);
  const department = pickFirstValue(result.department, result.person && result.person.department);
  const company = pickFirstValue(result.company, result.person && result.person.company);
  const phone = pickFirstValue(result.phone, result.person && result.person.phone);

  const pdfStatusHtml = buildStatusBadgeHtml(result.pdfStatus);
  const emailStatusHtml = buildStatusBadgeHtml(result.emailStatus);

  const pdfMessage = buildPdfStatusMessage(result);
  const emailMessage = buildEmailStatusMessage(result);

  const vehicleHtml = vehicles.map(function (vehicle) {
    const stickerLabel = pickFirstValue(vehicle.stickerLabel, vehicle.stickerNo);
    const plateText = [
      pickFirstValue(vehicle.plateNumber),
      pickFirstValue(vehicle.province)
    ].filter(Boolean).join(" ");

    return [
      '<div class="saveVehicleResultCard">',
        '<div class="saveVehicleResultHeader">',
          '<span>Sticker No: ', escapeHtml(stickerLabel || "-"), '</span>',
        '</div>',

        '<div class="saveVehicleResultBody">',
          '<p><b>รถคันที่:</b> ', escapeHtml(vehicle.vehicleNo || "-"), '</p>',
          '<p><b>ทะเบียน:</b> ', escapeHtml(plateText || "-"), '</p>',
          '<p><b>ประเภทรถ:</b> ', escapeHtml(vehicle.vehicleType || "-"), '</p>',
          '<p><b>ยี่ห้อ:</b> ', escapeHtml(vehicle.brand || "-"), '</p>',
          '<p><b>สี:</b> ', escapeHtml(vehicle.carColor || "-"), '</p>',
        '</div>',
      '</div>'
    ].join("");
  }).join("");

  return [
    '<div class="saveResultWrap">',

      '<div class="saveResultSummary">',
        '<h4>ข้อมูลถูกบันทึกเข้าระบบเรียบร้อยแล้ว</h4>',

        '<div class="vehicleDetailGrid">',
          detailRowHtml("Registration ID", result.registrationId || "-"),
          detailRowHtml("วันที่/เวลา", result.timestamp || "-"),
          detailRowHtml("DC", dc || "-"),
          detailRowHtml("ชื่อ-นามสกุล", fullName || "-"),
          detailRowHtml("รหัสพนักงาน", employeeId || "-"),
          detailRowHtml("แผนก", department || "-"),
          detailRowHtml("บริษัท", company || "-"),
          detailRowHtml("เบอร์โทร", phone || "-"),
          detailRowHtml("จำนวนรถที่บันทึก", (result.vehicleCount || vehicles.length || "-") + " คัน"),
        '</div>',

        '<div style="margin-top:14px;padding:12px;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:14px;">',
          '<p style="margin:0 0 8px;"><b>สถานะเอกสาร PDF:</b> ', pdfStatusHtml, '</p>',
          '<p style="margin:0;color:#166534;font-weight:700;">', escapeHtml(pdfMessage), '</p>',
        '</div>',

        '<div style="margin-top:12px;padding:12px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:14px;">',
          '<p style="margin:0 0 8px;"><b>สถานะการส่ง Email:</b> ', emailStatusHtml, '</p>',
          '<p style="margin:0;color:#334155;font-weight:700;">', escapeHtml(emailMessage), '</p>',
          result.emailSentAt
            ? '<p style="margin:8px 0 0;color:#64748b;"><b>เวลาส่ง Email:</b> ' + escapeHtml(result.emailSentAt) + '</p>'
            : '',
        '</div>',
      '</div>',

      '<div class="saveVehicleResultList" style="margin-top:14px;">',
        vehicleHtml || '<p>ไม่พบรายการรถที่ระบบส่งกลับ</p>',
      '</div>',

      '<p style="margin-top:12px;color:#475569;font-weight:700;line-height:1.55;">',
        'ระบบจะแจ้งเอกสาร PDF ไปยัง Email ของผู้เกี่ยวข้องตาม DC ที่กำหนดไว้ในชีท Email เท่านั้น ',
        'ผู้ใช้งานทั่วไปจะไม่เห็นลิงก์ PDF, QR Code URL หรือ PIN หลังบันทึก',
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


function pickFirstValue() {
  for (let i = 0; i < arguments.length; i++) {
    const value = normalizeText(arguments[i]);
    if (value) return value;
  }
  return "";
}


function buildStatusBadgeHtml(status) {
  const value = normalizeText(status) || "-";
  const upper = value.toUpperCase();

  let bg = "#f1f5f9";
  let color = "#334155";
  let border = "#cbd5e1";

  if (upper === "SUCCESS" || upper === "SENT") {
    bg = "#dcfce7";
    color = "#166534";
    border = "#86efac";
  } else if (upper === "NO_RECIPIENT" || upper === "SKIPPED_PDF_FAILED") {
    bg = "#fef3c7";
    color = "#92400e";
    border = "#fcd34d";
  } else if (upper === "FAILED") {
    bg = "#fee2e2";
    color = "#991b1b";
    border = "#fca5a5";
  } else if (upper === "PENDING") {
    bg = "#e0f2fe";
    color = "#075985";
    border = "#7dd3fc";
  }

  return [
    '<span style="',
      'display:inline-flex;',
      'align-items:center;',
      'padding:5px 10px;',
      'border-radius:999px;',
      'font-weight:900;',
      'font-size:0.86rem;',
      'background:', bg, ';',
      'color:', color, ';',
      'border:1px solid ', border, ';',
    '">',
      escapeHtml(value),
    '</span>'
  ].join("");
}


function buildEmailStatusMessage(result) {
  const status = normalizeText(result.emailStatus).toUpperCase();
  const error = normalizeText(result.emailError);
  const count = Number(result.emailRecipientsCount || 0);

  if (status === "SENT") {
    return "ส่ง Email พร้อมไฟล์ PDF แนบให้ผู้เกี่ยวข้องแล้ว จำนวนผู้รับ " + count + " ราย";
  }

  if (status === "NO_RECIPIENT") {
    return "ไม่พบ Email สำหรับ DC นี้ กรุณาตรวจสอบชีท Email";
  }

  if (status === "FAILED") {
    return "ส่ง Email ไม่สำเร็จ" + (error ? " : " + error : "");
  }

  if (status === "SKIPPED_PDF_FAILED") {
    return "ไม่ได้ส่ง Email เพราะสร้าง PDF ไม่สำเร็จ";
  }

  return "ยังไม่พบสถานะการส่ง Email";
}


function buildPdfStatusMessage(result) {
  const status = normalizeText(result.pdfStatus).toUpperCase();
  const error = normalizeText(result.pdfError);

  if (status === "SUCCESS") {
    return "สร้างเอกสาร PDF สำเร็จ";
  }

  if (status === "FAILED") {
    return "สร้าง PDF ไม่สำเร็จ" + (error ? " : " + error : "");
  }

  return "ยังไม่พบสถานะ PDF";
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
