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
const profileValue = document.getElementById("profileValue");
const cornerAngles = document.getElementById("cornerAngles");
const evaluateButton = document.getElementById("evaluateButton");
const clearButton = document.getElementById("clearButton");

let points = [];
let drawing = false;
let lastEvaluation = null;

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

function closePointsIfNeeded(inputPoints) {
  if (inputPoints.length < 2) {
    return inputPoints;
  }

  const first = inputPoints[0];
  const last = inputPoints[inputPoints.length - 1];
  if (distance(first, last) < 12) {
    return inputPoints;
  }

  return [...inputPoints, first];
}

function findFourCorners(inputPoints) {
  const closedPoints = closePointsIfNeeded(inputPoints);
  const pointCount = closedPoints.length - 1;
  if (pointCount < 8) {
    return [];
  }

  const window = Math.max(2, Math.floor(pointCount / 24));
  const candidates = [];

  for (let i = 0; i < pointCount; i += 1) {
    const prev = closedPoints[(i - window + pointCount) % pointCount];
    const current = closedPoints[i];
    const next = closedPoints[(i + window) % pointCount];

    const ax = current.x - prev.x;
    const ay = current.y - prev.y;
    const bx = next.x - current.x;
    const by = next.y - current.y;

    const lenA = Math.hypot(ax, ay);
    const lenB = Math.hypot(bx, by);
    if (lenA < 1e-6 || lenB < 1e-6) {
      continue;
    }

    const dot = clamp((ax * bx + ay * by) / (lenA * lenB), -1, 1);
    const angle = (Math.acos(dot) * 180) / Math.PI;
    if (angle < 35 || angle > 145) {
      continue;
    }

    const angleScore = clamp(100 - Math.abs(angle - 90) * 2.4);
    const sharpnessScore = clamp((angle / 120) * 100);
    candidates.push({
      index: i,
      angle,
      point: current,
      quality: angleScore * 0.75 + sharpnessScore * 0.25,
    });
  }

  candidates.sort((a, b) => b.quality - a.quality);

  const selected = [];
  const minSeparation = Math.max(6, Math.floor(pointCount / 8));
  for (const candidate of candidates) {
    const tooClose = selected.some((existing) => {
      const directDistance = Math.abs(existing.index - candidate.index);
      const wrappedDistance = pointCount - directDistance;
      return Math.min(directDistance, wrappedDistance) < minSeparation;
    });
    if (tooClose) {
      continue;
    }
    selected.push(candidate);
    if (selected.length === 4) {
      break;
    }
  }

  selected.sort((a, b) => a.index - b.index);
  return selected;
}

function averageSquareBoundaryDistance(rotatedPoints, size) {
  const half = size / 2;
  let totalDistance = 0;

  for (const point of rotatedPoints) {
    const distanceToVerticalSide = Math.abs(Math.abs(point.x) - half);
    const distanceToHorizontalSide = Math.abs(Math.abs(point.y) - half);
    totalDistance += Math.min(distanceToVerticalSide, distanceToHorizontalSide);
  }

  return totalDistance / Math.max(rotatedPoints.length, 1);
}

