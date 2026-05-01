/************************************************************
 * Vehicle Registration System
 * app.js v12
 *
 * Version:
 * - Consent screen
 * - Dynamic dropdown from Cloudflare Worker / Apps Script
 * - Brand dropdown depends on vehicle type
 * - Vehicle model support, auto uppercase English
 * - Max 3 vehicles per person
 * - Max 3 vehicle images per vehicle
 * - 1 vehicle book / registration image per vehicle
 * - Upload / Camera / Image compression
 * - Compact SweetAlert before save
 * - Compact SweetAlert save success
 * - Hide PDF URL / QR URL / PIN from normal users
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
    brandByVehicleType: {},
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
    brandByVehicleType: normalizeBrandByVehicleType(options.brandByVehicleType),
    carColor: ensureOtherOption(options.carColor),
    province: ensureOtherOption(options.province)
  };
}


function normalizeBrandByVehicleType(map) {
  const output = {};

  if (!map || typeof map !== "object") {
    return output;
  }

  Object.keys(map).forEach(function (vehicleType) {
    const key = normalizeText(vehicleType);
    if (!key) return;

    output[key] = ensureOtherOption(map[vehicleType]);
  });

  return output;
}


function ensureOtherOption(values) {
  const arr = Array.isArray(values) ? values.map(normalizeText).filter(Boolean) : [];

  const withoutOther = arr.filter(function (value) {
    return value !== APP_CONFIG.OTHER_VALUE;
  });

  withoutOther.push(APP_CONFIG.OTHER_VALUE);
  return uniqueArray(withoutOther);
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


function renderSelectOptions(select, values, selectedValue, placeholderText) {
  const current = selectedValue || "";

  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = placeholderText || "กรุณาเลือก";
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


function getBrandsByVehicleType(vehicleType) {
  const type = normalizeText(vehicleType);

  if (!type) {
    return [APP_CONFIG.OTHER_VALUE];
  }

  const map = AppState.options.brandByVehicleType || {};

  if (Array.isArray(map[type]) && map[type].length) {
    return ensureOtherOption(map[type]);
  }

  const fallbackKey = findMatchingVehicleTypeKey(type, map);
  if (fallbackKey && Array.isArray(map[fallbackKey]) && map[fallbackKey].length) {
    return ensureOtherOption(map[fallbackKey]);
  }

  if (AppState.options.brand && AppState.options.brand.length) {
    return ensureOtherOption(AppState.options.brand);
  }

  return [APP_CONFIG.OTHER_VALUE];
}


function findMatchingVehicleTypeKey(vehicleType, map) {
  const target = normalizeComparableText(vehicleType);

  return Object.keys(map || {}).find(function (key) {
    return normalizeComparableText(key) === target;
  }) || "";
}


function normalizeComparableText(value) {
  return normalizeText(value)
    .replace(/\s+/g, "")
    .toUpperCase();
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

    vehicleModel: "",

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

  if (field === "vehicleModel") {
    vehicle[field] = normalizeVehicleModelInput(value);
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
    removeVehicleBtn.disabled = AppState.vehicles.length <= 1 || AppState.isSubmitting;
    removeVehicleBtn.addEventListener("click", function () {
      removeVehicle(vehicle.id);
    });

    bindVehicleFields(node, vehicle);
    renderVehicleImages(node, vehicle);
    renderBookImage(node, vehicle);

    const addImageBtn = node.querySelector(".addVehicleImageBtn");
    addImageBtn.disabled =
      AppState.isSubmitting || vehicle.vehicleImages.length >= APP_CONFIG.MAX_VEHICLE_IMAGES;

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

    const options = getVehicleSelectOptions(field, optionKey, vehicle);
    const placeholder = getVehicleSelectPlaceholder(field);

    renderSelectOptions(select, options, currentValue, placeholder);

    if (field === "brand") {
      select.disabled = AppState.isSubmitting || !vehicle.vehicleType;
    } else {
      select.disabled = AppState.isSubmitting;
    }

    const otherInput = node.querySelector('[data-field="' + field + 'Other"]');
    const isOther = currentValue === APP_CONFIG.OTHER_VALUE;

    if (otherInput) {
      otherInput.classList.toggle("hidden", !isOther);
      otherInput.required = isOther;
      otherInput.value = vehicle[field + "Other"] || "";
      otherInput.disabled = AppState.isSubmitting;
    }

    select.addEventListener("change", function () {
      updateVehicleField(vehicle.id, field, select.value);

      if (select.value !== APP_CONFIG.OTHER_VALUE) {
        updateVehicleField(vehicle.id, field + "Other", "");
      }

      if (field === "vehicleType") {
        updateVehicleField(vehicle.id, "brand", "");
        updateVehicleField(vehicle.id, "brandOther", "");
      }

      renderVehicles();
    });
  });

  regularInputs.forEach(function (input) {
    const field = input.dataset.field;
    input.value = vehicle[field] || "";
    input.disabled = AppState.isSubmitting;

    input.addEventListener("input", function () {
      if (field === "plateNumber") {
        input.value = normalizePlateInput(input.value);
        validateSingleInput(input, APP_CONFIG.VALIDATION.PLATE);
      }

      if (field === "vehicleModel") {
        input.value = normalizeVehicleModelInput(input.value);
      }

      updateVehicleField(vehicle.id, field, input.value);
    });
  });

  otherInputs.forEach(function (input) {
    const field = input.dataset.field;
    input.value = vehicle[field] || "";
    input.disabled = AppState.isSubmitting;

    input.addEventListener("input", function () {
      updateVehicleField(vehicle.id, field, input.value);
    });
  });
}


function getVehicleSelectOptions(field, optionKey, vehicle) {
  if (field === "brand") {
    return getBrandsByVehicleType(getVehicleFinalValue(vehicle, "vehicleType"));
  }

  return AppState.options[optionKey] || [];
}


function getVehicleSelectPlaceholder(field) {
  if (field === "brand") {
    return "เลือกยี่ห้อรถ";
  }

  if (field === "vehicleType") {
    return "เลือกประเภทรถ";
  }

  if (field === "carColor") {
    return "เลือกสีรถ";
  }

  if (field === "province") {
    return "เลือกจังหวัด";
  }

  return "กรุณาเลือก";
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
  if (fileInput) {
  fileInput.setAttribute("accept", "image/*");
  fileInput.setAttribute("capture", "environment");
}
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

  fileInput.disabled = AppState.isSubmitting;
  cameraBtn.disabled = AppState.isSubmitting;

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
    removeBtn.disabled = AppState.isSubmitting;
    removeBtn.addEventListener("click", config.onRemove);
  }

  const clearBtn = node.querySelector(".clearBookImageBtn");
  if (clearBtn) {
    clearBtn.disabled = AppState.isSubmitting;
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
    if (canvas.toBlob) {
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

      return;
    }

    /*
     * fallback สำหรับ Safari/iOS รุ่นเก่า
     */
    try {
      const dataUrl = canvas.toDataURL(mimeType || "image/jpeg", quality || 0.8);
      resolve(dataUrlToBlob(dataUrl));
    } catch (err) {
      reject(new Error("Browser นี้ไม่รองรับการสร้างไฟล์จากภาพ"));
    }
  });
}


