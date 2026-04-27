const MIN_POINTS = 12;
const BASE_CANVAS_SIZE = 720;

const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");

const scoreValue = document.getElementById("scoreValue");
const messageValue = document.getElementById("message");
const closureValue = document.getElementById("closureValue");
const ratioValue = document.getElementById("ratioValue");
const straightnessValue = document.getElementById("straightnessValue");
const cornersValue = document.getElementById("cornersValue");
const evaluateButton = document.getElementById("evaluateButton");
const clearButton = document.getElementById("clearButton");

let points = [];
let drawing = false;

function clamp(value, low = 0, high = 100) {
  return Math.max(low, Math.min(high, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(inputPoints) {
  let total = 0;
  for (let i = 0; i < inputPoints.length - 1; i += 1) {
    total += distance(inputPoints[i], inputPoints[i + 1]);
  }
  return total;
}

function centroid(inputPoints) {
  const total = inputPoints.reduce(
    (acc, point) => {
      acc.x += point.x;
      acc.y += point.y;
      return acc;
    },
    { x: 0, y: 0 },
  );

  return {
    x: total.x / inputPoints.length,
    y: total.y / inputPoints.length,
  };
}

function principalAngle(inputPoints) {
  const center = centroid(inputPoints);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;

  for (const point of inputPoints) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

function rotatePoints(inputPoints, angle, origin) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  return inputPoints.map((point) => {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    return {
      x: dx * cosA - dy * sinA,
      y: dx * sinA + dy * cosA,
    };
  });
}

function simplifyPoints(inputPoints, minStep = 8) {
  if (!inputPoints.length) {
    return [];
  }

  const simplified = [inputPoints[0]];
  for (let i = 1; i < inputPoints.length; i += 1) {
    if (distance(inputPoints[i], simplified[simplified.length - 1]) >= minStep) {
      simplified.push(inputPoints[i]);
    }
  }

  const lastOriginal = inputPoints[inputPoints.length - 1];
  const lastSimplified = simplified[simplified.length - 1];
  if (lastOriginal.x !== lastSimplified.x || lastOriginal.y !== lastSimplified.y) {
    simplified.push(lastOriginal);
  }

  return simplified;
}

function turningAngles(inputPoints) {
  const angles = [];

  for (let i = 1; i < inputPoints.length - 1; i += 1) {
    const ax = inputPoints[i].x - inputPoints[i - 1].x;
    const ay = inputPoints[i].y - inputPoints[i - 1].y;
    const bx = inputPoints[i + 1].x - inputPoints[i].x;
    const by = inputPoints[i + 1].y - inputPoints[i].y;

    const lenA = Math.hypot(ax, ay);
    const lenB = Math.hypot(bx, by);
    if (lenA < 1e-6 || lenB < 1e-6) {
      continue;
    }

    const dot = clamp((ax * bx + ay * by) / (lenA * lenB), -1, 1);
    angles.push((Math.acos(dot) * 180) / Math.PI);
  }

  return angles;
}

function evaluateSquare(inputPoints) {
  const simplifiedPoints = simplifyPoints(inputPoints);

  if (simplifiedPoints.length < MIN_POINTS) {
    return {
      total: 0,
      closure: 0,
      ratio: 0,
      straightness: 0,
      corners: 0,
      message: "Draw a longer stroke so I can evaluate it.",
    };
  }

  const totalLength = pathLength(simplifiedPoints);
  if (totalLength < 40) {
    return {
      total: 0,
      closure: 0,
      ratio: 0,
      straightness: 0,
      corners: 0,
      message: "The shape is too small. Draw a bigger square.",
    };
  }

  const center = centroid(simplifiedPoints);
  const angle = principalAngle(simplifiedPoints);
  const rotated = rotatePoints(simplifiedPoints, -angle, center);

  const xs = rotated.map((point) => point.x);
  const ys = rotated.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const size = Math.max(width, height, 1);

  const endGap = distance(simplifiedPoints[0], simplifiedPoints[simplifiedPoints.length - 1]);
  const closure = clamp(100 - (endGap / size) * 180);

  const ratioError = Math.abs(width - height) / size;
  const ratio = clamp(100 - ratioError * 220);

  const straightnessValues = [];
  for (let i = 0; i < rotated.length - 1; i += 1) {
    const dx = rotated[i + 1].x - rotated[i].x;
    const dy = rotated[i + 1].y - rotated[i].y;
    const segmentLength = Math.hypot(dx, dy);
    if (segmentLength < 1e-6) {
      continue;
    }

    const horizontalScore = Math.abs(dx) / segmentLength;
    const verticalScore = Math.abs(dy) / segmentLength;
    straightnessValues.push(Math.max(horizontalScore, verticalScore));
  }

  const straightness = clamp(
    (straightnessValues.reduce((sum, value) => sum + value, 0) / Math.max(straightnessValues.length, 1)) * 100,
  );

  const angleChanges = turningAngles(simplifiedPoints);
  const cornerLike = angleChanges.filter((value) => value >= 55 && value <= 125);
  let corners = 0;

  if (angleChanges.length) {
    let cornerQuality = 100 - Math.min(Math.abs(cornerLike.length - 4) * 18, 100);
    if (cornerLike.length) {
      const firstFour = cornerLike.slice(0, 4);
      const rightAngleError =
        firstFour.reduce((sum, value) => sum + Math.abs(value - 90), 0) / firstFour.length;
      cornerQuality -= rightAngleError * 0.8;
    }
    corners = clamp(cornerQuality);
  }

  const total = clamp((closure + ratio + straightness + corners) / 4);

  let message = "Needs improvement. Focus on four clear corners and equal sides.";
  if (total >= 90) {
    message = "Excellent square.";
  } else if (total >= 75) {
    message = "Very good. The shape is close to a square.";
  } else if (total >= 55) {
    message = "Pretty good. Try closing the shape and keeping edges straighter.";
  }

  return {
    total,
    closure,
    ratio,
    straightness,
    corners,
    message,
  };
}

function setCanvasScale() {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  ctx.setTransform(
    (rect.width / BASE_CANVAS_SIZE) * pixelRatio,
    0,
    0,
    (rect.height / BASE_CANVAS_SIZE) * pixelRatio,
    0,
    0,
  );
  redrawStroke();
}

function clearCanvas() {
  ctx.clearRect(0, 0, BASE_CANVAS_SIZE, BASE_CANVAS_SIZE);
}

function redrawStroke() {
  clearCanvas();
  if (points.length < 2) {
    return;
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#14222c";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

function resetResults() {
  scoreValue.textContent = "-";
  messageValue.textContent = "Draw a square with one stroke, then press Evaluate.";
  closureValue.textContent = "-";
  ratioValue.textContent = "-";
  straightnessValue.textContent = "-";
  cornersValue.textContent = "-";
}

function clearDrawing() {
  points = [];
  drawing = false;
  clearCanvas();
  resetResults();
}

function updateResults(result) {
  scoreValue.textContent = result.total.toFixed(1);
  messageValue.textContent = result.message;
  closureValue.textContent = result.closure.toFixed(1);
  ratioValue.textContent = result.ratio.toFixed(1);
  straightnessValue.textContent = result.straightness.toFixed(1);
  cornersValue.textContent = result.corners.toFixed(1);
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * BASE_CANVAS_SIZE,
    y: ((event.clientY - rect.top) / rect.height) * BASE_CANVAS_SIZE,
  };
}

function beginStroke(event) {
  event.preventDefault();
  clearDrawing();
  drawing = true;
  points.push(getCanvasPoint(event));
  redrawStroke();
}

function extendStroke(event) {
  if (!drawing) {
    return;
  }

  event.preventDefault();
  points.push(getCanvasPoint(event));
  redrawStroke();
}

function endStroke() {
  drawing = false;
}

evaluateButton.addEventListener("click", () => {
  updateResults(evaluateSquare(points));
});

clearButton.addEventListener("click", clearDrawing);
canvas.addEventListener("pointerdown", beginStroke);
canvas.addEventListener("pointermove", extendStroke);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointerleave", endStroke);
canvas.addEventListener("pointercancel", endStroke);
window.addEventListener("resize", setCanvasScale);

resetResults();
setCanvasScale();