function radialProfileScore(inputPoints, center) {
  const radii = inputPoints.map((point) => distance(point, center));
  const meanRadius = radii.reduce((sum, value) => sum + value, 0) / Math.max(radii.length, 1);
  if (meanRadius < 1e-6) {
    return 0;
  }

  const variance =
    radii.reduce((sum, value) => sum + (value - meanRadius) ** 2, 0) / Math.max(radii.length, 1);
  const normalizedSpread = Math.sqrt(variance) / meanRadius;
  return clamp(normalizedSpread * 900);
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
      profile: 0,
      cornerCount: 0,
      rightAngles: 0,
      foundCorners: [],
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
      profile: 0,
      cornerCount: 0,
      rightAngles: 0,
      foundCorners: [],
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

  const averageBoundaryDistance = averageSquareBoundaryDistance(rotated, size);
  const straightness = clamp(100 - (averageBoundaryDistance / size) * 420);
  const profile = radialProfileScore(simplifiedPoints, center);
  const foundCorners = findFourCorners(simplifiedPoints);
  const cornerCount = clamp(100 - Math.abs(foundCorners.length - 4) * 30);
  const rightAngles =
    foundCorners.length > 0
      ? foundCorners.reduce((sum, corner) => sum + clamp(100 - Math.abs(corner.angle - 90) * 2.4), 0) /
        foundCorners.length
      : 0;
  const corners = clamp(cornerCount * 0.45 + rightAngles * 0.55);

  const gatedRatio = ratio * (0.2 + 0.8 * (cornerCount / 100));
  const gatedStraightness = straightness * (0.35 + 0.65 * (corners / 100));
  const weightedScore =
    closure * 0.08 +
    gatedRatio * 0.12 +
    gatedStraightness * 0.12 +
    profile * 0.16 +
    cornerCount * 0.24 +
    rightAngles * 0.28;
  const squareEvidence = Math.sqrt((cornerCount / 100) * (rightAngles / 100));
  const total = clamp(weightedScore * (0.5 + 0.5 * squareEvidence));

  let message = "Needs improvement. Focus on four clear corners and equal sides.";
  if (total >= 90) {
    message = "Excellent square.";
  } else if (total >= 75) {
    message = "Very good. The four corners are working well.";
  } else if (total >= 55) {
    message = `Pretty good. I found ${foundCorners.length} strong corners. Aim for 4 corners near 90 degrees.`;
  } else if (foundCorners.length < 4) {
    message = `I found only ${foundCorners.length} strong corners. A square needs 4 clear corners.`;
  } else {
    message = "The corners are there, but they need to be closer to 90 degrees.";
  }

  return {
    total,
    closure,
    ratio,
    straightness,
    corners,
    profile,
    cornerCount,
    rightAngles,
    foundCorners,
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

  if (lastEvaluation?.foundCorners?.length) {
    drawCornerGuide(lastEvaluation.foundCorners);
    drawCornerMarkers(lastEvaluation.foundCorners);
  }
}

function drawCornerGuide(foundCorners) {
  if (foundCorners.length < 2) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(213, 107, 45, 0.9)";
  ctx.moveTo(foundCorners[0].point.x, foundCorners[0].point.y);
  for (let i = 1; i < foundCorners.length; i += 1) {
    ctx.lineTo(foundCorners[i].point.x, foundCorners[i].point.y);
  }
  if (foundCorners.length === 4) {
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

function drawCornerMarkers(foundCorners) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 16px Avenir Next";

  foundCorners.forEach((corner, index) => {
    const markerX = corner.point.x;
    const markerY = corner.point.y;
    const labelY = markerY - 24;

    ctx.beginPath();
    ctx.fillStyle = "#d56b2d";
    ctx.arc(markerX, markerY, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff7ec";
    ctx.arc(markerX, markerY, 13, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(index + 1), markerX, markerY + 0.5);

    const angleLabel = `${corner.angle.toFixed(1)}°`;
    const labelWidth = Math.max(48, angleLabel.length * 9 + 16);
    const labelX = markerX;
    const boxX = labelX - labelWidth / 2;
    const boxY = labelY - 14;

    ctx.fillStyle = "rgba(255, 253, 248, 0.96)";
    roundRect(boxX, boxY, labelWidth, 24, 10);
    ctx.fill();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(213, 107, 45, 0.45)";
    roundRect(boxX, boxY, labelWidth, 24, 10);
    ctx.stroke();

    ctx.fillStyle = "#8f4319";
    ctx.font = "600 13px Avenir Next";
    ctx.fillText(angleLabel, labelX, labelY - 1);
    ctx.font = "bold 16px Avenir Next";
  });

  ctx.restore();
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function renderCornerAngles(foundCorners = []) {
  const rows = [];
  for (let i = 0; i < 4; i += 1) {
    const corner = foundCorners[i];
    const angleText = corner ? `${corner.angle.toFixed(1)}°` : "-";
    rows.push(`
      <div class="corner-angle-row">
        <span>Corner ${i + 1}</span>
        <strong>${angleText}</strong>
      </div>
    `);
  }
  cornerAngles.innerHTML = rows.join("");
}

function resetResults() {
  scoreValue.textContent = "-";
  messageValue.textContent = "Draw a square with one stroke, then press Evaluate.";
  closureValue.textContent = "-";
  ratioValue.textContent = "-";
  straightnessValue.textContent = "-";
  cornersValue.textContent = "-";
  profileValue.textContent = "-";
  renderCornerAngles();
}

function clearDrawing() {
  points = [];
  drawing = false;
  lastEvaluation = null;
  clearCanvas();
  resetResults();
}

function updateResults(result) {
  lastEvaluation = result;
  scoreValue.textContent = result.total.toFixed(1);
  messageValue.textContent = result.message;
  closureValue.textContent = result.closure.toFixed(1);
  ratioValue.textContent = result.ratio.toFixed(1);
  straightnessValue.textContent = result.straightness.toFixed(1);
  cornersValue.textContent = result.corners.toFixed(1);
  profileValue.textContent = result.profile.toFixed(1);
  renderCornerAngles(result.foundCorners);
  redrawStroke();
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