function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || "").split(",");
  const meta = parts[0] || "";
  const base64 = parts[1] || "";

  const mimeMatch = meta.match(/data:([^;]+);base64/i);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], {
    type: mimeType
  });
}

/**
 * =========================
 * CAMERA
 * =========================
 *
 * Hybrid Camera Strategy:
 * 1. ใช้ getUserMedia() เป็นหลัก
 * 2. ถ้า iPhone / Safari / Browser บางตัวเปิดไม่ได้ ให้ fallback ไปใช้ native file capture
 * 3. ต้องใช้งานผ่าน HTTPS หรือ localhost เท่านั้น
 */

async function openCamera(target) {
  AppState.camera.target = target;

  if (!target) {
    await showCameraError_("ไม่พบตำแหน่งที่จะบันทึกรูปภาพ");
    return;
  }

  /*
   * getUserMedia ใช้ได้เฉพาะ HTTPS / localhost
   * ถ้าไม่ใช่ secure context ให้ fallback ไป native camera ทันที
   */
  if (!isCameraSecureContext_()) {
    await fallbackNativeCameraCapture_(target);
    return;
  }

  /*
   * ถ้า browser ไม่มี mediaDevices/getUserMedia ให้ fallback ทันที
   */
  if (!supportsLiveCamera_()) {
    await fallbackNativeCameraCapture_(target);
    return;
  }

  try {
    await startCamera();

    DOM.cameraModal.classList.remove("hidden");
    DOM.cameraModal.setAttribute("aria-hidden", "false");

  } catch (err) {
    /*
     * iPhone/Safari บางเครื่อง reject constraints เช่น environment
     * จึง fallback ไป native file capture แทน เพื่อให้ใช้งานได้จริง
     */
    await stopCamera();

    const useFallback = await Swal.fire({
      icon: "warning",
      title: "เปิดกล้องแบบ Live ไม่สำเร็จ",
      text: buildCameraErrorMessage_(err),
      showCancelButton: true,
      confirmButtonText: "เปิดกล้องของเครื่องแทน",
      cancelButtonText: "ยกเลิก",
      reverseButtons: true
    });

    if (useFallback.isConfirmed) {
      await fallbackNativeCameraCapture_(target);
    }
  }
}


