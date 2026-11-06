import re
import sys
import json
import cv2
import pytesseract
from pathlib import Path

# Calibrated to the 1080x2400 SportyBet screenshot.
CROP = (20, 465, 1060, 750)

def analyze_screenshot(image_path):
    image = cv2.imread(image_path)

    if image is None:
        raise ValueError(f"Cannot open image: {image_path}")

    x1, y1, x2, y2 = CROP
    crop = image[y1:y2, x1:x2]

    data = pytesseract.image_to_data(
        crop,
        config="--psm 11",
        output_type=pytesseract.Output.DICT
    )

    detections = []

    for i, raw in enumerate(data["text"]):
        raw = raw.strip()

        if not raw or not re.search(r"\d", raw):
            continue

        confidence = float(data["conf"][i])
        x = data["left"][i] + x1
        y = data["top"][i] + y1
        width = data["width"][i]
        height = data["height"][i]

        match = re.fullmatch(
            r"(\d{1,4}[.,]\d{1,2})\s*[xX×]",
            raw
        )

        value = None
        status = "review"

        if match:
            value = float(match.group(1).replace(",", "."))

            if 1 <= value <= 100000 and confidence >= 55:
                status = "confirmed"

        detections.append({
            "raw": raw,
            "multiplier": round(value, 2) if value is not None else None,
            "confidence": round(confidence, 1),
            "x": x,
            "y": y,
            "width": width,
            "height": height,
            "status": status
        })

    # Group detections into horizontal rows.
    detections.sort(key=lambda item: item["y"])
    rows = []

    for item in detections:
        if not rows or abs(item["y"] - rows[-1]["center"]) > 25:
            rows.append({
                "center": item["y"],
                "items": [item]
            })
        else:
            rows[-1]["items"].append(item)
            rows[-1]["center"] = sum(
                entry["y"] for entry in rows[-1]["items"]
            ) / len(rows[-1]["items"])

    for row in rows:
        row["items"].sort(key=lambda item: item["x"])

    result = {
        "image": str(image_path),
        "grid": {
            "crop": list(CROP),
            "rows_detected": len(rows)
        },
        "rounds": [
            {
                "row": row_number,
                "column": column_number,
                **item
            }
            for row_number, row in enumerate(rows, 1)
            for column_number, item in enumerate(row["items"], 1)
        ]
    }

    return result


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python engine/aviator_ocr.py screenshot.jpg")
        sys.exit(1)

    try:
        result = analyze_screenshot(sys.argv[1])

        output = Path("engine/latest_history.json")
        output.write_text(json.dumps(result, indent=2))

        confirmed = [
            item for item in result["rounds"]
            if item["status"] == "confirmed"
        ]

        print("Rows detected:", result["grid"]["rows_detected"])
        print("Total detections:", len(result["rounds"]))
        print("Confirmed readings:", len(confirmed))
        print("Needs review:", len(result["rounds"]) - len(confirmed))
        print("\nDetected history:")

        for item in result["rounds"]:
            print(
                f"Row {item['row']} | Column {item['column']} | "
                f"{item['raw']} | Confidence: {item['confidence']} | "
                f"{item['status']}"
            )

        print("\nJSON saved:", output)

    except Exception as error:
        print("Analysis error:", error)
        sys.exit(1)
