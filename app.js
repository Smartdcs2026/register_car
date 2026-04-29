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
  IMAGE_QUALITY: 0.82,
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