async function startCamera() {
  await stopCamera();

  if (!supportsLiveCamera_()) {
    throw new Error("Browser นี้ไม่รองรับ navigator.mediaDevices.getUserMedia()");
  }

  const constraintsList = buildCameraConstraintsList_();

  let lastError = null;

  for (let i = 0; i < constraintsList.length; i++) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraintsList[i]);

      AppState.camera.stream = stream;

      DOM.cameraVideo.setAttribute("playsinline", "true");
      DOM.cameraVideo.setAttribute("autoplay", "true");
      DOM.cameraVideo.muted = true;
      DOM.cameraVideo.srcObject = stream;

      await DOM.cameraVideo.play();

      return stream;

    } catch (err) {
      lastError = err;
      await stopCamera();
    }
  }

  throw lastError || new Error("ไม่สามารถเปิดกล้องได้");
}


function buildCameraConstraintsList_() {
  const facingMode = AppState.camera.facingMode || "environment";

  /*
   * เรียงจากเข้มไปอ่อน:
   * - exact อาจ fail บน iPhone บางรุ่น
   * - ideal ยืดหยุ่นกว่า
   * - video:true เป็น fallback กว้างสุด
   */
  if (facingMode === "environment") {
    return [
      {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      },
      {
        audio: false,
        video: {
          facingMode: "environment"
        }
      },
      {
        audio: false,
        video: true
      }
    ];
  }

  return [
    {
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    },
    {
      audio: false,
      video: {
        facingMode: "user"
      }
    },
    {
      audio: false,
      video: true
    }
  ];
}


async function stopCamera() {
  if (AppState.camera.stream) {
    AppState.camera.stream.getTracks().forEach(function (track) {
      try {
        track.stop();
      } catch (err) {
        // ignore
      }
    });
  }

  AppState.camera.stream = null;

  if (DOM.cameraVideo) {
    try {
      DOM.cameraVideo.pause();
    } catch (err) {
      // ignore
    }

    DOM.cameraVideo.srcObject = null;
    DOM.cameraVideo.removeAttribute("src");
    DOM.cameraVideo.load();
  }
}


async function closeCamera() {
  DOM.cameraModal.classList.add("hidden");
  DOM.cameraModal.setAttribute("aria-hidden", "true");
  AppState.camera.target = null;

  await stopCamera();
}


