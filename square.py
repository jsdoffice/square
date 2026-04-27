import math
import tkinter as tk
from tkinter import ttk


CANVAS_SIZE = 640
MIN_POINTS = 12


def clamp(value, low=0.0, high=100.0):
    return max(low, min(high, value))


def distance(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def path_length(points):
    return sum(distance(points[i], points[i + 1]) for i in range(len(points) - 1))


def centroid(points):
    x = sum(p[0] for p in points) / len(points)
    y = sum(p[1] for p in points) / len(points)
    return x, y


def principal_angle(points):
    cx, cy = centroid(points)
    sxx = syy = sxy = 0.0
    for x, y in points:
        dx = x - cx
        dy = y - cy
        sxx += dx * dx
        syy += dy * dy
        sxy += dx * dy
    return 0.5 * math.atan2(2 * sxy, sxx - syy)


def rotate_points(points, angle, origin):
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    ox, oy = origin
    rotated = []
    for x, y in points:
        dx = x - ox
        dy = y - oy
        rotated.append((dx * cos_a - dy * sin_a, dx * sin_a + dy * cos_a))
    return rotated


def simplify_points(points, min_step=8.0):
    if not points:
        return []

    simplified = [points[0]]
    for point in points[1:]:
        if distance(point, simplified[-1]) >= min_step:
            simplified.append(point)

    if len(simplified) == 1 or simplified[-1] != points[-1]:
        simplified.append(points[-1])

    return simplified


def turning_angles(points):
    angles = []
    for i in range(1, len(points) - 1):
        ax = points[i][0] - points[i - 1][0]
        ay = points[i][1] - points[i - 1][1]
        bx = points[i + 1][0] - points[i][0]
        by = points[i + 1][1] - points[i][1]
        len_a = math.hypot(ax, ay)
        len_b = math.hypot(bx, by)
        if len_a < 1e-6 or len_b < 1e-6:
            continue
        dot = max(-1.0, min(1.0, (ax * bx + ay * by) / (len_a * len_b)))
        angles.append(math.degrees(math.acos(dot)))
    return angles


def evaluate_square(points):
    simplified_points = simplify_points(points)

    if len(simplified_points) < MIN_POINTS:
        return {
            "total": 0.0,
            "closure": 0.0,
            "ratio": 0.0,
            "straightness": 0.0,
            "corners": 0.0,
            "message": "Draw a longer stroke so I can evaluate it.",
        }

    total_length = path_length(simplified_points)
    if total_length < 40:
        return {
            "total": 0.0,
            "closure": 0.0,
            "ratio": 0.0,
            "straightness": 0.0,
            "corners": 0.0,
            "message": "The shape is too small. Draw a bigger square.",
        }

    cx, cy = centroid(simplified_points)
    angle = principal_angle(simplified_points)
    rotated = rotate_points(simplified_points, -angle, (cx, cy))

    xs = [p[0] for p in rotated]
    ys = [p[1] for p in rotated]
    width = max(xs) - min(xs)
    height = max(ys) - min(ys)
    size = max(width, height, 1.0)

    end_gap = distance(simplified_points[0], simplified_points[-1])
    closure = clamp(100 - (end_gap / size) * 180)

    ratio_error = abs(width - height) / size
    ratio = clamp(100 - ratio_error * 220)

    straightness_values = []
    for i in range(len(rotated) - 1):
        dx = rotated[i + 1][0] - rotated[i][0]
        dy = rotated[i + 1][1] - rotated[i][1]
        segment_len = math.hypot(dx, dy)
        if segment_len < 1e-6:
            continue

        horizontal_score = abs(dx) / segment_len
        vertical_score = abs(dy) / segment_len
        straightness_values.append(max(horizontal_score, vertical_score))

    straightness = clamp((sum(straightness_values) / max(len(straightness_values), 1)) * 100)

    angle_changes = turning_angles(simplified_points)
    corner_like = [a for a in angle_changes if 55 <= a <= 125]
    if angle_changes:
        corner_quality = 100 - min(abs(len(corner_like) - 4) * 18, 100)
        if corner_like:
            right_angle_error = sum(abs(a - 90) for a in corner_like[:4]) / len(corner_like[:4])
            corner_quality -= right_angle_error * 0.8
        corners = clamp(corner_quality)
    else:
        corners = 0.0

    total = clamp(closure * 0.25 + ratio * 0.25 + straightness * 0.25 + corners * 0.25)

    if total >= 90:
        message = "Excellent square."
    elif total >= 75:
        message = "Very good. The shape is close to a square."
    elif total >= 55:
        message = "Pretty good. Try closing the shape and keeping edges straighter."
    else:
        message = "Needs improvement. Focus on four clear corners and equal sides."

    return {
        "total": total,
        "closure": closure,
        "ratio": ratio,
        "straightness": straightness,
        "corners": corners,
        "message": message,
    }


class SquareApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Square Drawing Evaluator")
        self.points = []
        self.stroke_ids = []

        self.score_var = tk.StringVar(value="Score: -")
        self.detail_var = tk.StringVar(value="Draw a square with one stroke, then click Evaluate.")
        self.metrics_var = tk.StringVar(value="")

        self._build_ui()

    def _build_ui(self):
        frame = ttk.Frame(self.root, padding=16)
        frame.pack(fill="both", expand=True)

        title = ttk.Label(frame, text="Draw the Best Square You Can", font=("Helvetica", 20, "bold"))
        title.pack(anchor="w")

        subtitle = ttk.Label(
            frame,
            text="The program scores closure, shape ratio, edge straightness, and corner quality.",
        )
        subtitle.pack(anchor="w", pady=(4, 12))

        self.canvas = tk.Canvas(
            frame,
            width=CANVAS_SIZE,
            height=CANVAS_SIZE,
            bg="white",
            highlightthickness=1,
            highlightbackground="#999999",
        )
        self.canvas.pack()
        self.canvas.bind("<Button-1>", self.start_draw)
        self.canvas.bind("<B1-Motion>", self.draw)
        self.canvas.bind("<ButtonRelease-1>", self.stop_draw)

        button_row = ttk.Frame(frame)
        button_row.pack(fill="x", pady=(12, 0))

        ttk.Button(button_row, text="Evaluate", command=self.evaluate).pack(side="left")
        ttk.Button(button_row, text="Clear", command=self.clear).pack(side="left", padx=(8, 0))

        ttk.Label(frame, textvariable=self.score_var, font=("Helvetica", 16, "bold")).pack(anchor="w", pady=(12, 0))
        ttk.Label(frame, textvariable=self.detail_var, wraplength=620).pack(anchor="w", pady=(4, 0))
        ttk.Label(frame, textvariable=self.metrics_var, wraplength=620, foreground="#444444").pack(
            anchor="w", pady=(6, 0)
        )

    def start_draw(self, event):
        self.clear()
        self.points = [(event.x, event.y)]

    def draw(self, event):
        if not self.points:
            self.points = [(event.x, event.y)]
            return

        last_x, last_y = self.points[-1]
        self.points.append((event.x, event.y))
        stroke_id = self.canvas.create_line(last_x, last_y, event.x, event.y, fill="#111111", width=3)
        self.stroke_ids.append(stroke_id)

    def stop_draw(self, _event):
        pass

    def evaluate(self):
        result = evaluate_square(self.points)
        self.score_var.set(f"Score: {result['total']:.1f} / 100")
        self.detail_var.set(result["message"])
        self.metrics_var.set(
            "Closure: {closure:.1f}   Ratio: {ratio:.1f}   Straightness: {straightness:.1f}   Corners: {corners:.1f}".format(
                **result
            )
        )

    def clear(self):
        for stroke_id in self.stroke_ids:
            self.canvas.delete(stroke_id)
        self.stroke_ids.clear()
        self.points = []
        self.score_var.set("Score: -")
        self.detail_var.set("Draw a square with one stroke, then click Evaluate.")
        self.metrics_var.set("")


def main():
    root = tk.Tk()
    SquareApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