async function switchCamera() {
  const currentTarget = AppState.camera.target;

  AppState.camera.facingMode =
    AppState.camera.facingMode === "environment" ? "user" : "environment";

  try {
    showLoading("กำลังสลับกล้อง...");
    await startCamera();

  } catch (err) {
    await stopCamera();

    const result = await Swal.fire({
      icon: "warning",
      title: "สลับกล้องไม่สำเร็จ",
      text: buildCameraErrorMessage_(err),
      showCancelButton: true,
      confirmButtonText: "ใช้กล้องของเครื่องแทน",
      cancelButtonText: "ปิด",
      reverseButtons: true
    });

    if (result.isConfirmed && currentTarget) {
      DOM.cameraModal.classList.add("hidden");
      DOM.cameraModal.setAttribute("aria-hidden", "true");
      AppState.camera.target = currentTarget;

      await fallbackNativeCameraCapture_(currentTarget);
    }

  } finally {
    hideLoading();
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

  const ctx = canvas.getContext("2d", {
    alpha: false
  });

  ctx.drawImage(video, 0, 0, width, height);

  try {
    showLoading("กำลังบันทึกภาพจากกล้อง...");

    const blob = await canvasToBlob(
      canvas,
      APP_CONFIG.IMAGE_OUTPUT_TYPE,
      APP_CONFIG.IMAGE_QUALITY
    );

    const base64 = await blobToDataUrl(blob);
    const previewUrl = URL.createObjectURL(blob);

    updateImageData(target.vehicleId, target.imageType, target.imageId, {
      fileName: "camera_" + formatDateForFileName(new Date()) + ".jpg",
      mimeType: APP_CONFIG.IMAGE_OUTPUT_TYPE,
      base64: base64,
      previewUrl: previewUrl
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
 * Native Camera Fallback
 * สำหรับ iPhone / Safari / Browser ที่ getUserMedia เปิดไม่ได้
 */
async function fallbackNativeCameraCapture_(target) {
  return new Promise(function (resolve) {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = "image/*";
    input.capture = AppState.camera.facingMode === "user" ? "user" : "environment";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "-9999px";
    input.style.opacity = "0";

    document.body.appendChild(input);

    input.addEventListener("change", async function () {
      const file = input.files && input.files[0];

      try {
        if (!file) {
          resolve(false);
          return;
        }

        if (!file.type || !file.type.startsWith("image/")) {
          await Swal.fire({
            icon: "error",
            title: "ไฟล์ไม่ถูกต้อง",
            text: "กรุณาเลือกหรือถ่ายเป็นไฟล์รูปภาพเท่านั้น"
          });

          resolve(false);
          return;
        }

        showLoading("กำลังประมวลผลรูปภาพ...");

        const compressed = await compressImageFile(file);

        updateImageData(target.vehicleId, target.imageType, target.imageId, {
          fileName: file.name || ("camera_" + formatDateForFileName(new Date()) + ".jpg"),
          mimeType: compressed.mimeType,
          base64: compressed.base64,
          previewUrl: compressed.previewUrl
        });

        renderVehicles();
        resolve(true);

      } catch (err) {
        await Swal.fire({
          icon: "error",
          title: "อ่านรูปภาพไม่สำเร็จ",
          text: err.message || "กรุณาลองใหม่อีกครั้ง"
        });

        resolve(false);

      } finally {
        hideLoading();

        try {
          input.remove();
        } catch (err) {
          // ignore
        }
      }
    }, { once: true });

    /*
     * ต้องถูกเรียกจาก user gesture เช่น click ปุ่ม เปิดกล้อง
     * iPhone จะยอมเปิด native camera ได้เสถียรกว่า
     */
    input.click();
  });
}


function supportsLiveCamera_() {
  return !!(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  );
}


function isCameraSecureContext_() {
  return window.isSecureContext === true ||
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";
}


function buildCameraErrorMessage_(err) {
  const name = err && err.name ? err.name : "";
  const message = err && err.message ? err.message : "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "ผู้ใช้ไม่อนุญาตให้ใช้กล้อง หรือ Browser ปิดสิทธิ์กล้องไว้ กรุณาอนุญาตสิทธิ์กล้องในการตั้งค่า Browser";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "ไม่พบอุปกรณ์กล้องในเครื่องนี้";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "กล้องอาจถูกใช้งานโดยแอปอื่นอยู่ กรุณาปิดแอปกล้องหรือแอปอื่นแล้วลองใหม่";
  }

  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "กล้องไม่รองรับค่าที่ระบบร้องขอ ระบบจะลองเปิดด้วยวิธีอื่นแทน";
  }

  if (!isCameraSecureContext_()) {
    return "การเปิดกล้องต้องใช้งานผ่าน HTTPS หรือ localhost เท่านั้น";
  }

  return message || "ไม่สามารถเปิดกล้องได้";
}


async function showCameraError_(message) {
  await Swal.fire({
    icon: "error",
    title: "เปิดกล้องไม่สำเร็จ",
    text: message || "กรุณาตรวจสอบสิทธิ์กล้องของ Browser"
  });
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
      vehicleModel: normalizeVehicleModelInput(vehicle.vehicleModel),
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
    if (!vehicle.vehicleModel) throw new Error(label + ": กรุณากรอกรุ่นรถ");
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
    renderVehicles();
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
    renderVehicles();
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
    html: buildConfirmHtml(payload),
    width: 860,
    padding: 0,
    showCancelButton: true,
    confirmButtonText: "ยืนยันบันทึก",
    cancelButtonText: "กลับไปแก้ไข",
    reverseButtons: true,
    focusConfirm: false,
    buttonsStyling: false,
    customClass: {
      popup: "vehicleConfirmPopupCompact",
      htmlContainer: "vehicleConfirmHtmlContainer",
      actions: "vehicleConfirmActions",
      confirmButton: "vehicleConfirmBtnCompact",
      cancelButton: "vehicleCancelBtnCompact"
    }
  });

  return result.isConfirmed === true;
}


function buildConfirmHtml(payload) {
  const person = payload.person || {};
  const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];

  const vehicleHtml = vehicles.map(function (vehicle, index) {
    const plateText = [
      vehicle.plateNumber || "-",
      vehicle.province || "-"
    ].filter(Boolean).join(" ");

    return [
      '<section class="confirmVehicleCardCompact">',

        '<div class="confirmVehicleHeadCompact">',
          '<div class="confirmVehicleTitleCompact">รถคันที่ ', escapeHtml(index + 1), '</div>',
          '<div class="confirmVehiclePlateMini">', escapeHtml(plateText), '</div>',
        '</div>',

        '<div class="confirmPlateCompact">',
          '<div class="confirmPlateNoCompact">', escapeHtml(vehicle.plateNumber || "-"), '</div>',
          '<div class="confirmPlateProvinceCompact">', escapeHtml(vehicle.province || "-"), '</div>',
        '</div>',

        '<div class="confirmGridCompact">',
          confirmItemHtml("ประเภทรถ", vehicle.vehicleType),
          confirmItemHtml("ยี่ห้อ", vehicle.brand),
          confirmItemHtml("รุ่นรถ", vehicle.vehicleModel),
          confirmItemHtml("สี", vehicle.carColor),
          confirmItemHtml("รูปรถ", String((vehicle.vehicleImages || []).length) + " รูป"),
          confirmItemHtml("เล่มรถ", vehicle.bookImage ? "แนบแล้ว" : "ยังไม่แนบ"),
        '</div>',

      '</section>'
    ].join("");
  }).join("");

  return [
    '<div class="confirmWrapCompact">',

      '<style>',
        '.vehicleConfirmPopupCompact { border-radius: 22px !important; overflow: hidden !important; }',
        '.vehicleConfirmHtmlContainer { margin: 0 !important; padding: 0 !important; overflow-x: hidden !important; }',
        '.vehicleConfirmActions { margin: 10px 0 14px !important; padding: 0 14px !important; display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 10px !important; }',
        '.vehicleConfirmBtnCompact, .vehicleCancelBtnCompact { border: 0 !important; border-radius: 14px !important; font-weight: 950 !important; padding: 11px 14px !important; cursor: pointer !important; margin: 0 !important; width: 100% !important; }',
        '.vehicleConfirmBtnCompact { background: #0f172a !important; color: #ffffff !important; }',
        '.vehicleCancelBtnCompact { background: #e5e7eb !important; color: #0f172a !important; }',

        '.confirmWrapCompact { text-align: left; background: #ffffff; color: #0f172a; }',
        '.confirmHeaderCompact { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; background: linear-gradient(135deg, #eff6ff, #f8fafc); border-bottom: 1px solid #dbeafe; }',
        '.confirmHeaderLeft { min-width: 0; }',
        '.confirmHeaderCompact h3 { margin: 0; font-size: 1.06rem; font-weight: 950; line-height: 1.25; color: #0f172a; }',
        '.confirmHeaderCompact p { margin: 2px 0 0; font-size: 0.8rem; font-weight: 800; color: #475569; line-height: 1.25; }',
        '.confirmCountBadge { flex: 0 0 auto; border-radius: 999px; padding: 5px 10px; background: #0f172a; color: #ffffff; font-size: 0.78rem; font-weight: 950; white-space: nowrap; }',
        '.confirmBodyCompact { padding: 12px 14px 0; }',
        '.confirmSectionBoxCompact { border: 1px solid #dbe3ef; border-radius: 16px; overflow: hidden; background: #ffffff; }',
        '.confirmSectionTitleCompact { padding: 8px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 0.92rem; font-weight: 950; color: #0f172a; }',
        '.confirmGridCompact { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding: 10px; }',
        '.confirmItemCompact { border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; padding: 7px 8px; min-width: 0; }',
        '.confirmItemLabel { font-size: 0.68rem; font-weight: 900; color: #64748b; line-height: 1.15; margin-bottom: 2px; }',
        '.confirmItemValue { font-size: 0.86rem; font-weight: 850; line-height: 1.22; color: #0f172a; word-break: break-word; }',
        '.confirmVehicleListCompact { margin-top: 10px; }',
        '.confirmVehicleSectionTitle { font-size: 0.96rem; font-weight: 950; margin: 0 0 7px; color: #0f172a; }',
        '.confirmVehicleCardCompact { border: 1px solid #dbe3ef; border-radius: 16px; background: #ffffff; overflow: hidden; margin-top: 8px; box-shadow: 0 5px 14px rgba(15, 23, 42, 0.05); }',
        '.confirmVehicleHeadCompact { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; background: #0f172a; color: #ffffff; }',
        '.confirmVehicleTitleCompact { font-size: 0.9rem; font-weight: 950; white-space: nowrap; }',
        '.confirmVehiclePlateMini { font-size: 0.78rem; font-weight: 900; background: #ffffff; color: #0f172a; border-radius: 999px; padding: 3px 8px; white-space: nowrap; max-width: 60%; overflow: hidden; text-overflow: ellipsis; }',
        '.confirmPlateCompact { width: min(260px, calc(100% - 20px)); margin: 10px auto 0; border: 3px solid #0f172a; border-radius: 14px; text-align: center; background: #ffffff; overflow: hidden; }',
        '.confirmPlateNoCompact { font-size: 1.7rem; font-weight: 950; letter-spacing: 1px; line-height: 1.1; padding: 8px 8px 5px; }',
        '.confirmPlateProvinceCompact { border-top: 2px solid #0f172a; padding: 5px 8px; font-size: 0.9rem; font-weight: 950; line-height: 1.1; }',

        '@media (max-width: 640px) {',
          '.vehicleConfirmPopupCompact { width: calc(100% - 12px) !important; max-width: calc(100% - 12px) !important; border-radius: 18px !important; }',
          '.confirmHeaderCompact { padding: 9px 10px; }',
          '.confirmHeaderCompact h3 { font-size: 0.94rem; }',
          '.confirmHeaderCompact p { font-size: 0.7rem; }',
          '.confirmCountBadge { font-size: 0.68rem; padding: 4px 8px; }',
          '.confirmBodyCompact { padding: 8px 8px 0; }',
          '.confirmSectionTitleCompact { padding: 7px 8px; font-size: 0.82rem; }',
          '.confirmGridCompact { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; padding: 7px; }',
          '.confirmItemCompact { padding: 5px 6px; border-radius: 10px; }',
          '.confirmItemLabel { font-size: 0.58rem; margin-bottom: 1px; }',
          '.confirmItemValue { font-size: 0.74rem; line-height: 1.16; }',
          '.confirmVehicleListCompact { margin-top: 8px; }',
          '.confirmVehicleSectionTitle { font-size: 0.84rem; margin-bottom: 5px; }',
          '.confirmVehicleCardCompact { border-radius: 13px; margin-top: 6px; }',
          '.confirmVehicleHeadCompact { padding: 6px 8px; }',
          '.confirmVehicleTitleCompact { font-size: 0.78rem; }',
          '.confirmVehiclePlateMini { font-size: 0.66rem; padding: 3px 7px; }',
          '.confirmPlateCompact { width: min(210px, calc(100% - 18px)); margin-top: 7px; border-radius: 12px; }',
          '.confirmPlateNoCompact { font-size: 1.28rem; padding: 6px 6px 4px; }',
          '.confirmPlateProvinceCompact { font-size: 0.74rem; padding: 4px 6px; }',
          '.vehicleConfirmActions { grid-template-columns: 1fr 1fr !important; gap: 7px !important; margin: 8px 0 10px !important; padding: 0 8px !important; }',
          '.vehicleConfirmBtnCompact, .vehicleCancelBtnCompact { padding: 9px 8px !important; border-radius: 12px !important; font-size: 0.82rem !important; }',
        '}',
      '</style>',

      '<div class="confirmHeaderCompact">',
        '<div class="confirmHeaderLeft">',
          '<h3>ตรวจสอบข้อมูลก่อนบันทึก</h3>',
          '<p>กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนยืนยัน</p>',
        '</div>',
        '<div class="confirmCountBadge">', escapeHtml(vehicles.length), ' คัน</div>',
      '</div>',

      '<div class="confirmBodyCompact">',

        '<section class="confirmSectionBoxCompact">',
          '<div class="confirmSectionTitleCompact">ข้อมูลผู้ลงทะเบียน</div>',
          '<div class="confirmGridCompact">',
            confirmItemHtml("DC", person.dc),
            confirmItemHtml("รหัสพนักงาน", person.employeeId),
            confirmItemHtml("ชื่อ-นามสกุล", person.fullName),
            confirmItemHtml("เบอร์โทร", person.phone),
            confirmItemHtml("แผนก", person.department),
            confirmItemHtml("บริษัท", person.company),
          '</div>',
        '</section>',

        '<div class="confirmVehicleListCompact">',
          '<div class="confirmVehicleSectionTitle">รายละเอียดรถ</div>',
          vehicleHtml || '<div class="confirmItemCompact">ไม่พบข้อมูลรถ</div>',
        '</div>',

      '</div>',

    '</div>'
  ].join("");
}


function confirmItemHtml(label, value) {
  return [
    '<div class="confirmItemCompact">',
      '<div class="confirmItemLabel">', escapeHtml(label), '</div>',
      '<div class="confirmItemValue">', escapeHtml(value || "-"), '</div>',
    '</div>'
  ].join("");
}


function detailRowHtml(label, value) {
  return confirmItemHtml(label, value);
}


async function showSaveSuccess(result) {
  await Swal.fire({
    html: buildSaveSuccessHtml(result),
    width: 820,
    padding: 0,
    showConfirmButton: true,
    confirmButtonText: "ตกลง",
    buttonsStyling: false,
    customClass: {
      popup: "saveSuccessSwalPopupCompact",
      confirmButton: "saveSuccessConfirmBtn"
    }
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

  const vehicleHtml = vehicles.map(function (vehicle, index) {
    const stickerLabel = pickFirstValue(vehicle.stickerLabel, vehicle.stickerNo);

    const plateText = [
      pickFirstValue(vehicle.plateNumber),
      pickFirstValue(vehicle.province)
    ].filter(Boolean).join(" ");

    return [
      '<div class="saveVehicleBox">',

        '<div class="saveVehicleHeader">',
          '<div class="saveVehicleTitle">รถคันที่ ', escapeHtml(vehicle.vehicleNo || (index + 1)), '</div>',
          '<div class="saveStickerBadge">Sticker: ', escapeHtml(stickerLabel || "-"), '</div>',
        '</div>',

        '<div class="saveSuccessGrid saveVehicleGrid">',
          saveResultItemHtml("ทะเบียน", plateText || "-"),
          saveResultItemHtml("ประเภทรถ", vehicle.vehicleType || "-"),
          saveResultItemHtml("ยี่ห้อรถ", vehicle.brand || "-"),
          saveResultItemHtml("รุ่นรถ", vehicle.vehicleModel || "-"),
          saveResultItemHtml("สีรถ", vehicle.carColor || "-"),
          saveResultItemHtml("รหัสรถ", vehicle.vehicleId || "-"),
        '</div>',

      '</div>'
    ].join("");
  }).join("");

  return [
    '<div class="saveSuccessWrap">',

      '<style>',
        '.saveSuccessSwalPopupCompact { border-radius: 22px !important; overflow: hidden !important; }',
        '.saveSuccessSwalPopupCompact .swal2-html-container { margin: 0 !important; padding: 0 !important; overflow-x: hidden !important; }',
        '.saveSuccessSwalPopupCompact .swal2-actions { margin: 12px 0 16px !important; padding: 0 16px !important; }',
        '.saveSuccessConfirmBtn { border: 0 !important; border-radius: 14px !important; background: #0f172a !important; color: #ffffff !important; font-weight: 950 !important; padding: 11px 28px !important; cursor: pointer !important; min-width: 130px !important; }',

        '.saveSuccessWrap { text-align: left; color: #0f172a; background: #ffffff; }',
        '.saveCompactHeader { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: linear-gradient(135deg, #ecfdf5, #f8fafc); border-bottom: 1px solid #dbeafe; }',
        '.saveCompactIcon { width: 34px; height: 34px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: #dcfce7; border: 1px solid #86efac; color: #166534; font-size: 22px; font-weight: 950; flex: 0 0 auto; }',
        '.saveCompactTitle { min-width: 0; flex: 1 1 auto; }',
        '.saveCompactTitle h3 { margin: 0; font-size: 1.12rem; font-weight: 950; line-height: 1.25; color: #0f172a; }',
        '.saveCompactTitle p { margin: 2px 0 0; font-size: 0.86rem; font-weight: 800; line-height: 1.25; color: #166534; }',
        '.saveSuccessBody { padding: 14px 16px 0; }',
        '.saveSectionBox { border: 1px solid #dbe3ef; border-radius: 16px; background: #ffffff; overflow: hidden; }',
        '.saveSectionHeader { padding: 9px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-weight: 950; color: #0f172a; font-size: 0.96rem; }',
        '.saveSuccessGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 12px; }',
        '.saveResultItem { border: 1px solid #e2e8f0; background: #ffffff; border-radius: 14px; padding: 8px 10px; min-width: 0; }',
        '.saveResultLabel { font-size: 0.72rem; font-weight: 900; color: #64748b; line-height: 1.2; margin-bottom: 3px; }',
        '.saveResultValue { font-size: 0.92rem; font-weight: 850; color: #0f172a; line-height: 1.25; word-break: break-word; }',
        '.saveVehicleSectionTitle { margin: 12px 0 8px; font-weight: 950; color: #0f172a; font-size: 1rem; }',
        '.saveVehicleBox { border: 1px solid #dbe3ef; border-radius: 16px; overflow: hidden; background: #ffffff; margin-top: 10px; box-shadow: 0 6px 18px rgba(15, 23, 42, 0.05); }',
        '.saveVehicleHeader { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 12px; background: #0f172a; color: #ffffff; }',
        '.saveVehicleTitle { font-weight: 950; font-size: 0.94rem; }',
        '.saveStickerBadge { font-weight: 950; background: #ffffff; color: #0f172a; border-radius: 999px; padding: 4px 9px; font-size: 0.82rem; white-space: nowrap; }',
        '.saveVehicleGrid { padding: 10px; }',

        '@media (max-width: 640px) {',
          '.saveSuccessSwalPopupCompact { width: calc(100% - 14px) !important; max-width: calc(100% - 14px) !important; border-radius: 18px !important; }',
          '.saveCompactHeader { padding: 10px 11px; gap: 8px; }',
          '.saveCompactIcon { width: 28px; height: 28px; font-size: 18px; }',
          '.saveCompactTitle h3 { font-size: 0.98rem; }',
          '.saveCompactTitle p { font-size: 0.76rem; }',
          '.saveSuccessBody { padding: 10px 10px 0; }',
          '.saveSectionHeader { padding: 8px 10px; font-size: 0.88rem; }',
          '.saveSuccessGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 8px; }',
          '.saveResultItem { padding: 6px 7px; border-radius: 11px; }',
          '.saveResultLabel { font-size: 0.62rem; margin-bottom: 2px; }',
          '.saveResultValue { font-size: 0.78rem; line-height: 1.2; }',
          '.saveVehicleSectionTitle { margin: 9px 0 6px; font-size: 0.9rem; }',
          '.saveVehicleHeader { padding: 7px 9px; }',
          '.saveVehicleTitle { font-size: 0.84rem; }',
          '.saveStickerBadge { font-size: 0.72rem; padding: 3px 7px; }',
          '.saveVehicleGrid { padding: 7px; }',
          '.saveSuccessSwalPopupCompact .swal2-actions { margin: 10px 0 12px !important; padding: 0 10px !important; }',
          '.saveSuccessConfirmBtn { width: 100% !important; padding: 10px 18px !important; }',
        '}',
      '</style>',

      '<div class="saveCompactHeader">',
        '<div class="saveCompactIcon">✓</div>',
        '<div class="saveCompactTitle">',
          '<h3>บันทึกข้อมูลเสร็จสิ้น</h3>',
          '<p>ระบบบันทึกข้อมูลรถเรียบร้อยแล้ว</p>',
        '</div>',
      '</div>',

      '<div class="saveSuccessBody">',

        '<div class="saveSectionBox">',
          '<div class="saveSectionHeader">ข้อมูลผู้ลงทะเบียน</div>',
          '<div class="saveSuccessGrid">',
            saveResultItemHtml("Registration ID", result.registrationId || "-"),
            saveResultItemHtml("วันที่/เวลา", result.timestamp || "-"),
            saveResultItemHtml("DC", dc || "-"),
            saveResultItemHtml("รหัสพนักงาน", employeeId || "-"),
            saveResultItemHtml("ชื่อ-นามสกุล", fullName || "-"),
            saveResultItemHtml("เบอร์โทร", phone || "-"),
            saveResultItemHtml("แผนก", department || "-"),
            saveResultItemHtml("บริษัท", company || "-"),
            saveResultItemHtml("จำนวนรถ", (result.vehicleCount || vehicles.length || "-") + " คัน"),
          '</div>',
        '</div>',

        '<div class="saveVehicleSectionTitle">รายละเอียดรถ</div>',
        vehicleHtml || '<div style="margin-top:8px;color:#64748b;font-weight:800;">ไม่พบรายการรถที่ระบบส่งกลับ</div>',

      '</div>',

    '</div>'
  ].join("");
}


function saveResultItemHtml(label, value) {
  return [
    '<div class="saveResultItem">',
      '<div class="saveResultLabel">',
        escapeHtml(label),
      '</div>',
      '<div class="saveResultValue">',
        escapeHtml(value || "-"),
      '</div>',
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


function normalizeVehicleModelInput(value) {
  return normalizeText(value).toUpperCase();
}


function uniqueArray(arr) {
  const seen = {};
  const result = [];

  (Array.isArray(arr) ? arr : []).forEach(function (item) {
    const value = normalizeText(item);
    if (!value) return;

    const key = value.toUpperCase();

    if (seen[key]) return;

    seen[key] = true;
    result.push(value);
  });

  return result;
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
    bg = "#ecfdf5";
    color = "#166534";
    border = "#bbf7d0";
  } else if (upper === "FAILED" || upper === "ERROR") {
    bg = "#fef2f2";
    color = "#991b1b";
    border = "#fecaca";
  } else if (upper === "PENDING" || upper === "NO_RECIPIENT") {
    bg = "#fffbeb";
    color = "#92400e";
    border = "#fde68a";
  }

  return [
    '<span style="',
      'display:inline-flex;',
      'align-items:center;',
      'justify-content:center;',
      'border:1px solid ', border, ';',
      'background:', bg, ';',
      'color:', color, ';',
      'border-radius:999px;',
      'padding:3px 9px;',
      'font-size:0.78rem;',
      'font-weight:900;',
      'line-height:1.2;',
    '">',
      escapeHtml(value),
    '</span>'
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
